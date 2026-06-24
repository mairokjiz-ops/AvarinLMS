// === SUPABASE EDGE FUNCTION: line-webhook ===
// Generated automatically by build.py

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// === ENVIRONMENT VARIABLES ===
const DENO_SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const DENO_SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_RECEIPT_BUCKET = 'receipts';

// === GLOBAL CACHE OBJECTS ===
let GLOBAL_SETTINGS: any = {};
let GLOBAL_HOLIDAYS: any = {};

// === MOCK GAS ENVIRONMENT ===
class ScriptCache {
  private map = new Map<string, { val: string, exp: number }>();
  get(key: string) {
    const item = this.map.get(key);
    if (!item) return null;
    if (Date.now() > item.exp) {
      this.map.delete(key);
      return null;
    }
    return item.val;
  }
  put(key: string, value: string, ttl: number = 600) {
    this.map.set(key, { val: value, exp: Date.now() + ttl * 1000 });
  }
  remove(key: string) {
    this.map.delete(key);
  }
}

// IMPORTANT: return the same cache instance every time.
// Returning a new ScriptCache on each call caused LINE flow state
// (leave/expense step data) to disappear immediately between webhook events.
const GLOBAL_SCRIPT_CACHE = new ScriptCache();
const CacheService = {
  getScriptCache: () => GLOBAL_SCRIPT_CACHE
};

const UrlFetchApp = {
  fetch: async (url: string, options: any) => {
    const headers = { ...options.headers };
    if (options.contentType && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = options.contentType;
    }
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.payload
    });
    const text = await res.text();
    return {
      getContentText: () => text,
      getResponseCode: () => res.status
    };
  }
};

const ContentService = {
  createTextOutput: (text: string) => {
    return {
      setMimeType: (mime: string) => {
        return new Response(text, {
          headers: { 'Content-Type': mime === 'application/json' ? 'application/json' : 'text/plain' }
        });
      }
    };
  },
  MimeType: {
    JSON: 'application/json'
  }
};

// === SIGNATURE VERIFICATION ===
async function verifySignature(body: string, signature: string, channelSecret: string): Promise<boolean> {
  try {
    if (!signature || !channelSecret) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify", "sign"]
    );
    const sigBuf = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const dataBuf = encoder.encode(body);
    return await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

// === BACKEND JS MODULES ===
// === UTILITIES POLYFILL FOR GITHUB PAGES (GAS SHIM) ===
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
  // web portal url
  web_url: 'https://mairokjiz-ops.github.io/AvarinLMS/',
  // email settings
  email_from_alias: ''
});
const SETTINGS_SENSITIVE = Object.freeze([]);  // ไม่มี secret ในระบบนี้
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


// === SUPABASE DB LAYER (MEMORY-CACHED SYNCHRONOUS READS) ===
var SUPABASE_URL = 'https://djcvqxjwakiorahdiwwk.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqY3ZxeGp3YWtpb3JhaGRpd3drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDk4MjUsImV4cCI6MjA5NzQyNTgyNX0.efr2QuUfbk8WNK8I9A-ga4OKzJal7w_dNKoICXX1nPQ';

var DB_CACHE = {};

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

function _dbIdCol_(table) {
  if (table === 'Settings') return 'key';
  if (table === 'Sessions') return 'token';
  return 'id';
}

// Warm only the database tables that are needed for the current request.
// If no table list is provided, keep the legacy behavior and warm everything.
async function DB_warmCache(tables) {
  var defaultTables = ['Users', 'Leaves', 'Sessions', 'Settings', 'AuditLog', 'Missions', 'Expenses', 'Holidays'];
  var list = Array.isArray(tables) && tables.length ? tables.slice() : defaultTables.slice();
  var seen = {};
  list = list.filter(function (t) {
    if (!t || seen[t]) return false;
    seen[t] = true;
    return true;
  });

  await Promise.all(list.map(async function (t) {
    if (DB_CACHE[t]) return;
    var rows = await sbFetch('GET', t, 'select=*&limit=10000');
    DB_CACHE[t] = rows || [];
  }));
}

// Synchronous Reads!
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

// Asynchronous Writes!
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
  
  // Call Supabase API
  var rows = await sbFetch('POST', table, '', data);
  var inserted = Array.isArray(rows) ? rows[0] : rows;
  
  // Update local cache
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
  
  // Call Supabase API
  var rows = await sbFetch('PATCH', table, idCol + '=eq.' + encodeURIComponent(id), patch);
  var updated = Array.isArray(rows) ? rows[0] : rows;
  
  // Update local cache
  var cacheRows = DB_readAll(table);
  var row = cacheRows.find(function(r) { return String(r[idCol]) === String(id); });
  if (row) {
    Object.assign(row, updated || patch);
  }
  
  return updated || patch;
}

async function DB_delete(table, id) {
  var idCol = _dbIdCol_(table);
  
  // Call Supabase API
  await sbFetch('DELETE', table, idCol + '=eq.' + encodeURIComponent(id));
  
  // Update local cache
  if (DB_CACHE[table]) {
    DB_CACHE[table] = DB_CACHE[table].filter(function(r) { return String(r[idCol]) !== String(id); });
  }
  
  return { ok: true };
}

// ============================================================
// LINE cache warm-up helpers (load only the tables each event needs)
// ============================================================
function _LINE_uniqueTables_(arr) {
  var out = [];
  var seen = {};
  (arr || []).forEach(function (t) {
    if (!t || seen[t]) return;
    seen[t] = 1;
    out.push(t);
  });
  return out;
}

function _LINE_tablesForEvent_(event) {
  var tables = ['Users', 'Settings'];
  if (!event) return tables;

  var txt = '';
  if (event.type === 'message' && event.message && event.message.type === 'text') {
    txt = String(event.message.text || '').trim().toLowerCase();
    var state = null;
    try { state = _LINE_getStateSync_(String(event.source && event.source.userId || '')); } catch (e) { state = null; }

    // State-driven branches
    if (state && String(state.step || '').indexOf('expense_') === 0) {
      if (state.step === 'expense_confirm') tables.push('Expenses');
    }
    if (state && (state.step === 'enter_reason' || state.step === 'confirm')) {
      tables.push('Leaves', 'Holidays');
    }

    // Text commands
    if (txt === 'รายการเบิก' || txt === 'expense list' || txt === 'my expense') {
      tables.push('Expenses');
    }
    if (txt === 'ขอลา' || txt === 'ยื่นใบลา' || txt === 'ลา' || txt === 'leave') {
      tables.push('Leaves', 'Holidays');
    }
    if (txt === 'check quota' || txt === 'เช็กสิทธิ์วันลาคงเหลือ' || txt === 'check_status' || txt === 'ติดตามสถานะใบลาล่าสุด') {
      tables.push('Leaves', 'Holidays');
    }
    if (txt === 'pending leaves' || txt === 'ใบลาค้าง' || txt === 'ใบลาค้างอนุมัติ') {
      tables.push('Leaves', 'Holidays');
    }
    if (txt === 'เบิกค่าใช้จ่าย' || txt === 'เบิก' || txt === 'expense') {
      // no extra table needed yet
    }
  } else if (event.type === 'postback') {
    var params = _LINE_parseQueryString_(event.postback && event.postback.data || '');
    var action = String(params.action || '');

    if (action.indexOf('expense_') === 0) {
      if (action === 'expense_my_list' || action === 'expense_pending' || action === 'expense_confirm_yes' || action === 'expense_decision') {
        tables.push('Expenses');
      }
    }

    if (action.indexOf('submit_') === 0 || action === 'pending_leaves' || action === 'leave_decision' || action === 'check_quota' || action === 'check_status') {
      tables.push('Leaves', 'Holidays');
    }

    if (action === 'portal') {
      // portal only needs user + settings
    }
  } else if (event.type === 'follow') {
    // user + settings only
  }

  return _LINE_uniqueTables_(tables);
}

async function LINE_warmTablesForEvents_(events) {
  var tables = ['Users', 'Settings'];
  (events || []).forEach(function (event) {
    var t = _LINE_tablesForEvent_(event);
    t.forEach(function (x) { tables.push(x); });
  });
  await DB_warmCache(_LINE_uniqueTables_(tables));
}

function DB_invalidate(name) {}
function DB_invalidateAll() {}
function DB_ensureSchema_(name) {}
function DB_sheet_(name) { return null; }
function DB_initAllSchemas() {}

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
  Auth_requireCap(user, 'leave.create_own');  // ผู้ใช้ทุกคนทำได้
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

async function Auth_bootstrap(token) {
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
      var u = await Auth_verify_(token);
      bundle.me = Auth_publicUser_(u);
      bundle.caps = CAPS[u.role] || [];
    } catch (e) { /* token expired/invalid — return guest payload */ }
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
      is_active: data.is_active === false ? 'no' : 'yes'
    };
    if (data.password) {
      var salt = cfg_salt_();
      patch.salt = salt; patch.password_hash = await cfg_hash_(data.password, salt);
    }
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
      is_active: data.is_active === false ? 'no' : 'yes'
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
  // Soft block: ถ้ามีใบลาแล้ว → disable แทนการลบ
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
    avatar: String(data.avatar || '').trim()
  };
  if (!patch.full_name) throw new Error('กรุณากรอกชื่อ-สกุล');
  var updated = await DB_update(SHEETS.USERS, user.id, patch);
  await Audit_log_(user, 'user.update_profile', 'user', user.id, {});
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
async function Users_register(p) {
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
  var newU = await DB_insert(SHEETS.USERS, {
    username: username,
    password_hash: await cfg_hash_(pwd, salt),
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
async function Users_approveRegistration(user, p) {
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
    var updated = await DB_update(SHEETS.USERS, id, { is_active: 'yes', role: role });
    await Audit_log_(user, 'user.approve_registration', 'user', id, { username: u.username, role: role });
    // แจ้งพนักงานว่าถูกอนุมัติแล้ว
    try { Notify_onRegistrationApproved_(u, role, user); } catch (e) {}
    return { ok: true, mode: 'approved', user: Auth_publicUser_(updated) };
  } else {
    // reject → ลบออกหรือ is_active=no
    var hasLeaves = DB_readAll(SHEETS.LEAVES).some(function (lv) { return String(lv.requester_id) === String(id); });
    if (hasLeaves) {
      await DB_update(SHEETS.USERS, id, { is_active: 'no' });
    } else {
      await DB_delete(SHEETS.USERS, id);
    }
    await Audit_log_(user, 'user.reject_registration', 'user', id, { username: u.username, reason: rejectReason });
    // แจ้งพนักงานว่าถูกปฏิเสธ
    try { Notify_onRegistrationRejected_(u, rejectReason, user); } catch (e) {}
    return { ok: true, mode: 'rejected' };
  }
}

/**
 * คืนค่ารหัสเชื่อมต่อ LINE (line_connect_code)
 * หากยังไม่มี จะสร้างขึ้นมาใหม่ (รูปแบบ LMS-XXXXXX)
 */
async function Users_getConnectCode(user) {
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
    await DB_update(SHEETS.USERS, user.id, { line_connect_code: code });
    DB_invalidate(SHEETS.USERS);
  }
  
  return { connected: false, code: code };
}

/**
 * ยกเลิกการเชื่อมต่อ LINE
 */
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

// คืน array ของ status ที่ role นี้ "รับผิดชอบดำเนินการ" ตอนนี้ (ขึ้นกับ stages)
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
    // Defensive: ถ้ามีใบเก่าค้างใน CHECKED ก่อนเปลี่ยน stages → approver รับช่วงได้
    if (stages !== 3) out.push(STATUS.CHECKED);
  }
  // unique
  var seen = {}; var result = [];
  out.forEach(function (s) { if (!seen[s]) { seen[s] = 1; result.push(s); } });
  return result;
}

