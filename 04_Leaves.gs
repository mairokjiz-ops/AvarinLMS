

function _leaveLimit_(type) {
  var key = 'limit_' + type;
  var v = Number(_settingsRaw_(key) || DEFAULT_LIMITS[type] || 0);
  return v > 0 ? v : (DEFAULT_LIMITS[type] || 0);
}

function _leaveWarnThreshold_() {
  var v = Number(_settingsRaw_('warn_threshold') || '80');
  return (v > 0 && v <= 100) ? v : 80;
}

function _leaveTypeForStats_(type) {
  return type === 'maternity' ? 'annual' : type;
}

function _stages_() {
  var n = Number(_settingsRaw_('approval_stages') || '3');
  if (n === 1 || n === 2 || n === 3) return n;
  return 3;
}

// คืน array ของ status ที่ role นี้ "รับผิดชอบดำเนินการ" ตอนนี้ (ขึ้นกับ stages)
function _inboxStatusesFor_(role) {
  var stages = _stages_();
  var out = [];
  if (hasCap_(role, 'leave.check') && stages >= 3) out.push(STATUS.PENDING);
  if (hasCap_(role, 'leave.comment')) {
    if (stages === 3) out.push(STATUS.CHECKED);
    else if (stages === 2) out.push(STATUS.PENDING);
  }
  if (hasCap_(role, 'leave.approve')) {
    if (stages === 1) out.push(STATUS.PENDING);
    else out.push(STATUS.REVIEWED);
    // Defensive: ถ้ามีใบเก่าค้างใน CHECKED ก่อนเปลี่ยน stages → approver รับช่วงได้
    if (stages !== 3) out.push(STATUS.CHECKED);
  }
  // unique
  var seen = {}; var result = [];
  out.forEach(function (s) { if (!seen[s]) { seen[s] = 1; result.push(s); } });
  return result;
}

// คำนวณวันลาที่ใช้ไปแล้วในปีงบประมาณนี้ (อนุมัติแล้วเท่านั้น)
function _leaveUsedDays_(userId, type, fiscalYear) {
  var rows = DB_readAll(SHEETS.LEAVES);
  var fy = Number(fiscalYear || cfg_fiscalYear_(cfg_now_()));
  return rows.reduce(function (sum, r) {
    if (String(r.requester_id) !== String(userId)) return sum;
    if (_leaveTypeForStats_(r.leave_type) !== type) return sum;
    if (r.status !== STATUS.APPROVED) return sum;
    if (Number(r.fiscal_year) !== fy) return sum;
    return sum + Number(r.days || 0);
  }, 0);
}

function _leaveStats_(userId, fiscalYear) {
  var fy = Number(fiscalYear || cfg_fiscalYear_(cfg_now_()));
  var stats = {};
  ACTIVE_LEAVE_TYPES.forEach(function (t) {
    var used = _leaveUsedDays_(userId, t, fy);
    var limit = _leaveLimit_(t);
    stats[t] = {
      used: used,
      limit: limit,
      remaining: Math.max(0, limit - used),
      percent: limit > 0 ? Math.round(used * 100 / limit) : 0
    };
  });
  return { fiscal_year: fy, fiscal_year_be: fy + 543, items: stats };
}

function _findLastLeave_(userId, beforeISO) {
  var before = beforeISO ? new Date(beforeISO).getTime() : Date.now();
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    if (String(r.requester_id) !== String(userId)) return false;
    if (r.status === STATUS.DRAFT || r.status === STATUS.CANCELLED || r.status === STATUS.REJECTED) return false;
    var t = new Date(r.start_date).getTime();
    return !isNaN(t) && t < before;
  });
  rows.sort(function (a, b) { return new Date(b.start_date).getTime() - new Date(a.start_date).getTime(); });
  return rows[0] || null;
}

function _genLeaveNo_() {
  var now = cfg_now_();
  var seq = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    var d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length + 1;
  return cfg_genLeaveNo_(now, seq);
}

function _leaveDurationLabel_(lv) {
  if (String(lv.leave_unit || '') === 'hour') {
    return cfg_round2_(lv.hours || (Number(lv.days || 0) * cfg_workdayHours_())) + ' ชั่วโมง';
  }
  return cfg_round2_(lv.days || 0) + ' วัน';
}

