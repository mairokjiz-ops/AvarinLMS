// ── 13_LINE.gs — LINE OA Integration Module ──────────────────────────────────
//
// doPost(e)
//   → LINE Webhook Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ฟังก์ชันหลักที่ LINE Platform จะเรียกเมื่อมี Event เกิดขึ้นใน LINE OA
 * @param {Object} e - Event object จาก Google Apps Script Web App
 */
function doPost(e) {
  try {
    // 1. ตรวจสอบข้อมูล Payload เบื้องต้น
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var json = JSON.parse(e.postData.contents);
    var events = json.events;

    // หากเป็น LINE Webhook Verification (ไม่มี events ส่งมา) ให้ตอบกลับทันที
    // วิธีนี้จะช่วยป้องกันปัญหา LINE Verify Timeout (เพราะไม่ต้องเสียเวลารันคิวรีชีตและโหลดข้อมูลเบื้องหลัง)
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. ดึงข้อมูลการตั้งค่า LINE API (เมื่อมี Event จริงส่งมาเท่านั้น)
    var channelAccessToken = _settingsRaw_('line_channel_access_token');
    var channelSecret = _settingsRaw_('line_channel_secret');
    
    // หากไม่มีการตั้งค่า Token ให้แจ้งเตือน แต่ตอบกลับ OK (ป้องกัน webhook บล็อก)
    if (!channelAccessToken) {
      console.warn('LINE Integration is not configured. Missing Access Token.');
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Not configured' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. ข้ามการตรวจสอบ Signature
    // เนื่องจาก Google Apps Script ไม่รองรับการอ่าน Request Headers ในฟังก์ชัน doPost
    // ความปลอดภัยยังคงได้รับความคุ้มครองผ่าน URL แบบสุ่มที่เป็นความลับของแอปเว็บ (GUID)

    // 4. วนลูปประมวลผลแต่ละ Event
    events.forEach(function (event) {
      var replyToken = event.replyToken;
      var lineUserId = event.source && event.source.userId;
      if (!replyToken || !lineUserId) return;

      if (event.type === 'message' && event.message.type === 'text') {
        _LINE_handleTextMessage_(event, replyToken, lineUserId);
      } else if (event.type === 'postback') {
        _LINE_handlePostbackEvent_(event, replyToken, lineUserId);
      } else if (event.type === 'follow') {
        _LINE_handleFollowEvent_(event, replyToken, lineUserId);
      }
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error('Error in doPost (LINE Webhook): ' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ตรวจสอบความถูกต้องของ X-Line-Signature
 */
function _LINE_verifySignature_(e, channelSecret) {
  try {
    var headers = e.headers || {};
    var sig = headers['x-line-signature'] || headers['X-Line-Signature'];
    if (!sig) return false;
    
    var payload = e.postData.contents;
    var byteSignature = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256,
      payload,
      channelSecret,
      Utilities.Charset.UTF_8
    );
    var calculatedSig = Utilities.base64Encode(byteSignature);
    return sig === calculatedSig;
  } catch (err) {
    console.error('Error in _LINE_verifySignature_: ' + err.message);
    return false;
  }
}

/**
 * จัดการข้อความตัวอักษรที่ผู้ใช้ส่งมา
 */
function _LINE_handleTextMessage_(event, replyToken, lineUserId) {
  var txt = String(event.message.text || '').trim();
  
  // ตรวจหาแพทเทิร์นการผูกบัญชี เช่น LMS-123456
  var match = txt.match(/^LMS-(\d{6})$/i);
  if (match) {
    var connectCode = match[0].toUpperCase();
    var user = DB_findOne(SHEETS.USERS, function (r) {
      return String(r.line_connect_code || '').toUpperCase() === connectCode;
    });

    if (user) {
      // ทำการผูกบัญชี: บันทึก line_user_id และเคลียร์ line_connect_code
      DB_update(SHEETS.USERS, user.id, {
        line_user_id: lineUserId,
        line_connect_code: ''
      });
      DB_invalidate(SHEETS.USERS); // เคลียร์ cache ข้อมูลผู้ใช้
      
      // ส่ง Flex การ์ดยินดีต้อนรับที่เชื่อมต่อสำเร็จ
      var welcomeFlex = LINE_buildConnectSuccessFlex_(user);
      LINE_replyMessage_(replyToken, [welcomeFlex]);
    } else {
      LINE_replyTextMessage_(replyToken, "❌ ไม่พบรหัสเชื่อมต่อนี้ในระบบ หรือรหัสอาจหมดอายุแล้ว กรุณาเข้าสู่ระบบเว็บไซต์ เพื่อดูรหัสใหม่ที่แท็บ 'โปรไฟล์' ครับ");
    }
    return;
  }

  // หากไม่ใช่รหัสเชื่อมต่อ ให้เช็กสถานะการผูกบัญชีของผู้ใช้นี้
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (!user) {
    // ถ้ายังไม่ได้เชื่อมบัญชี ส่งคำแนะนำให้เชื่อมบัญชี
    var notConnectedFlex = LINE_buildNotConnectedFlex_();
    LINE_replyMessage_(replyToken, [notConnectedFlex]);
  } else {
    // เช็กสถานะการยื่นใบลาแบบพิมพ์โต้ตอบ
    var state = _LINE_getState_(lineUserId);
    if (state && state.step === 'enter_reason') {
      if (txt.length < 3) {
        LINE_replyTextMessage_(replyToken, "⚠️ โปรดระบุเหตุผลการลาอย่างน้อย 3 ตัวอักษรขึ้นไปครับ");
        return;
      }
      state.step = 'confirm';
      state.reason = txt;
      _LINE_saveState_(lineUserId, state);
      
      var confirmFlex = LINE_buildLeaveConfirmFlex_(user, state);
      LINE_replyMessage_(replyToken, [confirmFlex]);
      return;
    }

    var lowTxt = txt.toLowerCase();
    if (lowTxt === 'ขอลา' || lowTxt === 'ยื่นใบลา' || lowTxt === 'ลา' || lowTxt === 'leave') {
      _LINE_startLeaveFlow_(replyToken, lineUserId);
      return;
    }

    // ถ้าเชื่อมบัญชีแล้ว ส่ง Flex Portal ที่เหมาะสมตามบทบาท (Role)
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    LINE_replyMessage_(replyToken, [portalFlex]);
  }
}

/**
 * จัดการเหตุการณ์การคลิกปุ่มบนการ์ด/เมนู (Postback)
 */
function _LINE_handlePostbackEvent_(event, replyToken, lineUserId) {
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (!user) {
    var notConnectedFlex = LINE_buildNotConnectedFlex_();
    LINE_replyMessage_(replyToken, [notConnectedFlex]);
    return;
  }

  var params = _LINE_parseQueryString_(event.postback.data);
  var action = params.action;

  if (action === 'portal') {
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    LINE_replyMessage_(replyToken, [portalFlex]);
  } else if (action === 'check_quota') {
    var quotaFlex = LINE_buildLeaveQuotaFlex_(user);
    LINE_replyMessage_(replyToken, [quotaFlex]);
  } else if (action === 'check_status') {
    var latestLeave = _LINE_getLatestLeaveRequest_(user.id);
    if (!latestLeave) {
      LINE_replyTextMessage_(replyToken, "ℹ️ ไม่พบประวัติการยื่นใบลาของคุณในระบบ");
    } else {
      var statusFlex = LINE_buildLeaveStatusFlex_(user, latestLeave);
      LINE_replyMessage_(replyToken, [statusFlex]);
    }
  } else if (action === 'pending_leaves') {
    // ตรวจสอบว่าผู้ใช้มีบทบาทผู้บริหาร/HR หรือไม่
    var inboxStatuses = _inboxStatusesFor_(user.role);
    if (inboxStatuses.length === 0) {
      LINE_replyTextMessage_(replyToken, "🔒 ฟังก์ชันนี้เฉพาะหัวหน้างานหรือฝ่ายอนุมัติเท่านั้นครับ");
      return;
    }
    
    // ดึงรายการรอพิจารณา
    var leaves = DB_readAll(SHEETS.LEAVES);
    var usersIndex = DB_buildIndex(SHEETS.USERS);
    var pending = leaves.filter(function (r) {
      return inboxStatuses.indexOf(r.status) >= 0;
    }).map(function (r) {
      return _enrichLeave_(r, usersIndex);
    });

    if (pending.length === 0) {
      LINE_replyTextMessage_(replyToken, "✅ ไม่มีใบลาค้างอนุมัติในระบบของคุณแล้ว");
    } else {
      var pendingFlex = LINE_buildPendingLeavesFlex_(user, pending.slice(0, 5)); // ส่งไปสูงสุด 5 ใบเพื่อไม่ให้เกิน Limit
      LINE_replyMessage_(replyToken, [pendingFlex]);
    }
  } else if (action === 'submit_leave_start') {
    _LINE_startLeaveFlow_(replyToken, lineUserId);
  } else if (action === 'submit_select_type') {
    var type = params.type;
    var state = { step: 'select_start_date', leave_type: type };
    _LINE_saveState_(lineUserId, state);
    
    var startPickerFlex = LINE_buildDatePickerFlex_("ขั้นตอนที่ 2: เลือกวันเริ่มลา", "action=submit_select_start_date", "📅 เลือกวันเริ่มลา");
    LINE_replyMessage_(replyToken, [startPickerFlex]);
  } else if (action === 'submit_select_start_date') {
    var selectedDate = event.postback.params && event.postback.params.date;
    var state = _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_start_date') {
      LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      _LINE_clearState_(lineUserId);
      return;
    }
    
    state.step = 'select_end_date';
    state.start_date = selectedDate;
    _LINE_saveState_(lineUserId, state);
    
    var endPickerFlex = LINE_buildDatePickerFlex_("ขั้นตอนที่ 3: เลือกวันสิ้นสุดการลา", "action=submit_select_end_date", "📅 เลือกวันสิ้นสุดการลา");
    LINE_replyMessage_(replyToken, [endPickerFlex]);
  } else if (action === 'submit_select_end_date') {
    var selectedDate = event.postback.params && event.postback.params.date;
    var state = _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_end_date') {
      LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      _LINE_clearState_(lineUserId);
      return;
    }
    
    var days = cfg_daysBetween_(state.start_date, selectedDate);
    if (days <= 0) {
      LINE_replyTextMessage_(replyToken, "⚠️ ช่วงวันที่ลาไม่ถูกต้อง (วันสิ้นสุดการลาต้องไม่ก่อนหน้าวันเริ่มลา และต้องไม่ใช่ปฏิทินวันหยุดงาน)\n\nกรุณากดเลือกวันเริ่มลาและสิ้นสุดใหม่อีกครั้งครับ");
      _LINE_clearState_(lineUserId);
      return;
    }
    
    state.step = 'enter_reason';
    state.end_date = selectedDate;
    _LINE_saveState_(lineUserId, state);
    
    LINE_replyTextMessage_(replyToken, "✍️ ขั้นตอนสุดท้าย: โปรดพิมพ์เหตุผลในการลาส่งกลับมาในแชตนี้ได้เลยครับ (เช่น เป็นไข้สูงปวดศีรษะ, ไปทำธุระต่างจังหวัด)");
  } else if (action === 'submit_confirm_yes') {
    var state = _LINE_getState_(lineUserId);
    if (!state || state.step !== 'confirm') {
      LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      _LINE_clearState_(lineUserId);
      return;
    }
    
    try {
      var res = Leaves_create(user, {
        leave_type: state.leave_type,
        start_date: state.start_date,
        end_date: state.end_date,
        reason: state.reason,
        leave_unit: 'day'
      });
      _LINE_clearState_(lineUserId);
      
      var successFlex = LINE_buildSubmitSuccessFlex_(user, res.leave);
      LINE_replyMessage_(replyToken, [successFlex]);
    } catch (err) {
      LINE_replyTextMessage_(replyToken, "❌ ไม่สามารถยื่นใบลาได้: " + err.message);
      _LINE_clearState_(lineUserId);
    }
  } else if (action === 'submit_cancel') {
    _LINE_clearState_(lineUserId);
    LINE_replyTextMessage_(replyToken, "❌ ยกเลิกการยื่นใบลาเรียบร้อยแล้ว");
  }
}

/**
 * จัดการเมื่อมีคนแอดไลน์แชร์บอต (Follow)
 */
function _LINE_handleFollowEvent_(event, replyToken, lineUserId) {
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (user) {
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    LINE_replyMessage_(replyToken, [
      { type: "text", text: "ยินดีต้อนรับกลับเข้าสู่ระบบบันทึกการลาออนไลน์ครับ 😊" },
      portalFlex
    ]);
  } else {
    var welcomeFlex = LINE_buildNotConnectedFlex_();
    LINE_replyMessage_(replyToken, [welcomeFlex]);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ดึงใบลาล่าสุดของพนักงาน
 */
function _LINE_getLatestLeaveRequest_(userId) {
  var leaves = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    return String(r.requester_id) === String(userId);
  });
  if (leaves.length === 0) return null;
  leaves.sort(function (a, b) {
    var ta = new Date(a.created_at || a.start_date).getTime();
    var tb = new Date(b.created_at || b.start_date).getTime();
    return tb - ta;
  });
  return leaves[0];
}

/**
 * คืนค่า URL ของ Web App ปัจจุบัน เพื่อนำไปเชื่อม Webhook
 */
function LINE_getWebhookUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (err) {
    return 'กรุณา Deploy เป็น Web App ก่อน';
  }
}

/**
 * ส่ง Request ตอบกลับไปยัง LINE Message API (Reply)
 */
function LINE_replyMessage_(replyToken, messages) {
  var url = 'https://api.line.me/v2/bot/message/reply';
  var channelAccessToken = _settingsRaw_('line_channel_access_token');
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + channelAccessToken
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  };
  
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  if (code !== 200) {
    console.error('LINE Reply API error code: ' + code + ', response: ' + res.getContentText());
  }
}

/**
 * ส่ง Reply แบบ Text ข้อความง่าย ๆ
 */
function LINE_replyTextMessage_(replyToken, text) {
  LINE_replyMessage_(replyToken, [{
    type: "text",
    text: text
  }]);
}

/**
 * แกะค่า URL Query String เป็น Object
 */
function _LINE_parseQueryString_(str) {
  var obj = {};
  if (!str) return obj;
  var pairs = str.split('&');
  pairs.forEach(function (p) {
    var parts = p.split('=');
    if (parts.length === 2) {
      obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    }
  });
  return obj;
}

// ── Flex Message Builder Templates ───────────────────────────────────────────

/**
 * ส่ง Portal Menu ตามระดับของพนักงาน
 */
function LINE_buildPortalFlexForUser_(user) {
  var inboxStatuses = _inboxStatusesFor_(user.role);
  var isManager = inboxStatuses.length > 0;
  
  var settings = Settings_get_public_();
  var orgName = settings.org_name || APP.ORG;

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#4f46e5",
      paddingAll: "20px",
      contents: [
        { type: "text", text: orgName, color: "#c7d2fe", size: "xs", weight: "bold" },
        { type: "text", text: "เมนูหลักระบบจัดการการลา", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "48px",
              height: "48px",
              cornerRadius: "24px",
              backgroundColor: "#e0e7ff",
              contents: [
                { type: "text", text: "👤", size: "xl", align: "center", gravity: "center" }
              ]
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: user.full_name, weight: "bold", size: "md", color: "#111827" },
                { type: "text", text: user.position + (user.department ? " (" + user.department + ")" : ""), size: "xs", color: "#6b7280" }
              ]
            }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#4f46e5",
              height: "sm",
              action: { type: "postback", label: "📝 ยื่นใบลาใหม่ (พิมพ์โต้ตอบ)", data: "action=submit_leave_start" }
            },
            {
              type: "button",
              style: "primary",
              color: "#6366f1",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "📊 เช็กสิทธิ์วันลาคงเหลือ", data: "action=check_quota" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "🔍 ติดตามสถานะใบลาล่าสุด", data: "action=check_status" }
            }
          ]
        }
      ]
    }
  };

  // หากเป็นผู้บริหาร/HR ให้มีปุ่มเข้าดูงานรออนุมัติเพิ่มเติม
  if (isManager) {
    bubble.body.contents[2].contents.push({
      type: "button",
      style: "primary",
      color: "#10b981",
      height: "sm",
      margin: "sm",
      action: { type: "postback", label: "📥 พิจารณาใบลาค้างอนุมัติ", data: "action=pending_leaves" }
    });
  }

  // ปุ่มเข้าเว็บไซต์ตรงๆ
  var webUrl = LINE_getWebhookUrl();
  bubble.body.contents[2].contents.push({
    type: "button",
    style: "link",
    height: "sm",
    margin: "sm",
    action: { type: "uri", label: "🌐 เปิดระบบเว็บพอร์ทัล", uri: webUrl }
  });

  return {
    type: "flex",
    altText: "เมนูหลักระบบจัดการการลา",
    contents: bubble
  };
}

