
function Users_list(user, p) {
  Auth_requireCap(user, 'user.manage');
  var q = String((p && p.q) || '').toLowerCase().trim();
  var role = String((p && p.role) || '').trim();
  var dept = String((p && p.department) || '').trim();
  var rows = DB_readAll(SHEETS.USERS).map(Auth_publicUser_);
  if (q) rows = rows.filter(function (u) {
    return [u.username, u.full_name, u.email, u.position, u.department].some(function (x) {
      return String(x || '').toLowerCase().indexOf(q) >= 0;
    });
  });
  if (role) rows = rows.filter(function (u) { return u.role === role; });
  if (dept) rows = rows.filter(function (u) { return u.department === dept; });
  return { items: rows, total: rows.length };
}

function Users_get(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id ของผู้ใช้');
  if (String(id) !== String(user.id)) Auth_requireCap(user, 'user.manage');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  return Auth_publicUser_(u);
}

function Users_upsert(user, p) {
  Auth_requireCap(user, 'user.manage');
  var data = p || {};
  var username = String(data.username || '').toLowerCase().trim();
  if (!username) throw new Error('กรุณากรอกชื่อผู้ใช้ (username)');
  if (!/^[-a-z0-9_.]{3,30}$/.test(username)) throw new Error('username ใช้เฉพาะ a-z, 0-9, _ . - ความยาว 3-30');
  if (!data.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  if (!data.role || !ROLE_LABEL[data.role]) throw new Error('กรุณาเลือกบทบาทที่ถูกต้อง');

  var existing = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.username || '').toLowerCase() === username && String(r.id) !== String(data.id || '');
  });
  if (existing) throw new Error('username นี้ถูกใช้แล้ว');

  if (data.id) {
    var u = DB_findById(SHEETS.USERS, data.id);
    if (!u) throw new Error('ไม่พบผู้ใช้');
    var patch = {
      username: username,
      full_name: String(data.full_name || '').trim(),
      position: String(data.position || '').trim(),
      level: String(data.level || '').trim(),
      department: String(data.department || '').trim(),
      role: data.role,
      email: String(data.email || '').trim(),
      phone: String(data.phone || '').trim(),
      avatar: String(data.avatar || '').trim(),
      is_active: data.is_active === false ? 'no' : 'yes'
    };
    if (data.password) {
      var salt = cfg_salt_();
      patch.salt = salt; patch.password_hash = cfg_hash_(data.password, salt);
    }
    var updated = DB_update(SHEETS.USERS, data.id, patch);
    Audit_log_(user, 'user.update', 'user', data.id, { fields: Object.keys(patch) });
    return Auth_publicUser_(updated);
  } else {
    var pwd = data.password || '123456';
    var salt2 = cfg_salt_();
    var newU = DB_insert(SHEETS.USERS, {
      username: username,
      password_hash: cfg_hash_(pwd, salt2),
      salt: salt2,
      full_name: String(data.full_name || '').trim(),
      position: String(data.position || '').trim(),
      level: String(data.level || '').trim(),
      department: String(data.department || '').trim(),
      role: data.role,
      email: String(data.email || '').trim(),
      phone: String(data.phone || '').trim(),
      avatar: String(data.avatar || '').trim(),
      is_active: data.is_active === false ? 'no' : 'yes'
    });
    Audit_log_(user, 'user.create', 'user', newU.id, { username: newU.username, role: newU.role });
    return Auth_publicUser_(newU);
  }
}

function Users_delete(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id');
  if (String(id) === String(user.id)) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  // Soft block: ถ้ามีใบลาแล้ว → disable แทนการลบ
  var hasLeaves = DB_readAll(SHEETS.LEAVES).some(function (lv) { return String(lv.requester_id) === String(id); });
  if (hasLeaves) {
    DB_update(SHEETS.USERS, id, { is_active: 'no' });
    Audit_log_(user, 'user.disable', 'user', id, { reason: 'has_leaves' });
    return { ok: true, mode: 'disabled' };
  }
  DB_delete(SHEETS.USERS, id);
  Audit_log_(user, 'user.delete', 'user', id, { username: u.username });
  return { ok: true, mode: 'deleted' };
}