// คำนวณวันลาที่ใช้ไปแล้วในปีงบประมาณนี้ (อนุมัติแล้วเท่านั้น)
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
    var limit = _leaveLimit_(t);
    stats[t] = {
      used: used,
      limit: limit,
      remaining: Math.max(0, limit - used),
      percent: limit > 0 ? Math.round(used * 100 / limit) : 0
    };
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

// ── Public API ─────────────────────────────────────────────

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

// helper for client preview ก่อนยื่น
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

  // limit warning (ไม่ block — admin override ผ่าน reason ได้, แต่บอก warn)
  var stats = _leaveStats_(user.id, fy);
  var s = stats.items[data.leave_type];
  var afterUsed = s.used + days;
  var over = (s.limit > 0) && (afterUsed > s.limit);

  // pull last leave (ลาครั้งสุดท้าย)
  var last = _findLastLeave_(user.id, startISO);

  var leaveNo = _genLeaveNo_();
  var status = data.draft ? STATUS.DRAFT : STATUS.PENDING;

  var newLv = await DB_insert(SHEETS.LEAVES, {
    leave_no: leaveNo,
    requester_id: user.id,
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
    contact_phone: String(data.contact_phone || user.phone || '').trim(),
    last_leave_type: last ? last.leave_type : '',
    last_leave_start: last ? last.start_date : '',
    last_leave_end: last ? last.end_date : '',
    last_leave_days: last ? Number(last.days || 0) : '',
    status: status,
    written_at: writtenAt,
    written_place: String(data.written_place || '').trim(),
    fiscal_year: fy,
    attachment_url: String(data.attachment_url || '').trim()
  });
  await Audit_log_(user, 'leave.create', 'leave', newLv.id, {
    leave_no: leaveNo, type: data.leave_type, days: days, status: status, over_limit: over
  });
  // แจ้งเตือน email เมื่อยื่นใบลาทันที (ไม่ใช่ draft)
  if (status === STATUS.PENDING) {
    Notify_onLeaveSubmit_(newLv, user);
  }
  return { leave: newLv, over_limit: over, after_used: afterUsed, limit: s.limit };
}

async function Leaves_update(user, p) {
  var data = p || {};
  if (!data.id) throw new Error('ระบุ id ของใบลา');
  var lv = DB_findById(SHEETS.LEAVES, data.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // เจ้าของแก้ได้เฉพาะตอน draft หรือ pending
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
  var updated = await DB_update(SHEETS.LEAVES, data.id, patch);
  await Audit_log_(user, 'leave.update', 'leave', lv.id, { fields: Object.keys(patch) });
  return updated;
}

async function Leaves_submit(user, p) {
  // ส่งใบลา draft → pending
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  if (String(lv.requester_id) !== String(user.id)) Auth_requireCap(user, 'leave.manage');
  if (lv.status !== STATUS.DRAFT) throw new Error('ใบลานี้ไม่ใช่ฉบับร่าง');
  var updated = await DB_update(SHEETS.LEAVES, lv.id, { status: STATUS.PENDING });
  await Audit_log_(user, 'leave.submit', 'leave', lv.id, {});
  // แจ้งเตือน email เมื่อส่งใบลา draft → pending
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
  return updated;
}

async function Leaves_comment(user, p) {
  Auth_requireCap(user, 'leave.comment');
  var stages = _stages_();
  if (stages < 2) throw new Error('ระบบไม่ได้เปิดขั้นตอนความเห็นผู้บังคับบัญชา (กำหนดเป็น ' + stages + ' ขั้น)');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // stages=3: รอ CHECKED ก่อน · stages=2: รับจาก PENDING โดยตรง · รับ CHECKED ด้วย (กรณีใบเก่าค้าง)
  var ok = (lv.status === STATUS.CHECKED) || (stages === 2 && lv.status === STATUS.PENDING);
  if (!ok) throw new Error('ใบลานี้ไม่อยู่ในสถานะที่ให้ความเห็นได้');
  var updated = await DB_update(SHEETS.LEAVES, lv.id, {
    status: STATUS.REVIEWED,
    supervisor_id: user.id,
    supervisor_comment: String((p && p.comment) || '').trim(),
    supervisor_at: cfg_iso_(cfg_now_())
  });
  await Audit_log_(user, 'leave.comment', 'leave', lv.id, {});
  return updated;
}

async function Leaves_approve(user, p) {
  Auth_requireCap(user, 'leave.approve');
  var stages = _stages_();
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  // ตามขั้น:
  // stages=1 → PENDING
  // stages=2 → REVIEWED (+ defensive: PENDING/CHECKED ถ้ามีใบค้าง)
  // stages=3 → REVIEWED (+ defensive: CHECKED ถ้ามีใบค้าง)
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
  // ดึงข้อมูลผู้ยื่นคำขอลา
  var requesterUser = DB_findById(SHEETS.USERS, lv.requester_id);

  // แจ้งเตือน HR/Admin เมื่ออนุมัติใบลา
  if (newStatus === STATUS.APPROVED) {
    Notify_onLeaveApproved_(updated, requesterUser, user);
  }

  // แจ้งเตือนผลลัพธ์กลับไปยังผู้ยื่นใบลาทางอีเมล
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
  Auth_requireCap(user, 'leave.delete');
  var lv = DB_findById(SHEETS.LEAVES, p && p.id);
  if (!lv) throw new Error('ไม่พบใบลา');
  await DB_delete(SHEETS.LEAVES, lv.id);
  await Audit_log_(user, 'leave.delete', 'leave', lv.id, { leave_no: lv.leave_no });
  return { ok: true };
}

// ── Lookup / List ────────────────────────────────────────

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
  var scope = String(data.scope || 'mine');  // mine | all | pending_action
  var rows = DB_readAll(SHEETS.LEAVES);
  var users = DB_buildIndex(SHEETS.USERS);

  if (scope === 'mine') {
    rows = rows.filter(function (r) { return String(r.requester_id) === String(user.id); });
  } else if (scope === 'all') {
    Auth_requireCap(user, 'leave.view_all');
  } else if (scope === 'pending_action') {
    // งานที่รอ role นี้ดำเนินการ — ขึ้นกับ approval_stages
    var inboxStatuses = _inboxStatusesFor_(user.role);
    if (inboxStatuses.length === 0) rows = [];
    else rows = rows.filter(function (r) { return inboxStatuses.indexOf(r.status) >= 0; });
  }
  // filters
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

  // sort: latest created first
  rows.sort(function (a, b) { return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });

  // pagination
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
  if (String(lv.requester_id) !== String(user.id)) {
    if (!hasCap_(user.role, 'leave.view_all')) throw new Error('คุณไม่มีสิทธิ์ดูใบลาของผู้อื่น');
  }
  var users = DB_buildIndex(SHEETS.USERS);
  var settings = Settings_get_public_();
  return {
    leave: _enrichLeave_(lv, users),
    org: { name: settings.org_name, address: settings.org_address, phone: settings.org_phone, email: settings.org_email }
  };
}

// Workflow board: counts per status (สำหรับ dashboard)
function Leaves_workflow_counts(user) {
  Auth_requireCap(user, 'leave.view_all');
  var rows = DB_readAll(SHEETS.LEAVES);
  var by = {};
  Object.keys(STATUS_LABEL).forEach(function (s) { by[s] = 0; });
  rows.forEach(function (r) { if (by[r.status] != null) by[r.status]++; });
  return { total: rows.length, by_status: by };
}

// Workflow definition สำหรับ client (timeline + action buttons)
function Leaves_workflow_def(user) {
  return { stages: _stages_() };
}


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