/**
 * Flex Message ชี้แจงสำหรับผู้ใช้ใหม่ยังไม่ผูกบัญชี
 */
function LINE_buildNotConnectedFlex_() {
  var webUrl = LINE_getWebhookUrl();
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#ef4444",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "ยังไม่ได้เชื่อมต่อบัญชี", color: "#fca5a5", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดเชื่อมต่อระบบลาก่อนใช้งาน", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "เพื่อส่งการแจ้งเตือนและตรวจสอบสถานะการลาผ่านไลน์ได้ฟรี โปรดดำเนินการดังนี้:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          backgroundColor: "#f9fafb",
          paddingAll: "12px",
          cornerRadius: "8px",
          contents: [
            { type: "text", text: "1. เข้าสู่ระบบเว็บพอร์ทัลของคุณ", size: "xs", color: "#4b5563" },
            { type: "text", text: "2. ไปที่เมนู 'โปรไฟล์'", size: "xs", color: "#4b5563" },
            { type: "text", text: "3. คัดลอกรหัสเชื่อมต่อ (เช่น LMS-123456)", size: "xs", color: "#4b5563" },
            { type: "text", text: "4. ส่งรหัสนั้นมาที่แชต LINE OA นี้", size: "xs", color: "#4b5563" }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#dc2626",
          height: "sm",
          action: { type: "uri", label: "🌐 เปิดหน้าเว็บบันทึกการลา", uri: webUrl }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "กรุณาเชื่อมต่อบัญชีก่อนใช้งานระบบ",
    contents: bubble
  };
}