// ── Public API ─────────────────────────────────────────────

function Leaves_my_stats(user, p) {
  Auth_requireCap(user, 'leave.view_own');
  var fy = (p && p.fiscal_year) ? Number(p.fiscal_year) : cfg_fiscalYear_(cfg_now_());
  return _leaveStats_(user.id, fy);
}

function Leaves_user_stats(user, p) {
  var uid = String((p && p.user_id) || '').trim();
  if (!uid || uid === String(user.id)) return _leaveStats_(user.id, p && p.fiscal_year);
  Auth_requireCap(user, 'leave.view_all');
  return _leaveStats_(uid, p && p.fiscal_year);
}

// helper for client preview ก่อนยื่น
function Leaves_preview(user, p) {
  var data = p || {};
  var type = data.leave_type;
  if (ACTIVE_LEAVE_TYPES.indexOf(type) < 0) return { error: 'leave_type ไม่ถูกต้อง' };
  var duration = cfg_leaveDuration_(data);
  if (duration.error) return { error: duration.error };
  var days = duration.days;
  var stats = _leaveStats_(user.id, cfg_fiscalYear_(cfg_now_()));
  var s = stats.items[type] || { used: 0, limit: 0, remaining: 0 };
  var afterUsed = s.used + days;
  var afterRemaining = Math.max(0, s.limit - afterUsed);
  var warn = (s.limit > 0) && (afterUsed * 100 / s.limit) >= _leaveWarnThreshold_();
  var over = (s.limit > 0) && (afterUsed > s.limit);
  return {
    days: days,
    hours: duration.hours,
    leave_unit: duration.unit,
    leave_type: type,
    leave_type_label: LEAVE_TYPE_LABEL[type],
    stats: stats,
    after_used: afterUsed,
    after_remaining: afterRemaining,
    warn_threshold: _leaveWarnThreshold_(),
    warn: warn, over: over,
    last_leave: _findLastLeave_(user.id, data.start_date)
  };
}

function Leaves_create(user, p) {
  Auth_requireCap(user, 'leave.create_own');
  var data = p || {};
  if (ACTIVE_LEAVE_TYPES.indexOf(data.leave_type) < 0) throw new Error('โปรดเลือกประเภทการลาที่ถูกต้อง');
  if (!data.start_date) throw new Error('โปรดระบุวันที่เริ่มลา');
  if (!data.end_date && String(data.leave_unit || '') !== 'hour') throw new Error('โปรดระบุวันที่สิ้นสุดการลา');
  var duration = cfg_leaveDuration_(data);
  if (duration.error) throw new Error(duration.error);
  var days = duration.days;
  if (days <= 0) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  if (!data.reason || String(data.reason).trim().length < 3) throw new Error('โปรดระบุเหตุผลการลาอย่างน้อย 3 ตัวอักษร');

  var startISO = duration.start_date;
  var endISO   = duration.end_date;
  var writtenAt = data.written_at ? cfg_dateOnly_(data.written_at) : cfg_dateOnly_(cfg_now_());
  var fy = cfg_fiscalYear_(new Date(startISO));

  // limit warning (ไม่ block — admin override ผ่าน reason ได้, แต่บอก warn)
  var stats = _leaveStats_(user.id, fy);
  var s = stats.items[data.leave_type];
  var afterUsed = s.used + days;
  var over = (s.limit > 0) && (afterUsed > s.limit);

  // pull last leave (ลาครั้งสุดท้าย)
  var last = _findLastLeave_(user.id, startISO);

  var leaveNo = _genLeaveNo_();
  var status = data.draft ? STATUS.DRAFT : STATUS.PENDING;

  var newLv = DB_insert(SHEETS.LEAVES, {
    leave_no: leaveNo,
    requester_id: user.id,
    leave_type: data.leave_type,
    reason: String(data.reason).trim(),
    start_date: startISO,
    end_date: endISO,
    days: days,
    leave_unit: duration.unit,
    start_time: duration.start_time,
    end_time: duration.end_time,
    hours: duration.hours,
    contact_address: String(data.contact_address || '').trim(),
    contact_phone: String(data.contact_phone || user.phone || '').trim(),
    last_leave_type: last ? last.leave_type : '',
    last_leave_start: last ? last.start_date : '',
    last_leave_end: last ? last.end_date : '',
    last_leave_days: last ? Number(last.days || 0) : '',
    status: status,
    written_at: writtenAt,
    written_place: String(data.written_place || '').trim(),
    fiscal_year: fy,
    attachment_url: String(data.attachment_url || '').trim()
  });
  Audit_log_(user, 'leave.create', 'leave', newLv.id, {
    leave_no: leaveNo, type: data.leave_type, days: days, status: status, over_limit: over
  });
  // แจ้งเตือน email เมื่อยื่นใบลาทันที (ไม่ใช่ draft)
  if (status === STATUS.PENDING) {
    Notify_onLeaveSubmit_(newLv, user);
  }
  return { leave: newLv, over_limit: over, after_used: afterUsed, limit: s.limit };
}

