
const CACHE_TTL = 300;  // 5 นาที (มี version invalidation อยู่แล้ว)

function _cache_() { return CacheService.getScriptCache(); }
function _props_() { return PropertiesService.getScriptProperties(); }

function _ver_(scope) {
  return Number(_props_().getProperty('ver:' + scope) || '1');
}
function _bumpVer_(scope) {
  var v = _ver_(scope) + 1;
  _props_().setProperty('ver:' + scope, String(v));
}

function _cacheGet_(key) {
  try {
    var raw = _cache_().get(key);
    if (!raw) return null;
    if (raw.indexOf('CHUNK:') === 0) {
      var n = Number(raw.substring(6));
      var chunks = [];
      for (var i = 0; i < n; i++) {
        var c = _cache_().get(key + ':' + i);
        if (!c) return null;
        chunks.push(c);
      }
      return JSON.parse(chunks.join(''));
    }
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function _cachePut_(key, val, ttl) {
  try {
    var json = JSON.stringify(val);
    if (json.length < 95000) {
      _cache_().put(key, json, ttl || CACHE_TTL);
    } else {
      var n = Math.ceil(json.length / 90000);
      _cache_().put(key, 'CHUNK:' + n, ttl || CACHE_TTL);
      for (var i = 0; i < n; i++) {
        _cache_().put(key + ':' + i, json.substring(i*90000, (i+1)*90000), ttl || CACHE_TTL);
      }
    }
  } catch (e) {}
}

function DB_ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function DB_sheet_(name) {
  var ss = DB_ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function DB_ensureSchema_(name) {
  var sh = DB_sheet_(name);
  var cols = SCHEMAS[name];
  if (!cols) throw new Error('ไม่พบ schema สำหรับ ' + name);
  var lastCol = sh.getLastColumn();
  var needWriteHeader = false;
  if (lastCol < cols.length) needWriteHeader = true;
  if (!needWriteHeader) {
    var header = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    for (var i = 0; i < cols.length; i++) {
      if (String(header[i]) !== cols[i]) { needWriteHeader = true; break; }
    }
  }
  if (needWriteHeader) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    sh.getRange(1, 1, 1, cols.length)
      .setBackground('#0f172a').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  // Force text format on TEXT_COLUMNS for this sheet
  cols.forEach(function (col, i) {
    if (TEXT_COLUMNS.indexOf(col) >= 0) {
      try { sh.getRange(2, i+1, Math.max(1, sh.getMaxRows()-1), 1).setNumberFormat('@'); } catch (e) {}
    }
  });
  return sh;
}

function DB_initAllSchemas() {
  Object.keys(SHEETS).forEach(function (k) {
    DB_ensureSchema_(SHEETS[k]);
  });
}

function DB_readAll(name) {
  var ver = _ver_('sheet:' + name);
  var key = 'sheet:' + name + ':v' + ver;
  var cached = _cacheGet_(key);
  if (cached) return cached;
  var sh = DB_ensureSchema_(name);
  var cols = SCHEMAS[name];
  var last = sh.getLastRow();
  if (last < 2) { _cachePut_(key, []); return []; }
  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var result = values.map(function (row) {
    var obj = {};
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i]; var v = row[i];
      if (v instanceof Date) v = cfg_iso_(v);
      obj[c] = v == null ? '' : v;
    }
    return obj;
  }).filter(function (o) {
    var keyCol = cols.indexOf('id'); if (keyCol < 0) keyCol = 0;
    return String(o[cols[keyCol]] || '').trim() !== '';
  });
  _cachePut_(key, result);
  return result;
}

function DB_buildIndex(name) {
  var rows = DB_readAll(name);
  var cols = SCHEMAS[name];
  var keyIdx = cols.indexOf('id');
  if (keyIdx < 0) keyIdx = 0;
  var keyCol = cols[keyIdx];
  var map = {};
  rows.forEach(function (r) {
    var k = String(r[keyCol] || '').trim();
    if (k) map[k] = r;
  });
  return map;
}

function DB_findById(name, id) {
  if (!id) return null;
  var map = DB_buildIndex(name);
  return map[String(id)] || null;
}

function DB_findOne(name, predicate) {
  var rows = DB_readAll(name);
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

function DB_filter(name, predicate) {
  return DB_readAll(name).filter(predicate);
}

function DB_insert(name, data) {
  var sh = DB_ensureSchema_(name);
  var cols = SCHEMAS[name];
  var keyIdx = cols.indexOf('id');
  if (keyIdx < 0) keyIdx = 0;
  var keyCol = cols[keyIdx];
  var obj = Object.assign({}, data);
  if (!obj[keyCol]) obj[keyCol] = (keyCol === 'id' || keyCol === 'token') ? cfg_uuid_() : String(Date.now());
  if (cols.indexOf('created_at') >= 0 && !obj.created_at) obj.created_at = cfg_iso_(cfg_now_());
  if (cols.indexOf('updated_at') >= 0 && !obj.updated_at) obj.updated_at = obj.created_at;
  var row = cols.map(function (c) { return obj[c] == null ? '' : obj[c]; });
  var newRow = sh.getLastRow() + 1;
  var range = sh.getRange(newRow, 1, 1, cols.length);
  // Force text format on text columns BEFORE write
  cols.forEach(function (c, i) {
    if (TEXT_COLUMNS.indexOf(c) >= 0) {
      try { sh.getRange(newRow, i+1).setNumberFormat('@'); } catch (e) {}
    }
  });
  range.setValues([row]);
  _bumpVer_('sheet:' + name);
  return obj;
}

function DB_update(name, id, patch) {
  var sh = DB_ensureSchema_(name);
  var cols = SCHEMAS[name];
  var keyIdx = cols.indexOf('id');
  if (keyIdx < 0) keyIdx = 0;
  var last = sh.getLastRow();
  if (last < 2) return null;
  var keys = sh.getRange(2, keyIdx+1, last-1, 1).getValues();
  var rowIdx = -1;
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(id)) { rowIdx = i + 2; break; }
  }
  if (rowIdx < 0) return null;
  var current = sh.getRange(rowIdx, 1, 1, cols.length).getValues()[0];
  var obj = {};
  for (var j = 0; j < cols.length; j++) {
    var v = current[j];
    if (v instanceof Date) v = cfg_iso_(v);
    obj[cols[j]] = v == null ? '' : v;
  }
  Object.keys(patch).forEach(function (k) {
    if (cols.indexOf(k) >= 0) obj[k] = patch[k];
  });
  if (cols.indexOf('updated_at') >= 0) obj.updated_at = cfg_iso_(cfg_now_());
  var newRow = cols.map(function (c) { return obj[c] == null ? '' : obj[c]; });
  cols.forEach(function (c, i) {
    if (TEXT_COLUMNS.indexOf(c) >= 0) {
      try { sh.getRange(rowIdx, i+1).setNumberFormat('@'); } catch (e) {}
    }
  });
  sh.getRange(rowIdx, 1, 1, cols.length).setValues([newRow]);
  _bumpVer_('sheet:' + name);
  return obj;
}

function DB_delete(name, id) {
  var sh = DB_ensureSchema_(name);
  var cols = SCHEMAS[name];
  var keyIdx = cols.indexOf('id'); if (keyIdx < 0) keyIdx = 0;
  var last = sh.getLastRow();
  if (last < 2) return false;
  var keys = sh.getRange(2, keyIdx+1, last-1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      _bumpVer_('sheet:' + name);
      return true;
    }
  }
  return false;
}

function DB_invalidate(name) { _bumpVer_('sheet:' + name); }
function DB_invalidateAll() {
  Object.keys(SHEETS).forEach(function (k) { _bumpVer_('sheet:' + SHEETS[k]); });
}