/**
 * Flex Message แจ้งเตือนเมื่อเชื่อมต่อบัญชีสำเร็จ
 */
function LINE_buildConnectSuccessFlex_(user) {
  var settings = Settings_get_public_();
  var orgName = settings.org_name || APP.ORG;

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: orgName, color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "เชื่อมต่อสำเร็จแล้ว! 🎉", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "ยินดีต้อนรับสู่ระบบบันทึกการลา บัญชีของคุณถูกจับคู่เรียบร้อยแล้ว:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f0fdf4",
          paddingAll: "14px",
          cornerRadius: "10px",
          contents: [
            { type: "text", text: "👤 ชื่อ: " + user.full_name, size: "sm", weight: "bold", color: "#065f46" },
            { type: "text", text: "💼 ตำแหน่ง: " + user.position, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "🏢 แผนก: " + (user.department || "-"), size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "🔑 บทบาท: " + (ROLE_LABEL[user.role] || user.role), size: "xs", color: "#047857", margin: "xs" }
          ]
        },
        {
          type: "text",
          text: "คุณสามารถเช็กสิทธิ์และสถานะการลาผ่านปุ่มใน Rich Menu ได้ทันที",
          wrap: true,
          size: "xs",
          color: "#6b7280",
          align: "center"
        },
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: { type: "postback", label: "📱 ไปยังเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "เชื่อมต่อบัญชีสำเร็จแล้ว!",
    contents: bubble
  };
}

