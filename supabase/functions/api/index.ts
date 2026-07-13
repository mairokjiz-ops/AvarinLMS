// @ts-nocheck
// === SUPABASE EDGE FUNCTION: api (Backend API Router & Database Manager) ===
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.515.0"
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.515.0"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

let REQUEST_ORIGIN = "";
var DB_CACHE = {};

// === UTILITIES POLYFILL ===
var Utilities = {
  formatDate: function(date, timeZone, format) {
    if (!date) return '';
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    // Convert to Bangkok time (+07:00)
    var localTime = d.getTime() + (7 * 60 * 60 * 1000);
    var ld = new Date(localTime);

    var y = ld.getUTCFullYear();
    var m = String(ld.getUTCMonth() + 1).padStart(2, '0');
    var day = String(ld.getUTCDate()).padStart(2, '0');
    var hr = String(ld.getUTCHours()).padStart(2, '0');
    var min = String(ld.getUTCMinutes()).padStart(2, '0');
    var sec = String(ld.getUTCSeconds()).padStart(2, '0');

    if (format === 'yyyy-MM') {
      return y + '-' + m;
    }
    if (format === 'yyyy-MM-dd') {
      return y + '-' + m + '-' + day;
    }
    if (format.indexOf('yyyy-MM-dd') >= 0 && format.indexOf('HH:mm:ss') >= 0) {
      return y + '-' + m + '-' + day + 'T' + hr + ':' + min + ':' + sec + '+07:00';
    }

    // Default fallback
    return y + '-' + m + '-' + day;
  }
};

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
  HOLIDAYS:  'Holidays',
  CHECKINS:  'Checkins',
  COURSES:   'Courses',
  QUIZZES:   'Quizzes',
  PROGRESS:  'UserProgress',
  COURSE_CHUNKS: 'CourseChunks'
});

// ── Schemas ─────────────────────────────────────────────────
const SCHEMAS = Object.freeze({
  Users: ['id','username','password_hash','salt','full_name','position','level','department','role','email','phone','avatar','is_active','created_at','updated_at','line_user_id','line_connect_code','branch','off_day'],
  Leaves: ['id','leave_no','requester_id','leave_type','reason','start_date','end_date','days','contact_address','contact_phone','last_leave_type','last_leave_start','last_leave_end','last_leave_days','status','checker_id','checker_comment','checker_at','supervisor_id','supervisor_comment','supervisor_at','approver_id','approver_decision','approver_comment','approver_at','written_at','written_place','fiscal_year','attachment_url','created_at','updated_at','leave_unit','start_time','end_time','hours'],
  Sessions: ['token','user_id','created_at','expires_at','user_agent'],
  Settings: ['key','value','updated_at'],
  AuditLog: ['id','user_id','action','entity','entity_id','meta','created_at'],
  Missions: ['id','mission_no','requester_id','title','purpose','destination','start_date','end_date','transport_type','requested_amount','status','approver_id','approver_comment','approver_at','approved_amount','created_at','updated_at','work_type'],
  Expenses: ['id','expense_no','mission_id','expense_date','expense_type','description','amount','receipt_url','bank_account','status','approver_id','approver_comment','approver_at','approved_amount','created_by','created_at','updated_at'],
  Holidays: ['id','holiday_date','name','created_at','updated_at'],
  Checkins: ['id','user_id','check_in_at','check_out_at','check_in_lat','check_in_lng','check_out_lat','check_out_lng','check_in_loc','check_out_loc','status','created_at','updated_at','check_in_img','check_out_img'],
  Courses: ['id','title','description','thumbnail_url','content','video_url','status','category','duration_hours','pass_score','instructor','ai_summary','ai_modules','ai_quiz','ai_flashcards','ai_key_points','ai_checklist','created_at','updated_at'],
  Quizzes: ['id','course_id','question','options','correct_option','created_at','updated_at'],
  UserProgress: ['id','user_id','course_id','quiz_score','quiz_total','is_passed','created_at','updated_at'],
  CourseChunks: ['id','course_id','chunk_index','content','metadata','embedding','created_at','updated_at']
});

// ── TEXT_COLUMNS — บังคับ Sheet เก็บเป็น text กัน auto-coercion ─
const TEXT_COLUMNS = Object.freeze([
  'phone','contact_phone','leave_no','token','password_hash','salt','attachment_url','avatar',
  'mission_no','title','purpose','destination','transport_type','expense_type','description','receipt_url','work_type',
  'holiday_date','expense_no','line_user_id','line_connect_code','question','options','content','ai_summary','ai_modules','ai_quiz','ai_flashcards','ai_key_points','ai_checklist'
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
const CAPS = Object.freeze({
  admin: [
    'user.manage','setting.manage','audit.manage','leave.manage',
    'leave.view_all','leave.create_own','leave.cancel_own','leave.check','leave.comment','leave.approve','leave.delete',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_all','calendar.view_department','calendar.view_own',
    'mission.view_all','mission.view_department','mission.view_own','mission.create_own','mission.approve',
    'expense.manage','expense.create_own','schedule.view_all'
  ],
  approver: [
    'leave.view_all','leave.create_own','leave.cancel_own','leave.approve',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_all','calendar.view_department',
    'mission.view_all','mission.view_department','mission.view_own','mission.approve',
    'expense.manage','expense.create_own','setting.read','schedule.view_all'
  ],
  supervisor: [
    'leave.view_all','leave.create_own','leave.cancel_own','leave.comment','leave.adjust_quota',
    'report.view_all','report.view_own','file.upload',
    'calendar.view_department',
    'mission.view_department','mission.view_own','mission.create_own',
    'expense.create_own','setting.read','schedule.view_all'
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
  SICK:         'sick',
  PERSONAL:     'personal',
  MATERNITY:    'maternity',
  ANNUAL:       'annual',
  COMPENSATORY: 'compensatory',
  WORK_OFFDAY:  'work_offday'
});
const LEAVE_TYPE_LABEL = Object.freeze({
  sick:         'ลาป่วย',
  personal:     'ลากิจส่วนตัว',
  maternity:    'ลาพักร้อน',
  annual:       'ลาพักร้อน',
  compensatory: 'ลาหยุดชดเชย',
  work_offday:  'ทำงานในวันหยุด'
});
const ACTIVE_LEAVE_TYPES = Object.freeze(['sick','personal','annual','compensatory','work_offday']);
const STATUS = Object.freeze({
  DRAFT:     'draft',
  PENDING:   'pending',
  CHECKED:   'checked',
  REVIEWED:  'reviewed',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  CANCELLED: 'cancelled'
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

const DEFAULT_LIMITS = Object.freeze({
  sick:         30,
  personal:     6,
  maternity:    10,
  annual:       10,
  compensatory: 0,
  work_offday:  0
});

// ── Settings defaults ───────────────────────────────────────
const SETTINGS_DEFAULTS = Object.freeze({
  org_name:        'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด',
  org_address:     '555/63 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000',
  org_phone:       '0-2000-0000',
  org_email:       'hr@averintshop.com',
  limit_sick:      '30',
  limit_personal:  '6',
  limit_maternity: '10',
  limit_annual:    '10',
  limit_compensatory: '0',
  limit_work_offday:  '0',
  leave_workday_hours: '8',
  warn_threshold:  '80',
  show_demo_users: 'yes',
  session_hours:   '8',
  approval_stages: '3',
  line_channel_access_token: '',
  line_channel_secret: '',
  web_url: 'http://localhost:8000',
  email_from_alias: '',
  google_apps_script_url: '',
  google_gemini_api_key: '',
  openai_api_key: '',
  openai_generation_model: 'gpt-5.5',
  openai_embedding_model: 'text-embedding-3-small'
});
const SETTINGS_SENSITIVE = Object.freeze([]);

// ── Helpers ─────────────────────────────────────────────────
function cfg_localDate_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return new Date(d.getTime() + 7 * 60 * 60 * 1000);
}
function cfg_iso_(d) {
  if (!d) return '';
  var ld = cfg_localDate_(d);
  if (isNaN(ld.getTime())) return '';
  return ld.toISOString().slice(0, 19) + '+07:00';
}
function cfg_dateOnly_(d) {
  if (!d) return '';
  var ld = cfg_localDate_(d);
  if (isNaN(ld.getTime())) return '';
  return ld.toISOString().slice(0, 10);
}
function cfg_now_() { return new Date(); }
function cfg_uuid_() { return crypto.randomUUID(); }
function cfg_salt_() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
async function cfg_hash_(plain, salt) {
  var msg = new TextEncoder().encode(String(plain) + ':' + String(salt));
  var buf = await crypto.subtle.digest('SHA-256', msg);
  var binary = '';
  var bytes = new Uint8Array(buf);
  for (var i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  var base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function cfg_token_() {
  var arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  var raw = Array.from(arr).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  var msg = new TextEncoder().encode(raw + ':' + Date.now());
  var buf = await crypto.subtle.digest('SHA-256', msg);
  var binary = '';
  var bytes = new Uint8Array(buf);
  for (var i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  var base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _yes_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).toLowerCase().trim();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}
function cfg_fiscalYear_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) d = new Date();
  return d.getFullYear();
}
function cfg_fiscalYearBE_(d) {
  return cfg_fiscalYear_(d) + 543;
}
function cfg_getHolidaysMap_() {
  return GLOBAL_HOLIDAYS;
}
function cfg_daysBetween_(start, end) {
  try {
    var s = new Date(String(start).substring(0,10) + 'T00:00:00');
    var e = new Date(String(end).substring(0,10) + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    
    var holidays = cfg_getHolidaysMap_();
    var count = 0;
    var d = new Date(s.getTime());
    while (d.getTime() <= e.getTime()) {
      var dateStr = cfg_dateOnly_(d);
      var isHoliday = (dateStr in holidays);
      if (!isHoliday) {
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  } catch (err) { return 0; }
}
function cfg_esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function cfg_genLeaveNo_(d, seq) {
  if (!(d instanceof Date)) d = new Date(d);
  var yy = String(d.getFullYear()).substring(2);
  var mm = ('0' + (d.getMonth()+1)).slice(-2);
  var n  = ('0000' + Number(seq||0)).slice(-4);
  return 'LV' + yy + mm + n;
}
function cfg_genMissionNo_(d, seq) {
  if (!(d instanceof Date)) d = new Date(d);
  var yy = String(d.getFullYear()).substring(2);
  var mm = ('0' + (d.getMonth()+1)).slice(-2);
  var n  = ('0000' + Number(seq||0)).slice(-4);
  return 'MS' + yy + mm + n;
}
function hasCap_(role, cap) {
  if (cap === '*') return true;
  var arr = CAPS[role];
  if (!Array.isArray(arr) || !cap) return false;
  if (arr.indexOf(cap) >= 0) return true;
  if (/\.(view_own|edit_own|view_self|edit_self|create_own|cancel_own)$/.test(cap)) return false;
  var dot = cap.indexOf('.');
  if (dot > 0) {
    var prefix = cap.substring(0, dot);
    if (arr.indexOf(prefix + '.manage') >= 0) return true;
  }
  return false;
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
    if ((em - sm) % 30 !== 0) return { error: 'การลาเป็นชั่วโมงต้องเป็นจำนวนเต็มชั่วโมงหรือครึ่งชั่วโมง (เช่น 1.5, 2 ชั่วโมง)' };
    var hours = cfg_round2_((em - sm) / 60);
    if (hours < 0.5) return { error: 'การลาเป็นชั่วโมงต้องไม่น้อยกว่า 0.5 ชั่วโมง' };
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

// === SUPABASE DB LAYER ===
async function sbFetch(method, table, params, body) {
  var url = SUPABASE_URL + '/rest/v1/' + table;
  if (params) url += '?' + params;
  var opts = {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : (method === 'PATCH' ? 'return=representation' : '')
    }
  };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(url, opts);
  if (!r.ok) {
    var err = await r.json().catch(function(){ return {}; });
    throw new Error(err.message || err.hint || ('HTTP ' + r.status));
  }
  if (r.status === 204) return null;
  return r.json();
}

async function sbRpc(fn, body) {
  var url = SUPABASE_URL + '/rest/v1/rpc/' + fn;
  var r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) {
    var err = await r.json().catch(function(){ return {}; });
    throw new Error(err.message || err.hint || ('HTTP ' + r.status));
  }
  if (r.status === 204) return null;
  return r.json();
}

function _dbIdCol_(table) {
  if (table === 'Settings') return 'key';
  if (table === 'Sessions') return 'token';
  return 'id';
}

async function DB_warmCache() {
  var tables = ['Users', 'Leaves', 'Sessions', 'Settings', 'AuditLog', 'Missions', 'Expenses', 'Holidays', 'Checkins', 'Courses', 'Quizzes', 'UserProgress'];
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    var rows = await sbFetch('GET', t, 'select=*&limit=10000');
    DB_CACHE[t] = rows || [];
  }
}

function DB_readAll(table) {
  return DB_CACHE[table] || [];
}

function DB_findById(table, id) {
  var idCol = _dbIdCol_(table);
  var rows = DB_readAll(table);
  return rows.find(function(r) { return String(r[idCol]) === String(id); }) || null;
}

function DB_findOne(table, filterFn) {
  var rows = DB_readAll(table);
  return rows.find(filterFn) || null;
}

function DB_filter(table, filterFn) {
  var rows = DB_readAll(table);
  return rows.filter(filterFn);
}

function DB_buildIndex(table) {
  var rows = DB_readAll(table);
  var idx = {};
  var idCol = _dbIdCol_(table);
  rows.forEach(function(r) { idx[r[idCol]] = r; });
  return idx;
}

async function DB_insert(table, data) {
  var schema = SCHEMAS[table] || [];
  if (schema.indexOf('id') >= 0 && !data.id) {
    data.id = crypto.randomUUID();
  }
  if (schema.indexOf('created_at') >= 0 && !data.created_at) {
    data.created_at = new Date().toISOString();
  }
  if (schema.indexOf('updated_at') >= 0 && !data.updated_at) {
    data.updated_at = new Date().toISOString();
  }
  
  var rows = await sbFetch('POST', table, '', data);
  var inserted = Array.isArray(rows) ? rows[0] : rows;
  
  if (!DB_CACHE[table]) DB_CACHE[table] = [];
  DB_CACHE[table].push(inserted || data);
  
  return inserted || data;
}

async function DB_update(table, id, patch) {
  var schema = SCHEMAS[table] || [];
  if (schema.indexOf('updated_at') >= 0) {
    patch.updated_at = new Date().toISOString();
  }
  var idCol = _dbIdCol_(table);
  
  var rows = await sbFetch('PATCH', table, idCol + '=eq.' + encodeURIComponent(id), patch);
  var updated = Array.isArray(rows) ? rows[0] : rows;
  
  var cacheRows = DB_readAll(table);
  var row = cacheRows.find(function(r) { return String(r[idCol]) === String(id); });
  if (row) {
    Object.assign(row, updated || patch);
  }
  
  return updated || patch;
}

async function DB_delete(table, id) {
  var idCol = _dbIdCol_(table);
  await sbFetch('DELETE', table, idCol + '=eq.' + encodeURIComponent(id));
  if (DB_CACHE[table]) {
    DB_CACHE[table] = DB_CACHE[table].filter(function(r) { return String(r[idCol]) !== String(id); });
  }
  return { ok: true };
}

function DB_invalidate(name) {}

// === BACKEND LOGIC ===
function Auth_publicUser_(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username,
    full_name: u.full_name, position: u.position, level: u.level,
    department: u.department, role: u.role,
    email: u.email, phone: u.phone, avatar: u.avatar,
    is_active: u.is_active,
    line_user_id: u.line_user_id,
    line_connect_code: u.line_connect_code,
    branch: u.branch,
    off_day: u.off_day
  };
}

function Auth_requireCap(user, cap) {
  if (!user) throw new Error('ต้องเข้าสู่ระบบก่อน');
  if (!hasCap_(user.role, cap)) throw new Error('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้ (' + cap + ')');
  return true;
}

async function Auth_login(payload) {
  var username = String((payload && payload.username) || '').trim().toLowerCase();
  var password = String((payload && payload.password) || '');
  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  var u = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.username || '').toLowerCase() === username;
  });
  if (!u) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (String(u.is_active || '').toLowerCase().trim() === 'pending') throw new Error('บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคล — กรุณารอการแจ้งเตือน');
  if (!_yes_(u.is_active)) throw new Error('บัญชีนี้ถูกปิดการใช้งาน — โปรดติดต่อผู้ดูแลระบบ');
  var hash = await cfg_hash_(password, u.salt);
  if (hash !== u.password_hash) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  var hours = Number(_settingsRaw_('session_hours') || '8');
  if (!hours || hours < 1) hours = 8;
  var token = await cfg_token_();
  var now = cfg_now_();
  var expires = new Date(now.getTime() + hours * 3600 * 1000);
  await DB_insert(SHEETS.SESSIONS, {
    token: token,
    user_id: u.id,
    created_at: cfg_iso_(now),
    expires_at: cfg_iso_(expires),
    user_agent: String((payload && payload.user_agent) || '')
  });
  await Audit_log_(u, 'auth.login', 'session', token.substring(0, 8), {});
  return {
    token: token,
    user: Auth_publicUser_(u),
    caps: CAPS[u.role] || [],
    expires_at: cfg_iso_(expires)
  };
}

async function Auth_lineLogin(p) {
  var lineUserId = String(p && p.line_user_id || '').trim();
  if (!lineUserId) throw new Error('กรุณาระบุ LINE User ID');

  var u = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id || '').trim() === lineUserId;
  });
  if (!u) throw new Error('ไม่พบบัญชีผู้ใช้ที่เชื่อมต่อกับ LINE นี้');
  if (String(u.is_active || '').toLowerCase().trim() === 'pending') throw new Error('บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคล');
  if (!_yes_(u.is_active)) throw new Error('บัญชีนี้ถูกปิดการใช้งาน — โปรดติดต่อผู้ดูแลระบบ');

  var hours = Number(_settingsRaw_('session_hours') || '8');
  if (!hours || hours < 1) hours = 8;
  var token = await cfg_token_();
  var now = cfg_now_();
  var expires = new Date(now.getTime() + hours * 3600 * 1000);
  await DB_insert(SHEETS.SESSIONS, {
    token: token,
    user_id: u.id,
    created_at: cfg_iso_(now),
    expires_at: cfg_iso_(expires),
    user_agent: 'LINE_LIFF'
  });
  await Audit_log_(u, 'auth.line_login', 'session', token.substring(0, 8), {});

  return {
    token: token,
    user: Auth_publicUser_(u),
    caps: CAPS[u.role] || [],
    expires_at: cfg_iso_(expires)
  };
}

async function Auth_linkLine(user, p) {
  var lineUserId = String(p && p.line_user_id || '').trim();
  if (!lineUserId) throw new Error('กรุณาระบุ LINE User ID');

  var exists = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id || '').trim() === lineUserId && r.id !== user.id;
  });
  if (exists) throw new Error('LINE ID นี้ถูกเชื่อมต่อกับบัญชีอื่นแล้ว');

  await DB_update(SHEETS.USERS, user.id, {
    line_user_id: lineUserId
  });
  await Audit_log_(user, 'auth.link_line', 'user', user.id, { line_user_id: lineUserId });
  return { ok: true };
}

async function Auth_logout(token) {
  if (!token) return { ok: true };
  try {
    var sess = DB_findById(SHEETS.SESSIONS, token);
    if (sess) await DB_delete(SHEETS.SESSIONS, token);
  } catch (e) {}
  return { ok: true };
}

