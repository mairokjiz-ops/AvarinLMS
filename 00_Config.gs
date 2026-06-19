const APP = Object.freeze({
  NAME: 'ระบบบันทึกการลาออนไลน์',
  SHORT: 'LMS',
  TITLE: 'LMS · ระบบบันทึกการลาออนไลน์',
  VERSION: '1.1.0',
  LAST_UPDATED: '2026-06-19',
  ORG: 'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด',
  ORGA: 'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด',
  DESCRIPTION: 'ระบบบันทึกการลาออนไลน์ · ลาป่วย ลากิจ ลาพักร้อน · ปฏิทินบริษัท · งานออกนอกพื้นที่ · เบิกค่าใช้จ่าย',
  TIMEZONE: 'Asia/Bangkok',
  LOGO_ICON: 'calendar2-check-fill',
  DEV: {
    NAME: 'ตาใหม่ งุงิ',
    URL: 'https://averintshop.com',
    LOGO: 'https://stickershop.line-scdn.net/stickershop/v1/product/18011/LINEStorePC/main.png?v=1'
  }
});
// ── Sheet names ─────────────────────────────────────────────
const SHEETS = Object.freeze({
  USERS:    'Users',
  LEAVES:   'Leaves',
  SESSIONS: 'Sessions',
  SETTINGS: 'Settings',
  AUDIT:    'AuditLog',
  MISSIONS:  'Missions',
  EXPENSES:  'Expenses',
  HOLIDAYS:  'Holidays'
});
// ── Schemas ─────────────────────────────────────────────────
const SCHEMAS = Object.freeze({
  Users: ['id','username','password_hash','salt','full_name','position','level','department','role','email','phone','avatar','is_active','created_at','updated_at','line_user_id','line_connect_code'],
  Leaves: ['id','leave_no','requester_id','leave_type','reason','start_date','end_date','days','contact_address','contact_phone','last_leave_type','last_leave_start','last_leave_end','last_leave_days','status','checker_id','checker_comment','checker_at','supervisor_id','supervisor_comment','supervisor_at','approver_id','approver_decision','approver_comment','approver_at','written_at','written_place','fiscal_year','attachment_url','created_at','updated_at','leave_unit','start_time','end_time','hours'],
  Sessions: ['token','user_id','created_at','expires_at','user_agent'],
  Settings: ['key','value','updated_at'],
  AuditLog: ['id','user_id','action','entity','entity_id','meta','created_at'],
  Missions: ['id','mission_no','requester_id','title','purpose','destination','start_date','end_date','transport_type','requested_amount','status','approver_id','approver_comment','approver_at','approved_amount','created_at','updated_at'],
  Expenses: ['id','expense_no','mission_id','expense_date','expense_type','description','amount','receipt_url','status','approver_id','approver_comment','approver_at','approved_amount','created_by','created_at','updated_at'],
  Holidays: ['id','holiday_date','name','created_at','updated_at']
});
// ── TEXT_COLUMNS — บังคับ Sheet เก็บเป็น text กัน auto-coercion ─
const TEXT_COLUMNS = Object.freeze([
  'phone','contact_phone','leave_no','token','password_hash','salt','attachment_url','avatar',
  'mission_no','title','purpose','destination','transport_type','expense_type','description','receipt_url',
  'holiday_date','expense_no','line_user_id','line_connect_code'
]);
// ── Roles ────────────────────────────────────────────────────
const ROLE_LABEL = Object.freeze({
  admin:      'ผู้ดูแลระบบ',
  approver:   'ฝ่ายบุคคล (ผู้อนุมัติ)',
  supervisor: 'หัวหน้างาน',
  checker:    'เจ้าหน้าที่ตรวจสอบ',
  employee:   'พนักงาน'
});
// ── RBAC Capabilities ───────────────────────────────────────
// Hierarchical: xxx.manage implies all xxx.<sub-action>
// Restrictive scopes (.view_own/.edit_own) ห้าม inherit จาก .manage
const CAPS = Object.freeze({
  admin: [
    'user.manage','setting.manage','audit.manage','leave.manage',
    'leave.view_all','leave.create_own','leave.cancel_own','leave.check','leave.comment','leave.approve','leave.delete',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_all','calendar.view_department','calendar.view_own',
    'mission.view_all','mission.view_department','mission.view_own','mission.create_own','mission.approve',
    'expense.manage','expense.create_own'
  ],
  approver: [
    'leave.view_all','leave.create_own','leave.cancel_own','leave.approve',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_all','calendar.view_department',
    'mission.view_all','mission.view_department','mission.view_own','mission.approve',
    'expense.manage','expense.create_own','setting.read'
  ],
  supervisor: [
    'leave.view_all','leave.create_own','leave.cancel_own','leave.comment',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_department',
    'mission.view_department','mission.view_own','mission.create_own',
    'expense.create_own','setting.read'
  ],
  checker: [
    'leave.view_all','leave.create_own','leave.cancel_own','leave.check',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_department',
    'mission.view_own','mission.create_own',
    'expense.create_own','setting.read'
  ],
  employee: [
    'leave.create_own','leave.view_own','leave.cancel_own',
    'report.view_own','file.upload',
    'calendar.view_own',
    'mission.view_own','mission.create_own',
    'expense.create_own','setting.read'
  ]
});
// ── Leave types & statuses ──────────────────────────────────
const LEAVE_TYPE = Object.freeze({
  SICK:      'sick',
  PERSONAL:  'personal',
  MATERNITY: 'maternity',
  ANNUAL:    'annual'
});
const LEAVE_TYPE_LABEL = Object.freeze({
  sick:      'ลาป่วย',
  personal:  'ลากิจส่วนตัว',
  maternity: 'ลาพักร้อน',
  annual:    'ลาพักร้อน'
});
const ACTIVE_LEAVE_TYPES = Object.freeze(['sick','personal','annual']);
const STATUS = Object.freeze({
  DRAFT:     'draft',
  PENDING:   'pending',     // ยื่นแล้วรอตรวจสอบ
  CHECKED:   'checked',     // ตรวจสอบแล้ว รอความเห็น
  REVIEWED:  'reviewed',    // ความเห็นหัวหน้าแล้ว รออนุมัติ
  APPROVED:  'approved',    // อนุมัติ
  REJECTED:  'rejected',    // ไม่อนุมัติ
  CANCELLED: 'cancelled'    // ผู้ลายกเลิก
});
const STATUS_LABEL = Object.freeze({
  draft:     'ฉบับร่าง',
  pending:   'รอตรวจสอบ',
  checked:   'รอความเห็นหัวหน้างาน',
  reviewed:  'รอฝ่ายบุคคลอนุมัติ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ไม่อนุมัติ',
  cancelled: 'ยกเลิก'
});
const STATUS_TONE = Object.freeze({
  draft:     'slate',
  pending:   'amber',
  checked:   'sky',
  reviewed:  'indigo',
  approved:  'emerald',
  rejected:  'rose',
  cancelled: 'slate'
});
// ── Default leave limits (per fiscal year, days) ────────────
const DEFAULT_LIMITS = Object.freeze({
  sick:      30,
  personal:  6,
  maternity: 10,
  annual:    10
});
// ── Settings defaults ───────────────────────────────────────
const SETTINGS_DEFAULTS = Object.freeze({
  // org info
  org_name:        'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด',
  org_address:     '555/63 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000',
  org_phone:       '0-2000-0000',
  org_email:       'hr@averintshop.com',
  // leave limits
  limit_sick:      '30',
  limit_personal:  '6',
  limit_maternity: '10',
  limit_annual:    '10',
  leave_workday_hours: '8',
  // warning threshold (% of limit)
  warn_threshold:  '80',
  // login behavior
  show_demo_users: 'yes',
  // session
  session_hours:   '8',
  // workflow: 1 = approver only, 2 = supervisor+approver, 3 = checker+supervisor+approver (default)
  approval_stages: '3',
  // line oa credentials
  line_channel_access_token: '',
  line_channel_secret: '',
  // email settings
  email_from_alias: ''
});
const SETTINGS_SENSITIVE = Object.freeze([]);  // ไม่มี secret ในระบบนี้
// ── Helpers ─────────────────────────────────────────────────
function cfg_iso_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function cfg_dateOnly_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd');
}
function cfg_now_() { return new Date(); }
function cfg_uuid_() { return Utilities.getUuid(); }
function cfg_salt_() {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now(), Utilities.Charset.UTF_8)
  ).replace(/=+$/, '').substring(0, 22);
}
function cfg_hash_(plain, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plain) + ':' + String(salt), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}
function cfg_token_() {
  var raw = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}