function _settingsMap_() {
  var rows = DB_readAll(SHEETS.SETTINGS);
  var map = {};
  rows.forEach(function (r) {
    var key = String(r.key || '');
    if (key.indexOf('line_state:') === 0) return; // internal LINE flow state, do not expose via app settings
    map[key] = String(r.value == null ? '' : r.value);
  });
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
  // await Settings_ensureDefaults_();
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
  // await Settings_ensureDefaults_();
  var map = _settingsMap_();
  if (hasCap_(user.role, 'setting.manage')) {
    var all = {};
    Object.keys(SETTINGS_DEFAULTS).forEach(function (k) { all[k] = (k in map) ? map[k] : SETTINGS_DEFAULTS[k]; });
    return all;
  }
  // ผู้ใช้ทั่วไป → ส่ง public
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

async function Seed_resetDemoPasswords_() {
  var n = 0;
  for (var i = 0; i < DEMO_USERS.length; i++) {
    var du = DEMO_USERS[i];
    var u = DB_findOne(SHEETS.USERS, function (x) { return String(x.username || '').toLowerCase() === du.username; });
    if (!u) continue;
    var salt = cfg_salt_();
    await DB_update(SHEETS.USERS, u.id, {
      salt: salt,
      password_hash: await cfg_hash_(DEMO_PASSWORD, salt),
      is_active: 'yes'
    });
    n++;
  }
  return n;
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
        last_leave_type: '',
        last_leave_start: '',
        last_leave_end: '',
        last_leave_days: '',
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

async function Seed_clearAll_() {
  var tables = ['Expenses', 'Missions', 'Leaves', 'Sessions', 'AuditLog', 'Holidays', 'Settings', 'Users'];
  for (var i = 0; i < tables.length; i++) {
    await sbFetch('DELETE', tables[i], '');
  }
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
    { date: year + '-04-06', name: 'วันจักรี' },
    { date: year + '-04-13', name: 'วันสงกรานต์' },
    { date: year + '-04-14', name: 'วันสงกรานต์' },
    { date: year + '-04-15', name: 'วันสงกรานต์' },
    { date: year + '-05-01', name: 'วันแรงงานแห่งชาติ' },
    { date: year + '-05-04', name: 'วันฉัตรมงคล' },
    { date: year + '-06-03', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี' },
    { date: year + '-07-28', name: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว' },
    { date: year + '-08-12', name: 'วันแม่แห่งชาติ' },
    { date: year + '-10-13', name: 'วันคล้ายวันสวรรคต ร.9' },
    { date: year + '-10-23', name: 'วันปิยมหาราช' },
    { date: year + '-12-05', name: 'วันพ่อแห่งชาติ' },
    { date: year + '-12-10', name: 'วันรัฐธรรมนูญ' },
    { date: year + '-12-31', name: 'วันสิ้นปี' }
  ];
  
  var created = 0;
  for (var i = 0; i < defaults.length; i++) {
    var h = defaults[i];
    var dateStr = h.date;
    var exists = DB_findOne(SHEETS.HOLIDAYS, function (x) { return String(x.holiday_date) === dateStr; });
    if (exists) continue;
    await DB_insert(SHEETS.HOLIDAYS, {
      holiday_date: dateStr,
      name: h.name
    });
    created++;
  }
  return created;
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
async function Mission_create(user, p) {
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
  var m = await DB_insert(SHEETS.MISSIONS, { mission_no: _wf_missionNo_(), requester_id: user.id, title: String(data.title || '').trim(), purpose: String(data.purpose || '').trim(), destination: String(data.destination || '').trim(), start_date: start, end_date: end, transport_type: String(data.transport_type || '').trim(), requested_amount: data.requested_amount ? Number(data.requested_amount) : null, status: STATUS.PENDING, approver_id: null, approver_comment: '', approver_at: null, approved_amount: null });
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
  ['title','purpose','destination','transport_type'].forEach(function (k) { if (typeof data[k] !== 'undefined') patch[k] = String(data[k] || '').trim(); });
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

function _wf_expenseSummary_(rows) {
  var out = {
    total_count: 0,
    total_amount: 0,
    draft_count: 0,
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
    cancelled_count: 0,
    approved_amount: 0
  };
  (rows || []).forEach(function (r) {
    out.total_count++;
    out.total_amount += Number(r.amount || 0);
    if (r.status === STATUS.DRAFT) out.draft_count++;
    else if (r.status === STATUS.PENDING) out.pending_count++;
    else if (r.status === STATUS.APPROVED) {
      out.approved_count++;
      out.approved_amount += Number(r.approved_amount != null && r.approved_amount !== '' ? r.approved_amount : r.amount || 0);
    } else if (r.status === STATUS.REJECTED) {
      out.rejected_count++;
    } else if (r.status === STATUS.CANCELLED) {
      out.cancelled_count++;
    }
  });
  return out;
}

function Expense_summary(user, p) {
  var items = _wf_visibleExpenseRows_(user, p || {});
  return { summary: _wf_expenseSummary_(items), items: items.slice(0, 10) };
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
    if (String(owner.department || '') !== String(user.department || '')) {
      throw new Error('คุณไม่มีสิทธิ์ดูรายการนี้');
    }
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
    status: status,
    approver_id: null,
    approver_comment: '',
    approver_at: null,
    approved_amount: null,
    created_by: user.id
  });
  
  await Audit_log_(user, 'expense.create', 'expense', ex.id, { expense_no: ex.expense_no, status: status });
  
  if (status === STATUS.PENDING && !data.skip_notify) {
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
  ['description', 'expense_type', 'receipt_url'].forEach(function (k) {
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

// ── 12_Holidays.gs — Holiday Management Module ───────────────────────────────────
// Holidays_list(user, p)
// await Holidays_upsert(user, p)
// await Holidays_delete(user, p)
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
    // Prevent duplicate holiday dates
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


// === NOTIFICATIONS NO-OPS ===
function Notify_onNewRegistration_() {}
function Notify_onRegistrationApproved_() {}
function Notify_onRegistrationRejected_() {}
function Notify_onLeaveCreated_() {}
function Notify_onLeaveChecked_() {}
function Notify_onLeaveCommented_() {}
function Notify_onLeaveApproved_() {}
function Notify_onLeaveSubmit_() {}
function Notify_onLeaveResultToRequester_() {}
function Notify_onExpenseSubmit_() {}


// Override Supabase variables to use Edge Function service role token
SUPABASE_URL = DENO_SUPABASE_URL || SUPABASE_URL;
SUPABASE_KEY = DENO_SUPABASE_KEY || SUPABASE_KEY;

// Fallback for LINE credentials to Deno environment variables
var original_settingsRaw = _settingsRaw_;
_settingsRaw_ = function(key) {
  if (key === 'line_channel_access_token') {
    return Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || original_settingsRaw(key);
  }
  if (key === 'line_channel_secret') {
    return Deno.env.get('LINE_CHANNEL_SECRET') || original_settingsRaw(key);
  }
  return original_settingsRaw(key);
};

// === LINE MODULE (13_LINE.js) ===
// ── 13_LINE.gs — LINE OA Integration Module ──────────────────────────────────
//
// doPost(e)
//   → LINE Webhook Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ฟังก์ชันหลักที่ LINE Platform จะเรียกเมื่อมี Event เกิดขึ้นใน LINE OA
 * @param {Object} e - Event object จาก Google Apps Script Web App
 */
async function doPost(e) {
  try {
    // 1. ตรวจสอบข้อมูล Payload เบื้องต้น
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var json = JSON.parse(e.postData.contents);
    var events = json.events;

    // หากเป็น LINE Webhook Verification (ไม่มี events ส่งมา) ให้ตอบกลับทันที
    // วิธีนี้จะช่วยป้องกันปัญหา LINE Verify Timeout (เพราะไม่ต้องเสียเวลารันคิวรีชีตและโหลดข้อมูลเบื้องหลัง)
    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. ดึงข้อมูลการตั้งค่า LINE API (เมื่อมี Event จริงส่งมาเท่านั้น)
    var channelAccessToken = _settingsRaw_('line_channel_access_token');
    var channelSecret = _settingsRaw_('line_channel_secret');
    
    // หากไม่มีการตั้งค่า Token ให้แจ้งเตือน แต่ตอบกลับ OK (ป้องกัน webhook บล็อก)
    if (!channelAccessToken) {
      console.warn('LINE Integration is not configured. Missing Access Token.');
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Not configured' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. วาง cache แบบเลือกเฉพาะตารางที่เกี่ยวข้องกับ event ชุดนี้
    await LINE_warmTablesForEvents_(events);

    // 4. วนลูปประมวลผลแต่ละ Event
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var replyToken = event.replyToken;
      var lineUserId = event.source && event.source.userId;
      if (!replyToken || !lineUserId) continue;

      if (event.type === 'message' && event.message.type === 'text') {
        await _LINE_handleTextMessage_(event, replyToken, lineUserId);
      } else if (event.type === 'message' && event.message.type === 'image') {
        await _LINE_handleImageMessage_(event, replyToken, lineUserId);
      } else if (event.type === 'postback') {
        await _LINE_handlePostbackEvent_(event, replyToken, lineUserId);
      } else if (event.type === 'follow') {
        await _LINE_handleFollowEvent_(event, replyToken, lineUserId);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error('Error in doPost (LINE Webhook): ' + err.stack);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ตรวจสอบความถูกต้องของ X-Line-Signature
 */
function _LINE_verifySignature_(e, channelSecret) {
  try {
    var headers = e.headers || {};
    var sig = headers['x-line-signature'] || headers['X-Line-Signature'];
    if (!sig) return false;
    
    var payload = e.postData.contents;
    var byteSignature = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256,
      payload,
      channelSecret,
      Utilities.Charset.UTF_8
    );
    var calculatedSig = Utilities.base64Encode(byteSignature);
    return sig === calculatedSig;
  } catch (err) {
    console.error('Error in _LINE_verifySignature_: ' + err.message);
    return false;
  }
}

/**
 * จัดการข้อความตัวอักษรที่ผู้ใช้ส่งมา
 */
async function _LINE_handleTextMessage_(event, replyToken, lineUserId) {
  var txt = String(event.message.text || '').trim();
  
  // ตรวจหาแพทเทิร์นการผูกบัญชี เช่น LMS-123456
  var match = txt.match(/^LMS-(\d{6})$/i);
  if (match) {
    var connectCode = match[0].toUpperCase();
    var user = DB_findOne(SHEETS.USERS, function (r) {
      return String(r.line_connect_code || '').toUpperCase() === connectCode;
    });

    if (user) {
      // ทำการผูกบัญชี: บันทึก line_user_id และเคลียร์ line_connect_code
      await DB_update(SHEETS.USERS, user.id, {
        line_user_id: lineUserId,
        line_connect_code: ''
      });
      DB_invalidate(SHEETS.USERS); // เคลียร์ cache ข้อมูลผู้ใช้
      
      // ส่ง Flex การ์ดยินดีต้อนรับที่เชื่อมต่อสำเร็จ
      var welcomeFlex = LINE_buildConnectSuccessFlex_(user);
      await LINE_replyMessage_(replyToken, [welcomeFlex]);
    } else {
      await LINE_replyTextMessage_(replyToken, "❌ ไม่พบรหัสเชื่อมต่อนี้ในระบบ หรือรหัสอาจหมดอายุแล้ว กรุณาเข้าสู่ระบบเว็บไซต์ เพื่อดูรหัสใหม่ที่แท็บ 'โปรไฟล์' ครับ");
    }
    return;
  }

  // หากไม่ใช่รหัสเชื่อมต่อ ให้เช็กสถานะการผูกบัญชีของผู้ใช้นี้
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (!user) {
    // ถ้ายังไม่ได้เชื่อมบัญชี ส่งคำแนะนำให้เชื่อมบัญชี
    var notConnectedFlex = LINE_buildNotConnectedFlex_();
    await LINE_replyMessage_(replyToken, [notConnectedFlex]);
  } else {
    // เช็กสถานะการยื่นใบลา/เบิกค่าใช้จ่ายแบบพิมพ์โต้ตอบ
    var state = await _LINE_getState_(lineUserId);

    if (state && String(state.step || '').indexOf('expense_') === 0) {
      if (state.step === 'expense_enter_amount') {
        var amount = Number(String(txt).replace(/[,฿ ]/g, ''));
        if (!isFinite(amount) || amount <= 0) {
          await LINE_replyTextMessage_(replyToken, "⚠️ กรุณาพิมพ์จำนวนเงินเป็นตัวเลขที่ถูกต้อง");
          return;
        }
        state.amount = amount;
        state.step = 'expense_enter_description';
        await _LINE_saveState_(lineUserId, state);
        await LINE_replyTextMessage_(replyToken, "✍️ พิมพ์รายละเอียดค่าใช้จ่าย เช่น ค่ารถไปประชุม / ค่าอาหารระหว่างออกงาน");
        return;
      }

      if (state.step === 'expense_enter_description') {
        if (txt.length < 3) {
          await LINE_replyTextMessage_(replyToken, "⚠️ โปรดระบุรายละเอียดอย่างน้อย 3 ตัวอักษร");
          return;
        }
        state.description = txt;
        state.step = 'expense_enter_receipt';
        await _LINE_saveState_(lineUserId, state);
        await LINE_replyTextMessage_(replyToken, "📷 ส่งรูปใบเสร็จเป็นภาพถ่ายได้เลย หรือพิมพ์ 'ข้าม' เพื่อไม่แนบใบเสร็จ");
        return;
      }

      if (state.step === 'expense_enter_receipt') {
        var receipt = txt;
        if (/^(ข้าม|ไม่แนบ|ไม่มี|skip)$/i.test(receipt)) {
          state.receipt_url = '';
          state.step = 'expense_confirm';
          await _LINE_saveState_(lineUserId, state);
          var expenseConfirmFlex = LINE_buildExpenseConfirmFlex_(user, state);
          await LINE_replyMessage_(replyToken, [expenseConfirmFlex]);
          return;
        }

        await LINE_replyTextMessage_(replyToken, "📷 กรุณาส่งรูปใบเสร็จเป็นภาพถ่ายได้เลย หรือพิมพ์ 'ข้าม' หากไม่ต้องแนบใบเสร็จ");
        return;
      }
    }

    if (state && state.step === 'enter_reason') {
      if (txt.length < 3) {
        await LINE_replyTextMessage_(replyToken, "⚠️ โปรดระบุเหตุผลการลาอย่างน้อย 3 ตัวอักษรขึ้นไปครับ");
        return;
      }
      state.step = 'confirm';
      state.reason = txt;
      await _LINE_saveState_(lineUserId, state);
      
      var confirmFlex = LINE_buildLeaveConfirmFlex_(user, state);
      await LINE_replyMessage_(replyToken, [confirmFlex]);
      return;
    }

    var lowTxt = txt.toLowerCase();
    if (lowTxt === 'ขอลา' || lowTxt === 'ยื่นใบลา' || lowTxt === 'ลา' || lowTxt === 'leave') {
      await _LINE_startLeaveFlow_(replyToken, lineUserId);
      return;
    }
    if (lowTxt === 'เบิกค่าใช้จ่าย' || lowTxt === 'เบิก' || lowTxt === 'expense') {
      await _LINE_startExpenseFlow_(replyToken, lineUserId);
      return;
    }
    if (lowTxt === 'รายการเบิก' || lowTxt === 'expense list' || lowTxt === 'my expense') {
      var myExpenses = Expense_list(user, { status: '' }).items || [];
      await LINE_replyTextMessage_(replyToken, LINE_buildExpenseListText_(myExpenses));
      return;
    }

    // ถ้าเชื่อมบัญชีแล้ว ส่ง Flex Portal ที่เหมาะสมตามบทบาท (Role)
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    await LINE_replyMessage_(replyToken, [portalFlex]);
  }
}

async function _LINE_handleImageMessage_(event, replyToken, lineUserId) {
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (!user) {
    await LINE_replyTextMessage_(replyToken, '❌ กรุณาเชื่อมบัญชีก่อนใช้งาน');
    return;
  }

  var state = await _LINE_getState_(lineUserId);
  if (!state || (state.step !== 'expense_enter_receipt' && state.step !== 'expense_confirm')) {
    await LINE_replyTextMessage_(replyToken, '📷 รูปนี้ยังไม่อยู่ในขั้นตอนแนบใบเสร็จ กรุณาเริ่มเบิกค่าใช้จ่ายใหม่อีกครั้ง');
    return;
  }

  try {
    var imageId = String(event.message && event.message.id || '').trim();
    if (!imageId) throw new Error('ไม่พบรหัสรูปภาพ');
    var uploaded = await _LINE_uploadReceiptImage_(imageId, lineUserId);
    
    var urls = [];
    if (state.receipt_url) {
      if (state.receipt_url.indexOf('[') === 0) {
        try {
          urls = JSON.parse(state.receipt_url);
        } catch (e) {
          urls = [state.receipt_url];
        }
      } else {
        urls = [state.receipt_url];
      }
    }
    
    if (urls.length >= 4) {
      await LINE_replyTextMessage_(replyToken, '⚠️ คุณแนบรูปภาพใบเสร็จครบ 4 รูปแล้วครับ ไม่สามารถแนบเพิ่มได้อีก\nโปรดกดปุ่มยืนยันการบันทึกเพื่อดำเนินการต่อ');
      return;
    }
    
    urls.push(uploaded.url);
    state.receipt_url = JSON.stringify(urls);
    state.receipt_path = uploaded.path;
    state.step = 'expense_confirm';
    await _LINE_saveState_(lineUserId, state);

    var textReply = '📷 แนบรูปหลักฐานสำเร็จแล้ว (' + urls.length + '/4 รูป)';
    if (urls.length < 4) {
      textReply += '\n\nหากมีรูปถัดไปสามารถส่งรูปในแชตเพิ่มได้ทันที หรือกดปุ่ม "ยืนยันบันทึก" บนการ์ดเพื่อส่งใบเบิก';
    } else {
      textReply += '\n\nแนบรูปครบ 4 รูปแล้ว! โปรดกดปุ่ม "ยืนยันบันทึก" บนการ์ดเพื่อส่งใบเบิก';
    }

    var expenseConfirmFlex = LINE_buildExpenseConfirmFlex_(user, state);
    await LINE_replyMessage_(replyToken, [
      { type: "text", text: textReply },
      expenseConfirmFlex
    ]);
  } catch (err) {
    console.error('Error in _LINE_handleImageMessage_: ' + err.stack);
    await LINE_replyTextMessage_(replyToken, '❌ อัปโหลดรูปใบเสร็จไม่สำเร็จ: ' + err.message);
  }
}

/**
 * จัดการเหตุการณ์การคลิกปุ่มบนการ์ด/เมนู (Postback)
 */
async function _LINE_handlePostbackEvent_(event, replyToken, lineUserId) {
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (!user) {
    var notConnectedFlex = LINE_buildNotConnectedFlex_();
    await LINE_replyMessage_(replyToken, [notConnectedFlex]);
    return;
  }

  var params = _LINE_parseQueryString_(event.postback.data);
  var action = params.action;

  if (action === 'portal') {
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    await LINE_replyMessage_(replyToken, [portalFlex]);
  } else if (action === 'expense_start') {
    await _LINE_startExpenseFlow_(replyToken, lineUserId);
  } else if (action === 'expense_my_list') {
    var myExpenses = Expense_list(user, { status: '' }).items || [];
    await LINE_replyTextMessage_(replyToken, LINE_buildExpenseListText_(myExpenses));
  } else if (action === 'expense_pending') {
    if (!hasCap_(user.role, 'expense.manage')) {
      await LINE_replyTextMessage_(replyToken, "🔒 ฟังก์ชันนี้เฉพาะผู้อนุมัติเท่านั้นครับ");
      return;
    }
    var pendingExpenses = Expense_list(user, { status: STATUS.PENDING }).items || [];
    var pendingExpenseFlex = LINE_buildExpensePendingFlex_(user, pendingExpenses);
    await LINE_replyMessage_(replyToken, [pendingExpenseFlex]);
  } else if (action === 'expense_select_type') {
    var state = await _LINE_getState_(lineUserId) || {};
    state.step = 'expense_select_company';
    state.expense_type = params.type || 'other';
    await _LINE_saveState_(lineUserId, state);
    var selectCompanyFlex = LINE_buildExpenseCompanySelectFlex_();
    await LINE_replyMessage_(replyToken, [selectCompanyFlex]);
  } else if (action === 'expense_select_company') {
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'expense_select_company') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดเบิกค่าใช้จ่ายใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    state.step = 'expense_select_date';
    state.company = params.company;
    await _LINE_saveState_(lineUserId, state);
    var startExpensePicker = LINE_buildExpenseDatePickerFlex_("ขั้นตอนที่ 3: เลือกวันที่จ่าย", "action=expense_select_date", "📅 เลือกวันที่จ่าย");
    await LINE_replyMessage_(replyToken, [startExpensePicker]);
  } else if (action === 'expense_select_date') {
    var selectedExpenseDate = event.postback.params && event.postback.params.date;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'expense_select_date') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดเบิกค่าใช้จ่ายใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    state.step = 'expense_enter_amount';
    state.expense_date = selectedExpenseDate;
    await _LINE_saveState_(lineUserId, state);
    await LINE_replyTextMessage_(replyToken, "💵 พิมพ์จำนวนเงินที่จ่ายไป เช่น 350 หรือ 1250.50");
  } else if (action === 'expense_cancel') {
    await _LINE_clearState_(lineUserId);
    await LINE_replyTextMessage_(replyToken, "❌ ยกเลิกการเบิกค่าใช้จ่ายเรียบร้อยแล้ว");
  } else if (action === 'expense_confirm_yes') {
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'expense_confirm') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดเบิกค่าใช้จ่ายใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    try {
      var desc = state.description;
      if (state.company) {
        desc = "[" + state.company + "] " + desc;
      }
      var ex = await Expense_create(user, {
        expense_type: _LINE_getExpenseTypeLabel_(state.expense_type),
        expense_date: state.expense_date,
        amount: state.amount,
        description: desc,
        receipt_url: state.receipt_url || '',
        skip_notify: true
      });
      await _LINE_clearState_(lineUserId);
      var expenseSuccessFlex = LINE_buildExpenseSuccessFlex_(user, ex);
      await LINE_replyMessage_(replyToken, [expenseSuccessFlex]);
    } catch (err) {
      await LINE_replyTextMessage_(replyToken, "❌ ไม่สามารถบันทึกค่าใช้จ่ายได้: " + err.message);
      await _LINE_clearState_(lineUserId);
    }
  } else if (action === 'expense_decision') {
    if (!hasCap_(user.role, 'expense.manage')) {
      await LINE_replyTextMessage_(replyToken, "🔒 ฟังก์ชันนี้เฉพาะผู้อนุมัติเท่านั้นครับ");
      return;
    }
    try {
      var decisionRes = await Expense_approve(user, {
        id: params.id,
        decision: params.decision || 'approved'
      });
      await LINE_replyTextMessage_(replyToken, "✅ อัปเดตสถานะเรียบร้อย: " + (decisionRes.status_label || decisionRes.status || ''));
    } catch (err) {
      await LINE_replyTextMessage_(replyToken, "❌ อัปเดตสถานะไม่สำเร็จ: " + err.message);
    }
  } else if (action === 'check_quota') {
    var quotaFlex = LINE_buildLeaveQuotaFlex_(user);
    await LINE_replyMessage_(replyToken, [quotaFlex]);
  } else if (action === 'check_status') {
    var latestLeave = _LINE_getLatestLeaveRequest_(user.id);
    if (!latestLeave) {
      await LINE_replyTextMessage_(replyToken, "ℹ️ ไม่พบประวัติการยื่นใบลาของคุณในระบบ");
    } else {
      var statusFlex = LINE_buildLeaveStatusFlex_(user, latestLeave);
      await LINE_replyMessage_(replyToken, [statusFlex]);
    }
  } else if (action === 'pending_leaves') {
    // ตรวจสอบว่าผู้ใช้มีบทบาทผู้บริหาร/HR หรือไม่
    var inboxStatuses = _inboxStatusesFor_(user.role);
    if (inboxStatuses.length === 0) {
      await LINE_replyTextMessage_(replyToken, "🔒 ฟังก์ชันนี้เฉพาะหัวหน้างานหรือฝ่ายอนุมัติเท่านั้นครับ");
      return;
    }

    // ดึงรายการรอพิจารณา
    var leaves = DB_readAll(SHEETS.LEAVES);
    var usersIndex = DB_buildIndex(SHEETS.USERS);
    var pending = leaves.filter(function (r) {
      return inboxStatuses.indexOf(r.status) >= 0;
    }).map(function (r) {
      return _enrichLeave_(r, usersIndex);
    });

    if (pending.length === 0) {
      await LINE_replyTextMessage_(replyToken, "✅ ไม่มีใบลาค้างอนุมัติในระบบของคุณแล้ว");
    } else {
      var pendingFlex = LINE_buildPendingLeavesFlex_(user, pending.slice(0, 5)); // ส่งไปสูงสุด 5 ใบเพื่อไม่ให้เกิน Limit
      await LINE_replyMessage_(replyToken, [pendingFlex]);
    }
  } else if (action === 'leave_decision') {
    if (!hasCap_(user.role, 'leave.approve')) {
      await LINE_replyTextMessage_(replyToken, "🔒 ฟังก์ชันนี้เฉพาะผู้อนุมัติเท่านั้นครับ");
      return;
    }
    try {
      var leaveDecisionRes = await Leaves_approve(user, {
        id: params.id,
        decision: params.decision || 'approved',
        comment: params.comment || ''
      });
      await LINE_replyTextMessage_(replyToken, "✅ อัปเดตสถานะใบลาเรียบร้อย: " + (leaveDecisionRes.status_label || (params.decision === 'rejected' ? 'ไม่อนุมัติ' : 'อนุมัติแล้ว')));
    } catch (err) {
      await LINE_replyTextMessage_(replyToken, "❌ อัปเดตใบลาไม่สำเร็จ: " + err.message);
    }
  } else if (action === 'submit_leave_start') {
    await _LINE_startLeaveFlow_(replyToken, lineUserId);
  } else if (action === 'submit_select_type') {
    var type = params.type;
    var state = { step: 'select_unit', leave_type: type };
    await _LINE_saveState_(lineUserId, state);
    
    var unitFlex = LINE_buildLeaveUnitSelectFlex_();
    await LINE_replyMessage_(replyToken, [unitFlex]);
  } else if (action === 'submit_select_unit') {
    var unit = params.unit;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_unit') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    state.leave_unit = unit;
    state.step = 'select_start_date';
    await _LINE_saveState_(lineUserId, state);
    
    var title = unit === 'hour' ? "ขั้นตอนที่ 3: เลือกวันที่ต้องการลา" : "ขั้นตอนที่ 3: เลือกวันเริ่มลา";
    var startPickerFlex = LINE_buildDatePickerFlex_(title, "action=submit_select_start_date", "📅 เลือกวันที่");
    await LINE_replyMessage_(replyToken, [startPickerFlex]);
  } else if (action === 'submit_select_start_date') {
    var selectedDate = event.postback.params && event.postback.params.date;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_start_date') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    state.start_date = selectedDate;
    if (state.leave_unit === 'hour') {
      state.end_date = selectedDate;
      state.step = 'select_start_time';
      await _LINE_saveState_(lineUserId, state);
      
      var timePickerFlex = LINE_buildTimePickerFlex_("ขั้นตอนที่ 4: เลือกเวลาเริ่มลา", "action=submit_select_start_time", "⏱️ เลือกเวลาเริ่มลา");
      await LINE_replyMessage_(replyToken, [timePickerFlex]);
    } else {
      state.step = 'select_end_date';
      await _LINE_saveState_(lineUserId, state);
      
      var endPickerFlex = LINE_buildDatePickerFlex_("ขั้นตอนที่ 4: เลือกวันสิ้นสุดการลา", "action=submit_select_end_date", "📅 เลือกวันสิ้นสุดการลา");
      await LINE_replyMessage_(replyToken, [endPickerFlex]);
    }
  } else if (action === 'submit_select_end_date') {
    var selectedDate = event.postback.params && event.postback.params.date;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_end_date') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    var days = cfg_daysBetween_(state.start_date, selectedDate);
    if (days <= 0) {
      await LINE_replyTextMessage_(replyToken, "⚠️ ช่วงวันที่ลาไม่ถูกต้อง (วันสิ้นสุดการลาต้องไม่ก่อนหน้าวันเริ่มลา และต้องไม่ใช่ปฏิทินวันหยุดงาน)\n\nกรุณากดเลือกวันเริ่มลาและสิ้นสุดใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    state.step = 'enter_reason';
    state.end_date = selectedDate;
    await _LINE_saveState_(lineUserId, state);
    
    await LINE_replyTextMessage_(replyToken, "✍️ ขั้นตอนสุดท้าย: โปรดพิมพ์เหตุผลในการลาส่งกลับมาในแชตนี้ได้เลยครับ (เช่น เป็นไข้สูงปวดศีรษะ, ไปทำธุระต่างจังหวัด)");
  } else if (action === 'submit_select_start_time') {
    var selectedTime = event.postback.params && event.postback.params.time;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_start_time') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    state.start_time = selectedTime;
    state.step = 'select_end_time';
    await _LINE_saveState_(lineUserId, state);
    
    var timePickerFlex = LINE_buildTimePickerFlex_("ขั้นตอนที่ 5: เลือกเวลาสิ้นสุดการลา", "action=submit_select_end_time", "⏱️ เลือกเวลาสิ้นสุดการลา");
    await LINE_replyMessage_(replyToken, [timePickerFlex]);
  } else if (action === 'submit_select_end_time') {
    var selectedTime = event.postback.params && event.postback.params.time;
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'select_end_time') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    var sm = cfg_timeMinutes_(state.start_time);
    var em = cfg_timeMinutes_(selectedTime);
    if (sm == null || em == null || em <= sm) {
      await LINE_replyTextMessage_(replyToken, "⚠️ เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มลาครับ\n\nกรุณากดเลือกเวลาเริ่มลาและเวลาสิ้นสุดใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    state.end_time = selectedTime;
    state.step = 'enter_reason';
    await _LINE_saveState_(lineUserId, state);
    
    await LINE_replyTextMessage_(replyToken, "✍️ ขั้นตอนสุดท้าย: โปรดพิมพ์เหตุผลในการลาส่งกลับมาในแชตนี้ได้เลยครับ (เช่น ทำธุระส่วนตัว, ไปพบแพทย์)");
  } else if (action === 'submit_confirm_yes') {
    var state = await _LINE_getState_(lineUserId);
    if (!state || state.step !== 'confirm') {
      await LINE_replyTextMessage_(replyToken, "❌ เซสชันหมดอายุหรือผิดพลาด กรุณากดปุ่มยื่นใบลาใหม่อีกครั้งครับ");
      await _LINE_clearState_(lineUserId);
      return;
    }
    
    try {
      var res = await Leaves_create(user, {
        leave_type: state.leave_type,
        start_date: state.start_date,
        end_date: state.end_date,
        reason: state.reason,
        leave_unit: state.leave_unit || 'day',
        start_time: state.start_time || '',
        end_time: state.end_time || ''
      });
      await _LINE_clearState_(lineUserId);
      
      var successFlex = LINE_buildSubmitSuccessFlex_(user, res.leave);
      await LINE_replyMessage_(replyToken, [successFlex]);
    } catch (err) {
      await LINE_replyTextMessage_(replyToken, "❌ ไม่สามารถยื่นใบลาได้: " + err.message);
      await _LINE_clearState_(lineUserId);
    }
  } else if (action === 'submit_cancel') {
    await _LINE_clearState_(lineUserId);
    await LINE_replyTextMessage_(replyToken, "❌ ยกเลิกการยื่นใบลาเรียบร้อยแล้ว");
  }
}

/**
 * จัดการเมื่อมีคนแอดไลน์แชร์บอต (Follow)
 */
async function _LINE_handleFollowEvent_(event, replyToken, lineUserId) {
  var user = DB_findOne(SHEETS.USERS, function (r) {
    return String(r.line_user_id) === lineUserId;
  });

  if (user) {
    var portalFlex = LINE_buildPortalFlexForUser_(user);
    await LINE_replyMessage_(replyToken, [
      { type: "text", text: "ยินดีต้อนรับกลับเข้าสู่ระบบบันทึกการลาออนไลน์ครับ 😊" },
      portalFlex
    ]);
  } else {
    var welcomeFlex = LINE_buildNotConnectedFlex_();
    await LINE_replyMessage_(replyToken, [welcomeFlex]);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ดึงใบลาล่าสุดของพนักงาน
 */
function _LINE_getLatestLeaveRequest_(userId) {
  var leaves = DB_readAll(SHEETS.LEAVES).filter(function (r) {
    return String(r.requester_id) === String(userId);
  });
  if (leaves.length === 0) return null;
  leaves.sort(function (a, b) {
    var ta = new Date(a.created_at || a.start_date).getTime();
    var tb = new Date(b.created_at || b.start_date).getTime();
    return tb - ta;
  });
  return leaves[0];
}

/**
 * คืนค่า URL ของ Web App ปัจจุบัน เพื่อนำไปเชื่อม Webhook
 */
function LINE_getWebhookUrl() {
  return GLOBAL_SETTINGS['web_url'] || 'https://mairokjiz-ops.github.io/AvarinLMS/';
}

/**
 * ส่ง Request ตอบกลับไปยัง LINE Message API (Reply)
 */
async function LINE_replyMessage_(replyToken, messages) {
  var url = 'https://api.line.me/v2/bot/message/reply';
  var channelAccessToken = _settingsRaw_('line_channel_access_token');
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + channelAccessToken
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  };
  
  var res = await UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  if (code !== 200) {
    console.error('LINE Reply API error code: ' + code + ', response: ' + res.getContentText());
  }
}

/**
 * ส่ง Reply แบบ Text ข้อความง่าย ๆ
 */
async function LINE_replyTextMessage_(replyToken, text) {
  await LINE_replyMessage_(replyToken, [{
    type: "text",
    text: text
  }]);
}

/**
 * ดาวน์โหลดไฟล์มีเดียจาก LINE Content API
 */
async function LINE_downloadLineContent_(messageId) {
  var channelAccessToken = _settingsRaw_('line_channel_access_token');
  if (!channelAccessToken) throw new Error('ยังไม่ได้ตั้งค่า LINE channel access token');
  var url = 'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(String(messageId || '')) + '/content';
  var res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + channelAccessToken }
  });
  if (!res.ok) {
    throw new Error('ดาวน์โหลดรูปจาก LINE ไม่สำเร็จ (HTTP ' + res.status + ')');
  }
  var bytes = new Uint8Array(await res.arrayBuffer());
  var contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { bytes: bytes, contentType: contentType };
}

function _LINE_guessImageExtension_(contentType) {
  var ct = String(contentType || '').toLowerCase();
  if (ct.indexOf('png') >= 0) return 'png';
  if (ct.indexOf('webp') >= 0) return 'webp';
  if (ct.indexOf('gif') >= 0) return 'gif';
  if (ct.indexOf('heic') >= 0 || ct.indexOf('heif') >= 0) return 'heic';
  return 'jpg';
}

function _LINE_buildReceiptStoragePath_(lineUserId, ext) {
  var now = cfg_now_();
  var y = now.getFullYear();
  var m = ('0' + (now.getMonth() + 1)).slice(-2);
  var stamp = now.getTime();
  var rand = String(crypto.randomUUID()).replace(/-/g, '').slice(0, 12);
  return [
    String(y),
    String(m),
    String(lineUserId || 'unknown'),
    'rcpt_' + stamp + '_' + rand + '.' + ext
  ].join('/');
}

function _LINE_publicStorageUrl_(path) {
  var base = String(SUPABASE_URL || DENO_SUPABASE_URL || '').replace(/\/$/, '');
  return base + '/storage/v1/object/public/' + SUPABASE_RECEIPT_BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/');
}

async function _LINE_uploadReceiptImage_(messageId, lineUserId) {
  var file = await LINE_downloadLineContent_(messageId);
  var ext = _LINE_guessImageExtension_(file.contentType);
  var path = _LINE_buildReceiptStoragePath_(lineUserId, ext);

  var base = String(SUPABASE_URL || DENO_SUPABASE_URL || '').replace(/\/$/, '');
  var uploadUrl = base + '/storage/v1/object/' + SUPABASE_RECEIPT_BUCKET + '/' + path.split('/').map(encodeURIComponent).join('/');

  var headers = {
    'apikey': DENO_SUPABASE_KEY,
    'Authorization': 'Bearer ' + DENO_SUPABASE_KEY,
    'Content-Type': file.contentType || 'application/octet-stream',
    'x-upsert': 'true'
  };

  var res = await fetch(uploadUrl, {
    method: 'POST',
    headers: headers,
    body: file.bytes
  });

  if (!res.ok) {
    var errText = await res.text().catch(function () { return ''; });
    throw new Error('อัปโหลดรูปใบเสร็จไม่สำเร็จ: ' + (errText || ('HTTP ' + res.status)));
  }

  return {
    path: path,
    url: _LINE_publicStorageUrl_(path)
  };
}

/**
 * แกะค่า URL Query String เป็น Object
 */
function _LINE_parseQueryString_(str) {
  var obj = {};
  if (!str) return obj;
  var pairs = str.split('&');
  pairs.forEach(function (p) {
    var parts = p.split('=');
    if (parts.length === 2) {
      obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    }
  });
  return obj;
}

// ── Flex Message Builder Templates ───────────────────────────────────────────

/**
 * ส่ง Portal Menu ตามระดับของพนักงาน
 */
function LINE_buildPortalFlexForUser_(user) {
  var inboxStatuses = _inboxStatusesFor_(user.role);
  var isManager = inboxStatuses.length > 0;
  
  var settings = Settings_get_public_();
  var orgName = settings.org_name || APP.ORG;

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#4f46e5",
      paddingAll: "20px",
      contents: [
        { type: "text", text: orgName, color: "#c7d2fe", size: "xs", weight: "bold" },
        { type: "text", text: "เมนูหลักระบบจัดการการลา", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "48px",
              height: "48px",
              cornerRadius: "24px",
              backgroundColor: "#e0e7ff",
              contents: [
                { type: "text", text: "👤", size: "xl", align: "center", gravity: "center" }
              ]
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: user.full_name, weight: "bold", size: "md", color: "#111827" },
                { type: "text", text: user.position + (user.department ? " (" + user.department + ")" : ""), size: "xs", color: "#6b7280" }
              ]
            }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#4f46e5",
              height: "sm",
              action: { type: "postback", label: "📝 ยื่นใบลาใหม่ (พิมพ์โต้ตอบ)", data: "action=submit_leave_start" }
            },
            {
              type: "button",
              style: "primary",
              color: "#6366f1",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "📊 เช็กสิทธิ์วันลาคงเหลือ", data: "action=check_quota" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "🔍 ติดตามสถานะใบลาล่าสุด", data: "action=check_status" }
            },
            {
              type: "button",
              style: "primary",
              color: "#0f766e",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "💰 เบิกค่าใช้จ่าย", data: "action=expense_start" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#e0f2fe",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "📋 รายการเบิกของฉัน", data: "action=expense_my_list" }
            }
          ]
        }
      ]
    }
  };

  // หากเป็นผู้บริหาร/HR ให้มีปุ่มเข้าดูงานรออนุมัติเพิ่มเติม
  if (isManager) {
    bubble.body.contents[2].contents.push({
      type: "button",
      style: "primary",
      color: "#10b981",
      height: "sm",
      margin: "sm",
      action: { type: "postback", label: "📥 พิจารณาใบลาค้างอนุมัติ", data: "action=pending_leaves" }
    });
    bubble.body.contents[2].contents.push({
      type: "button",
      style: "primary",
      color: "#0f172a",
      height: "sm",
      margin: "sm",
      action: { type: "postback", label: "📥 พิจารณาค่าใช้จ่ายค้าง", data: "action=expense_pending" }
    });
  }

  // ปุ่มเข้าเว็บไซต์ตรงๆ
  var webUrl = LINE_getWebhookUrl();
  bubble.body.contents[2].contents.push({
    type: "button",
    style: "link",
    height: "sm",
    margin: "sm",
    action: { type: "uri", label: "🌐 เปิดระบบเว็บพอร์ทัล", uri: webUrl }
  });

  return {
    type: "flex",
    altText: "เมนูหลักระบบจัดการการลา",
    contents: bubble
  };
}