async function Auth_verify_(token) {
  if (!token) throw new Error('ต้องเข้าสู่ระบบก่อน');
  var sess = DB_findById(SHEETS.SESSIONS, token);
  if (!sess) throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  var exp = new Date(sess.expires_at);
  if (isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
    try { await DB_delete(SHEETS.SESSIONS, token); } catch (e) {}
    throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
  }
  var u = DB_findById(SHEETS.USERS, sess.user_id);
  if (!u) throw new Error('ไม่พบบัญชีผู้ใช้');
  if (!_yes_(u.is_active)) throw new Error('บัญชีถูกปิดการใช้งาน');
  return u;
}

async function Auth_changePassword(user, p) {
  Auth_requireCap(user, 'leave.create_own');
  var oldp = String((p && p.old_password) || '');
  var newp = String((p && p.new_password) || '');
  if (!oldp || !newp) throw new Error('กรอกรหัสผ่านเดิมและใหม่');
  if (newp.length < 6) throw new Error('รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร');
  var u = DB_findById(SHEETS.USERS, user.id);
  if (await cfg_hash_(oldp, u.salt) !== u.password_hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  var salt = cfg_salt_();
  await DB_update(SHEETS.USERS, user.id, {
    salt: salt, password_hash: await cfg_hash_(newp, salt)
  });
  await Audit_log_(user, 'auth.change_password', 'user', user.id, {});
  return { ok: true };
}

async function Auth_forgotPassword(p) {
  var email = String((p && p.email) || '').trim().toLowerCase();
  if (!email) throw new Error('กรุณากรอกอีเมล');
  var users = DB_readAll(SHEETS.USERS);
  
  var u = users.find(function (r) {
    return String(r.email || '').toLowerCase().trim() === email && _yes_(r.is_active);
  });
  
  if (!u) {
    var anyUser = users.find(function (r) {
      return String(r.email || '').toLowerCase().trim() === email;
    });
    if (!anyUser) throw new Error('ไม่พบอีเมลนี้ในระบบ');
    if (String(anyUser.is_active || '').toLowerCase().trim() === 'pending') {
      throw new Error('บัญชีของคุณอยู่ระหว่างรอการอนุมัติเข้าใช้งาน');
    }
    throw new Error('บัญชีผู้ใช้นี้ยังไม่เปิดใช้งาน หรือ ถูกระงับ');
  }
  
  var tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
  var salt = cfg_salt_();
  var passwordHash = await cfg_hash_(tempPassword, salt);
  
  await DB_update(SHEETS.USERS, u.id, {
    salt: salt,
    password_hash: passwordHash
  });
  
  await Audit_log_(u, 'auth.forgot_password', 'user', u.id, { email: email });
  
  var html = '<h2>รีเซ็ตรหัสผ่านชั่วคราวสำหรับ AvarinLMS</h2>'
    + '<p>เรียน คุณ ' + esc(u.full_name) + ',</p>'
    + '<p>คุณได้รับการรีเซ็ตรหัสผ่านสำหรับเข้าใช้งานระบบ AvarinLMS เรียบร้อยแล้ว:</p>'
    + '<div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0">'
    + '  <div style="font-size:12.5px;color:#64748b">ชื่อผู้ใช้ของคุณ:</div>'
    + '  <div style="font-size:16px;font-weight:bold;color:#0f172a;margin-bottom:8px">@' + esc(u.username) + '</div>'
    + '  <div style="font-size:12.5px;color:#64748b">รหัสผ่านชั่วคราวของคุณ:</div>'
    + '  <div style="font-size:24px;font-weight:bold;color:#6366f1;font-family:monospace;letter-spacing:1px">' + tempPassword + '</div>'
    + '</div>'
    + '<p><strong>คำแนะนำด้านความปลอดภัย:</strong> กรุณาเข้าสู่ระบบด้วยรหัสผ่านชั่วคราวนี้ และทำการเปลี่ยนรหัสผ่านใหม่ทันทีในเมนู "โปรไฟล์ของฉัน" หลังเข้าสู่ระบบแล้ว</p>'
    + '<p><a href="' + REQUEST_ORIGIN + '" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">เข้าสู่ระบบตอนนี้</a></p>'
    + '<hr><p style="font-size:12px;color:#888">นี่คือการแจ้งเตือนอัตโนมัติจากระบบ AvarinLMS</p>';
  
  await _sendEmail_(email, 'รหัสผ่านชั่วคราวสำหรับเข้าใช้ระบบ AvarinLMS', html);
  return { success: true };
}

async function Auth_bootstrap(token) {
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
      var u = await Auth_verify_(token);
      bundle.me = Auth_publicUser_(u);
      bundle.caps = CAPS[u.role] || [];
    } catch (e) {}
  }
  return bundle;
}

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

function Users_branchDirectory(user, p) {
  var users = DB_readAll(SHEETS.USERS).filter(function (u) {
    return String(u.is_active).toLowerCase() === 'yes';
  });
  var list = users.map(function (u) {
    return {
      id: u.id,
      full_name: u.full_name,
      username: u.username,
      position: u.position,
      department: u.department,
      branch: u.branch,
      email: u.email,
      phone: u.phone,
      avatar: u.avatar,
      role: u.role
    };
  });
  return { items: list };
}

function _getMonthlyCompensatoryQuota_(userId, year, month) {
  // คำนวณแบบ Carry-Over: สะสมตั้งแต่ต้นปีถึงเดือนที่กำหนด
  // วันหยุดที่ไม่ได้ใช้ในเดือนก่อนหน้าจะสะสมไปเดือนถัดไปโดยอัตโนมัติ
  var userObj = DB_findById(SHEETS.USERS, userId);
  var targetBranches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
  var isTargetUser = userObj && targetBranches.indexOf(userObj.branch) >= 0;
  
  // นับวันหยุดทั้งหมดตั้งแต่เดือน 1 ถึงเดือนที่ระบุ (cumulative)
  var holidaysTotal = 0;
  if (isTargetUser) {
    var holidaysMap = cfg_getHolidaysMap_();
    for (var m = 1; m <= month; m++) {
      var lastDayOfM = new Date(year, m, 0).getDate();
      for (var d = 1; d <= lastDayOfM; d++) {
        var dateObj = new Date(year, m - 1, d);
        var dateStr = Utilities.formatDate(dateObj, 'Asia/Bangkok', 'yyyy-MM-dd');
        if (dateStr in holidaysMap) {
          holidaysTotal++;
        }
      }
    }
  }
  
  // นับ work_offday ที่ทำตั้งแต่ต้นปีถึงเดือนที่ระบุ (cumulative earned)
  var workedOffdays = 0;
  // นับ compensatory ที่ใช้ตั้งแต่ต้นปีถึงเดือนที่ระบุ (cumulative used)
  var usedQuota = 0;
  var allLeaves = DB_readAll(SHEETS.LEAVES);
  
  // กำหนดช่วงเวลาตั้งแต่ 1 ม.ค. ถึงสิ้นเดือนที่ระบุ
  var periodStart = new Date(year, 0, 1).getTime();  // 1 Jan of year
  var periodEnd   = new Date(year, month, 0, 23, 59, 59, 999).getTime(); // end of target month
  
  allLeaves.forEach(function (lv) {
    if (String(lv.requester_id) !== String(userId)) return;
    if (lv.status !== STATUS.APPROVED) return;
    var lvTime = new Date(lv.start_date).getTime();
    if (isNaN(lvTime) || lvTime < periodStart || lvTime > periodEnd) return;
    if (lv.leave_type === 'work_offday') {
      workedOffdays += Number(lv.days || 1);
    } else if (lv.leave_type === 'compensatory') {
      usedQuota += Number(lv.days || 1);
    }
  });
  
  var adjKey = 'quota_adj_' + userId + '_compensatory_' + year;
  var adjustedQuota = Number(_settingsRaw_(adjKey) || 0);
  
  // ยอดรวมสะสม (holidays ถึงเดือนนี้ + worked_offday + manual adj)
  var totalQuota = holidaysTotal + workedOffdays + adjustedQuota;
  var remainingQuota = Math.max(0, totalQuota - usedQuota);
  
  return {
    holidays_quota: holidaysTotal,   // วันหยุดสะสมถึงเดือนนี้
    worked_offdays: workedOffdays,
    adjusted_quota: adjustedQuota,
    total_quota: totalQuota,
    used_quota: usedQuota,
    remaining_quota: remainingQuota
  };
}

function _checkBranchLeaveConflict_(userId, startISO, endISO, excludeLeaveId) {
  var targetBranches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
  var userObj = DB_findById(SHEETS.USERS, userId);
  if (!userObj || targetBranches.indexOf(userObj.branch) < 0) return null; // not in target branch
  
  var branch = userObj.branch;
  var reqStart = new Date(startISO + 'T00:00:00+07:00').getTime();
  var reqEnd   = new Date(endISO + 'T23:59:59+07:00').getTime();
  
  // Find all active users in the same branch
  var branchUsers = DB_readAll(SHEETS.USERS).filter(function(u) {
    return u.branch === branch && String(u.id) !== String(userId) && String(u.is_active).toLowerCase() === 'yes';
  });
  var branchUserIds = branchUsers.map(function(u) { return String(u.id); });
  if (branchUserIds.length === 0) return null;
  
  // Check for overlapping leaves among branch users
  var conflictingStatuses = [STATUS.PENDING, STATUS.CHECKED, STATUS.REVIEWED, STATUS.APPROVED];
  var conflicts = DB_readAll(SHEETS.LEAVES).filter(function(lv) {
    if (excludeLeaveId && String(lv.id) === String(excludeLeaveId)) return false;
    if (branchUserIds.indexOf(String(lv.requester_id)) < 0) return false;
    if (conflictingStatuses.indexOf(lv.status) < 0) return false;
    
    // Skip if it's a work_offday leave (since it's working, not taking time off)
    if (lv.leave_type === 'work_offday') return false;
    
    var lvStart = new Date(lv.start_date + 'T00:00:00+07:00').getTime();
    var lvEnd   = new Date((lv.end_date || lv.start_date) + 'T23:59:59+07:00').getTime();
    return lvStart <= reqEnd && lvEnd >= reqStart; // overlap
  });
  
  if (conflicts.length > 0) {
    var names = conflicts.map(function(lv) {
      var u = DB_findById(SHEETS.USERS, lv.requester_id);
      return u ? u.full_name : 'พนักงาน';
    });
    // Remove duplicates
    var uniqueNames = [];
    names.forEach(function(n) {
      if (uniqueNames.indexOf(n) < 0) uniqueNames.push(n);
    });
    return 'สาขา' + branch + ' มีพนักงานลาในวันที่ขอแล้ว: ' + uniqueNames.join(', ');
  }
  return null;
}

function Schedule_monthly(user, p) {
  var year = Number(p && p.year) || new Date().getFullYear();
  var month = Number(p && p.month) || (new Date().getMonth() + 1);

  var allUsers = DB_readAll(SHEETS.USERS).filter(function (u) {
    return String(u.is_active).toLowerCase() === 'yes';
  });

  var branches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
  var targetUsers = allUsers.filter(function (u) {
    return branches.indexOf(u.branch) >= 0;
  });

  var leaves = DB_readAll(SHEETS.LEAVES).filter(function (lv) {
    if (lv.status !== STATUS.APPROVED) return false;
    var requesterId = String(lv.requester_id);
    var isTargetUser = targetUsers.some(function (u) { return String(u.id) === requesterId; });
    if (!isTargetUser) return false;
    
    var startOfMonth = new Date(year, month - 1, 1).getTime();
    var endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();
    var lvStart = new Date(lv.start_date).getTime();
    var lvEnd = new Date(lv.end_date || lv.start_date).getTime();
    
    return lvStart <= endOfMonth && lvEnd >= startOfMonth;
  });

  var lastDay = new Date(year, month, 0).getDate();

  // Calculate monthly quota for each target user
  var quotas = {};
  targetUsers.forEach(function (u) {
    quotas[u.id] = _getMonthlyCompensatoryQuota_(u.id, year, month);
  });

  // Fetch overrides from Settings
  var overrides = DB_readAll(SHEETS.SETTINGS).filter(function (s) {
    return s.key.indexOf('sched_override_') === 0;
  });
  var overrideMap = {};
  overrides.forEach(function (s) {
    overrideMap[s.key] = s.value;
  });

  var dates = [];
  
  for (var d = 1; d <= lastDay; d++) {
    var dateObj = new Date(year, month - 1, d);
    var dateStr = Utilities.formatDate(dateObj, 'Asia/Bangkok', 'yyyy-MM-dd');
    var dayOfWeek = dateObj.getDay();
    
    var branchEmployees = [];
    var substitutePool = [];
    
    targetUsers.forEach(function (u) {
      var leaveInfo = null;
      var activeLeave = null;
      
      leaves.forEach(function (lv) {
        if (String(lv.requester_id) !== String(u.id)) return;
        var start = new Date(lv.start_date + 'T00:00:00+07:00').getTime();
        var end = new Date((lv.end_date || lv.start_date) + 'T23:59:59+07:00').getTime();
        var current = new Date(dateStr + 'T12:00:00+07:00').getTime();
        if (current >= start && current <= end) {
          activeLeave = lv;
          leaveInfo = { id: lv.id, leave_type: lv.leave_type, leave_no: lv.leave_no };
        }
      });
      
      var isOffDay = u.off_day !== null && u.off_day !== undefined && u.off_day !== '' && Number(u.off_day) === dayOfWeek;
      
      var overrideKey = 'sched_override_' + u.id + '_' + dateStr;
      var overrideVal = overrideMap[overrideKey] || '';
      
      var status = 'working';
      var subBranch = null;

      if (overrideVal === 'off_no_sub') {
        status = 'off_no_sub';
      } else if (overrideVal.indexOf('sub_') === 0) {
        status = 'substituting';
        subBranch = overrideVal.substring(4);
      } else if (activeLeave) {
        if (activeLeave.leave_type === 'work_offday') {
          status = 'working';
        } else {
          status = 'leave';
        }
      } else if (isOffDay) {
        status = 'off';
      }
      
      var empState = {
        id: u.id,
        full_name: u.full_name,
        position: u.position,
        department: u.department,
        branch: u.branch,
        off_day: u.off_day,
        status: status,
        leave_info: leaveInfo,
        substitute_by: null,
        substitute_branch: subBranch,
        override_value: overrideVal
      };
      
      if (u.branch === 'พนักงานแทน') {
        substitutePool.push(empState);
      } else {
        branchEmployees.push(empState);
      }
    });

    // 1. Process manual substitute assignments first
    substitutePool.forEach(function (sub) {
      if (sub.status === 'substituting' && sub.substitute_branch) {
        // Find a needy employee at the specified branch who is off/leave and has no substitute
        var match = branchEmployees.find(function (emp) {
          return emp.branch === sub.substitute_branch && (emp.status === 'off' || emp.status === 'leave') && !emp.substitute_by;
        });
        if (match) {
          match.substitute_by = { id: sub.id, full_name: sub.full_name };
          sub.substituting_for = { id: match.id, full_name: match.full_name, branch: match.branch };
        } else {
          sub.substituting_for = { id: null, full_name: 'สแตนด์บาย', branch: sub.substitute_branch };
        }
      }
    });

    // 2. Process automatic substitutions for remaining needy employees
    var needyEmployees = branchEmployees.filter(function (emp) {
      return (emp.status === 'off' || emp.status === 'leave') && !emp.substitute_by;
    });
    
    var availableSubstitutes = substitutePool.filter(function (sub) {
      return sub.status === 'working'; // working and no override
    });
    
    needyEmployees.forEach(function (emp) {
      if (availableSubstitutes.length > 0) {
        var sub = availableSubstitutes.shift();
        emp.substitute_by = { id: sub.id, full_name: sub.full_name };
        sub.status = 'substituting';
        sub.substituting_for = { id: emp.id, full_name: emp.full_name, branch: emp.branch };
      }
    });

    dates.push({
      date: dateStr,
      day_of_week: dayOfWeek,
      branch_employees: branchEmployees,
      substitutes: substitutePool
    });
  }

  return {
    year: year,
    month: month,
    dates: dates,
    quotas: quotas
  };
}

async function Schedule_saveOverride(user, p) {
  var isSalesSupervisor = user.role === 'supervisor' && (user.department === 'ฝ่ายขาย' || user.department === 'ฝ่ายปฏิบัติการ' || user.department === 'ฝ่ายขายและการตลาด');
  var isAdmin = user.role === 'admin';
  if (!isAdmin && !isSalesSupervisor) {
    throw new Error('คุณไม่มีสิทธิ์แก้ไขตารางงานของพนักงาน');
  }

  var targetUserId = String(p && p.user_id || '').trim();
  var dateStr = String(p && p.date || '').trim();
  var val = String(p && p.value || '').trim();

  if (!targetUserId) throw new Error('ไม่ระบุผู้ใช้');
  if (!dateStr) throw new Error('ไม่ระบุวันที่');

  var key = 'sched_override_' + targetUserId + '_' + dateStr;
  
  if (!val) {
    var existing = DB_findOne(SHEETS.SETTINGS, function (r) { return r.key === key; });
    if (existing) {
      await DB_delete(SHEETS.SETTINGS, existing.key);
    }
  } else {
    var existing = DB_findOne(SHEETS.SETTINGS, function (r) { return r.key === key; });
    if (existing) {
      await DB_update(SHEETS.SETTINGS, existing.key, { value: val });
    } else {
      await DB_insert(SHEETS.SETTINGS, { key: key, value: val });
    }
  }

  await Audit_log_(user, 'schedule.save_override', 'setting', targetUserId, { date: dateStr, value: val });

  return { ok: true };
}

async function Schedule_updateOffDay(user, p) {
  var isSalesSupervisor = user.role === 'supervisor' && (user.department === 'ฝ่ายขาย' || user.department === 'ฝ่ายปฏิบัติการ' || user.department === 'ฝ่ายขายและการตลาด');
  var isAdmin = user.role === 'admin';
  if (!isAdmin && !isSalesSupervisor) {
    throw new Error('คุณไม่มีสิทธิ์แก้ไขวันหยุดประจำของพนักงาน');
  }

  var targetUserId = String(p && p.user_id || '').trim();
  var offDay = p.off_day !== undefined ? String(p.off_day || '').trim() : '';

  if (!targetUserId) throw new Error('ไม่ระบุผู้ใช้');

  var targetUser = DB_findById(SHEETS.USERS, targetUserId);
  if (!targetUser) throw new Error('ไม่พบผู้ใช้');
  
  var targetBranches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
  if (targetBranches.indexOf(targetUser.branch) < 0) {
    throw new Error('พนักงานท่านนี้ไม่ได้อยู่สาขาที่กำหนดตารางงานได้');
  }

  var patch = { off_day: offDay };
  var updated = await DB_update(SHEETS.USERS, targetUserId, patch);
  await Audit_log_(user, 'schedule.update_off_day', 'user', targetUserId, { off_day: offDay });

  return { ok: true, user: Auth_publicUser_(updated) };
}

async function Users_upsert(user, p) {
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
      is_active: data.is_active === false ? 'no' : 'yes',
      branch: String(data.branch || '').trim(),
      off_day: data.off_day !== undefined ? String(data.off_day || '').trim() : undefined
    };
    if (data.password) {
      var salt = cfg_salt_();
      patch.salt = salt; patch.password_hash = await cfg_hash_(data.password, salt);
    }
    // Remove undefined fields
    Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete patch[k]; });
    var updated = await DB_update(SHEETS.USERS, data.id, patch);
    await Audit_log_(user, 'user.update', 'user', data.id, { fields: Object.keys(patch) });
    return Auth_publicUser_(updated);
  } else {
    var pwd = data.password || '123456';
    var salt2 = cfg_salt_();
    var newU = await DB_insert(SHEETS.USERS, {
      username: username,
      password_hash: await cfg_hash_(pwd, salt2),
      salt: salt2,
      full_name: String(data.full_name || '').trim(),
      position: String(data.position || '').trim(),
      level: String(data.level || '').trim(),
      department: String(data.department || '').trim(),
      role: data.role,
      email: String(data.email || '').trim(),
      phone: String(data.phone || '').trim(),
      avatar: String(data.avatar || '').trim(),
      is_active: data.is_active === false ? 'no' : 'yes',
      branch: String(data.branch || '').trim(),
      off_day: String(data.off_day || '').trim()
    });
    await Audit_log_(user, 'user.create', 'user', newU.id, { username: newU.username, role: newU.role });
    return Auth_publicUser_(newU);
  }
}

