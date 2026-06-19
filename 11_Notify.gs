// ── 11_Notify.gs — Email Notification Module ───────────────────────────────
//
// Notify_onLeaveSubmit_(lv, requester)
//   → ส่ง email แจ้งผู้บังคับบัญชา (supervisor) หรือผู้อนุมัติ (approver ถ้า stages=1)
//     เมื่อมีการยื่นใบลาใหม่
//
// Notify_onLeaveApproved_(lv, requester, approver)
//   → ส่ง email แจ้ง HR / ฝ่ายบุคคล (approver role) ทุกคน
//     เมื่อผู้บังคับบัญชาอนุมัติใบลาแล้ว
// ─────────────────────────────────────────────────────────────────────────────

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * ค้นหา active users ที่ role ตรงกับ roles[] และมี email
 * @param {string[]} roles
 * @returns {{id:string, full_name:string, email:string}[]}
 */
function _findUsersByRole_(roles) {
  return DB_readAll(SHEETS.USERS).filter(function (u) {
    if (!_yes_(u.is_active)) return false;
    if (roles.indexOf(u.role) < 0) return false;
    return String(u.email || '').trim().length > 0;
  }).map(function (u) {
    return { id: u.id, full_name: String(u.full_name || '').trim(), email: String(u.email || '').trim() };
  });
}

/**
 * สร้าง HTML body ของ email พร้อมข้อมูลใบลา
 * @param {Object} lv      — leave record (enriched หรือ raw ก็ได้)
 * @param {Object} requester — {full_name, position, department}
 * @param {string} heading  — หัวข้อส่วนแรกของเนื้อหา
 * @returns {string} HTML string
 */