/**
 * Flex Message ชี้แจงสำหรับผู้ใช้ใหม่ยังไม่ผูกบัญชี
 */
function LINE_buildNotConnectedFlex_() {
  var webUrl = LINE_getWebhookUrl();
  
  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#ef4444",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "ยังไม่ได้เชื่อมต่อบัญชี", color: "#fca5a5", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดเชื่อมต่อระบบลาก่อนใช้งาน", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "เพื่อส่งการแจ้งเตือนและตรวจสอบสถานะการลาผ่านไลน์ได้ฟรี โปรดดำเนินการดังนี้:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          backgroundColor: "#f9fafb",
          paddingAll: "12px",
          cornerRadius: "8px",
          contents: [
            { type: "text", text: "1. เข้าสู่ระบบเว็บพอร์ทัลของคุณ", size: "xs", color: "#4b5563" },
            { type: "text", text: "2. ไปที่เมนู 'โปรไฟล์'", size: "xs", color: "#4b5563" },
            { type: "text", text: "3. คัดลอกรหัสเชื่อมต่อ (เช่น LMS-123456)", size: "xs", color: "#4b5563" },
            { type: "text", text: "4. ส่งรหัสนั้นมาที่แชต LINE OA นี้", size: "xs", color: "#4b5563" }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#dc2626",
          height: "sm",
          action: { type: "uri", label: "🌐 เปิดหน้าเว็บบันทึกการลา", uri: webUrl }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "กรุณาเชื่อมต่อบัญชีก่อนใช้งานระบบ",
    contents: bubble
  };
}