async function Users_delete(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id');
  if (String(id) === String(user.id)) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var hasLeaves = DB_readAll(SHEETS.LEAVES).some(function (lv) { return String(lv.requester_id) === String(id); });
  if (hasLeaves) {
    await DB_update(SHEETS.USERS, id, { is_active: 'no' });
    await Audit_log_(user, 'user.disable', 'user', id, { reason: 'has_leaves' });
    return { ok: true, mode: 'disabled' };
  }
  await DB_delete(SHEETS.USERS, id);
  await Audit_log_(user, 'user.delete', 'user', id, { username: u.username });
  return { ok: true, mode: 'deleted' };
}

async function Users_resetPassword(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  var pwd = String((p && p.new_password) || '123456');
  if (pwd.length < 6) throw new Error('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  var salt = cfg_salt_();
  await DB_update(SHEETS.USERS, id, {
    salt: salt, password_hash: await cfg_hash_(pwd, salt)
  });
  await Audit_log_(user, 'user.reset_password', 'user', id, { username: u.username });
  return { ok: true };
}

async function Users_updateProfile(user, p) {
  Auth_requireCap(user, 'leave.create_own');
  var data = p || {};
  var patch = {
    full_name: String(data.full_name || '').trim(),
    position: String(data.position || '').trim(),
    level: String(data.level || '').trim(),
    department: String(data.department || '').trim(),
    email: String(data.email || '').trim(),
    phone: String(data.phone || '').trim(),
    avatar: String(data.avatar || '').trim(),
    branch: String(data.branch || '').trim()
  };
  if (!patch.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  var updated = await DB_update(SHEETS.USERS, user.id, patch);
  await Audit_log_(user, 'user.update_profile', 'user', user.id, {});
  return Auth_publicUser_(updated);
}

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

async function Users_register(p) {
  var data = p || {};
  var username = String(data.username || '').toLowerCase().trim();
  if (!username) throw new Error('กรุณากรอกชื่อผู้ใช้ (username)');
  if (!/^[-a-z0-9_.]{3,30}$/.test(username)) throw new Error('username ใช้เฉพาะ a-z, 0-9, _ . - ความยาว 3-30');
  if (!data.full_name || !String(data.full_name).trim()) throw new Error('กรุณากรอกชื่อ-สกุล');

  var email = String(data.email || '').trim();
  if (!email) throw new Error('กรุณากรอกอีเมล');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');

  var phone = String(data.phone || '').trim();
  if (!phone) throw new Error('กรุณากรอกเบอร์โทรศัพท์');

  var pwd = String(data.password || '').trim();
  if (!pwd || pwd.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

  var existing = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.username || '').toLowerCase() === username;
  });
  if (existing) throw new Error('username "' + username + '" ถูกใช้แล้ว กรุณาเลือกชื่อผู้ใช้อื่น');

  var existingEmail = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.email || '').toLowerCase().trim() === email.toLowerCase();
  });
  if (existingEmail) throw new Error('อีเมลนี้ถูกใช้สมัครแล้ว กรุณาใช้อีเมลอื่น');

  var salt = cfg_salt_();
  var newU = await DB_insert(SHEETS.USERS, {
    username: username,
    password_hash: await cfg_hash_(pwd, salt),
    salt: salt,
    full_name: String(data.full_name || '').trim(),
    position: String(data.position || '').trim(),
    level: '',
    department: String(data.department || '').trim(),
    role: 'employee',
    email: email,
    phone: phone,
    avatar: '',
    is_active: 'pending'
  });

  try { Notify_onNewRegistration_(newU); } catch (e) {}

  return { ok: true, id: newU.id, username: newU.username };
}

function Users_listPending(user) {
  Auth_requireCap(user, 'user.manage');
  var rows = DB_readAll(SHEETS.USERS).filter(function (u) {
    return String(u.is_active || '').toLowerCase().trim() === 'pending';
  }).map(Auth_publicUser_);
  return { items: rows, total: rows.length };
}

async function Users_approveRegistration(user, p) {
  Auth_requireCap(user, 'user.manage');
  var id           = String((p && p.id)            || '').trim();
  var action       = String((p && p.action)        || '').trim();
  var role         = String((p && p.role)          || 'employee').trim();
  var rejectReason = String((p && p.reject_reason) || '').trim();
  if (!id) throw new Error('ระบุ id ของผู้ใช้');
  if (action !== 'approve' && action !== 'reject') throw new Error('action ต้องเป็น approve หรือ reject');
  var u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (String(u.is_active || '').toLowerCase().trim() !== 'pending') throw new Error('ผู้ใช้นี้ไม่ได้รออนุมัติ');

  if (action === 'approve') {
    if (!role || !ROLE_LABEL[role]) throw new Error('กรุณาเลือกบทบาทที่ถูกต้อง');
    var updated = await DB_update(SHEETS.USERS, id, { is_active: 'yes', role: role });
    await Audit_log_(user, 'user.approve_registration', 'user', id, { username: u.username, role: role });
    try { Notify_onRegistrationApproved_(u, role, user); } catch (e) {}
    return { ok: true, mode: 'approved', user: Auth_publicUser_(updated) };
  } else {
    var hasLeaves = DB_readAll(SHEETS.LEAVES).some(function (lv) { return String(lv.requester_id) === String(id); });
    if (hasLeaves) {
      await DB_update(SHEETS.USERS, id, { is_active: 'no' });
    } else {
      await DB_delete(SHEETS.USERS, id);
    }
    await Audit_log_(user, 'user.reject_registration', 'user', id, { username: u.username, reason: rejectReason });
    try { Notify_onRegistrationRejected_(u, rejectReason, user); } catch (e) {}
    return { ok: true, mode: 'rejected' };
  }
}

async function Users_getConnectCode(user) {
  Auth_requireCap(user, 'leave.create_own');
  var u = DB_findById(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  
  if (u.line_user_id) {
    return { connected: true, line_user_id: u.line_user_id };
  }
  
  var code = u.line_connect_code;
  if (!code) {
    var rand = Math.floor(100000 + Math.random() * 900000);
    code = 'LMS-' + rand;
    await DB_update(SHEETS.USERS, user.id, { line_connect_code: code });
    DB_invalidate(SHEETS.USERS);
  }
  
  return { connected: false, code: code };
}

async function Users_disconnectLine(user) {
  Auth_requireCap(user, 'leave.create_own');
  var u = DB_findById(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  
  await DB_update(SHEETS.USERS, user.id, {
    line_user_id: '',
    line_connect_code: ''
  });
  DB_invalidate(SHEETS.USERS);
  await Audit_log_(user, 'line.disconnect', 'user', user.id, {});
  return { ok: true };
}

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
    if (stages !== 3) out.push(STATUS.CHECKED);
  }
  var seen = {}; var result = [];
  out.forEach(function (s) { if (!seen[s]) { seen[s] = 1; result.push(s); } });
  return result;
}

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
    var baseLimit = _leaveLimit_(t);
    
    if (t === 'compensatory') {
      // ใช้โควตาสะสม (carry-over) ผ่าน _getMonthlyCompensatoryQuota_
      // โดยคำนวณถึงเดือนปัจจุบัน เพื่อรวมวันหยุดสะสมที่ยังไม่ได้ใช้จากเดือนก่อนหน้า
      var now = cfg_now_();
      var curYear = now.getFullYear();
      var curMonth = now.getMonth() + 1;
      // ถ้าปีงบประมาณที่ดูไม่ใช่ปีปัจจุบัน ให้ดูถึงเดือน 12
      var upToMonth = (fy === curYear) ? curMonth : 12;
      var cq = _getMonthlyCompensatoryQuota_(userId, fy, upToMonth);
      // ยอด limit = total_quota (ยังไม่หักที่ใช้) = holidays + worked + adj
      baseLimit = cq.holidays_quota + cq.worked_offdays + cq.adjusted_quota;
      // Override used ด้วยค่าที่ _getMonthlyCompensatoryQuota_ คำนวณไว้ (cumulative)
      // เพื่อป้องกันการนับซ้ำ เราจะตั้งค่าใหม่ใน stats ด้านล่าง
      used = cq.used_quota;
    }
    
    if (t !== 'compensatory') {
      var adjKey = 'quota_adj_' + userId + '_' + t + '_' + fy;
      var adj = Number(_settingsRaw_(adjKey) || 0);
      var limit = Math.max(0, baseLimit + adj);
      stats[t] = {
        base_limit: baseLimit,
        adjustment: adj,
        used: used,
        limit: limit,
        remaining: Math.max(0, limit - used),
        percent: limit > 0 ? Math.round(used * 100 / limit) : 0
      };
    } else {
      // compensatory: limit และ used มาจาก _getMonthlyCompensatoryQuota_ แบบ carry-over
      var limit = Math.max(0, baseLimit);
      stats[t] = {
        base_limit: baseLimit,
        adjustment: 0,
        used: used,
        limit: limit,
        remaining: Math.max(0, limit - used),
        percent: limit > 0 ? Math.round(used * 100 / limit) : 0
      };
    }
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

function Leaves_all_users_quotas(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var fy = (p && p.fiscal_year) ? Number(p.fiscal_year) : cfg_fiscalYear_(cfg_now_());
  var users = DB_readAll(SHEETS.USERS).filter(function (u) {
    return String(u.is_active).toLowerCase() === 'yes';
  });
  var result = users.map(function (u) {
    var stats = _leaveStats_(u.id, fy);
    return {
      id: u.id,
      full_name: u.full_name,
      department: u.department,
      position: u.position,
      quota_stats: stats
    };
  });
  return { fiscal_year: fy, users: result };
}

async function Leaves_adjust_quota(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var targetUserId = String(p.user_id || '').trim();
  var leaveType = String(p.leave_type || '').trim();
  var fy = Number(p.fiscal_year || cfg_fiscalYear_(cfg_now_()));
  var adjustment = Number(p.adjustment || 0);
  
  if (!targetUserId) throw new Error('ไม่ระบุผู้ใช้');
  if (ACTIVE_LEAVE_TYPES.indexOf(leaveType) < 0) throw new Error('ประเภทการลาไม่ถูกต้อง');
  
  var adjKey = 'quota_adj_' + targetUserId + '_' + leaveType + '_' + fy;
  
  var existing = DB_findOne(SHEETS.SETTINGS, function (r) {
    return String(r.key) === adjKey;
  });
  
  if (existing) {
    await DB_update(SHEETS.SETTINGS, existing.key, { value: String(adjustment) });
  } else {
    await DB_insert(SHEETS.SETTINGS, { key: adjKey, value: String(adjustment) });
  }
  
  await Audit_log_(user, 'leave.adjust_quota', 'user', targetUserId, { leave_type: leaveType, fiscal_year: fy, adjustment: adjustment });
  return { ok: true, key: adjKey, adjustment: adjustment };
}

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

async function Leaves_create(user, p) {
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

  var isSalesSupervisor = user.role === 'supervisor' && (user.department === 'ฝ่ายขาย' || user.department === 'ฝ่ายปฏิบัติการ' || user.department === 'ฝ่ายขายและการตลาด');
  var isAdmin = user.role === 'admin';
  var reqUserId = user.id;
  var targetStatus = data.draft ? STATUS.DRAFT : STATUS.PENDING;

  if (data.requester_id && String(data.requester_id) !== String(user.id)) {
    if (!isAdmin && !isSalesSupervisor) {
      throw new Error('คุณไม่มีสิทธิ์สร้างใบลาแทนผู้อื่น');
    }
    var targetUser = DB_findById(SHEETS.USERS, data.requester_id);
    if (!targetUser) throw new Error('ไม่พบข้อมูลพนักงาน');
    if (isSalesSupervisor) {
      var allowedBranches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
      if (allowedBranches.indexOf(targetUser.branch) < 0 || (targetUser.department !== 'ฝ่ายขาย' && targetUser.department !== 'ฝ่ายปฏิบัติการ' && targetUser.department !== 'ฝ่ายขายและการตลาด')) {
        throw new Error('คุณไม่มีสิทธิ์จัดการข้อมูลพนักงานนอกเหนือจากฝ่ายขายสาขาที่รับผิดชอบ');
      }
    }
    reqUserId = String(data.requester_id);
  }

  if (data.status === STATUS.APPROVED && (isAdmin || isSalesSupervisor)) {
    targetStatus = STATUS.APPROVED;
  }

  var stats = _leaveStats_(reqUserId, fy);
  var s = stats.items[data.leave_type];
  var afterUsed = s.used + days;
  var over = (s.limit > 0) && (afterUsed > s.limit);

  if (data.leave_type === 'compensatory') {
    var lvDate = new Date(startISO);
    var q = _getMonthlyCompensatoryQuota_(reqUserId, lvDate.getFullYear(), lvDate.getMonth() + 1);
    if (days > q.remaining_quota) {
      throw new Error('โควตาหยุดชดเชยไม่เพียงพอสำหรับเดือนนี้ (คงเหลือ ' + q.remaining_quota + ' วัน, ขอใช้ ' + days + ' วัน)');
    }
  }

  if (targetStatus !== STATUS.DRAFT && data.leave_type !== 'work_offday') {
    var conflict = _checkBranchLeaveConflict_(reqUserId, startISO, endISO, null);
    if (conflict) throw new Error(conflict);
  }

  var last = _findLastLeave_(reqUserId, startISO);
  var leaveNo = _genLeaveNo_();

  var targetUserObj = (reqUserId === user.id) ? user : DB_findById(SHEETS.USERS, reqUserId);
  var contactPhone = String(data.contact_phone || (targetUserObj && targetUserObj.phone) || '').trim();

  var newLv = await DB_insert(SHEETS.LEAVES, {
    leave_no: leaveNo,
    requester_id: reqUserId,
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
    contact_phone: contactPhone,
    last_leave_type: last ? last.leave_type : null,
    last_leave_start: last ? last.start_date : null,
    last_leave_end: last ? last.end_date : null,
    last_leave_days: last ? Number(last.days || 0) : null,
    status: targetStatus,
    written_at: writtenAt,
    written_place: String(data.written_place || '').trim(),
    fiscal_year: fy,
    attachment_url: String(data.attachment_url || '').trim()
  });
  await Audit_log_(user, 'leave.create', 'leave', newLv.id, {
    leave_no: leaveNo, type: data.leave_type, days: days, status: targetStatus, over_limit: over
  });
  if (targetStatus === STATUS.PENDING) {
    Notify_onLeaveSubmit_(newLv, user);
  }
  return { leave: newLv, over_limit: over, after_used: afterUsed, limit: s.limit };
}

async function Leaves_update(user, p) {
  var data = p || {};
  if (!data.id) throw new Error('ระบุ id ของใบลา');
  var lv = DB_findById(SHEETS.LEAVES, data.id);
  if (!lv) throw new Error('ไม่พบใบลา');
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

  var finalStart = patch.start_date || lv.start_date;
  var finalEnd = patch.end_date || lv.end_date || lv.start_date;
  var finalType = patch.leave_type || lv.leave_type;
  if (lv.status !== STATUS.DRAFT && finalType !== 'work_offday') {
    var conflict = _checkBranchLeaveConflict_(lv.requester_id, finalStart, finalEnd, lv.id);
    if (conflict) throw new Error(conflict);
  }

  var updated = await DB_update(SHEETS.LEAVES, data.id, patch);
  await Audit_log_(user, 'leave.update', 'leave', lv.id, { fields: Object.keys(patch) });
  return updated;
}

async function Leaves_submit(user, p) {
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) Auth_requireCap(user, 'leave.manage');
  if (lv.status !== STATUS.DRAFT) throw new Error('ใบลานี้ไม่ใช่ฉบับร่าง');

  if (lv.leave_type !== 'work_offday') {
    var conflict = _checkBranchLeaveConflict_(lv.requester_id, lv.start_date, lv.end_date || lv.start_date, lv.id);
    if (conflict) throw new Error(conflict);
  }

  var updated = await DB_update(SHEETS.LEAVES, lv.id, { status: STATUS.PENDING });
  await Audit_log_(user, 'leave.submit', 'leave', lv.id, {});
  Notify_onLeaveSubmit_(updated, user);
  return updated;
}

async function Leaves_cancel(user, p) {
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) Auth_requireCap(user, 'leave.manage');
  if (lv.status === STATUS.APPROVED) throw new Error('ใบลาที่อนุมัติแล้วไม่สามารถยกเลิกได้ (โปรดติดต่อ admin)');
  if (lv.status === STATUS.CANCELLED || lv.status === STATUS.REJECTED) throw new Error('ใบลานี้ถูกยกเลิก/ปฏิเสธไปแล้ว');
  var updated = await DB_update(SHEETS.LEAVES, lv.id, { status: STATUS.CANCELLED });
  await Audit_log_(user, 'leave.cancel', 'leave', lv.id, {});
  return updated;
}

async function Leaves_check(user, p) {
  Auth_requireCap(user, 'leave.check');
  var stages = _stages_();
  if (stages < 3) throw new Error('ระบบไม่ได้เปิดขั้นตอนตรวจสอบ (กำหนดเป็น ' + stages + ' ขั้น)');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (lv.status !== STATUS.PENDING) throw new Error('ใบลานี้ไม่อยู่ในสถานะรอตรวจสอบ');
  var updated = await DB_update(SHEETS.LEAVES, lv.id, {
    status: STATUS.CHECKED,
    checker_id: user.id,
    checker_comment: String((p && p.comment) || '').trim(),
    checker_at: cfg_iso_(cfg_now_())
  });
  await Audit_log_(user, 'leave.check', 'leave', lv.id, {});

  var requesterUser = DB_findById(SHEETS.USERS, lv.requester_id);
  if (requesterUser) {
    try {
      Notify_onLeaveChecked_(updated, requesterUser, user);
    } catch (err) {
      console.error('Notify_onLeaveChecked_ error: ' + err.message);
    }
  }
  return updated;
}

async function Leaves_comment(user, p) {
  Auth_requireCap(user, 'leave.comment');
  var stages = _stages_();
  if (stages < 2) throw new Error('ระบบไม่ได้เปิดขั้นตอนความเห็นผู้บังคับบัญชา (กำหนดเป็น ' + stages + ' ขั้น)');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');

  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    var requester = DB_findById(SHEETS.USERS, lv.requester_id);
    if (!requester || requester.department !== user.department) {
      throw new Error('คุณไม่มีสิทธิ์ลงความเห็นใบลาของแผนกอื่น');
    }
  }

  var ok = (lv.status === STATUS.CHECKED) || (stages === 2 && lv.status === STATUS.PENDING);
  if (!ok) throw new Error('ใบลานี้ไม่อยู่ในสถานะที่ให้ความเห็นได้');
  var updated = await DB_update(SHEETS.LEAVES, lv.id, {
    status: STATUS.REVIEWED,
    supervisor_id: user.id,
    supervisor_comment: String((p && p.comment) || '').trim(),
    supervisor_at: cfg_iso_(cfg_now_())
  });
  await Audit_log_(user, 'leave.comment', 'leave', lv.id, {});

  var requesterUser = DB_findById(SHEETS.USERS, lv.requester_id);
  if (requesterUser) {
    try {
      Notify_onLeaveCommented_(updated, requesterUser, user);
    } catch (err) {
      console.error('Notify_onLeaveCommented_ error: ' + err.message);
    }
  }
  return updated;
}