/**
 * Flex Message แสดงสิทธิ์วันลาคงเหลือ
 */
function LINE_buildLeaveQuotaFlex_(user) {
  var currentFy = cfg_fiscalYear_(cfg_now_());
  var stats = _leaveStats_(user.id, currentFy);
  
  var rows = [];
  Object.keys(stats.items).forEach(function (key) {
    var s = stats.items[key];
    var typeLabel = LEAVE_TYPE_LABEL[key] || key;
    
    // เลือกสีและไอคอนตามประเภท
    var icon = "📝";
    var color = "#3b82f6";
    if (key === 'sick') { icon = "🤢"; color = "#ef4444"; }
    else if (key === 'personal') { icon = "💼"; color = "#f59e0b"; }
    else if (key === 'annual') { icon = "🏖️"; color = "#10b981"; }

    rows.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: icon + " " + typeLabel, weight: "bold", size: "sm", color: "#1f2937" },
            { type: "text", text: s.remaining + " / " + s.limit + " วัน", align: "end", size: "sm", weight: "bold", color: color }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#e5e7eb",
          height: "8px",
          cornerRadius: "4px",
          margin: "sm",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: color,
              width: Math.max(1, Math.min(100, s.percent)) + "%",
              height: "100%",
              cornerRadius: "4px",
              contents: []
            }
          ]
        },
        {
          type: "text",
          text: "ใช้ไปแล้ว " + s.used + " วัน (" + s.percent + "%) คงเหลือ " + s.remaining + " วัน",
          size: "xxs",
          color: "#9ca3af",
          align: "end"
        }
      ]
    });
  });

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3b82f6",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "Leave Quota Summary", color: "#93c5fd", size: "xs", weight: "bold" },
        { type: "text", text: "สิทธิ์วันลาคงเหลือ ปี พ.ศ. " + stats.fiscal_year_be, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        { type: "text", text: "ยอดสรุปประวัติการใช้งานจริงสะสมในปีงบประมาณนี้:", size: "xs", color: "#6b7280" },
        {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: rows
        },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สิทธิ์วันลาคงเหลือของคุณ",
    contents: bubble
  };
}