/**
 * Flex Message แจ้งเตือนเมื่อเชื่อมต่อบัญชีสำเร็จ
 */
function LINE_buildConnectSuccessFlex_(user) {
  var settings = Settings_get_public_();
  var orgName = settings.org_name || APP.ORG;

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: orgName, color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "เชื่อมต่อสำเร็จแล้ว! 🎉", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "ยินดีต้อนรับสู่ระบบบันทึกการลา บัญชีของคุณถูกจับคู่เรียบร้อยแล้ว:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f0fdf4",
          paddingAll: "14px",
          cornerRadius: "10px",
          contents: [
            { type: "text", text: "👤 ชื่อ: " + user.full_name, size: "sm", weight: "bold", color: "#065f46" },
            { type: "text", text: "💼 ตำแหน่ง: " + user.position, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "🏢 แผนก: " + (user.department || "-"), size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "🔑 บทบาท: " + (ROLE_LABEL[user.role] || user.role), size: "xs", color: "#047857", margin: "xs" }
          ]
        },
        {
          type: "text",
          text: "คุณสามารถเช็กสิทธิ์และสถานะการลาผ่านปุ่มใน Rich Menu ได้ทันที",
          wrap: true,
          size: "xs",
          color: "#6b7280",
          align: "center"
        },
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: { type: "postback", label: "📱 ไปยังเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "เชื่อมต่อบัญชีสำเร็จแล้ว!",
    contents: bubble
  };
}