async function Leaves_approve(user, p) {
  Auth_requireCap(user, 'leave.approve');
  var stages = _stages_();
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  var ok = false;
  if (stages === 1) ok = (lv.status === STATUS.PENDING);
  else if (stages === 2) ok = (lv.status === STATUS.REVIEWED || lv.status === STATUS.PENDING || lv.status === STATUS.CHECKED);
  else ok = (lv.status === STATUS.REVIEWED || lv.status === STATUS.CHECKED);
  if (!ok) throw new Error('ใบลานี้ไม่อยู่ในสถานะที่อนุมัติได้');
  var decision = String((p && p.decision) || 'approved');
  var newStatus = (decision === 'rejected') ? STATUS.REJECTED : STATUS.APPROVED;
  var updated = await DB_update(SHEETS.LEAVES, lv.id, {
    status: newStatus,
    approver_id: user.id,
    approver_decision: decision,
    approver_comment: String((p && p.comment) || '').trim(),
    approver_at: cfg_iso_(cfg_now_())
  });
  await Audit_log_(user, 'leave.' + decision, 'leave', lv.id, {});
  var requesterUser = DB_findById(SHEETS.USERS, lv.requester_id);

  if (newStatus === STATUS.APPROVED) {
    Notify_onLeaveApproved_(updated, requesterUser, user);
  }

  if (requesterUser) {
    try {
      Notify_onLeaveResultToRequester_(updated, requesterUser, user);
    } catch (err) {
      console.error('Notify_onLeaveResultToRequester_ error: ' + err.message);
    }
  }
  return updated;
}

async function Leaves_delete(user, p) {
  var isSalesSupervisor = user.role === 'supervisor' && (user.department === 'ฝ่ายขาย' || user.department === 'ฝ่ายปฏิบัติการ' || user.department === 'ฝ่ายขายและการตลาด');
  var isAdmin = user.role === 'admin';
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  
  var allowed = false;
  if (isAdmin) {
    allowed = true;
  } else if (isSalesSupervisor) {
    var targetUser = DB_findById(SHEETS.USERS, lv.requester_id);
    var allowedBranches = ['ราชพฤกษ์', 'ปอโต', 'วิรันด้า', 'พนักงานแทน'];
    if (targetUser && 
        (targetUser.department === 'ฝ่ายขาย' || targetUser.department === 'ฝ่ายปฏิบัติการ' || targetUser.department === 'ฝ่ายขายและการตลาด') && 
        allowedBranches.indexOf(targetUser.branch) >= 0 && 
        (lv.leave_type === 'work_offday' || lv.leave_type === 'compensatory')) {
      allowed = true;
    }
  } else {
    try {
      Auth_requireCap(user, 'leave.delete');
      allowed = true;
    } catch (e) {
      allowed = false;
    }
  }
  
  if (!allowed) {
    throw new Error('คุณไม่มีสิทธิ์ลบใบลาใบนี้');
  }
  
  await DB_delete(SHEETS.LEAVES, lv.id);
  await Audit_log_(user, 'leave.delete', 'leave', lv.id, { leave_no: lv.leave_no });
  return { ok: true };
}

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
  var scope = String(data.scope || 'mine');
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    return r.leave_type !== 'compensatory' && r.leave_type !== 'work_offday';
  });
  var users = DB_buildIndex(SHEETS.USERS);

  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    rows = rows.filter(function (r) {
      if (String(r.requester_id) === String(user.id)) return true;
      var reqUser = users[r.requester_id];
      return reqUser && reqUser.department === user.department;
    });
  }

  if (scope === 'mine') {
    rows = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  } else if (scope === 'all') {
    Auth_requireCap(user, 'leave.view_all');
  } else if (scope === 'pending_action') {
    var inboxStatuses = _inboxStatusesFor_(user.role);
    if (inboxStatuses.length === 0) rows = [];
    else rows = rows.filter(function (r) { return inboxStatuses.indexOf(r.status) >= 0; });
  }
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

  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

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
  var users = DB_buildIndex(SHEETS.USERS);
  if (String(lv.requester_id) !== String(user.id)) {
    if (!hasCap_(user.role, 'leave.view_all')) throw new Error('คุณไม่มีสิทธิ์ดูใบลาของผู้อื่น');
    var requester = users[lv.requester_id];
    var isSameDept = requester && requester.department === user.department;
    var canViewAll = user.role === 'admin' || user.role === 'approver' || user.role === 'checker';
    if (!canViewAll && !isSameDept) {
      throw new Error('คุณไม่มีสิทธิ์ดูใบลาของแผนกอื่น');
    }
  }
  var settings = Settings_get_public_();
  return {
    leave: _enrichLeave_(lv, users),
    org: { name: settings.org_name, address: settings.org_address, phone: settings.org_phone, email: settings.org_email }
  };
}

function Leaves_workflow_counts(user) {
  Auth_requireCap(user, 'leave.view_all');
  var rows = DB_readAll(SHEETS.LEAVES);
  var by = {};
  Object.keys(STATUS_LABEL).forEach(function (s) { by[s] = 0; });
  rows.forEach(function (r) { if (by[r.status] != null) by[r.status]++; });
  return { total: rows.length, by_status: by };
}

function Reports_overview(user, p) {
  Auth_requireCap(user, 'report.view_all');
  var fy = Number((p && p.fiscal_year) || cfg_fiscalYear_(cfg_now_()));
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) { return Number(r.fiscal_year) === fy; });
  var users = DB_buildIndex(SHEETS.USERS);

  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    rows = rows.filter(function (r) {
      if (String(r.requester_id) === String(user.id)) return true;
      var reqUser = users[r.requester_id];
      return reqUser && reqUser.department === user.department;
    });
  }

  var by_status = {};
  var by_type = {};
  var by_dept = {};
  var by_month = {};
  var byUser = {};

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

  var topUsers = Object.keys(byUser).map(function (uid) {
    var u = users[uid] || {};
    return Object.assign({
      full_name: u.full_name, position: u.position, department: u.department, role: u.role, avatar: u.avatar
    }, byUser[uid]);
  }).sort(function (a, b) { return b.total_days - a.total_days; }).slice(0, 20);

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
  if (uid !== String(user.id) && user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    var targetUser = DB_findById(SHEETS.USERS, uid);
    if (targetUser && targetUser.department !== user.department) {
      throw new Error('คุณไม่มีสิทธิ์ดูรายงานของแผนกอื่น');
    }
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
  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    rows = rows.filter(function (u) { return u.department === user.department; });
  }
  return {
    items: rows.map(function (u) {
      return { id: u.id, full_name: u.full_name, position: u.position, department: u.department, role: u.role };
    })
  };
}

function Dashboard_data(user) {
  var fy = cfg_fiscalYear_(cfg_now_());
  var myStats = _leaveStats_(user.id, fy);
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    return r.leave_type !== 'compensatory' && r.leave_type !== 'work_offday';
  });
  var users = DB_buildIndex(SHEETS.USERS);

  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'checker') {
    rows = rows.filter(function (r) {
      if (String(r.requester_id) === String(user.id)) return true;
      var reqUser = users[r.requester_id];
      return reqUser && reqUser.department === user.department;
    });
  }

  var data = {
    fiscal_year: fy, fiscal_year_be: fy + 543,
    me: { stats: myStats, recent: [] },
    pending_for_me: 0,
    by_status: {},
    recent_all: [],
    warn_threshold: _leaveWarnThreshold_()
  };

  var mine = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  mine.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  data.me.recent = mine.slice(0, 8).map(function (r) { return _enrichLeave_(r, users); });

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

async function Settings_ensureDefaults_() {
  var map = GLOBAL_SETTINGS;
  var keys = Object.keys(SETTINGS_DEFAULTS);
  var toAdd = [];
  keys.forEach(function (k) {
    if (!(k in map)) toAdd.push({ key: k, value: SETTINGS_DEFAULTS[k] });
  });
  for (var i = 0; i < toAdd.length; i++) {
    var item = toAdd[i];
    await DB_insert('Settings', { key: item.key, value: item.value });
    GLOBAL_SETTINGS[item.key] = String(item.value);
  }
}

function Settings_get_public_() {
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
  var map = _settingsMap_();
  if (hasCap_(user.role, 'setting.manage')) {
    var all = {};
    Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { all[k] = (k in map) ? map[k] : SETTINGS_DEFAULTS[k]; });
    return all;
  }
  return Settings_get_public_();
}

async function Settings_update(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var changed = [];
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!(k in SETTINGS_DEFAULTS)) continue;
    var val = String(data[k] == null ? '' : data[k]);
    var existing = DB_findOne(SHEETS.SETTINGS, function (r) { return String(r.key) === k; });
    if (existing) {
      await DB_update(SHEETS.SETTINGS, existing.key, { value: val });
    } else {
      await DB_insert(SHEETS.SETTINGS, { key: k, value: val });
    }
    changed.push(k);
  }
  await Audit_log_(user, 'setting.update', 'setting', '', { keys: changed });
  return { ok: true, changed: changed };
}

async function Audit_log_(user, action, entity, entityId, meta) {
  try {
    await DB_insert(SHEETS.AUDIT, {
      user_id: (user && user.id) || '',
      action: String(action || ''),
      entity: String(entity || ''),
      entity_id: String(entityId || ''),
      meta: meta ? JSON.stringify(meta) : ''
    });
  } catch (e) {}
}

function Audit_list(user, p) {
  Auth_requireCap(user, 'audit.manage');
  var data = p || {};
  var rows = DB_readAll(SHEETS.AUDIT);
  var users = DB_buildIndex(SHEETS.USERS);
  if (data.user_id) rows = rows.filter(function (r) { return String(r.user_id) === String(data.user_id); });
  if (data.action) rows = rows.filter(function (r) { return r.action.indexOf(data.action) === 0; });
  if (data.entity) rows = rows.filter(function (r) { return r.entity === data.entity; });
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  var page = Math.max(1, Number(data.page || 1));
  var per = Math.min(200, Math.max(10, Number(data.per_page || 50)));
  var total = rows.length;
  var slice = rows.slice((page-1)*per, page*per).map(function (r) {
    var u = users[r.user_id] || {};
    return {
      id: r.id, user_id: r.user_id,
      user_name: u.full_name || '(ระบบ)',
      action: r.action, entity: r.entity, entity_id: r.entity_id,
      meta: r.meta, created_at: r.created_at
    };
  });
  return { items: slice, total: total, page: page, per_page: per, pages: Math.ceil(total/per) };
}

// === SEED DATA LOGIC ===
const DEMO_PASSWORD = '123456';
const DEMO_USERS = Object.freeze([
  { username: 'admin',      role: 'admin',      full_name: 'นายผู้ดูแล ระบบ',           position: 'ผู้ดูแลระบบ',         level: '-',         department: 'ฝ่ายเทคโนโลยีสารสนเทศ',  email: 'admin@averintgroup.com',      phone: '0801111111' },
  { username: 'hrmanager',  role: 'approver',   full_name: 'นางสาวฝ่ายบุคคล อนุมัติใจ',  position: 'ผู้จัดการฝ่ายบุคคล',   level: 'ผู้จัดการ', department: 'ฝ่ายทรัพยากรบุคคล',    email: 'hr@averintgroup.com',         phone: '0802222222' },
  { username: 'supervisor', role: 'supervisor', full_name: 'นายหัวหน้า ทีมงาน',           position: 'หัวหน้างาน',           level: 'หัวหน้างาน',department: 'ฝ่ายปฏิบัติการ',        email: 'supervisor@averintgroup.com', phone: '0803333333' },
  { username: 'checker',    role: 'checker',    full_name: 'นางสาวธุรการ ตรวจสอบ',        position: 'เจ้าหน้าที่ธุรการ',    level: 'พนักงาน',   department: 'ฝ่ายธุรการ',            email: 'checker@averintgroup.com',    phone: '0804444444' },
  { username: 'employee1',  role: 'employee',   full_name: 'นางสาวพนักงาน ตัวอย่าง',      position: 'พนักงานขาย',           level: 'พนักงาน',   department: 'ฝ่ายขายและการตลาด',     email: 'employee1@averintgroup.com',  phone: '0805555555' },
  { username: 'employee2',  role: 'employee',   full_name: 'นายพนักงาน บัญชีดี',          position: 'นักบัญชี',             level: 'พนักงาน',   department: 'ฝ่ายการเงินและบัญชี',   email: 'employee2@averintgroup.com',  phone: '0806666666' }
]);

async function Seed_ensureUsers_() {
  var created = 0;
  for (var i = 0; i < DEMO_USERS.length; i++) {
    var u = DEMO_USERS[i];
    var exists = DB_findOne(SHEETS.USERS, function (x) { return String(x.username || '').toLowerCase() === u.username; });
    if (exists) continue;
    var salt = cfg_salt_();
    await DB_insert(SHEETS.USERS, {
      username: u.username,
      password_hash: await cfg_hash_(DEMO_PASSWORD, salt),
      salt: salt,
      full_name: u.full_name,
      position: u.position,
      level: u.level,
      department: u.department,
      role: u.role,
      email: u.email,
      phone: u.phone,
      avatar: '',
      is_active: 'yes'
    });
    created++;
  }
  return created;
}

async function Seed_demoLeaves_() {
  var users = DB_readAll(SHEETS.USERS);
  if (users.length === 0) return 0;
  var employees = users.filter(function (u) { return u.role === 'employee' || u.role === 'supervisor'; });
  if (employees.length === 0) return 0;
  var samples = [
    { type: 'sick',     reason: 'ไข้หวัดใหญ่ มีไข้สูง พักรักษาตัวที่บ้าน', days: 2 },
    { type: 'personal', reason: 'ติดต่อธุรกิจส่วนตัว ธนาคาร', days: 1 },
    { type: 'sick',     reason: 'ปวดศีรษะไมเกรน ต้องพบแพทย์', days: 1 },
    { type: 'annual',   reason: 'ลาพักร้อนประจำปี', days: 2 }
  ];
  var n = 0;
  var now = cfg_now_();
  for (var idx = 0; idx < Math.min(3, employees.length); idx++) {
    var t = employees[idx];
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      var start = new Date(now.getFullYear(), now.getMonth() - i - idx, 5 + i);
      var end = new Date(start.getTime() + (s.days - 1) * 86400000);
      var startISO = cfg_dateOnly_(start);
      var endISO = cfg_dateOnly_(end);
      var status = i === 0 ? STATUS.APPROVED : (i === 1 ? STATUS.PENDING : STATUS.APPROVED);
      await DB_insert(SHEETS.LEAVES, {
        leave_no: cfg_genLeaveNo_(now, n + 1),
        requester_id: t.id,
        leave_type: s.type,
        reason: s.reason,
        start_date: startISO,
        end_date: endISO,
        days: s.days,
        contact_address: '123/45 ซอยตัวอย่าง ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000',
        contact_phone: t.phone,
        last_leave_type: null,
        last_leave_start: null,
        last_leave_end: null,
        last_leave_days: null,
        status: status,
        written_at: startISO,
        written_place: 'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด',
        fiscal_year: cfg_fiscalYear_(start)
      });
      n++;
    }
  }
  return n;
}

async function Seed_demoMissions_() {
  var users = DB_readAll(SHEETS.USERS);
  users = users.filter(function (u) { return _yes_(u.is_active); });
  if (users.length === 0) return 0;
  var existingMissions = DB_readAll(SHEETS.MISSIONS);
  if (existingMissions.length > 0) return 0;
  var now = cfg_now_();
  var samples = [
    { title: 'ตรวจสต็อกสาขา', purpose: 'ตรวจสอบสต็อกสินค้าคงเหลือ', destination: 'สาขาโคราช', days: 1, amount: 850, expense_type: 'travel' },
    { title: 'พบลูกค้ารายใหม่', purpose: 'นำเสนอสินค้าและปิดการขาย', destination: 'จังหวัดระยอง', days: 2, amount: 2450, expense_type: 'meal' },
    { title: 'อบรมคู่ค้า', purpose: 'อบรมการใช้งานระบบหน้าแคชเชียร์', destination: 'จังหวัดชลบุรี', days: 1, amount: 1150, expense_type: 'other' }
  ];
  var n = 0;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    var u = users[i % users.length];
    var start = new Date(now.getFullYear(), now.getMonth(), Math.max(1, 4 + i * 3));
    var end = new Date(start.getTime() + (s.days - 1) * 86400000);
    var m = await DB_insert(SHEETS.MISSIONS, {
      mission_no: cfg_genMissionNo_(now, i + 1),
      requester_id: u.id,
      title: s.title,
      purpose: s.purpose,
      destination: s.destination,
      start_date: cfg_dateOnly_(start),
      end_date: cfg_dateOnly_(end),
      status: STATUS.PENDING,
      approver_id: '',
      approver_comment: '',
      approver_at: '',
      approved_amount: ''
    });
    var yy = String(now.getFullYear()).substring(2);
    var mm = ('0' + (now.getMonth()+1)).slice(-2);
    await DB_insert(SHEETS.EXPENSES, {
      expense_no: 'EX' + yy + mm + ('000' + (i+1)).slice(-4),
      mission_id: m.id,
      expense_date: cfg_dateOnly_(start),
      expense_type: s.expense_type,
      description: 'ค่าเดินทางตัวอย่าง',
      amount: s.amount,
      receipt_url: '',
      status: STATUS.PENDING,
      created_by: u.id
    });
    n++;
  }
  return n;
}

