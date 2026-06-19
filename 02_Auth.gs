function Auth_publicUser_(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username,
    full_name: u.full_name, position: u.position, level: u.level,
    department: u.department, role: u.role,
    email: u.email, phone: u.phone, avatar: u.avatar,
    is_active: u.is_active,
    line_user_id: u.line_user_id,
    line_connect_code: u.line_connect_code
  };
}

function Auth_requireCap(user, cap) {
  if (!user) throw new Error('ต้องเข้าสู่ระบบก่อน');
  if (!hasCap_(user.role, cap)) throw new Error('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้ (' + cap + ')');
  return true;
}

function Auth_login(payload) {
  var username = String((payload && payload.username) || '').trim().toLowerCase();
  var password = String((payload && payload.password) || '');
  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  var u = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.username || '').toLowerCase() === username;
  });
  if (!u) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (String(u.is_active || '').toLowerCase().trim() === 'pending') throw new Error('บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคล — กรุณารอการแจ้งเตือน');
  if (!_yes_(u.is_active)) throw new Error('บัญชีนี้ถูกปิดการใช้งาน — โปรดติดต่อผู้ดูแลระบบ');
  var hash = cfg_hash_(password, u.salt);
  if (hash !== u.password_hash) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  var hours = Number(_settingsRaw_('session_hours') || '8');
  if (!hours || hours < 1) hours = 8;
  var token = cfg_token_();
  var now = cfg_now_();
  var expires = new Date(now.getTime() + hours * 3600 * 1000);
  DB_insert(SHEETS.SESSIONS, {
    token: token,
    user_id: u.id,
    created_at: cfg_iso_(now),
    expires_at: cfg_iso_(expires),
    user_agent: String((payload && payload.user_agent) || '')
  });
  Audit_log_(u, 'auth.login', 'session', token.substring(0, 8), {});
  return {
    token: token,
    user: Auth_publicUser_(u),
    caps: CAPS[u.role] || [],
    expires_at: cfg_iso_(expires)
  };
}

function Auth_logout(token) {
  if (!token) return { ok: true };
  try {
    var sess = DB_findById(SHEETS.SESSIONS, token);
    if (sess) DB_delete(SHEETS.SESSIONS, token);
  } catch (e) {}
  return { ok: true };
}

function Auth_verify_(token) {
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน');
  var sess = DB_findById(SHEETS.SESSIONS, token);
  if (!sess) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  var exp = new Date(sess.expires_at);
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
    try { DB_delete(SHEETS.SESSIONS, token); } catch (e) {}
    throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  }
  var u = DB_findById(SHEETS.USERS, sess.user_id);
  if (!u) throw new Error('ไม่พบบัญชีผู้ใช้');
  if (!_yes_(u.is_active)) throw new Error('บัญชีถูกปิดการใช้งาน');
  return u;
}

function Auth_changePassword(user, p) {
  Auth_requireCap(user, 'leave.create_own');  // ผู้ใช้ทุกคนทำได้
  var oldp = String((p && p.old_password) || '');
  var newp = String((p && p.new_password) || '');
  if (!oldp || !newp) throw new Error('กรอกรหัสผ่านเดิมและใหม่');
  if (newp.length < 6) throw new Error('รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร');
  var u = DB_findById(SHEETS.USERS, user.id);
  if (cfg_hash_(oldp, u.salt) !== u.password_hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  var salt = cfg_salt_();
  DB_update(SHEETS.USERS, user.id, {
    salt: salt, password_hash: cfg_hash_(newp, salt)
  });
  Audit_log_(user, 'auth.change_password', 'user', user.id, {});
  return { ok: true };
}

function Auth_bootstrap(token) {
  // Public bundle (cache-friendly)
  var settings = Settings_get_public_();
  var users_count = DB_readAll(SHEETS.USERS).length;
  var bundle = {
    app: {
      name: APP.NAME, short: APP.SHORT, title: APP.TITLE,
      version: APP.VERSION, last_updated: APP.LAST_UPDATED,
      description: APP.DESCRIPTION, org: settings.org_name || APP.ORG,
      logo_icon: APP.LOGO_ICON
    },
    dev: APP.DEV,
    settings: settings,
    roles: ROLE_LABEL,
    statuses: STATUS_LABEL,
    status_tones: STATUS_TONE,
    leave_types: cfg_activeLeaveLabels_(),
    holidays: cfg_getHolidaysMap_(),
    has_users: users_count > 0,
    me: null, caps: []
  };
  if (token) {
    try {
      var u = Auth_verify_(token);
      bundle.me = Auth_publicUser_(u);
      bundle.caps = CAPS[u.role] || [];
    } catch (e) { /* token expired/invalid — return guest payload */ }
  }
  return bundle;
}
