function _wf_monthKey_(v) {
  if (!v) return Utilities.formatDate(cfg_now_(), APP.TIMEZONE, 'yyyy-MM');
  var s = String(v).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM');
  return Utilities.formatDate(cfg_now_(), APP.TIMEZONE, 'yyyy-MM');
}
function _wf_monthRange_(monthKey) {
  var m = _wf_monthKey_(monthKey).split('-');
  var y = Number(m[0]), mo = Number(m[1]) - 1;
  var start = new Date(y, mo, 1);
  var end = new Date(y, mo + 1, 0);
  return { key: m[0] + '-' + ('0' + (mo + 1)).slice(-2), start: start, end: end };
}
function _wf_dateIter_(start, end) {
  var out = [];
  var d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d.getTime() <= end.getTime()) {
    out.push(new Date(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function _wf_monthDays_(monthKey) {
  var r = _wf_monthRange_(monthKey);
  var holidays = cfg_getHolidaysMap_();
  return _wf_dateIter_(r.start, r.end).map(function (d) {
    var dateStr = cfg_dateOnly_(d);
    return {
      date: dateStr,
      day: d.getDate(),
      dow: d.getDay(),
      weekend: d.getDay() === 0 || d.getDay() === 6,
      holiday_name: holidays[dateStr] || ''
    };
  });
}
function _wf_activeUsers_(user, scope) {
  var rows = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.is_active); });
  if (scope === 'all') return rows;
  if (scope === 'department') return rows.filter(function (u) { return String(u.department || '') === String(user.department || ''); });
  return rows.filter(function (u) { return String(u.id) === String(user.id); });
}
function _wf_scopeFor_(user, ownCap, deptCap, allCap) {
  if (allCap && hasCap_(user.role, allCap)) return 'all';
  if (deptCap && hasCap_(user.role, deptCap)) return 'department';
  return 'own';
}
function _wf_leaveTone_(type) {
  return ({ sick: 'rose', personal: 'amber', annual: 'emerald', maternity: 'emerald' })[type] || 'indigo';
}
function _wf_overlapDays_(a1, a2, b1, b2) { return !(a2 < b1 || a1 > b2); }
function _wf_asDateOnly_(v) {
  var s = cfg_dateOnly_(v);
  if (s) return s;
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
  return '';
}
function _wf_asLocalDate_(v) {
  var s = _wf_asDateOnly_(v);
  return s ? new Date(s + 'T00:00:00') : null;
}
function _wf_missionScopeFor_(user) { return _wf_scopeFor_(user, 'mission.view_own', 'mission.view_department', 'mission.view_all'); }
function _wf_calendarScopeFor_(user) { return _wf_scopeFor_(user, 'calendar.view_own', 'calendar.view_department', 'calendar.view_all'); }
function _wf_missionNo_() {
  var now = cfg_now_();
  var seq = DB_readAll(SHEETS.MISSIONS).filter(function (r) {
    var d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length + 1;
  return cfg_genMissionNo_(now, seq);
}
function _wf_missionExpenses_(missionId) { return DB_readAll(SHEETS.EXPENSES).filter(function (r) { return String(r.mission_id) === String(missionId); }); }
function _wf_missionExpenseTotal_(missionId) { return _wf_missionExpenses_(missionId).reduce(function (sum, r) { return sum + Number(r.amount || 0); }, 0); }
function _wf_enrichMission_(m, users) {
  var u = users[m.requester_id] || {};
  var ex = _wf_missionExpenses_(m.id);
  return {
    id: m.id, mission_no: m.mission_no, requester_id: m.requester_id, requester: Auth_publicUser_(u),
    title: m.title, purpose: m.purpose, destination: m.destination, start_date: m.start_date, end_date: m.end_date,
    transport_type: m.transport_type || '', requested_amount: m.requested_amount || '',
    status: m.status, status_label: STATUS_LABEL[m.status] || m.status, status_tone: STATUS_TONE[m.status] || 'slate',
    approver_id: m.approver_id, approver_comment: m.approver_comment, approver_at: m.approver_at, approved_amount: m.approved_amount,
    expense_total: _wf_missionExpenseTotal_(m.id), expense_count: ex.length, created_at: m.created_at, updated_at: m.updated_at
  };
}
function _wf_visibleMissionRows_(user, p) {
  var scope = _wf_missionScopeFor_(user);
  var rows = DB_readAll(SHEETS.MISSIONS);
  var users = DB_buildIndex(SHEETS.USERS);
  if (scope === 'own') rows = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  else if (scope === 'department') rows = rows.filter(function (r) { var u = users[r.requester_id] || {}; return String(u.department || '') === String(user.department || ''); });
  if (p && p.q) {
    var q = String(p.q).toLowerCase().trim();
    rows = rows.filter(function (r) {
      var u = users[r.requester_id] || {};
      return [r.mission_no, r.title, r.purpose, r.destination, u.full_name, u.department].some(function (x) { return String(x || '').toLowerCase().indexOf(q) >= 0; });
    });
  }
  if (p && p.status) rows = rows.filter(function (r) { return r.status === p.status; });
  if (p && p.month) {
    var mk = _wf_monthKey_(p.month);
    rows = rows.filter(function (r) {
      var rs = _wf_asDateOnly_(r.start_date).substring(0, 7);
      var re = _wf_asDateOnly_(r.end_date).substring(0, 7);
      return rs === mk || re === mk || (rs < mk && re > mk);
    });
  }
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  return rows.map(function (r) { return _wf_enrichMission_(r, users); });
}
function Calendar_month(user, p) {
  var range = _wf_monthRange_(p && p.month);
  var scope = 'all';
  var users = DB_buildIndex(SHEETS.USERS);
  var visibleStatuses = {};
  [STATUS.PENDING, STATUS.CHECKED, STATUS.REVIEWED, STATUS.APPROVED].forEach(function (s) { visibleStatuses[s] = true; });
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    if (!visibleStatuses[r.status]) return false;
    var s = _wf_asLocalDate_(r.start_date);
    var e = _wf_asLocalDate_(r.end_date);
    if (!s || !e) return false;
    if (!_wf_overlapDays_(s, e, range.start, range.end)) return false;
    if (scope === 'own') return String(r.requester_id) === String(user.id);
    if (scope === 'department') { var u = users[r.requester_id] || {}; return String(u.department || '') === String(user.department || ''); }
    return true;
  });
  var byDate = {};
  _wf_monthDays_(range.key).forEach(function (d) { byDate[d.date] = []; });
  rows.forEach(function (r) {
    var u = users[r.requester_id] || {};
    var s = _wf_asLocalDate_(r.start_date);
    var e = _wf_asLocalDate_(r.end_date);
    if (!s || !e) return;
    _wf_dateIter_(s < range.start ? range.start : s, e > range.end ? range.end : e).forEach(function (d) {
      var key = cfg_dateOnly_(d);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({ id: r.id, leave_no: r.leave_no, requester_name: u.full_name || '-', department: u.department || '-', leave_type: r.leave_type, leave_type_label: LEAVE_TYPE_LABEL[r.leave_type] || r.leave_type, status: r.status, status_label: STATUS_LABEL[r.status] || r.status, tone: _wf_leaveTone_(r.leave_type) });
    });
  });
  var days = _wf_monthDays_(range.key).map(function (d) { return Object.assign({}, d, { items: byDate[d.date] || [], count: (byDate[d.date] || []).length }); });
  var byType = {};
  rows.forEach(function (r) { byType[r.leave_type] = (byType[r.leave_type] || 0) + Number(r.days || 0); });
  return { month_key: range.key, scope: scope, total: rows.length, by_type: byType, days: days };
}
function Mission_list(user, p) { var items = _wf_visibleMissionRows_(user, p || {}); return { items: items, total: items.length }; }
function Mission_get(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var m = DB_findById(SHEETS.MISSIONS, id);
  if (!m) throw new Error('ไม่พบรายการ');
  var scope = _wf_missionScopeFor_(user);
  var users = DB_buildIndex(SHEETS.USERS);
  if (scope === 'own' && String(m.requester_id) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ดูรายการนี้');
  if (scope === 'department') { var owner = users[m.requester_id] || {}; if (String(owner.department || '') !== String(user.department || '')) throw new Error('คุณไม่มีสิทธิ์ดูรายการนี้'); }
  return { mission: _wf_enrichMission_(m, users), requester: Auth_publicUser_(users[m.requester_id] || null), org: Settings_get_public_() };
}
function Mission_create(user, p) {
  Auth_requireCap(user, 'mission.create_own');
  var data = p || {};
  if (!data.title || String(data.title).trim().length < 3) throw new Error('ระบุหัวข้อ/เรื่องอย่างน้อย 3 ตัวอักษร');
  if (!data.destination) throw new Error('ระบุปลายทาง');
  if (!data.purpose) throw new Error('ระบุวัตถุประสงค์');
  if (!data.start_date) throw new Error('ระบุวันที่เริ่ม');
  if (!data.end_date) data.end_date = data.start_date;
  var start = cfg_dateOnly_(data.start_date);
  var end = cfg_dateOnly_(data.end_date);
  if (!start || !end) throw new Error('วันที่ไม่ถูกต้อง');
  var m = DB_insert(SHEETS.MISSIONS, { mission_no: _wf_missionNo_(), requester_id: user.id, title: String(data.title || '').trim(), purpose: String(data.purpose || '').trim(), destination: String(data.destination || '').trim(), start_date: start, end_date: end, transport_type: String(data.transport_type || '').trim(), requested_amount: data.requested_amount ? Number(data.requested_amount) : '', status: STATUS.PENDING, approver_id: '', approver_comment: '', approver_at: '', approved_amount: '' });
  Audit_log_(user, 'mission.create', 'mission', m.id, { mission_no: m.mission_no });
  return _wf_enrichMission_(m, DB_buildIndex(SHEETS.USERS));
}
function Mission_update(user, p) {
  var data = p || {};
  var id = String(data.id || '').trim();
  if (!id) throw new Error('ระบุ id');
  var m = DB_findById(SHEETS.MISSIONS, id);
  if (!m) throw new Error('ไม่พบรายการ');
  if (String(m.requester_id) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์แก้ไข');
  if (m.status !== STATUS.DRAFT && m.status !== STATUS.PENDING && !hasCap_(user.role, 'expense.manage')) throw new Error('รายการนี้แก้ไขไม่ได้');
  var patch = {};
  ['title','purpose','destination','transport_type'].forEach(function (k) { if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim(); });
  if (typeof data.requested_amount !== 'undefined') patch.requested_amount = data.requested_amount ? Number(data.requested_amount) : '';
  if (data.start_date || data.end_date) { patch.start_date = cfg_dateOnly_(data.start_date || m.start_date); patch.end_date = cfg_dateOnly_(data.end_date || m.end_date); }
  var updated = DB_update(SHEETS.MISSIONS, id, patch);
  Audit_log_(user, 'mission.update', 'mission', id, { fields: Object.keys(patch) });
  return _wf_enrichMission_(updated, DB_buildIndex(SHEETS.USERS));
}
function Mission_submit(user, p) { var id = String((p && p.id) || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (String(m.requester_id) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ส่งรายการนี้'); if (m.status !== STATUS.DRAFT && m.status !== STATUS.PENDING) throw new Error('สถานะไม่ถูกต้อง'); var updated = DB_update(SHEETS.MISSIONS, id, { status: STATUS.PENDING }); Audit_log_(user, 'mission.submit', 'mission', id, {}); return updated; }
function Mission_cancel(user, p) { var id = String((p && p.id) || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (String(m.requester_id) !== String(user.id) && !hasCap_(user.role, 'mission.approve')) throw new Error('คุณไม่มีสิทธิ์ยกเลิก'); if (m.status === STATUS.APPROVED) throw new Error('รายการอนุมัติแล้วไม่สามารถยกเลิกได้'); var updated = DB_update(SHEETS.MISSIONS, id, { status: STATUS.CANCELLED }); Audit_log_(user, 'mission.cancel', 'mission', id, {}); return updated; }
function Mission_delete(user, p) {
  Auth_requireCap(user, 'mission.approve');
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var m = DB_findById(SHEETS.MISSIONS, id);
  if (!m) throw new Error('ไม่พบรายการ');
  DB_readAll(SHEETS.EXPENSES).forEach(function (ex) {
    if (String(ex.mission_id) === id) {
      DB_update(SHEETS.EXPENSES, ex.id, { mission_id: '' });
    }
  });
  DB_delete(SHEETS.MISSIONS, id);
  Audit_log_(user, 'mission.delete', 'mission', id, { mission_no: m.mission_no });
  return { ok: true };
}
function Mission_approve(user, p) { Auth_requireCap(user, 'mission.approve'); var data = p || {}; var id = String(data.id || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (m.status !== STATUS.PENDING) throw new Error('รายการนี้ไม่อยู่ในสถานะที่อนุมัติได้'); var decision = String(data.decision || 'approved'); var patch = { status: decision === 'rejected' ? STATUS.REJECTED : STATUS.APPROVED, approver_id: user.id, approver_comment: String(data.comment || '').trim(), approver_at: cfg_iso_(cfg_now_()) }; if (data.approved_amount != null && String(data.approved_amount).trim() !== '') patch.approved_amount = Number(data.approved_amount); var updated = DB_update(SHEETS.MISSIONS, id, patch); Audit_log_(user, 'mission.' + (patch.status === STATUS.APPROVED ? 'approve' : 'reject'), 'mission', id, {}); return updated; }

// ── Standalone Expenses Module ──────────────────────────────────────────────

function _wf_expenseScopeFor_(user) {
  return _wf_scopeFor_(user, 'expense.create_own', 'expense.manage', 'expense.manage');
}

function _wf_enrichExpense_(ex, users) {
  var u = users[ex.created_by] || {};
  var m = ex.mission_id ? DB_findById(SHEETS.MISSIONS, ex.mission_id) : null;
  return {
    id: ex.id,
    expense_no: ex.expense_no,
    mission_id: ex.mission_id,
    mission_no: m ? m.mission_no : '',
    mission_title: m ? m.title : '',
    expense_date: ex.expense_date,
    expense_type: ex.expense_type,
    description: ex.description,
    amount: Number(ex.amount || 0),
    receipt_url: ex.receipt_url,
    status: ex.status,
    status_label: STATUS_LABEL[ex.status] || ex.status,
    status_tone: STATUS_TONE[ex.status] || 'slate',
    approver_id: ex.approver_id,
    approver_comment: ex.approver_comment,
    approver_at: ex.approver_at,
    approved_amount: ex.approved_amount !== '' ? Number(ex.approved_amount) : '',
    created_by: ex.created_by,
    requester: Auth_publicUser_(u),
    created_at: ex.created_at,
    updated_at: ex.updated_at
  };
}

function _wf_visibleExpenseRows_(user, p) {
  var scope = _wf_expenseScopeFor_(user);
  var rows = DB_readAll(SHEETS.EXPENSES);
  var users = DB_buildIndex(SHEETS.USERS);
  
  if (scope === 'own') {
    rows = rows.filter(function (r) { return String(r.created_by) === String(user.id); });
  } else if (scope === 'department') {
    rows = rows.filter(function (r) {
      var u = users[r.created_by] || {};
      return String(u.department || '') === String(user.department || '');
    });
  }
  
  if (p && p.q) {
    var q = String(p.q).toLowerCase().trim();
    rows = rows.filter(function (r) {
      var u = users[r.created_by] || {};
      return [r.expense_no, r.description, r.expense_type, u.full_name, u.department].some(function (x) {
        return String(x || '').toLowerCase().indexOf(q) >= 0;
      });
    });
  }
  
  if (p && p.status) {
    rows = rows.filter(function (r) { return r.status === p.status; });
  }
  
  if (p && p.month) {
    var mk = _wf_monthKey_(p.month);
    rows = rows.filter(function (r) {
      return String(r.expense_date).substring(0, 7) === mk;
    });
  }
  
  rows.sort(function (a, b) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  
  return rows.map(function (r) { return _wf_enrichExpense_(r, users); });
}

function Expense_list(user, p) {
  var items = _wf_visibleExpenseRows_(user, p || {});
  return { items: items, total: items.length };
}

function Expense_get(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  var scope = _wf_expenseScopeFor_(user);
  var users = DB_buildIndex(SHEETS.USERS);
  if (scope === 'own' && String(ex.created_by) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ดูรายการนี้');
  if (scope === 'department') {
    var owner = users[ex.created_by] || {};
    if (String(owner.department || '') !== String(user.department || ''));
  }
  
  return {
    expense: _wf_enrichExpense_(ex, users),
    requester: Auth_publicUser_(users[ex.created_by] || null),
    org: Settings_get_public_()
  };
}

function _wf_expenseNo_() {
  var now = cfg_now_();
  var seq = DB_readAll(SHEETS.EXPENSES).filter(function (r) {
    var d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length + 1;
  var yy = String(now.getFullYear()).substring(2);
  var mm = ('0' + (now.getMonth()+1)).slice(-2);
  var n  = ('0000' + Number(seq||0)).slice(-4);
  return 'EX' + yy + mm + n;
}

function Expense_create(user, p) {
  Auth_requireCap(user, 'expense.create_own');
  var data = p || {};
  if (!data.description || String(data.description).trim().length < 3) throw new Error('ระบุรายละเอียดค่าใช้จ่ายอย่างน้อย 3 ตัวอักษร');
  if (!data.amount || Number(data.amount) <= 0) throw new Error('ระบุจำนวนเงินที่ถูกต้อง');
  if (!data.expense_date) throw new Error('ระบุวันที่จ่ายเงิน');
  
  var date = cfg_dateOnly_(data.expense_date);
  if (!date) throw new Error('วันที่ไม่ถูกต้อง');
  
  var status = data.draft ? STATUS.DRAFT : STATUS.PENDING;
  var expenseNo = _wf_expenseNo_();
  
  var ex = DB_insert(SHEETS.EXPENSES, {
    expense_no: expenseNo,
    mission_id: String(data.mission_id || '').trim(),
    expense_date: date,
    expense_type: String(data.expense_type || 'ค่าเดินทาง').trim(),
    description: String(data.description || '').trim(),
    amount: Number(data.amount),
    receipt_url: String(data.receipt_url || '').trim(),
    status: status,
    approver_id: '',
    approver_comment: '',
    approver_at: '',
    approved_amount: '',
    created_by: user.id
  });
  
  Audit_log_(user, 'expense.create', 'expense', ex.id, { expense_no: ex.expense_no, status: status });
  
  if (status === STATUS.PENDING) {
    Notify_onExpenseSubmit_(ex, user);
  }
  
  return _wf_enrichExpense_(ex, DB_buildIndex(SHEETS.USERS));
}

function Expense_update(user, p) {
  var data = p || {};
  var id = String(data.id || '').trim();
  if (!id) throw new Error('ระบุ id');
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  if (String(ex.created_by) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์แก้ไข');
  if (ex.status !== STATUS.DRAFT && ex.status !== STATUS.PENDING && !hasCap_(user.role, 'expense.manage')) throw new Error('รายการนี้แก้ไขไม่ได้');
  
  var patch = {};
  ['description', 'expense_type', 'receipt_url', 'mission_id'].forEach(function (k) {
    if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim();
  });
  if (typeof data.amount !== 'undefined') {
    if (Number(data.amount) <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0');
    patch.amount = Number(data.amount);
  }
  if (data.expense_date) {
    var date = cfg_dateOnly_(data.expense_date);
    if (!date) throw new Error('วันที่ไม่ถูกต้อง');
    patch.expense_date = date;
  }
  
  var updated = DB_update(SHEETS.EXPENSES, id, patch);
  Audit_log_(user, 'expense.update', 'expense', id, { fields: Object.keys(patch) });
  return _wf_enrichExpense_(updated, DB_buildIndex(SHEETS.USERS));
}

function Expense_submit(user, p) {
  var id = String((p && p.id) || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  if (String(ex.created_by) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ส่งรายการนี้');
  if (ex.status !== STATUS.DRAFT && ex.status !== STATUS.PENDING) throw new Error('สถานะไม่ถูกต้อง');
  
  var updated = DB_update(SHEETS.EXPENSES, id, { status: STATUS.PENDING });
  Audit_log_(user, 'expense.submit', 'expense', id, {});
  Notify_onExpenseSubmit_(updated, user);
  return updated;
}

function Expense_cancel(user, p) {
  var id = String((p && p.id) || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  if (String(ex.created_by) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์ยกเลิก');
  if (ex.status === STATUS.APPROVED) throw new Error('รายการอนุมัติแล้วไม่สามารถยกเลิกได้');
  
  var updated = DB_update(SHEETS.EXPENSES, id, { status: STATUS.CANCELLED });
  Audit_log_(user, 'expense.cancel', 'expense', id, {});
  return updated;
}

function Expense_delete(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  var isOwner = String(ex.created_by) === String(user.id);
  var canDelete = hasCap_(user.role, 'expense.manage') || (isOwner && (ex.status === STATUS.DRAFT || ex.status === STATUS.CANCELLED));
  if (!canDelete) throw new Error('คุณไม่มีสิทธิ์ลบรายการนี้');
  
  DB_delete(SHEETS.EXPENSES, id);
  Audit_log_(user, 'expense.delete', 'expense', id, { expense_no: ex.expense_no });
  return { ok: true };
}

function Expense_approve(user, p) {
  Auth_requireCap(user, 'expense.manage');
  var data = p || {};
  var id = String(data.id || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  if (ex.status !== STATUS.PENDING) throw new Error('รายการนี้ไม่อยู่ในสถานะที่อนุมัติได้');
  
  var decision = String(data.decision || 'approved');
  var patch = {
    status: decision === 'rejected' ? STATUS.REJECTED : STATUS.APPROVED,
    approver_id: user.id,
    approver_comment: String(data.comment || '').trim(),
    approver_at: cfg_iso_(cfg_now_())
  };
  
  if (decision === 'approved') {
    var approvedAmt = data.approved_amount != null && String(data.approved_amount).trim() !== '' ? Number(data.approved_amount) : Number(ex.amount || 0);
    patch.approved_amount = approvedAmt;
  } else {
    patch.approved_amount = 0;
  }
  
  var updated = DB_update(SHEETS.EXPENSES, id, patch);
  Audit_log_(user, 'expense.' + (patch.status === STATUS.APPROVED ? 'approve' : 'reject'), 'expense', id, { approved_amount: patch.approved_amount });
  return updated;
}