async function Seed_ensureHolidays_() {
  var year = new Date().getFullYear();
  var defaults = [
    { date: year + '-01-01', name: 'วันขึ้นปีใหม่' },
    { date: year + '-01-02', name: 'วันหยุดพิเศษ' },
    { date: year + '-03-03', name: 'วันมาฆบูชา' },
    { date: year + '-04-13', name: 'วันสงกรานต์' },
    { date: year + '-04-14', name: 'วันสงกรานต์' },
    { date: year + '-04-15', name: 'วันสงกรานต์' },
    { date: year + '-05-01', name: 'วันแรงงานแห่งชาติ' },
    { date: year + '-06-01', name: 'วันหยุดชดเชยวันวิสาขบูชา' },
    { date: year + '-06-03', name: 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี' },
    { date: year + '-07-28', name: 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัวรัชกาลที่ 10' },
    { date: year + '-07-29', name: 'วันอาสาฬหบูชา' },
    { date: year + '-08-12', name: 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสิริกิติ์ฯ' },
    { date: year + '-10-13', name: 'วันคล้ายวันสวรรคต รัชกาลที่ 9' },
    { date: year + '-10-23', name: 'วันปิยมหาราช' },
    { date: year + '-12-07', name: 'วันหยุดชดเชย วันพ่อแห่งชาติ' },
    { date: year + '-12-31', name: 'วันสิ้นปี' }
  ];
  
  var currentHolidays = DB_readAll(SHEETS.HOLIDAYS);
  var seedDates = defaults.map(function(h) { return h.date; });
  
  for (var i = 0; i < currentHolidays.length; i++) {
    var ch = currentHolidays[i];
    if (ch.holiday_date && ch.holiday_date.startsWith(year + '-')) {
      var dateStr = String(ch.holiday_date).substring(0, 10);
      if (seedDates.indexOf(dateStr) === -1) {
        await DB_delete(SHEETS.HOLIDAYS, ch.id);
      }
    }
  }
  
  var createdOrUpdated = 0;
  for (var i = 0; i < defaults.length; i++) {
    var h = defaults[i];
    var dateStr = h.date;
    var existing = DB_findOne(SHEETS.HOLIDAYS, function (x) { return String(x.holiday_date).substring(0, 10) === dateStr; });
    if (existing) {
      if (existing.name !== h.name) {
        await DB_update(SHEETS.HOLIDAYS, existing.id, { name: h.name });
        createdOrUpdated++;
      }
    } else {
      await DB_insert(SHEETS.HOLIDAYS, {
        holiday_date: dateStr,
        name: h.name
      });
      createdOrUpdated++;
    }
  }
  return createdOrUpdated;
}

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
    expense_total: _wf_missionExpenseTotal_(m.id), expense_count: ex.length, created_at: m.created_at, updated_at: m.updated_at,
    work_type: m.work_type || 'offsite'
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
  var scope = 'own';
  if (hasCap_(user.role, 'calendar.view_all')) scope = 'all';
  else if (hasCap_(user.role, 'calendar.view_department')) scope = 'department';
  var users = DB_buildIndex(SHEETS.USERS);
  var visibleStatuses = {};
  [STATUS.PENDING, STATUS.CHECKED, STATUS.REVIEWED, STATUS.APPROVED].forEach(function (s) { visibleStatuses[s] = true; });
  var rows = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    if (r.leave_type === 'compensatory' || r.leave_type === 'work_offday') return false;
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
async function Mission_create(user, p) {
  Auth_requireCap(user, 'mission.create_own');
  var data = p || {};
  if (!data.title || String(data.title).trim().length < 3) throw new Error('ระบุหัวข้อ/เรื่องอย่างน้อย 3 ตัวอักษร');
  var workType = String(data.work_type || 'offsite').trim().toLowerCase();
  if (workType !== 'wfh') {
    if (!data.destination) throw new Error('ระบุสถานที่ปฏิบัติงาน (ปลายทาง)');
  } else {
    data.destination = 'Work From Home';
  }
  if (!data.purpose) throw new Error('ระบุวัตถุประสงค์');
  if (!data.start_date) throw new Error('ระบุวันที่เริ่ม');
  if (!data.end_date) data.end_date = data.start_date;
  var start = cfg_dateOnly_(data.start_date);
  var end = cfg_dateOnly_(data.end_date);
  if (!start || !end) throw new Error('วันที่ไม่ถูกต้อง');
  var m = await DB_insert(SHEETS.MISSIONS, { mission_no: _wf_missionNo_(), requester_id: user.id, title: String(data.title || '').trim(), purpose: String(data.purpose || '').trim(), destination: String(data.destination || '').trim(), start_date: start, end_date: end, transport_type: String(data.transport_type || '').trim(), requested_amount: data.requested_amount ? Number(data.requested_amount) : null, status: STATUS.PENDING, approver_id: null, approver_comment: '', approver_at: null, approved_amount: null, work_type: workType });
  await Audit_log_(user, 'mission.create', 'mission', m.id, { mission_no: m.mission_no });
  return _wf_enrichMission_(m, DB_buildIndex(SHEETS.USERS));
}
async function Mission_update(user, p) {
  var data = p || {};
  var id = String(data.id || '').trim();
  if (!id) throw new Error('ระบุ id');
  var m = DB_findById(SHEETS.MISSIONS, id);
  if (!m) throw new Error('ไม่พบรายการ');
  if (String(m.requester_id) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์แก้ไข');
  if (m.status !== STATUS.DRAFT && m.status !== STATUS.PENDING && !hasCap_(user.role, 'expense.manage')) throw new Error('รายการนี้แก้ไขไม่ได้');
  var patch = {};
  ['title','purpose','destination','transport_type','work_type'].forEach(function (k) { if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim(); });
  if (typeof data.requested_amount !== 'undefined') patch.requested_amount = data.requested_amount ? Number(data.requested_amount) : null;
  if (data.start_date || data.end_date) { patch.start_date = cfg_dateOnly_(data.start_date || m.start_date); patch.end_date = cfg_dateOnly_(data.end_date || m.end_date); }
  var updated = await DB_update(SHEETS.MISSIONS, id, patch);
  await Audit_log_(user, 'mission.update', 'mission', id, { fields: Object.keys(patch) });
  return _wf_enrichMission_(updated, DB_buildIndex(SHEETS.USERS));
}
async function Mission_submit(user, p) { var id = String((p && p.id) || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (String(m.requester_id) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ส่งรายการนี้'); if (m.status !== STATUS.DRAFT && m.status !== STATUS.PENDING) throw new Error('สถานะไม่ถูกต้อง'); var updated = await DB_update(SHEETS.MISSIONS, id, { status: STATUS.PENDING }); await Audit_log_(user, 'mission.submit', 'mission', id, {}); return updated; }
async function Mission_cancel(user, p) { var id = String((p && p.id) || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (String(m.requester_id) !== String(user.id) && !hasCap_(user.role, 'mission.approve')) throw new Error('คุณไม่มีสิทธิ์ยกเลิก'); if (m.status === STATUS.APPROVED) throw new Error('รายการอนุมัติแล้วไม่สามารถยกเลิกได้'); var updated = await DB_update(SHEETS.MISSIONS, id, { status: STATUS.CANCELLED }); await Audit_log_(user, 'mission.cancel', 'mission', id, {}); return updated; }
async function Mission_delete(user, p) {
  Auth_requireCap(user, 'mission.approve');
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var m = DB_findById(SHEETS.MISSIONS, id);
  if (!m) throw new Error('ไม่พบรายการ');
  var expenses = DB_readAll(SHEETS.EXPENSES);
  for (var i = 0; i < expenses.length; i++) {
    var ex = expenses[i];
    if (String(ex.mission_id) === id) {
      await DB_update(SHEETS.EXPENSES, ex.id, { mission_id: null });
    }
  }
  await DB_delete(SHEETS.MISSIONS, id);
  await Audit_log_(user, 'mission.delete', 'mission', id, { mission_no: m.mission_no });
  return { ok: true };
}
async function Mission_approve(user, p) { Auth_requireCap(user, 'mission.approve'); var data = p || {}; var id = String(data.id || '').trim(); var m = DB_findById(SHEETS.MISSIONS, id); if (!m) throw new Error('ไม่พบรายการ'); if (m.status !== STATUS.PENDING) throw new Error('รายการนี้ไม่อยู่ในสถานะที่อนุมัติได้'); var decision = String(data.decision || 'approved'); var patch = { status: decision === 'rejected' ? STATUS.REJECTED : STATUS.APPROVED, approver_id: user.id, approver_comment: String(data.comment || '').trim(), approver_at: cfg_iso_(cfg_now_()) }; if (data.approved_amount != null && String(data.approved_amount).trim() !== '') patch.approved_amount = Number(data.approved_amount); var updated = await DB_update(SHEETS.MISSIONS, id, patch); await Audit_log_(user, 'mission.' + (patch.status === STATUS.APPROVED ? 'approve' : 'reject'), 'mission', id, {}); return updated; }

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
    bank_account: ex.bank_account,
    status: ex.status,
    status_label: STATUS_LABEL[ex.status] || ex.status,
    status_tone: STATUS_TONE[ex.status] || 'slate',
    approver_id: ex.approver_id,
    approver_comment: ex.approver_comment,
    approver_at: ex.approver_at,
    approved_amount: (ex.approved_amount != null && ex.approved_amount !== '') ? Number(ex.approved_amount) : '',
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

async function Expense_create(user, p) {
  Auth_requireCap(user, 'expense.create_own');
  var data = p || {};
  if (!data.description || String(data.description).trim().length < 3) throw new Error('ระบุรายละเอียดค่าใช้จ่ายอย่างน้อย 3 ตัวอักษร');
  if (!data.amount || Number(data.amount) <= 0) throw new Error('ระบุจำนวนเงินที่ถูกต้อง');
  if (!data.expense_date) throw new Error('ระบุวันที่จ่ายเงิน');
  
  var date = cfg_dateOnly_(data.expense_date);
  if (!date) throw new Error('วันที่ไม่ถูกต้อง');
  
  var status = data.draft ? STATUS.DRAFT : STATUS.PENDING;
  var expenseNo = _wf_expenseNo_();
  
  var ex = await DB_insert(SHEETS.EXPENSES, {
    expense_no: expenseNo,
    mission_id: data.mission_id && String(data.mission_id).trim() ? String(data.mission_id).trim() : null,
    expense_date: date,
    expense_type: String(data.expense_type || 'ค่าเดินทาง').trim(),
    description: String(data.description || '').trim(),
    amount: Number(data.amount),
    receipt_url: String(data.receipt_url || '').trim(),
    bank_account: data.bank_account ? String(data.bank_account).trim() : null,
    status: status,
    approver_id: null,
    approver_comment: '',
    approver_at: null,
    approved_amount: null,
    created_by: user.id
  });
  
  await Audit_log_(user, 'expense.create', 'expense', ex.id, { expense_no: ex.expense_no, status: status });
  
  if (status === STATUS.PENDING) {
    Notify_onExpenseSubmit_(ex, user);
  }
  
  return _wf_enrichExpense_(ex, DB_buildIndex(SHEETS.USERS));
}

async function Expense_update(user, p) {
  var data = p || {};
  var id = String(data.id || '').trim();
  if (!id) throw new Error('ระบุ id');
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  if (String(ex.created_by) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์แก้ไข');
  if (ex.status !== STATUS.DRAFT && ex.status !== STATUS.PENDING && !hasCap_(user.role, 'expense.manage')) throw new Error('รายการนี้แก้ไขไม่ได้');
  
  var patch = {};
  ['description', 'expense_type', 'receipt_url', 'bank_account'].forEach(function (k) {
    if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim();
  });
  if (typeof data.mission_id !== 'undefined') {
    patch.mission_id = data.mission_id && String(data.mission_id).trim() ? String(data.mission_id).trim() : null;
  }
  if (typeof data.amount !== 'undefined') {
    if (Number(data.amount) <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0');
    patch.amount = Number(data.amount);
  }
  if (data.expense_date) {
    var date = cfg_dateOnly_(data.expense_date);
    if (!date) throw new Error('วันที่ไม่ถูกต้อง');
    patch.expense_date = date;
  }
  
  var updated = await DB_update(SHEETS.EXPENSES, id, patch);
  await Audit_log_(user, 'expense.update', 'expense', id, { fields: Object.keys(patch) });
  return _wf_enrichExpense_(updated, DB_buildIndex(SHEETS.USERS));
}

async function Expense_submit(user, p) {
  var id = String((p && p.id) || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  if (String(ex.created_by) !== String(user.id)) throw new Error('คุณไม่มีสิทธิ์ส่งรายการนี้');
  if (ex.status !== STATUS.DRAFT && ex.status !== STATUS.PENDING) throw new Error('สถานะไม่ถูกต้อง');
  
  var updated = await DB_update(SHEETS.EXPENSES, id, { status: STATUS.PENDING });
  await Audit_log_(user, 'expense.submit', 'expense', id, {});
  Notify_onExpenseSubmit_(updated, user);
  return updated;
}

async function Expense_cancel(user, p) {
  var id = String((p && p.id) || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  if (String(ex.created_by) !== String(user.id) && !hasCap_(user.role, 'expense.manage')) throw new Error('คุณไม่มีสิทธิ์ยกเลิก');
  if (ex.status === STATUS.APPROVED) throw new Error('รายการอนุมัติแล้วไม่สามารถยกเลิกได้');
  
  var updated = await DB_update(SHEETS.EXPENSES, id, { status: STATUS.CANCELLED });
  await Audit_log_(user, 'expense.cancel', 'expense', id, {});
  return updated;
}

async function Expense_delete(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  var isOwner = String(ex.created_by) === String(user.id);
  var canDelete = hasCap_(user.role, 'expense.manage') || (isOwner && (ex.status === STATUS.DRAFT || ex.status === STATUS.CANCELLED || ex.status === STATUS.REJECTED));
  if (!canDelete) throw new Error('คุณไม่มีสิทธิ์ลบรายการนี้');
  
  await DB_delete(SHEETS.EXPENSES, id);
  await Audit_log_(user, 'expense.delete', 'expense', id, { expense_no: ex.expense_no });
  return { ok: true };
}

async function Expense_approve(user, p) {
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
  
  var updated = await DB_update(SHEETS.EXPENSES, id, patch);
  await Audit_log_(user, 'expense.' + (patch.status === STATUS.APPROVED ? 'approve' : 'reject'), 'expense', id, { approved_amount: patch.approved_amount });
  return updated;
}

async function Expense_set_pending(user, p) {
  Auth_requireCap(user, 'expense.manage');
  var data = p || {};
  var id = String(data.id || '').trim();
  var ex = DB_findById(SHEETS.EXPENSES, id);
  if (!ex) throw new Error('ไม่พบรายการ');
  
  var updated = await DB_update(SHEETS.EXPENSES, id, {
    status: STATUS.PENDING,
    approver_id: null,
    approver_comment: String(data.comment || '').trim(),
    approver_at: null,
    approved_amount: null
  });
  
  await Audit_log_(user, 'expense.set_pending', 'expense', id, { comment: data.comment });
  Notify_onExpenseReturnPending_(updated, user);
  return updated;
}

function Holidays_list(user, p) {
  Auth_requireCap(user, 'setting.read');
  var rows = DB_readAll(SHEETS.HOLIDAYS);
  rows.sort(function (a, b) {
    return new Date(a.holiday_date).getTime() - new Date(b.holiday_date).getTime();
  });
  return rows;
}

async function Holidays_upsert(user, p) {
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
    res = await DB_update(SHEETS.HOLIDAYS, data.id, patch);
    await Audit_log_(user, 'holiday.update', 'holiday', res.id, { date: dateStr, name: patch.name });
  } else {
    var duplicate = DB_findOne(SHEETS.HOLIDAYS, function (r) {
      return String(r.holiday_date) === dateStr;
    });
    if (duplicate) throw new Error('มีวันหยุดสำหรับวันที่นี้อยู่ในระบบแล้ว (' + duplicate.name + ')');
    res = await DB_insert(SHEETS.HOLIDAYS, patch);
    await Audit_log_(user, 'holiday.create', 'holiday', res.id, { date: dateStr, name: patch.name });
  }
  return res;
}

async function Holidays_delete(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var id = String((p && p.id) || '');
  if (!id) throw new Error('ระบุ id ของวันหยุด');
  var row = DB_findById(SHEETS.HOLIDAYS, id);
  if (!row) throw new Error('ไม่พบข้อมูลวันหยุด');
  await DB_delete(SHEETS.HOLIDAYS, id);
  await Audit_log_(user, 'holiday.delete', 'holiday', id, { date: row.holiday_date, name: row.name });
  return { ok: true };
}

// === NOTIFICATIONS LOGIC ===
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatThDate(isoString) {
  if (!isoString) return '-';
  try {
    var parts = isoString.split('T')[0].split('-');
    if (parts.length !== 3) return isoString;
    var y = parseInt(parts[0], 10) + 543;
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var monthsShort = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return d + ' ' + monthsShort[m - 1] + ' ' + y;
  } catch (e) {
    return isoString;
  }
}

async function _sendEmail_(to, subject, html) {
  var settings = GLOBAL_SETTINGS || {};
  var fromAlias = settings.email_from_alias || '';
  var url = SUPABASE_URL + '/functions/v1/send-email';
  var opts = {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: to,
      subject: subject,
      html: html,
      from_alias: fromAlias
    })
  };
  try {
    var r = await fetch(url, opts);
    var res = await r.json().catch(function(){ return {}; });
    if (!r.ok) {
      console.error('Email send error:', res.error || 'Unknown error');
    }
  } catch (e) {
    console.error('Failed to send email:', e);
  }
}

function Notify_onNewRegistration_(newU) {
  var users = DB_readAll('Users');
  var admins = users.filter(function (u) { return u.role === 'admin' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  var emails = admins.map(function (r) { return r.email; });
  if (emails.length === 0 && GLOBAL_SETTINGS.org_email) {
    emails.push(GLOBAL_SETTINGS.org_email);
  }
  if (emails.length > 0) {
    var html = '<h2>มีคำขอสมัครสมาชิกใหม่รอยืนยัน</h2>'
      + '<p>เรียน ผู้ดูแลระบบ,</p>'
      + '<p>มีผู้ใช้งานลงทะเบียนใหม่ในระบบ AvarinLMS และรอการเปิดใช้งานบัญชี:</p>'
      + '<ul>'
      + '<li><strong>ชื่อผู้ใช้ (Username):</strong> @' + esc(newU.username) + '</li>'
      + '<li><strong>ชื่อ-สกุล:</strong> ' + esc(newU.full_name) + '</li>'
      + '<li><strong>สังกัด/ฝ่าย:</strong> ' + esc(newU.department || '-') + '</li>'
      + '<li><strong>ตำแหน่ง:</strong> ' + esc(newU.position || '-') + '</li>'
      + '<li><strong>อีเมล:</strong> ' + esc(newU.email || '-') + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/pending-users" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">ตรวจสอบและอนุมัติสมาชิก</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'สมัครสมาชิกใหม่: ' + newU.full_name, html);
  }
}

function Notify_onRegistrationApproved_(u, role, approver) {
  if (!u || !u.email) return;
  var roleLabel = ROLE_LABEL[role] || role;
  var html = '<h2>ยินดีต้อนรับเข้าสู่ระบบ AvarinLMS</h2>'
    + '<p>เรียน คุณ ' + esc(u.full_name) + ',</p>'
    + '<p>บัญชีผู้ใช้ <code>@' + esc(u.username) + '</code> ของคุณได้รับการอนุมัติให้เข้าใช้งานแล้ว:</p>'
    + '<ul>'
    + '<li><strong>บทบาทของคุณ:</strong> ' + esc(roleLabel) + '</li>'
    + '<li><strong>ผู้อนุมัติ:</strong> ' + esc(approver ? approver.full_name : 'ผู้ดูแลระบบ') + '</li>'
    + '</ul>'
    + '<p>คุณสามารถเข้าสู่ระบบเพื่อยื่นใบลาและขอเบิกค่าใช้จ่ายได้ทันที</p>'
    + '<p><a href="' + REQUEST_ORIGIN + '" style="display:inline-block;background:#10b981;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">เข้าสู่ระบบ</a></p>'
    + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
  _sendEmail_(u.email, 'บัญชี AvarinLMS ของคุณได้รับการอนุมัติแล้ว', html);
}

function Notify_onRegistrationRejected_(u, rejectReason, rejector) {
  if (!u || !u.email) return;
  var html = '<h2>แจ้งผลการสมัครเข้าใช้งานระบบ AvarinLMS</h2>'
    + '<p>เรียน คุณ ' + esc(u.full_name) + ',</p>'
    + '<p>คำขอสมัครใช้งานระบบของคุณไม่ได้รับอนุมัติ เนื่องจาก:</p>'
    + '<div style="background:#fef2f2;padding:16px;border-radius:8px;border-left:4px solid #ef4444;margin:16px 0">'
    + '  <div style="font-weight:bold;color:#ef4444">เหตุผลที่ไม่ได้รับการอนุมัติ:</div>'
    + '  <div style="margin-top:4px">' + esc(rejectReason || 'ข้อมูลไม่ถูกต้องหรือไม่ใช่บุคลากรในหน่วยงาน') + '</div>'
    + '</div>'
    + '<p>หากมีข้อสงสัยเพิ่มเติม กรุณาติดต่อฝ่ายทรัพยากรบุคคลหรือผู้เกี่ยวข้อง</p>'
    + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
  _sendEmail_(u.email, 'แจ้งผลการปฏิเสธบัญชี AvarinLMS', html);
}

function Notify_onLeaveChecked_(leave, requester, checker) {
  var users = DB_readAll('Users');
  var supervisors = users.filter(function (u) { return u.role === 'supervisor' && u.department === requester.department && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  if (supervisors.length === 0) {
    supervisors = users.filter(function (u) { return u.role === 'approver' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  }
  var emails = supervisors.map(function (s) { return s.email; });
  if (emails.length > 0) {
    var html = '<h2>ใบลาผ่านการตรวจสอบแล้ว รอความเห็นจากหัวหน้างาน</h2>'
      + '<p>เรียน หัวหน้างาน,</p>'
      + '<p>ใบลาเลขที่ <code>' + esc(leave.leave_no) + '</code> ได้รับการตรวจสอบขั้นต้นโดย ' + esc(checker.full_name) + ' เรียบร้อยแล้ว และรอความเห็นจากคุณ:</p>'
      + '<ul>'
      + '<li><strong>ผู้ขอลา:</strong> ' + esc(requester.full_name) + ' (' + esc(requester.position || '-') + ')</li>'
      + '<li><strong>แผนก/สังกัด:</strong> ' + esc(requester.department || '-') + '</li>'
      + '<li><strong>ประเภทการลา:</strong> ' + esc(LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type) + '</li>'
      + '<li><strong>ช่วงเวลา:</strong> ' + formatThDate(leave.start_date) + ' ถึง ' + formatThDate(leave.end_date) + ' (' + leave.days + ' วัน)</li>'
      + '<li><strong>ความเห็นผู้ตรวจสอบ:</strong> ' + esc(leave.checker_comment || '-') + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/leaves/inbox" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">แสดงความเห็นใบลา</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'ใบลาผ่านการตรวจสอบแล้วรอความเห็นหัวหน้างาน: ' + leave.leave_no, html);
  }
}

function Notify_onLeaveCommented_(leave, requester, supervisor) {
  var users = DB_readAll('Users');
  var approvers = users.filter(function (u) { return u.role === 'approver' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  var emails = approvers.map(function (a) { return a.email; });
  if (emails.length === 0 && GLOBAL_SETTINGS.org_email) {
    emails.push(GLOBAL_SETTINGS.org_email);
  }
  if (emails.length > 0) {
    var html = '<h2>ใบลาผ่านการกลั่นกรองแล้ว รออนุมัติขั้นสุดท้าย</h2>'
      + '<p>เรียน ผู้อนุมัติ/ฝ่ายบุคคล,</p>'
      + '<p>ใบลาเลขที่ <code>' + esc(leave.leave_no) + '</code> ผ่านการเสนอความเห็นจากหัวหน้างาน ' + esc(supervisor.full_name) + ' เรียบร้อยแล้ว และรออนุมัติขั้นสุดท้ายจากคุณ:</p>'
      + '<ul>'
      + '<li><strong>ผู้ขอลา:</strong> ' + esc(requester.full_name) + ' (' + esc(requester.position || '-') + ')</li>'
      + '<li><strong>แผนก/สังกัด:</strong> ' + esc(requester.department || '-') + '</li>'
      + '<li><strong>ประเภทการลา:</strong> ' + esc(LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type) + '</li>'
      + '<li><strong>ช่วงเวลา:</strong> ' + formatThDate(leave.start_date) + ' ถึง ' + formatThDate(leave.end_date) + ' (' + leave.days + ' วัน)</li>'
      + '<li><strong>ความเห็นหัวหน้างาน:</strong> ' + esc(leave.supervisor_comment || '-') + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/leaves/inbox" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">พิจารณาอนุมัติใบลา</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'ใบลาผ่านการพิจารณาจากหัวหน้างานแล้วรออนุมัติ: ' + leave.leave_no, html);
  }
}

function Notify_onLeaveSubmit_(leave, user) {
  var users = DB_readAll('Users');
  var stages = _stages_();
  var recipients = [];
  if (stages === 3) {
    recipients = users.filter(function (u) { return u.role === 'checker' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  } else if (stages === 2) {
    recipients = users.filter(function (u) { return u.role === 'supervisor' && u.department === user.department && u.email && String(u.is_active).toLowerCase() === 'yes'; });
    if (recipients.length === 0) {
      recipients = users.filter(function (u) { return u.role === 'approver' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
    }
  } else {
    recipients = users.filter(function (u) { return u.role === 'approver' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  }
  if (recipients.length === 0 && GLOBAL_SETTINGS.org_email) {
    recipients.push({ email: GLOBAL_SETTINGS.org_email });
  }
  var emails = recipients.map(function (r) { return r.email; });
  if (emails.length > 0) {
    var html = '<h2>มีใบลาใหม่รอการอนุมัติ / ตรวจสอบ</h2>'
      + '<p>เรียน ผู้อนุมัติ/ผู้ตรวจสอบ,</p>'
      + '<p>มีใบลาใหม่ยื่นเข้ามาในระบบ รายละเอียดดังนี้:</p>'
      + '<ul>'
      + '<li><strong>เลขที่ใบลา:</strong> <code>' + esc(leave.leave_no) + '</code></li>'
      + '<li><strong>ผู้ขอลา:</strong> ' + esc(user.full_name) + ' (' + esc(user.position || '-') + ')</li>'
      + '<li><strong>แผนก/สังกัด:</strong> ' + esc(user.department || '-') + '</li>'
      + '<li><strong>ประเภทการลา:</strong> ' + esc(LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type) + '</li>'
      + '<li><strong>ช่วงเวลา:</strong> ' + formatThDate(leave.start_date) + ' ถึง ' + formatThDate(leave.end_date) + ' (' + leave.days + ' วัน)</li>'
      + '<li><strong>เหตุผลการลา:</strong> ' + esc(leave.reason) + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/leaves/inbox" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">เปิดดูรายการรอดำเนินการ</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'ใบลาใหม่รออนุมัติ: ' + leave.leave_no + ' (' + user.full_name + ')', html);
  }
}

function Notify_onLeaveApproved_(leave, requester, approver) {
  var users = DB_readAll('Users');
  var admins = users.filter(function (u) { return u.role === 'admin' && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  var emails = admins.map(function (r) { return r.email; });
  if (emails.length === 0 && GLOBAL_SETTINGS.org_email) {
    emails.push(GLOBAL_SETTINGS.org_email);
  }
  if (emails.length > 0) {
    var html = '<h2>ใบลาได้รับการอนุมัติสมบูรณ์แล้ว</h2>'
      + '<p>เรียน แอดมิน/ฝ่ายบุคคล,</p>'
      + '<p>ใบลาเลขที่ <code>' + esc(leave.leave_no) + '</code> ได้รับการอนุมัติเรียบร้อยแล้ว:</p>'
      + '<ul>'
      + '<li><strong>ผู้ขอลา:</strong> ' + esc(requester.full_name) + ' (' + esc(requester.department || '-') + ')</li>'
      + '<li><strong>ประเภทการลา:</strong> ' + esc(LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type) + '</li>'
      + '<li><strong>จำนวนวันลา:</strong> ' + leave.days + ' วัน</li>'
      + '<li><strong>ผู้อนุมัติ:</strong> ' + esc(approver ? approver.full_name : 'ผู้ดูแลระบบ') + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/leaves/all" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">ตรวจสอบใบลาทั้งหมด</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'ใบลาอนุมัติแล้ว: ' + leave.leave_no + ' (' + requester.full_name + ')', html);
  }
}

function Notify_onLeaveResultToRequester_(leave, requester, approver) {
  if (!requester || !requester.email) return;
  var isApp = leave.status === STATUS.APPROVED;
  var statusLabel = isApp ? 'อนุมัติแล้ว' : 'ปฏิเสธ/ไม้อนุมัติ';
  var statusColor = isApp ? '#10b981' : '#ef4444';
  var comment = leave.approver_comment || leave.supervisor_comment || leave.checker_comment || '-';
  var html = '<h2>แจ้งผลการอนุมัติใบลา</h2>'
    + '<p>เรียน คุณ ' + esc(requester.full_name) + ',</p>'
    + '<p>ใบลาเลขที่ <code>' + esc(leave.leave_no) + '</code> ของคุณได้รับการพิจารณาเรียบร้อยแล้ว:</p>'
    + '<div style="background:#f8fafc;padding:16px;border-radius:8px;border-left:4px solid ' + statusColor + ';margin:16px 0">'
    + '  <div style="font-size:16px;font-weight:bold;color:' + statusColor + '">ผลการพิจารณา: ' + statusLabel + '</div>'
    + '  <div style="margin-top:8px"><strong>ผู้อนุมัติ:</strong> ' + esc(approver ? approver.full_name : 'ผู้ดูแลระบบ') + '</div>'
    + '  <div><strong>ข้อคิดเห็น/เหตุผล:</strong> ' + esc(comment) + '</div>'
    + '</div>'
    + '<ul>'
    + '<li><strong>ประเภทการลา:</strong> ' + esc(LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type) + '</li>'
    + '<li><strong>ช่วงเวลา:</strong> ' + formatThDate(leave.start_date) + ' ถึง ' + formatThDate(leave.end_date) + ' (' + leave.days + ' วัน)</li>'
    + '</ul>'
    + '<p><a href="' + REQUEST_ORIGIN + '#/leaves/mine" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">ตรวจสอบใบลาของฉัน</a></p>'
    + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
  _sendEmail_(requester.email, 'ผลการอนุมัติใบลา ' + leave.leave_no + ': ' + statusLabel, html);
}

function Notify_onExpenseSubmit_(expense, user) {
  var users = DB_readAll('Users');
  var recipients = users.filter(function (u) { return (u.role === 'admin' || u.role === 'approver') && u.email && String(u.is_active).toLowerCase() === 'yes'; });
  if (recipients.length === 0 && GLOBAL_SETTINGS.org_email) {
    recipients.push({ email: GLOBAL_SETTINGS.org_email });
  }
  var emails = recipients.map(function (r) { return r.email; });
  if (emails.length > 0) {
    var expenseName = (expense.expense_type || 'ค่าใช้จ่ายทั่วไป') + ' (' + (expense.expense_no || '-') + ')';
    var html = '<h2>มีคำขอเบิกค่าใช้จ่ายใหม่รออนุมัติ</h2>'
      + '<p>เรียน ผู้อนุมัติ,</p>'
      + '<p>มีใบเบิกค่าใช้จ่ายใหม่ยื่นเข้ามาในระบบ รายละเอียดดังนี้:</p>'
      + '<ul>'
      + '<li><strong>เลขที่ใบเบิก:</strong> <code>' + esc(expense.expense_no || '-') + '</code></li>'
      + '<li><strong>ประเภทค่าใช้จ่าย:</strong> ' + esc(expense.expense_type || '-') + '</li>'
      + '<li><strong>ผู้ขอเบิก:</strong> ' + esc(user.full_name) + ' (' + esc(user.department || '-') + ')</li>'
      + '<li><strong>จำนวนเงินที่ขอเบิก:</strong> ' + (expense.amount || 0) + ' บาท</li>'
      + '<li><strong>รายละเอียด/เหตุผล:</strong> ' + esc(expense.description || '-') + '</li>'
      + '</ul>'
      + '<p><a href="' + REQUEST_ORIGIN + '#/expenses/pending" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">ตรวจสอบใบเบิกค่าใช้จ่าย</a></p>'
      + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
    _sendEmail_(emails, 'คำขอเบิกค่าใช้จ่ายใหม่: ' + expenseName + ' (' + user.full_name + ')', html);
  }
}

function Notify_onExpenseReturnPending_(expense, user) {
  var requester = DB_findById('Users', expense.created_by);
  if (!requester || !requester.email) return;
  var expenseName = (expense.expense_type || 'ค่าใช้จ่ายทั่วไป') + ' (' + (expense.expense_no || '-') + ')';
  var html = '<h2>ใบเบิกค่าใช้จ่ายของท่านถูกส่งกลับแก้ไข</h2>'
    + '<p>เรียนคุณ ' + esc(requester.full_name) + ',</p>'
    + '<p>ใบเบิกค่าใช้จ่ายของท่านถูกปรับสถานะกลับเป็น <strong>รอตรวจสอบ (Pending)</strong> เพื่อให้แก้ไขข้อมูล รายละเอียดดังนี้:</p>'
    + '<ul>'
    + '<li><strong>เลขที่ใบเบิก:</strong> <code>' + esc(expense.expense_no || '-') + '</code></li>'
    + '<li><strong>ประเภทค่าใช้จ่าย:</strong> ' + esc(expense.expense_type || '-') + '</li>'
    + '<li><strong>จำนวนเงินที่ขอเบิก:</strong> ' + (expense.amount || 0) + ' บาท</li>'
    + '<li><strong>รายละเอียด/เหตุผล:</strong> ' + esc(expense.description || '-') + '</li>'
    + '<li><strong>เหตุผลที่ส่งกลับแก้ไข:</strong> <strong style="color:#ef4444">' + esc(expense.approver_comment || '-') + '</strong></li>'
    + '</ul>'
    + '<p>ท่านสามารถเข้าไปแก้ไขรายละเอียด ยอดเงิน และแนบรูปหลักฐานเพิ่มเติมได้ผ่านระบบ</p>'
    + '<p><a href="' + REQUEST_ORIGIN + '#/expenses/view?id=' + expense.id + '" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:bold">แก้ไขใบเบิกค่าใช้จ่าย</a></p>'
    + '<hr><p style="font-size:12px;color:#888">นี่คือข้อความอัตโนมัติจากระบบ AvarinLMS</p>';
  _sendEmail_(requester.email, 'ใบเบิกค่าใช้จ่ายของท่านถูกส่งกลับแก้ไข: ' + expenseName, html);
}

// === LINE NO-OPS / WEBHOOK ===
function LINE_getWebhookUrl() {
  return SUPABASE_URL + '/functions/v1/line-webhook';
}

// === API ROUTER ===
var GLOBAL_SETTINGS = {};
var GLOBAL_HOLIDAYS = {};

function _ok(data) { return { ok: true, data: data }; }
function _err(msg) { return { ok: false, error: String(msg && msg.message ? msg.message : msg) }; }

async function api(req) {
  try {
    req = req || {};
    var action = String(req.action || '').trim();
    var token = req.token || '';
    var p = req.payload || {};

    await DB_warmCache();
    
    GLOBAL_SETTINGS = _settingsMap_();
    await Settings_ensureDefaults_();
    
    GLOBAL_SETTINGS = _settingsMap_();
    if (GLOBAL_SETTINGS.web_url && !REQUEST_ORIGIN.includes("localhost") && !REQUEST_ORIGIN.includes("127.0.0.1")) {
      var wurl = GLOBAL_SETTINGS.web_url;
      if (!wurl.endsWith('/')) wurl += '/';
      REQUEST_ORIGIN = wurl;
    }
    
    await Seed_ensureHolidays_();

    var holidaysRows = DB_readAll('Holidays');
    GLOBAL_HOLIDAYS = {};
    holidaysRows.forEach(function(r) {
      if (r.holiday_date) {
        GLOBAL_HOLIDAYS[String(r.holiday_date).substring(0, 10)] = r.name || 'วันหยุดบริษัท';
      }
    });

    var users = DB_readAll('Users');
    if (users.length === 0) {
      await Seed_ensureUsers_();
      await Seed_ensureHolidays_();
      await Seed_demoLeaves_();
      await Seed_demoMissions_();
    }

    if (action === 'app.bootstrap')   return _ok(await Auth_bootstrap(token));
    if (action === 'auth.login')      return _ok(await Auth_login(p));
    if (action === 'auth.line_login') return _ok(await Auth_lineLogin(p));
    if (action === 'auth.logout')     return _ok(await Auth_logout(token));
    if (action === 'user.register')   return _ok(await Users_register(p));
    if (action === 'auth.forgot_password') return _ok(await Auth_forgotPassword(p));

    var user = await Auth_verify_(token);

    switch (action) {
      case 'auth.change_password':    return _ok(await Auth_changePassword(user, p));
      case 'auth.me':                 return _ok({ user: Auth_publicUser_(user), caps: CAPS[user.role] || [] });

      case 'user.list':               return _ok(Users_list(user, p));
      case 'user.get':                return _ok(Users_get(user, p));
      case 'user.branch_directory':   return _ok(Users_branchDirectory(user, p));
      case 'user.upsert':             return _ok(await Users_upsert(user, p));
      case 'user.delete':             return _ok(await Users_delete(user, p));
      case 'user.reset_password':     return _ok(await Users_resetPassword(user, p));
      case 'user.update_profile':     return _ok(await Users_updateProfile(user, p));
      case 'user.active_for_role':    return _ok(Users_active_for_role(user, p));
      case 'user.list_pending':       return _ok(Users_listPending(user));
      case 'user.approve_registration': return _ok(await Users_approveRegistration(user, p));

      case 'leave.list':              return _ok(Leaves_list(user, p));
      case 'leave.get':               return _ok(Leaves_get(user, p));
      case 'leave.preview':           return _ok(Leaves_preview(user, p));
      case 'leave.create':            return _ok(await Leaves_create(user, p));
      case 'leave.update':            return _ok(await Leaves_update(user, p));
      case 'leave.submit':            return _ok(await Leaves_submit(user, p));
      case 'leave.cancel':            return _ok(await Leaves_cancel(user, p));
      case 'leave.check':             return _ok(await Leaves_check(user, p));
      case 'leave.comment':           return _ok(await Leaves_comment(user, p));
      case 'leave.approve':           return _ok(await Leaves_approve(user, p));
      case 'leave.delete':            return _ok(await Leaves_delete(user, p));
      case 'leave.workflow_counts':   return _ok(Leaves_workflow_counts(user));
      case 'leave.my_stats':          return _ok(Leaves_my_stats(user, p));
      case 'leave.user_stats':        return _ok(Leaves_user_stats(user, p));
      case 'leave.all_users_quotas':  return _ok(Leaves_all_users_quotas(user, p));
      case 'leave.adjust_quota':      return _ok(await Leaves_adjust_quota(user, p));
      case 'schedule.monthly':        return _ok(Schedule_monthly(user, p));
      case 'schedule.save_override':   return _ok(await Schedule_saveOverride(user, p));
      case 'schedule.update_off_day': return _ok(await Schedule_updateOffDay(user, p));

      case 'calendar.month':          return _ok(Calendar_month(user, p));
      case 'mission.list':            return _ok(Mission_list(user, p));
      case 'mission.get':             return _ok(Mission_get(user, p));
      case 'mission.create':          return _ok(await Mission_create(user, p));
      case 'mission.update':          return _ok(await Mission_update(user, p));
      case 'mission.submit':          return _ok(await Mission_submit(user, p));
      case 'mission.cancel':          return _ok(await Mission_cancel(user, p));
      case 'mission.delete':          return _ok(await Mission_delete(user, p));
      case 'mission.approve':         return _ok(await Mission_approve(user, p));

      case 'expense.list':            return _ok(Expense_list(user, p));
      case 'expense.get':             return _ok(Expense_get(user, p));
      case 'expense.create':          return _ok(await Expense_create(user, p));
      case 'expense.update':          return _ok(await Expense_update(user, p));
      case 'expense.submit':          return _ok(await Expense_submit(user, p));
      case 'expense.cancel':          return _ok(await Expense_cancel(user, p));
      case 'expense.delete':          return _ok(await Expense_delete(user, p));
      case 'expense.approve':         return _ok(await Expense_approve(user, p));
      case 'expense.set_pending':     return _ok(await Expense_set_pending(user, p));

      case 'report.overview':         return _ok(Reports_overview(user, p));
      case 'report.user':             return _ok(Reports_user(user, p));
      case 'report.users_list':       return _ok(Reports_users_list(user));
      case 'dashboard.data':          return _ok(Dashboard_data(user));

      case 'setting.get':             return _ok(Settings_get(user));
      case 'setting.update':          return _ok(await Settings_update(user, p));

      case 'line.get_connect_code':   return _ok(await Users_getConnectCode(user));
      case 'line.disconnect':         return _ok(await Users_disconnectLine(user));
      case 'line.webhook_url':        return _ok(LINE_getWebhookUrl());
      case 'auth.link_line':          return _ok(await Auth_linkLine(user, p));

      case 'checkin.get_today':       return _ok(Checkins_getToday(user));
      case 'checkin.clock_in':        return _ok(await Checkins_clockIn(user, p));
      case 'checkin.clock_out':       return _ok(await Checkins_clockOut(user, p));
      case 'checkin.list':            return _ok(Checkins_list(user, p));

      case 'holiday.list':            return _ok(Holidays_list(user, p));
      case 'holiday.upsert':          return _ok(await Holidays_upsert(user, p));
      case 'holiday.delete':          return _ok(await Holidays_delete(user, p));

      case 'course.list':             return _ok(Courses_list(user, p));
      case 'course.get':              return _ok(Courses_get(user, p));
      case 'course.create':           return _ok(await Courses_create(user, p));
      case 'course.update':           return _ok(await Courses_update(user, p));
      case 'course.delete':           return _ok(await Courses_delete(user, p));
      case 'quiz.get_questions':      return _ok(Quizzes_getQuestions(user, p));
      case 'quiz.submit':             return _ok(await Quizzes_submit(user, p));
      case 'course.progress_list':    return _ok(Courses_progressList(user, p));
      case 'ai.website_extract':      return _ok(await AI_websiteExtract(user, p));
      case 'ai.course_generate':      return _ok(await AI_courseGenerate(user, p));
      case 'ai.course_index':         return _ok(await AI_courseIndex(user, p));
      case 'ai.tutor_ask':            return _ok(await AI_tutorAsk(user, p));

      case 'audit.list':              return _ok(Audit_list(user, p));
      case 'r2.get_upload_url':       return _ok(await R2_getUploadUrl(user, p));
      case 'r2.upload':               return _ok(await R2_upload(user, p));
      case 'r2.migrate_legacy_data':  return _ok(await R2_migrateLegacyData(user));
    }
    throw new Error('ไม่พบ action: ' + action);
  } catch (e) {
    return _err(e);
  }
}

// === CHECKIN LOGIC ===
function Checkins_list(user, p) {
  var data = p || {};
  var items = DB_readAll('Checkins');
  
  if (user.role !== 'admin' && user.role !== 'approver' && user.role !== 'supervisor') {
    items = items.filter(function (r) { return r.user_id === user.id; });
  } else if (data.user_id) {
    items = items.filter(function (r) { return r.user_id === data.user_id; });
  }
  
  items.sort(function(a, b) {
    return new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime();
  });

  var usersMap = DB_buildIndex('Users');
  var enriched = items.map(function (item) {
    var u = usersMap[item.user_id] || {};
    return Object.assign({}, item, {
      full_name: u.full_name || 'ไม่ระบุชื่อ',
      department: u.department || 'ไม่ระบุแผนก'
    });
  });

  var page = Number(data.page || 1);
  var per = Number(data.per_page || 50);
  var total = enriched.length;
  var slice = enriched.slice((page-1)*per, page*per);

  return { items: slice, total: total, page: page, per_page: per, pages: Math.ceil(total/per) };
}

function Checkins_getToday(user) {
  var now = new Date();
  var localTime = now.getTime() + (7 * 60 * 60 * 1000);
  var todayDateStr = new Date(localTime).toISOString().substring(0, 10);
  
  var rows = DB_readAll('Checkins');
  var todayRecord = rows.find(function (r) {
    if (r.user_id !== user.id) return false;
    var checkInLocal = new Date(new Date(r.check_in_at).getTime() + (7 * 60 * 60 * 1000)).toISOString().substring(0, 10);
    return checkInLocal === todayDateStr;
  });
  
  return todayRecord || null;
}

async function Checkins_clockIn(user, p) {
  var data = p || {};
  
  var todayRecord = Checkins_getToday(user);
  if (todayRecord) {
    throw new Error('คุณได้เช็คอินเข้างานของวันนี้ไปแล้ว');
  }

  var now = new Date();
  var record = await DB_insert('Checkins', {
    user_id: user.id,
    check_in_at: cfg_iso_(now),
    check_out_at: null,
    check_in_lat: data.latitude ? Number(data.latitude) : null,
    check_in_lng: data.longitude ? Number(data.longitude) : null,
    check_out_lat: null,
    check_out_lng: null,
    check_in_loc: String(data.location || '').trim() || 'พิกัด GPS',
    check_out_loc: '',
    status: 'normal',
    check_in_img: String(data.image || '').trim() || null,
    check_out_img: null
  });

  await Audit_log_(user, 'checkin.clock_in', 'checkin', record.id, { check_in_at: record.check_in_at });
  return record;
}

async function Checkins_clockOut(user, p) {
  var data = p || {};
  
  var todayRecord = Checkins_getToday(user);
  if (!todayRecord) {
    throw new Error('ไม่พบประวัติการเช็คอินเข้างานของวันนี้ กรุณาเช็คอินเข้างานก่อน');
  }
  if (todayRecord.check_out_at) {
    throw new Error('คุณได้เช็คเอาท์ออกงานของวันนี้ไปแล้ว');
  }

  var now = new Date();
  var record = await DB_update('Checkins', todayRecord.id, {
    check_out_at: cfg_iso_(now),
    check_out_lat: data.latitude ? Number(data.latitude) : null,
    check_out_lng: data.longitude ? Number(data.longitude) : null,
    check_out_loc: String(data.location || '').trim() || 'พิกัด GPS',
    check_out_img: String(data.image || '').trim() || null
  });

  await Audit_log_(user, 'checkin.clock_out', 'checkin', todayRecord.id, { check_out_at: record.check_out_at });
  return record;
}

// === TRAINING & QUIZ LOGIC ===
function Courses_list(user, p) {
  var data = p || {};
  var list = DB_readAll(SHEETS.COURSES);
  var progress = DB_readAll(SHEETS.PROGRESS).filter(function (x) { return String(x.user_id) === String(user.id); });
  var progressMap = {};
  progress.forEach(function (x) { progressMap[String(x.course_id)] = x; });

  if (user.role !== 'admin' && user.role !== 'approver') {
    list = list.filter(function (c) { return c.status === 'active'; });
  }

  var result = list.map(function (c) {
    var prog = progressMap[String(c.id)] || null;
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      thumbnail_url: c.thumbnail_url,
      category: c.category,
      duration_hours: c.duration_hours,
      pass_score: c.pass_score,
      instructor: c.instructor,
      status: c.status,
      created_at: c.created_at,
      progress: prog ? { quiz_score: Number(prog.quiz_score), quiz_total: Number(prog.quiz_total), is_passed: prog.is_passed } : null
    };
  });

  return { items: result };
}

function Courses_get(user, p) {
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var c = DB_findById(SHEETS.COURSES, id);
  if (!c) throw new Error('ไม่พบคอร์สเรียน');
  
  var progress = DB_findOne(SHEETS.PROGRESS, function (x) {
    return String(x.user_id) === String(user.id) && String(x.course_id) === String(id);
  });

  return {
    course: c,
    progress: progress ? { quiz_score: Number(progress.quiz_score), quiz_total: Number(progress.quiz_total), is_passed: progress.is_passed } : null
  };
}

async function Courses_create(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var title = String(data.title || '').trim();
  var content = String(data.content || '').trim();
  if (!title) throw new Error('กรุณาระบุชื่อคอร์สเรียน');
  if (!content) throw new Error('กรุณาระบุเนื้อหาบทเรียน');

  var course = await DB_insert(SHEETS.COURSES, {
    title: title,
    description: String(data.description || '').trim(),
    thumbnail_url: String(data.thumbnail_url || '').trim(),
    content: content,
    video_url: String(data.video_url || '').trim(),
    category: String(data.category || '').trim(),
    duration_hours: data.duration_hours ? Number(data.duration_hours) : 0,
    pass_score: data.pass_score ? Number(data.pass_score) : 80,
    instructor: String(data.instructor || '').trim(),
    ai_summary: String(data.ai_summary || '').trim(),
    ai_modules: String(data.ai_modules || '').trim(),
    ai_quiz: String(data.ai_quiz || '').trim(),
    ai_flashcards: String(data.ai_flashcards || '').trim(),
    ai_key_points: String(data.ai_key_points || '').trim(),
    ai_checklist: String(data.ai_checklist || '').trim(),
    status: String(data.status || 'active').trim()
  });

  if (Array.isArray(data.questions)) {
    for (var i = 0; i < data.questions.length; i++) {
      var q = data.questions[i];
      if (q.question && Array.isArray(q.options)) {
        await DB_insert(SHEETS.QUIZZES, {
          course_id: course.id,
          question: String(q.question).trim(),
          options: JSON.stringify(q.options),
          correct_option: Number(q.correct_option || 0)
        });
      }
    }
  }

  await Audit_log_(user, 'course.create', 'course', course.id, {});
  return course;
}

async function Courses_update(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var id = String(data.id || '').trim();
  if (!id) throw new Error('ระบุ id');
  var c = DB_findById(SHEETS.COURSES, id);
  if (!c) throw new Error('ไม่พบคอร์สเรียน');

  var patch = {};
  if ('title' in data) patch.title = String(data.title || '').trim();
  if ('description' in data) patch.description = String(data.description || '').trim();
  if ('thumbnail_url' in data) patch.thumbnail_url = String(data.thumbnail_url || '').trim();
  if ('content' in data) patch.content = String(data.content || '').trim();
  if ('video_url' in data) patch.video_url = String(data.video_url || '').trim();
  if ('category' in data) patch.category = String(data.category || '').trim();
  if ('duration_hours' in data) patch.duration_hours = data.duration_hours ? Number(data.duration_hours) : 0;
  if ('pass_score' in data) patch.pass_score = data.pass_score ? Number(data.pass_score) : 80;
  if ('instructor' in data) patch.instructor = String(data.instructor || '').trim();
  if ('ai_summary' in data) patch.ai_summary = String(data.ai_summary || '').trim();
  if ('ai_modules' in data) patch.ai_modules = String(data.ai_modules || '').trim();
  if ('ai_quiz' in data) patch.ai_quiz = String(data.ai_quiz || '').trim();
  if ('ai_flashcards' in data) patch.ai_flashcards = String(data.ai_flashcards || '').trim();
  if ('ai_key_points' in data) patch.ai_key_points = String(data.ai_key_points || '').trim();
  if ('ai_checklist' in data) patch.ai_checklist = String(data.ai_checklist || '').trim();
  if ('status' in data) patch.status = String(data.status || 'active').trim();

  var updated = await DB_update(SHEETS.COURSES, id, patch);

  if (Array.isArray(data.questions)) {
    var existing = DB_readAll(SHEETS.QUIZZES).filter(function (q) { return String(q.course_id) === String(id); });
    for (var i = 0; i < existing.length; i++) {
      await DB_delete(SHEETS.QUIZZES, existing[i].id);
    }
    for (var i = 0; i < data.questions.length; i++) {
      var q = data.questions[i];
      if (q.question && Array.isArray(q.options)) {
        await DB_insert(SHEETS.QUIZZES, {
          course_id: id,
          question: String(q.question).trim(),
          options: JSON.stringify(q.options),
          correct_option: Number(q.correct_option || 0)
        });
      }
    }
  }

  await Audit_log_(user, 'course.update', 'course', id, {});
  return updated;
}

async function Courses_delete(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var id = String((p && p.id) || '').trim();
  if (!id) throw new Error('ระบุ id');
  var c = DB_findById(SHEETS.COURSES, id);
  if (!c) throw new Error('ไม่พบคอร์สเรียน');

  await DB_delete(SHEETS.COURSES, id);
  await Audit_log_(user, 'course.delete', 'course', id, {});
  return { success: true };
}

function Quizzes_getQuestions(user, p) {
  var courseId = String((p && p.course_id) || '').trim();
  if (!courseId) throw new Error('ระบุ course_id');
  var quizzes = DB_readAll(SHEETS.QUIZZES).filter(function (q) { return String(q.course_id) === String(courseId); });
  var isAdmin = user.role === 'admin' || user.role === 'approver';

  return {
    items: quizzes.map(function (q) {
      var opts = [];
      try {
        opts = JSON.parse(q.options);
      } catch(e) {
        opts = [];
      }
      var item = {
        id: q.id,
        question: q.question,
        options: opts
      };
      if (isAdmin) {
        item.correct_option = Number(q.correct_option);
      }
      return item;
    })
  };
}

async function Quizzes_submit(user, p) {
  var data = p || {};
  var courseId = String(data.course_id || '').trim();
  if (!courseId) throw new Error('ระบุ course_id');
  var answers = data.answers || {};

  var quizzes = DB_readAll(SHEETS.QUIZZES).filter(function (q) { return String(q.course_id) === String(courseId); });
  if (quizzes.length === 0) throw new Error('ไม่พบข้อมูลข้อสอบในคอร์สเรียนนี้');

  var score = 0;
  var total = quizzes.length;

  quizzes.forEach(function (q) {
    var submittedAns = answers[String(q.id)];
    if (submittedAns != null && Number(submittedAns) === Number(q.correct_option)) {
      score++;
    }
  });

  var pct = Math.round(score * 100 / total);
  var isPassed = pct >= 80 ? 'yes' : 'no';

  var progress = DB_findOne(SHEETS.PROGRESS, function (x) {
    return String(x.user_id) === String(user.id) && String(x.course_id) === String(courseId);
  });

  var result;
  if (progress) {
    var finalPass = (progress.is_passed === 'yes' || isPassed === 'yes') ? 'yes' : 'no';
    var finalScore = Math.max(Number(progress.quiz_score || 0), score);
    result = await DB_update(SHEETS.PROGRESS, progress.id, {
      quiz_score: finalScore,
      quiz_total: total,
      is_passed: finalPass,
      updated_at: cfg_iso_(cfg_now_())
    });
  } else {
    result = await DB_insert(SHEETS.PROGRESS, {
      user_id: user.id,
      course_id: courseId,
      quiz_score: score,
      quiz_total: total,
      is_passed: isPassed
    });
  }

  await Audit_log_(user, 'quiz.submit', 'course', courseId, { score: score, total: total, is_passed: isPassed });
  return {
    score: score,
    total: total,
    percentage: pct,
    is_passed: isPassed === 'yes'
  };
}

function Courses_progressList(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var courseId = String(data.course_id || '').trim();
  if (!courseId) throw new Error('ระบุ course_id');

  var progress = DB_readAll(SHEETS.PROGRESS).filter(function (x) { return String(x.course_id) === String(courseId); });
  var users = DB_buildIndex(SHEETS.USERS);

  var items = progress.map(function (pg) {
    var u = users[pg.user_id] || {};
    return {
      user_id: pg.user_id,
      full_name: u.full_name || '-',
      department: u.department || '-',
      position: u.position || '-',
      quiz_score: Number(pg.quiz_score),
      quiz_total: Number(pg.quiz_total),
      is_passed: pg.is_passed,
      updated_at: pg.updated_at || pg.created_at
    };
  });

  return { items: items };
}

function AI_decodeHtml_(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function (_, n) {
      try { return String.fromCharCode(Number(n)); } catch (e) { return ''; }
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) {
      try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return ''; }
    });
}

function AI_cleanText_(text) {
  return AI_decodeHtml_(text).replace(/\s+/g, ' ').replace(/\u0000/g, '').trim();
}

function AI_attr_(tag, name) {
  var re = new RegExp(name + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var m = String(tag || '').match(re);
  return m ? AI_cleanText_(m[2]) : '';
}

function AI_meta_(html, key, attrName) {
  attrName = attrName || 'property';
  var re = /<meta\b[^>]*>/gi;
  var m;
  while ((m = re.exec(html))) {
    var tag = m[0];
    var prop = AI_attr_(tag, attrName) || AI_attr_(tag, attrName === 'property' ? 'name' : 'property');
    if (String(prop).toLowerCase() === String(key).toLowerCase()) return AI_attr_(tag, 'content');
  }
  return '';
}

function AI_extractHeadings_(html) {
  var items = [];
  var re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  var m;
  while ((m = re.exec(html)) && items.length < 18) {
    var text = AI_cleanText_(String(m[2]).replace(/<[^>]+>/g, ' '));
    if (text && items.indexOf(text) < 0) items.push(text);
  }
  return items;
}

function AI_extractPageText_(html) {
  var body = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');
  body = body.replace(/<(br|p|div|li|tr|td|section|article)\b[^>]*>/gi, '\n');
  body = body.replace(/<[^>]+>/g, ' ');
  var lines = AI_decodeHtml_(body).split(/\n+/).map(AI_cleanText_).filter(function (x) {
    return x && x.length > 25 && !/^Skip|^Menu|^Copyright/i.test(x);
  });
  var unique = [];
  lines.forEach(function (line) {
    if (unique.length < 80 && unique.indexOf(line) < 0) unique.push(line);
  });
  return unique.join('\n').substring(0, 12000);
}

function AI_assertFetchableUrl_(rawUrl) {
  var url = String(rawUrl || '').trim();
  if (!url) throw new Error('กรุณาระบุ Website URL');
  var u;
  try { u = new URL(url); } catch (e) { throw new Error('รูปแบบ Website URL ไม่ถูกต้อง'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('รองรับเฉพาะ http/https');
  var host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) throw new Error('ไม่อนุญาตให้ดึง URL ภายในระบบ');
  if (/^(10|127|169\.254|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(host)) throw new Error('ไม่อนุญาตให้ดึง private network URL');
  return u.toString();
}

async function AI_websiteExtract(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var url = AI_assertFetchableUrl_((p && p.url) || '');
  var controller = new AbortController();
  var timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, 15000);
  try {
    var res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; AvarinLMS/1.1; +https://averintshop.com)'
      }
    });
    if (!res.ok) throw new Error('ดึง Website ไม่สำเร็จ (HTTP ' + res.status + ')');
    var ct = String(res.headers.get('content-type') || '');
    if (ct && ct.indexOf('text/html') < 0 && ct.indexOf('application/xhtml') < 0) throw new Error('URL นี้ไม่ใช่หน้า HTML ที่อ่านได้');
    var html = await res.text();
    var titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    var title = titleMatch ? AI_cleanText_(titleMatch[1]) : '';
    var ogTitle = AI_meta_(html, 'og:title');
    var description = AI_meta_(html, 'description', 'name') || AI_meta_(html, 'og:description');
    var image = AI_meta_(html, 'og:image');
    var headings = AI_extractHeadings_(html);
    var text = AI_extractPageText_(html);
    if (!title && !description && headings.length === 0 && !text) throw new Error('อ่านเนื้อหาจาก Website ไม่ได้');
    return {
      url: url,
      title: ogTitle || title,
      description: description,
      image: image,
      headings: headings,
      text: text,
      text_sample: text.substring(0, 1800)
    };
  } finally {
    clearTimeout(timer);
  }
}

function AI_extractJson_(text) {
  var raw = String(text || '').trim();
  if (raw.indexOf('```') === 0) raw = raw.replace(/^```(?:json)?\s*|```\s*$/g, '').trim();
  var first = raw.indexOf('{');
  var last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) raw = raw.substring(first, last + 1);
  return JSON.parse(raw);
}

function AI_courseFallback_(title, sourceText) {
  var clean = AI_cleanText_(sourceText).substring(0, 900);
  return {
    course_title: title || 'คอร์สฝึกอบรมจากเอกสาร',
    objectives: ['เข้าใจเนื้อหาหลักจากเอกสาร', 'นำความรู้ไปใช้ในงานจริง', 'ผ่านการประเมินหลังเรียน'],
    difficulty: 'Beginner',
    duration_minutes: 60,
    passing_score: 80,
    lessons: [
      {
        title: 'บทที่ 1 ภาพรวมจากเอกสาร',
        summary: clean || 'สรุปเนื้อหาจากเอกสารที่แนบ',
        key_points: ['อ่านและเข้าใจเนื้อหาหลัก', 'จับประเด็นสำคัญ', 'เตรียมตอบคำถามหลังเรียน'],
        checklist: ['อ่านบทเรียนครบ', 'ทบทวน Key Point', 'ทำ Quiz']
      }
    ],
    flashcards: [
      { front: 'คอร์สนี้สร้างจากอะไร?', back: 'สร้างจากเอกสารหรือเว็บไซต์ที่ผู้ใช้แนบ' }
    ],
    quiz: [],
    final_exam: [],
    answer_key: [],
    certificate_requirement: 'เรียนครบทุกบทและสอบผ่านอย่างน้อย 80%',
    ai_tutor_seed: clean
  };
}

function AI_courseJsonSchema_() {
  return {
    type: 'object',
    additionalProperties: true,
    required: ['course_title','objectives','difficulty','duration_minutes','lessons','flashcards','quiz','final_exam','answer_key','passing_score','certificate_requirement','ai_tutor_seed'],
    properties: {
      course_title: { type: 'string' },
      objectives: { type: 'array', items: { type: 'string' } },
      difficulty: { type: 'string' },
      duration_minutes: { type: 'number' },
      lessons: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            checklist: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      flashcards: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { front: { type: 'string' }, back: { type: 'string' } } } },
      quiz: { type: 'array', items: { type: 'object', additionalProperties: true } },
      final_exam: { type: 'array', items: { type: 'object', additionalProperties: true } },
      answer_key: { type: 'array', items: { type: 'object', additionalProperties: true } },
      passing_score: { type: 'number' },
      certificate_requirement: { type: 'string' },
      ai_tutor_seed: { type: 'string' }
    }
  };
}

function AI_chunkText_(text, maxLen) {
  maxLen = maxLen || 1800;
  var src = String(text || '').replace(/\r/g, '').trim();
  var parts = src.split(/\n{2,}/);
  var chunks = [];
  var buf = '';
  parts.forEach(function (p) {
    p = AI_cleanText_(p);
    if (!p) return;
    if ((buf + '\n' + p).length > maxLen && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? (buf + '\n' + p) : p;
    }
  });
  if (buf) chunks.push(buf);
  if (chunks.length === 0 && src) {
    for (var i = 0; i < src.length; i += maxLen) chunks.push(src.substring(i, i + maxLen));
  }
  return chunks.slice(0, 80);
}

async function AI_openaiEmbedding_(apiKey, model, input) {
  var res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: model || 'text-embedding-3-small', input: input })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('OpenAI Embeddings HTTP ' + res.status + ': ' + errText.substring(0, 500));
  }
  var json = await res.json();
  if (!json.data || !json.data[0] || !json.data[0].embedding) throw new Error('OpenAI ไม่ส่ง embedding กลับมา');
  return json.data[0].embedding;
}

async function AI_courseIndex(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var courseId = String((p && p.course_id) || '').trim();
  if (!courseId) throw new Error('ระบุ course_id');
  var c = DB_findById(SHEETS.COURSES, courseId);
  if (!c) throw new Error('ไม่พบคอร์สเรียน');
  var openaiKey = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_api_key) || '').trim();
  if (!openaiKey) throw new Error('กรุณาระบุ OpenAI API Key ก่อนสร้าง RAG index');
  var embModel = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_embedding_model) || 'text-embedding-3-small').trim();
  var source = [
    c.title || '',
    c.description || '',
    c.content || '',
    c.ai_summary || '',
    c.ai_key_points || '',
    c.ai_flashcards || '',
    c.ai_checklist || '',
    c.ai_modules || '',
    c.ai_quiz || ''
  ].join('\n\n');
  var chunks = AI_chunkText_(source, 1800);
  var existing = DB_readAll(SHEETS.COURSE_CHUNKS).filter(function (x) { return String(x.course_id) === String(courseId); });
  for (var i = 0; i < existing.length; i++) await DB_delete(SHEETS.COURSE_CHUNKS, existing[i].id);
  for (var j = 0; j < chunks.length; j++) {
    var emb = await AI_openaiEmbedding_(openaiKey, embModel, chunks[j]);
    await DB_insert(SHEETS.COURSE_CHUNKS, {
      course_id: courseId,
      chunk_index: j,
      content: chunks[j],
      metadata: JSON.stringify({ title: c.title || '', model: embModel }),
      embedding: '[' + emb.join(',') + ']'
    });
  }
  await Audit_log_(user, 'ai.course_index', 'course', courseId, { chunks: chunks.length });
  return { course_id: courseId, chunks: chunks.length, embedding_model: embModel };
}

async function AI_tutorAsk(user, p) {
  var courseId = String((p && p.course_id) || '').trim();
  var question = String((p && p.question) || '').trim();
  if (!courseId) throw new Error('ระบุ course_id');
  if (!question) throw new Error('กรุณาระบุคำถาม');
  var c = DB_findById(SHEETS.COURSES, courseId);
  if (!c) throw new Error('ไม่พบคอร์สเรียน');
  var openaiKey = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_api_key) || '').trim();
  if (!openaiKey) throw new Error('กรุณาระบุ OpenAI API Key ก่อนใช้ AI Tutor');
  var embModel = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_embedding_model) || 'text-embedding-3-small').trim();
  var generationModel = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_generation_model) || 'gpt-5.5').trim();
  var qEmb = await AI_openaiEmbedding_(openaiKey, embModel, question);
  var rows = await sbRpc('match_course_chunks', {
    query_embedding: '[' + qEmb.join(',') + ']',
    match_course_id: courseId,
    match_count: 6
  });
  var context = (rows || []).map(function (r, i) { return '[' + (i + 1) + '] ' + r.content; }).join('\n\n');
  if (!context) context = [c.content || '', c.ai_summary || '', c.ai_key_points || ''].join('\n\n').substring(0, 5000);
  var prompt = 'ตอบคำถามผู้เรียนโดยอ้างอิงเฉพาะบริบทของคอร์สนี้ ถ้าไม่มีข้อมูลให้บอกว่าไม่มีข้อมูลในเอกสารคอร์ส\n'
    + 'คอร์ส: ' + (c.title || '') + '\n'
    + 'คำถาม: ' + question + '\n\n'
    + 'บริบท:\n' + context;
  var res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + openaiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: generationModel,
      input: [
        { role: 'system', content: 'You are an LMS AI Tutor. Answer in Thai, grounded only in the provided course context.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('OpenAI Tutor HTTP ' + res.status + ': ' + errText.substring(0, 500));
  }
  var json = await res.json();
  var answer = json.output_text || '';
  if (!answer && Array.isArray(json.output)) {
    json.output.forEach(function (item) {
      if (Array.isArray(item.content)) item.content.forEach(function (x) { if (x.text) answer += x.text; });
    });
  }
  return { answer: answer, sources: rows || [] };
}

async function AI_openaiResponsesJson_(apiKey, model, prompt) {
  var res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-5.5',
      input: [
        { role: 'system', content: 'You are an expert instructional designer. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'lms_course',
          strict: false,
          schema: AI_courseJsonSchema_()
        }
      }
    })
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('OpenAI HTTP ' + res.status + ': ' + errText.substring(0, 500));
  }
  var json = await res.json();
  var text = '';
  if (json.output_text) {
    text = json.output_text;
  } else if (Array.isArray(json.output)) {
    json.output.forEach(function (item) {
      if (Array.isArray(item.content)) {
        item.content.forEach(function (c) {
          if (c.text) text += c.text;
        });
      }
    });
  }
  if (!text) throw new Error('OpenAI ไม่ส่ง JSON text กลับมา');
  return AI_extractJson_(text);
}

