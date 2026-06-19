
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🗓 ' + APP.SHORT)
      .addItem('🚀 เริ่มใช้งานระบบ (Initialize)', 'menu_initSystem')
      .addItem('🔐 ขออนุญาตสิทธิ์ระบบ (Grant)', 'menu_grantPermissions')
      .addItem('🔍 ตรวจสถานะสิทธิ์ (Diagnostic)', 'menu_authorize')
      .addSeparator()
      .addItem('🌱 เพิ่มข้อมูลตัวอย่าง', 'menu_seedDemo')
      .addItem('🔧 รีเซ็ตรหัสผ่าน Demo', 'menu_resetDemoPasswords')
      .addItem('🧹 ล้างข้อมูลทั้งหมด', 'menu_clearAll')
      .addSeparator()
      .addItem('🔥 ติดตั้ง Warm Trigger', 'menu_installWarm')
      .addItem('❄️ ถอด Warm Trigger', 'menu_uninstallWarm')
      .addSeparator()
      .addItem('🔗 เปิด Web App URL', 'menu_openWebApp')
      .addItem('📋 คัดลอก Web App URL', 'menu_copyWebAppUrl')
      .addSeparator()
      .addItem('ℹ️ เกี่ยวกับระบบ (About)', 'menu_about')
      .addToUi();
  } catch (e) {}
}

function menu_initSystem() {
  var ui = SpreadsheetApp.getUi();
  try {
    DB_initAllSchemas();
    Settings_ensureDefaults_();
    var n = Seed_ensureUsers_();
    ui.alert('✅ สำเร็จ',
      'เริ่มต้นระบบเรียบร้อย\n' +
      '· สร้าง Sheet schemas: ' + Object.keys(SHEETS).length + ' ตาราง\n' +
      '· Seed default settings: ' + Object.keys(SETTINGS_DEFAULTS).length + ' รายการ\n' +
      '· สร้างบัญชีพนักงานใหม่: ' + n + ' บัญชี\n\n' +
      'รหัสผ่านเริ่มต้นของบัญชี Demo: ' + DEMO_PASSWORD,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error', String(e.message || e), ui.ButtonSet.OK);
  }
}

function menu_grantPermissions() {
  // ★ ห้ามมี try/catch — ปล่อยให้ Apps Script trigger consent dialog
  SpreadsheetApp.getActive().getName();
  DriveApp.getRootFolder().getName();
  Session.getActiveUser().getEmail();
  ScriptApp.getService().getUrl();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  SpreadsheetApp.getUi().alert('✅ พร้อมใช้งาน', 'ระบบได้รับสิทธิ์ครบทุกตัว — ใช้งานได้เลย', SpreadsheetApp.getUi().ButtonSet.OK);
}

function menu_authorize() {
  var ui = SpreadsheetApp.getUi();
  var results = [];
  try { SpreadsheetApp.getActive().getName(); results.push('✓ Spreadsheets'); }
  catch (e) { results.push('✗ Spreadsheets: ' + e.message); }
  try { DriveApp.getRootFolder().getName(); results.push('✓ Drive'); }
  catch (e) { results.push('✗ Drive: ' + e.message); }
  try { Session.getActiveUser().getEmail(); results.push('✓ User Info'); }
  catch (e) { results.push('✗ User Info: ' + e.message); }
  try { ScriptApp.getService().getUrl(); results.push('✓ Script App'); }
  catch (e) { results.push('✗ Script App: ' + e.message); }
  try { UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true }); results.push('✓ External Request'); }
  catch (e) { results.push('✗ External Request: ' + e.message); }
  ui.alert('สถานะ Authorization', results.join('\n'), ui.ButtonSet.OK);
}

function menu_seedDemo() {
  var ui = SpreadsheetApp.getUi();
  try {
    DB_initAllSchemas();
    Settings_ensureDefaults_();
    var n = Seed_ensureUsers_();
    var lv = Seed_demoLeaves_();
    ui.alert('✅ ข้อมูลตัวอย่าง',
      'สร้างบัญชีพนักงานใหม่: ' + n + '\n' +
      'สร้างใบลาตัวอย่าง: ' + lv + '\n' +
      'รหัสผ่าน: ' + DEMO_PASSWORD,
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error', String(e.message || e), ui.ButtonSet.OK);
  }
}

function menu_resetDemoPasswords() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('รีเซ็ตรหัสผ่าน Demo',
    'จะรีเซ็ตรหัสผ่านของบัญชี admin/hrmanager/supervisor/checker/employee* เป็น "' + DEMO_PASSWORD + '"\n(บัญชีอื่นไม่กระทบ)\n\nดำเนินการต่อ?',
    ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  var n = Seed_resetDemoPasswords_();
  ui.alert(n + ' บัญชีถูกรีเซ็ตเรียบร้อย');
}

function menu_clearAll() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('⚠️ ล้างข้อมูลทั้งหมด',
    'จะลบข้อมูลทั้งหมดในทุกตาราง (Users, Leaves, Sessions, Settings, AuditLog)\nการกระทำนี้ไม่สามารถย้อนกลับได้\n\nยืนยัน?',
    ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  Seed_clearAll_();
  ui.alert('🧹 ล้างเรียบร้อย — รัน "เริ่มใช้งานระบบ" เพื่อตั้งค่าใหม่');
}

function _warm_() {
  try {
    DB_readAll(SHEETS.SETTINGS);
    DB_readAll(SHEETS.USERS);
    DB_readAll(SHEETS.MISSIONS);
    DB_readAll(SHEETS.EXPENSES);
    DB_readAll(SHEETS.HOLIDAYS);
  } catch (e) {}
  return new Date().toISOString();
}

function menu_installWarm() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '_warm_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('_warm_').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('🔥 Warm Trigger ติดตั้งแล้ว — ระบบจะ keep warm ทุก 5 นาที');
}
function menu_uninstallWarm() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '_warm_') { ScriptApp.deleteTrigger(t); n++; }
  });
  SpreadsheetApp.getUi().alert('❄️ ถอด Warm Trigger แล้ว (' + n + ' ตัว)');
}