function Leaves_update(user, p) {
  var data = p || {};
  if (!data.id) throw new Error('ระบุ id ของใบลา');
  var lv = DB_findById(SHEETS.LEAVES, data.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // เจ้าของแก้ได้เฉพาะตอน draft หรือ pending
  if (String(lv.requester_id) === String(user.id)) {
    if (lv.status !== STATUS.DRAFT && lv.status !== STATUS.PENDING) {
      throw new Error('ใบลาที่อยู่ในขั้นตอนการอนุมัติแล้วไม่สามารถแก้ไขได้');
    }
  } else {
    Auth_requireCap(user, 'leave.manage');
  }
  if (data.leave_type && ACTIVE_LEAVE_TYPES.indexOf(data.leave_type) < 0) throw new Error('leave_type ไม่ถูกต้อง');
  var patch = {};
  ['leave_type','reason','contact_address','contact_phone','written_place','attachment_url'].forEach(function (k) {
    if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim();
  });
  if (data.start_date && data.end_date) {
    var duration = cfg_leaveDuration_(data);
    if (duration.error) throw new Error(duration.error);
    patch.start_date = duration.start_date;
    patch.end_date   = duration.end_date;
    patch.days       = duration.days;
    patch.leave_unit = duration.unit;
    patch.start_time = duration.start_time;
    patch.end_time   = duration.end_time;
    patch.hours      = duration.hours;
    patch.fiscal_year = cfg_fiscalYear_(new Date(patch.start_date));
  }
  if (typeof data.written_at !== 'undefined') patch.written_at = cfg_dateOnly_(data.written_at);
  var updated = DB_update(SHEETS.LEAVES, data.id, patch);
  Audit_log_(user, 'leave.update', 'leave', lv.id, { fields: Object.keys(patch) });
  return updated;
}

function Leaves_submit(user, p) {
  // ส่งใบลา draft → pending
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) Auth_requireCap(user, 'leave.manage');
  if (lv.status !== STATUS.DRAFT) throw new Error('ใบลานี้ไม่ใช่ฉบับร่าง');
  var updated = DB_update(SHEETS.LEAVES, lv.id, { status: STATUS.PENDING });
  Audit_log_(user, 'leave.submit', 'leave', lv.id, {});
  // แจ้งเตือน email เมื่อส่งใบลา draft → pending
  Notify_onLeaveSubmit_(updated, user);
  return updated;
}

function Leaves_cancel(user, p) {
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) Auth_requireCap(user, 'leave.manage');
  if (lv.status === STATUS.APPROVED) throw new Error('ใบลาที่อนุมัติแล้วไม่สามารถยกเลิกได้ (โปรดติดต่อ admin)');
  if (lv.status === STATUS.CANCELLED || lv.status === STATUS.REJECTED) throw new Error('ใบลานี้ถูกยกเลิก/ปฏิเสธไปแล้ว');
  var updated = DB_update(SHEETS.LEAVES, lv.id, { status: STATUS.CANCELLED });
  Audit_log_(user, 'leave.cancel', 'leave', lv.id, {});
  return updated;
}