/**
 * Flex Message แสดงสิทธิ์วันลาคงเหลือ
 */
function LINE_buildLeaveQuotaFlex_(user) {
  var currentFy = cfg_fiscalYear_(cfg_now_());
  var stats = _leaveStats_(user.id, currentFy);
  
  var rows = [];
  Object.keys(stats.items).forEach(function (key) {
    var s = stats.items[key];
    var typeLabel = LEAVE_TYPE_LABEL[key] || key;
    
    // เลือกสีและไอคอนตามประเภท
    var icon = "📝";
    var color = "#3b82f6";
    if (key === 'sick') { icon = "🤢"; color = "#ef4444"; }
    else if (key === 'personal') { icon = "💼"; color = "#f59e0b"; }
    else if (key === 'annual') { icon = "🏖️"; color = "#10b981"; }

    rows.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: icon + " " + typeLabel, weight: "bold", size: "sm", color: "#1f2937" },
            { type: "text", text: s.remaining + " / " + s.limit + " วัน", align: "end", size: "sm", weight: "bold", color: color }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#e5e7eb",
          height: "8px",
          cornerRadius: "4px",
          margin: "sm",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: color,
              width: Math.max(1, Math.min(100, s.percent)) + "%",
              height: "100%",
              cornerRadius: "4px",
              contents: []
            }
          ]
        },
        {
          type: "text",
          text: "ใช้ไปแล้ว " + s.used + " วัน (" + s.percent + "%) คงเหลือ " + s.remaining + " วัน",
          size: "xxs",
          color: "#9ca3af",
          align: "end"
        }
      ]
    });
  });

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3b82f6",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "Leave Quota Summary", color: "#93c5fd", size: "xs", weight: "bold" },
        { type: "text", text: "สิทธิ์วันลาคงเหลือ ปี พ.ศ. " + stats.fiscal_year_be, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        { type: "text", text: "ยอดสรุปประวัติการใช้งานจริงสะสมในปีงบประมาณนี้:", size: "xs", color: "#6b7280" },
        {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: rows
        },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สิทธิ์วันลาคงเหลือของคุณ",
    contents: bubble
  };
}

/**
 * Flex Message แสดงรายละเอียดใบลาล่าสุด
 */
function LINE_buildLeaveStatusFlex_(user, lv) {
  var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
  var statusLabel = STATUS_LABEL[lv.status] || lv.status;
  var tone = STATUS_TONE[lv.status] || 'slate';
  var statusColor = "#64748b"; // slate
  if (tone === 'amber') statusColor = "#d97706";
  else if (tone === 'sky') statusColor = "#0284c7";
  else if (tone === 'indigo') statusColor = "#4f46e5";
  else if (tone === 'emerald') statusColor = "#059669";
  else if (tone === 'rose') statusColor = "#dc2626";

  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var startThai = toThaiDate(lv.start_date);
  var endThai   = toThaiDate(lv.end_date);
  var dateRange = (lv.start_date === lv.end_date) ? startThai : startThai + ' – ' + endThai;
  if (String(lv.leave_unit || '') === 'hour' && lv.start_time && lv.end_time) {
    dateRange += ' (' + lv.start_time + ' - ' + lv.end_time + ')';
  }
  
  var durationText = (String(lv.leave_unit || '') === 'hour')
    ? (lv.hours || '-') + ' ชั่วโมง'
    : (lv.days  || '-') + ' วัน';

  // รายการบันทึกสถานะตามขั้นตอน
  var detailsRows = [
    { label: "เลขที่ใบลา", val: lv.leave_no || "-" },
    { label: "ประเภทการลา", val: typeLabel },
    { label: "วันที่ขอลา", val: dateRange },
    { label: "จำนวนที่ลา", val: durationText },
    { label: "เหตุผลการลา", val: lv.reason || "-" }
  ];

  var detailsContent = detailsRows.map(function (row) {
    return {
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        { type: "text", text: row.label, size: "xs", color: "#6b7280", flex: 3 },
        { type: "text", text: row.val, size: "xs", color: "#1f2937", flex: 5, wrap: true }
      ]
    };
  });

  // ส่วนแสดงความคิดเห็นผู้อนุมัติ/ตรวจ
  var feedbackList = [];
  if (lv.checker_comment) {
    feedbackList.push({ type: "text", text: "💬 ตรวจสอบ: " + lv.checker_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }
  if (lv.supervisor_comment) {
    feedbackList.push({ type: "text", text: "💬 ความเห็นหัวหน้า: " + lv.supervisor_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }
  if (lv.approver_comment) {
    feedbackList.push({ type: "text", text: "💬 ความเห็นฝ่ายบุคคล: " + lv.approver_comment, size: "xxs", color: "#4b5563", wrap: true, margin: "xs" });
  }

  var bodyContents = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: "สถานะปัจจุบัน", size: "sm", color: "#374151", gravity: "center" },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: statusColor + "1a", // transparency 10%
          paddingTop: "4px",
          paddingBottom: "4px",
          paddingStart: "8px",
          paddingEnd: "8px",
          cornerRadius: "6px",
          contents: [
            { type: "text", text: statusLabel, color: statusColor, size: "xs", weight: "bold", align: "center" }
          ]
        }
      ]
    },
    { type: "separator", margin: "md" },
    {
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: detailsContent
    }
  ];

  if (feedbackList.length > 0) {
    bodyContents.push({ type: "separator", margin: "md" });
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      contents: [
        { type: "text", text: "บันทึกความเห็น:", size: "xs", color: "#9ca3af", weight: "bold" }
      ].concat(feedbackList)
    });
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "LATEST LEAVE STATUS", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "ติดตามสถานะใบลาล่าสุด", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      contents: bodyContents
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "15px",
      contents: [
        {
          type: "button",
          style: "secondary",
          color: "#f3f4f6",
          height: "sm",
          action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สถานะใบลาล่าสุดของคุณคือ: " + statusLabel,
    contents: bubble
  };
}

/**
 * Flex Message รายการใบลาค้างอนุมัติสำหรับผู้บริหาร (สูงสุด 5 ใบ)
 */