async function AI_courseGenerate(user, p) {
  Auth_requireCap(user, 'setting.manage');
  var data = p || {};
  var title = String(data.title || '').trim();
  var sourceText = String(data.source_text || '').trim();
  var sourceName = String(data.source_name || '').trim();
  if (!sourceText || sourceText.length < 80) throw new Error('เนื้อหาจากเอกสาร/เว็บไซต์น้อยเกินไปสำหรับสร้างคอร์ส');

  var prompt = 'คุณคือผู้เชี่ยวชาญด้าน Instructional Design\n'
    + 'สร้างคอร์สฝึกอบรมจากเอกสารนี้\n'
    + 'ตอบเป็น JSON object เท่านั้น ห้ามใส่ markdown หรือคำอธิบายนอก JSON\n'
    + 'ผลลัพธ์ต้องมี keys ต่อไปนี้:\n'
    + 'course_title, objectives, difficulty, duration_minutes, lessons, flashcards, quiz, final_exam, answer_key, passing_score, certificate_requirement, ai_tutor_seed\n'
    + 'ข้อกำหนด:\n'
    + '1. ชื่อคอร์ส\n'
    + '2. วัตถุประสงค์\n'
    + '3. ระดับความยาก\n'
    + '4. ระยะเวลาเรียน\n'
    + '5. แบ่งเป็นบท\n'
    + '6. สรุปแต่ละบท\n'
    + '7. Key Point\n'
    + '8. Checklist\n'
    + '9. Flash Card\n'
    + '10. Quiz 10 ข้อ\n'
    + '11. Final Exam 30 ข้อ\n'
    + '12. เฉลยพร้อมเหตุผล\n'
    + '13. เกณฑ์ผ่าน\n'
    + '14. Certificate Requirement\n'
    + 'โครงสร้าง lessons เป็น array ของ {title, summary, key_points, checklist}\n'
    + 'flashcards เป็น array ของ {front, back}\n'
    + 'quiz และ final_exam เป็น array ของ {type, question, options, answer, explanation}\n'
    + 'answer_key รวมเฉลยทั้งหมดพร้อมเหตุผล\n'
    + 'ถ้าเอกสารเป็นสินค้า ให้เน้น training สำหรับพนักงานขายหน้าร้าน\n\n'
    + 'หัวข้อที่ผู้ใช้กรอก: ' + title + '\n'
    + 'แหล่งข้อมูล: ' + sourceName + '\n'
    + 'เอกสาร:\n' + sourceText.substring(0, 50000);

  var openaiKey = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_api_key) || '').trim();
  if (openaiKey) {
    var openaiModel = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.openai_generation_model) || 'gpt-5.5').trim();
    var openaiCourse = await AI_openaiResponsesJson_(openaiKey, openaiModel, prompt);
    if (!openaiCourse.course_title) openaiCourse.course_title = title || 'คอร์สฝึกอบรมจากเอกสาร';
    return { provider: 'openai', model: openaiModel, course: openaiCourse, raw: JSON.stringify(openaiCourse) };
  }

  var apiKey = String((GLOBAL_SETTINGS && GLOBAL_SETTINGS.google_gemini_api_key) || '').trim();
  if (!apiKey) throw new Error('กรุณาระบุ OpenAI API Key หรือ Google Gemini API Key ในหน้าตั้งค่าระบบก่อนใช้งาน AI Generate');

  var models = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
    'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=' + apiKey
  ];
  var lastErr = null;
  for (var i = 0; i < models.length; i++) {
    try {
      var payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: models[i].indexOf('/v1beta/') >= 0
          ? { response_mime_type: 'application/json', temperature: 0.3 }
          : { responseMimeType: 'application/json', temperature: 0.3 }
      };
      var res = await fetch(models[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        var errText = await res.text();
        throw new Error('Gemini HTTP ' + res.status + ': ' + errText.substring(0, 300));
      }
      var json = await res.json();
      var text = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
      if (!text) throw new Error('Gemini ไม่ส่งข้อความ JSON กลับมา');
      var course = AI_extractJson_(text);
      if (!course.course_title) course.course_title = title || 'คอร์สฝึกอบรมจากเอกสาร';
      return { course: course, raw: text };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('สร้างคอร์สด้วย AI ไม่สำเร็จ');
}

// === CLOUDFLARE R2 INTEGRATION ===
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') || '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') || '';
const R2_ENDPOINT = Deno.env.get('R2_ENDPOINT') || '';
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME') || '';
const R2_PUBLIC_URL_PREFIX = Deno.env.get('R2_PUBLIC_URL_PREFIX') || '';

let s3Client: any = null;
function getS3Client() {
  if (!s3Client) {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
      throw new Error("Missing R2 environment configuration (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT).");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

async function R2_getUploadUrl(user, p) {
  if (!user) throw new Error("Unauthorized");
  var filename = String(p.filename || "").trim();
  var contentType = String(p.contentType || "application/octet-stream").trim();
  if (!filename) throw new Error("Require filename");

  var ext = filename.split('.').pop() || '';
  var cleanName = filename.replace(/[^a-zA-Z0-9_\.-]/g, '_');
  var stamp = Date.now();
  var rand = String(crypto.randomUUID()).replace(/-/g, '').slice(0, 8);
  var path = `uploads/${user.id}/${stamp}_${rand}_${cleanName}`;

  var client = getS3Client();
  var command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: path,
    ContentType: contentType,
  });

  var uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  var publicUrl = `${R2_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${path}`;

  return {
    uploadUrl: uploadUrl,
    publicUrl: publicUrl,
    path: path
  };
}

async function R2_upload(user, p) {
  if (!user) throw new Error("Unauthorized");
  var filename = String(p.filename || "receipt.jpg").trim();
  var contentType = String(p.contentType || "image/jpeg").trim();
  var base64Data = String(p.base64 || "").trim();
  if (!base64Data) throw new Error("Require base64 data");

  var ext = filename.split('.').pop() || 'jpg';
  var cleanName = filename.replace(/[^a-zA-Z0-9_\.-]/g, '_');
  var stamp = Date.now();
  var rand = String(crypto.randomUUID()).replace(/-/g, '').slice(0, 8);
  var path = `uploads/${user.id}/${stamp}_${rand}_${cleanName}`;

  var cleanB64 = base64Data.split(',').pop() || '';
  var binaryString = atob(cleanB64);
  var len = binaryString.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  var client = getS3Client();
  var command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: path,
    ContentType: contentType,
    Body: bytes
  });
  await client.send(command);

  var publicUrl = `${R2_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${path}`;
  return {
    publicUrl: publicUrl,
    path: path
  };
}