function Users_resetPassword(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var pwd = String((p && p.new_password) || '123456');
  if (pwd.length < 6) throw new Error('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  var salt = cfg_salt_();
  DB_update(SHEETS.USERS, id, {
    salt: salt, password_hash: cfg_hash_(pwd, salt)
  });
  Audit_log_(user, 'user.reset_password', 'user', id, { username: u.username });
  return { ok: true };
}

function Users_updateProfile(user, p) {
  Auth_requireCap(user, 'leave.create_own');
  var data = p || {};
  var patch = {
    full_name: String(data.full_name || '').trim(),
    position: String(data.position || '').trim(),
    level: String(data.level || '').trim(),
    department: String(data.department || '').trim(),
    email: String(data.email || '').trim(),
    phone: String(data.phone || '').trim(),
    avatar: String(data.avatar || '').trim()
  };
  if (!patch.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  var updated = DB_update(SHEETS.USERS, user.id, patch);
  Audit_log_(user, 'user.update_profile', 'user', user.id, {});
  return Auth_publicUser_(updated);
}

// Active list สำหรับ dropdown (เห็นเฉพาะที่มีบทบาทที่ approve/check ได้)
function Users_active_for_role(user, p) {
  Auth_requireCap(user, 'leave.view_all');
  var role = String((p && p.role) || '').trim();
  var rows = DB_readAll(SHEETS.USERS).filter(function (u) {
    if (!_yes_(u.is_active)) return false;
    if (role && u.role !== role) return false;
    return true;
  }).map(function (u) {
    return { id: u.id, full_name: u.full_name, position: u.position, role: u.role, department: u.department };
  });
  return { items: rows };
}

// ── Self-registration (public — ไม่ต้อง auth) ─────────────────
function Users_register(p) {
  var data = p || {};
  var username = String(data.username || '').toLowerCase().trim();
  if (!username) throw new Error('กรุณากรอกชื่อผู้ใช้ (username)');
  if (!/^[-a-z0-9_.]{3,30}$/.test(username)) throw new Error('username ใช้เฉพาะ a-z, 0-9, _ . - ความยาว 3-30');
  if (!data.full_name || !String(data.full_name).trim()) throw new Error('กรุณากรอกชื่อ-สกุล');

  // Validate email
  var email = String(data.email || '').trim();
  if (!email) throw new Error('กรุณากรอกอีเมล');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');

  // Validate phone
  var phone = String(data.phone || '').trim();
  if (!phone) throw new Error('กรุณากรอกเบอร์โทรศัพท์');

  // Validate password
  var pwd = String(data.password || '').trim();
  if (!pwd || pwd.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

  // Check duplicate username
  var existing = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.username || '').toLowerCase() === username;
  });
  if (existing) throw new Error('username "' + username + '" ถูกใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');

  // Check duplicate email
  var existingEmail = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.email || '').toLowerCase().trim() === email.toLowerCase();
  });
  if (existingEmail) throw new Error('อีเมลนี้ถูกใช้สมัครแล้ว กรุณาใช้อีเมลอื่น');

  var salt = cfg_salt_();
  var newU = DB_insert(SHEETS.USERS, {
    username: username,
    password_hash: cfg_hash_(pwd, salt),
    salt: salt,
    full_name: String(data.full_name || '').trim(),
    position: String(data.position || '').trim(),
    level: '',
    department: String(data.department || '').trim(),
    role: 'employee',          // บทบาทเริ่มต้น — admin/HR กำหนดทีหลัง
    email: email,
    phone: phone,
    avatar: '',
    is_active: 'pending'       // รออนุมัติก่อน
  });

  // แจ้งเตือน admin/HR ว่ามีคนสมัครใหม่
  try { Notify_onNewRegistration_(newU); } catch (e) {}

  return { ok: true, id: newU.id, username: newU.username };
}