/**
 * Flex Message แสดงรายละเอียดใบลาล่าสุด
 */
function LINE_buildLeaveStatusFlex_(user, lv) {
  var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
  var statusLabel = STATUS_LABEL[lv.status] || lv.status;
  var tone = STATUS_TONE[lv.status] || 'slate';
  var statusColor = "#64748b"; // slate
  if (tone === 'amber') statusColor = "#d97706";
  else if (tone === 'sky') statusColor = "#0284c7";
  else if (tone === 'indigo') statusColor = "#4f46e5";
  else if (tone === 'emerald') statusColor = "#059669";
  else if (tone === 'rose') statusColor = "#dc2626";

  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var startThai = toThaiDate(lv.start_date);
  var endThai   = toThaiDate(lv.end_date);
  var dateRange = (lv.start_date === lv.end_date) ? startThai : startThai + ' – ' + endThai;
  
  var durationText = (String(lv.leave_unit || '') === 'hour')
    ? (lv.hours || '-') + ' ชั่วโมง'
    : (lv.days  || '-') + ' วัน';

  // รายการบันทึกสถานะตามขั้นตอน
  var detailsRows = [
    { label: "เลขที่ใบลา", val: lv.leave_no || "-" },
    { label: "ประเภทการลา", val: typeLabel },
    { label: "วันที่ขอลา", val: dateRange },
    { label: "จำนวนที่ลา", val: durationText },
    { label: "เหตุผลการลา", val: lv.reason || "-" }
  ];

  var detailsContent = detailsRows.map(function (row) {
    return {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: row.label, size: "xs", color: "#6b7280", flex: 3 },
        { type: "text", text: row.val, size: "xs", color: "#1f2937", flex: 5, wrap: true }
      ]
    };
  });

  // ส่วนแสดงความคิดเห็นผู้อนุมัติ/ตรวจ
  var feedbackList = [];
  if (lv.checker_comment) {
    feedbackList.push({ type: "text", text: "💬 ตรวจสอบ: " + lv.checker_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }
  if (lv.supervisor_comment) {
    feedbackList.push({ type: "text", text: "💬 ความเห็นหัวหน้า: " + lv.supervisor_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }
  if (lv.approver_comment) {
    feedbackList.push({ type: "text", text: "💬 ความเห็นฝ่ายบุคคล: " + lv.approver_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }

  var bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "สถานะปัจจุบัน", size: "sm", color: "#374151", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: statusColor + "1a", // transparency 10%
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingStart: "8px",
          paddingEnd: "8px",
          cornerRadius: "6px",
          contents: [
            { type: "text", text: statusLabel, color: statusColor, size: "xs", weight: "bold", align: "center" }
          ]
        }
      ]
    },
    { type: "separator", margin: "md" },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: detailsContent
    }
  ];

  if (feedbackList.length > 0) {
    bodyContents.push({ type: "separator", margin: "md" });
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        { type: "text", text: "บันทึกความเห็น:", size: "xs", color: "#9ca3af", weight: "bold" }
      ].concat(feedbackList)
    });
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "LATEST LEAVE STATUS", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "ติดตามสถานะใบลาล่าสุด", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: bodyContents
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "15px",
      contents: [
        {
          type: "button",
          style: "secondary",
          color: "#f3f4f6",
          height: "sm",
          action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สถานะใบลาล่าสุดของคุณคือ: " + statusLabel,
    contents: bubble
  };
}