function _buildLeaveEmailBody_(lv, requester, heading) {
  var settings = Settings_get_public_();
  var orgName  = settings.org_name || APP.ORG;

  var typeLabel   = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type || '-';
  var statusLabel = STATUS_LABEL[lv.status]         || lv.status     || '-';
  var leaveNo     = lv.leave_no || '-';

  // วันที่ — แสดง พ.ศ.
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

  // ระยะเวลาลา
  var durationText = (String(lv.leave_unit || '') === 'hour')
    ? (lv.hours || '-') + ' ชั่วโมง'
    : (lv.days  || '-') + ' วัน';

  var requesterName = String((requester && requester.full_name) || lv.requester_name || '-');
  var position      = String((requester && requester.position)  || lv.position      || '');
  var department    = String((requester && requester.department) || lv.department   || '');

  var rows = [
    ['เลขที่ใบลา',       cfg_esc_(leaveNo)],
    ['ผู้ยื่นใบลา',      cfg_esc_(requesterName + (position ? ' · ' + position : '') + (department ? ' (' + department + ')' : ''))],
    ['ประเภทการลา',      cfg_esc_(typeLabel)],
    ['วันที่ลา',         cfg_esc_(dateRange)],
    ['จำนวน',            cfg_esc_(durationText)],
    ['เหตุผล',           cfg_esc_(String(lv.reason || '-'))],
    ['สถานะปัจจุบัน',    cfg_esc_(statusLabel)]
  ];

  var tableRows = rows.map(function (r) {
    return '<tr>'
      + '<td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap;width:140px;vertical-align:top">' + r[0] + '</td>'
      + '<td style="padding:8px 12px;color:#1f2937;vertical-align:top">' + r[1] + '</td>'
      + '</tr>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:\'Sarabun\',\'Noto Sans Thai\',sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">'

    // Header
    + '<tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px">'
    + '<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:1px;text-transform:uppercase">' + cfg_esc_(orgName) + '</p>'
    + '<h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff">'
    + 'แจ้งเตือนใบลา</h1>'
    + '</td></tr>'

    // Body
    + '<tr><td style="padding:28px 32px">'
    + '<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">' + heading + '</p>'

    // Leave details table
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px">'
    + '<thead><tr style="background:#f9fafb"><td colspan="2" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase">รายละเอียดใบลา</td></tr></thead>'
    + '<tbody>' + tableRows + '</tbody>'
    + '</table>'

    + '<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">อีเมลนี้ส่งโดยระบบอัตโนมัติ — กรุณาอย่าตอบกลับ</p>'
    + '</td></tr>'

    // Footer
    + '<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">'
    + '<p style="margin:0;font-size:12px;color:#6b7280">© ' + new Date().getFullYear() + ' ' + cfg_esc_(orgName) + ' · ระบบบันทึกการลาออนไลน์</p>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * ส่ง email ไปยัง recipients หลายคน (ข้ามคนที่ไม่มี email)
 * @param {{full_name:string, email:string}[]} recipients
 * @param {string} subject
 * @param {string} htmlBody
 */
function _notifyRecipients_(recipients, subject, htmlBody) {
  if (!recipients || recipients.length === 0) return;
  var fromAlias = String(_settingsRaw_('email_from_alias') || '').trim();
  recipients.forEach(function (r) {
    var email = String(r.email || '').trim();
    if (!email) return;
    try {
      var options = { htmlBody: htmlBody, name: APP.NAME };
      if (fromAlias) {
        options.from = fromAlias;
      }
      GmailApp.sendEmail(email, subject, '', options);
    } catch (err) {
      if (fromAlias) {
        try {
          console.warn('Failed to send email as alias (' + fromAlias + '). Falling back to default account. Error: ' + err.message);
          GmailApp.sendEmail(email, subject, '', { htmlBody: htmlBody, name: APP.NAME });
        } catch (err2) {
          console.error('Notify email fallback failed to ' + email + ': ' + err2.message);
        }
      } else {
        console.error('Notify email failed to ' + email + ': ' + err.message);
      }
    }
  });
}

// ── Public Notification Functions ─────────────────────────────────────────

/**
 * แจ้งเตือนเมื่อมีใบลาใหม่ถูกยื่น (status = pending)
 * ส่งถึง: supervisor ทุกคน (ถ้า stages >= 2) หรือ approver ทุกคน (ถ้า stages = 1)
 *
 * @param {Object} lv        — leave record (raw จาก DB_insert / DB_update)
 * @param {Object} requester — user record ของผู้ยื่น
 */
function Notify_onLeaveSubmit_(lv, requester) {
  try {
    var stages = _stages_();
    // stages=1: ไม่มี supervisor → แจ้ง approver (HR) โดยตรง
    // stages>=2: มี supervisor → แจ้ง supervisor ก่อน
    var targetRoles = (stages === 1) ? ['approver', 'admin'] : ['supervisor', 'admin'];
    var recipients  = _findUsersByRole_(targetRoles);
    if (recipients.length === 0) return;

    var requesterName = String((requester && requester.full_name) || '-');
    var typeLabel     = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type || 'ลา';
    var subject       = '[แจ้งเตือน] ใบลาใหม่ — ' + requesterName + ' ขอ' + typeLabel + ' (' + (lv.leave_no || '') + ')';

    var heading = '<strong>' + cfg_esc_(requesterName) + '</strong> ได้ยื่นคำขอ'
      + cfg_esc_(typeLabel)
      + ' รอการพิจารณา กรุณาตรวจสอบและดำเนินการในระบบ';

    var htmlBody = _buildLeaveEmailBody_(lv, requester, heading);
    _notifyRecipients_(recipients, subject, htmlBody);
  } catch (err) {
    console.error('Notify_onLeaveSubmit_ error: ' + err.message);
  }
}

/**
 * แจ้งเตือนเมื่อใบลาได้รับการอนุมัติ (status = approved)
 * ส่งถึง: approver / HR ทุกคน (เพื่อให้รับทราบและดำเนินการต่อ)
 *
 * @param {Object} lv        — leave record หลัง approve (raw จาก DB_update)
 * @param {Object} requester — user record ของผู้ยื่น
 * @param {Object} approver  — user record ของผู้อนุมัติ
 */
function Notify_onLeaveApproved_(lv, requester, approver) {
  try {
    var recipients = _findUsersByRole_(['approver', 'admin']).filter(function (u) {
      return String(u.id) !== String(approver.id);
    });
    if (recipients.length === 0) return;

    var requesterName = String((requester && requester.full_name) || '-');
    var approverName  = String((approver  && approver.full_name)  || '-');
    var typeLabel     = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type || 'ลา';
    var subject       = '[อนุมัติแล้ว] ใบลา — ' + requesterName + ' ' + typeLabel + ' (' + (lv.leave_no || '') + ')';

    var heading = 'ใบลาของ <strong>' + cfg_esc_(requesterName) + '</strong> ได้รับการ<strong>อนุมัติ</strong>'
      + ' โดย ' + cfg_esc_(approverName)
      + ' กรุณาตรวจสอบและดำเนินการในระบบ';

    var htmlBody = _buildLeaveEmailBody_(lv, requester, heading);
    _notifyRecipients_(recipients, subject, htmlBody);
  } catch (err) {
    console.error('Notify_onLeaveApproved_ error: ' + err.message);
  }
}

/**
 * แจ้งเตือนผลลัพธ์การลา (อนุมัติ / ไม่อนุมัติ) ไปยังพนักงานผู้ยื่นใบลาทางอีเมล
 *
 * @param {Object} lv        — leave record หลังการเปลี่ยนแปลง (raw จาก DB_update)
 * @param {Object} requester — user record ของผู้ขอลา
 * @param {Object} approver  — user record ของผู้อนุมัติ
 */
function Notify_onLeaveResultToRequester_(lv, requester, approver) {
  try {
    var email = String(requester.email || '').trim();
    if (!email) return;

    var approverName = String((approver && approver.full_name) || '-');
    var typeLabel    = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type || 'ลา';
    
    var isApproved = (lv.status === STATUS.APPROVED);
    var resultText = isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ';
    var subject    = '[' + resultText + 'แล้ว] ใบลาของคุณ — ' + typeLabel + ' (' + (lv.leave_no || '') + ')';

    var heading = 'ใบลาของคุณได้รับการ<strong>' + resultText + '</strong>'
      + ' โดย ' + cfg_esc_(approverName);
      
    if (lv.approver_comment) {
      if (isApproved) {
        heading += '<br><strong>บันทึกผู้อนุมัติ:</strong> ' + cfg_esc_(lv.approver_comment);
      } else {
        heading += '<br><span style="color:#dc2626"><strong>เหตุผลที่ไม่อนุมัติ:</strong> ' + cfg_esc_(lv.approver_comment) + '</span>';
      }
    }

    var htmlBody = _buildLeaveEmailBody_(lv, requester, heading);
    _notifyRecipients_([{ full_name: requester.full_name, email: email }], subject, htmlBody);
  } catch (err) {
    console.error('Notify_onLeaveResultToRequester_ error: ' + err.message);
  }
}

/**
 * สร้าง HTML body ของ email พร้อมข้อมูลการเบิกค่าใช้จ่าย
 * @param {Object} exp      — expense record
 * @param {Object} requester — {full_name, position, department}
 * @param {string} heading  — หัวข้อส่วนแรกของเนื้อหา
 * @returns {string} HTML string
 */
function _buildExpenseEmailBody_(exp, requester, heading) {
  var settings = Settings_get_public_();
  var orgName  = settings.org_name || APP.ORG;

  var expenseNo   = exp.expense_no || '-';
  var typeLabel   = exp.expense_type || '-';
  var statusLabel = STATUS_LABEL[exp.status]         || exp.status     || '-';

  // วันที่ — แสดง พ.ศ.
  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var dateThai = toThaiDate(exp.expense_date);
  var amountText = '฿' + Number(exp.amount || 0).toLocaleString();

  var requesterName = String((requester && requester.full_name) || '-');
  var position      = String((requester && requester.position)  || '');
  var department    = String((requester && requester.department) || '');

  var rows = [
    ['เลขที่ใบเบิก',      cfg_esc_(expenseNo)],
    ['ผู้ยื่นเบิก',       cfg_esc_(requesterName + (position ? ' · ' + position : '') + (department ? ' (' + department + ')' : ''))],
    ['ประเภทค่าใช้จ่าย',  cfg_esc_(typeLabel)],
    ['วันที่จ่ายจริง',     cfg_esc_(dateThai)],
    ['จำนวนเงินที่ขอเบิก',  '<strong>' + cfg_esc_(amountText) + ' บาท</strong>'],
    ['รายละเอียด',       cfg_esc_(String(exp.description || '-'))],
    ['สถานะปัจจุบัน',     cfg_esc_(statusLabel)]
  ];

  var tableRows = rows.map(function (r) {
    return '<tr>'
      + '<td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap;width:140px;vertical-align:top">' + r[0] + '</td>'
      + '<td style="padding:8px 12px;color:#1f2937;vertical-align:top">' + r[1] + '</td>'
      + '</tr>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:\'Sarabun\',\'Noto Sans Thai\',sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">'

    // Header
    + '<tr><td style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:28px 32px">'
    + '<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:1px;text-transform:uppercase">' + cfg_esc_(orgName) + '</p>'
    + '<h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff">'
    + 'แจ้งเตือนใบเบิกค่าใช้จ่าย</h1>'
    + '</td></tr>'

    // Body
    + '<tr><td style="padding:28px 32px">'
    + '<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">' + heading + '</p>'

    // Details table
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px">'
    + '<thead><tr style="background:#f9fafb"><td colspan="2" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase">รายละเอียดใบเบิก</td></tr></thead>'
    + '<tbody>' + tableRows + '</tbody>'
    + '</table>'

    + '<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">อีเมลนี้ส่งโดยระบบอัตโนมัติ — กรุณาอย่าตอบกลับ</p>'
    + '</td></tr>'

    // Footer
    + '<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">'
    + '<p style="margin:0;font-size:12px;color:#6b7280">© ' + new Date().getFullYear() + ' ' + cfg_esc_(orgName) + ' · ระบบเบิกค่าใช้จ่ายออนไลน์</p>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * แจ้งเตือนเมื่อมีการยื่นใบขออนุมัติเบิกค่าใช้จ่าย (status = pending)
 * ส่งถึง: approver (HR) และ admin ทุกคน
 *
 * @param {Object} exp       — expense claim record
 * @param {Object} requester — user record ของผู้ขอเบิก
 */
function Notify_onExpenseSubmit_(exp, requester) {
  try {
    var recipients = _findUsersByRole_(['approver', 'admin']);
    if (recipients.length === 0) return;

    var requesterName = String((requester && requester.full_name) || '-');
    var amount = Number(exp.amount || 0).toLocaleString();
    var subject = '[แจ้งเตือน] ขออนุมัติเบิกค่าใช้จ่าย — ' + requesterName + ' ขอเบิก ฿' + amount + ' (' + (exp.expense_no || '') + ')';

    var heading = '<strong>' + cfg_esc_(requesterName) + '</strong> ได้ส่งคำขออนุมัติเบิกเงินเป็นจำนวน <strong>'
      + cfg_esc_(amount) + ' บาท</strong> เพื่อพิจารณาและอนุมัติในระบบ';

    var htmlBody = _buildExpenseEmailBody_(exp, requester, heading);
    _notifyRecipients_(recipients, subject, htmlBody);
  } catch (err) {
    console.error('Notify_onExpenseSubmit_ error: ' + err.message);
  }
}