function Leaves_check(user, p) {
  Auth_requireCap(user, 'leave.check');
  var stages = _stages_();
  if (stages < 3) throw new Error('ระบบไม่ได้เปิดขั้นตอนตรวจสอบ (กำหนดเป็น ' + stages + ' ขั้น)');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (lv.status !== STATUS.PENDING) throw new Error('ใบลานี้ไม่อยู่ในสถานะรอตรวจสอบ');
  var updated = DB_update(SHEETS.LEAVES, lv.id, {
    status: STATUS.CHECKED,
    checker_id: user.id,
    checker_comment: String((p && p.comment) || '').trim(),
    checker_at: cfg_iso_(cfg_now_())
  });
  Audit_log_(user, 'leave.check', 'leave', lv.id, {});
  return updated;
}

function Leaves_comment(user, p) {
  Auth_requireCap(user, 'leave.comment');
  var stages = _stages_();
  if (stages < 2) throw new Error('ระบบไม่ได้เปิดขั้นตอนความเห็นผู้บังคับบัญชา (กำหนดเป็น ' + stages + ' ขั้น)');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // stages=3: รอ CHECKED ก่อน · stages=2: รับจาก PENDING โดยตรง · รับ CHECKED ด้วย (กรณีใบเก่าค้าง)
  var ok = (lv.status === STATUS.CHECKED) || (stages === 2 && lv.status === STATUS.PENDING);
  if (!ok) throw new Error('ใบลานี้ไม่อยู่ในสถานะที่ให้ความเห็นได้');
  var updated = DB_update(SHEETS.LEAVES, lv.id, {
    status: STATUS.REVIEWED,
    supervisor_id: user.id,
    supervisor_comment: String((p && p.comment) || '').trim(),
    supervisor_at: cfg_iso_(cfg_now_())
  });
  Audit_log_(user, 'leave.comment', 'leave', lv.id, {});
  return updated;
}

function Leaves_approve(user, p) {
  Auth_requireCap(user, 'leave.approve');
  var stages = _stages_();
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // ตามขั้น:
  // stages=1 → PENDING
  // stages=2 → REVIEWED (+ defensive: PENDING/CHECKED ถ้ามีใบค้าง)
  // stages=3 → REVIEWED (+ defensive: CHECKED ถ้ามีใบค้าง)
  var ok = false;
  if (stages === 1) ok = (lv.status === STATUS.PENDING);
  else if (stages === 2) ok = (lv.status === STATUS.REVIEWED || lv.status === STATUS.PENDING || lv.status === STATUS.CHECKED);
  else ok = (lv.status === STATUS.REVIEWED || lv.status === STATUS.CHECKED);
  if (!ok) throw new Error('ใบลานี้ไม่อยู่ในสถานะที่อนุมัติได้');
  var decision = String((p && p.decision) || 'approved');
  var newStatus = (decision === 'rejected') ? STATUS.REJECTED : STATUS.APPROVED;
  var updated = DB_update(SHEETS.LEAVES, lv.id, {
    status: newStatus,
    approver_id: user.id,
    approver_decision: decision,
    approver_comment: String((p && p.comment) || '').trim(),
    approver_at: cfg_iso_(cfg_now_())
  });
  Audit_log_(user, 'leave.' + decision, 'leave', lv.id, {});
  // ดึงข้อมูลผู้ยื่นคำขอลา
  var requesterUser = DB_findById(SHEETS.USERS, lv.requester_id);

  // แจ้งเตือน HR/Admin เมื่ออนุมัติใบลา
  if (newStatus === STATUS.APPROVED) {
    Notify_onLeaveApproved_(updated, requesterUser, user);
  }

  // แจ้งเตือนผลลัพธ์กลับไปยังผู้ยื่นใบลาทางอีเมล
  if (requesterUser) {
    try {
      Notify_onLeaveResultToRequester_(updated, requesterUser, user);
    } catch (err) {
      console.error('Notify_onLeaveResultToRequester_ error: ' + err.message);
    }
  }
  return updated;
}

function Leaves_delete(user, p) {
  Auth_requireCap(user, 'leave.delete');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  DB_delete(SHEETS.LEAVES, lv.id);
  Audit_log_(user, 'leave.delete', 'leave', lv.id, { leave_no: lv.leave_no });
  return { ok: true };
}

