
function Reports_overview(user, p) {
  Auth_requireCap(user, 'report.view_all');
  var fy = Number((p && p.fiscal_year) || cfg_fiscalYear_(cfg_now_()));
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) { return Number(r.fiscal_year) === fy; });
  var users = DB_buildIndex(SHEETS.USERS);

  // Single-scan accumulators
  var by_status = {};
  var by_type = {};
  var by_dept = {};
  var by_month = {};   // YYYY-MM → days
  var byUser = {};     // userId → { sick, personal, annual, total_days, total_count, last }

  Object.keys(STATUS_LABEL).forEach(function (s) { by_status[s] = 0; });
  ACTIVE_LEAVE_TYPES.forEach(function (t) { by_type[t] = { count: 0, days: 0 }; });

  rows.forEach(function (r) {
    var reportType = _leaveTypeForStats_(r.leave_type);
    by_status[r.status] = (by_status[r.status] || 0) + 1;
    if (by_type[reportType]) {
      by_type[reportType].count++;
      if (r.status === STATUS.APPROVED) by_type[reportType].days += Number(r.days || 0);
    }
    var u = users[r.requester_id] || {};
    var dept = u.department || '(ไม่ระบุสังกัด)';
    if (!by_dept[dept]) by_dept[dept] = { count: 0, days: 0 };
    by_dept[dept].count++;
    if (r.status === STATUS.APPROVED) by_dept[dept].days += Number(r.days || 0);
    var ym = String(r.start_date || '').substring(0, 7);
    if (ym) by_month[ym] = (by_month[ym] || 0) + (r.status === STATUS.APPROVED ? Number(r.days || 0) : 0);
    var uid = String(r.requester_id);
    if (!byUser[uid]) byUser[uid] = { id: uid, sick: 0, personal: 0, annual: 0, total_days: 0, total_count: 0, last: '' };
    byUser[uid].total_count++;
    if (r.status === STATUS.APPROVED) {
      var d = Number(r.days || 0);
      byUser[uid][reportType] = (byUser[uid][reportType] || 0) + d;
      byUser[uid].total_days += d;
    }
    if (r.created_at && (!byUser[uid].last || r.created_at > byUser[uid].last)) byUser[uid].last = r.created_at;
  });

  // Top users (highest leave days)
  var topUsers = Object.keys(byUser).map(function (uid) {
    var u = users[uid] || {};
    return Object.assign({
      full_name: u.full_name, position: u.position, department: u.department, role: u.role
    }, byUser[uid]);
  }).sort(function (a, b) { return b.total_days - a.total_days; }).slice(0, 20);

  // Trend: last 12 months chronologically
  var monthsList = [];
  var now = cfg_now_();
  for (var m = 11; m >= 0; m--) {
    var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    var ym = Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM');
    monthsList.push({ ym: ym, days: by_month[ym] || 0 });
  }

  return {
    fiscal_year: fy, fiscal_year_be: fy + 543,
    total: rows.length,
    by_status: by_status,
    by_type: by_type,
    by_dept: by_dept,
    by_month: monthsList,
    top_users: topUsers
  };
}

function Reports_user(user, p) {
  var uid = String((p && p.user_id) || user.id);
  if (uid !== String(user.id) && !hasCap_(user.role, 'report.view_all')) {
    throw new Error('คุณไม่มีสิทธิ์ดูรายงานของผู้อื่น');
  }
  var fy = Number((p && p.fiscal_year) || cfg_fiscalYear_(cfg_now_()));
  var u = DB_findById(SHEETS.USERS, uid);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    return String(r.requester_id) === uid && Number(r.fiscal_year) === fy;
  });
  var by_status = {};
  Object.keys(STATUS_LABEL).forEach(function (s) { by_status[s] = 0; });
  rows.forEach(function (r) { by_status[r.status] = (by_status[r.status] || 0) + 1; });
  var stats = _leaveStats_(uid, fy);
  // recent
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  var recent = rows.slice(0, 30).map(function (r) {
    return {
      id: r.id, leave_no: r.leave_no, leave_type: r.leave_type,
      leave_type_label: LEAVE_TYPE_LABEL[r.leave_type], reason: r.reason,
      start_date: r.start_date, end_date: r.end_date, days: r.days,
      leave_unit: r.leave_unit, start_time: r.start_time, end_time: r.end_time, hours: r.hours,
      duration_label: _leaveDurationLabel_(r),
      status: r.status, status_label: STATUS_LABEL[r.status],
      created_at: r.created_at
    };
  });
  return {
    user: Auth_publicUser_(u),
    fiscal_year: fy, fiscal_year_be: fy + 543,
    stats: stats,
    by_status: by_status,
    total_count: rows.length,
    recent: recent
  };
}

function Reports_users_list(user) {
  Auth_requireCap(user, 'report.view_all');
  var rows = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.is_active); });
  return {
    items: rows.map(function (u) {
      return { id: u.id, full_name: u.full_name, position: u.position, department: u.department, role: u.role };
    })
  };
}

// Dashboard data — one-shot for any role
function Dashboard_data(user) {
  var fy = cfg_fiscalYear_(cfg_now_());
  var myStats = _leaveStats_(user.id, fy);
  var rows = DB_readAll(SHEETS.LEAVES);
  var users = DB_buildIndex(SHEETS.USERS);

  var data = {
    fiscal_year: fy, fiscal_year_be: fy + 543,
    me: { stats: myStats, recent: [] },
    pending_for_me: 0,
    by_status: {},
    recent_all: [],
    warn_threshold: _leaveWarnThreshold_()
  };

  // my recent leaves
  var mine = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  mine.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  data.me.recent = mine.slice(0, 8).map(function (r) { return _enrichLeave_(r, users); });

  // pending for me
  if (hasCap_(user.role, 'leave.check')) {
    data.pending_for_me = rows.filter(function (r) { return r.status === STATUS.PENDING; }).length;
  } else if (hasCap_(user.role, 'leave.comment')) {
    data.pending_for_me = rows.filter(function (r) { return r.status === STATUS.CHECKED; }).length;
  } else if (hasCap_(user.role, 'leave.approve')) {
    data.pending_for_me = rows.filter(function (r) { return r.status === STATUS.REVIEWED; }).length;
  }

  if (hasCap_(user.role, 'leave.view_all')) {
    Object.keys(STATUS_LABEL).forEach(function (s) { data.by_status[s] = 0; });
    rows.forEach(function (r) { data.by_status[r.status] = (data.by_status[r.status] || 0) + 1; });
    var allSorted = rows.slice().sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
    data.recent_all = allSorted.slice(0, 10).map(function (r) { return _enrichLeave_(r, users); });
  }

  return data;
}