function menu_openWebApp() {
  var url = ScriptApp.getService().getUrl();
  var html = '<!DOCTYPE html><html><body style="font-family:Arial;padding:20px">'
    + '<h3>เปิด Web App</h3>'
    + '<p><a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:#6366f1;font-size:16px">' + url + '</a></p>'
    + '<button onclick="google.script.host.close()" style="padding:8px 16px;background:#6366f1;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px">ปิด</button>'
    + '</body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(500).setHeight(180), 'Web App URL');
}
function menu_copyWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial;padding:20px">'
    + '<h3>📋 คัดลอก URL</h3>'
    + '<input id="u" value="' + url + '" readonly style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'
    + '<p><button onclick="document.getElementById(\'u\').select();document.execCommand(\'copy\');this.textContent=\'✓ คัดลอกแล้ว\'" style="padding:8px 16px;background:#10b981;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px">📋 คัดลอก</button></p>'
    + '</body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(500).setHeight(200), 'คัดลอก URL');
}

function menu_about() {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800&family=Sarabun:wght@400;500;600&display=swap" rel="stylesheet">'
    + '<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">'
    + '<style>'
    + 'body{margin:0;font-family:Kanit,Sarabun,system-ui,sans-serif;color:#1e293b;background:#fff}'
    + '.about{padding:24px}'
    + '.ab-head{display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;margin-bottom:16px}'
    + '.ab-logo{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;box-shadow:0 8px 24px rgba(99,102,241,.35)}'
    + '.ab-title{font-size:20px;font-weight:800}'
    + '.ab-version{display:inline-block;padding:2px 10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:99px;font-size:11px;font-weight:700;margin-top:4px}'
    + '.ab-desc{font-size:13px;line-height:1.6;color:#475569;margin-bottom:14px}'
    + '.ab-meta{font-size:12px;color:#64748b;margin-bottom:14px;line-height:1.8}'
    + '.ab-dev{display:flex;align-items:center;gap:14px;padding:14px;background:linear-gradient(135deg,#f1f5f9,#fff);border:1px solid #e2e8f0;border-radius:14px;text-decoration:none;color:inherit;margin-bottom:14px}'
    + '.ab-dev:hover{border-color:#a5b4fc;box-shadow:0 8px 20px rgba(99,102,241,.15);transform:translateY(-1px)}'
    + '.ab-dev-photo{width:60px;height:60px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(99,102,241,.3);object-fit:cover;flex-shrink:0}'
    + '.ab-dev-info{flex:1;min-width:0}'
    + '.ab-dev-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}'
    + '.ab-dev-name{font-size:15px;font-weight:700;color:#1e293b;margin-top:2px}'
    + '.ab-dev-link{font-size:12px;color:#6366f1;font-weight:600;margin-top:4px;display:flex;align-items:center;gap:4px}'
    + '.ab-tech{font-size:11px;color:#64748b;background:#f8fafc;padding:10px 12px;border-radius:10px;border-left:3px solid #6366f1}'
    + '.ab-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}'
    + '.ab-btn{padding:8px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;border:0;font-family:inherit}'
    + '.ab-btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 6px 14px rgba(99,102,241,.3)}'
    + '</style></head><body>'
    + '<div class="about">'
    + '  <div class="ab-head">'
    + '    <div class="ab-logo"><i class="bi bi-' + (APP.LOGO_ICON || 'box-seam-fill') + '"></i></div>'
    + '    <div><div class="ab-title">' + APP.NAME + '</div>'
    + '         <span class="ab-version">v' + APP.VERSION + '</span></div>'
    + '  </div>'
    + '  <div class="ab-desc">' + (APP.DESCRIPTION || '') + '</div>'
    + '  <div class="ab-meta">'
    + '    📅 <strong>อัปเดตล่าสุด:</strong> ' + APP.LAST_UPDATED + '<br>'
    + '    🏢 <strong>บริษัท:</strong> ' + APP.ORG
    + '  </div>'
    + '  <a class="ab-dev" href="' + APP.DEV.URL + '" target="_blank" rel="noopener noreferrer">'
    + '    <img class="ab-dev-photo" src="' + APP.DEV.LOGO + '" alt="" referrerpolicy="no-referrer">'
    + '    <div class="ab-dev-info">'
    + '      <div class="ab-dev-label">ผู้พัฒนาระบบ</div>'
    + '      <div class="ab-dev-name">' + APP.DEV.NAME + '</div>'
    + '      <div class="ab-dev-link"><i class="bi bi-globe"></i> ' + APP.DEV.URL.replace(/^https?:\/\//, '').replace(/\/$/, '') + '</div>'
    + '    </div>'
    + '    <i class="bi bi-arrow-up-right" style="color:#6366f1;font-size:18px"></i>'
    + '  </a>'
    + '  <div class="ab-tech">🔧 Tech: Google Apps Script · V8 · Sheets-as-DB · HTML/CSS/JS SPA</div>'
    + '  <div class="ab-actions">'
    + '    <button class="ab-btn ab-btn-primary" onclick="google.script.host.close()">ปิด</button>'
    + '  </div>'
    + '</div></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(580), 'เกี่ยวกับ ' + APP.SHORT);
}