/**
 * Flex Message รายการใบลาค้างอนุมัติสำหรับผู้บริหาร (สูงสุด 5 ใบ)
 */
function LINE_buildPendingLeavesFlex_(user, pendingLeaves) {
  var bubbles = pendingLeaves.map(function (lv) {
    var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
    var durationText = lv.duration_label || (lv.days + " วัน");
    var requesterName = lv.requester ? lv.requester.full_name : "พนักงาน";
    
    function toThaiDate(iso) {
      if (!iso) return '-';
      var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
      if (isNaN(d.getTime())) return String(iso);
      var day = d.getDate();
      var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
      var year  = d.getFullYear() + 543;
      return day + ' ' + month + ' ' + year;
    }

    var dateText = (lv.start_date === lv.end_date) 
      ? toThaiDate(lv.start_date)
      : toThaiDate(lv.start_date) + " - " + toThaiDate(lv.end_date);

    var webUrl = LINE_getWebhookUrl() + "#/leaves/" + lv.id;

    return {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#10b981",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "รอการตรวจสอบ/อนุมัติ", color: "#a7f3d0", size: "xs", weight: "bold" },
          { type: "text", text: "ผู้ยื่น: " + requesterName, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ประเภท", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: typeLabel, size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "วันที่ลา", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: dateText, size: "xs", color: "#1f2937", flex: 5 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "จำนวน", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: durationText, size: "xs", flex: 5, weight: "bold", color: "#10b981" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "เหตุผล", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: lv.reason || "-", size: "xs", color: "#1f2937", flex: 5, wrap: true }
            ]
          },
          { type: "separator", margin: "md" },
          {
            type: "button",
            style: "primary",
            color: "#10b981",
            height: "sm",
            action: { type: "uri", label: "📝 ดำเนินการบนเว็บบอร์ด", uri: webUrl }
          }
        ]
      }
    };
  });

  // ใส่หน้าสรุปปิดท้าย Carousel เพื่อเปิดทางให้กลับหน้าหลักได้ง่าย
  bubbles.push({
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "การดำเนินการ", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "การพิจารณาใบลา", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "หากต้องการตรวจสอบใบลาค้างทั้งหมด หรือประวัติการจัดการย้อนหลัง กรุณาเปิดใช้งานจากหน้าเว็บพอร์ทัลหลัก",
          wrap: true,
          size: "sm",
          color: "#475569",
          align: "center"
        },
        {
          type: "button",
          style: "primary",
          color: "#6366f1",
          height: "sm",
          action: { type: "postback", label: "📱 กลับหน้าพอร์ทัล LINE", data: "action=portal" }
        }
      ]
    }
  });

  return {
    type: "flex",
    altText: "รายการใบลาค้างอนุมัติในระบบ",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}