// ── Lookup / List ────────────────────────────────────────

function _enrichLeave_(lv, usersMap) {
  var u = usersMap[lv.requester_id] || {};
  var c = usersMap[lv.checker_id] || {};
  var sv = usersMap[lv.supervisor_id] || {};
  var ap = usersMap[lv.approver_id] || {};
  return Object.assign({}, lv, {
    requester: u ? { id: u.id, full_name: u.full_name, position: u.position, department: u.department, role: u.role, avatar: u.avatar } : null,
    checker:    c ? { id: c.id, full_name: c.full_name, position: c.position } : null,
    supervisor: sv ? { id: sv.id, full_name: sv.full_name, position: sv.position } : null,
    approver:   ap ? { id: ap.id, full_name: ap.full_name, position: ap.position } : null,
    leave_type_label: LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type,
    duration_label: _leaveDurationLabel_(lv),
    status_label: STATUS_LABEL[lv.status] || lv.status,
    status_tone: STATUS_TONE[lv.status] || 'slate'
  });
}

function Leaves_list(user, p) {
  var data = p || {};
  var scope = String(data.scope || 'mine');  // mine | all | pending_action
  var rows = DB_readAll(SHEETS.LEAVES);
  var users = DB_buildIndex(SHEETS.USERS);

  if (scope === 'mine') {
    rows = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  } else if (scope === 'all') {
    Auth_requireCap(user, 'leave.view_all');
  } else if (scope === 'pending_action') {
    // งานที่รอ role นี้ดำเนินการ — ขึ้นกับ approval_stages
    var inboxStatuses = _inboxStatusesFor_(user.role);
    if (inboxStatuses.length === 0) rows = [];
    else rows = rows.filter(function (r) { return inboxStatuses.indexOf(r.status) >= 0; });
  }
  // filters
  if (data.q) {
    var q = String(data.q).toLowerCase();
    rows = rows.filter(function (r) {
      var u = users[r.requester_id] || {};
      return [r.leave_no, r.reason, u.full_name, u.position].some(function (x) {
        return String(x || '').toLowerCase().indexOf(q) >= 0;
      });
    });
  }
  if (data.status) rows = rows.filter(function (r) { return r.status === data.status; });
  if (data.leave_type) rows = rows.filter(function (r) { return _leaveTypeForStats_(r.leave_type) === data.leave_type; });
  if (data.fiscal_year) rows = rows.filter(function (r) { return Number(r.fiscal_year) === Number(data.fiscal_year); });

  // sort: latest created first
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

  // pagination
  var page = Math.max(1, Number(data.page || 1));
  var per = Math.min(200, Math.max(5, Number(data.per_page || 50)));
  var total = rows.length;
  var pages = Math.max(1, Math.ceil(total / per));
  var start = (page - 1) * per;
  var slice = rows.slice(start, start + per).map(function (r) { return _enrichLeave_(r, users); });
  return { items: slice, total: total, page: page, per_page: per, pages: pages };
}

function Leaves_get(user, p) {
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id');
  var lv = DB_findById(SHEETS.LEAVES, id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) {
    if (!hasCap_(user.role, 'leave.view_all')) throw new Error('คุณไม่มีสิทธิ์ดูใบลาของผู้อื่น');
  }
  var users = DB_buildIndex(SHEETS.USERS);
  var settings = Settings_get_public_();
  return {
    leave: _enrichLeave_(lv, users),
    org: { name: settings.org_name, address: settings.org_address, phone: settings.org_phone, email: settings.org_email }
  };
}

// Workflow board: counts per status (สำหรับ dashboard)
function Leaves_workflow_counts(user) {
  Auth_requireCap(user, 'leave.view_all');
  var rows = DB_readAll(SHEETS.LEAVES);
  var by = {};
  Object.keys(STATUS_LABEL).forEach(function (s) { by[s] = 0; });
  rows.forEach(function (r) { if (by[r.status] != null) by[r.status]++; });
  return { total: rows.length, by_status: by };
}

// Workflow definition สำหรับ client (timeline + action buttons)
function Leaves_workflow_def(user) {
  return { stages: _stages_() };
}