function LINE_buildPendingLeavesFlex_(user, pendingLeaves) {
  var bubbles = pendingLeaves.map(function (lv) {
    var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
    var durationText = _leaveDurationLabel_(lv);
    var requesterName = lv.requester ? lv.requester.full_name : "พนักงาน";
    
    function toThaiDate(iso) {
      if (!iso) return '-';
      var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
      if (isNaN(d.getTime())) return String(iso);
      var day = d.getDate();
      var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
      var year  = d.getFullYear() + 543;
      return day + ' ' + month + ' ' + year;
    }

    var dateText = (lv.start_date === lv.end_date) 
      ? toThaiDate(lv.start_date)
      : toThaiDate(lv.start_date) + " - " + toThaiDate(lv.end_date);
    if (String(lv.leave_unit || '') === 'hour' && lv.start_time && lv.end_time) {
      dateText += " (" + lv.start_time + " - " + lv.end_time + ")";
    }

    var webUrl = LINE_getWebhookUrl() + "#/leaves/" + lv.id;

    return {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#10b981",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "รอการตรวจสอบ/อนุมัติ", color: "#a7f3d0", size: "xs", weight: "bold" },
          { type: "text", text: "ผู้ยื่น: " + requesterName, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ประเภท", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: typeLabel, size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "วันที่ลา", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: dateText, size: "xs", color: "#1f2937", flex: 5 }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "จำนวน", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: durationText, size: "xs", flex: 5, weight: "bold", color: "#10b981" }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "เหตุผล", size: "xs", color: "#6b7280", flex: 3 },
              { type: "text", text: lv.reason || "-", size: "xs", color: "#1f2937", flex: 5, wrap: true }
            ]
          },
          { type: "separator", margin: "md" },
          {
            type: "button",
            style: "primary",
            color: "#10b981",
            height: "sm",
            action: { type: "postback", label: "✅ อนุมัติใบลา", data: "action=leave_decision&id=" + lv.id + "&decision=approved" }
          },
          {
            type: "button",
            style: "primary",
            color: "#ef4444",
            height: "sm",
            margin: "sm",
            action: { type: "postback", label: "❌ ไม่อนุมัติ", data: "action=leave_decision&id=" + lv.id + "&decision=rejected" }
          },
          {
            type: "button",
            style: "secondary",
            color: "#6366f1",
            height: "sm",
            margin: "sm",
            action: { type: "uri", label: "📝 ดำเนินการบนเว็บบอร์ด", uri: webUrl }
          }
        ]
      }
    };
  });

  // ใส่หน้าสรุปปิดท้าย Carousel เพื่อเปิดทางให้กลับหน้าหลักได้ง่าย
  bubbles.push({
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "การดำเนินการ", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "การพิจารณาใบลา", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "หากต้องการตรวจสอบใบลาค้างทั้งหมด หรือประวัติการจัดการย้อนหลัง กรุณาเปิดใช้งานจากหน้าเว็บพอร์ทัลหลัก",
          wrap: true,
          size: "sm",
          color: "#475569",
          align: "center"
        },
        {
          type: "button",
          style: "primary",
          color: "#6366f1",
          height: "sm",
          action: { type: "postback", label: "📱 กลับหน้าพอร์ทัล LINE", data: "action=portal" }
        }
      ]
    }
  });

  return {
    type: "flex",
    altText: "รายการใบลาค้างอนุมัติในระบบ",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}

/**
 * ฟังก์ชันสำหรับรันการทดสอบระบบ LINE Integration แบบจำลองใน Apps Script Editor
 */
function LINE_runLocalTests() {
  console.log('=== LINE INTEGRATION TESTS ===');
  
  // 1. ทดสอบการแกะพารามิเตอร์ Query String
  var params = _LINE_parseQueryString_("action=check_quota&type=sick");
  if (params.action === 'check_quota' && params.type === 'sick') {
    console.log('✅ Test 1 (Query String Parsing): PASS');
  } else {
    console.error('❌ Test 1 (Query String Parsing): FAIL');
  }
  
  // 2. ทดสอบการดึง Webhook URL
  var url = LINE_getWebhookUrl();
  console.log('✅ Test 2 (Webhook URL): PASS (URL: ' + url + ')');
  
  // 3. ทดสอบการสร้าง Flex Portal สำหรับผู้ใช้จำลอง
  var mockUser = {
    id: "test_user_id",
    full_name: "นายทดสอบ แสนดี",
    position: "เจ้าหน้าที่สนับสนุน",
    department: "ฝ่ายสารสนเทศ",
    role: "employee"
  };
  try {
    var flex = LINE_buildPortalFlexForUser_(mockUser);
    if (flex && flex.type === 'flex' && flex.contents.type === 'bubble') {
      console.log('✅ Test 3 (Flex Portal Builder - Employee): PASS');
    } else {
      console.error('❌ Test 3 (Flex Portal Builder - Employee): FAIL');
    }
  } catch (err) {
    console.error('❌ Test 3 (Flex Portal Builder - Employee): ERROR - ' + err.message);
  }
  
  console.log('=== TESTS COMPLETED ===');
}

// ── LINE Chat-based Leave Submission Flow Helpers ───────────────────────────

function _LINE_stateKey_(lineUserId) {
  return 'line_state:' + String(lineUserId || '').trim();
}

/**
 * Fast sync lookup used only in warm-up heuristics.
 * This reads the current in-memory cache only.
 */
function _LINE_getStateSync_(lineUserId) {
  try {
    var raw = CacheService.getScriptCache().get(_LINE_stateKey_(lineUserId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function _LINE_getState_(lineUserId) {
  var key = _LINE_stateKey_(lineUserId);
  try {
    // 1) Fast path: memory cache
    var cached = CacheService.getScriptCache().get(key);
    if (cached) return JSON.parse(cached);

    // 2) Persistent path: Settings table (stores line_state:* keys)
    var row = DB_findById(SHEETS.SETTINGS, key);
    if (row && typeof row.value !== 'undefined' && row.value !== null && String(row.value) !== '') {
      var raw = String(row.value);
      CacheService.getScriptCache().put(key, raw, 86400);
      return JSON.parse(raw);
    }
    return null;
  } catch (e) {
    console.error('Error in _LINE_getState_: ' + e.message);
    return null;
  }
}

async function _LINE_saveState_(lineUserId, state) {
  var key = _LINE_stateKey_(lineUserId);
  var raw = JSON.stringify(state || {});
  try {
    CacheService.getScriptCache().put(key, raw, 86400); // refresh local cache immediately
  } catch (e) {}
  try {
    var existing = DB_findById(SHEETS.SETTINGS, key);
    if (existing) {
      await DB_update(SHEETS.SETTINGS, key, { value: raw });
    } else {
      await DB_insert(SHEETS.SETTINGS, { key: key, value: raw });
    }
  } catch (e) {
    console.error('Error in _LINE_saveState_: ' + e.message);
  }
}

async function _LINE_clearState_(lineUserId) {
  var key = _LINE_stateKey_(lineUserId);
  try {
    CacheService.getScriptCache().remove(key);
  } catch (e) {}
  try {
    var existing = DB_findById(SHEETS.SETTINGS, key);
    if (existing) await DB_delete(SHEETS.SETTINGS, key);
  } catch (e) {
    console.error('Error in _LINE_clearState_: ' + e.message);
  }
}

function _LINE_getExpenseTypeLabel_(type) {
  var map = {
    travel: "ค่าเดินทาง",
    meal: "ค่าอาหาร",
    lodging: "ค่าที่พัก",
    office: "ค่าวัสดุ/อุปกรณ์",
    other: "อื่นๆ"
  };
  return map[type] || "ค่าใช้จ่าย";
}

function _LINE_formatThaiDate_(iso) {
  if (!iso) return '-';
  var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(iso);
  var day = d.getDate();
  var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
  var year = d.getFullYear() + 543;
  return day + ' ' + month + ' ' + year;
}

async function _LINE_startExpenseFlow_(replyToken, lineUserId) {
  var state = { step: 'expense_select_type' };
  await _LINE_saveState_(lineUserId, state);

  var flex = {
    type: "flex",
    altText: "เบิกค่าใช้จ่าย - เลือกประเภท",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f766e",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "EXPENSE REQUEST", color: "#99f6e4", size: "xs", weight: "bold" },
          { type: "text", text: "ขั้นตอนที่ 1: เลือกประเภทค่าใช้จ่าย", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: [
          { type: "button", style: "primary", color: "#0891b2", height: "sm", action: { type: "postback", label: "🚕 ค่าเดินทาง", data: "action=expense_select_type&type=travel" } },
          { type: "button", style: "primary", color: "#14b8a6", height: "sm", action: { type: "postback", label: "🍱 ค่าอาหาร", data: "action=expense_select_type&type=meal" } },
          { type: "button", style: "primary", color: "#10b981", height: "sm", action: { type: "postback", label: "🏨 ค่าที่พัก", data: "action=expense_select_type&type=lodging" } },
          { type: "button", style: "primary", color: "#06b6d4", height: "sm", action: { type: "postback", label: "🧾 ค่าวัสดุ/อุปกรณ์", data: "action=expense_select_type&type=office" } },
          { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "📝 อื่นๆ", data: "action=expense_select_type&type=other" } },
          { type: "separator", margin: "md" },
          { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "❌ ยกเลิก", data: "action=expense_cancel" } }
        ]
      }
    }
  };

  await LINE_replyMessage_(replyToken, [flex]);
}

function LINE_buildExpenseDatePickerFlex_(title, postbackData, btnLabel) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f766e",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "EXPENSE DATE", color: "#99f6e4", size: "xs", weight: "bold" },
          { type: "text", text: title, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "button", style: "primary", color: "#0f766e", height: "sm", action: { type: "datetimepicker", label: btnLabel, data: postbackData, mode: "date" } },
          { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "❌ ยกเลิก", data: "action=expense_cancel" } }
        ]
      }
    }
  };
}

function LINE_buildExpenseCompanySelectFlex_() {
  return {
    type: "flex",
    altText: "เบิกค่าใช้จ่าย - เลือกบริษัท",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f766e",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "EXPENSE REQUEST", color: "#99f6e4", size: "xs", weight: "bold" },
          { type: "text", text: "ขั้นตอนที่ 2: เบิกในนามบริษัท", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0891b2",
            height: "sm",
            action: {
              type: "postback",
              label: "🏢 บจก. เอวริณทร์ อินเตอร์กรุ๊ป",
              data: "action=expense_select_company&company=บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด"
            }
          },
          {
            type: "button",
            style: "primary",
            color: "#14b8a6",
            height: "sm",
            action: {
              type: "postback",
              label: "🏢 บจก. สปอร์ต ไตรตัน",
              data: "action=expense_select_company&company=บริษัท สปอร์ต ไตรตัน จำกัด"
            }
          },
          { type: "separator", margin: "md" },
          {
            type: "button",
            style: "secondary",
            color: "#f3f4f6",
            height: "sm",
            action: { type: "postback", label: "❌ ยกเลิก", data: "action=expense_cancel" }
          }
        ]
      }
    }
  };
}

function LINE_buildExpenseConfirmFlex_(user, state) {
  var receiptCount = 0;
  if (state.receipt_url) {
    if (state.receipt_url.indexOf('[') === 0) {
      try {
        var urls = JSON.parse(state.receipt_url);
        receiptCount = urls.length;
      } catch (e) {
        receiptCount = 1;
      }
    } else {
      receiptCount = 1;
    }
  }
  var receiptText = "ไม่แนบ";
  if (receiptCount > 0) {
    receiptText = "อัปโหลดแล้ว (" + receiptCount + "/4 รูป)";
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#111827",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "CONFIRM EXPENSE", color: "#93c5fd", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดตรวจสอบข้อมูลก่อนบันทึก", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        { type: "text", text: "ประเภท: " + (_LINE_getExpenseTypeLabel_(state.expense_type)), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "บริษัท: " + (state.company || '-'), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "วันที่: " + _LINE_formatThaiDate_(state.expense_date), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "จำนวน: " + Number(state.amount || 0).toLocaleString('en-US') + " บาท", size: "xs", color: "#374151", wrap: true, weight: "bold" },
        { type: "text", text: "รายละเอียด: " + String(state.description || '-'), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "ใบเสร็จ: " + receiptText, size: "xs", color: "#374151", wrap: true },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            { type: "button", style: "primary", color: "#10b981", height: "sm", action: { type: "postback", label: "✅ ยืนยันบันทึก", data: "action=expense_confirm_yes" } },
            { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "❌ ยกเลิก", data: "action=expense_cancel" } }
          ]
        }
      ]
    }
  };
  return {
    type: "flex",
    altText: "โปรดยืนยันรายการเบิกค่าใช้จ่าย",
    contents: bubble
  };
}