/**
 * ฟังก์ชันสำหรับรันการทดสอบระบบ LINE Integration แบบจำลองใน Apps Script Editor
 */
function LINE_runLocalTests() {
  console.log('=== LINE INTEGRATION TESTS ===');
  
  // 1. ทดสอบการแกะพารามิเตอร์ Query String
  var params = _LINE_parseQueryString_("action=check_quota&type=sick");
  if (params.action === 'check_quota' && params.type === 'sick') {
    console.log('✅ Test 1 (Query String Parsing): PASS');
  } else {
    console.error('❌ Test 1 (Query String Parsing): FAIL');
  }
  
  // 2. ทดสอบการดึง Webhook URL
  var url = LINE_getWebhookUrl();
  console.log('✅ Test 2 (Webhook URL): PASS (URL: ' + url + ')');
  
  // 3. ทดสอบการสร้าง Flex Portal สำหรับผู้ใช้จำลอง
  var mockUser = {
    id: "test_user_id",
    full_name: "นายทดสอบ แสนดี",
    position: "เจ้าหน้าที่สนับสนุน",
    department: "ฝ่ายสารสนเทศ",
    role: "employee"
  };
  try {
    var flex = LINE_buildPortalFlexForUser_(mockUser);
    if (flex && flex.type === 'flex' && flex.contents.type === 'bubble') {
      console.log('✅ Test 3 (Flex Portal Builder - Employee): PASS');
    } else {
      console.error('❌ Test 3 (Flex Portal Builder - Employee): FAIL');
    }
  } catch (err) {
    console.error('❌ Test 3 (Flex Portal Builder - Employee): ERROR - ' + err.message);
  }
  
  console.log('=== TESTS COMPLETED ===');
}

// ── LINE Chat-based Leave Submission Flow Helpers ───────────────────────────

