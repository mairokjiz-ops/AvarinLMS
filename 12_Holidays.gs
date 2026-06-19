// ── 12_Holidays.gs — Holiday Management Module ───────────────────────────────────
// Holidays_list(user, p)
// Holidays_upsert(user, p)
// Holidays_delete(user, p)
// ─────────────────────────────────────────────────────────────────────────────

function Holidays_list(user, p) {
  Auth_requireCap(user, 'setting.read');
  var rows = DB_readAll(SHEETS.HOLIDAYS);
  // Sort holidays chronologically by holiday_date
  rows.sort(function (a, b) {
    return new Date(a.holiday_date).getTime() - new Date(b.holiday_date).getTime();
  });
  return rows;
}

function Holidays_upsert(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  if (!data.holiday_date) throw new Error('กรุณาระบุวันที่วันหยุด');
  if (!data.name || String(data.name).trim().length === 0) throw new Error('กรุณาระบุชื่อวันหยุด');
  
  var dateStr = cfg_dateOnly_(new Date(data.holiday_date));
  if (!dateStr) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  
  var patch = {
    holiday_date: dateStr,
    name: String(data.name).trim()
  };
  
  var res;
  if (data.id) {
    var existing = DB_findById(SHEETS.HOLIDAYS, data.id);
    if (!existing) throw new Error('ไม่พบข้อมูลวันหยุดที่ต้องการแก้ไข');
    res = DB_update(SHEETS.HOLIDAYS, data.id, patch);
    Audit_log_(user, 'holiday.update', 'holiday', res.id, { date: dateStr, name: patch.name });
  } else {
    // Prevent duplicate holiday dates
    var duplicate = DB_findOne(SHEETS.HOLIDAYS, function (r) {
      return String(r.holiday_date) === dateStr;
    });
    if (duplicate) throw new Error('มีวันหยุดสำหรับวันที่นี้อยู่ในระบบแล้ว (' + duplicate.name + ')');
    res = DB_insert(SHEETS.HOLIDAYS, patch);
    Audit_log_(user, 'holiday.create', 'holiday', res.id, { date: dateStr, name: patch.name });
  }
  return res;
}

function Holidays_delete(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id ของวันหยุด');
  var row = DB_findById(SHEETS.HOLIDAYS, id);
  if (!row) throw new Error('ไม่พบข้อมูลวันหยุด');
  DB_delete(SHEETS.HOLIDAYS, id);
  Audit_log_(user, 'holiday.delete', 'holiday', id, { date: row.holiday_date, name: row.name });
  return { ok: true };
}
