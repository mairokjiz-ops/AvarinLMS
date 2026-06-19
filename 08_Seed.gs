
const DEMO_PASSWORD = '123456';
const DEMO_USERS = Object.freeze([
  { username: 'admin',      role: 'admin',      full_name: 'นายผู้ดูแล ระบบ',           position: 'ผู้ดูแลระบบ',         level: '-',         department: 'ฝ่ายเทคโนโลยีสารสนเทศ',  email: 'admin@averintgroup.com',      phone: '0801111111' },
  { username: 'hrmanager',  role: 'approver',   full_name: 'นางสาวฝ่ายบุคคล อนุมัติใจ',  position: 'ผู้จัดการฝ่ายบุคคล',   level: 'ผู้จัดการ', department: 'ฝ่ายทรัพยากรบุคคล',    email: 'hr@averintgroup.com',         phone: '0802222222' },
  { username: 'supervisor', role: 'supervisor', full_name: 'นายหัวหน้า ทีมงาน',           position: 'หัวหน้างาน',           level: 'หัวหน้างาน',department: 'ฝ่ายปฏิบัติการ',        email: 'supervisor@averintgroup.com', phone: '0803333333' },
  { username: 'checker',    role: 'checker',    full_name: 'นางสาวธุรการ ตรวจสอบ',        position: 'เจ้าหน้าที่ธุรการ',    level: 'พนักงาน',   department: 'ฝ่ายธุรการ',            email: 'checker@averintgroup.com',    phone: '0804444444' },
  { username: 'employee1',  role: 'employee',   full_name: 'นางสาวพนักงาน ตัวอย่าง',      position: 'พนักงานขาย',           level: 'พนักงาน',   department: 'ฝ่ายขายและการตลาด',     email: 'employee1@averintgroup.com',  phone: '0805555555' },
  { username: 'employee2',  role: 'employee',   full_name: 'นายพนักงาน บัญชีดี',          position: 'นักบัญชี',             level: 'พนักงาน',   department: 'ฝ่ายการเงินและบัญชี',   email: 'employee2@averintgroup.com',  phone: '0806666666' }
]);

function Seed_ensureUsers_() {
  var created = 0;
  DEMO_USERS.forEach(function (u) {
    var exists = DB_findOne(SHEETS.USERS, function (x) { return String(x.username || '').toLowerCase() === u.username; });
    if (exists) return;
    var salt = cfg_salt_();
    DB_insert(SHEETS.USERS, {
      username: u.username,
      password_hash: cfg_hash_(DEMO_PASSWORD, salt),
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
  });
  return created;
}

function Seed_resetDemoPasswords_() {
  var n = 0;
  DEMO_USERS.forEach(function (du) {
    var u = DB_findOne(SHEETS.USERS, function (x) { return String(x.username || '').toLowerCase() === du.username; });
    if (!u) return;
    var salt = cfg_salt_();
    DB_update(SHEETS.USERS, u.id, {
      salt: salt,
      password_hash: cfg_hash_(DEMO_PASSWORD, salt),
      is_active: 'yes'
    });
    n++;
  });
  return n;
}

function Seed_demoLeaves_() {
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
  employees.slice(0, 3).forEach(function (t, idx) {
    samples.forEach(function (s, i) {
      var start = new Date(now.getFullYear(), now.getMonth() - i - idx, 5 + i);
      var end = new Date(start.getTime() + (s.days - 1) * 86400000);
      var startISO = cfg_dateOnly_(start);
      var endISO = cfg_dateOnly_(end);
      var status = i === 0 ? STATUS.APPROVED : (i === 1 ? STATUS.PENDING : STATUS.APPROVED);
      DB_insert(SHEETS.LEAVES, {
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
    });
  });
  return n;
}

function Seed_clearAll_() {
  Object.keys(SHEETS).forEach(function (k) {
    var name = SHEETS[k];
    var sh = DB_sheet_(name);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
    DB_invalidate(name);
  });
}



function Seed_demoMissions_() {
  var users = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.is_active); });
  if (users.length === 0) return 0;
  if (DB_readAll(SHEETS.MISSIONS).length > 0) return 0;
  var now = cfg_now_();
  var samples = [
    { title: 'ตรวจสต็อกสาขา', purpose: 'ตรวจสอบสต็อกสินค้าคงเหลือ', destination: 'สาขาโคราช', days: 1, amount: 850, expense_type: 'travel' },
    { title: 'พบลูกค้ารายใหม่', purpose: 'นำเสนอสินค้าและปิดการขาย', destination: 'จังหวัดระยอง', days: 2, amount: 2450, expense_type: 'meal' },
    { title: 'อบรมคู่ค้า', purpose: 'อบรมการใช้งานระบบหน้าแคชเชียร์', destination: 'จังหวัดชลบุรี', days: 1, amount: 1150, expense_type: 'other' }
  ];
  var n = 0;
  samples.forEach(function (s, i) {
    var u = users[i % users.length];
    var start = new Date(now.getFullYear(), now.getMonth(), Math.max(1, 4 + i * 3));
    var end = new Date(start.getTime() + (s.days - 1) * 86400000);
    var m = DB_insert(SHEETS.MISSIONS, {
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
    DB_insert(SHEETS.EXPENSES, {
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
  });
  return n;
}

function Seed_ensureHolidays_() {
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
  defaults.forEach(function (h) {
    var dateStr = h.date;
    var exists = DB_findOne(SHEETS.HOLIDAYS, function (x) { return String(x.holiday_date) === dateStr; });
    if (exists) return;
    DB_insert(SHEETS.HOLIDAYS, {
      holiday_date: dateStr,
      name: h.name
    });
    created++;
  });
  return created;
}