function LINE_buildExpenseSuccessFlex_(user, ex) {
  var company = '';
  var cleanDesc = ex.description || '';
  if (cleanDesc.indexOf('[') === 0 && cleanDesc.indexOf(']') > 0) {
    var parts = cleanDesc.split(']');
    company = parts[0].substring(1);
    cleanDesc = parts.slice(1).join(']').trim();
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#059669",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "บันทึกค่าใช้จ่ายแล้ว", color: "#d1fae5", size: "xs", weight: "bold" },
        { type: "text", text: "ส่งเข้าระบบเรียบร้อย", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        { type: "text", text: "เลขที่: " + ex.expense_no, size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "บริษัท: " + (company || '-'), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "ประเภท: " + (ex.expense_type || '-'), size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "จำนวน: " + Number(ex.amount || 0).toLocaleString('en-US') + " บาท", size: "xs", color: "#374151", wrap: true, weight: "bold" },
        { type: "text", text: "สถานะ: " + (ex.status_label || ex.status || '-'), size: "xs", color: "#374151", wrap: true }
      ]
    }
  };
  return {
    type: "flex",
    altText: "บันทึกค่าใช้จ่ายเรียบร้อยแล้ว",
    contents: bubble
  };
}

function LINE_buildExpenseListText_(items) {
  if (!items || items.length === 0) return "ℹ️ ยังไม่พบรายการเบิกค่าใช้จ่ายของคุณ";
  var lines = items.slice(0, 5).map(function (ex, i) {
    return (i + 1) + ") " + ex.expense_no + " · " + (ex.expense_type || '-') + " · " + Number(ex.amount || 0).toLocaleString('en-US') + " บาท · " + (ex.status_label || ex.status || '-');
  });
  return "📋 รายการเบิกล่าสุด\n\n" + lines.join("\n");
}

function LINE_buildExpensePendingFlex_(user, items) {
  var rows = (items || []).slice(0, 5).map(function (ex) {
    return {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        { type: "text", text: ex.expense_no + " · " + (ex.requester ? ex.requester.full_name : '-') , size: "sm", weight: "bold", wrap: true },
        { type: "text", text: (ex.expense_type || '-') + " · " + Number(ex.amount || 0).toLocaleString('en-US') + " บาท", size: "xs", color: "#374151", wrap: true },
        { type: "text", text: "สถานะ: " + (ex.status_label || ex.status || '-'), size: "xs", color: "#6b7280", wrap: true },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "button", style: "primary", color: "#059669", height: "sm", action: { type: "postback", label: "✅ อนุมัติ", data: "action=expense_decision&id=" + encodeURIComponent(ex.id) + "&decision=approved" } },
            { type: "button", style: "secondary", color: "#ef4444", height: "sm", action: { type: "postback", label: "❌ ไม่อนุมัติ", data: "action=expense_decision&id=" + encodeURIComponent(ex.id) + "&decision=rejected" } }
          ]
        }
      ]
    };
  });

  return {
    type: "flex",
    altText: "รายการค่าใช้จ่ายรออนุมัติ",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "EXPENSE APPROVAL", color: "#93c5fd", size: "xs", weight: "bold" },
          { type: "text", text: "รายการค่าใช้จ่ายรออนุมัติ", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: rows.length ? rows : [
          { type: "text", text: "✅ ไม่มีรายการรออนุมัติ", size: "sm", color: "#374151", wrap: true }
        ]
      }
    }
  };
}

async function _LINE_startLeaveFlow_(replyToken, lineUserId) {
  var state = { step: 'select_type' };
  await _LINE_saveState_(lineUserId, state);
  
  var flex = {
    type: "flex",
    altText: "ขั้นตอนที่ 1: เลือกประเภทการลา",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "NEW LEAVE REQUEST", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: "ขั้นตอนที่ 1: เลือกประเภทการลา", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          { type: "button", style: "primary", color: "#ef4444", height: "sm", action: { type: "postback", label: "🤒 ลาป่วย (Sick Leave)", data: "action=submit_select_type&type=sick" } },
          { type: "button", style: "primary", color: "#f59e0b", height: "sm", action: { type: "postback", label: "💼 ลากิจส่วนตัว (Personal)", data: "action=submit_select_type&type=personal" } },
          { type: "button", style: "primary", color: "#10b981", height: "sm", action: { type: "postback", label: "🏖️ ลาพักร้อน (Annual)", data: "action=submit_select_type&type=annual" } },
          { type: "separator", margin: "md" },
          { type: "button", style: "secondary", color: "#f3f4f6", height: "sm", action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" } }
        ]
      }
    }
  };
  await LINE_replyMessage_(replyToken, [flex]);
}

function LINE_buildLeaveUnitSelectFlex_() {
  return {
    type: "flex",
    altText: "ยื่นใบลา - เลือกรูปแบบวันลา",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "NEW LEAVE REQUEST", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: "ขั้นตอนที่ 2: เลือกรูปแบบวันลา", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#4f46e5",
            height: "sm",
            action: {
              type: "postback",
              label: "📅 เต็มวัน / หลายวัน",
              data: "action=submit_select_unit&unit=day"
            }
          },
          {
            type: "button",
            style: "primary",
            color: "#6366f1",
            height: "sm",
            action: {
              type: "postback",
              label: "⏱️ รายชั่วโมง",
              data: "action=submit_select_unit&unit=hour"
            }
          },
          { type: "separator", margin: "md" },
          {
            type: "button",
            style: "secondary",
            color: "#f3f4f6",
            height: "sm",
            action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
          }
        ]
      }
    }
  };
}

function LINE_buildTimePickerFlex_(title, postbackData, btnLabel) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "LEAVE TIME SELECTION", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: title, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#4f46e5",
            height: "sm",
            action: {
              type: "datetimepicker",
              label: btnLabel,
              data: postbackData,
              mode: "time"
            }
          },
          {
            type: "button",
            style: "secondary",
            color: "#f3f4f6",
            height: "sm",
            action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
          }
        ]
      }
    }
  };
}

function LINE_buildDatePickerFlex_(title, postbackData, btnLabel) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "LEAVE DATE SELECTION", color: "#c7d2fe", size: "xs", weight: "bold" },
          { type: "text", text: title, color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#4f46e5",
            height: "sm",
            action: {
              type: "datetimepicker",
              label: btnLabel,
              data: postbackData,
              mode: "date"
            }
          },
          {
            type: "button",
            style: "secondary",
            color: "#f3f4f6",
            height: "sm",
            action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
          }
        ]
      }
    }
  };
}

function LINE_buildLeaveConfirmFlex_(user, state) {
  var typeLabel = LEAVE_TYPE_LABEL[state.leave_type] || state.leave_type;
  var duration = cfg_leaveDuration_(state);
  var durationText = duration.error ? "ไม่ระบุ" : (duration.unit === 'hour' ? duration.hours + " ชั่วโมง" : duration.days + " วัน");
  
  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var dateText = (state.start_date === state.end_date)
    ? toThaiDate(state.start_date)
    : toThaiDate(state.start_date) + " - " + toThaiDate(state.end_date);
  if (state.leave_unit === 'hour' && state.start_time && state.end_time) {
    dateText += " (" + state.start_time + " - " + state.end_time + ")";
  }

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e293b",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "CONFIRM LEAVE REQUEST", color: "#94a3b8", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดตรวจสอบข้อมูลเพื่อยืนยัน", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ประเภท", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: typeLabel, size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "วันที่ลา", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: dateText, size: "xs", color: "#1f2937", flex: 5 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "จำนวน", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: durationText, size: "xs", color: "#1f2937", flex: 5, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "เหตุผล", size: "xs", color: "#6b7280", flex: 3 },
            { type: "text", text: state.reason, size: "xs", color: "#1f2937", flex: 5, wrap: true }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#10b981",
              height: "sm",
              action: { type: "postback", label: "✅ ยืนยันยื่นใบลา", data: "action=submit_confirm_yes" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "❌ ยกเลิก", data: "action=submit_cancel" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "โปรดยืนยันใบลาของคุณ",
    contents: bubble
  };
}

function LINE_buildSubmitSuccessFlex_(user, lv) {
  var typeLabel = LEAVE_TYPE_LABEL[lv.leave_type] || lv.leave_type;
  
  function toThaiDate(iso) {
    if (!iso) return '-';
    var d = new Date(String(iso).substring(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    var day = d.getDate();
    var month = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()];
    var year  = d.getFullYear() + 543;
    return day + ' ' + month + ' ' + year;
  }

  var dateText = (lv.start_date === lv.end_date)
    ? toThaiDate(lv.start_date)
    : toThaiDate(lv.start_date) + " - " + toThaiDate(lv.end_date);
  if (String(lv.leave_unit || '') === 'hour' && lv.start_time && lv.end_time) {
    dateText += " (" + lv.start_time + " - " + lv.end_time + ")";
  }
  var durationText = _leaveDurationLabel_(lv);

  var bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "SUCCESS", color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "ยื่นใบลาเรียบร้อยแล้ว! 🎉", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: "คำขอของคุณเข้าระบบและส่งไปยังผู้มีอำนาจตรวจสอบเรียบร้อยแล้ว:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f0fdf4",
          paddingAll: "14px",
          cornerRadius: "10px",
          margin: "sm",
          contents: [
            { type: "text", text: "📝 เลขที่ใบลา: " + lv.leave_no, size: "xs", color: "#065f46", weight: "bold" },
            { type: "text", text: "🤒 ประเภท: " + typeLabel, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "📅 วันที่: " + dateText, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: "⏳ จำนวน: " + durationText, size: "xs", color: "#047857", margin: "xs" }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          margin: "sm",
          action: { type: "postback", label: "📱 กลับหน้าพอร์ทัลหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "ยื่นใบลาเรียบร้อยแล้ว!",
    contents: bubble
  };
}


// === Deno HTTP handler ===
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const bodyText = await req.text();
    const signature = req.headers.get('x-line-signature') || '';

    // Warm only settings first so webhook can read LINE credentials fast.
    await DB_warmCache(['Settings']);
    GLOBAL_SETTINGS = _settingsMap_();

    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET') || _settingsRaw_('line_channel_secret') || '';
    console.log("LINE Webhook: Verifying signature. Secret source:", Deno.env.get('LINE_CHANNEL_SECRET') ? "Env" : (_settingsRaw_('line_channel_secret') ? "Database" : "None"), "Secret length:", channelSecret.length);
    if (channelSecret && signature) {
      const isValid = await verifySignature(bodyText, signature, channelSecret);
      if (!isValid) {
        console.warn("LINE Webhook: Signature verification failed!");
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
      }
    }

    const e = {
      postData: {
        contents: bodyText
      }
    };

    const response = await doPost(e);
    return response;
  } catch (err) {
    console.error("Error processing LINE webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
