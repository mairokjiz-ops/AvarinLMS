
function _settingsMap_() {
  var rows = DB_readAll(SHEETS.SETTINGS);
  var map = {};
  rows.forEach(function (r) { map[String(r.key)] = String(r.value == null ? '' : r.value); });
  return map;
}

function _settingsRaw_(key) {
  var map = _settingsMap_();
  if (key in map) return map[key];
  return SETTINGS_DEFAULTS[key] != null ? SETTINGS_DEFAULTS[key] : '';
}

function Settings_ensureDefaults_() {
  // Internal layer — ห้ามเรียก Settings_get_public_() กลับ (กัน mutual recursion)
  DB_ensureSchema_(SHEETS.SETTINGS);
  var sh = DB_sheet_(SHEETS.SETTINGS);
  var map = _settingsMap_();
  var keys = Object.keys(SETTINGS_DEFAULTS);
  var toAdd = [];
  keys.forEach(function (k) {
    if (!(k in map)) toAdd.push({ key: k, value: SETTINGS_DEFAULTS[k] });
  });
  toAdd.forEach(function (item) {
    DB_insert(SHEETS.SETTINGS, { key: item.key, value: item.value });
  });
  if (toAdd.length > 0) DB_invalidate(SHEETS.SETTINGS);
  // Force text format on value column
  try {
    sh.getRange(2, 2, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat('@');
  } catch (e) {}
}

function Settings_get_public_() {
  Settings_ensureDefaults_();
  var map = _settingsMap_();
  var out = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) {
    if (SETTINGS_SENSITIVE.indexOf(k) >= 0) return;
    out[k] = (k in map) ? map[k] : SETTINGS_DEFAULTS[k];
  });
  return out;
}

function Settings_get(user) {
  Auth_requireCap(user, 'setting.read');
  Settings_ensureDefaults_();
  var map = _settingsMap_();
  if (hasCap_(user.role, 'setting.manage')) {
    var all = {};
    Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { all[k] = (k in map) ? map[k] : SETTINGS_DEFAULTS[k]; });
    return all;
  }
  // ผู้ใช้ทั่วไป → ส่ง public
  return Settings_get_public_();
}

function Settings_update(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var changed = [];
  Object.keys(data).forEach(function (k) {
    if (!(k in SETTINGS_DEFAULTS)) return;
    var val = String(data[k] == null ? '' : data[k]);
    var existing = DB_findOne(SHEETS.SETTINGS, function (r) { return String(r.key) === k; });
    if (existing) {
      DB_update(SHEETS.SETTINGS, existing.key, { value: val });
    } else {
      DB_insert(SHEETS.SETTINGS, { key: k, value: val });
    }
    changed.push(k);
  });
  Audit_log_(user, 'setting.update', 'setting', '', { keys: changed });
  return { ok: true, changed: changed };
}
