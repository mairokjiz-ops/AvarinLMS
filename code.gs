

function doGet(e) {
  // Bootstrap: ensure schema + defaults + at least admin user
  try {
    DB_initAllSchemas();
    Settings_ensureDefaults_();
    Seed_ensureUsers_();
    Seed_ensureHolidays_();
  } catch (err) {}
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function _ok(data) { return { ok: true, data: data }; }
function _err(msg) { return { ok: false, error: String(msg && msg.message ? msg.message : msg) }; }

// Universal API endpoint
function api(req) {
  try {
    req = req || {};
    var action = String(req.action || '').trim();
    var token = req.token || '';
    var p = req.payload || {};

    // Public endpoints (no auth)
    if (action === 'app.bootstrap')   return _ok(Auth_bootstrap(token));
    if (action === 'auth.login')      return _ok(Auth_login(p));
    if (action === 'auth.logout')     return _ok(Auth_logout(token));
    if (action === 'user.register')   return _ok(Users_register(p));


    // Authenticated endpoints
    var user = Auth_verify_(token);

    switch (action) {
      // Auth
      case 'auth.change_password':    return _ok(Auth_changePassword(user, p));
      case 'auth.me':                 return _ok({ user: Auth_publicUser_(user), caps: CAPS[user.role] || [] });

      // Users
      case 'user.list':               return _ok(Users_list(user, p));
      case 'user.get':                return _ok(Users_get(user, p));
      case 'user.upsert':             return _ok(Users_upsert(user, p));
      case 'user.delete':             return _ok(Users_delete(user, p));
      case 'user.reset_password':     return _ok(Users_resetPassword(user, p));
      case 'user.update_profile':     return _ok(Users_updateProfile(user, p));
      case 'user.active_for_role':    return _ok(Users_active_for_role(user, p));
      case 'user.list_pending':       return _ok(Users_listPending(user));
      case 'user.approve_registration': return _ok(Users_approveRegistration(user, p));


      // Leaves
      case 'leave.list':              return _ok(Leaves_list(user, p));
      case 'leave.get':               return _ok(Leaves_get(user, p));
      case 'leave.preview':           return _ok(Leaves_preview(user, p));
      case 'leave.create':            return _ok(Leaves_create(user, p));
      case 'leave.update':            return _ok(Leaves_update(user, p));
      case 'leave.submit':            return _ok(Leaves_submit(user, p));
      case 'leave.cancel':            return _ok(Leaves_cancel(user, p));
      case 'leave.check':             return _ok(Leaves_check(user, p));
      case 'leave.comment':           return _ok(Leaves_comment(user, p));
      case 'leave.approve':           return _ok(Leaves_approve(user, p));
      case 'leave.delete':            return _ok(Leaves_delete(user, p));
      case 'leave.workflow_counts':   return _ok(Leaves_workflow_counts(user));
      case 'leave.my_stats':          return _ok(Leaves_my_stats(user, p));
      case 'leave.user_stats':        return _ok(Leaves_user_stats(user, p));

      // Calendar / Missions
      case 'calendar.month':          return _ok(Calendar_month(user, p));
      case 'mission.list':            return _ok(Mission_list(user, p));
      case 'mission.get':             return _ok(Mission_get(user, p));
      case 'mission.create':          return _ok(Mission_create(user, p));
      case 'mission.update':          return _ok(Mission_update(user, p));
      case 'mission.submit':          return _ok(Mission_submit(user, p));
      case 'mission.cancel':          return _ok(Mission_cancel(user, p));
      case 'mission.delete':          return _ok(Mission_delete(user, p));
      case 'mission.approve':         return _ok(Mission_approve(user, p));

      // Standalone Expenses
      case 'expense.list':            return _ok(Expense_list(user, p));
      case 'expense.get':             return _ok(Expense_get(user, p));
      case 'expense.create':          return _ok(Expense_create(user, p));
      case 'expense.update':          return _ok(Expense_update(user, p));
      case 'expense.submit':          return _ok(Expense_submit(user, p));
      case 'expense.cancel':          return _ok(Expense_cancel(user, p));
      case 'expense.delete':          return _ok(Expense_delete(user, p));
      case 'expense.approve':         return _ok(Expense_approve(user, p));

      // Reports
      case 'report.overview':         return _ok(Reports_overview(user, p));
      case 'report.user':             return _ok(Reports_user(user, p));
      case 'report.users_list':       return _ok(Reports_users_list(user));
      case 'dashboard.data':          return _ok(Dashboard_data(user));

      // Settings
      case 'setting.get':             return _ok(Settings_get(user));
      case 'setting.update':          return _ok(Settings_update(user, p));

      // LINE OA Integration
      case 'line.get_connect_code':   return _ok(Users_getConnectCode(user));
      case 'line.disconnect':         return _ok(Users_disconnectLine(user));
      case 'line.webhook_url':        return _ok(LINE_getWebhookUrl());

      // Holidays
      case 'holiday.list':            return _ok(Holidays_list(user, p));
      case 'holiday.upsert':          return _ok(Holidays_upsert(user, p));
      case 'holiday.delete':          return _ok(Holidays_delete(user, p));

      // Audit
      case 'audit.list':              return _ok(Audit_list(user, p));
    }
    throw new Error('ไม่พบ action: ' + action);
  } catch (e) {
    return _err(e);
  }
}