// ── List pending registrations (admin / approver) ──────────────
function Users_listPending(user) {
  Auth_requireCap(user, 'user.manage');
  var rows = DB_readAll(SHEETS.USERS).filter(function (u) {
    return String(u.is_active || '').toLowerCase().trim() === 'pending';
  }).map(Auth_publicUser_);
  return { items: rows, total: rows.length };
}

// ── Approve / Reject registration ──────────────────────────────
function Users_approveRegistration(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id           = String((p && p.id)            || '').trim();
  var action       = String((p && p.action)        || '').trim();   // 'approve' | 'reject'
  var role         = String((p && p.role)          || 'employee').trim();
  var rejectReason = String((p && p.reject_reason) || '').trim();
  if (!id) throw new Error('ระบุ id ของผู้ใช้');
  if (action !== 'approve' && action !== 'reject') throw new Error('action ต้องเป็น approve หรือ reject');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (String(u.is_active || '').toLowerCase().trim() !== 'pending') throw new Error('ผู้ใช้นี้ไม่ได้รออนุมัติ');

  if (action === 'approve') {
    if (!role || !ROLE_LABEL[role]) throw new Error('กรุณาเลือกบทบาทที่ถูกต้อง');
    var updated = DB_update(SHEETS.USERS, id, { is_active: 'yes', role: role });
    Audit_log_(user, 'user.approve_registration', 'user', id, { username: u.username, role: role });
    // แจ้งพนักงานว่าถูกอนุมัติแล้ว
    try { Notify_onRegistrationApproved_(u, role, user); } catch (e) {}
    return { ok: true, mode: 'approved', user: Auth_publicUser_(updated) };
  } else {
    // reject → ลบออกหรือ is_active=no
    var hasLeaves = DB_readAll(SHEETS.LEAVES).some(function (lv) { return String(lv.requester_id) === String(id); });
    if (hasLeaves) {
      DB_update(SHEETS.USERS, id, { is_active: 'no' });
    } else {
      DB_delete(SHEETS.USERS, id);
    }
    Audit_log_(user, 'user.reject_registration', 'user', id, { username: u.username, reason: rejectReason });
    // แจ้งพนักงานว่าถูกปฏิเสธ
    try { Notify_onRegistrationRejected_(u, rejectReason, user); } catch (e) {}
    return { ok: true, mode: 'rejected' };
  }
}

/**
 * คืนค่ารหัสเชื่อมต่อ LINE (line_connect_code)
 * หากยังไม่มี จะสร้างขึ้นมาใหม่ (รูปแบบ LMS-XXXXXX)
 */
function Users_getConnectCode(user) {
  Auth_requireCap(user, 'leave.create_own'); // ผู้ใช้ทุกคนเข้าถึงข้อมูลตนเองได้
  var u = DB_findById(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  
  if (u.line_user_id) {
    return { connected: true, line_user_id: u.line_user_id };
  }
  
  var code = u.line_connect_code;
  if (!code) {
    // สุ่มตัวเลข 6 หลัก
    var rand = Math.floor(100000 + Math.random() * 900000);
    code = 'LMS-' + rand;
    DB_update(SHEETS.USERS, user.id, { line_connect_code: code });
    DB_invalidate(SHEETS.USERS);
  }
  
  return { connected: false, code: code };
}

/**
 * ยกเลิกการเชื่อมต่อ LINE
 */
function Users_disconnectLine(user) {
  Auth_requireCap(user, 'leave.create_own');
  var u = DB_findById(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  
  DB_update(SHEETS.USERS, user.id, {
    line_user_id: '',
    line_connect_code: ''
  });
  DB_invalidate(SHEETS.USERS);
  Audit_log_(user, 'line.disconnect', 'user', user.id, {});
  return { ok: true };
}