function _yes_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).toLowerCase().trim();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}
// Fiscal year: Jan 1 → Dec 31 (calendar year สำหรับบริษัทเอกชน)
function cfg_fiscalYear_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) d = new Date();
  return d.getFullYear();
}
function cfg_fiscalYearBE_(d) {
  return cfg_fiscalYear_(d) + 543;
}
function cfg_getHolidaysMap_() {
  try {
    var holidays = DB_readAll(SHEETS.HOLIDAYS);
    var map = {};
    holidays.forEach(function (h) {
      if (h.holiday_date) {
        var dateStr = String(h.holiday_date).substring(0, 10);
        map[dateStr] = h.name || 'วันหยุดบริษัท';
      }
    });
    return map;
  } catch (err) {
    return {};
  }
}
// Days between two ISO date strings (inclusive), excluding weekends and company holidays.
function cfg_daysBetween_(start, end) {
  try {
    var s = new Date(String(start).substring(0,10) + 'T00:00:00');
    var e = new Date(String(end).substring(0,10) + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    
    var holidays = cfg_getHolidaysMap_();
    var count = 0;
    var d = new Date(s.getTime());
    while (d.getTime() <= e.getTime()) {
      var dow = d.getDay();
      var isWeekend = (dow === 0 || dow === 6);
      var dateStr = Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd');
      var isHoliday = (dateStr in holidays);
      if (!isWeekend && !isHoliday) {
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  } catch (err) { return 0; }
}
// HTML escape (server side use only — client has its own)
function cfg_esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Generate leave_no: LV{YY}{MM}{NNNN}
function cfg_genLeaveNo_(d, seq) {
  if (!(d instanceof Date)) d = new Date(d);
  var yy = String(d.getFullYear()).substring(2);
  var mm = ('0' + (d.getMonth()+1)).slice(-2);
  var n  = ('0000' + Number(seq||0)).slice(-4);
  return 'LV' + yy + mm + n;
}
// Generate mission_no: MS{YY}{MM}{NNNN}
function cfg_genMissionNo_(d, seq) {
  if (!(d instanceof Date)) d = new Date(d);
  var yy = String(d.getFullYear()).substring(2);
  var mm = ('0' + (d.getMonth()+1)).slice(-2);
  var n  = ('0000' + Number(seq||0)).slice(-4);
  return 'MS' + yy + mm + n;
}
// Hierarchical RBAC check (mirrors client hasCap)
function hasCap_(role, cap) {
  if (cap === '*') return true;   // ★ '*' = ทุก role เห็น (mirror client)
  var arr = CAPS[role];
  if (!Array.isArray(arr) || !cap) return false;
  if (arr.indexOf(cap) >= 0) return true;
  // Restrictive scopes ห้าม inherit
  if (/\.(view_own|edit_own|view_self|edit_self|create_own|cancel_own)$/.test(cap)) return false;
  var dot = cap.indexOf('.');
  if (dot > 0) {
    var prefix = cap.substring(0, dot);
    if (arr.indexOf(prefix + '.manage') >= 0) return true;
  }
  return false;
}
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function cfg_activeLeaveLabels_() {
  var out = {};
  ACTIVE_LEAVE_TYPES.forEach(function (t) { out[t] = LEAVE_TYPE_LABEL[t]; });
  return out;
}
function cfg_workdayHours_() {
  var h = Number(_settingsRaw_('leave_workday_hours') || '8');
  return h > 0 ? h : 8;
}
function cfg_timeMinutes_(timeText) {
  var m = String(timeText || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
function cfg_round2_(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function cfg_workStartMinutes_() { return 8 * 60 + 30; }
function cfg_workEndMinutes_() { return 20 * 60; }
function cfg_leaveDuration_(data) {
  data = data || {};
  var unit = String(data.leave_unit || '').toLowerCase() === 'hour' ? 'hour' : 'day';
  if (unit === 'hour') {
    var startDate = cfg_dateOnly_(data.start_date);
    var endDate = cfg_dateOnly_(data.end_date || data.start_date);
    var sm = cfg_timeMinutes_(data.start_time);
    var em = cfg_timeMinutes_(data.end_time);
    if (!startDate || !endDate || startDate !== endDate) return { error: 'การลาเป็นชั่วโมงต้องอยู่ภายในวันเดียวกัน' };
    if (sm == null) return { error: 'โปรดระบุเวลาเริ่มลา' };
    if (em == null) return { error: 'โปรดระบุเวลาสิ้นสุดการลา' };
    if (sm < cfg_workStartMinutes_()) return { error: 'เวลาเริ่มลาต้องไม่ก่อน 08:30 น.' };
    if (em > cfg_workEndMinutes_()) return { error: 'เวลาสิ้นสุดการลาต้องไม่เกิน 20:00 น.' };
    if (em <= sm) return { error: 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มลา' };
    var hours = cfg_round2_((em - sm) / 60);
    if (hours < 1) return { error: 'การลาเป็นชั่วโมงต้องไม่น้อยกว่า 1 ชั่วโมง' };
    var workdayHours = cfg_workdayHours_();
    return {
      unit: 'hour',
      start_date: startDate,
      end_date: startDate,
      start_time: data.start_time,
      end_time: data.end_time,
      hours: hours,
      days: cfg_round2_(hours / workdayHours)
    };
  }
  var days = cfg_daysBetween_(data.start_date, data.end_date);
  return {
    unit: 'day',
    start_date: cfg_dateOnly_(data.start_date),
    end_date: cfg_dateOnly_(data.end_date),
    start_time: '',
    end_time: '',
    hours: cfg_round2_(days * cfg_workdayHours_()),
    days: days
  };
}