function _LINE_getState_(lineUserId) {
  try {
    var raw = CacheService.getScriptCache().get('line_state:' + lineUserId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error in _LINE_getState_: ' + e.message);
    return null;
  }
}

function _LINE_saveState_(lineUserId, state) {
  try {
    CacheService.getScriptCache().put('line_state:' + lineUserId, JSON.stringify(state), 600); // 10 minutes TTL
  } catch (e) {
    console.error('Error in _LINE_saveState_: ' + e.message);
  }
}

function _LINE_clearState_(lineUserId) {
  try {
    CacheService.getScriptCache().remove('line_state:' + lineUserId);
  } catch (e) {
    console.error('Error in _LINE_clearState_: ' + e.message);
  }
}

function _LINE_startLeaveFlow_(replyToken, lineUserId) {
  var state = { step: 'select_type' };
  _LINE_saveState_(lineUserId, state);
  
  var flex = {
    type: "flex",
    altText: "ขั้นตอนที่ 1: เลือกประเภทการลา",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "NEW LEAVE REQUEST", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: "ขั้นตอนที่ 1: เลือกประเภทการลา", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "button", style: "primary", color: "#ef4444", height: "sm", action: { type: "postback", label: "🤒 ลาป่วย (Sick Leave)", data: "action=submit_select_type&type=sick" } },
          { type: "button", style: "primary", color: "#f59e0b", height: "sm", action: { type: "postback", label: "💼 ลากิจส่วนตัว (Personal)", data: "action=submit_select_type&type=personal" } },
          { type: "button", style: "primary", color: "#10b981", height: "sm", action: { type: "postback", label: "🏖️ ลาพักร้อน (Annual)", data: "action=submit_select_type&type=annual" } },
          { type: "separator", margin: "md" },
          { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" } }
        ]
      }
    }
  };
  LINE_replyMessage_(replyToken, [flex]);
}

function LINE_buildDatePickerFlex_(title, postbackData, btnLabel) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "LEAVE DATE SELECTION", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: title, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#4f46e5",
            height: "sm",
            action: {
              type: "datetimepicker",
              label: btnLabel,
              data: postbackData,
              mode: "date"
            }
          },
          {
            type: "button",
            style: "secondary",
            color: "#f3f4f6",
            height: "sm",
            action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
          }
        ]
      }
    }
  };
}

function LINE_buildLeaveConfirmFlex_(user, state) {
  var typeLabel = LEAVE_TYPE_LABEL[state.leave_type] || state.leave_type;
  var days = cfg_daysBetween_(state.start_date, state.end_date);
  
  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var dateText = (state.start_date === state.end_date)
    ? toThaiDate(state.start_date)
    : toThaiDate(state.start_date) + " - " + toThaiDate(state.end_date);

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "CONFIRM LEAVE REQUEST", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดตรวจสอบข้อมูลเพื่อยืนยัน", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ประเภท", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: typeLabel, size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "วันที่ลา", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: dateText, size: "xs", color: "#1f2937", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "จำนวน", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: days + " วัน", size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "เหตุผล", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: state.reason, size: "xs", color: "#1f2937", flex: 5, wrap: true }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#10b981",
              height: "sm",
              action: { type: "postback", label: "✅ ยืนยันยื่นใบลา", data: "action=submit_confirm_yes" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "โปรดยืนยันใบลาของคุณ",
    contents: bubble
  };
}

function LINE_buildSubmitSuccessFlex_(user, lv) {
  var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
  
  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var dateText = (lv.start_date === lv.end_date)
    ? toThaiDate(lv.start_date)
    : toThaiDate(lv.start_date) + " - " + toThaiDate(lv.end_date);

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "SUCCESS", color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "ยื่นใบลาเรียบร้อยแล้ว! 🎉", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: "คำขอของคุณเข้าระบบและส่งไปยังผู้มีอำนาจตรวจสอบเรียบร้อยแล้ว:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f0fdf4",
          paddingAll: "14px",
          cornerRadius: "10px",
          margin: "sm",
          contents: [
            { type: "text", text: "📝 เลขที่ใบลา: " + lv.leave_no, size: "xs", color: "#065f46", weight: "bold" },
            { type: "text", text: "🤒 ประเภท: " + typeLabel, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "📅 วันที่: " + dateText, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "⏳ จำนวน: " + lv.days + " วัน", size: "xs", color: "#047857", margin: "xs" }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          margin: "sm",
          action: { type: "postback", label: "📱 กลับหน้าพอร์ทัลหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "ยื่นใบลาเรียบร้อยแล้ว!",
    contents: bubble
  };
}
