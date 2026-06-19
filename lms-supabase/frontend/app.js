/*
   LMS Portal - Frontend Application Controller
   Powered by Supabase, Vanilla JavaScript, and Bootstrap 5
*/

(function () {
  'use strict';

  // ── STATE VARIABLES ───────────────────────────────────────────────
  let sb = null; // Supabase Client
  let currentUser = null;
  let allSettings = {};
  let holidaysMap = {};
  let calendarInstance = null;

  // ── INITIALIZATION ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });

  async function initApp() {
    showLoading(true);
    
    // Check if Supabase keys exist in localStorage
    const savedUrl = localStorage.getItem('LMS_SUPABASE_URL');
    const savedKey = localStorage.getItem('LMS_SUPABASE_KEY');

    if (!savedUrl || !savedKey) {
      showLoading(false);
      promptSupabaseConfig();
      return;
    }

    try {
      // Initialize Supabase client
      sb = window.supabase.createClient(savedUrl, savedKey);
      
      // Bind all form submit and click listeners once
      setupFormListeners();
      
      // Setup Auth state listener
      sb.auth.onAuthStateChange(async (event, session) => {
        if (session) {
          await handleUserAuthenticated(session.user);
        } else {
          handleUserUnauthenticated();
        }
      });
      
      // Start clock in header navbar
      setInterval(updateHeaderTime, 1000);
      updateHeaderTime();

    } catch (err) {
      console.error('Supabase Init Error:', err);
      showLoading(false);
      Swal.fire({
        icon: 'error',
        title: 'เชื่อมต่อฐานข้อมูลล้มเหลว',
        text: 'ไม่สามารถเชื่อมต่อ Supabase ได้ กรุณาตรวจสอบคีย์อีกครั้ง',
        confirmButtonText: 'ตั้งค่าใหม่'
      }).then(() => {
        localStorage.removeItem('LMS_SUPABASE_URL');
        localStorage.removeItem('LMS_SUPABASE_KEY');
        window.location.reload();
      });
    }
  }

  // ── SUPABASE CREDENTIALS CONFIGURATOR ─────────────────────────────
  function promptSupabaseConfig() {
    Swal.fire({
      title: 'ตั้งค่าคีย์ฐานข้อมูล Supabase',
      html: `
        <p class="text-start small text-muted mb-3">กรุณาระบุ URL และ Anon Key ของโครงการ Supabase ของคุณเพื่อเชื่อมต่อฐานข้อมูล (ระบบจะบันทึกไว้ในเบราว์เซอร์นี้เท่านั้น)</p>
        <div class="mb-3 text-start">
          <label class="form-label font-monospace small">SUPABASE PROJECT URL</label>
          <input type="text" id="sb-url" class="form-control font-monospace" placeholder="https://xxxxxx.supabase.co" value="">
        </div>
        <div class="mb-3 text-start">
          <label class="form-label font-monospace small">SUPABASE ANON KEY</label>
          <input type="text" id="sb-key" class="form-control font-monospace" placeholder="eyJhbG..." value="">
        </div>
      `,
      focusConfirm: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      confirmButtonText: 'บันทึกและเชื่อมต่อ',
      preConfirm: () => {
        const url = document.getElementById('sb-url').value.trim();
        const key = document.getElementById('sb-key').value.trim();
        if (!url || !key) {
          Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
        }
        return { url, key };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.setItem('LMS_SUPABASE_URL', result.value.url);
        localStorage.setItem('LMS_SUPABASE_KEY', result.value.key);
        window.location.reload();
      }
    });
  }

  // ── AUTH STATE HANDLERS ───────────────────────────────────────────
  async function handleUserAuthenticated(authUser) {
    try {
      // Fetch user profile from profiles table
      const { data: profile, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) throw error;

      if (!profile.is_active) {
        await sb.auth.signOut();
        Swal.fire({
          icon: 'warning',
          title: 'บัญชีถูกระงับการใช้งาน',
          text: 'กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานบัญชีนี้',
          confirmButtonText: 'ตกลง'
        });
        return;
      }

      currentUser = profile;
      
      // Ensure Connection Code exists for LINE linking
      if (!currentUser.line_connect_code && !currentUser.line_user_id) {
        const code = String(100000 + Math.floor(Math.random() * 900000));
        const { data: updatedProfile } = await sb
          .from('profiles')
          .update({ line_connect_code: code })
          .eq('id', currentUser.id)
          .select()
          .single();
        if (updatedProfile) currentUser = updatedProfile;
      }

      // Pre-fetch settings and holidays
      await fetchSettings();
      await fetchHolidays();

      // Configure UI permissions based on Role
      setupUIPermissions();

      // Render profile labels in header and sidebar
      updateProfileUI();

      // Hide Auth section, Show Portal
      document.getElementById('sec-auth').classList.add('d-none');
      document.getElementById('main-portal').classList.remove('d-none');

      // Initialize client router and handle current route
      window.removeEventListener('hashchange', handleRouting);
      window.addEventListener('hashchange', handleRouting);
      
      // Trigger default routing (Dashboard)
      if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#dashboard';
      } else {
        handleRouting();
      }

    } catch (err) {
      console.error('Fetch Profile Error:', err);
      // Fallback: If auth exists but profile doesn't (timing issue / database trigger failed)
      // Wait 1.5 seconds and reload, or notify
      setTimeout(async () => {
        const { data: retryProfile } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
        if (retryProfile) {
          window.location.reload();
        } else {
          showLoading(false);
          Swal.fire({
            icon: 'info',
            title: 'กำลังเชื่อมต่อโปรไฟล์...',
            text: 'ระบบกำลังสร้างพื้นที่จัดเก็บข้อมูลของคุณ กรุณารอครู่หนึ่งและกดยืนยัน',
            confirmButtonText: 'รีโหลดหน้าจอ'
          }).then(() => window.location.reload());
        }
      }, 1500);
    }
  }

  function handleUserUnauthenticated() {
    currentUser = null;
    document.getElementById('main-portal').classList.add('d-none');
    document.getElementById('sec-auth').classList.remove('d-none');
    showLoading(false);
  }

  // ── DATA FETCHING FUNCTIONS ───────────────────────────────────────
  async function fetchSettings() {
    const { data, error } = await sb.from('settings').select('*');
    if (!error && data) {
      allSettings = {};
      data.forEach(s => {
        allSettings[s.key] = s.value;
      });
      
      // Update webhook display if admin
      if (currentUser && currentUser.role === 'admin') {
        const funcUrl = localStorage.getItem('LMS_SUPABASE_URL').replace('.supabase.co', '.supabase.co/functions/v1/line-webhook');
        const webhookDisplay = document.getElementById('line-webhook-display');
        if (webhookDisplay) webhookDisplay.value = funcUrl;
      }
    }
  }

  async function fetchHolidays() {
    const { data, error } = await sb.from('holidays').select('*').order('holiday_date', { ascending: true });
    if (!error && data) {
      holidaysMap = {};
      data.forEach(h => {
        const dateStr = h.holiday_date.substring(0, 10);
        holidaysMap[dateStr] = h.name;
      });
    }
  }

  // ── ROUTING CONTROLLER ────────────────────────────────────────────
  async function handleRouting() {
    const hash = window.location.hash.substring(1) || 'dashboard';
    showLoading(true);

    // Hide all subpages
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('d-none'));
    
    // De-activate all sidebar menu items
    document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));

    // Highlight current menu link
    const activeLink = document.querySelector(`.menu-link[href="#${hash}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
      document.getElementById('nav-page-title').textContent = activeLink.querySelector('span').textContent;
    }

    // Toggle target section display and fetch page specific data
    if (hash === 'dashboard') {
      await loadDashboardPage();
      document.getElementById('sec-dashboard').classList.remove('d-none');
    } 
    else if (hash === 'request-leave') {
      await loadRequestLeavePage();
      document.getElementById('sec-request').classList.remove('d-none');
    } 
    else if (hash === 'history') {
      await loadHistoryPage();
      document.getElementById('sec-history').classList.remove('d-none');
    } 
    else if (hash === 'approvals') {
      if (['admin', 'approver', 'supervisor', 'checker'].includes(currentUser.role)) {
        await loadApprovalsPage();
        document.getElementById('sec-approvals').classList.remove('d-none');
      } else {
        window.location.hash = '#dashboard';
      }
    } 
    else if (hash === 'calendar') {
      document.getElementById('sec-calendar').classList.remove('d-none');
      loadCalendarPage();
    } 
    else if (hash === 'holidays') {
      await loadHolidaysPage();
      document.getElementById('sec-holidays').classList.remove('d-none');
    } 
    else if (hash === 'settings') {
      if (currentUser.role === 'admin') {
        await loadSettingsPage();
        document.getElementById('sec-settings').classList.remove('d-none');
      } else {
        window.location.hash = '#dashboard';
      }
    }

    // Auto close mobile sidebar
    document.getElementById('portal-sidebar').classList.remove('show');
    showLoading(false);
  }

  // ── 1. DASHBOARD PAGE CONTROLLER ──────────────────────────────────
  async function loadDashboardPage() {
    // Basic Details
    document.getElementById('dash-user-fullname').textContent = currentUser.full_name || '-';
    document.getElementById('dash-user-pos').textContent = currentUser.position || 'พนักงาน';
    document.getElementById('dash-user-dept').textContent = currentUser.department || 'ทั่วไป';
    document.getElementById('dash-user-level').textContent = currentUser.level || 'พนักงาน';
    
    const currentYear = new Date().getFullYear();
    document.getElementById('dash-fiscal-year').textContent = currentYear + 543; // BE Year

    // Render LINE Bind state
    const lineBox = document.getElementById('dash-line-binding');
    if (currentUser.line_user_id) {
      lineBox.innerHTML = `
        <span class="badge bg-success py-2 px-3"><i class="bi bi-line me-1"></i> เชื่อมต่อ LINE OA แล้ว</span>
      `;
    } else {
      lineBox.innerHTML = `
        <span class="badge bg-warning text-dark py-2 px-3 me-2"><i class="bi bi-line me-1"></i> ยังไม่ได้เชื่อมต่อ LINE</span>
        <button class="btn btn-xs btn-outline-light py-1 px-2 border-warning text-warning" onclick="window.LMS.showLineLinkInfo('${currentUser.line_connect_code}')">
          วิธีเชื่อมต่อคีย์: ${currentUser.line_connect_code}
        </button>
      `;
    }

    // Fetch User's Leaves for Quota calculations
    const { data: leaves, error } = await sb
      .from('leaves')
      .select('*')
      .eq('requester_id', currentUser.id)
      .eq('fiscal_year', currentYear);

    const totals = { sick: 0, personal: 0, annual: 0, maternity: 0 };
    if (!error && leaves) {
      leaves.forEach(lv => {
        if (['approved', 'pending', 'checked', 'reviewed'].includes(lv.status)) {
          totals[lv.leave_type] = (totals[lv.leave_type] || 0) + Number(lv.days || 0);
        }
      });
    }

    // Quota limits
    const limits = {
      sick: Number(allSettings.limit_sick || 30),
      personal: Number(allSettings.limit_personal || 6),
      annual: Number(allSettings.limit_annual || 10),
      maternity: Number(allSettings.limit_maternity || 10)
    };

    const quotaGrid = document.getElementById('leave-quota-grid');
    quotaGrid.innerHTML = '';

    const types = [
      { key: 'sick', label: 'ลาป่วย', icon: 'bi-heart-pulse', color: 'info' },
      { key: 'personal', label: 'ลากิจส่วนตัว', icon: 'bi-briefcase', color: 'warning' },
      { key: 'annual', label: 'ลาพักร้อน', icon: 'bi-sun', color: 'success' },
      { key: 'maternity', label: 'ลาคลอดบุตร', icon: 'bi-gender-female', color: 'primary' }
    ];

    types.forEach(t => {
      const used = totals[t.key] || 0;
      const max = limits[t.key] || 0;
      const left = Math.max(0, max - used);
      const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
      
      const card = document.createElement('div');
      card.className = 'col';
      card.innerHTML = `
        <div class="glass-card quota-card">
          <div class="quota-header">
            <div>
              <span class="quota-total">${t.label} (สิทธิ์ ${max} วัน)</span>
              <div class="quota-value mt-1">${left} <span class="fs-6 text-muted">วันคงเหลือ</span></div>
            </div>
            <div class="quota-icon ${t.key}"><i class="bi ${t.icon}"></i></div>
          </div>
          <div class="small text-light-muted d-flex justify-content-between">
            <span>ใช้ไปแล้ว: ${used} วัน</span>
            <span>${percent}%</span>
          </div>
          <div class="progress-container">
            <div class="progress-bar-inner bg-${t.color}" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
      quotaGrid.appendChild(card);
    });

    // Recent Leaves
    const { data: recentLeaves } = await sb
      .from('leaves')
      .select('*')
      .eq('requester_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentBody = document.getElementById('dash-recent-leaves-body');
    recentBody.innerHTML = '';
    
    if (recentLeaves && recentLeaves.length > 0) {
      recentLeaves.forEach(lv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><a href="#" class="text-gradient fw-bold" onclick="window.LMS.viewLeaveDetails('${lv.id}')">${lv.leave_no}</a></td>
          <td>${getLeaveTypeLabel(lv.leave_type)}</td>
          <td>${formatDateRange(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time)}</td>
          <td>${lv.days} วัน</td>
          <td><span class="badge-status ${lv.status}">${getStatusLabel(lv.status)}</span></td>
          <td>
            <button class="btn btn-xs btn-outline-light py-1 px-2.5" onclick="window.LMS.viewLeaveDetails('${lv.id}')">รายละเอียด</button>
          </td>
        `;
        recentBody.appendChild(tr);
      });
    } else {
      recentBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">ไม่มีประวัติคำขอการลาล่าสุด</td></tr>`;
    }

    // Refresh pending count badge dynamically in sidebar
    await updateApprovalBadgeCount();
  }

  window.LMS = window.LMS || {};
  window.LMS.showLineLinkInfo = function (code) {
    Swal.fire({
      title: 'ขั้นตอนการเชื่อมต่อบัญชี LINE',
      html: `
        <div class="text-start small text-light-muted">
          <ol>
            <li class="mb-2">ค้นหาไอดี LINE OA หรือสแกน QR Code เพื่อเพิ่มเพื่อนระบบบันทึกการลา</li>
            <li class="mb-2">ในห้องแชท ให้พิมพ์ข้อความส่งหาแชทบอทดังนี้:
              <div class="bg-dark p-2 rounded text-center text-success font-monospace my-2 fs-6">connect ${code}</div>
            </li>
            <li>ระบบจะตอบรับและแจ้งผลการเชื่อมต่อสำเร็จ คุณจะสามารถรับการแจ้งเตือนและตรวจสอบโควตาผ่าน LINE ได้ทันที</li>
          </ol>
        </div>
      `,
      confirmButtonText: 'รับทราบ'
    });
  };

  // ── 2. REQUEST LEAVE PAGE CONTROLLER ──────────────────────────────
  async function loadRequestLeavePage() {
    document.getElementById('form-leave-request').reset();
    document.getElementById('row-unit-day').classList.remove('d-none');
    document.getElementById('row-unit-hour').classList.add('d-none');
    document.getElementById('duration-calculation-box').classList.add('bg-dark-opacity');
    document.getElementById('duration-calculation-box').classList.remove('border-danger');
    document.getElementById('calc-duration-days').textContent = '0 วัน';
    document.getElementById('calc-warning-container').classList.add('d-none');
    document.getElementById('last-leave-info-box').classList.add('d-none');
    document.getElementById('req-attachment-url').value = '';
    
    // Set default phone from profile
    document.getElementById('req-contact-phone').value = currentUser.phone || '';
  }

  // ── 3. HISTORY PAGE CONTROLLER ────────────────────────────────────
  async function loadHistoryPage() {
    await fetchHistoryTable();
  }

  async function fetchHistoryTable() {
    const filterType = document.getElementById('history-filter-type').value;
    const filterStatus = document.getElementById('history-filter-status').value;

    let query = sb.from('leaves').select('*').eq('requester_id', currentUser.id);

    if (filterType !== 'all') {
      query = query.eq('leave_type', filterType);
    }
    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data: leaves, error } = await query.order('created_at', { ascending: false });
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    if (!error && leaves && leaves.length > 0) {
      leaves.forEach(lv => {
        const tr = document.createElement('tr');
        const canCancel = ['draft', 'pending'].includes(lv.status);
        const cancelBtn = canCancel 
          ? `<button class="btn btn-xs btn-outline-danger py-1 px-2.5 ms-1" onclick="window.LMS.cancelLeave('${lv.id}', '${lv.leave_no}')">ยกเลิก</button>` 
          : '';

        tr.innerHTML = `
          <td><a href="#" class="text-gradient fw-bold" onclick="window.LMS.viewLeaveDetails('${lv.id}')">${lv.leave_no}</a></td>
          <td>${getLeaveTypeLabel(lv.leave_type)}</td>
          <td>${new Date(lv.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
          <td>${formatDateRange(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time)}</td>
          <td>${lv.days} วัน</td>
          <td><span class="badge-status ${lv.status}">${getStatusLabel(lv.status)}</span></td>
          <td>
            <button class="btn btn-xs btn-outline-light py-1 px-2.5" onclick="window.LMS.viewLeaveDetails('${lv.id}')">ดูรายละเอียด</button>
            ${cancelBtn}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">ไม่พบประวัติการลาที่สอดคล้องกับตัวกรอง</td></tr>`;
    }
  }

  window.LMS.cancelLeave = function (id, leaveNo) {
    Swal.fire({
      title: `ยืนยันการยกเลิกใบลา?`,
      text: `คุณต้องการยกเลิกคำขอใบลาเลขที่ ${leaveNo} ใช่หรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'ใช่, ยกเลิกใบลา',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        showLoading(true);
        const { error } = await sb
          .from('leaves')
          .update({ status: 'cancelled' })
          .eq('id', id);

        showLoading(false);
        if (error) {
          Swal.fire('ข้อผิดพลาด', 'ไม่สามารถยกเลิกใบลาได้: ' + error.message, 'error');
        } else {
          Swal.fire('สำเร็จ', 'ยกเลิกใบลาเรียบร้อยแล้ว', 'success');
          fetchHistoryTable();
        }
      }
    });
  };

  // ── 4. APPROVALS INBOX PAGE CONTROLLER ────────────────────────────
  async function loadApprovalsPage() {
    await fetchPendingApprovals();
    await fetchCompletedApprovals();
  }

  async function fetchPendingApprovals() {
    const role = currentUser.role;
    let query = sb.from('leaves').select('*, requester:profiles(full_name, department)');

    // Stage filters based on role logic:
    // admin sees all pending review stages.
    // checker sees pending.
    // supervisor sees checked.
    // approver sees reviewed.
    if (role === 'admin') {
      query = query.in('status', ['pending', 'checked', 'reviewed']);
    } else if (role === 'checker') {
      query = query.eq('status', 'pending');
    } else if (role === 'supervisor') {
      query = query.eq('status', 'checked');
    } else if (role === 'approver') {
      query = query.eq('status', 'reviewed');
    }

    const { data: leaves, error } = await query.order('created_at', { ascending: true });
    const tbody = document.getElementById('approvals-pending-body');
    tbody.innerHTML = '';

    if (!error && leaves && leaves.length > 0) {
      leaves.forEach(lv => {
        const tr = document.createElement('tr');
        
        let targetAction = '';
        if (lv.status === 'pending') targetAction = 'ตรวจสอบข้อมูล (Checker)';
        else if (lv.status === 'checked') targetAction = 'ความเห็นหัวหน้า (Supervisor)';
        else if (lv.status === 'reviewed') targetAction = 'พิจารณาอนุมัติ (HR Approver)';

        const requesterName = lv.requester ? lv.requester.full_name : 'ไม่ระบุ';
        const requesterDept = lv.requester ? lv.requester.department : 'ทั่วไป';

        tr.innerHTML = `
          <td><a href="#" class="text-gradient fw-bold" onclick="window.LMS.viewLeaveDetails('${lv.id}')">${lv.leave_no}</a></td>
          <td><div>${requesterName}</div><small class="text-muted">${requesterDept}</small></td>
          <td>${getLeaveTypeLabel(lv.leave_type)}</td>
          <td>${formatDateRange(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time)}</td>
          <td>${lv.days} วัน</td>
          <td><span class="badge bg-dark-opacity text-warning border border-warning px-2.5 py-1 small">${targetAction}</span></td>
          <td>
            <button class="btn btn-xs btn-primary py-1 px-2.5 me-1" onclick="window.LMS.openReviewModal('${lv.id}', '${lv.status}')">จัดการอนุมัติ</button>
            <button class="btn btn-xs btn-outline-light py-1 px-2" onclick="window.LMS.viewLeaveDetails('${lv.id}')">รายละเอียด</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">ไม่มีใบลาที่รอดำเนินการของคุณในขณะนี้</td></tr>`;
    }
  }

  async function fetchCompletedApprovals() {
    // Fetch leaves where current user acted as checker, supervisor, or approver
    const { data: leaves, error } = await sb
      .from('leaves')
      .select('*, requester:profiles(full_name)')
      .or(`checker_id.eq.${currentUser.id},supervisor_id.eq.${currentUser.id},approver_id.eq.${currentUser.id}`)
      .order('updated_at', { ascending: false });

    const tbody = document.getElementById('approvals-history-body');
    tbody.innerHTML = '';

    if (!error && leaves && leaves.length > 0) {
      leaves.forEach(lv => {
        const tr = document.createElement('tr');
        const reqName = lv.requester ? lv.requester.full_name : 'ไม่ระบุ';
        const dateStr = new Date(lv.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

        tr.innerHTML = `
          <td><a href="#" class="text-gradient fw-bold" onclick="window.LMS.viewLeaveDetails('${lv.id}')">${lv.leave_no}</a></td>
          <td>${reqName}</td>
          <td>${getLeaveTypeLabel(lv.leave_type)}</td>
          <td>${formatDateRange(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time)}</td>
          <td>${lv.days} วัน</td>
          <td><span class="badge-status ${lv.status}">${getStatusLabel(lv.status)}</span></td>
          <td>${dateStr}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">ไม่มีประวัติการทำรายการอนุมัติ</td></tr>`;
    }
  }

  window.LMS.openReviewModal = function (id, status) {
    document.getElementById('review-leave-id').value = id;
    document.getElementById('review-action').value = status; // pending, checked, reviewed
    document.getElementById('review-comment').value = '';
    
    // Set headers
    const title = document.getElementById('mdl-review-title');
    if (status === 'pending') title.innerHTML = '<i class="bi bi-shield-check me-1 text-info"></i> ตรวจสอบเอกสารใบลา (Checker)';
    else if (status === 'checked') title.innerHTML = '<i class="bi bi-chat-text me-1 text-warning"></i> ระบุความเห็นหัวหน้างาน (Supervisor)';
    else if (status === 'reviewed') title.innerHTML = '<i class="bi bi-check-all me-1 text-success"></i> พิจารณาอนุมัติขั้นสุดท้าย (HR Approver)';

    const modalEl = document.getElementById('modal-review');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  };

  // ── 5. CALENDAR PAGE CONTROLLER ────────────────────────────────────
  function loadCalendarPage() {
    const calendarEl = document.getElementById('calendar-container');
    
    // Re-instantiate calendar if it already exists to prevent layout breakage
    if (calendarInstance) {
      calendarInstance.destroy();
    }

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
      locale: 'th',
      initialView: 'dayGridMonth',
      themeSystem: 'standard',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek'
      },
      buttonText: {
        today: 'วันนี้',
        month: 'เดือน',
        week: 'สัปดาห์'
      },
      events: async function (info, successCallback, failureCallback) {
        try {
          // Fetch approved leaves
          const { data: leaves } = await sb
            .from('leaves')
            .select('*, requester:profiles(full_name)')
            .eq('status', 'approved');

          const eventsList = [];
          if (leaves) {
            leaves.forEach(lv => {
              const reqName = lv.requester ? lv.requester.full_name : 'พนักงาน';
              // FullCalendar requires end date to be exclusive for dayGrid
              let endStr = lv.end_date;
              if (lv.leave_unit === 'day') {
                const endDate = new Date(lv.end_date + 'T00:00:00');
                endDate.setDate(endDate.getDate() + 1);
                endStr = endDate.toISOString().substring(0, 10);
              }

              eventsList.push({
                id: lv.id,
                title: `${reqName} (${getLeaveTypeLabel(lv.leave_type)})`,
                start: lv.leave_unit === 'hour' ? `${lv.start_date}T${lv.start_time}` : lv.start_date,
                end: lv.leave_unit === 'hour' ? `${lv.start_date}T${lv.end_time}` : endStr,
                className: `fc-event-${lv.leave_type}`,
                allDay: lv.leave_unit === 'day',
                extendedProps: { isLeave: true }
              });
            });
          }

          // Add holidays
          const { data: holList } = await sb.from('holidays').select('*');
          if (holList) {
            holList.forEach(h => {
              eventsList.push({
                title: `วันหยุด: ${h.name}`,
                start: h.holiday_date,
                className: 'fc-event-holiday',
                allDay: true,
                extendedProps: { isLeave: false }
              });
            });
          }

          successCallback(eventsList);
        } catch (err) {
          failureCallback(err);
        }
      },
      eventClick: function (info) {
        if (info.event.extendedProps.isLeave) {
          window.LMS.viewLeaveDetails(info.event.id);
        } else {
          Swal.fire({
            title: info.event.title,
            text: 'วันหยุดนักขัตฤกษ์/วันหยุดบริษัท ประจำปี',
            icon: 'info',
            confirmButtonText: 'ปิด'
          });
        }
      }
    });

    calendarInstance.render();
  }

  // ── 6. HOLIDAYS PAGE CONTROLLER ───────────────────────────────────
  async function loadHolidaysPage() {
    await fetchHolidaysTable();
  }

  async function fetchHolidaysTable() {
    const { data: holidays, error } = await sb
      .from('holidays')
      .select('*')
      .order('holiday_date', { ascending: true });

    const tbody = document.getElementById('holidays-table-body');
    tbody.innerHTML = '';

    const isAdmin = currentUser.role === 'admin';
    const actionTh = document.querySelector('.th-holiday-actions');
    const addBtn = document.getElementById('btn-add-holiday');
    
    if (isAdmin) {
      if (actionTh) actionTh.classList.remove('d-none');
      if (addBtn) addBtn.classList.remove('d-none');
    } else {
      if (actionTh) actionTh.classList.add('d-none');
      if (addBtn) addBtn.classList.add('d-none');
    }

    if (!error && holidays && holidays.length > 0) {
      holidays.forEach((h, idx) => {
        const tr = document.createElement('tr');
        const dateStr = new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
        
        let actionTd = '';
        if (isAdmin) {
          actionTd = `<td><button class="btn btn-xs btn-outline-danger py-0.5 px-2" onclick="window.LMS.deleteHoliday(${h.id}, '${h.name}')">ลบ</button></td>`;
        }

        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td>${dateStr}</td>
          <td><span class="fw-bold">${h.name}</span></td>
          ${actionTd}
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">ไม่พบข้อมูลวันหยุดประจำปี</td></tr>`;
    }
  }

  window.LMS.deleteHoliday = function (id, name) {
    Swal.fire({
      title: 'ต้องการลบวันหยุดนี้?',
      text: `คุณต้องการลบวันหยุด "${name}" ใช่หรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'ลบข้อมูล',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        showLoading(true);
        const { error } = await sb.from('holidays').delete().eq('id', id);
        showLoading(false);
        if (error) {
          Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
        } else {
          Swal.fire('ลบเสร็จสิ้น', 'ลบข้อมูลวันหยุดแล้ว', 'success');
          await fetchHolidays();
          fetchHolidaysTable();
        }
      }
    });
  };

  // ── 7. SETTINGS PAGE CONTROLLER ───────────────────────────────────
  async function loadSettingsPage() {
    // Populate form data
    document.getElementById('set-org-name').value = allSettings.org_name || '';
    document.getElementById('set-org-email').value = allSettings.org_email || '';
    document.getElementById('set-limit-sick').value = allSettings.limit_sick || '30';
    document.getElementById('set-limit-personal').value = allSettings.limit_personal || '6';
    document.getElementById('set-limit-annual').value = allSettings.limit_annual || '10';
    document.getElementById('set-limit-maternity').value = allSettings.limit_maternity || '10';
    document.getElementById('set-work-hours').value = allSettings.leave_workday_hours || '8';
    document.getElementById('set-stages').value = allSettings.approval_stages || '3';
    
    // LINE
    document.getElementById('set-line-token').value = allSettings.line_channel_access_token || '';
    document.getElementById('set-line-secret').value = allSettings.line_channel_secret || '';

    await fetchSettingsUsersTable();
  }

  async function fetchSettingsUsersTable() {
    const { data: users, error } = await sb
      .from('profiles')
      .select('*')
      .order('email', { ascending: true });

    const tbody = document.getElementById('settings-users-body');
    tbody.innerHTML = '';

    if (!error && users) {
      users.forEach(u => {
        const tr = document.createElement('tr');
        const roleLabel = getRoleLabel(u.role);
        const activeClass = u.is_active ? 'bg-success-opacity text-success border-success' : 'bg-dark-opacity text-light-muted border-secondary';
        const activeLabel = u.is_active ? 'เปิดใช้งาน' : 'ระงับใช้งาน';
        const lineBound = u.line_user_id 
          ? `<span class="badge bg-success-opacity text-success"><i class="bi bi-check-circle-fill"></i> เชื่อมแล้ว</span>`
          : `<span class="badge bg-dark-opacity text-light-muted">ไม่ได้เชื่อม</span>`;

        tr.innerHTML = `
          <td>${u.email}</td>
          <td><code>${u.username || '-'}</code></td>
          <td><span class="fw-bold">${u.full_name || '-'}</span></td>
          <td>${u.department || '-'}</td>
          <td><span class="badge bg-dark-opacity text-light border border-secondary px-2 py-1 small">${roleLabel}</span></td>
          <td>${lineBound}</td>
          <td><span class="badge ${activeClass} border px-2 py-1 small">${activeLabel}</span></td>
          <td>
            <button class="btn btn-xs btn-primary py-0.5 px-2" onclick="window.LMS.openUserEditModal('${u.id}')">แก้ไข</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  window.LMS.openUserEditModal = async function (id) {
    const { data: u, error } = await sb.from('profiles').select('*').eq('id', id).single();
    if (error || !u) return;

    document.getElementById('edit-user-id').value = u.id;
    document.getElementById('edit-user-name').value = u.full_name || '';
    document.getElementById('edit-user-position').value = u.position || '';
    document.getElementById('edit-user-level').value = u.level || '';
    document.getElementById('edit-user-department').value = u.department || '';
    document.getElementById('edit-user-role').value = u.role;
    document.getElementById('edit-user-active').value = String(u.is_active);
    document.getElementById('edit-user-phone').value = u.phone || '';

    const modalEl = document.getElementById('modal-user-edit');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  };

  // ── LEAVE DETAIL VIEWER MODAL ─────────────────────────────────────
  window.LMS.viewLeaveDetails = async function (id) {
    showLoading(true);
    try {
      const { data: lv, error } = await sb
        .from('leaves')
        .select('*, requester:profiles(full_name, email, position, department)')
        .eq('id', id)
        .single();

      if (error || !lv) throw error || new Error('Leave record not found');

      // Populate basic info
      document.getElementById('mdl-leave-no').textContent = lv.leave_no;
      document.getElementById('mdl-requester-name').textContent = `${lv.requester.full_name} (${lv.requester.email})`;
      document.getElementById('mdl-created-at').textContent = new Date(lv.created_at).toLocaleString('th-TH');
      document.getElementById('mdl-leave-type').textContent = getLeaveTypeLabel(lv.leave_type);
      document.getElementById('mdl-leave-unit').textContent = lv.leave_unit === 'hour' ? 'รายชั่วโมง' : 'เต็มวัน';
      document.getElementById('mdl-leave-days').textContent = `${lv.days} วัน (${lv.hours || 0} ชม.)`;
      document.getElementById('mdl-leave-period').textContent = formatDateRange(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time);
      document.getElementById('mdl-leave-reason').textContent = lv.reason || 'ไม่ได้ระบุเหตุผล';
      
      // Phone & address
      document.getElementById('mdl-contact-phone').textContent = lv.contact_phone || '-';
      document.getElementById('mdl-contact-address').textContent = lv.contact_address || '-';
      
      // Attachment link
      const attachBox = document.getElementById('mdl-attachment-box');
      if (lv.attachment_url) {
        attachBox.classList.remove('d-none');
        document.getElementById('mdl-attachment-link').href = lv.attachment_url;
      } else {
        attachBox.classList.add('d-none');
      }

      // Populate timelines based on active workflow stages configured (1, 2, or 3)
      const timeline = document.getElementById('mdl-timeline');
      timeline.innerHTML = '';
      
      const stagesCount = Number(allSettings.approval_stages || '3');

      // Checker Node (Stage 1)
      if (stagesCount >= 3) {
        const checkerName = await fetchUserName(lv.checker_id);
        const node = createTimelineNode(
          'ขั้นตอนที่ 1: ตรวจสอบเอกสาร (Checker)',
          lv.checker_at,
          checkerName,
          lv.checker_comment,
          lv.status,
          ['checked', 'reviewed', 'approved'].includes(lv.status),
          lv.status === 'rejected' && !lv.supervisor_id
        );
        timeline.appendChild(node);
      }

      // Supervisor Node (Stage 2)
      if (stagesCount >= 2) {
        const supName = await fetchUserName(lv.supervisor_id);
        const isApprovedAtThisStage = ['reviewed', 'approved'].includes(lv.status);
        const isRejectedAtThisStage = lv.status === 'rejected' && (lv.supervisor_id && !lv.approver_id);
        
        const node = createTimelineNode(
          'ขั้นตอนที่ 2: ความเห็นหัวหน้างาน (Supervisor)',
          lv.supervisor_at,
          supName,
          lv.supervisor_comment,
          lv.status,
          isApprovedAtThisStage,
          isRejectedAtThisStage
        );
        timeline.appendChild(node);
      }

      // HR Approver Node (Stage 3)
      const appName = await fetchUserName(lv.approver_id);
      const isApprovedFinal = lv.status === 'approved';
      const isRejectedFinal = lv.status === 'rejected' && lv.approver_id;

      const node = createTimelineNode(
        'ขั้นตอนสุดท้าย: ผู้อนุมัติ/ฝ่ายบุคคล (HR Approver)',
        lv.approver_at,
        appName,
        lv.approver_comment,
        lv.status,
        isApprovedFinal,
        isRejectedFinal
      );
      timeline.appendChild(node);

      // Setup actions block inside modal footer
      const footerActions = document.getElementById('mdl-footer-actions');
      footerActions.innerHTML = '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิดหน้าต่าง</button>';

      // Contextual review options inside detail modal if pending action matches current user role
      const role = currentUser.role;
      const canAct = ['admin', 'approver', 'supervisor', 'checker'].includes(role);
      
      if (canAct) {
        let showActBtn = false;
        if (lv.status === 'pending' && (role === 'checker' || role === 'admin') && stagesCount >= 3) showActBtn = true;
        else if (lv.status === 'checked' && (role === 'supervisor' || role === 'admin') && stagesCount >= 2) showActBtn = true;
        else if (lv.status === 'reviewed' && (role === 'approver' || role === 'admin')) showActBtn = true;
        // Skips logic for fewer stages
        else if (lv.status === 'pending' && stagesCount === 2 && (role === 'supervisor' || role === 'admin')) showActBtn = true;
        else if (lv.status === 'pending' && stagesCount === 1 && (role === 'approver' || role === 'admin')) showActBtn = true;
        else if (lv.status === 'checked' && stagesCount === 2 && (role === 'approver' || role === 'admin')) showActBtn = true;

        if (showActBtn) {
          const actBtn = document.createElement('button');
          actBtn.className = 'btn btn-primary';
          actBtn.innerHTML = '<i class="bi bi-shield-fill-check me-1"></i> จัดการพิจารณาใบลา';
          actBtn.onclick = () => {
            bootstrap.Modal.getInstance(document.getElementById('modal-leave-details')).hide();
            window.LMS.openReviewModal(lv.id, lv.status);
          };
          footerActions.insertBefore(actBtn, footerActions.firstChild);
        }
      }

      showLoading(false);
      const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-leave-details'));
      modal.show();

    } catch (err) {
      showLoading(false);
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายละเอียดใบลาได้: ' + err.message, 'error');
    }
  };

  async function fetchUserName(id) {
    if (!id) return null;
    const { data } = await sb.from('profiles').select('full_name').eq('id', id).single();
    return data ? data.full_name : 'ไม่ระบุ';
  }

  function createTimelineNode(title, timestamp, name, comment, globalStatus, isApproved, isRejected) {
    const div = document.createElement('div');
    div.className = 'timeline-node';
    
    let dotClass = '';
    let statusTxt = 'รอดำเนินการ';
    if (isApproved) {
      dotClass = 'success';
      statusTxt = 'เห็นชอบ / ผ่านการพิจารณา';
    } else if (isRejected) {
      dotClass = 'danger';
      statusTxt = 'ปฏิเสธ / ไม่อนุมัติ';
    } else if (globalStatus === 'cancelled') {
      dotClass = '';
      statusTxt = 'ยกเลิกคำขอ';
    } else if (timestamp) {
      dotClass = 'success'; // Fallback
    }

    const timeStr = timestamp 
      ? new Date(timestamp).toLocaleString('th-TH') 
      : '-';

    div.innerHTML = `
      <div class="timeline-dot ${dotClass}"></div>
      <div class="timeline-content">
        <div class="d-flex justify-content-between">
          <div class="timeline-title">${title}</div>
          <span class="timeline-meta">${timeStr}</span>
        </div>
        <div class="small text-light-muted">
          ผู้ดำเนินการ: ${name || 'ระบบอัตโนมัติ'} | ผลลัพธ์: <span class="fw-bold">${statusTxt}</span>
        </div>
        ${comment ? `<div class="timeline-comment">${comment}</div>` : ''}
      </div>
    `;
    return div;
  }

  // ── FORM EVENT HANDLERS ───────────────────────────────────────────
  function setupFormListeners() {
    
    // Reset Database Config
    const btnResetDb = document.getElementById('btn-reset-db');
    if (btnResetDb) {
      btnResetDb.onclick = (e) => {
        e.preventDefault();
        Swal.fire({
          title: 'ยืนยันการตั้งค่าคีย์ใหม่?',
          text: 'คุณต้องการล้างคีย์การเชื่อมต่อเดิมเพื่อระบุคีย์ใหม่หรือไม่?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'ใช่, ตั้งค่าใหม่',
          cancelButtonText: 'ยกเลิก'
        }).then((result) => {
          if (result.isConfirmed) {
            localStorage.removeItem('LMS_SUPABASE_URL');
            localStorage.removeItem('LMS_SUPABASE_KEY');
            window.location.reload();
          }
        });
      };
    }
    
    // Auth Tab Forms
    document.getElementById('form-login').onsubmit = async (e) => {
      e.preventDefault();
      showLoading(true);
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showLoading(false);
        Swal.fire('เข้าสู่ระบบล้มเหลว', error.message, 'error');
      }
    };

    document.getElementById('form-register').onsubmit = async (e) => {
      e.preventDefault();
      showLoading(true);
      const email = document.getElementById('reg-email').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const fullName = document.getElementById('reg-fullname').value.trim();
      const password = document.getElementById('reg-password').value;

      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullName,
            role: 'employee'
          }
        }
      });

      showLoading(false);
      if (error) {
        Swal.fire('ลงทะเบียนไม่สำเร็จ', error.message, 'error');
      } else {
        Swal.fire({
          icon: 'success',
          title: 'ลงทะเบียนพนักงานสำเร็จ',
          text: 'กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งค่าไว้',
          confirmButtonText: 'เข้าสู่ระบบ'
        }).then(() => {
          bootstrap.Tab.getOrCreateInstance(document.getElementById('pill-login-tab')).show();
        });
      }
    };

    // File attachments handler
    const fileInput = document.getElementById('req-attachment');
    if (fileInput) {
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          Swal.fire('ไฟล์ขนาดใหญ่เกินไป', 'ขนาดไฟล์รูปภาพหรือ PDF ต้องไม่เกิน 5MB', 'warning');
          fileInput.value = '';
          return;
        }

        const progressBar = document.querySelector('#attachment-progress');
        const innerBar = progressBar.querySelector('.progress-bar');
        progressBar.classList.remove('d-none');
        innerBar.style.width = '20%';

        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
          
          // Attempt upload to public storage bucket: leave-attachments
          const { data, error } = await sb.storage
            .from('leave-attachments')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

          if (error) throw error;
          
          innerBar.style.width = '100%';
          setTimeout(() => progressBar.classList.add('d-none'), 800);

          // Resolve public URL
          const { data: publicUrlData } = sb.storage.from('leave-attachments').getPublicUrl(fileName);
          document.getElementById('req-attachment-url').value = publicUrlData.publicUrl;
          
        } catch (err) {
          console.warn('Storage Bucket fail (fallback to local base64):', err.message);
          
          // Fallback: Convert to Base64 dataURL for demo compatibility if buckets aren't configured
          const reader = new FileReader();
          reader.onload = (ev) => {
            document.getElementById('req-attachment-url').value = ev.target.result;
            innerBar.style.width = '100%';
            setTimeout(() => progressBar.classList.add('d-none'), 800);
          };
          reader.readAsDataURL(file);
        }
      };
    }

    // Toggle day/hour inputs in form
    document.getElementById('req-leave-unit').onchange = (e) => {
      const isDay = e.target.value === 'day';
      document.getElementById('row-unit-day').classList.toggle('d-none', !isDay);
      document.getElementById('row-unit-hour').classList.toggle('d-none', isDay);
      calculateDuration();
    };

    // Live calculation listeners
    ['req-start-date', 'req-end-date', 'req-hour-date', 'req-start-time', 'req-end-time', 'req-leave-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onchange = calculateDuration;
    });

    // Form Leave Submission
    document.getElementById('form-leave-request').onsubmit = (e) => {
      e.preventDefault();
      submitLeaveForm('pending');
    };

    document.getElementById('btn-save-draft').onclick = (e) => {
      submitLeaveForm('draft');
    };

    // Review Submit Modal
    document.getElementById('form-review-submit').onsubmit = async (e) => {
      e.preventDefault();
      const leaveId = document.getElementById('review-leave-id').value;
      const currentStatus = document.getElementById('review-action').value;
      const decision = document.querySelector('input[name="review-decision"]:checked').value;
      
      const comment = document.getElementById('review-comment').value.trim();

      if (decision === 'reject' && !comment) {
        Swal.fire('ใส่ความเห็น', 'กรุณาระบุสาเหตุในกรณีที่ปฏิเสธหรือไม่เห็นชอบใบลา', 'warning');
        return;
      }

      showLoading(true);
      bootstrap.Modal.getInstance(document.getElementById('modal-review')).hide();

      try {
        const updatePayload = {};
        const stagesCount = Number(allSettings.approval_stages || '3');
        const nowStr = new Date().toISOString();

        if (decision === 'reject') {
          // Rejection terminates flow immediately
          updatePayload.status = 'rejected';
          updatePayload.approver_decision = 'rejected';
          
          if (currentStatus === 'pending') {
            updatePayload.checker_id = currentUser.id;
            updatePayload.checker_comment = comment;
            updatePayload.checker_at = nowStr;
          } else if (currentStatus === 'checked') {
            updatePayload.supervisor_id = currentUser.id;
            updatePayload.supervisor_comment = comment;
            updatePayload.supervisor_at = nowStr;
          } else {
            updatePayload.approver_id = currentUser.id;
            updatePayload.approver_comment = comment;
            updatePayload.approver_at = nowStr;
          }
        } 
        else {
          // Approval advances to next stage
          if (currentStatus === 'pending') {
            updatePayload.checker_id = currentUser.id;
            updatePayload.checker_comment = comment;
            updatePayload.checker_at = nowStr;
            
            // Advance based on stages configuration
            if (stagesCount === 1) {
              updatePayload.status = 'approved';
              updatePayload.approver_id = currentUser.id;
              updatePayload.approver_decision = 'approved';
              updatePayload.approver_comment = comment;
              updatePayload.approver_at = nowStr;
            } else {
              updatePayload.status = 'checked'; // Moves to supervisor
            }
          } 
          else if (currentStatus === 'checked') {
            updatePayload.supervisor_id = currentUser.id;
            updatePayload.supervisor_comment = comment;
            updatePayload.supervisor_at = nowStr;
            
            if (stagesCount === 2) {
              updatePayload.status = 'approved';
              updatePayload.approver_id = currentUser.id;
              updatePayload.approver_decision = 'approved';
              updatePayload.approver_comment = comment;
              updatePayload.approver_at = nowStr;
            } else {
              updatePayload.status = 'reviewed'; // Moves to HR
            }
          } 
          else if (currentStatus === 'reviewed') {
            updatePayload.approver_id = currentUser.id;
            updatePayload.approver_decision = 'approved';
            updatePayload.approver_comment = comment;
            updatePayload.approver_at = nowStr;
            updatePayload.status = 'approved'; // Final approved
          }
        }

        const { error } = await sb
          .from('leaves')
          .update(updatePayload)
          .eq('id', leaveId);

        if (error) throw error;
        
        // Log Audit Log
        await sb.from('audit_logs').insert({
          user_id: currentUser.id,
          action: decision === 'reject' ? 'reject_leave' : 'approve_leave',
          entity: 'leaves',
          entity_id: leaveId,
          meta: { payload: updatePayload }
        });

        showLoading(false);
        Swal.fire('พิจารณาเสร็จสิ้น', 'ดำเนินการบันทึกความเห็นผลการลาเรียบร้อย', 'success');
        
        // Refresh Table
        await loadApprovalsPage();
        
      } catch (err) {
        showLoading(false);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
      }
    };

    // User Edit Form
    document.getElementById('form-user-edit').onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-user-id').value;
      const fullName = document.getElementById('edit-user-name').value.trim();
      const position = document.getElementById('edit-user-position').value.trim();
      const level = document.getElementById('edit-user-level').value.trim();
      const department = document.getElementById('edit-user-department').value.trim();
      const role = document.getElementById('edit-user-role').value;
      const isActive = document.getElementById('edit-user-active').value === 'true';
      const phone = document.getElementById('edit-user-phone').value.trim();

      showLoading(true);
      bootstrap.Modal.getInstance(document.getElementById('modal-user-edit')).hide();

      try {
        const { error } = await sb
          .from('profiles')
          .update({
            full_name: fullName,
            position,
            level,
            department,
            role,
            is_active: isActive,
            phone
          })
          .eq('id', id);

        if (error) throw error;

        showLoading(false);
        Swal.fire('สำเร็จ', 'บันทึกประวัติพนักงานเรียบร้อย', 'success');
        await loadSettingsPage();

      } catch (err) {
        showLoading(false);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
      }
    };

    // Settings Org Form
    document.getElementById('form-settings-org').onsubmit = async (e) => {
      e.preventDefault();
      const updates = {
        org_name: document.getElementById('set-org-name').value.trim(),
        org_email: document.getElementById('set-org-email').value.trim(),
        limit_sick: document.getElementById('set-limit-sick').value,
        limit_personal: document.getElementById('set-limit-personal').value,
        limit_annual: document.getElementById('set-limit-annual').value,
        limit_maternity: document.getElementById('set-limit-maternity').value,
        leave_workday_hours: document.getElementById('set-work-hours').value,
        approval_stages: document.getElementById('set-stages').value
      };

      showLoading(true);
      try {
        for (const [key, value] of Object.entries(updates)) {
          const { error } = await sb
            .from('settings')
            .upsert({ key, value, updated_at: new Date().toISOString() });
          if (error) throw error;
        }

        await fetchSettings();
        showLoading(false);
        Swal.fire('สำเร็จ', 'บันทึกตั้งค่าองค์กรและโควตาการลาแล้ว', 'success');

      } catch (err) {
        showLoading(false);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
      }
    };

    // Settings LINE Connection keys Form
    document.getElementById('form-settings-line').onsubmit = async (e) => {
      e.preventDefault();
      const token = document.getElementById('set-line-token').value.trim();
      const secret = document.getElementById('set-line-secret').value.trim();

      showLoading(true);
      try {
        await sb.from('settings').upsert({ key: 'line_channel_access_token', value: token, updated_at: new Date().toISOString() });
        await sb.from('settings').upsert({ key: 'line_channel_secret', value: secret, updated_at: new Date().toISOString() });

        await fetchSettings();
        showLoading(false);
        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่า LINE Official Account เรียบร้อย', 'success');
      } catch (err) {
        showLoading(false);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
      }
    };

    // Copy Webhook button
    const copyBtn = document.getElementById('btn-copy-webhook');
    if (copyBtn) {
      copyBtn.onclick = () => {
        const input = document.getElementById('line-webhook-display');
        input.select();
        navigator.clipboard.writeText(input.value);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'คัดลอก Webhook URL แล้ว',
          showConfirmButton: false,
          timer: 1500
        });
      };
    }

    // Add Holiday button
    const addHolidayBtn = document.getElementById('btn-add-holiday');
    if (addHolidayBtn) {
      addHolidayBtn.onclick = () => {
        Swal.fire({
          title: 'เพิ่มวันหยุดนักขัตฤกษ์/บริษัท',
          html: `
            <div class="mb-3 text-start">
              <label class="form-label text-light">วันที่หยุด</label>
              <input type="date" id="new-hol-date" class="form-control">
            </div>
            <div class="mb-3 text-start">
              <label class="form-label text-light">ชื่อวันหยุด</label>
              <input type="text" id="new-hol-name" class="form-control" placeholder="เช่น วันแรงงานแห่งชาติ">
            </div>
          `,
          focusConfirm: false,
          showCancelButton: true,
          confirmButtonText: 'บันทึกวันหยุด',
          cancelButtonText: 'ยกเลิก',
          preConfirm: () => {
            const date = document.getElementById('new-hol-date').value;
            const name = document.getElementById('new-hol-name').value.trim();
            if (!date || !name) {
              Swal.showValidationMessage('กรุณากรอกข้อมูลวันเวลาและชื่อให้ครบถ้วน');
            }
            return { date, name };
          }
        }).then(async (result) => {
          if (result.isConfirmed) {
            showLoading(true);
            const { error } = await sb.from('holidays').insert({
              holiday_date: result.value.date,
              name: result.value.name
            });
            showLoading(false);
            if (error) {
              Swal.fire('ข้อผิดพลาด', 'มีวันที่นี้ในระบบอยู่แล้วหรือเกิดข้อผิดพลาด: ' + error.message, 'error');
            } else {
              Swal.fire('สำเร็จ', 'บันทึกวันหยุดบริษัทเรียบร้อย', 'success');
              await fetchHolidays();
              fetchHolidaysTable();
            }
          }
        });
      };
    }

    // Sidebar Toggler (mobile)
    document.getElementById('sidebar-toggle').onclick = () => {
      document.getElementById('portal-sidebar').classList.add('show');
    };

    // Logout Handler
    document.getElementById('btn-logout').onclick = async () => {
      const { error } = await sb.auth.signOut();
      if (!error) window.location.reload();
    };

    // Filters on History page
    document.getElementById('history-filter-type').onchange = fetchHistoryTable;
    document.getElementById('history-filter-status').onchange = fetchHistoryTable;
  }

  // ── DURATION CALCULATION LOGIC ────────────────────────────────────
  async function calculateDuration() {
    const unit = document.getElementById('req-leave-unit').value;
    const type = document.getElementById('req-leave-type').value;
    const box = document.getElementById('duration-calculation-box');
    const display = document.getElementById('calc-duration-days');
    const warnContainer = document.getElementById('calc-warning-container');
    const lastBox = document.getElementById('last-leave-info-box');

    box.classList.remove('border-danger');
    box.classList.add('bg-dark-opacity');
    warnContainer.classList.add('d-none');

    // Trigger past leave details display if leave type is chosen
    if (type) {
      const { data: lastLv } = await sb
        .from('leaves')
        .select('*')
        .eq('requester_id', currentUser.id)
        .eq('leave_type', type)
        .eq('status', 'approved')
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastLv) {
        lastBox.classList.remove('d-none');
        document.getElementById('last-leave-dates').textContent = `${formatThaiDate(lastLv.start_date)} - ${formatThaiDate(lastLv.end_date)}`;
        document.getElementById('last-leave-days').textContent = lastLv.days;
      } else {
        lastBox.classList.add('d-none');
      }
    }

    if (unit === 'day') {
      const startVal = document.getElementById('req-start-date').value;
      const endVal = document.getElementById('req-end-date').value;
      if (!startVal || !endVal) return;

      const days = countWorkingDays(startVal, endVal);
      display.textContent = `${days} วัน`;

      if (days <= 0) {
        box.classList.remove('bg-dark-opacity');
        box.classList.add('border-danger');
        warnContainer.classList.remove('d-none');
        document.getElementById('calc-warning-text').textContent = 'จำนวนวันต้องมากกว่า 0 (วันที่สิ้นสุดต้องไม่ก่อนหน้าวันที่เริ่มลา และไม่เป็นวันหยุด)';
      }
    } 
    else {
      // Hour calculations
      const dateVal = document.getElementById('req-hour-date').value;
      const startT = document.getElementById('req-start-time').value;
      const endT = document.getElementById('req-end-time').value;

      if (!dateVal || !startT || !endT) return;

      // Exclude weekend/holiday dates entirely
      if (isWeekendOrHoliday(dateVal)) {
        display.textContent = '0 วัน';
        box.classList.remove('bg-dark-opacity');
        box.classList.add('border-danger');
        warnContainer.classList.remove('d-none');
        document.getElementById('calc-warning-text').textContent = 'ไม่สามารถลาในวันหยุดราชการหรือวันเสาร์-อาทิตย์ได้';
        return;
      }

      const sm = parseTime(startT);
      const em = parseTime(endT);
      
      const workStart = 8 * 60 + 30; // 08:30
      const workEnd = 20 * 60;       // 20:00

      if (sm < workStart || em > workEnd || em <= sm) {
        display.textContent = '0 วัน';
        box.classList.remove('bg-dark-opacity');
        box.classList.add('border-danger');
        warnContainer.classList.remove('d-none');
        document.getElementById('calc-warning-text').textContent = 'เวลาเริ่มต้องตั้งแต่ 08:30 ถึง 20:00 น. และเวลาสิ้นสุดต้องมากกว่าเวลาเริ่มลา';
        return;
      }

      const hours = (em - sm) / 60;
      if (hours < 1) {
        display.textContent = '0 วัน';
        box.classList.remove('bg-dark-opacity');
        box.classList.add('border-danger');
        warnContainer.classList.remove('d-none');
        document.getElementById('calc-warning-text').textContent = 'การลาแบบชั่วโมงต้องลาอย่างน้อย 1 ชั่วโมงขึ้นไป';
        return;
      }

      const workHours = Number(allSettings.leave_workday_hours || 8);
      const daysVal = Math.round((hours / workHours) * 100) / 100;
      
      display.textContent = `${daysVal} วัน (${hours} ชั่วโมง)`;
    }
  }

  function countWorkingDays(startStr, endStr) {
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date(endStr + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;

    let count = 0;
    const d = new Date(s.getTime());
    while (d <= e) {
      const dow = d.getDay();
      const isWeekend = (dow === 0 || dow === 6);
      const dateKey = d.toISOString().substring(0, 10);
      const isHoliday = holidaysMap[dateKey] !== undefined;

      if (!isWeekend && !isHoliday) {
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function isWeekendOrHoliday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return true;
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return true;
    return holidaysMap[dateStr] !== undefined;
  }

  function parseTime(timeText) {
    const parts = timeText.split(':');
    if (parts.length !== 2) return 0;
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  // ── SUBMIT LEAVE ACTION ──────────────────────────────────────────
  async function submitLeaveForm(targetStatus) {
    const leaveType = document.getElementById('req-leave-type').value;
    const leaveUnit = document.getElementById('req-leave-unit').value;
    const reason = document.getElementById('req-reason').value.trim();
    const phone = document.getElementById('req-contact-phone').value.trim();
    const address = document.getElementById('req-contact-address').value.trim();
    const attachUrl = document.getElementById('req-attachment-url').value;

    let startDate, endDate, startTime = '', endTime = '', hours = 0, days = 0;
    
    if (leaveUnit === 'day') {
      startDate = document.getElementById('req-start-date').value;
      endDate = document.getElementById('req-end-date').value;
      if (!startDate || !endDate) return;
      
      days = countWorkingDays(startDate, endDate);
      hours = days * Number(allSettings.leave_workday_hours || 8);
    } else {
      startDate = document.getElementById('req-hour-date').value;
      endDate = startDate;
      startTime = document.getElementById('req-start-time').value;
      endTime = document.getElementById('req-end-time').value;
      if (!startDate || !startTime || !endTime) return;

      const sm = parseTime(startTime);
      const em = parseTime(endTime);
      hours = (em - sm) / 60;
      days = Math.round((hours / Number(allSettings.leave_workday_hours || 8)) * 100) / 100;
    }

    if (days <= 0) {
      Swal.fire('ข้อผิดพลาด', 'จำนวนวันลาต้องมากกว่า 0 วัน กรุณาตรวจสอบวันเวลาและวันหยุดประจำปี', 'warning');
      return;
    }

    showLoading(true);

    try {
      // 1. Overlapping leaves check
      const { data: overlaps } = await sb
        .from('leaves')
        .select('id, leave_no, start_date, end_date')
        .eq('requester_id', currentUser.id)
        .in('status', ['pending', 'checked', 'reviewed', 'approved'])
        .lte('start_date', endDate)
        .gte('end_date', startDate);

      if (overlaps && overlaps.length > 0) {
        throw new Error(`คุณมีใบลาทับซ้อนกับใบลาเลขที่ ${overlaps[0].leave_no} ในช่วงเวลาดังกล่าวแล้ว`);
      }

      // 2. Submit Leave to Database
      const currentYear = new Date(startDate).getFullYear();
      
      const payload = {
        requester_id: currentUser.id,
        leave_type: leaveType,
        reason,
        start_date: startDate,
        end_date: endDate,
        days,
        contact_phone: phone,
        contact_address: address,
        status: targetStatus,
        fiscal_year: currentYear,
        attachment_url: attachUrl,
        leave_unit: leaveUnit,
        start_time: startTime,
        end_time: endTime,
        hours
      };

      const { error } = await sb.from('leaves').insert(payload);
      if (error) throw error;

      showLoading(false);
      Swal.fire({
        icon: 'success',
        title: targetStatus === 'draft' ? 'บันทึกฉบับร่างแล้ว' : 'ส่งใบลาเสร็จสมบูรณ์',
        text: targetStatus === 'draft' ? 'คุณสามารถแก้ไขและส่งอนุมัติได้ในภายหลัง' : 'คำขอลาเข้าสู่ระบบเรียบร้อย รอการพิจารณาตามลำดับขั้นตอน',
        confirmButtonText: 'ตกลง'
      }).then(() => {
        window.location.hash = '#dashboard';
      });

    } catch (err) {
      showLoading(false);
      Swal.fire('ยื่นใบลาไม่สำเร็จ', err.message, 'error');
    }
  }

  // ── HELPER UTILITY FUNCTIONS ──────────────────────────────────────
  function showLoading(active) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      if (active) overlay.classList.add('active');
      else overlay.classList.remove('active');
    }
  }

  function setupUIPermissions() {
    const role = currentUser.role;
    
    // Toggle approval menu link in sidebar
    const approvalsLink = document.getElementById('nav-approvals');
    if (['admin', 'approver', 'supervisor', 'checker'].includes(role)) {
      approvalsLink.classList.remove('d-none');
    } else {
      approvalsLink.classList.add('d-none');
    }

    // Toggle settings link
    const settingsLink = document.getElementById('nav-settings');
    if (role === 'admin') {
      settingsLink.classList.remove('d-none');
    } else {
      settingsLink.classList.add('d-none');
    }
  }

  async function updateApprovalBadgeCount() {
    const role = currentUser.role;
    const badge = document.getElementById('badge-pending-approvals');
    if (!badge || !['admin', 'approver', 'supervisor', 'checker'].includes(role)) return;

    let query = sb.from('leaves').select('id', { count: 'exact', head: true });
    
    if (role === 'admin') {
      query = query.in('status', ['pending', 'checked', 'reviewed']);
    } else if (role === 'checker') {
      query = query.eq('status', 'pending');
    } else if (role === 'supervisor') {
      query = query.eq('status', 'checked');
    } else if (role === 'approver') {
      query = query.eq('status', 'reviewed');
    }

    const { count, error } = await query;
    if (!error && count > 0) {
      badge.textContent = count;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  function updateProfileUI() {
    document.getElementById('sidebar-user-name').textContent = currentUser.full_name || 'พนักงาน';
    document.getElementById('sidebar-user-role').textContent = getRoleLabel(currentUser.role);
    document.getElementById('header-user-dept').textContent = `ฝ่าย: ${currentUser.department || 'ทั่วไป'}`;
  }

  function updateHeaderTime() {
    const now = new Date();
    const timeEl = document.getElementById('header-time');
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
    }
  }

  // Label lookups
  function getLeaveTypeLabel(type) {
    const map = { sick: 'ลาป่วย', personal: 'ลากิจส่วนตัว', annual: 'ลาพักร้อน', maternity: 'ลาคลอดบุตร' };
    return map[type] || type;
  }

  function getStatusLabel(status) {
    const map = {
      draft: 'ฉบับร่าง',
      pending: 'รอตรวจสอบ',
      checked: 'รอหัวหน้างาน',
      reviewed: 'รอฝ่ายบุคคล',
      approved: 'อนุมัติแล้ว',
      rejected: 'ไม่อนุมัติ',
      cancelled: 'ยกเลิก'
    };
    return map[status] || status;
  }

  function getRoleLabel(role) {
    const map = {
      admin: 'ผู้ดูแลระบบ (Admin)',
      approver: 'ผู้อนุมัติ/ฝ่ายบุคคล (HR)',
      supervisor: 'หัวหน้างาน (Supervisor)',
      checker: 'เจ้าหน้าที่ธุรการ (Checker)',
      employee: 'พนักงาน (Employee)'
    };
    return map[role] || role;
  }

  function formatDateRange(startStr, endStr, unit, startT, endT) {
    const start = new Date(startStr + 'T00:00:00');
    const sStr = start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    
    if (unit === 'hour') {
      return `${sStr} (${startT} - ${endT} น.)`;
    }

    if (startStr === endStr) {
      return sStr;
    }
    
    const end = new Date(endStr + 'T00:00:00');
    const eStr = end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    return `${sStr} - ${eStr}`;
  }

  function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

})();