async function R2_migrateLegacyData(user) {
  if (user.role !== 'admin') {
    throw new Error('Only admin can run data migration');
  }

  var summary = {
    avatars_migrated: 0,
    receipts_migrated: 0,
    errors: []
  };

  function base64ToBytes(base64Str) {
    var cleanB64 = base64Str.split(',').pop() || '';
    var binaryString = atob(cleanB64);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  var client = getS3Client();

  // 1. Migrate Users Avatars
  try {
    var users = await sbFetch('GET', 'Users', 'select=id,full_name,avatar', null);
    if (Array.isArray(users)) {
      for (var u of users) {
        if (u.avatar && u.avatar.indexOf('data:image/') === 0) {
          try {
            var bytes = base64ToBytes(u.avatar);
            var mime = u.avatar.split(';')[0].split(':')[1] || 'image/jpeg';
            var ext = mime.split('/')[1] || 'jpg';
            var path = `uploads/${u.id}/avatar_migrated_${Date.now()}.${ext}`;

            var command = new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: path,
              ContentType: mime,
              Body: bytes
            });
            await client.send(command);

            var newUrl = `${R2_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${path}`;
            await sbFetch('PATCH', 'Users', `id=eq.${u.id}`, { avatar: newUrl });
            summary.avatars_migrated++;
          } catch (e) {
            summary.errors.push(`User ${u.id} avatar failed: ${e.message}`);
          }
        }
      }
    }
  } catch (e) {
    summary.errors.push(`Users fetch/migration failed: ${e.message}`);
  }

  // 2. Migrate Expenses Receipts
  try {
    var expenses = await sbFetch('GET', 'Expenses', 'select=id,expense_no,receipt_url', null);
    if (Array.isArray(expenses)) {
      for (var ex of expenses) {
        if (!ex.receipt_url) continue;

        var urls = [];
        var isJSON = false;
        if (ex.receipt_url.indexOf('[') === 0) {
          try {
            urls = JSON.parse(ex.receipt_url);
            isJSON = true;
          } catch (e) {
            urls = [ex.receipt_url];
          }
        } else {
          urls = [ex.receipt_url];
        }

        var newUrls = [];
        var modified = false;

        for (var url of urls) {
          if (!url) continue;

          if (url.indexOf('data:image/') === 0) {
            try {
              var bytes = base64ToBytes(url);
              var mime = url.split(';')[0].split(':')[1] || 'image/jpeg';
              var ext = mime.split('/')[1] || 'jpg';
              var path = `uploads/legacy_migration/receipt_${ex.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

              var command = new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: path,
                ContentType: mime,
                Body: bytes
              });
              await client.send(command);

              var newUrl = `${R2_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${path}`;
              newUrls.push(newUrl);
              modified = true;
              summary.receipts_migrated++;
            } catch (e) {
              summary.errors.push(`Expense ${ex.expense_no} base64 migration failed: ${e.message}`);
              newUrls.push(url);
            }
          } else if (url.indexOf('/storage/v1/object/public/receipts/') >= 0) {
            try {
              var parts = url.split('/storage/v1/object/public/receipts/');
              var relativePath = parts.pop();
              if (relativePath) {
                var fileRes = await fetch(url);
                if (fileRes.ok) {
                  var blobBytes = new Uint8Array(await fileRes.arrayBuffer());
                  var mime = fileRes.headers.get('content-type') || 'image/jpeg';
                  var path = `receipts/${decodeURIComponent(relativePath)}`;

                  var command = new PutObjectCommand({
                    Bucket: R2_BUCKET_NAME,
                    Key: path,
                    ContentType: mime,
                    Body: blobBytes
                  });
                  await client.send(command);

                  var newUrl = `${R2_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${path}`;
                  newUrls.push(newUrl);
                  modified = true;
                  summary.receipts_migrated++;
                } else {
                  throw new Error(`Fetch failed: ${fileRes.status}`);
                }
              } else {
                newUrls.push(url);
              }
            } catch (e) {
              summary.errors.push(`Expense ${ex.expense_no} Supabase storage migration failed: ${e.message}`);
              newUrls.push(url);
            }
          } else {
            newUrls.push(url);
          }
        }

        if (modified) {
          var receiptStr = isJSON ? JSON.stringify(newUrls) : (newUrls[0] || '');
          await sbFetch('PATCH', 'Expenses', `id=eq.${ex.id}`, { receipt_url: receiptStr });
        }
      }
    }
  } catch (e) {
    summary.errors.push(`Expenses fetch/migration failed: ${e.message}`);
  }

  return summary;
}

// === SERVE HANDLER ===
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    
    // Clear and reset cache to prevent cross-request leakage
    DB_CACHE = {};
    
    const originHeader = req.headers.get("origin") || req.headers.get("referer");
    let requestOrigin = "";
    if (originHeader) {
      try {
        const u = new URL(originHeader);
        let path = u.pathname || "/";
        if (path.endsWith(".html") || path.endsWith(".js")) {
          path = path.substring(0, path.lastIndexOf("/") + 1);
        }
        if (!path.endsWith("/")) {
          path += "/";
        }
        requestOrigin = u.origin + path;
      } catch (e) {}
    }
    if (requestOrigin && !requestOrigin.endsWith("/")) {
      requestOrigin += "/";
    }
    REQUEST_ORIGIN = requestOrigin || "http://localhost:8000/";

    const result = await api(reqBody);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message || String(error) }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
