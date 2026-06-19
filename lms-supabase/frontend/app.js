
// ── SUPABASE CREDENTIALS CONFIGURATOR & CLIENT INITIALIZATION ─────────────
var sb = null;

(function() {
  const savedUrl = localStorage.getItem('LMS_SUPABASE_URL');
  const savedKey = localStorage.getItem('LMS_SUPABASE_KEY');

  if (!savedUrl || !savedKey) {
    promptSupabaseConfig();
  } else {
    try {
      sb = window.supabase.createClient(savedUrl, savedKey);
    } catch (e) {
      console.error("Supabase Init Error:", e);
      localStorage.removeItem('LMS_SUPABASE_URL');
      localStorage.removeItem('LMS_SUPABASE_KEY');
      promptSupabaseConfig();
    }
  }

  function promptSupabaseConfig() {
    document.addEventListener('DOMContentLoaded', () => {
      // Hide boot-loader text, show setup
      const blText = document.getElementById('bl-text');
      if (blText) blText.textContent = "กรุณาตั้งค่าฐานข้อมูล Supabase...";
      
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
          let url = document.getElementById('sb-url').value.trim();
          const key = document.getElementById('sb-key').value.trim();
          if (!url || !key) {
            Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
            return false;
          }
          // Auto-fix URL formatting
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          if (url.endsWith('/')) {
            url = url.slice(0, -1);
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
    });
  }
})();

// Add a button to reset DB config on the login page dynamically
document.addEventListener('DOMContentLoaded', () => {
  // We check periodically if #app-root contains the login form, then inject the reset link
  const checker = setInterval(() => {
    const loginForm = document.getElementById('login-form');
    if (loginForm && !document.getElementById('btn-reset-db')) {
      const resetDiv = document.createElement('div');
      resetDiv.className = 'text-center mt-3';
      resetDiv.style.marginTop = '15px';
      resetDiv.style.textAlign = 'center';
      resetDiv.innerHTML = '<a href="#" id="btn-reset-db" style="color: #64748b; font-size: 12px; text-decoration: none;"><i class="bi bi-gear-fill"></i> ตั้งค่าฐานข้อมูลใหม่ (Reset Database Config)</a>';
      loginForm.appendChild(resetDiv);
      
      document.getElementById('btn-reset-db').onclick = (e) => {
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
            localStorage.removeItem('lms.token');
            window.location.reload();
          }
        });
      };
      clearInterval(checker);
    }
  }, 500);
});

// ── SUPABASE CLIENT-SIDE API BRIDGE ───────────────────────────────────────
window.SupabaseBridge = {
  call: async function(action, payload) {
    try {
      if (!sb) throw new Error("Supabase client is not initialized.");
      
      const CAPS = {
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
      };
      
      const LEAVE_TYPE_LABEL = { sick: 'ลาป่วย', personal: 'ลากิจส่วนตัว', maternity: 'ลาคลอด', annual: 'ลาพักร้อน' };
      const STATUS = { DRAFT: 'draft', PENDING: 'pending', CHECKED: 'checked', REVIEWED: 'reviewed', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' };
      const STATUS_LABEL = { draft: 'ฉบับร่าง', pending: 'รอตรวจสอบ', checked: 'รอความเห็นหัวหน้างาน', reviewed: 'รอฝ่ายบุคคลอนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' };
      const STATUS_TONE = { draft: 'slate', pending: 'amber', checked: 'sky', reviewed: 'indigo', approved: 'emerald', rejected: 'rose', cancelled: 'slate' };
      const DEFAULT_LIMITS = { sick: 30, personal: 6, maternity: 10, annual: 10 };
      const ACTIVE_LEAVE_TYPES = ['sick', 'personal', 'annual'];

      // Helpers
      const logAudit = async (userId, act, ent, entId, meta) => {
        try {
          await sb.from('audit_logs').insert({ user_id: userId, action: act, entity: ent, entity_id: entId, meta: meta });
        } catch (e) { console.error("Audit log error:", e); }
      };

      const getLeaveLimit = (settings, type) => {
        const key = 'limit_' + type;
        const v = Number(settings[key] || DEFAULT_LIMITS[type] || 0);
        return v > 0 ? v : (DEFAULT_LIMITS[type] || 0);
      };

      const getLeaveUsedDays = async (userId, type, fiscalYear) => {
        const { data: leaves } = await sb.from('leaves')
          .select('days')
          .eq('requester_id', userId)
          .eq('leave_type', type)
          .eq('status', 'approved')
          .eq('fiscal_year', fiscalYear);
        return (leaves || []).reduce((sum, r) => sum + Number(r.days || 0), 0);
      };

      const getLeaveStats = async (userId, fiscalYear, settings) => {
        const stats = {};
        for (const t of ACTIVE_LEAVE_TYPES) {
          const used = await getLeaveUsedDays(userId, t, fiscalYear);
          const limit = getLeaveLimit(settings, t);
          stats[t] = {
            used: used,
            limit: limit,
            remaining: Math.max(0, limit - used),
            percent: limit > 0 ? Math.round(used * 100 / limit) : 0
          };
        }
        return { fiscal_year: fiscalYear, fiscal_year_be: fiscalYear + 543, items: stats };
      };

      const enrichLeave = (r, usersIndex) => {
        const u = usersIndex[r.requester_id] || {};
        return {
          ...r,
          requester_name: u.full_name || '-',
          department: u.department || '-',
          leave_type_label: LEAVE_TYPE_LABEL[r.leave_type] || r.leave_type,
          status_label: STATUS_LABEL[r.status] || r.status,
          tone: STATUS_TONE[r.status] || 'slate',
          duration_label: r.leave_unit === 'hour' ? (Number(r.hours || 0) + ' ชั่วโมง') : (Number(r.days || 0) + ' วัน')
        };
      };

      // ── API ROUTES ──
      if (action === 'app.bootstrap') {
        const { data: { session } } = await sb.auth.getSession();
        let me = null;
        let caps = [];
        if (session && session.user) {
          const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
          if (data && data.is_active) {
            me = data;
            caps = CAPS[me.role] || [];
          }
        }
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);

        return {
          me: me,
          caps: caps,
          leave_types: LEAVE_TYPE_LABEL,
          settings: settings,
          app: { name: 'ระบบบันทึกการลาออนไลน์', short: 'LMS', title: 'LMS · ระบบบันทึกการลาออนไลน์' },
          dev: { NAME: 'ตาใหม่ งุงิ', URL: '', LOGO: 'https://stickershop.line-scdn.net/stickershop/v1/product/18011/LINEStorePC/main.png?v=1' }
        };
      }

      if (action === 'auth.login') {
        const { username, password } = payload;
        const { data: email, error: rpcError } = await sb.rpc('get_email_by_username', { username_input: username });
        if (rpcError) throw new Error('การเชื่อมต่อกับระบบขัดข้อง: ' + rpcError.message);
        if (!email) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

        const { data: authData, error: loginError } = await sb.auth.signInWithPassword({ email, password });
        if (loginError) {
          if (loginError.message.includes('Email not confirmed')) {
            throw new Error('บัญชีของคุณรอการยืนยันอีเมล หรือติดต่อแอดมินให้กดยืนยันผ่านแดชบอร์ด');
          }
          throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', authData.user.id).single();
        if (profileError) throw new Error('ไม่พบข้อมูลผู้ใช้ในระบบ');
        if (!profile.is_active) {
          await sb.auth.signOut();
          throw new Error('บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคล — กรุณารอการแจ้งเตือน');
        }

        await logAudit(profile.id, 'auth.login', 'session', authData.user.id, {});
        return {
          token: 'active',
          user: profile,
          caps: CAPS[profile.role] || []
        };
      }

      if (action === 'auth.logout') {
        await sb.auth.signOut();
        return { ok: true };
      }

      if (action === 'auth.change_password') {
        const { error } = await sb.auth.updateUser({ password: payload.new_password });
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'auth.change_password', 'user', window.LMS.Store.user.id, {});
        return { ok: true };
      }

      if (action === 'auth.me') {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', window.LMS.Store.user.id).single();
        return { user: profile, caps: CAPS[profile.role] || [] };
      }

      if (action === 'user.register') {
        const { username, full_name, position, department, email, phone, password } = payload;
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { username, full_name, position, department, phone, role: 'employee' }
          }
        });
        if (error) throw error;
        return { ok: true, id: data.user.id, username };
      }

      if (action === 'user.list') {
        const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      }

      if (action === 'user.get') {
        const { data, error } = await sb.from('profiles').select('*').eq('id', payload.id).single();
        if (error) throw error;
        return data;
      }

      if (action === 'user.upsert') {
        const { id, full_name, position, level, department, role, phone, email, is_active } = payload;
        const updateData = {
          full_name, position, level, department, role, phone, email,
          is_active: is_active === 'yes' || is_active === true
        };
        const { data, error } = await sb.from('profiles').update(updateData).eq('id', id).select().single();
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'user.update', 'profile', id, {});
        return data;
      }

      if (action === 'user.delete') {
        const { error } = await sb.from('profiles').delete().eq('id', payload.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'user.list_pending') {
        const { data, error } = await sb.from('profiles').select('*').eq('is_active', false);
        if (error) throw error;
        return data;
      }

      if (action === 'user.approve_registration') {
        const { data, error } = await sb.from('profiles').update({ is_active: true }).eq('id', payload.id).select().single();
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'user.approve_registration', 'profile', payload.id, {});
        return data;
      }

      if (action === 'user.update_profile') {
        const { phone, email, avatar } = payload;
        const { data, error } = await sb.from('profiles').update({ phone, email, avatar }).eq('id', window.LMS.Store.user.id).select().single();
        if (error) throw error;
        return data;
      }

      // ── LEAVES API ──
      if (action === 'leave.list') {
        let query = sb.from('leaves').select('*, requester:profiles!leaves_requester_id_fkey(*)');
        if (payload.status) query = query.eq('status', payload.status);
        if (payload.fiscal_year) query = query.eq('fiscal_year', payload.fiscal_year);
        
        if (!window.LMS.Store.caps.includes('leave.view_all')) {
          query = query.eq('requester_id', window.LMS.Store.user.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return data.map(r => ({
          ...r,
          requester_name: r.requester ? r.requester.full_name : ''
        }));
      }

      if (action === 'leave.get') {
        const { data, error } = await sb.from('leaves').select('*, requester:profiles!leaves_requester_id_fkey(*)').eq('id', payload.id).single();
        if (error) throw error;
        return {
          ...data,
          requester_name: data.requester ? data.requester.full_name : ''
        };
      }

      if (action === 'leave.create') {
        const fiscal_year = new Date(payload.start_date).getFullYear() + 543;
        const insertData = {
          requester_id: window.LMS.Store.user.id,
          leave_type: payload.leave_type,
          reason: payload.reason,
          start_date: payload.start_date,
          end_date: payload.end_date,
          days: payload.days,
          contact_address: payload.contact_address,
          contact_phone: payload.contact_phone,
          last_leave_type: payload.last_leave_type,
          last_leave_start: payload.last_leave_start || null,
          last_leave_end: payload.last_leave_end || null,
          last_leave_days: payload.last_leave_days || null,
          status: payload.status || 'draft',
          fiscal_year: fiscal_year,
          attachment_url: payload.attachment_url || '',
          leave_unit: payload.leave_unit || 'day',
          start_time: payload.start_time || null,
          end_time: payload.end_time || null,
          hours: payload.hours || null
        };
        const { data, error } = await sb.from('leaves').insert(insertData).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'leave.update') {
        const { id, ...updatePayload } = payload;
        const { data, error } = await sb.from('leaves').update({
          leave_type: updatePayload.leave_type,
          reason: updatePayload.reason,
          start_date: updatePayload.start_date,
          end_date: updatePayload.end_date,
          days: updatePayload.days,
          contact_address: updatePayload.contact_address,
          contact_phone: updatePayload.contact_phone,
          last_leave_type: updatePayload.last_leave_type,
          last_leave_start: updatePayload.last_leave_start || null,
          last_leave_end: updatePayload.last_leave_end || null,
          last_leave_days: updatePayload.last_leave_days || null,
          status: updatePayload.status || 'draft',
          attachment_url: updatePayload.attachment_url || '',
          leave_unit: updatePayload.leave_unit || 'day',
          start_time: updatePayload.start_time || null,
          end_time: updatePayload.end_time || null,
          hours: updatePayload.hours || null
        }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'leave.submit') {
        const { data, error } = await sb.from('leaves').update({ status: 'pending' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'leave.cancel') {
        const { data, error } = await sb.from('leaves').update({ status: 'cancelled' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'leave.check') {
        const { data, error } = await sb.from('leaves').update({
          status: 'checked',
          checker_id: window.LMS.Store.user.id,
          checker_comment: String(payload.comment || '').trim(),
          checker_at: new Date().toISOString()
        }).eq('id', payload.id).select().single();
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'leave.check', 'leave', payload.id, {});
        return data;
      }

      if (action === 'leave.comment') {
        const { data, error } = await sb.from('leaves').update({
          status: 'reviewed',
          supervisor_id: window.LMS.Store.user.id,
          supervisor_comment: String(payload.comment || '').trim(),
          supervisor_at: new Date().toISOString()
        }).eq('id', payload.id).select().single();
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'leave.comment', 'leave', payload.id, {});
        return data;
      }

      if (action === 'leave.approve') {
        const decision = payload.decision || 'approved';
        const newStatus = decision === 'rejected' ? 'rejected' : 'approved';
        const { data, error } = await sb.from('leaves').update({
          status: newStatus,
          approver_id: window.LMS.Store.user.id,
          approver_decision: decision,
          approver_comment: String(payload.comment || '').trim(),
          approver_at: new Date().toISOString()
        }).eq('id', payload.id).select().single();
        if (error) throw error;
        await logAudit(window.LMS.Store.user.id, 'leave.' + decision, 'leave', payload.id, {});
        return data;
      }

      if (action === 'leave.delete') {
        const { error } = await sb.from('leaves').delete().eq('id', payload.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'leave.my_stats') {
        const fy = payload.fiscal_year ? Number(payload.fiscal_year) : (new Date().getFullYear() + 543 - 543);
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);
        return await getLeaveStats(window.LMS.Store.user.id, fy, settings);
      }

      if (action === 'leave.user_stats') {
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);
        const uid = payload.user_id || window.LMS.Store.user.id;
        const fy = payload.fiscal_year || (new Date().getFullYear());
        return await getLeaveStats(uid, fy, settings);
      }

      // ── MISSIONS API ──
      if (action === 'mission.list') {
        let query = sb.from('missions').select('*, requester:profiles!missions_requester_id_fkey(*)');
        if (!window.LMS.Store.caps.includes('mission.view_all')) {
          query = query.eq('requester_id', window.LMS.Store.user.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return {
          items: data.map(m => ({
            ...m,
            requester_name: m.requester ? m.requester.full_name : ''
          })),
          total: data.length
        };
      }

      if (action === 'mission.get') {
        const { data: mission, error } = await sb.from('missions').select('*, requester:profiles!missions_requester_id_fkey(*)').eq('id', payload.id).single();
        if (error) throw error;
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);
        return {
          mission: {
            ...mission,
            requester_name: mission.requester ? mission.requester.full_name : ''
          },
          requester: mission.requester,
          org: settings
        };
      }

      if (action === 'mission.create') {
        const { data, error } = await sb.from('missions').insert({
          requester_id: window.LMS.Store.user.id,
          title: payload.title,
          purpose: payload.purpose,
          destination: payload.destination,
          start_date: payload.start_date,
          end_date: payload.end_date,
          transport_type: payload.transport_type,
          requested_amount: Number(payload.requested_amount || 0),
          status: 'pending'
        }).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'mission.update') {
        const { id, ...updatePayload } = payload;
        const { data, error } = await sb.from('missions').update(updatePayload).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'mission.submit') {
        const { data, error } = await sb.from('missions').update({ status: 'pending' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'mission.cancel') {
        const { data, error } = await sb.from('missions').update({ status: 'cancelled' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'mission.delete') {
        const { error } = await sb.from('missions').delete().eq('id', payload.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'mission.approve') {
        const { id, decision, comment, approved_amount } = payload;
        const status = decision === 'rejected' ? 'rejected' : 'approved';
        const { data, error } = await sb.from('missions').update({
          status: status,
          approver_id: window.LMS.Store.user.id,
          approver_comment: comment,
          approver_at: new Date().toISOString(),
          approved_amount: Number(approved_amount || 0)
        }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }

      // ── EXPENSES API ──
      if (action === 'expense.list') {
        let query = sb.from('expenses').select('*, requester:profiles!expenses_created_by_fkey(*)');
        if (!window.LMS.Store.caps.includes('expense.manage')) {
          query = query.eq('created_by', window.LMS.Store.user.id);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return {
          items: data.map(e => ({
            ...e,
            requester_name: e.requester ? e.requester.full_name : ''
          })),
          total: data.length
        };
      }

      if (action === 'expense.get') {
        const { data, error } = await sb.from('expenses').select('*, requester:profiles!expenses_created_by_fkey(*)').eq('id', payload.id).single();
        if (error) throw error;
        return data;
      }

      if (action === 'expense.create') {
        const { data, error } = await sb.from('expenses').insert({
          created_by: window.LMS.Store.user.id,
          mission_id: payload.mission_id || null,
          expense_date: payload.expense_date,
          expense_type: payload.expense_type,
          description: payload.description,
          amount: Number(payload.amount || 0),
          receipt_url: payload.receipt_url || '',
          status: 'pending'
        }).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'expense.update') {
        const { id, ...updatePayload } = payload;
        const { data, error } = await sb.from('expenses').update(updatePayload).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'expense.submit') {
        const { data, error } = await sb.from('expenses').update({ status: 'pending' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'expense.cancel') {
        const { data, error } = await sb.from('expenses').update({ status: 'cancelled' }).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'expense.delete') {
        const { error } = await sb.from('expenses').delete().eq('id', payload.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'expense.approve') {
        const { id, decision, comment, approved_amount } = payload;
        const status = decision === 'rejected' ? 'rejected' : 'approved';
        const { data, error } = await sb.from('expenses').update({
          status: status,
          approver_id: window.LMS.Store.user.id,
          approver_comment: comment,
          approver_at: new Date().toISOString(),
          approved_amount: Number(approved_amount || 0)
        }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }

      // ── SETTINGS & GENERAL API ──
      if (action === 'setting.get') {
        const { data, error } = await sb.from('settings').select('*');
        if (error) throw error;
        const settings = {};
        data.forEach(s => settings[s.key] = s.value);
        return settings;
      }

      if (action === 'setting.update') {
        const updates = Object.keys(payload).map(k => ({ key: k, value: String(payload[k]), updated_at: new Date().toISOString() }));
        const { error } = await sb.from('settings').upsert(updates);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'line.get_connect_code') {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', window.LMS.Store.user.id).single();
        if (!profile.line_connect_code && !profile.line_user_id) {
          const code = String(100000 + Math.floor(Math.random() * 900000));
          await sb.from('profiles').update({ line_connect_code: code }).eq('id', window.LMS.Store.user.id);
          return code;
        }
        return profile.line_connect_code || '';
      }

      if (action === 'line.disconnect') {
        await sb.from('profiles').update({ line_user_id: null, line_connect_code: null }).eq('id', window.LMS.Store.user.id);
        return { ok: true };
      }

      if (action === 'line.webhook_url') {
        const url = localStorage.getItem('LMS_SUPABASE_URL').replace('.supabase.co', '.supabase.co/functions/v1/line-webhook');
        return url;
      }

      if (action === 'holiday.list') {
        const { data, error } = await sb.from('holidays').select('*').order('holiday_date', { ascending: true });
        if (error) throw error;
        return data;
      }

      if (action === 'holiday.upsert') {
        const { data, error } = await sb.from('holidays').upsert({
          holiday_date: payload.holiday_date,
          name: payload.name
        }).select().single();
        if (error) throw error;
        return data;
      }

      if (action === 'holiday.delete') {
        const { error } = await sb.from('holidays').delete().eq('id', payload.id);
        if (error) throw error;
        return { ok: true };
      }

      if (action === 'audit.list') {
        const { data, error } = await sb.from('audit_logs').select('*, user:profiles!audit_logs_user_id_fkey(*)').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return data.map(r => ({
          ...r,
          username: r.user ? r.user.username : '',
          full_name: r.user ? r.user.full_name : ''
        }));
      }

      // ── CALENDAR API ──
      if (action === 'calendar.month') {
        const year = parseInt(payload.month.split('-')[0]);
        const month = parseInt(payload.month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);

        const startISO = startDate.toISOString().substring(0, 10);
        const endISO = endDate.toISOString().substring(0, 10);

        // Fetch leaves
        const { data: leaves } = await sb.from('leaves')
          .select('*, requester:profiles!leaves_requester_id_fkey(*)')
          .in('status', ['pending', 'checked', 'reviewed', 'approved']);
          
        const { data: users } = await sb.from('profiles').select('*');
        const usersIndex = {};
        if (users) users.forEach(u => usersIndex[u.id] = u);

        const visibleLeaves = (leaves || []).filter(r => {
          const s = r.start_date;
          const e = r.end_date;
          return s <= endISO && e >= startISO;
        });

        // Generate days list
        const days = [];
        const dateIter = new Date(startDate);
        while (dateIter <= endDate) {
          const dStr = dateIter.toISOString().substring(0, 10);
          const dailyItems = [];
          visibleLeaves.forEach(r => {
            if (r.start_date <= dStr && r.end_date >= dStr) {
              const u = usersIndex[r.requester_id] || {};
              dailyItems.push({
                id: r.id,
                leave_no: r.leave_no,
                requester_name: u.full_name || '-',
                department: u.department || '-',
                leave_type: r.leave_type,
                leave_type_label: LEAVE_TYPE_LABEL[r.leave_type] || r.leave_type,
                status: r.status,
                status_label: STATUS_LABEL[r.status] || r.status,
                tone: STATUS_TONE[r.status] || 'slate'
              });
            }
          });
          days.push({
            date: dStr,
            day: dateIter.getDate(),
            is_weekend: dateIter.getDay() === 0 || dateIter.getDay() === 6,
            items: dailyItems,
            count: dailyItems.length
          });
          dateIter.setDate(dateIter.getDate() + 1);
        }

        const byType = {};
        visibleLeaves.forEach(r => {
          byType[r.leave_type] = (byType[r.leave_type] || 0) + Number(r.days || 0);
        });

        return {
          month_key: payload.month,
          scope: 'all',
          total: visibleLeaves.length,
          by_type: byType,
          days: days
        };
      }

      // ── REPORTS API ──
      if (action === 'report.overview') {
        const fy = Number(payload.fiscal_year || new Date().getFullYear());
        const { data: leaves } = await sb.from('leaves')
          .select('*, requester:profiles!leaves_requester_id_fkey(*)')
          .eq('fiscal_year', fy);
          
        const { data: users } = await sb.from('profiles').select('*');
        const usersIndex = {};
        if (users) users.forEach(u => usersIndex[u.id] = u);

        const by_status = {};
        Object.keys(STATUS_LABEL).forEach(s => by_status[s] = 0);
        const by_type = {};
        ACTIVE_LEAVE_TYPES.forEach(t => by_type[t] = { count: 0, days: 0 });
        const by_dept = {};
        const by_month = {};
        const byUser = {};

        (leaves || []).forEach(r => {
          const type = r.leave_type === 'maternity' ? 'annual' : r.leave_type;
          by_status[r.status] = (by_status[r.status] || 0) + 1;
          if (by_type[type]) {
            by_type[type].count++;
            if (r.status === 'approved') by_type[type].days += Number(r.days || 0);
          }
          const u = usersIndex[r.requester_id] || {};
          const dept = u.department || '(ไม่ระบุสังกัด)';
          if (!by_dept[dept]) by_dept[dept] = { count: 0, days: 0 };
          by_dept[dept].count++;
          if (r.status === 'approved') by_dept[dept].days += Number(r.days || 0);

          const ym = String(r.start_date || '').substring(0, 7);
          if (ym) by_month[ym] = (by_month[ym] || 0) + (r.status === 'approved' ? Number(r.days || 0) : 0);

          const uid = String(r.requester_id);
          if (!byUser[uid]) byUser[uid] = { id: uid, sick: 0, personal: 0, annual: 0, total_days: 0, total_count: 0, last: '' };
          byUser[uid].total_count++;
          if (r.status === 'approved') {
            byUser[uid][type] = (byUser[uid][type] || 0) + Number(r.days || 0);
            byUser[uid].total_days += Number(r.days || 0);
          }
          if (r.created_at && (!byUser[uid].last || r.created_at > byUser[uid].last)) byUser[uid].last = r.created_at;
        });

        const topUsers = Object.keys(byUser).map(uid => {
          const u = usersIndex[uid] || {};
          return {
            ...byUser[uid],
            full_name: u.full_name,
            position: u.position,
            department: u.department,
            role: u.role
          };
        }).sort((a, b) => b.total_days - a.total_days).slice(0, 20);

        const monthsList = [];
        const now = new Date();
        for (let m = 11; m >= 0; m--) {
          const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
          const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          monthsList.push({ ym: ym, days: by_month[ym] || 0 });
        }

        return {
          fiscal_year: fy,
          fiscal_year_be: fy + 543,
          total: (leaves || []).length,
          by_status: by_status,
          by_type: by_type,
          by_dept: by_dept,
          by_month: monthsList,
          top_users: topUsers
        };
      }

      if (action === 'report.user') {
        const uid = payload.user_id || window.LMS.Store.user.id;
        const fy = Number(payload.fiscal_year || new Date().getFullYear());
        const { data: profile } = await sb.from('profiles').select('*').eq('id', uid).single();
        const { data: leaves } = await sb.from('leaves')
          .select('*')
          .eq('requester_id', uid)
          .eq('fiscal_year', fy);
          
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);

        const by_status = {};
        Object.keys(STATUS_LABEL).forEach(s => by_status[s] = 0);
        (leaves || []).forEach(r => by_status[r.status] = (by_status[r.status] || 0) + 1);

        const stats = await getLeaveStats(uid, fy, settings);
        
        const recent = (leaves || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30).map(r => {
          return {
            id: r.id,
            leave_no: r.leave_no,
            leave_type: r.leave_type,
            leave_type_label: LEAVE_TYPE_LABEL[r.leave_type] || r.leave_type,
            reason: r.reason,
            start_date: r.start_date,
            end_date: r.end_date,
            days: r.days,
            leave_unit: r.leave_unit,
            start_time: r.start_time,
            end_time: r.end_time,
            hours: r.hours,
            duration_label: r.leave_unit === 'hour' ? (Number(r.hours || 0) + ' ชั่วโมง') : (Number(r.days || 0) + ' วัน'),
            status: r.status,
            status_label: STATUS_LABEL[r.status] || r.status,
            created_at: r.created_at
          };
        });

        return {
          user: profile,
          fiscal_year: fy,
          fiscal_year_be: fy + 543,
          stats: stats,
          by_status: by_status,
          total_count: (leaves || []).length,
          recent: recent
        };
      }

      if (action === 'report.users_list') {
        const { data, error } = await sb.from('profiles').select('*').eq('is_active', true);
        if (error) throw error;
        return {
          items: data.map(u => ({ id: u.id, full_name: u.full_name, position: u.position, department: u.department, role: u.role }))
        };
      }

      // ── DASHBOARD API ──
      if (action === 'dashboard.data') {
        const fy = new Date().getFullYear();
        const { data: settingsData } = await sb.from('settings').select('*');
        const settings = {};
        if (settingsData) settingsData.forEach(s => settings[s.key] = s.value);

        const myStats = await getLeaveStats(window.LMS.Store.user.id, fy, settings);
        
        const { data: leaves } = await sb.from('leaves').select('*');
        
        const { data: users } = await sb.from('profiles').select('*');
        const usersIndex = {};
        if (users) users.forEach(u => usersIndex[u.id] = u);

        const data = {
          fiscal_year: fy,
          fiscal_year_be: fy + 543,
          me: { stats: myStats, recent: [] },
          pending_for_me: 0,
          by_status: {},
          recent_all: [],
          warn_threshold: Number(settings.warn_threshold || 80)
        };

        const mine = (leaves || []).filter(r => String(r.requester_id) === String(window.LMS.Store.user.id));
        mine.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        data.me.recent = mine.slice(0, 8).map(r => enrichLeave(r, usersIndex));

        // Pending count
        if (window.LMS.Store.caps.includes('leave.check')) {
          data.pending_for_me = (leaves || []).filter(r => r.status === 'pending').length;
        } else if (window.LMS.Store.caps.includes('leave.comment')) {
          data.pending_for_me = (leaves || []).filter(r => r.status === 'checked').length;
        } else if (window.LMS.Store.caps.includes('leave.approve')) {
          data.pending_for_me = (leaves || []).filter(r => r.status === 'reviewed').length;
        }

        if (window.LMS.Store.caps.includes('leave.view_all')) {
          Object.keys(STATUS_LABEL).forEach(s => data.by_status[s] = 0);
          (leaves || []).forEach(r => data.by_status[r.status] = (data.by_status[r.status] || 0) + 1);
          const allSorted = (leaves || []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          data.recent_all = allSorted.slice(0, 10).map(r => enrichLeave(r, usersIndex));
        }

        return data;
      }

      throw new Error("Action not mapped in bridge: " + action);
    } catch (e) {
      console.error("Bridge call error:", e);
      throw e;
    }
  }
};


(function () {
  'use strict';

  // ── Globals ────────────────────────────────────────
  var Store = { token: null, user: null, caps: [], boot: null };
  var Routes = {};
  var PAGE_META = {};
  var APP_DEV = { NAME: 'ตาใหม่ งุงิ', URL: '', LOGO: 'https://stickershop.line-scdn.net/stickershop/v1/product/18011/LINEStorePC/main.png?v=1' };

  // ── DOM helpers ────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ── Thai date module ────────────────────────────────
  var TH = {
    MONTHS: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
    MONTHS_SHORT: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'],
    WEEKDAYS: ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'],
    WEEKDAYS_SHORT: ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'],
    parse: function (v) {
      if (!v) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      var s = String(v);
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      return null;
    },
    beYear: function (d) { return d.getFullYear() + 543; },
    date: function (v) {
      var d = TH.parse(v); if (!d) return v ? String(v) : '-';
      return d.getDate() + ' ' + TH.MONTHS_SHORT[d.getMonth()] + ' ' + TH.beYear(d);
    },
    dateLong: function (v) {
      var d = TH.parse(v); if (!d) return v ? String(v) : '-';
      return d.getDate() + ' ' + TH.MONTHS[d.getMonth()] + ' ' + TH.beYear(d);
    },
    dateLongWeekday: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      return 'วัน' + TH.WEEKDAYS[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + TH.MONTHS[d.getMonth()] + ' ' + TH.beYear(d);
    },
    dateWeekday: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      return TH.WEEKDAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + TH.MONTHS_SHORT[d.getMonth()] + ' ' + TH.beYear(d);
    },
    time: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' น.';
    },
    timeFull: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' น.';
    },
    dateTime: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      return TH.date(d) + ' เวลา ' + TH.time(d);
    },
    iso: function (v) {
      var d = TH.parse(v); if (!d) return '';
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
    },
    relative: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      var diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 0) return TH.date(d);
      if (diff < 60) return diff + ' วินาทีที่แล้ว';
      if (diff < 3600) return Math.floor(diff/60) + ' นาทีที่แล้ว';
      if (diff < 86400) return Math.floor(diff/3600) + ' ชั่วโมงที่แล้ว';
      if (diff < 86400*30) return Math.floor(diff/86400) + ' วันที่แล้ว';
      if (diff < 86400*365) return Math.floor(diff/86400/30) + ' เดือนที่แล้ว';
      return Math.floor(diff/86400/365) + ' ปีที่แล้ว';
    },
    smart: function (v) {
      var d = TH.parse(v); if (!d) return '-';
      var diff = Date.now() - d.getTime();
      return (diff < 86400000 * 7) ? TH.relative(d) : TH.dateTime(d);
    },
    splitDate: function (v) {
      // คืน { day, monthName, monthShort, beYear } สำหรับ print form
      var d = TH.parse(v); if (!d) return { day: '', monthName: '', monthShort: '', beYear: '' };
      return {
        day: d.getDate(),
        monthName: TH.MONTHS[d.getMonth()],
        monthShort: TH.MONTHS_SHORT[d.getMonth()],
        beYear: TH.beYear(d)
      };
    }
  };

  // ── Capability check (mirror server) ────────────────
  function hasCap(cap) {
    if (!cap || cap === '*') return true;   // ★ '*' = ทุก role เห็น
    var caps = Store.caps || [];
    return cap.split('|').some(function (c) {
      if (c === '*') return true;           // ★ handle '*' ใน multi-cap "a|*|b"
      if (caps.indexOf(c) >= 0) return true;
      if (/\.(view_own|edit_own|view_self|edit_self|create_own|cancel_own)$/.test(c)) return false;
      var dot = c.indexOf('.');
      if (dot > 0) {
        var prefix = c.substring(0, dot);
        if (caps.indexOf(prefix + '.manage') >= 0) return true;
      }
      return false;
    });
  }

  // ── API call (with timeout + existence check) ───────
  function call(action, payload) {
    return window.SupabaseBridge.call(action, payload);
  }

  // ── Notifications ──────────────────────────────────
  function toast(msg, type, dur) {
    type = type || 'info';
    var icon = { success: 'check-circle-fill', error: 'x-circle-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[type] || 'info-circle-fill';
    var host = $('#toast-host'); if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast t-' + type;
    el.innerHTML = '<i class="bi bi-' + icon + '"></i><span>' + esc(msg) + '</span>';
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 300);
    }, dur || 3000);
  }
  function alertSuccess(title, msg) { return Swal.fire({ icon: 'success', title: title, text: msg, confirmButtonText: 'ตกลง', showClass:{popup:'animate__animated animate__zoomIn animate__faster'} }); }
  function alertError(title, msg) { return Swal.fire({ icon: 'error', title: title, text: msg, confirmButtonText: 'ตกลง' }); }
  function alertInfo(title, msg) { return Swal.fire({ icon: 'info', title: title, text: msg, confirmButtonText: 'ตกลง' }); }
  function confirmModal(opts) {
    return Swal.fire({
      icon: opts.danger ? 'warning' : 'question',
      title: opts.title || 'ยืนยัน',
      html: opts.message ? '<div style="font-size:14px;color:#475569;line-height:1.6">' + opts.message + '</div>' : '',
      showCancelButton: true,
      confirmButtonText: opts.okText || 'ตกลง',
      cancelButtonText: opts.cancelText || 'ยกเลิก',
      reverseButtons: true,
      confirmButtonColor: opts.danger ? '#ef4444' : '#6366f1'
    }).then(function (r) { return !!r.isConfirmed; });
  }

  // ── Spinner ────────────────────────────────────────
  var Spinner = {
    _stages: null, _idx: 0, _timer: null,
    show: function (msg, opts) {
      opts = opts || {};
      var ov = $('#spinner-overlay');
      if (!ov) return;
      ov.hidden = false;
      $('#sp-text').textContent = msg || 'กำลังประมวลผล...';
      $('#sp-stage').textContent = '';
      this._stages = (opts.stages && opts.stages.length) ? opts.stages : null;
      this._idx = 0;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._stages) {
        var self = this;
        $('#sp-stage').textContent = this._stages[0] || '';
        this._timer = setInterval(function () {
          self._idx = (self._idx + 1) % self._stages.length;
          $('#sp-stage').textContent = self._stages[self._idx];
        }, opts.stageInterval || 900);
      }
    },
    hide: function () {
      var ov = $('#spinner-overlay'); if (ov) ov.hidden = true;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    update: function (msg) { var t = $('#sp-text'); if (t) t.textContent = msg; }
  };

  // ── Modal ──────────────────────────────────────────
  var Modal = {
    open: function (opts) {
      opts = opts || {};
      var host = $('#modal-host'); if (!host) return;
      var sizeCls = opts.large ? ' is-large' : (opts.xl ? ' is-xl' : '');
      var html = '<div class="modal-card' + sizeCls + '">'
        + (opts.title ? ('<div class="md-header"><div class="md-title">' + esc(opts.title) + '</div><button class="md-close" data-modal-close><i class="bi bi-x-lg"></i></button></div>') : '')
        + '<div class="md-body">' + (opts.html || '') + '</div>'
        + (opts.footer ? ('<div class="md-footer">' + opts.footer + '</div>') : '')
        + '</div>';
      host.innerHTML = html;
      host.classList.add('is-open');
      if (opts.onOpen) try { opts.onOpen(host); } catch (e) {}
    },
    close: function () {
      var host = $('#modal-host'); if (!host) return;
      host.classList.remove('is-open');
      setTimeout(function () { host.innerHTML = ''; }, 200);
    }
  };

  // ── Page Meta ──────────────────────────────────────
  PAGE_META = {
    '#/dashboard':    { title: 'แดชบอร์ด',           sub: 'ภาพรวมการลาของฉัน',                  icon: 'speedometer2' },
    '#/leaves/new':   { title: 'ยื่นใบลา',           sub: 'กรอกแบบฟอร์มขอลา',                    icon: 'file-earmark-plus-fill' },
    '#/leaves/mine':  { title: 'ใบลาของฉัน',         sub: 'ประวัติการลาทั้งหมด',                 icon: 'person-vcard-fill' },
    '#/leaves/all':   { title: 'รายการใบลาทั้งหมด',  sub: 'จัดการใบลาในระบบ',                    icon: 'inbox-fill' },
    '#/leaves/inbox': { title: 'งานรอดำเนินการ',     sub: 'ใบลาที่รอการตรวจ/อนุมัติของคุณ',     icon: 'check2-square' },
    '#/calendar':     { title: 'ปฏิทินลา',           sub: 'แสดงวันลาทั้งบริษัท',                 icon: 'calendar3' },
    '#/expenses':     { title: 'เบิกค่าใช้จ่าย',       sub: 'ส่งเบิกเงินค่าใช้จ่ายและค่าเดินทาง',      icon: 'cash-coin' },
    '#/expenses/view': { title: 'รายละเอียดการเบิก',   sub: 'ดูข้อมูลและอนุมัติการเบิกจ่าย',         icon: 'receipt-cutoff' },
    '#/missions':     { title: 'งานออกนอกพื้นที่',   sub: 'เบิกค่าเดินทาง',          icon: 'signpost-2-fill' },
    '#/reports':      { title: 'รายงานสถิติ',        sub: 'สถิติการลาในปีงบประมาณ',              icon: 'graph-up' },
    '#/users':        { title: 'จัดการผู้ใช้',        sub: 'ผู้ใช้ระบบ ครู บุคลากร',              icon: 'people-fill' },
    '#/pending-users': { title: 'คำขอสมัครสมาชิก', sub: 'รออนุมัติจากผู้ดูแลระบบ', icon: 'person-fill-exclamation' },
    '#/settings':     { title: 'ตั้งค่าระบบ',        sub: 'กำหนดลิมิตการลา · ข้อมูลบริษัท',     icon: 'gear-fill' },
    '#/profile':      { title: 'โปรไฟล์ของฉัน',      sub: 'จัดการข้อมูลส่วนตัว',                  icon: 'person-circle' },
    '#/audit':        { title: 'บันทึกระบบ',         sub: 'ประวัติการใช้งาน',                    icon: 'shield-check' }
  };

  // ── Menu groups ────────────────────────────────────
  function MENU_GROUPS() {
    return [
      {
        title: 'ภาพรวม',
        items: [
          { hash: '#/dashboard', icon: 'speedometer2', label: 'แดชบอร์ด', cap: '*' }
        ]
      },
      {
        title: 'งานหลัก',
        items: [
          { hash: '#/leaves/new',   icon: 'file-earmark-plus-fill', label: 'ยื่นใบลา',           cap: 'leave.create_own' },
          { hash: '#/leaves/mine',  icon: 'person-vcard-fill',      label: 'ใบลาของฉัน',         cap: 'leave.view_own' },
          { hash: '#/leaves/inbox', icon: 'check2-square',          label: 'งานรอดำเนินการ',     cap: 'leave.check|leave.comment|leave.approve' },
          { hash: '#/leaves/all',   icon: 'inbox-fill',             label: 'รายการใบลาทั้งหมด',  cap: 'leave.view_all' }
        ]
      },
      {
        title: 'กำลังคน',
        items: [
          { hash: '#/calendar',  icon: 'calendar3',         label: 'ปฏิทินลา',          cap: 'calendar.view_own|calendar.view_department|calendar.view_all' },
          { hash: '#/expenses',  icon: 'cash-coin',         label: 'เบิกค่าใช้จ่าย',       cap: 'expense.create_own|expense.manage' },
          { hash: '#/missions',  icon: 'signpost-2-fill',   label: 'งานออกนอกพื้นที่',   cap: 'mission.create_own|mission.view_own|mission.view_department|mission.view_all' }
        ]
      },
      {
        title: 'ข้อมูลหลัก',
        items: [
          { hash: '#/users',         icon: 'people-fill',               label: 'จัดการผู้ใช้',       cap: 'user.manage' },
          { hash: '#/pending-users', icon: 'person-fill-exclamation', label: 'คำขอสมัคร', cap: 'user.manage', badge: 'pending' }
        ]
      },
      {
        title: 'รายงานและประวัติ',
        items: [
          { hash: '#/reports', icon: 'graph-up',     label: 'รายงานสถิติ', cap: 'report.view_own' },
          { hash: '#/audit',   icon: 'shield-check', label: 'บันทึกระบบ',   cap: 'audit.manage' }
        ]
      },
      {
        title: 'ระบบ',
        items: [
          { hash: '#/settings', icon: 'gear-fill', label: 'ตั้งค่าระบบ', cap: 'setting.manage' }
        ]
      },
      {
        title: 'ส่วนตัว',
        items: [
          { hash: '#/profile', icon: 'person-circle', label: 'โปรไฟล์', cap: '*' }
        ]
      }
    ];
  }

  // ── Render Login ───────────────────────────────────
  function renderLogin() {
    var settings = (Store.boot && Store.boot.settings) || {};
    var dev = (Store.boot && Store.boot.dev) || APP_DEV;
    var app = (Store.boot && Store.boot.app) || { name: 'ระบบบันทึกการลา', version: '1.0.0' };
    var showDemo = String(settings.show_demo_users || 'yes').toLowerCase() === 'yes';
    var year = new Date().getFullYear();

    var particles = '';
    for (var i = 0; i < 20; i++) {
      particles += '<span style="left:' + (Math.random()*100) + '%;animation-delay:-' + Math.floor(Math.random()*18) + 's;animation-duration:' + (14 + Math.floor(Math.random()*12)) + 's"></span>';
    }

    var demoCards = [
      { role: 'admin',      user: 'admin',      label: 'ผู้ดูแลระบบ',  icon: 'shield-fill-check' },
      { role: 'approver',   user: 'director',   label: 'ผู้อำนวยการ',   icon: 'mortarboard-fill' },
      { role: 'supervisor', user: 'supervisor', label: 'หัวหน้างาน',    icon: 'briefcase-fill' },
      { role: 'checker',    user: 'checker',    label: 'เจ้าหน้าที่',  icon: 'clipboard-check-fill' },
      { role: 'teacher',    user: 'teacher1',   label: 'ครูตัวอย่าง 1', icon: 'person-badge' },
      { role: 'teacher',    user: 'teacher2',   label: 'ครูตัวอย่าง 2', icon: 'person-badge' }
    ];

    var demoHtml = !showDemo ? '' : (
      '<div class="lf-demo">'
      + '<div class="lf-demo-head"><i class="bi bi-stars"></i> ทดลองใช้งานด้วยบัญชีตัวอย่าง'
      + '  <span class="lf-demo-pill">DEMO</span>'
      + '</div>'
      + '<div class="lf-demo-grid">'
      + demoCards.map(function (d) {
          return '<button type="button" class="lf-demo-card" data-role="' + d.role + '" data-user="' + d.user + '" aria-label="เข้าสู่ระบบด้วยบัญชี ' + d.label + '">'
            + '<div class="lf-demo-icon"><i class="bi bi-' + d.icon + '"></i></div>'
            + '<div class="lf-demo-role">' + d.label + '</div>'
            + '<div class="lf-demo-user">' + d.user + '</div>'
            + '</button>';
        }).join('')
      + '</div>'
      + '<div class="lf-demo-foot"><i class="bi bi-cursor-fill"></i> คลิกเพื่อเข้าระบบทันที (รหัสผ่าน: <strong>123456</strong>)</div>'
      + '</div>'
    );

    var html = '<div class="login-stage">'
      + '<div class="lf-particles">' + particles + '</div>'
      + '<div class="login-shell">'
      + '  <div class="login-brand">'
      + '    <div class="lb-logo">'
      + '      <div class="lb-logo-icon"><i class="bi bi-' + (app.logo_icon || 'calendar2-check-fill') + '"></i></div>'
      + '      <div><div class="lb-logo-name">' + esc(app.name) + '</div>'
      + '           <div class="lb-logo-tag">' + esc(app.org || '') + '</div></div>'
      + '    </div>'
      + '    <div class="lb-tagline">ระบบ<span>ลาออนไลน์</span><br>ครบวงจร · ใช้งานง่าย</div>'
      + '    <div class="lb-features">'
      + '      <div class="lb-feature"><div class="lb-feature-icon"><i class="bi bi-lightning-charge-fill"></i></div><div><div class="lb-feature-title">ยื่นใบลาในคลิกเดียว</div><div class="lb-feature-desc">กรอกฟอร์มสั้น ๆ — ส่งถึงผู้อนุมัติทันที</div></div></div>'
      + '      <div class="lb-feature"><div class="lb-feature-icon"><i class="bi bi-graph-up-arrow"></i></div><div><div class="lb-feature-title">เห็นสถิติการลาแบบเรียลไทม์</div><div class="lb-feature-desc">ลาไปเท่าไหร่ เหลือเท่าไหร่ — รู้ทันที</div></div></div>'
      + '      <div class="lb-feature"><div class="lb-feature-icon"><i class="bi bi-bell-fill"></i></div><div><div class="lb-feature-title">แจ้งเตือนเมื่อใกล้หมดสิทธิ</div><div class="lb-feature-desc">ป้องกันการลาเกินกำหนด</div></div></div>'
      + '      <div class="lb-feature"><div class="lb-feature-icon"><i class="bi bi-printer-fill"></i></div><div><div class="lb-feature-title">พิมพ์ใบลาทางการได้ทันที</div><div class="lb-feature-desc">ตามแบบฟอร์มราชการ 100%</div></div></div>'
      + '    </div>'
      + '    <div class="lb-stats">'
      + '      <div><div class="lb-stat-num">99.9%</div><div class="lb-stat-label">เสถียรพร้อมใช้</div></div>'
      + '      <div><div class="lb-stat-num">3</div><div class="lb-stat-label">ขั้นตอนอนุมัติ</div></div>'
      + '      <div><div class="lb-stat-num">100%</div><div class="lb-stat-label">ทุกอุปกรณ์</div></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="login-form-card">'
      + '    <div class="lf-mini-brand"><div class="icn"><i class="bi bi-' + (app.logo_icon || 'calendar2-check-fill') + '"></i></div><div class="name">' + esc(app.name) + '</div></div>'
      + '    <h2 class="lf-title">ยินดีต้อนรับกลับ</h2>'
      + '    <div class="lf-sub">เข้าสู่ระบบเพื่อจัดการใบลาของคุณ</div>'
      + '    <form class="lf" id="login-form" novalidate autocomplete="on">'
      + '      <div class="lf-input-wrap">'
      + '        <i class="bi bi-person-fill lf-icon"></i>'
      + '        <input type="text" name="username" placeholder="ชื่อผู้ใช้" autocomplete="username" spellcheck="false" required>'
      + '      </div>'
      + '      <div class="lf-input-wrap">'
      + '        <i class="bi bi-lock-fill lf-icon"></i>'
      + '        <input type="password" name="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>'
      + '        <button type="button" class="lf-toggle" data-toggle-pwd tabindex="-1" aria-label="แสดง/ซ่อนรหัสผ่าน"><i class="bi bi-eye"></i></button>'
      + '      </div>'
      + '      <div class="lf-row">'
      + '        <label class="lf-check"><input type="checkbox" name="remember"> จำชื่อผู้ใช้</label>'
      + '      </div>'
      + '      <button type="submit" class="lf-submit">'
      + '        <span class="lf-submit-state lf-submit-state-default"><i class="bi bi-box-arrow-in-right"></i> เข้าสู่ระบบ</span>'
      + '        <span class="lf-submit-state lf-submit-state-loading"><span class="lf-droplets"><span></span><span></span><span></span></span> <span class="lf-submit-status">กำลังตรวจสอบ...</span></span>'
      + '        <span class="lf-submit-state lf-submit-state-success"><i class="bi bi-check-circle-fill"></i> เข้าระบบสำเร็จ</span>'
      + '        <span class="lf-submit-state lf-submit-state-error"><i class="bi bi-exclamation-triangle-fill"></i> ไม่สำเร็จ</span>'
      + '      </button>'
      + '      <div class="lf-register-row">ยังไม่มีบัญชี? <button type="button" class="lf-register-btn" id="btn-open-register"><i class="bi bi-person-plus-fill"></i> สมัครสมาชิกพนักงาน</button></div>'
      + '    </form>'
      + demoHtml
      + '  </div>'
      + '</div>'
      + '<div class="login-footer">'
      + '  <div class="lf-copy">' + year + ' © ' + esc(app.name) + ' <span class="lf-version">v' + esc(app.version || '1.0.0') + '</span></div>'
      + '  <div class="lf-dev">'
      + '    <a href="' + esc(dev.URL) + '" target="_blank" rel="noopener noreferrer" class="lf-dev-link">'
      + '      <img class="lf-dev-logo" src="' + esc(dev.LOGO || '') + '" alt="" referrerpolicy="no-referrer">'
      + '    </a>'
      + '    <div class="lf-dev-text"><small>ผู้พัฒนาโดย</small><br>'
      + '      <a href="' + esc(dev.URL) + '" target="_blank" rel="noopener noreferrer">' + esc(dev.NAME) + '</a>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';

    var root = $('#app-root');
    if (!root) { showFatalError('ไม่พบ #app-root element'); return; }
    root.innerHTML = html;
    try { wireLogin(); } catch (err) { if (window.console) console.error('[LMS] wireLogin error:', err); }
    hideBootLoader();
  }

  function wireLogin() {
    var f = $('#login-form'); if (!f) return;
    var rememberedUser = '';
    try { rememberedUser = localStorage.getItem('lms.lastUser') || ''; } catch (e) {}
    if (rememberedUser) {
      f.username.value = rememberedUser;
      f.querySelector('input[name="remember"]').checked = true;
      try { f.password.focus(); } catch (e) {}
    } else {
      try { f.username.focus(); } catch (e) {}
    }

    // toggle password
    $$('.lf-toggle', f).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var inp = btn.parentNode.querySelector('input');
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.querySelector('i').className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
      });
    });

    // demo cards
    $$('.lf-demo-card').forEach(function (card) {
      card.addEventListener('click', function () {
        f.username.value = card.getAttribute('data-user');
        f.password.value = '123456';
        try {
          if (typeof f.requestSubmit === 'function') f.requestSubmit();
          else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        } catch (e) { f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
      });
    });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = f.querySelector('.lf-submit');
      var statusEl = btn.querySelector('.lf-submit-status');
      var stages = ['กำลังตรวจสอบ...','ยืนยันตัวตน...','เตรียมระบบ...','เกือบเสร็จ...'];
      var idx = 0;
      btn.setAttribute('data-state', 'loading');
      if (statusEl) statusEl.textContent = stages[0];
      var stageTimer = setInterval(function () {
        idx = (idx + 1) % stages.length;
        if (statusEl) statusEl.textContent = stages[idx];
      }, 700);

      var u = f.username.value.trim();
      var p = f.password.value;
      var remember = f.querySelector('input[name="remember"]').checked;

      call('auth.login', { username: u, password: p, user_agent: navigator.userAgent }).then(function (res) {
        clearInterval(stageTimer);
        btn.setAttribute('data-state', 'success');
        Store.token = res.token; Store.user = res.user; Store.caps = res.caps || [];
        try {
          localStorage.setItem('lms.token', res.token);
          if (remember) localStorage.setItem('lms.lastUser', u);
          else localStorage.removeItem('lms.lastUser');
        } catch (e) {}
        setTimeout(function () {
          // ★ ต้องเรียก dispatch ตรงๆ — hashchange listener ยังไม่ถูก register จนกว่า renderShell จะรัน
          if (!location.hash || location.hash === '#') {
            try { history.replaceState(null, '', location.pathname + location.search + '#/dashboard'); } catch (e) { location.hash = '#/dashboard'; }
          }
          dispatch();
        }, 600);
      }).catch(function (err) {
        clearInterval(stageTimer);
        btn.setAttribute('data-state', 'error');
        toast(err.message || 'เข้าสู่ระบบไม่สำเร็จ', 'error', 4500);
        setTimeout(function () { btn.removeAttribute('data-state'); }, 1600);
      });
    });

    // ── Register button → open registration modal ───────────
    var regBtn = $('#btn-open-register');
    if (regBtn) {
      regBtn.addEventListener('click', function () { openRegisterModal(); });
    }
  }

  function openRegisterModal() {
    var html = '<div class="reg-notice">'
      + '<i class="bi bi-info-circle-fill"></i>'
      + '<div><strong>การสมัครสมาชิกพนักงานใหม่</strong>'
      + '<span style="display:block;margin-top:4px;color:#94a3b8;font-size:12px">หลังจากสมัครแล้ว บัญชีจะรออนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคลก่อนจึงจะเข้าใช้งานได้</span>'
      + '</div></div>'
      + '<div class="reg-form-grid">'
      + '<div class="field"><label>ชื่อผู้ใช้ (username) <span class="req">*</span></label>'
      + '<input type="text" name="username" class="input" placeholder="ตัวอักษร a-z, 0-9, _ . - (3-30 ตัว)" pattern="[-a-z0-9_.]{3,30}" required autocomplete="username"></div>'
      + '<div class="field"><label>ชื่อ-สกุล <span class="req">*</span></label>'
      + '<input type="text" name="full_name" class="input" placeholder="ชื่อจริง นามสกุล" required></div>'
      + '<div class="field"><label>ตำแหน่ง</label>'
      + '<input type="text" name="position" class="input" placeholder="ตำแหน่งงาน"></div>'
      + '<div class="field"><label>สังกัด / แผนก</label>'
      + '<input type="text" name="department" class="input" placeholder="แผนกหรือหน่วยงาน"></div>'
      + '<div class="field"><label>อีเมล <span class="req">*</span></label>'
      + '<input type="email" name="email" class="input" placeholder="อีเมลสำหรับรับการแจ้งเตือน" required></div>'
      + '<div class="field"><label>โทรศัพท์ <span class="req">*</span></label>'
      + '<input type="tel" name="phone" class="input" placeholder="หมายเลขโทรศัพท์" required></div>'
      + '<div class="field field-full"><label>รหัสผ่าน <span class="req">*</span></label>'
      + '<input type="password" name="password" class="input" placeholder="อย่างน้อย 6 ตัวอักษร" required autocomplete="new-password">'
      + '<div class="reg-pw-hint">รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร — คุณสามารถเปลี่ยนได้ภายหลัง</div></div>'
      + '</div>';

    var footer = '<button class="btn btn-ghost" data-modal-close>ยกเลิก</button>'
      + '<button class="btn btn-primary" id="reg-submit"><i class="bi bi-person-check-fill"></i> สมัครสมาชิก</button>';

    Modal.open({
      title: 'สมัครสมาชิกพนักงานใหม่',
      large: true,
      html: html,
      footer: footer,
      onOpen: function () {
        $('#reg-submit').addEventListener('click', function () {
          var f = document.querySelector('.modal-body') || document.querySelector('.md-body');
          function gv(n) { var el = f ? f.querySelector('[name="' + n + '"]') : document.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
          var data = {
            username:   gv('username'),
            full_name:  gv('full_name'),
            position:   gv('position'),
            department: gv('department'),
            email:      gv('email'),
            phone:      gv('phone'),
            password:   gv('password')
          };
          if (!data.username)  { toast('กรุณากรอกชื่อผู้ใช้ (username)', 'warning'); return; }
          if (!data.full_name) { toast('กรุณากรอกชื่อ-สกุล', 'warning'); return; }
          if (!data.email)     { toast('กรุณากรอกอีเมล', 'warning'); return; }
          if (!data.phone)     { toast('กรุณากรอกเบอร์โทรศัพท์', 'warning'); return; }
          if (!data.password || data.password.length < 6) { toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'warning'); return; }
          Spinner.show('กำลังส่งคำขอสมัคร...');
          call('user.register', data).then(function () {
            Spinner.hide();
            Modal.close();
            Swal.fire({
              icon: 'success',
              title: 'สมัครสมาชิกสำเร็จ!',
              html: '<p style="font-size:15px;color:#64748b">บัญชีของคุณ <strong style="color:#6366f1">@' + esc(data.username) + '</strong> ถูกส่งเพื่อรออนุมัติแล้ว<br>กรุณารอผู้ดูแลระบบหรือฝ่ายบุคคลอนุมัติก่อนเข้าใช้งาน</p>',
              confirmButtonText: 'รับทราบ',
              confirmButtonColor: '#6366f1'
            });
          }).catch(function (err) {
            Spinner.hide();
            toast(err.message || 'เกิดข้อผิดพลาด', 'error', 5000);
          });
        });
      }
    });
  }

  // ── Render Shell ───────────────────────────────────
  function renderShell() {
    var u = Store.user || {};
    var meta = PAGE_META[location.hash] || PAGE_META['#/dashboard'];
    var dev = (Store.boot && Store.boot.dev) || APP_DEV;
    var app = (Store.boot && Store.boot.app) || {};
    var year = new Date().getFullYear();

    var initial = (u.full_name || u.username || '?').substring(0, 1).toUpperCase();
    var avatarHtml = u.avatar
      ? '<img src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer">'
      : initial;

    var html = '<div class="shell">'
      + '  <aside class="sidebar" id="sidebar">'
      + '    <div class="sb-power">'
      + '      <div class="sb-brand">'
      + '        <div class="sb-brand-icon"><i class="bi bi-' + (app.logo_icon || 'calendar2-check-fill') + '"></i></div>'
      + '        <div><div class="sb-brand-name">' + esc(app.name) + '</div>'
      + '             <div class="sb-brand-orga">' + esc(app.orga) + '</div></div>'
      + '      </div>'
      + '      <div class="sb-clock">'
      + '        <div class="sb-clock-time" id="sb-clock-time">--:--:--</div>'
      + '        <div class="sb-clock-date" id="sb-clock-date">-</div>'
      + '      </div>'
      + '      <div class="sb-user">'
      + '        <div class="sb-user-avatar">' + avatarHtml + '</div>'
      + '        <div class="sb-user-info">'
      + '          <div class="sb-user-name">' + esc(u.full_name || u.username) + '</div>'
      + '          <div class="sb-user-role"><span class="role-chip role-chip-' + esc(u.role) + '"><i class="bi bi-shield-check"></i> ' + esc((Store.boot.roles||{})[u.role]||u.role) + '</span></div>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <nav class="sb-nav">' + sidebarNavHtml() + '</nav>'
      + '  </aside>'
      + '  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>'
      + '  <main class="main-area">'
      + '    <header class="navbar">'
      + '      <button class="nav-burger" id="nav-burger" aria-label="เปิดเมนู"><i class="bi bi-list"></i></button>'
      + '      <div class="nav-page">'
      + '        <div class="nav-page-icon"><i class="bi bi-' + meta.icon + '"></i></div>'
      + '        <div><div class="nav-page-title">' + esc(meta.title) + '</div>'
      + '             <div class="nav-page-sub">' + esc(meta.sub) + '</div></div>'
      + '      </div>'
      + '      <span class="nav-pill nav-pill-online">ออนไลน์</span>'
      + '      <span class="nav-clock" id="nav-clock">-</span>'
      + '      <button class="nav-profile" id="nav-profile-btn">'
      + '        <span class="nav-profile-avatar">' + avatarHtml + '</span>'
      + '        <span class="nav-profile-name">' + esc(u.full_name || u.username) + '</span>'
      + '        <i class="bi bi-chevron-down" style="font-size:11px;color:#94a3b8"></i>'
      + '      </button>'
      + '    </header>'
      + '    <div class="page-wrap" id="page"></div>'
      + appFooterHtml(year, app, dev)
      + '  </main>'
      + '</div>'
      + bottomNavHtml();

    $('#app-root').innerHTML = html;
    wireShell();
    startClock();
    hideBootLoader();
  }

  function sidebarNavHtml() {
    return MENU_GROUPS().map(function (g) {
      var visible = g.items.filter(function (it) { return hasCap(it.cap); });
      if (visible.length === 0) return '';
      return '<div class="sb-section-title">' + esc(g.title) + '</div>'
        + visible.map(function (it) {
            var active = (location.hash === it.hash || location.hash.indexOf(it.hash + '/') === 0) ? ' is-active' : '';
            var badgeHtml = '';
            if (it.badge === 'pending') {
              var cnt = Store._pendingCount || 0;
              if (cnt > 0) badgeHtml = '<span class="sb-nav-badge">' + cnt + '</span>';
            }
            return '<a href="' + it.hash + '" class="sb-link' + active + '"><i class="bi bi-' + it.icon + '"></i> ' + esc(it.label) + badgeHtml + '</a>';
          }).join('');
    }).join('')
    + '<div class="sb-section-title">บัญชี</div>'
    + '<a href="#" class="sb-link is-logout" data-action="logout"><i class="bi bi-box-arrow-right"></i> ออกจากระบบ</a>';
  }

  function bottomNavHtml() {
    var u = Store.user || {};
    var role = u.role;
    // 5 items max, role-aware — slot 2 = primary action ของ role
    var items = [{ hash: '#/dashboard', icon: 'house-fill', label: 'หน้าแรก', cap: '*' }];

    // Slot 2-3: primary action
    if (role === 'teacher' || (!hasCap('leave.check|leave.comment|leave.approve') && hasCap('leave.create_own'))) {
      // teacher / staff that ยื่นใบลาเอง
      items.push({ hash: '#/leaves/new', icon: 'plus-circle-fill', label: 'ยื่นใบลา', cap: 'leave.create_own' });
      items.push({ hash: '#/leaves/mine', icon: 'person-vcard', label: 'ของฉัน', cap: 'leave.view_own' });
    } else if (role === 'checker' || (hasCap('leave.check') && !hasCap('leave.approve'))) {
      items.push({ hash: '#/leaves/inbox', icon: 'shield-check', label: 'ตรวจสอบ', cap: 'leave.check' });
      items.push({ hash: '#/leaves/mine', icon: 'person-vcard', label: 'ของฉัน', cap: 'leave.view_own' });
    } else if (role === 'supervisor' || (hasCap('leave.comment') && !hasCap('leave.approve'))) {
      items.push({ hash: '#/leaves/inbox', icon: 'chat-text-fill', label: 'ความเห็น', cap: 'leave.comment' });
      items.push({ hash: '#/leaves/mine', icon: 'person-vcard', label: 'ของฉัน', cap: 'leave.view_own' });
    } else if (role === 'approver' || hasCap('leave.approve')) {
      items.push({ hash: '#/leaves/inbox', icon: 'check2-circle', label: 'อนุมัติ', cap: 'leave.approve' });
      items.push({ hash: '#/leaves/all', icon: 'inbox-fill', label: 'ทั้งหมด', cap: 'leave.view_all' });
    } else if (role === 'admin' || hasCap('leave.view_all')) {
      items.push({ hash: '#/leaves/inbox', icon: 'check2-square', label: 'รอดำเนินการ', cap: 'leave.check|leave.comment|leave.approve' });
      items.push({ hash: '#/leaves/all', icon: 'inbox-fill', label: 'ทั้งหมด', cap: 'leave.view_all' });
    }

    // Slot 4: work shortcuts (calendar / mission / reports)
    if (hasCap('calendar.view_all|calendar.view_department|calendar.view_own')) {
      items.push({ hash: '#/calendar', icon: 'calendar3', label: 'ปฏิทิน', cap: 'calendar.view_own' });
    } else if (hasCap('mission.view_all|mission.view_department|mission.view_own|mission.create_own')) {
      items.push({ hash: '#/missions', icon: 'signpost-2-fill', label: 'งาน', cap: 'mission.view_own' });
    } else if (hasCap('report.view_all') || hasCap('report.view_own')) {
      items.push({ hash: '#/reports', icon: 'graph-up', label: 'รายงาน', cap: 'report.view_own' });
    }
    // Slot 5: profile
    items.push({ hash: '#/profile', icon: 'person-circle', label: 'โปรไฟล์', cap: '*' });

    // กรอง cap + ตัดที่ 5 รายการ
    var visible = items.filter(function (i) { return hasCap(i.cap); }).slice(0, 5);
    return '<nav class="bottom-nav" id="bottom-nav">' + visible.map(function (it) {
      var active = (location.hash === it.hash || location.hash.indexOf(it.hash + '/') === 0) ? ' is-active' : '';
      return '<a href="' + it.hash + '" class="bn-item' + active + '"><i class="bi bi-' + it.icon + '"></i><span>' + esc(it.label) + '</span></a>';
    }).join('') + '</nav>';
  }

  function appFooterHtml(year, app, dev) {
    return '<div class="app-footer">'
      + '<div><span class="af-year">' + year + '</span> © ' + esc(app.name) + ' <span class="af-version">v' + esc(app.version || '1.0.0') + '</span></div>'
      + '<div class="af-dev">'
      + '  <a class="af-dev-link" href="' + esc(dev.URL) + '" target="_blank" rel="noopener noreferrer">'
      + '    <img class="af-dev-logo" src="' + esc(dev.LOGO || '') + '" alt="" referrerpolicy="no-referrer">'
      + '  </a>'
      + '  <div style="line-height:1.4">'
      + '    <small style="color:#94a3b8;font-size:10px">ผู้พัฒนาโดย</small><br>'
      + '    <a href="' + esc(dev.URL) + '" target="_blank" rel="noopener noreferrer" style="font-weight:600">' + esc(dev.NAME) + '</a>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  function startClock() {
    if (window.__lmsClockTimer) clearInterval(window.__lmsClockTimer);
    function tick() {
      var now = new Date();
      var t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      var elT = $('#sb-clock-time'); if (elT) elT.textContent = t;
      var elD = $('#sb-clock-date'); if (elD) elD.textContent = TH.dateLongWeekday(now);
      var elN = $('#nav-clock'); if (elN) elN.textContent = TH.dateWeekday(now) + ' · ' + t.substring(0, 5) + ' น.';
    }
    tick();
    window.__lmsClockTimer = setInterval(tick, 1000);
  }

  function refreshShell() {
    var pathOnly = location.hash.split('?')[0];
    var meta = PAGE_META[pathOnly] || PAGE_META['#/dashboard'];
    var titleEl = $('.nav-page-title'); if (titleEl) titleEl.textContent = meta.title;
    var subEl = $('.nav-page-sub'); if (subEl) subEl.textContent = meta.sub;
    var iconEl = $('.nav-page-icon i'); if (iconEl) iconEl.className = 'bi bi-' + meta.icon;
    var nav = $('.sb-nav'); if (nav) nav.innerHTML = sidebarNavHtml();
    // Replace bottom nav (re-render เพื่อ update active state)
    var oldBn = $('#bottom-nav');
    if (oldBn) {
      var tmp = document.createElement('div');
      tmp.innerHTML = bottomNavHtml();
      oldBn.parentNode.replaceChild(tmp.firstElementChild, oldBn);
    }
  }

  // Sidebar/burger/popover wiring (idempotent)
  function wireShell() {
    if (window.__lmsShellWired) return;
    window.__lmsShellWired = true;

    document.addEventListener('click', function (e) {
      // 1) data-action handlers ก่อน hash interceptor
      var actEl = e.target.closest && e.target.closest('[data-action]');
      if (actEl) {
        var act = actEl.getAttribute('data-action');
        if (act === 'logout') {
          e.preventDefault();
          var pop = $('.nav-profile-popover'); if (pop) pop.remove();
          doLogout();
          return;
        }
      }

      // 2) data-modal-close
      var closeEl = e.target.closest && e.target.closest('[data-modal-close]');
      if (closeEl) { e.preventDefault(); Modal.close(); return; }

      // 3) burger
      var burger = e.target.closest && e.target.closest('#nav-burger');
      if (burger) { e.preventDefault(); toggleSidebar(); return; }
      var bd = e.target.closest && e.target.closest('#sidebar-backdrop');
      if (bd) { closeSidebar(); return; }

      // 4) profile popover toggle
      var pBtn = e.target.closest && e.target.closest('#nav-profile-btn');
      if (pBtn) { e.preventDefault(); toggleProfilePopover(); return; }

      // 5) Outside click for popover
      var pop2 = $('.nav-profile-popover');
      if (pop2 && !e.target.closest('.nav-profile-popover') && !e.target.closest('#nav-profile-btn')) {
        pop2.remove();
      }

      // 6) Modal backdrop click → close
      if (e.target.id === 'modal-host') { Modal.close(); return; }

      // 7) Hash links
      var a = e.target.closest && e.target.closest('a[href]');
      if (a) {
        var href = a.getAttribute('href');
        if (href && href.charAt(0) === '#') {
          if (href === '#') return;
          if (a.target && a.target !== '_top' && a.target !== '_self') return;
          e.preventDefault();
          // close mobile sidebar after click
          if (window.innerWidth <= 1024) setTimeout(closeSidebar, 50);
          if (href === location.hash) dispatch();
          else location.hash = href;
        }
      }
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        Modal.close();
        var pop = $('.nav-profile-popover'); if (pop) pop.remove();
        closeSidebar();
      }
    });

    window.addEventListener('hashchange', dispatch);
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) closeSidebar();
    });
  }
  function toggleSidebar() {
    var sb = $('#sidebar'); var bd = $('#sidebar-backdrop');
    if (!sb) return;
    var open = sb.classList.toggle('open');
    if (bd) bd.classList.toggle('show', open);
  }
  function closeSidebar() {
    var sb = $('#sidebar'); if (sb) sb.classList.remove('open');
    var bd = $('#sidebar-backdrop'); if (bd) bd.classList.remove('show');
  }
  function toggleProfilePopover() {
    var existing = $('.nav-profile-popover');
    if (existing) { existing.remove(); return; }
    var u = Store.user || {};
    var avatarHtml = u.avatar
      ? '<img src="' + esc(u.avatar) + '" alt="">'
      : (u.full_name || '?').substring(0,1).toUpperCase();
    var html = '<div class="nav-profile-popover">'
      + '<div class="npp-card">'
      + '  <div class="npp-avatar">' + avatarHtml + '</div>'
      + '  <div><div class="npp-name">' + esc(u.full_name || u.username) + '</div>'
      + '       <div class="npp-email">' + esc(u.email || '-') + '</div></div>'
      + '</div>'
      + '<a href="#/profile" class="npp-item"><i class="bi bi-person-circle"></i> โปรไฟล์</a>'
      + '<a href="#" class="npp-item" data-action="change-password"><i class="bi bi-key-fill"></i> เปลี่ยนรหัสผ่าน</a>'
      + '<div class="npp-divider"></div>'
      + '<a href="#" class="npp-item is-danger" data-action="logout"><i class="bi bi-box-arrow-right"></i> ออกจากระบบ</a>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    // ผูก change-password
    var cp = document.querySelector('.npp-item[data-action="change-password"]');
    if (cp) cp.addEventListener('click', function (e) {
      e.preventDefault();
      var pop = $('.nav-profile-popover'); if (pop) pop.remove();
      openChangePasswordModal();
    });
  }

  function openChangePasswordModal() {
    Modal.open({
      title: 'เปลี่ยนรหัสผ่าน',
      html: '<form id="cp-form">'
        + '<div class="field"><label>รหัสผ่านเดิม <span class="req">*</span></label>'
        + '  <input type="password" name="old_password" class="input" required></div>'
        + '<div class="field"><label>รหัสผ่านใหม่ <span class="req">*</span></label>'
        + '  <input type="password" name="new_password" class="input" required>'
        + '  <div class="field-hint">อย่างน้อย 6 ตัวอักษร</div></div>'
        + '<div class="field"><label>ยืนยันรหัสผ่านใหม่ <span class="req">*</span></label>'
        + '  <input type="password" name="confirm" class="input" required></div>'
        + '</form>',
      footer: '<button class="btn btn-ghost" data-modal-close>ยกเลิก</button>'
        + '<button class="btn btn-primary" id="cp-submit"><i class="bi bi-check-lg"></i> บันทึก</button>',
      onOpen: function () {
        $('#cp-submit').addEventListener('click', function () {
          var f = $('#cp-form');
          var op = f.old_password.value;
          var np = f.new_password.value;
          var cf = f.confirm.value;
          if (!op || !np) return toast('กรุณากรอกข้อมูลให้ครบ', 'warning');
          if (np.length < 6) return toast('รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร', 'warning');
          if (np !== cf) return toast('ยืนยันรหัสผ่านไม่ตรงกัน', 'warning');
          Spinner.show('กำลังเปลี่ยนรหัสผ่าน...', { stages: ['ตรวจสอบรหัสเดิม','สร้างรหัสใหม่','บันทึก'] });
          call('auth.change_password', { old_password: op, new_password: np }).then(function () {
            Spinner.hide(); Modal.close();
            alertSuccess('สำเร็จ', 'เปลี่ยนรหัสผ่านเรียบร้อย — ครั้งหน้าใช้รหัสใหม่เข้าระบบ');
          }).catch(function (e) { Spinner.hide(); alertError('ไม่สำเร็จ', e.message); });
        });
      }
    });
  }

  function doLogout() {
    confirmModal({ title: 'ออกจากระบบ?', message: 'คุณจะถูกพากลับไปยังหน้าเข้าสู่ระบบ', okText: 'ออกจากระบบ', danger: true })
    .then(function (ok) {
      if (!ok) return;
      var token = Store.token;
      Store.token = null; Store.user = null; Store.caps = [];
      try { localStorage.removeItem('lms.token'); } catch (e) {}
      try { call('auth.logout', {}).catch(function () {}); } catch (e) {}
      Modal.close(); Spinner.hide();
      if (window.__lmsClockTimer) { clearInterval(window.__lmsClockTimer); window.__lmsClockTimer = null; }
      history.replaceState(null, '', location.pathname + location.search);
      renderLogin();
      toast('ออกจากระบบเรียบร้อย', 'success', 2000);
    });
  }

  // ── Router ─────────────────────────────────────────
  function dispatch() {
    if (!Store.token || !Store.user) { renderLogin(); return; }
    if (!$('#app-root')) return;
    if (!$('#sidebar')) {
      renderShell();
      // Fetch pending registrations count for badge (admin/approver only)
      if (hasCap('user.manage')) {
        call('user.list_pending', {}).then(function (r) {
          Store._pendingCount = (r && r.total) || 0;
          var nav = $('.sb-nav'); if (nav) nav.innerHTML = sidebarNavHtml();
        }).catch(function () {});
      }
    } else {
      refreshShell();
    }
    var hash = location.hash || '#/dashboard';
    var handler = Routes[hash];
    if (!handler) handler = Routes[hash.split('?')[0]];
    if (!handler) {
      var parts = hash.split('?')[0].split('/');
      while (parts.length > 1 && !handler) {
        parts.pop();
        var p = parts.join('/');
        if (p && p !== '#') handler = Routes[p];
        else break;
      }
    }
    if (!handler) handler = Routes['#/dashboard'];
    if (handler) try { handler(hash); } catch (e) { console.error(e); toast('โหลดหน้าไม่สำเร็จ: ' + e.message, 'error'); }
  }

  // ── Bootstrap ──────────────────────────────────────
  function hideBootLoader() {
    var bl = $('#boot-loader');
    if (bl) { bl.style.opacity = '0'; bl.style.transition = 'opacity .3s'; setTimeout(function () { try { bl.remove(); } catch (e) {} }, 320); }
  }

  function setBootText(t) { var el = $('#bl-text'); if (el) el.textContent = t; }

  function showFatalError(msg, detail) {
    // ลบ boot loader ก่อนเพื่อให้เห็น error ชัดเจน
    var bl = $('#boot-loader'); if (bl) try { bl.remove(); } catch (e) {}
    var root = $('#app-root');
    var html = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(135deg,#0f172a,#1e293b)">'
      + '<div style="max-width:480px;background:rgba(255,255,255,.04);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;color:#f1f5f9;text-align:center">'
      + '<div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;box-shadow:0 12px 32px rgba(239,68,68,.4)"><i class="bi bi-exclamation-triangle-fill"></i></div>'
      + '<h2 style="font-size:18px;font-weight:700;margin:0 0 8px">เกิดข้อผิดพลาด</h2>'
      + '<p style="font-size:14px;color:rgba(241,245,249,.7);margin:0 0 14px">' + esc(msg) + '</p>'
      + (detail ? '<details style="text-align:left;background:rgba(0,0,0,.2);border-radius:8px;padding:10px;margin-bottom:14px;font-size:11px;color:#a5b4fc"><summary style="cursor:pointer;font-weight:600">รายละเอียด</summary><pre style="white-space:pre-wrap;word-break:break-all;font-size:10px;margin-top:8px">' + esc(detail) + '</pre></details>' : '')
      + '<button onclick="location.reload()" style="padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;border-radius:10px;cursor:pointer;font-weight:600;font-family:inherit"><i class="bi bi-arrow-clockwise"></i> ลองใหม่</button>'
      + '</div></div>';
    if (root) root.innerHTML = html;
  }

  function boot() {
    setBootText('กำลังโหลดข้อมูลเริ่มต้น...');
    var token = '';
    try { token = localStorage.getItem('lms.token') || ''; } catch (e) {}
    Store.token = token;
    call('app.bootstrap', {}).then(function (data) {
      try {
        if (!data || typeof data !== 'object') throw new Error('ข้อมูล bootstrap ไม่ถูกต้อง');
        Store.boot = data;
        Store.user = data.me || null;
        Store.caps = data.caps || [];
        // ★ ซ่อน boot loader ทันที (ไม่รอ renderLogin/renderShell)
        hideBootLoader();
        if (Store.user) {
          // ★ ต้องตั้ง hash + dispatch ตรงๆ — hashchange listener ยังไม่ register
          if (!location.hash || location.hash === '#') {
            try { history.replaceState(null, '', location.pathname + location.search + '#/dashboard'); } catch (e) { location.hash = '#/dashboard'; }
          }
          dispatch();
        } else {
          Store.token = null;
          try { localStorage.removeItem('lms.token'); } catch (e) {}
          renderLogin();
        }
      } catch (renderErr) {
        if (window.console) console.error('[LMS] Render error:', renderErr, renderErr && renderErr.stack);
        showFatalError('การแสดงผลล้มเหลว: ' + (renderErr.message || renderErr), renderErr && renderErr.stack);
      }
    }).catch(function (e) {
      if (window.console) console.error('[LMS] Bootstrap failed:', e);
      var msg = (e && e.message) || 'ไม่สามารถเชื่อมต่อระบบ';
      showFatalError(msg, e && e.stack);
    });
  }

  // ── Public Surface (cross-IIFE) ────────────────────
  window.LMS_boot = boot;
  window.LMS = {
    Store: Store, Routes: Routes, PAGE_META: PAGE_META,
    $: $, $$: $$, esc: esc, pad: pad, TH: TH,
    hasCap: hasCap, call: call,
    toast: toast, alertSuccess: alertSuccess, alertError: alertError, alertInfo: alertInfo, confirmModal: confirmModal,
    Spinner: Spinner, Modal: Modal,
    dispatch: dispatch, renderLogin: renderLogin, renderShell: renderShell, refreshShell: refreshShell,
    get LEAVE_TYPE_LABEL() { return (Store.boot && Store.boot.leave_types) || { sick: 'ลาป่วย', personal: 'ลากิจส่วนตัว', annual: 'ลาพักร้อน' }; }
  };
})();

(function () {
  'use strict';
  if (!window.LMS) return;
  var LMS = window.LMS;
  var $ = LMS.$, $$ = LMS.$$, esc = LMS.esc, TH = LMS.TH;
  var call = LMS.call, hasCap = LMS.hasCap, toast = LMS.toast;
  var Spinner = LMS.Spinner, Modal = LMS.Modal;
  var Routes = LMS.Routes;
  var alertSuccess = LMS.alertSuccess, alertError = LMS.alertError, confirmModal = LMS.confirmModal;
  function page() { return $('#page'); }
  function setPage(html) { var p = page(); if (p) p.innerHTML = html; }
  function skBlocks(n, h) {
    h = h || 80;
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="sk" style="height:' + h + 'px;margin-bottom:12px;border-radius:14px"></div>';
    return out;
  }
  function pillToneFor(tone) { return 'badge b-' + (tone || 'slate'); }
  function fyOptions(currentBE) {
    var nowFY = new Date().getMonth() + 1 >= 10 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    var opts = '';
    for (var y = nowFY + 1; y >= nowFY - 5; y--) {
      var be = y + 543;
      var sel = (Number(currentBE) === be) ? ' selected' : '';
      opts += '<option value="' + y + '"' + sel + '">' + be + '</option>';
    }
    return opts;
  }
  function activeLeaveTypes() {
    var labels = LMS.LEAVE_TYPE_LABEL || {};
    var seenLabels = {};
    return Object.keys(labels).filter(function (key) {
      if (key === 'maternity') return false;
      var label = String(labels[key] || key);
      if (seenLabels[label]) return false;
      seenLabels[label] = true;
      return true;
    });
  }
  function leaveTypeIcon(type) {
    return ({ sick: 'thermometer-half', personal: 'briefcase-fill', annual: 'umbrella-fill', maternity: 'umbrella-fill' })[type] || 'calendar-check';
  }
  function leaveTypeTone(type) {
    return ({ sick: 'rose', personal: 'amber', annual: 'emerald', maternity: 'emerald' })[type] || 'indigo';
  }
  function leaveTypeGradient(type) {
    return ({ sick: '#b3262b,#5a1313', personal: '#d97706,#92400e', annual: '#0f9f6e,#057a55', maternity: '#0f9f6e,#057a55' })[type] || '#024ad8,#0e3191';
  }
  function durationLabel(lv) {
    if (!lv) return '-';
    if (lv.duration_label) return lv.duration_label;
    if (String(lv.leave_unit || '') === 'hour') {
      var h = Number(lv.hours || 0) || 0;
      var d = Number(lv.days || 0) || round2(h / 8);
      return h + ' ชั่วโมง (' + round2(d) + ' วัน)';
    }
    return (Number(lv.days || 0) || 0) + ' วัน';
  }
  function timeRangeLabel(lv) {
    return (lv && lv.leave_unit === 'hour' && lv.start_time && lv.end_time) ? (' · ' + lv.start_time + '-' + lv.end_time + ' น.') : '';
  }
  var WORK_START_MINUTES = 8 * 60 + 30;
  var WORK_END_MINUTES = 20 * 60;
  // ── Dashboard ──────────────────────────────────────
  Routes['#/dashboard'] = function () {
    setPage(skBlocks(1, 180) + '<div class="grid-3">' + skBlocks(3, 120) + '</div>' + skBlocks(2, 220));
    Spinner.show('กำลังโหลดแดชบอร์ด...', { stages: ['อ่านสถิติ','คำนวณยอดคงเหลือ','เตรียมการ์ด'] });
    call('dashboard.data', {}).then(function (d) {
      Spinner.hide();
      if (!page()) return;
      renderDashboard(d);
    }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
  };
  function renderDashboard(d) {
    setPage(
      '<div class="dash-mobile-only">' + renderDashboardMobile(d) + '</div>' +
      '<div class="dash-desktop-only">' + renderDashboardDesktop(d) + '</div>'
    );
  }
  // ── Desktop Layout (original) ─────────────────────
  function renderDashboardDesktop(d) {
    var u = LMS.Store.user || {};
    var hr = greetingFor(new Date());
    var stats = d.me.stats.items || {};
    var warn = Number(d.warn_threshold || 80);
    var statHtml = '';
    Object.keys(stats).forEach(function (k) {
      var s = stats[k];
      var pct = s.percent || 0;
      var barCls = pct >= 100 ? ' over' : (pct >= warn ? ' warn' : '');
      var warnIcon = pct >= 100 ? '<i class="bi bi-exclamation-octagon-fill" style="color:#ef4444"></i> เกินสิทธิ' : (pct >= warn ? '<i class="bi bi-exclamation-triangle-fill" style="color:#f59e0b"></i> ใกล้เต็ม' : '');
      statHtml += '<div class="stat-card tone-' + leaveTypeTone(k) + '">'
        + '<div class="stat-icon"><i class="bi bi-' + leaveTypeIcon(k) + '"></i></div>'
        + '<div class="stat-label">' + esc(LMS.LEAVE_TYPE_LABEL[k]) + '</div>'
        + '<div class="stat-value">' + s.used + ' / ' + s.limit + ' <span style="font-size:13px;color:#94a3b8;font-weight:500">วัน</span></div>'
        + '<div class="stat-sub">เหลือ ' + s.remaining + ' วัน · ใช้แล้ว ' + pct + '%</div>'
        + '<div class="progress"><div class="progress-bar' + barCls + '" style="width:' + Math.min(100, pct) + '%"></div></div>'
        + (warnIcon ? '<div style="font-size:11px;margin-top:6px">' + warnIcon + '</div>' : '')
        + '</div>';
    });
    var heroKpi = ''
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-calendar-check"></i> ปีงบประมาณ</div>'
      + '<div class="hkpi-value">' + d.fiscal_year_be + '</div></div>';
    if (d.pending_for_me > 0) {
      heroKpi += '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-bell-fill"></i> รอดำเนินการ</div>'
        + '<div class="hkpi-value">' + d.pending_for_me + '</div>'
        + '<div class="hkpi-sub"><a href="#/leaves/inbox" style="color:#fff;text-decoration:underline">ตรวจดู →</a></div></div>';
    }
    var html = '<div class="hero">'
      + '<span class="hero-pill"><i class="bi bi-stars"></i> แดชบอร์ดส่วนตัว</span>'
      + '<div class="hero-greet">' + hr + ', ' + esc(u.full_name || u.username) + '</div>'
      + '<div class="hero-sub">' + esc((LMS.Store.boot.roles || {})[u.role] || u.role) + ' · ' + esc(u.department || '-') + '</div>'
      + '<div class="hero-kpi">' + heroKpi + '</div>'
      + '</div>'
      + '<div class="grid-3" style="margin-bottom:18px">' + statHtml + '</div>';
    if (hasCap('leave.create_own')) {
      html += '<div class="card" style="margin-bottom:18px"><div class="card-body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
        + '<div style="flex:1;min-width:200px"><div style="font-weight:700;font-size:15px;margin-bottom:4px"><i class="bi bi-lightning-charge-fill" style="color:#f59e0b"></i> ต้องการลา?</div>'
        + '<div style="font-size:12.5px;color:#64748b">กรอกแบบฟอร์มแล้วส่งให้ผู้บังคับบัญชาในคลิกเดียว</div></div>'
        + '<a href="#/leaves/new" class="btn btn-primary btn-lg"><i class="bi bi-plus-lg"></i> ยื่นใบลาใหม่</a>'
        + '</div></div>';
    }
    html += '<div class="card" style="margin-bottom:18px">'
      + '<div class="card-head"><i class="bi bi-clock-history" style="color:#024ad8"></i> <span class="card-title">ใบลาล่าสุดของฉัน</span> <a href="#/leaves/mine" style="margin-left:auto;font-size:12px">ดูทั้งหมด →</a></div>'
      + '<div class="card-body">' + (d.me.recent.length === 0 ? emptyState('inbox', 'ยังไม่มีใบลา') : leaveCardList(d.me.recent)) + '</div>'
      + '</div>';
    if (hasCap('leave.view_all') && d.recent_all && d.recent_all.length) {
      html += '<div class="card">'
        + '<div class="card-head"><i class="bi bi-collection-fill" style="color:#296ef9"></i> <span class="card-title">กิจกรรมล่าสุดในระบบ</span> <a href="#/leaves/all" style="margin-left:auto;font-size:12px">ดูทั้งหมด →</a></div>'
        + '<div class="card-body">' + leaveCardList(d.recent_all) + '</div></div>';
    }
    return html;
  }
  // ── Mobile App-Style Layout ───────────────────────
  function renderDashboardMobile(d) {
    var u = LMS.Store.user || {};
    var stats = d.me.stats.items || {};
    var warn = Number(d.warn_threshold || 80);
    var hr = greetingFor(new Date());
    var initial = (u.full_name || '?').substring(0, 1).toUpperCase();
    var avatar = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer">' : initial;
    // 1) Greeting Card
    var greetHtml = '<div class="greet-card">'
      + '<div class="greet-avatar">' + avatar + '</div>'
      + '<div class="greet-info">'
      + '  <div class="greet-hi">' + hr + ',</div>'
      + '  <div class="greet-name">' + esc(u.full_name || u.username) + '</div>'
      + '  <div class="greet-date">' + TH.dateLongWeekday(new Date()) + '</div>'
      + '</div>'
      + '</div>';
    // 2) Featured CTA (role-aware)
    var ctaHtml = featuredCtaHtml(d);
    // 3) Highlight KPIs — 2 อันที่สำคัญที่สุดของ user (ใช้เหลือ vs เกือบเต็ม)
    var highlightHtml = highlightKpisHtml(stats, warn);
    // 4) Quick Stats Strip (3 ตัว — ปีงบประมาณ + รออนุมัติ + ใบลาที่อนุมัติแล้ว)
    var quickHtml = quickStripHtml(d, stats);
    // 5) App Menu Grid — RBAC filtered
    var menuHtml = appMenuGridHtml();
    // 6) SLA Alert (conditional — แสดงเฉพาะถ้ามี overdue)
    var slaHtml = slaAlertHtml(d);
    // 7) Activity Feed
    var feedHtml = activityFeedHtml(d);
    return greetHtml + ctaHtml + highlightHtml + quickHtml + menuHtml + slaHtml + feedHtml;
  }
  function greetingFor(now) {
    var h = now.getHours();
    if (h < 12) return 'อรุณสวัสดิ์';
    if (h < 17) return 'สวัสดี';
    return 'สวัสดียามเย็น';
  }
  function featuredCtaHtml(d) {
    var u = LMS.Store.user || {};
    var role = u.role;
    var cfg = null;
    // role-aware primary action
    if (hasCap('leave.approve') && d.pending_for_me > 0 && role === 'approver') {
      cfg = { href: '#/leaves/inbox', tone: 'amber', icon: 'check2-circle', title: 'รออนุมัติ · ' + d.pending_for_me + ' รายการ', sub: 'ผู้บังคับบัญชาส่งความเห็นมาแล้ว' };
    } else if (hasCap('leave.comment') && d.pending_for_me > 0 && role === 'supervisor') {
      cfg = { href: '#/leaves/inbox', tone: 'indigo', icon: 'chat-text-fill', title: 'รอความเห็น · ' + d.pending_for_me + ' รายการ', sub: 'เจ้าหน้าที่ตรวจสอบส่งมาแล้ว' };
    } else if (hasCap('leave.check') && d.pending_for_me > 0 && role === 'checker') {
      cfg = { href: '#/leaves/inbox', tone: 'sky', icon: 'shield-check', title: 'รอตรวจสอบ · ' + d.pending_for_me + ' รายการ', sub: 'ครู/บุคลากรยื่นใบลาใหม่' };
    } else if (role === 'admin' && d.pending_for_me > 0) {
      cfg = { href: '#/leaves/inbox', tone: 'amber', icon: 'inbox-fill', title: 'งานในระบบ · ' + d.pending_for_me + ' รายการ', sub: 'รอดำเนินการในระบบ' };
    } else if (hasCap('leave.create_own')) {
      cfg = { href: '#/leaves/new', tone: 'emerald', icon: 'plus-circle-fill', title: 'ยื่นใบลาใหม่', sub: 'กรอกแบบฟอร์มแล้วส่งทันที' };
    }
    if (!cfg) return '';
    return '<a href="' + cfg.href + '" class="feat-cta tone-' + cfg.tone + '">'
      + '<div class="feat-cta-icon"><i class="bi bi-' + cfg.icon + '"></i></div>'
      + '<div class="feat-cta-body">'
      + '  <div class="feat-cta-title">' + esc(cfg.title) + '</div>'
      + '  <div class="feat-cta-sub">' + esc(cfg.sub) + '</div>'
      + '</div>'
      + '<div class="feat-cta-arrow"><i class="bi bi-arrow-right"></i></div>'
      + '</a>';
  }
  function highlightKpisHtml(stats, warn) {
    // เลือก type ที่ใช้มากที่สุด + ที่เหลือน้อยที่สุด
    var types = activeLeaveTypes();
    var sorted = types.map(function (k) { return { k: k, s: stats[k] || { used: 0, limit: 0, percent: 0, remaining: 0 } }; });
    sorted.sort(function (a, b) { return (b.s.percent || 0) - (a.s.percent || 0); });
    var top = sorted[0];
    var second = sorted[1];
    function card(item) {
      var s = item.s;
      var pct = s.percent || 0;
      var tone = pct >= 100 ? 'rose' : (pct >= warn ? 'amber' : 'emerald');
      return '<div class="hl-card tone-' + tone + '">'
        + '<div class="hl-icon"><i class="bi bi-' + leaveTypeIcon(item.k) + '"></i></div>'
        + '<div class="hl-label">' + esc(LMS.LEAVE_TYPE_LABEL[item.k]) + '</div>'
        + '<div class="hl-value">' + s.remaining + '<span style="font-size:11px;color:#94a3b8;margin-left:3px">วัน</span></div>'
        + '<div class="hl-sub">เหลือจาก ' + s.limit + ' วัน</div>'
        + '</div>';
    }
    return '<div class="highlight-grid">' + card(top) + card(second) + '</div>';
  }
  function quickStripHtml(d, stats) {
    var totalApproved = 0, totalPending = 0;
    (d.me.recent || []).forEach(function (lv) {
      if (lv.status === 'approved') totalApproved++;
      else if (lv.status === 'pending' || lv.status === 'checked' || lv.status === 'reviewed') totalPending++;
    });
    return '<div class="quick-strip">'
      + '<div class="qs-item"><div class="qs-value">' + d.fiscal_year_be + '</div><div class="qs-label">ปีงบประมาณ</div></div>'
      + '<div class="qs-item"><div class="qs-value">' + totalApproved + '</div><div class="qs-label">อนุมัติแล้ว</div></div>'
      + '<div class="qs-item"><div class="qs-value">' + totalPending + '</div><div class="qs-label">รอดำเนินการ</div></div>'
      + '</div>';
  }
  function appMenuGridHtml() {
    var items = [
      { hash: '#/leaves/new',   icon: 'file-earmark-plus-fill', label: 'ยื่นใบลา',   grad: '#10b981,#059669', cap: 'leave.create_own' },
      { hash: '#/leaves/mine',  icon: 'person-vcard-fill',      label: 'ใบลาของฉัน', grad: '#024ad8,#0e3191', cap: 'leave.view_own' },
      { hash: '#/leaves/inbox', icon: 'check2-square',          label: 'รอดำเนินการ',grad: '#f59e0b,#d97706', cap: 'leave.check|leave.comment|leave.approve' },
      { hash: '#/leaves/all',   icon: 'inbox-fill',             label: 'ใบลาทั้งหมด',grad: '#296ef9,#024ad8', cap: 'leave.view_all' },
      { hash: '#/expenses/new',   icon: 'cash-coin',             label: 'เบิกค่าใช้จ่าย', grad: '#0ea5e9,#0284c7', cap: 'expense.create_own|expense.manage' },
      { hash: '#/reports',      icon: 'graph-up',               label: 'รายงาน',     grad: '#ec4899,#db2777', cap: 'report.view_own' },
      { hash: '#/users',        icon: 'people-fill',            label: 'ผู้ใช้',      grad: '#f43f5e,#e11d48', cap: 'user.manage' },
      { hash: '#/settings',     icon: 'gear-fill',              label: 'ตั้งค่า',    grad: '#64748b,#334155', cap: 'setting.manage' },
      { hash: '#/audit',        icon: 'shield-check',           label: 'บันทึก',     grad: '#0ea5e9,#0284c7', cap: 'audit.manage' },
      { hash: '#/profile',      icon: 'person-circle',          label: 'โปรไฟล์',    grad: '#296ef9,#0e3191', cap: '*' }
    ];
    var visible = items.filter(function (it) { return hasCap(it.cap); });
    return '<div class="app-menu-section">'
      + '<div class="app-menu-head"><i class="bi bi-grid-fill"></i> เมนูด่วน</div>'
      + '<div class="app-menu-grid">'
      + visible.map(function (it) {
          return '<a href="' + it.hash + '" class="app-menu-item">'
            + '<div class="app-menu-icon" style="background:linear-gradient(135deg,' + it.grad + ')"><i class="bi bi-' + it.icon + '"></i></div>'
            + '<div class="app-menu-label">' + esc(it.label) + '</div>'
            + '</a>';
        }).join('')
      + '</div></div>';
  }
  function slaAlertHtml(d) {
    var role = (LMS.Store.user || {}).role;
    if (d.pending_for_me > 0 && (role === 'approver' || role === 'admin')) {
      return '<a href="#/leaves/inbox" style="text-decoration:none;color:inherit"><div class="sla-alert">'
        + '<i class="bi bi-exclamation-triangle-fill"></i>'
        + '<div class="sla-alert-body">'
        + '  <div class="sla-alert-title">มี ' + d.pending_for_me + ' ใบลารอการตัดสินใจ</div>'
        + '  <div class="sla-alert-sub">แตะเพื่อดูรายการ →</div>'
        + '</div>'
        + '</div></a>';
    }
    return '';
  }
  function activityFeedHtml(d) {
    var statusToneMap = { pending: 'amber', checked: 'sky', reviewed: 'indigo', approved: 'emerald', rejected: 'rose', cancelled: 'slate', draft: 'slate' };
    var leaveItems = (d.me.recent || []).map(function (lv) {
      return {
        kind: 'leave',
        created_at: lv.created_at,
        status: lv.status,
        tone: statusToneMap[lv.status] || 'slate',
        href: '#/leaves/view?id=' + esc(lv.id),
        grad: leaveTypeGradient(lv.leave_type),
        icon: leaveTypeIcon(lv.leave_type),
        title: esc(lv.leave_type_label) + ' · ' + durationLabel(lv),
        meta: '<span class="badge b-' + (statusToneMap[lv.status] || 'slate') + '" style="font-size:9.5px;padding:1px 7px">' + esc(lv.status_label) + '</span> <span>' + TH.date(lv.start_date) + '</span>'
      };
    });
    var expenseItems = (d.me.recent_expenses || []).map(function (ex) {
      var amount = Number(ex.amount || 0).toLocaleString();
      return {
        kind: 'expense',
        created_at: ex.created_at,
        status: ex.status,
        tone: ex.status_tone || statusToneMap[ex.status] || 'slate',
        href: '#/expenses/view?id=' + esc(ex.id),
        grad: '#0ea5e9,#0284c7',
        icon: 'cash-coin',
        title: 'เบิกค่าใช้จ่าย · ฿' + amount,
        meta: '<span class="badge b-' + esc(ex.status_tone || statusToneMap[ex.status] || 'slate') + '" style="font-size:9.5px;padding:1px 7px">' + esc(ex.status_label || ex.status) + '</span> <span>' + esc(ex.expense_type || '-') + '</span>'
      };
    });
    var items = leaveItems.concat(expenseItems).sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    var feedItems = items.slice(0, 8).map(function (it) {
      return '<a class="feed-item s-' + esc(it.status) + ' feed-' + esc(it.kind) + '" href="' + it.href + '">'
        + '<div class="fi-icon" style="background:linear-gradient(135deg,' + it.grad + ')"><i class="bi bi-' + it.icon + '"></i></div>'
        + '<div class="fi-body">'
        + '  <div class="fi-title">' + it.title + '</div>'
        + '  <div class="fi-meta">' + it.meta + '</div>'
        + '</div>'
        + '<div class="fi-time">' + TH.smart(it.created_at) + '</div>'
        + '</a>';
    }).join('');
    return '<div class="feed-section">'
      + '<div class="feed-head"><i class="bi bi-clock-history"></i> กิจกรรมล่าสุดของฉัน <a href="#/leaves/mine">ดูทั้งหมด →</a></div>'
      + (items.length === 0
          ? '<div class="feed-list" style="padding:30px;text-align:center;color:#94a3b8"><i class="bi bi-inbox" style="font-size:32px;opacity:.4"></i><div style="margin-top:6px;font-size:12.5px">ยังไม่มีกิจกรรม</div></div>'
          : '<div class="feed-list">' + feedItems + '</div>')
      + '</div>';
  }
  function emptyState(icon, msg) {
    return '<div class="empty-state"><i class="bi bi-' + icon + '"></i><p>' + esc(msg) + '</p></div>';
  }
  function leaveCardList(items) {
    if (!items || items.length === 0) return emptyState('inbox', 'ยังไม่มีรายการ');
    return '<div class="card-list">' + items.map(function (lv) {
      var u = lv.requester || {};
      var initial = (u.full_name || '?').substring(0,1).toUpperCase();
      var avatar = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : initial;
      return '<a href="#/leaves/view?id=' + esc(lv.id) + '" class="lv-card">'
        + '<div class="lv-card-head">'
        + '  <div class="lv-avatar">' + avatar + '</div>'
        + '  <div style="flex:1;min-width:0">'
        + '    <div class="lv-name">' + esc(u.full_name || '-') + '</div>'
        + '    <div class="lv-no">' + esc(lv.leave_no) + '</div>'
        + '  </div>'
        + '  <span class="' + pillToneFor(lv.status_tone) + '">' + esc(lv.status_label) + '</span>'
        + '</div>'
        + '<div class="lv-row">'
        + '  <span class="lv-meta"><i class="bi bi-tag-fill"></i> ' + esc(lv.leave_type_label) + '</span>'
        + '</div>'
        + '<div class="lv-row" style="margin-top:8px;align-items:flex-end;justify-content:space-between">'
        + '  <div style="font-size:12px;color:#475569"><i class="bi bi-calendar3"></i> ' + TH.date(lv.start_date) + ' → ' + TH.date(lv.end_date) + timeRangeLabel(lv) + '</div>'
        + '  <div class="lv-days">' + durationLabel(lv) + '</div>'
        + '</div>'
        + '</a>';
    }).join('') + '</div>';
  }
  // ── Leaves: New (Wizard) ───────────────────────────
  var WIZ = null;
  Routes['#/leaves/new'] = function () {
    if (!hasCap('leave.create_own')) { toast('ไม่มีสิทธิ์ยื่นใบลา', 'warning'); location.hash = '#/dashboard'; return; }
    var u = LMS.Store.user || {};
    WIZ = {
      step: 1, max: 4,
      data: {
        leave_type: '',
        reason: '',
        leave_unit: 'day',
        start_date: TH.iso(new Date()),
        end_date: TH.iso(new Date()),
        start_time: '08:30',
        end_time: '09:30',
        contact_address: '',
        contact_phone: u.phone || '',
        written_at: TH.iso(new Date()),
        written_place: ''
      }
    };
    renderWizard();
  };
  function renderWizard() {
    var d = WIZ.data;
    var pct = (WIZ.step - 1) / (WIZ.max - 1);
    var stepIcons = ['file-text','calendar3','telephone-fill','check2-circle'];
    var stepNames = ['ประเภทและเหตุผล','ช่วงวันที่','เบอร์ติดต่อ','ตรวจสอบและส่ง'];
    var stepsHtml = '';
    for (var i = 1; i <= WIZ.max; i++) {
      var cls = (i < WIZ.step) ? 'is-done' : (i === WIZ.step ? 'is-active' : '');
      var content = (i < WIZ.step) ? '<i class="bi bi-check-lg"></i>' : ('<i class="bi bi-' + stepIcons[i-1] + '"></i>');
      stepsHtml += '<div class="wiz-step ' + cls + '" data-jump="' + i + '">'
        + '<div class="wiz-step-circle">' + content + '</div>'
        + '<div class="wiz-step-label">' + stepNames[i-1] + '</div></div>';
    }
    var paneHtml = '';
    if (WIZ.step === 1) paneHtml = wizStep1();
    else if (WIZ.step === 2) paneHtml = wizStep2();
    else if (WIZ.step === 3) paneHtml = wizStep3();
    else paneHtml = wizStep4();
    var navHtml = '<div class="wiz-nav">'
      + (WIZ.step > 1 ? '<button class="btn btn-ghost" id="wiz-prev"><i class="bi bi-arrow-left"></i> ย้อนกลับ</button>' : '<div></div>')
      + '<div class="wiz-pill">ขั้นที่ ' + WIZ.step + ' จาก ' + WIZ.max + '</div>'
      + (WIZ.step < WIZ.max
          ? '<button class="btn btn-primary" id="wiz-next">ถัดไป <i class="bi bi-arrow-right"></i></button>'
          : '<button class="btn btn-success" id="wiz-submit"><i class="bi bi-send-fill"></i> ส่งใบลา</button>')
      + '</div>';
    setPage('<div class="wiz">'
      + '<div class="wiz-progress">'
      + '<div class="wiz-track"><div class="wiz-track-fill" style="width:calc(' + (pct*100) + '% + 0px)"></div></div>'
      + '<div class="wiz-steps">' + stepsHtml + '</div>'
      + '</div>'
      + '<div class="wiz-pane" id="wiz-pane">' + paneHtml + '</div>'
      + navHtml
      + '</div>');
    wireWizard();
  }
  function wizSection(title, sub, icon) {
    return '<div class="wiz-section"><div class="wiz-section-icon"><i class="bi bi-' + icon + '"></i></div>'
      + '<div><div class="wiz-section-title">' + esc(title) + '</div>'
      + '<div class="wiz-section-sub">' + esc(sub) + '</div></div></div>';
  }
  function wizStep1() {
    var d = WIZ.data;
    var typeSubs = { sick: 'เจ็บป่วย ต้องพักรักษา', personal: 'ติดธุระจำเป็น', annual: 'พักผ่อนประจำปี' };
    var types = activeLeaveTypes().map(function (key) {
      return { key: key, icon: leaveTypeIcon(key), name: LMS.LEAVE_TYPE_LABEL[key], sub: typeSubs[key] || 'เลือกประเภทการลา' };
    });
    return wizSection('ประเภทและเหตุผลการลา', 'เลือกประเภท แล้วระบุเหตุผลโดยย่อ', 'file-text-fill')
      + '<div class="field"><label>ประเภทการลา <span class="req">*</span></label>'
      + '<div class="lt-grid" id="lt-grid">'
      + types.map(function (t) {
          var sel = d.leave_type === t.key ? ' is-selected' : '';
          return '<div class="lt-card' + sel + '" data-type="' + t.key + '">'
            + '<div class="lt-icon"><i class="bi bi-' + t.icon + '"></i></div>'
            + '<div class="lt-name">' + t.name + '</div>'
            + '<div class="lt-sub">' + t.sub + '</div></div>';
        }).join('')
      + '</div></div>'
      + '<div class="field"><label>เหตุผลการลา <span class="req">*</span></label>'
      + '<textarea name="reason" class="textarea" data-field="reason" placeholder="ระบุเหตุผล เช่น เป็นไข้หวัดใหญ่ ต้องพบแพทย์ ฯลฯ" required>' + esc(d.reason) + '</textarea>'
      + '<div class="field-hint">ระบุข้อเท็จจริงสั้น ๆ — อย่างน้อย 3 ตัวอักษร</div></div>';
  }
  function wizStep2() {
    var d = WIZ.data;
    var todayISO = TH.iso(new Date());
    return wizSection('ช่วงวันที่ลา', 'เลือกลาเต็มวัน หรือกำหนดเป็นชั่วโมงขั้นต่ำ 1 ชั่วโมง', 'calendar3-fill')
      + '<div class="field"><label>รูปแบบการลา <span class="req">*</span></label>'
      + '<select class="select" data-field="leave_unit">'
      + '<option value="day"' + (d.leave_unit !== 'hour' ? ' selected' : '') + '>ลาเต็มวัน</option>'
      + '<option value="hour"' + (d.leave_unit === 'hour' ? ' selected' : '') + '>ลาเป็นชั่วโมง</option>'
      + '</select></div>'
      + '<div class="row-2">'
      + '<div class="field"><label>วันเริ่มลา <span class="req">*</span></label>'
      + '<input type="date" class="input" data-field="start_date" value="' + esc(d.start_date) + '" min="2020-01-01"></div>'
      + '<div class="field"><label>วันสิ้นสุด <span class="req">*</span></label>'
      + '<input type="date" class="input" data-field="end_date" value="' + esc(d.end_date) + '" min="2020-01-01"></div>'
      + '</div>'
      + '<div class="row-2" id="time-row" style="' + (d.leave_unit === 'hour' ? '' : 'display:none;') + 'margin-top:14px">'
      + '<div class="field"><label>เวลาเริ่มลา <span class="req">*</span></label>'
      + '<input type="time" class="input" data-field="start_time" value="' + esc(d.start_time || '08:30') + '" min="08:30" max="19:00" step="1800"></div>'
      + '<div class="field"><label>เวลาสิ้นสุด <span class="req">*</span></label>'
      + '<input type="time" class="input" data-field="end_time" value="' + esc(d.end_time || '09:30') + '" min="09:30" max="20:00" step="1800"></div>'
      + '</div>'
      + '<div class="card" style="background:#f8fafc;border:1px dashed #c7d2fe">'
      + '<div class="card-body" style="padding:14px">'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:4px">ผลลัพธ์</div>'
      + '<div id="wiz-preview" style="font-size:13.5px;color:#334155">กำลังคำนวณ...</div>'
      + '</div></div>'
      + '<div class="row-2" style="margin-top:14px">'
      + '<div class="field"><label>พนักงานสาขา <span class="req">*</span></label>'
      + '<input type="text" class="input" data-field="written_place" value="' + esc(d.written_place) + '" placeholder="เช่น ราชพฤกษ์"></div>'
      + '<div class="field"><label>วันที่เขียนใบลา</label>'
      + '<input type="date" class="input" data-field="written_at" value="' + esc(d.written_at || todayISO) + '"></div>'
      + '</div>';
  }
  function wizStep3() {
    var d = WIZ.data;
    return wizSection('เบอร์ติดต่อระหว่างลา', 'สำหรับติดต่อกรณีจำเป็น', 'telephone-fill')
      + '<div class="field"><label>หมายเลขโทรศัพท์ <span class="req">*</span></label>'
      + '<input type="tel" class="input" data-field="contact_phone" value="' + esc(d.contact_phone) + '" placeholder="08xxxxxxxx" pattern="[-0-9 ]{8,15}">'
      + '<div class="field-hint">เบอร์ที่ติดต่อได้ระหว่างลา</div></div>';
  }
  function wizStep4() {
    var d = WIZ.data;
    var typeLabel = LMS.LEAVE_TYPE_LABEL[d.leave_type] || '-';
    var dur = leaveDuration(d);
    var html = wizSection('ตรวจสอบและส่งใบลา', 'ตรวจสอบความถูกต้องก่อนยื่น', 'check2-circle')
      + '<div id="wiz-confirm-wrap">'
      + '<table class="data-table" style="margin-bottom:14px">'
      + '<tbody>'
      + reviewRow('ประเภทการลา', '<strong>' + esc(typeLabel) + '</strong>')
      + reviewRow('เหตุผล', esc(d.reason || '-'))
      + reviewRow('ช่วงวันที่', TH.dateLong(d.start_date) + ' ถึง ' + TH.dateLong(d.end_date) + (d.leave_unit === 'hour' ? (' · ' + esc(d.start_time) + '-' + esc(d.end_time) + ' น.') : ''))
      + reviewRow('จำนวนลา', '<strong style="color:#024ad8;font-size:18px">' + esc(dur.label) + '</strong>')
      + reviewRow('เขียนที่', esc(d.written_place || '-'))
      + reviewRow('วันที่เขียน', TH.dateLong(d.written_at))
      + reviewRow('โทรศัพท์', esc(d.contact_phone || '-'))
      + '</tbody></table>'
      + '<div id="wiz-warn"></div>'
      + '<div id="wiz-last"></div>'
      + '</div>';
    return html;
  }
  function reviewRow(label, value) {
    return '<tr><td style="background:#f8fafc;width:35%;font-weight:600">' + esc(label) + '</td><td>' + value + '</td></tr>';
  }
  function daysBetween(s, e) {
    if (!s || !e) return 0;
    var d1 = new Date(String(s).substring(0,10) + 'T00:00:00');
    var d2 = new Date(String(e).substring(0,10) + 'T00:00:00');
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    
    var holidays = (LMS.Store.boot && LMS.Store.boot.holidays) || {};
    var count = 0;
    var d = new Date(d1.getTime());
    while (d.getTime() <= d2.getTime()) {
      var dow = d.getDay();
      var isWeekend = (dow === 0 || dow === 6);
      
      var y = d.getFullYear();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      var day = ('0' + d.getDate()).slice(-2);
      var dateStr = y + '-' + m + '-' + day;
      
      var isHoliday = (dateStr in holidays);
      if (!isWeekend && !isHoliday) {
        count++;
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  }
  function round2(n) {
    return Math.round(Number(n || 0) * 100) / 100;
  }
  function timeMinutes(t) {
    var m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function leaveDuration(d) {
    if (d.leave_unit === 'hour') {
      var sm = timeMinutes(d.start_time), em = timeMinutes(d.end_time);
      var hours = (sm == null || em == null || em <= sm) ? 0 : round2((em - sm) / 60);
      var days = round2(hours / 8);
      return { hours: hours, days: days, label: hours + ' ชั่วโมง (' + days + ' วัน)' };
    }
    var days = daysBetween(d.start_date, d.end_date);
    return { hours: days * 8, days: days, label: days + ' วัน' };
  }
  function captureWiz() {
    $$('#wiz-pane [data-field]').forEach(function (el) {
      WIZ.data[el.getAttribute('data-field')] = el.value;
    });
  }
  function validateStep(n) {
    var d = WIZ.data;
    var err = {};
    if (n === 1) {
      if (!d.leave_type) err.leave_type = 'กรุณาเลือกประเภทการลา';
      if (!d.reason || d.reason.trim().length < 3) err.reason = 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร';
    } else if (n === 2) {
      if (!d.start_date) err.start_date = 'ระบุวันเริ่ม';
      if (!d.end_date) err.end_date = 'ระบุวันสิ้นสุด';
      if (d.start_date && d.end_date && new Date(d.end_date) < new Date(d.start_date)) err.end_date = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
      if (d.leave_unit === 'hour') {
        if (d.end_date !== d.start_date) err.end_date = 'ลาเป็นชั่วโมงต้องอยู่ภายในวันเดียวกัน';
        if (!d.start_time) err.start_time = 'ระบุเวลาเริ่มลา';
        if (!d.end_time) err.end_time = 'ระบุเวลาสิ้นสุด';
        var sm = timeMinutes(d.start_time), em = timeMinutes(d.end_time);
        if (sm != null && sm < WORK_START_MINUTES) err.start_time = 'เวลาเริ่มลาต้องไม่ก่อน 08:30 น.';
        if (em != null && em > WORK_END_MINUTES) err.end_time = 'เวลาสิ้นสุดต้องไม่เกิน 20:00 น.';
        var dur = leaveDuration(d);
        if (d.start_time && d.end_time && dur.hours < 1) err.end_time = 'ต้องลาอย่างน้อย 1 ชั่วโมง';
      }
      if (!d.written_place) err.written_place = 'ระบุสถานที่เขียน';
    } else if (n === 3) {
      if (!d.contact_phone) err.contact_phone = 'ระบุหมายเลขโทรศัพท์';
    }
    return err;
  }
  function showStepErrors(errors) {
    $$('#wiz-pane .field').forEach(function (f) { f.classList.remove('has-error'); });
    $$('#wiz-pane .field-error').forEach(function (e) { e.remove(); });
    Object.keys(errors).forEach(function (key) {
      var input = $('#wiz-pane [data-field="' + key + '"]');
      if (!input) return;
      var f = input.closest('.field');
      if (!f) return;
      f.classList.add('has-error');
      var hint = f.querySelector('.field-hint');
      var err = document.createElement('div');
      err.className = 'field-error';
      err.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i> ' + esc(errors[key]);
      if (hint) f.insertBefore(err, hint); else f.appendChild(err);
    });
    var pane = $('#wiz-pane');
    if (pane) { pane.classList.add('is-shake'); setTimeout(function () { pane.classList.remove('is-shake'); }, 500); }
    var firstKey = Object.keys(errors)[0];
    var firstInput = firstKey && $('#wiz-pane [data-field="' + firstKey + '"]');
    if (firstInput) try { firstInput.focus(); } catch (e) {}
    toast('กรุณาแก้ไข ' + Object.keys(errors).length + ' รายการ', 'warning');
  }
  function wireWizard() {
    // step jumps
    $$('.wiz-step').forEach(function (s) {
      s.addEventListener('click', function () {
        var n = Number(s.getAttribute('data-jump'));
        if (n < WIZ.step) { captureWiz(); WIZ.step = n; renderWizard(); }
        else if (n === WIZ.step) return;
        else {
          captureWiz();
          var err = validateStep(WIZ.step);
          if (Object.keys(err).length) { showStepErrors(err); return; }
          WIZ.step = n; renderWizard();
        }
      });
    });
    var prev = $('#wiz-prev'); if (prev) prev.addEventListener('click', function () { captureWiz(); WIZ.step--; renderWizard(); });
    var next = $('#wiz-next'); if (next) next.addEventListener('click', function () {
      captureWiz();
      var err = validateStep(WIZ.step);
      if (Object.keys(err).length) { showStepErrors(err); return; }
      WIZ.step++; renderWizard();
    });
    var submit = $('#wiz-submit'); if (submit) submit.addEventListener('click', function () {
      captureWiz();
      // Validate all steps
      for (var s = 1; s <= 3; s++) {
        var err = validateStep(s);
        if (Object.keys(err).length) { WIZ.step = s; renderWizard(); setTimeout(function () { showStepErrors(err); }, 100); return; }
      }
      submitLeave();
    });
    // step 1 — leave-type cards
    $$('.lt-card').forEach(function (c) {
      c.addEventListener('click', function () {
        $$('.lt-card').forEach(function (x) { x.classList.remove('is-selected'); });
        c.classList.add('is-selected');
        WIZ.data.leave_type = c.getAttribute('data-type');
      });
    });
    // step 2 — live preview
    if (WIZ.step === 2) {
      function updatePreview() {
        captureWiz();
        var d = WIZ.data;
        if (d.leave_unit === 'hour') d.end_date = d.start_date;
        var s = TH.dateLong(d.start_date), e = TH.dateLong(d.end_date);
        var dur = leaveDuration(d);
        var html = '<i class="bi bi-calendar3"></i> ' + s + ' — ' + e
          + (d.leave_unit === 'hour' ? ' · ' + esc(d.start_time || '') + '-' + esc(d.end_time || '') + ' น.' : '')
          + ' <strong style="color:#024ad8;font-size:16px;margin-left:6px">' + esc(dur.label) + '</strong>';
        $('#wiz-preview').innerHTML = html;
        var endEl = $('#wiz-pane [data-field="end_date"]');
        if (endEl && d.leave_unit === 'hour') endEl.value = d.start_date;
        var timeRow = $('#time-row');
        if (timeRow) timeRow.style.display = d.leave_unit === 'hour' ? '' : 'none';
      }
      $$('#wiz-pane [data-field]').forEach(function (el) { el.addEventListener('input', updatePreview); el.addEventListener('change', updatePreview); });
      updatePreview();
    }
    // step 4 — fetch preview (limit warn)
    if (WIZ.step === 4) {
      Spinner.show('กำลังตรวจสอบสิทธิ...', { stages: ['อ่านสถิติ','คำนวณยอดคงเหลือ'] });
      call('leave.preview', WIZ.data).then(function (pv) {
        Spinner.hide();
        var warnHtml = '';
        if (pv.over) {
          warnHtml = '<div style="margin-top:10px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#fef2f2,#fff);border-left:4px solid #ef4444">'
            + '<strong style="color:#b91c1c"><i class="bi bi-exclamation-octagon-fill"></i> เกินสิทธิ!</strong> '
            + 'ใช้ ' + pv.after_used + ' วัน · เกินสิทธิ ' + pv.stats.items[pv.leave_type].limit + ' วัน '
            + '(จะเหลือ ' + pv.after_remaining + ' วัน)</div>';
        } else if (pv.warn) {
          warnHtml = '<div style="margin-top:10px;padding:14px;border-radius:12px;background:linear-gradient(135deg,#fef3c7,#fff);border-left:4px solid #f59e0b">'
            + '<strong style="color:#b45309"><i class="bi bi-exclamation-triangle-fill"></i> ใกล้หมดสิทธิ!</strong> '
            + 'หลังลาครั้งนี้จะใช้ไป ' + pv.after_used + ' จาก ' + pv.stats.items[pv.leave_type].limit + ' วัน '
            + '(เหลือ <strong>' + pv.after_remaining + '</strong> วัน)</div>';
        }
        var w = $('#wiz-warn'); if (w) w.innerHTML = warnHtml;
        // Last leave
        if (pv.last_leave) {
          var ll = pv.last_leave;
          var lh = '<div style="margin-top:10px;padding:12px 14px;border-radius:10px;background:#f1f5f9;font-size:12.5px;color:#475569">'
            + '<strong>การลาครั้งสุดท้าย</strong>: ' + esc(LMS.LEAVE_TYPE_LABEL[ll.leave_type]) + ' '
            + TH.date(ll.start_date) + ' — ' + TH.date(ll.end_date) + timeRangeLabel(ll) + ' (' + durationLabel(ll) + ') '
            + '— ระบบจะแนบข้อมูลนี้ในใบลาให้อัตโนมัติ</div>';
          var l = $('#wiz-last'); if (l) l.innerHTML = lh;
        }
      }).catch(function (e) { Spinner.hide(); /* silent */ });
    }
  }
  function submitLeave() {
    Spinner.show('กำลังส่งใบลา...', { stages: ['ตรวจสอบข้อมูล','บันทึกใบลา','แจ้งผู้บังคับบัญชา'] });
    call('leave.create', WIZ.data).then(function (res) {
      Spinner.hide();
      var lv = res.leave;
      var msg = 'เลขที่ใบลา: <strong>' + esc(lv.leave_no) + '</strong><br>'
        + 'ระบบจะส่งใบลาเข้าสู่ขั้นตอนการตรวจสอบทันที';
      if (res.over_limit) msg += '<br><br><span style="color:#dc2626"><i class="bi bi-exclamation-triangle-fill"></i> ใบลานี้เกินสิทธิที่กำหนด — รออนุมัติพิเศษจากผู้บังคับบัญชา</span>';
      Swal.fire({
        icon: 'success', title: 'ส่งใบลาเรียบร้อย!',
        html: '<div style="font-size:14px;color:#475569">' + msg + '</div>',
        confirmButtonText: 'ดูใบลา', showCancelButton: true, cancelButtonText: 'กลับหน้าแรก',
        reverseButtons: true
      }).then(function (r) {
        if (r.isConfirmed) location.hash = '#/leaves/view?id=' + lv.id;
        else location.hash = '#/dashboard';
      });
    }).catch(function (e) { Spinner.hide(); alertError('ไม่สามารถส่งใบลาได้', e.message); });
  }
  // ── My Leaves ──────────────────────────────────────
  Routes['#/leaves/mine'] = function () { renderLeavesList('mine', 'ใบลาของฉัน'); };
  Routes['#/leaves/all'] = function () {
    if (!hasCap('leave.view_all')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    renderLeavesList('all', 'รายการใบลาทั้งหมด');
  };
  Routes['#/leaves/inbox'] = function () {
    if (!hasCap('leave.check|leave.comment|leave.approve')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    renderLeavesList('pending_action', 'งานที่รอดำเนินการ');
  };
  function renderLeavesList(scope, title) {
    var st = { scope: scope, q: '', status: '', leave_type: '', page: 1 };
    setPage(toolbarHtml(scope) + '<div id="lv-list">' + skBlocks(4, 90) + '</div>' + '<div id="lv-pager" style="margin-top:14px"></div>');
    function load() {
      Spinner.show('กำลังโหลด...', { stages: ['อ่านข้อมูล','จัดเรียง','แสดงผล'] });
      call('leave.list', st).then(function (r) {
        Spinner.hide();
        var html = (r.items.length === 0) ? emptyState('inbox', 'ไม่พบใบลา') : leaveCardList(r.items);
        $('#lv-list').innerHTML = html;
        $('#lv-pager').innerHTML = pagerHtml(r);
        wirePager(r, function (n) { st.page = n; load(); });
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    function wireToolbar() {
      var search = $('#lv-q'); if (search) {
        var t;
        search.addEventListener('input', function () {
          clearTimeout(t); t = setTimeout(function () { st.q = search.value; st.page = 1; load(); }, 300);
        });
      }
      var status = $('#lv-status'); if (status) status.addEventListener('change', function () { st.status = status.value; st.page = 1; load(); });
      var type = $('#lv-type'); if (type) type.addEventListener('change', function () { st.leave_type = type.value; st.page = 1; load(); });
      var add = $('#lv-add'); if (add) add.addEventListener('click', function () { location.hash = '#/leaves/new'; });
    }
    wireToolbar();
    load();
  }
  function toolbarHtml(scope) {
    var statuses = LMS.Store.boot.statuses || {};
    var types = LMS.LEAVE_TYPE_LABEL;
    var addBtn = (scope !== 'pending_action' && hasCap('leave.create_own'))
      ? '<button class="btn btn-primary" id="lv-add"><i class="bi bi-plus-lg"></i> ยื่นใบลาใหม่</button>' : '';
    return '<div class="toolbar">'
      + '<div class="search-box"><i class="bi bi-search"></i><input type="text" id="lv-q" placeholder="ค้นหา ชื่อ เลขที่ เหตุผล..."></div>'
      + '<select class="select" id="lv-status" style="max-width:200px"><option value="">ทุกสถานะ</option>'
      + Object.keys(statuses).map(function (s) { return '<option value="' + s + '">' + esc(statuses[s]) + '</option>'; }).join('')
      + '</select>'
      + '<select class="select" id="lv-type" style="max-width:180px"><option value="">ทุกประเภท</option>'
      + Object.keys(types).map(function (t) { return '<option value="' + t + '">' + esc(types[t]) + '</option>'; }).join('')
      + '</select>'
      + addBtn
      + '</div>';
  }
  function pagerHtml(r) {
    if (r.pages <= 1) return '';
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:6px">';
    for (var i = 1; i <= r.pages; i++) {
      var active = i === r.page ? ' btn-primary' : ' btn-ghost';
      html += '<button class="btn btn-sm' + active + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '</div>';
    return html;
  }
  function wirePager(r, cb) {
    $$('#lv-pager [data-page]').forEach(function (b) {
      b.addEventListener('click', function () { cb(Number(b.getAttribute('data-page'))); });
    });
  }
  // ── Leave Detail (view) ────────────────────────────
  Routes['#/leaves/view'] = function (hash) {
    var id = (hash || location.hash).split('?id=')[1] || '';
    if (!id) { toast('ไม่พบใบลา', 'error'); location.hash = '#/leaves/mine'; return; }
    setPage(skBlocks(1, 200) + skBlocks(2, 100));
    Spinner.show('กำลังโหลด...', { stages: ['อ่านข้อมูล','โหลดประวัติ'] });
    call('leave.get', { id: id }).then(function (data) {
      Spinner.hide();
      renderLeaveDetail(data);
    }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
  };
  function renderLeaveDetail(data) {
    var lv = data.leave;
    var u = lv.requester || {};
    var initial = (u.full_name || '?').substring(0,1).toUpperCase();
    var avatar = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : initial;
    var me = LMS.Store.user || {};
    var isMine = String(lv.requester_id) === String(me.id);
    // Workflow timeline
    var wfHtml = renderWorkflow(lv);
    var actionHtml = renderActions(lv, isMine);
    var html = '<div class="card" style="margin-bottom:14px">'
      + '<div class="hero" style="margin:0;border-radius:16px 16px 0 0">'
      + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      + '  <div style="font-size:24px;font-weight:800">' + esc(lv.leave_no) + '</div>'
      + '  <span class="badge" style="background:rgba(255,255,255,.18);color:#fff">' + esc(lv.leave_type_label) + '</span>'
      + '  <span class="badge" style="background:rgba(255,255,255,.18);color:#fff;font-weight:700">' + esc(lv.status_label) + '</span>'
      + '  <div style="margin-left:auto">'
      + '    <a href="#/leaves/print?id=' + esc(lv.id) + '" class="btn" style="background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3)"><i class="bi bi-printer-fill"></i> พิมพ์ใบลา</a>'
      + '  </div>'
      + '</div>'
      + '<div class="hero-kpi" style="margin-top:14px">'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-calendar-range"></i> ช่วงวันที่</div><div class="hkpi-value" style="font-size:18px">' + TH.date(lv.start_date) + ' → ' + TH.date(lv.end_date) + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-clock"></i> จำนวนลา</div><div class="hkpi-value">' + durationLabel(lv) + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-calendar-event"></i> เขียนเมื่อ</div><div class="hkpi-value" style="font-size:16px">' + TH.date(lv.written_at) + '</div></div>'
      + '</div>'
      + '</div>'
      + '<div class="card-body">'
      + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #e2e8f0">'
      + '  <div class="lv-avatar" style="width:56px;height:56px;font-size:22px">' + avatar + '</div>'
      + '  <div style="flex:1;min-width:0">'
      + '    <div style="font-weight:700;font-size:16px">' + esc(u.full_name) + '</div>'
      + '    <div style="font-size:12px;color:#64748b">' + esc(u.position || '-') + ' · ' + esc(u.department || '-') + '</div>'
      + '    <span class="role-chip role-chip-' + esc(u.role) + '" style="margin-top:4px"><i class="bi bi-shield-check"></i> ' + esc((LMS.Store.boot.roles||{})[u.role]||u.role) + '</span>'
      + '  </div>'
      + '</div>'
      + '<div class="grid-2">'
      + detailField('เหตุผลการลา', esc(lv.reason))
      + detailField('ปีงบประมาณ', lv.fiscal_year_be || (Number(lv.fiscal_year)+543))
      + detailField('เขียนที่', esc(lv.written_place || '-'))
      + detailField('เลขที่ใบลา', '<code>' + esc(lv.leave_no) + '</code>')
      + detailField('โทรศัพท์', esc(lv.contact_phone || '-'))
      + '</div>';
    if (lv.last_leave_start) {
      html += '<div style="margin-top:14px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:13px;color:#475569">'
        + '<strong><i class="bi bi-clock-history"></i> การลาครั้งสุดท้าย:</strong> '
        + esc(LMS.LEAVE_TYPE_LABEL[lv.last_leave_type] || lv.last_leave_type) + ' · '
        + TH.date(lv.last_leave_start) + ' — ' + TH.date(lv.last_leave_end) + ' (' + lv.last_leave_days + ' วัน)</div>';
    }
    html += '</div></div>'
      + '<div class="grid-2">'
      + '<div class="card"><div class="card-head"><i class="bi bi-diagram-3-fill" style="color:#024ad8"></i> <span class="card-title">สถานะการอนุมัติ</span></div>'
      + '<div class="card-body">' + wfHtml + '</div></div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-list-check" style="color:#296ef9"></i> <span class="card-title">การดำเนินการ</span></div>'
      + '<div class="card-body">' + actionHtml + '</div></div>'
      + '</div>';
    setPage(html);
    wireDetailActions(lv, isMine);
  }
  function detailField(label, value) {
    return '<div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">' + esc(label) + '</div>'
      + '<div style="font-size:13.5px;color:#0f172a">' + value + '</div></div>';
  }
  function _approvalStages_() {
    var s = (LMS.Store.boot && LMS.Store.boot.settings && LMS.Store.boot.settings.approval_stages) || '3';
    var n = Number(s);
    return (n === 1 || n === 2 || n === 3) ? n : 3;
  }
  function renderWorkflow(lv) {
    var stages = _approvalStages_();
    var allSteps = {
      submit:  { title: 'ผู้ลายื่นใบลา', icon: 'send-fill', user: lv.requester ? lv.requester.full_name : '', at: lv.created_at, comment: '' },
      check:   { title: 'เจ้าหน้าที่ตรวจสอบ', icon: 'shield-check', user: lv.checker ? lv.checker.full_name : '', at: lv.checker_at, comment: lv.checker_comment },
      comment: { title: 'ความเห็นผู้บังคับบัญชา', icon: 'briefcase-fill', user: lv.supervisor ? lv.supervisor.full_name : '', at: lv.supervisor_at, comment: lv.supervisor_comment },
      approve: { title: 'ฝ่ายบุคคล', icon: 'mortarboard-fill', user: lv.approver ? lv.approver.full_name : '', at: lv.approver_at, comment: lv.approver_comment }
    };
    // เลือก steps ที่ใช้ตาม stages — แต่ถ้า lv มี checker/supervisor data ค้างอยู่ (จาก stages เก่า) → แสดงด้วย
    var stepKeys = ['submit'];
    if (stages >= 3 || lv.checker_id) stepKeys.push('check');
    if (stages >= 2 || lv.supervisor_id) stepKeys.push('comment');
    stepKeys.push('approve');
    // flow order — ใช้ตรวจ done/active ตาม stages
    var statusOrder;
    if (stages === 1) statusOrder = ['pending', 'approved'];
    else if (stages === 2) statusOrder = ['pending', 'reviewed', 'approved'];
    else statusOrder = ['pending', 'checked', 'reviewed', 'approved'];
    var currentIdx = statusOrder.indexOf(lv.status);
    return '<div class="wf-timeline">' + stepKeys.map(function (key) {
      var s = allSteps[key];
      var done = false, active = false, rejected = false;
      if (key === 'submit') done = true;
      else if (key === 'check') {
        done = !!lv.checker_id;
        active = (lv.status === 'pending' && stages >= 3 && !lv.checker_id);
      } else if (key === 'comment') {
        done = !!lv.supervisor_id;
        active = ((lv.status === 'checked' || (stages === 2 && lv.status === 'pending')) && !lv.supervisor_id);
      } else if (key === 'approve') {
        done = lv.status === 'approved';
        rejected = lv.status === 'rejected';
        active = (lv.status === 'reviewed' || (stages === 1 && lv.status === 'pending'));
      }
      var cls = done ? 'is-done' : (active ? 'is-active' : (rejected ? 'is-rejected' : ''));
      var icon = rejected ? 'x-lg' : (done ? 'check-lg' : s.icon);
      return '<div class="wf-step ' + cls + '">'
        + '<div class="wf-step-icon"><i class="bi bi-' + icon + '"></i></div>'
        + '<div class="wf-step-body">'
        + '<div class="wf-step-title">' + esc(s.title) + (s.user ? ' · ' + esc(s.user) : '') + '</div>'
        + (s.at ? '<div class="wf-step-meta"><i class="bi bi-clock"></i> ' + TH.dateTime(s.at) + '</div>' : '')
        + (s.comment ? '<div class="wf-step-comment">' + esc(s.comment) + '</div>' : '')
        + '</div></div>';
    }).join('') + '</div>';
  }
  function renderActions(lv, isMine) {
    var actions = [];
    var stages = _approvalStages_();
    if (isMine && (lv.status === 'draft' || lv.status === 'pending')) {
      actions.push('<button class="btn btn-warning" data-act="cancel"><i class="bi bi-x-circle-fill"></i> ยกเลิกใบลา</button>');
    }
    // Check action — ใช้ได้เฉพาะ stages = 3 + สถานะ pending
    if (stages >= 3 && lv.status === 'pending' && hasCap('leave.check')) {
      actions.push('<button class="btn btn-primary" data-act="check"><i class="bi bi-shield-check"></i> ตรวจสอบ</button>');
    }
    // Comment (supervisor) — stages >= 2, สถานะ checked (stages=3) หรือ pending (stages=2)
    if (stages >= 2 && hasCap('leave.comment')) {
      var canComment = (lv.status === 'checked') || (stages === 2 && lv.status === 'pending');
      if (canComment) {
        actions.push('<button class="btn btn-primary" data-act="comment"><i class="bi bi-chat-text-fill"></i> ให้ความเห็น</button>');
      }
    }
    // Approve — ขั้นสุดท้ายเสมอ
    if (hasCap('leave.approve')) {
      var canApprove = false;
      if (stages === 1) canApprove = (lv.status === 'pending');
      else if (stages === 2) canApprove = (lv.status === 'reviewed' || lv.status === 'pending' || lv.status === 'checked');
      else canApprove = (lv.status === 'reviewed' || lv.status === 'checked');
      if (canApprove) {
        actions.push('<button class="btn btn-success" data-act="approve"><i class="bi bi-check-circle-fill"></i> อนุมัติ</button>');
        actions.push('<button class="btn btn-danger" data-act="reject"><i class="bi bi-x-circle-fill"></i> ไม่อนุมัติ</button>');
      }
    }
    if (hasCap('leave.delete')) {
      actions.push('<button class="btn btn-ghost" data-act="delete" style="color:#dc2626"><i class="bi bi-trash-fill"></i> ลบ</button>');
    }
    actions.push('<a href="#/leaves/print?id=' + esc(lv.id) + '" class="btn btn-ghost"><i class="bi bi-printer-fill"></i> พิมพ์</a>');
    if (actions.length === 0) return '<div style="color:#94a3b8;font-size:13px">ยังไม่มีการดำเนินการที่คุณทำได้</div>';
    return '<div style="display:flex;flex-wrap:wrap;gap:8px">' + actions.join('') + '</div>';
  }
  function wireDetailActions(lv, isMine) {
    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'cancel') {
          confirmModal({ title: 'ยกเลิกใบลา?', message: 'การยกเลิกจะทำให้ใบลานี้ใช้ไม่ได้อีก', okText: 'ยกเลิกใบลา', danger: true })
            .then(function (ok) {
              if (!ok) return;
              Spinner.show('กำลังยกเลิก...');
              call('leave.cancel', { id: lv.id }).then(function () { Spinner.hide(); toast('ยกเลิกแล้ว', 'success'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
            });
        } else if (act === 'check') {
          openCommentModal('ตรวจสอบใบลา', 'ความเห็นการตรวจสอบ (ถ้ามี)', function (comment) {
            Spinner.show('กำลังบันทึก...');
            call('leave.check', { id: lv.id, comment: comment }).then(function () { Spinner.hide(); Modal.close(); alertSuccess('สำเร็จ', 'ส่งใบลาให้ผู้บังคับบัญชาแล้ว'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
          });
        } else if (act === 'comment') {
          openCommentModal('ความเห็นผู้บังคับบัญชา', 'กรอกความเห็นเพื่อส่งต่อให้ผู้อนุมัติ', function (comment) {
            Spinner.show('กำลังบันทึก...');
            call('leave.comment', { id: lv.id, comment: comment }).then(function () { Spinner.hide(); Modal.close(); alertSuccess('สำเร็จ', 'ส่งความเห็นให้ผู้อนุมัติแล้ว'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
          }, true);
        } else if (act === 'approve') {
          openCommentModal('อนุมัติใบลา', 'หมายเหตุ (ถ้ามี)', function (comment) {
            Spinner.show('กำลังอนุมัติ...');
            call('leave.approve', { id: lv.id, decision: 'approved', comment: comment }).then(function () { Spinner.hide(); Modal.close(); Swal.fire({ icon: 'success', title: 'อนุมัติแล้ว!', timer: 2000, showConfirmButton: false, timerProgressBar: true }); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
          });
        } else if (act === 'reject') {
          openCommentModal('ไม่อนุมัติใบลา', 'เหตุผลที่ไม่อนุมัติ (กรุณาระบุ)', function (comment) {
            if (!comment.trim()) { toast('กรุณาระบุเหตุผล', 'warning'); return; }
            Spinner.show('กำลังบันทึก...');
            call('leave.approve', { id: lv.id, decision: 'rejected', comment: comment }).then(function () { Spinner.hide(); Modal.close(); toast('บันทึกการไม่อนุมัติแล้ว', 'warning'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
          }, true);
        } else if (act === 'delete') {
          confirmModal({ title: 'ลบใบลานี้?', message: 'การลบไม่สามารถย้อนกลับได้', okText: 'ลบ', danger: true })
            .then(function (ok) {
              if (!ok) return;
              Spinner.show('กำลังลบ...');
              call('leave.delete', { id: lv.id }).then(function () { Spinner.hide(); toast('ลบแล้ว', 'success'); location.hash = '#/leaves/all'; }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
            });
        }
      });
    });
  }
  function openCommentModal(title, placeholder, cb, required) {
    Modal.open({
      title: title,
      html: '<div class="field"><label>ความเห็น' + (required ? ' <span class="req">*</span>' : '') + '</label>'
        + '<textarea id="cm-text" class="textarea" placeholder="' + esc(placeholder) + '" rows="4"></textarea></div>',
      footer: '<button class="btn btn-ghost" data-modal-close>ยกเลิก</button>'
        + '<button class="btn btn-primary" id="cm-ok"><i class="bi bi-check-lg"></i> ยืนยัน</button>',
      onOpen: function () {
        $('#cm-ok').addEventListener('click', function () { cb($('#cm-text').value); });
        try { $('#cm-text').focus(); } catch (e) {}
      }
    });
  }
  // ── Print Form (HTML matching the PDF form) ────────
  Routes['#/leaves/print'] = function (hash) {
    var id = (hash || location.hash).split('?id=')[1] || '';
    if (!id) { toast('ไม่พบใบลา', 'error'); location.hash = '#/leaves/mine'; return; }
    setPage(skBlocks(1, 600));
    Spinner.show('กำลังเตรียมเอกสาร...');
    call('leave.get', { id: id }).then(function (data) {
      Spinner.hide();
      renderPrintForm(data);
    }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
  };
  function renderPrintForm(data) {
    var lv = data.leave;
    var org = data.org || {};
    var u = lv.requester || {};
    var stats = null;
    Spinner.show('กำลังคำนวณสถิติ...');
    call('leave.user_stats', { user_id: lv.requester_id, fiscal_year: lv.fiscal_year }).then(function (s) {
      Spinner.hide();
      stats = s;
      doRender();
    }).catch(function (e) { Spinner.hide(); doRender(); });
    function doRender() {
      var ws = TH.splitDate(lv.written_at);
      var ss = TH.splitDate(lv.start_date);
      var es = TH.splitDate(lv.end_date);
      var checkSick = lv.leave_type === 'sick' ? ' checked' : '';
      var checkPersonal = lv.leave_type === 'personal' ? ' checked' : '';
      var checkAnnual = lv.leave_type === 'annual' ? ' checked' : '';
      var orderApproved = lv.status === 'approved' ? ' checked' : '';
      var orderRejected = lv.status === 'rejected' ? ' checked' : '';
      // สถิติ
      function statRow(typeKey, label) {
        var s = (stats && stats.items && stats.items[typeKey]) || { used: 0, limit: 0 };
        var prevUsed = Math.max(0, s.used - (lv.status === 'approved' ? Number(lv.days || 0) : 0));
        var thisLeave = (lv.leave_type === typeKey) ? Number(lv.days || 0) : 0;
        var total = prevUsed + thisLeave;
        return '<tr><td>' + label + '</td><td>' + (prevUsed || '') + '</td><td>' + (thisLeave || '') + '</td><td>' + (total || '') + '</td></tr>';
      }
      var subject = (lv.leave_type === 'annual') ? 'ขออนุญาตลาพักร้อน' : (lv.leave_type === 'sick' ? 'ขออนุญาตลาป่วย' : 'ขออนุญาตลากิจส่วนตัว');
      var addressee = 'ฝ่ายบุคคล' + (org.name ? esc(org.name) : 'บริษัท');
      var supervisorName = lv.supervisor ? lv.supervisor.full_name : '';
      var supervisorPos  = lv.supervisor ? lv.supervisor.position : '';
      var supervisorAt   = lv.supervisor_at ? TH.splitDate(lv.supervisor_at) : null;
      var supervisorComment = lv.supervisor_comment || '';
      var checkerName = lv.checker ? lv.checker.full_name : '';
      var checkerPos  = lv.checker ? lv.checker.position : '';
      var checkerAt   = lv.checker_at ? TH.splitDate(lv.checker_at) : null;
      var approverName = lv.approver ? lv.approver.full_name : '';
      var approverPos  = lv.approver ? lv.approver.position : '';
      var approverAt   = lv.approver_at ? TH.splitDate(lv.approver_at) : null;
      var approverComment = lv.approver_comment || '';
      var html = '<div class="no-print" style="margin-bottom:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">'
        + '<button class="btn btn-ghost" onclick="history.back()"><i class="bi bi-arrow-left"></i> กลับ</button>'
        + '<button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer-fill"></i> พิมพ์เอกสาร</button>'
        + '</div>'
        + '<div class="printable">'
        + '<div class="pf-title">แบบใบลาป่วย ลาพักร้อน ลากิจส่วนตัว</div>'
        + '<div class="pf-right">วันที่ <span class="pf-fill" style="min-width:30px">' + (ws.day || '') + '</span> เดือน <span class="pf-fill" style="min-width:80px">' + (ws.monthName || '') + '</span> พ.ศ. <span class="pf-fill" style="min-width:40px">' + (ws.beYear || '') + '</span></div>'
        + '<div class="pf-line" style="margin-top:14pt"><strong>เรื่อง</strong> <span style="margin-left:24pt">' + esc(subject) + '</span></div>'
        + '<div class="pf-line"><strong>เรียน</strong> <span style="margin-left:24pt">' + esc(addressee) + '</span></div>'
        + '<div class="pf-line" style="margin-top:14pt; text-indent: 28pt;">'
        + 'ข้าพเจ้า <span class="pf-fill" style="min-width:280px">' + esc(u.full_name || '') + '</span>'
        + ' ตำแหน่ง <span class="pf-fill" style="min-width:200px">' + esc(u.position || '') + '</span>'
        + '</div>'
        + '<div class="pf-line">ระดับ <span class="pf-fill" style="min-width:120px">' + esc(u.level || '') + '</span>'
        + ' สังกัด <span class="pf-fill" style="min-width:380px">' + esc(u.department || '') + '</span></div>'
        + '<div class="pf-line" style="margin-top:8pt">'
        + 'ขอลา <span class="pf-check' + checkSick + '"></span> ป่วย '
        + ' <span class="pf-check' + checkPersonal + '"></span> กิจส่วนตัว '
        + ' <span class="pf-check' + checkAnnual + '"></span> พักร้อน '
        + ' เนื่องจาก <span class="pf-fill" style="min-width:380px">' + esc(lv.reason || '') + '</span>'
        + '</div>'
        + '<div class="pf-line">ตั้งแต่วันที่ <span class="pf-fill" style="min-width:30px">' + (ss.day || '') + '</span>'
        + ' เดือน <span class="pf-fill" style="min-width:80px">' + (ss.monthName || '') + '</span>'
        + ' พ.ศ. <span class="pf-fill" style="min-width:40px">' + (ss.beYear || '') + '</span></div>'
        + '<div class="pf-line">ถึงวันที่ <span class="pf-fill" style="min-width:30px">' + (es.day || '') + '</span>'
        + ' เดือน <span class="pf-fill" style="min-width:80px">' + (es.monthName || '') + '</span>'
        + ' พ.ศ. <span class="pf-fill" style="min-width:40px">' + (es.beYear || '') + '</span>'
        + ' มีกำหนด <span class="pf-fill" style="min-width:100px">' + durationLabel(lv) + '</span></div>'
        + '<div class="pf-line">หมายเลขโทรศัพท์ <span class="pf-fill" style="min-width:200px">' + esc(lv.contact_phone || '') + '</span></div>'
        + '<div style="display:flex;justify-content:flex-end;margin-top:12pt;padding-right:20px">'
        + '<div class="pf-sig-group">'
        + '<div class="pf-sig-line"><span class="pf-sig-label">ลงชื่อ</span><span class="pf-sig-fill"></span></div>'
        + '<div class="pf-sig-name-container">(<span class="pf-sig-fill" style="min-width:180px">' + esc(u.full_name || '') + '</span>)</div>'
        + '</div>'
        + '</div>'
        // Grid block for Supervisor and HR
        + '<div class="pf-grid-2col">'
        + '<div>'
        + '<div class="pf-comment-title">หัวหน้างาน</div>'
        + '<div style="min-height:60pt;border-bottom:1px dotted #000;margin-bottom:8pt">' + esc(supervisorComment || '') + '</div>'
        + '<div class="pf-sig-block">'
        + '<div class="pf-sig-group">'
        + '<div class="pf-sig-line"><span class="pf-sig-label">(ลงชื่อ)</span><span class="pf-sig-fill"></span></div>'
        + '<div class="pf-sig-name-container">(<span class="pf-sig-fill" style="min-width:180px">' + esc(supervisorName || '') + '</span>)</div>'
        + '<div class="pf-sig-line"><span class="pf-sig-label">ตำแหน่ง</span><span class="pf-sig-fill">' + esc(supervisorPos || '') + '</span></div>'
        + '<div class="pf-sig-line"><span class="pf-sig-label">วันที่</span>'
        + '<span class="pf-sig-fill" style="min-width:30px;flex-grow:0">' + (supervisorAt ? supervisorAt.day : '') + '</span> /'
        + ' <span class="pf-sig-fill" style="min-width:50px;flex-grow:1">' + (supervisorAt ? (supervisorAt.monthShort||'').replace('.','') : '') + '</span> /'
        + ' <span class="pf-sig-fill" style="min-width:40px;flex-grow:0">' + (supervisorAt ? supervisorAt.beYear : '') + '</span></div>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '<div>'
        + '<div class="pf-comment-title">ฝ่ายทรัพยากรบุคคล</div>'
        + '<div style="min-height:60pt;border-bottom:1px dotted #000;margin-bottom:8pt">' + esc(approverComment || '') + '</div>'
        + '<div class="pf-sig-block">'
        + '<div class="pf-sig-group">'
        + '<div class="pf-sig-line"><span class="pf-sig-label">(ลงชื่อ)</span><span class="pf-sig-fill"></span></div>'
        + '<div class="pf-sig-name-container">(<span class="pf-sig-fill" style="min-width:180px">' + esc(approverName || '') + '</span>)</div>'
        + '<div class="pf-sig-line"><span class="pf-sig-label">ตำแหน่ง</span><span class="pf-sig-fill">' + esc(approverPos || '') + '</span></div>'
        + '<div class="pf-sig-line"><span class="pf-sig-label">วันที่</span>'
        + '<span class="pf-sig-fill" style="min-width:30px;flex-grow:0">' + (approverAt ? approverAt.day : '') + '</span> /'
        + ' <span class="pf-sig-fill" style="min-width:50px;flex-grow:1">' + (approverAt ? (approverAt.monthShort||'').replace('.','') : '') + '</span> /'
        + ' <span class="pf-sig-fill" style="min-width:40px;flex-grow:0">' + (approverAt ? approverAt.beYear : '') + '</span></div>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'
        // Stats block at the bottom
        + '<div style="margin-top:20pt">'
        + '<div class="pf-comment-title">สถิติการลาในปีงบประมาณนี้</div>'
        + '<div class="pf-stats" style="margin-top:4pt;max-width:480px">'
        + '<table>'
        + '<tr><th>ประเภท</th><th>ลามาแล้ว</th><th>ลาครั้งนี้</th><th>รวมเป็น</th></tr>'
        + statRow('sick', 'ลาป่วย')
        + statRow('personal', 'ลากิจ')
        + statRow('annual', 'ลาพักร้อน')
        + '</table>'
        + '</div>'
        + '</div>'
        + '</div>';
      setPage(html);
    }
  }
  // ── Reports ────────────────────────────────────────
  Routes['#/reports'] = function () {
    if (!hasCap('report.view_own')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    var canAll = hasCap('report.view_all');
    var st = { tab: canAll ? 'overview' : 'mine', selected_user_id: LMS.Store.user.id, fy: '' };
    function render() {
      var tabsHtml = '';
      if (canAll) {
        tabsHtml = '<div class="toolbar">'
          + '<div style="display:flex;gap:6px;background:#f1f5f9;padding:3px;border-radius:10px">'
          + '<button class="btn btn-sm ' + (st.tab === 'overview' ? 'btn-primary' : 'btn-ghost') + '" data-tab="overview"><i class="bi bi-bar-chart"></i> ภาพรวม</button>'
          + '<button class="btn btn-sm ' + (st.tab === 'mine' ? 'btn-primary' : 'btn-ghost') + '" data-tab="mine"><i class="bi bi-person"></i> รายบุคคล</button>'
          + '</div>'
          + '<button class="btn btn-ghost" onclick="window.print()" style="margin-left:auto"><i class="bi bi-printer"></i> พิมพ์</button>'
          + '</div>';
      }
      setPage(tabsHtml + '<div id="rpt-content">' + skBlocks(2, 200) + '</div>');
      $$('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { st.tab = b.getAttribute('data-tab'); render(); }); });
      if (st.tab === 'overview') loadOverview();
      else loadMine();
    }
    function loadOverview() {
      Spinner.show('กำลังโหลดรายงาน...', { stages: ['อ่านข้อมูล','คำนวณสถิติ','จัดทำกราฟ'] });
      call('report.overview', {}).then(function (d) {
        Spinner.hide();
        renderOverview(d);
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    function loadMine() {
      Spinner.show('กำลังโหลดรายงาน...');
      call('report.user', { user_id: st.selected_user_id }).then(function (d) {
        Spinner.hide();
        renderUserReport(d, canAll);
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    function renderOverview(d) {
      var statHtml = ''
        + statBox('ทั้งหมด', d.total, 'inbox-fill', 'indigo')
        + statBox('อนุมัติแล้ว', d.by_status.approved || 0, 'check-circle-fill', 'emerald')
        + statBox('รอดำเนินการ', (d.by_status.pending||0) + (d.by_status.checked||0) + (d.by_status.reviewed||0), 'hourglass-split', 'amber')
        + statBox('ไม่อนุมัติ', d.by_status.rejected || 0, 'x-circle-fill', 'rose');
      var typeRows = Object.keys(d.by_type).map(function (k) {
        var t = d.by_type[k];
        return '<tr><td>' + esc(LMS.LEAVE_TYPE_LABEL[k]) + '</td><td style="text-align:right">' + t.count + '</td><td style="text-align:right">' + t.days + '</td></tr>';
      }).join('');
      var deptRows = Object.keys(d.by_dept).sort(function (a, b) { return d.by_dept[b].days - d.by_dept[a].days; }).map(function (k) {
        var t = d.by_dept[k];
        return '<tr><td>' + esc(k) + '</td><td style="text-align:right">' + t.count + '</td><td style="text-align:right">' + t.days + '</td></tr>';
      }).join('');
      var topRows = d.top_users.slice(0, 10).map(function (u, i) {
        var rankCol = i < 3 ? ['#fbbf24','#9ca3af','#b45309'][i] : '#94a3b8';
        return '<tr>'
          + '<td><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + rankCol + ';color:#fff;font-weight:700;font-size:11px">' + (i+1) + '</span></td>'
          + '<td>' + esc(u.full_name || '-') + '<br><small style="color:#94a3b8">' + esc(u.position||'') + '</small></td>'
          + '<td>' + esc(u.department || '-') + '</td>'
          + '<td style="text-align:right">' + u.sick + '</td>'
          + '<td style="text-align:right">' + u.personal + '</td>'
          + '<td style="text-align:right">' + u.annual + '</td>'
          + '<td style="text-align:right;font-weight:700;color:#024ad8">' + u.total_days + '</td>'
          + '</tr>';
      }).join('');
      var maxMonth = Math.max.apply(null, d.by_month.map(function (m) { return m.days; }).concat([1]));
      var trendBars = d.by_month.map(function (m) {
        var h = Math.round(m.days / maxMonth * 100);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">'
          + '<div style="font-size:10px;color:#94a3b8">' + (m.days || '') + '</div>'
          + '<div style="width:100%;height:120px;background:#f1f5f9;border-radius:6px 6px 0 0;display:flex;align-items:flex-end;overflow:hidden">'
          + '<div style="width:100%;height:' + h + '%;background:linear-gradient(180deg,#296ef9,#024ad8);border-radius:6px 6px 0 0;transition:height 1s"></div>'
          + '</div>'
          + '<div style="font-size:10px;color:#64748b">' + m.ym.substring(5) + '</div>'
          + '</div>';
      }).join('');
      var html = '<div class="hero" style="margin-bottom:14px">'
        + '<span class="hero-pill"><i class="bi bi-graph-up"></i> รายงานภาพรวม</span>'
        + '<div class="hero-greet">รายงานสถิติการลา ปีงบประมาณ ' + d.fiscal_year_be + '</div>'
        + '<div class="hero-sub">ข้อมูลทั้งระบบ — สรุปภาพรวมการลาทุกประเภท</div>'
        + '</div>'
        + '<div class="grid-4" style="margin-bottom:14px">' + statHtml + '</div>'
        + '<div class="grid-2">'
        + '<div class="card"><div class="card-head"><i class="bi bi-calendar3"></i> <span class="card-title">แนวโน้ม 12 เดือน (วันลา)</span></div>'
        + '<div class="card-body"><div style="display:flex;gap:6px;align-items:flex-end;height:160px">' + trendBars + '</div></div></div>'
        + '<div class="card"><div class="card-head"><i class="bi bi-tag-fill"></i> <span class="card-title">แยกตามประเภทการลา</span></div>'
        + '<div class="card-body"><table class="data-table"><thead><tr><th>ประเภท</th><th style="text-align:right">จำนวนใบ</th><th style="text-align:right">วันที่อนุมัติ</th></tr></thead><tbody>' + typeRows + '</tbody></table></div></div>'
        + '</div>'
        + '<div class="card" style="margin-top:14px"><div class="card-head"><i class="bi bi-building"></i> <span class="card-title">แยกตามสังกัด</span></div>'
        + '<div class="card-body"><table class="data-table"><thead><tr><th>สังกัด</th><th style="text-align:right">จำนวนใบ</th><th style="text-align:right">วัน</th></tr></thead><tbody>' + deptRows + '</tbody></table></div></div>'
        + '<div class="card" style="margin-top:14px"><div class="card-head"><i class="bi bi-trophy-fill" style="color:#f59e0b"></i> <span class="card-title">Top 10 ผู้ลามากที่สุด</span></div>'
        + '<div class="card-body"><table class="data-table"><thead><tr><th>อันดับ</th><th>ชื่อ</th><th>สังกัด</th><th style="text-align:right">ป่วย</th><th style="text-align:right">กิจ</th><th style="text-align:right">พักร้อน</th><th style="text-align:right">รวม</th></tr></thead><tbody>' + (topRows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">ยังไม่มีข้อมูล</td></tr>') + '</tbody></table></div></div>';
      $('#rpt-content').innerHTML = html;
    }
    function renderUserReport(d, canAll) {
      var u = d.user;
      var stats = d.stats.items;
      var statHtml = '';
      Object.keys(stats).forEach(function (k) {
        var s = stats[k];
        statHtml += statBox(LMS.LEAVE_TYPE_LABEL[k] + ' (' + s.used + '/' + s.limit + ')',
                            s.remaining + ' วัน', 'calendar-check', leaveTypeTone(k));
      });
      var sel = '';
      if (canAll) {
        sel = '<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
          + '<div style="font-weight:600">เลือกบุคลากร:</div>'
          + '<select class="select" id="rpt-user" style="max-width:300px"><option value="">กำลังโหลด...</option></select>'
          + '</div></div>';
      }
      var recent = d.recent.map(function (lv) {
        return '<tr class="clickable" data-go="' + esc(lv.id) + '">'
          + '<td><code>' + esc(lv.leave_no) + '</code></td>'
          + '<td>' + esc(lv.leave_type_label) + '</td>'
          + '<td>' + TH.date(lv.start_date) + ' → ' + TH.date(lv.end_date) + timeRangeLabel(lv) + '</td>'
          + '<td style="text-align:right">' + durationLabel(lv) + '</td>'
          + '<td><span class="badge b-' + (LMS.Store.boot.status_tones || {})[lv.status] + '">' + esc(lv.status_label) + '</span></td>'
          + '</tr>';
      }).join('');
      var html = sel
        + '<div class="hero" style="margin-bottom:14px">'
        + '<span class="hero-pill"><i class="bi bi-person-vcard"></i> รายงานรายบุคคล</span>'
        + '<div class="hero-greet">' + esc(u.full_name) + '</div>'
        + '<div class="hero-sub">' + esc(u.position || '-') + ' · ' + esc(u.department || '-') + ' · ปีงบประมาณ ' + d.fiscal_year_be + '</div>'
        + '</div>'
        + '<div class="grid-3" style="margin-bottom:14px">' + statHtml + '</div>'
        + '<div class="card"><div class="card-head"><i class="bi bi-clock-history"></i> <span class="card-title">ประวัติการลา (' + d.recent.length + ')</span></div>'
        + '<div class="card-body">' + (recent ? '<table class="data-table"><thead><tr><th>เลขที่</th><th>ประเภท</th><th>ช่วงวัน</th><th style="text-align:right">จำนวนลา</th><th>สถานะ</th></tr></thead><tbody>' + recent + '</tbody></table>' : emptyState('inbox','ยังไม่มีประวัติการลา')) + '</div></div>';
      $('#rpt-content').innerHTML = html;
      $$('[data-go]').forEach(function (tr) { tr.addEventListener('click', function () { location.hash = '#/leaves/view?id=' + tr.getAttribute('data-go'); }); });
      if (canAll) {
        call('report.users_list', {}).then(function (lst) {
          var opts = lst.items.map(function (it) {
            var sel = String(it.id) === String(st.selected_user_id) ? ' selected' : '';
            return '<option value="' + it.id + '"' + sel + '>' + esc(it.full_name) + ' · ' + esc(it.department || '') + '</option>';
          }).join('');
          var s = $('#rpt-user'); if (s) {
            s.innerHTML = opts;
            s.addEventListener('change', function () { st.selected_user_id = s.value; loadMine(); });
          }
        }).catch(function () {});
      }
    }
    render();
  };
  function statBox(label, value, icon, tone) {
    return '<div class="stat-card tone-' + tone + '">'
      + '<div class="stat-icon"><i class="bi bi-' + icon + '"></i></div>'
      + '<div class="stat-label">' + esc(label) + '</div>'
      + '<div class="stat-value">' + esc(String(value)) + '</div>'
      + '</div>';
  }
  // ── Profile ────────────────────────────────────────
  Routes['#/profile'] = function () {
    var u = LMS.Store.user || {};
    var html = '<div class="hero" style="margin-bottom:14px">'
      + '<span class="hero-pill"><i class="bi bi-person-circle"></i> โปรไฟล์ของฉัน</span>'
      + '<div class="hero-greet">' + esc(u.full_name) + '</div>'
      + '<div class="hero-sub">' + esc(u.username) + ' · ' + esc((LMS.Store.boot.roles || {})[u.role] || u.role) + '</div>'
      + '</div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-pencil-square"></i> <span class="card-title">แก้ไขข้อมูลส่วนตัว</span></div>'
      + '<div class="card-body"><form id="pf-form">'
      + '<div class="row-2">'
      + '<div class="field"><label>ชื่อ-สกุล <span class="req">*</span></label><input type="text" name="full_name" class="input" value="' + esc(u.full_name) + '" required></div>'
      + '<div class="field"><label>ตำแหน่ง</label><input type="text" name="position" class="input" value="' + esc(u.position) + '"></div>'
      + '</div>'
      + '<div class="row-2">'
      + '<div class="field"><label>ระดับ</label><input type="text" name="level" class="input" value="' + esc(u.level) + '" placeholder=""></div>'
      + '<div class="field"><label>สังกัด</label><input type="text" name="department" class="input" value="' + esc(u.department) + '"></div>'
      + '</div>'
      + '<div class="row-2">'
      + '<div class="field"><label>อีเมล</label><input type="email" name="email" class="input" value="' + esc(u.email) + '"></div>'
      + '<div class="field"><label>โทรศัพท์</label><input type="tel" name="phone" class="input" value="' + esc(u.phone) + '"></div>'
      + '</div>'
      + '<div class="field"><label>URL รูปโปรไฟล์ (lh3 link)</label>'
      + '<input type="url" name="avatar" class="input" value="' + esc(u.avatar) + '" placeholder="https://lh3.googleusercontent.com/..."></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> บันทึก</button>'
      + '</div>'
      + '</form></div></div>'
      + '<div class="card" style="margin-top:14px" id="line-profile-card"><div class="card-head"><i class="bi bi-line" style="color:#06c755"></i> <span class="card-title">เชื่อมต่อ LINE Official Account (LINE OA)</span></div>'
      + '<div class="card-body" id="line-profile-body">'
      + '  <div style="height:40px;background:#f1f5f9;animation:pulse 1.5s infinite;border-radius:6px"></div>'
      + '</div></div>';
    setPage(html);

    function loadLINEStatus() {
      var body = $('#line-profile-body');
      if (!body) return;
      body.innerHTML = '<div style="text-align:center;padding:10px;color:#64748b"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> กำลังโหลดข้อมูล LINE...</div>';
      call('line.get_connect_code', {}).then(function (res) {
        if (res.connected) {
          body.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
            + '  <div>'
            + '    <div style="font-weight:600;color:#059669;display:flex;align-items:center;gap:6px"><i class="bi bi-check-circle-fill"></i> เชื่อมต่อ LINE สำเร็จแล้ว</div>'
            + '    <div style="font-size:12px;color:#64748b;margin-top:4px">คุณจะได้รับการแจ้งเตือนใบลาและสามารถกดใช้งานเมนูด่วนบน LINE OA ได้</div>'
            + '  </div>'
            + '  <button class="btn btn-ghost" id="btn-line-disconnect" style="color:#ef4444;padding:8px 12px;border:1px solid #fca5a5;border-radius:8px"><i class="bi bi-x-circle"></i> ยกเลิกการเชื่อมต่อ</button>'
            + '</div>';
          $('#btn-line-disconnect').addEventListener('click', function () {
            confirmModal('ยกเลิกการเชื่อมต่อ LINE', 'คุณต้องการยกเลิกการเชื่อมต่อบัญชีนี้กับ LINE หรือไม่?', 'danger', 'ยกเลิกการเชื่อมต่อ').then(function (ok) {
              if (!ok) return;
              Spinner.show('กำลังดำเนินการ...');
              call('line.disconnect', {}).then(function () {
                Spinner.hide();
                toast('ยกเลิกการเชื่อมต่อเรียบร้อยแล้ว', 'success');
                loadLINEStatus();
              }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
            });
          });
        } else {
          body.innerHTML = '<div>'
            + '  <p style="font-size:13px;color:#334155;margin-bottom:12px">เชื่อมต่อ LINE ของคุณเพื่อรับการแจ้งเตือนและการใช้งาน Rich Menu โดยดำเนินตามขั้นตอนดังนี้:</p>'
            + '  <div style="background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:12px">'
            + '    <div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:6px">รหัสเชื่อมต่อของคุณ:</div>'
            + '    <div style="font-size:24px;font-weight:800;color:#2563eb;font-family:monospace;letter-spacing:1px">' + esc(res.code) + '</div>'
            + '    <div style="font-size:11.5px;color:#94a3b8;margin-top:4px">นำรหัสนี้ส่งเข้าไปในแชต LINE OA ของบริษัท</div>'
            + '  </div>'
            + '  <div style="font-size:12.5px;color:#475569">'
            + '    <strong>ขั้นตอนการเชื่อมต่อ:</strong>'
            + '    <ol style="margin:6px 0 0;padding-left:18px;line-height:1.6">'
            + '      <li>แอดเพื่อน LINE OA ของบริษัท</li>'
            + '      <li>พิมพ์รหัสคำว่า <strong style="color:#2563eb;font-family:monospace">' + esc(res.code) + '</strong> แล้วส่งเข้ามาในแชต</li>'
            + '      <li>ระบบจะตอบกลับว่าเชื่อมต่อบัญชีสำเร็จทันที</li>'
            + '    </ol>'
            + '  </div>'
            + '  <div style="margin-top:12px;display:flex;justify-content:flex-end">'
            + '    <button class="btn btn-ghost" id="btn-line-reload" style="color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:6px 12px"><i class="bi bi-arrow-clockwise"></i> อัปเดตสถานะหลังเชื่อมต่อ</button>'
            + '  </div>'
            + '</div>';
          $('#btn-line-reload').addEventListener('click', loadLINEStatus);
        }
      }).catch(function (e) {
        body.innerHTML = '<div style="color:#ef4444;text-align:center;font-size:13px"><i class="bi bi-exclamation-triangle"></i> ไม่สามารถโหลดสถานะ LINE ได้: ' + esc(e.message) + '</div>';
      });
    }

    loadLINEStatus();

    $('#pf-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var data = {};
      ['full_name','position','level','department','email','phone','avatar'].forEach(function (k) { data[k] = f[k].value; });
      Spinner.show('กำลังบันทึก...');
      call('user.update_profile', data).then(function (u) {
        Spinner.hide();
        LMS.Store.user = u;
        toast('บันทึกแล้ว', 'success');
        LMS.refreshShell();
      }).catch(function (er) { Spinner.hide(); alertError('ผิดพลาด', er.message); });
    });
  };
  // ── Users (admin) ──────────────────────────────────
  Routes['#/users'] = function () {
    if (!hasCap('user.manage')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    var st = { q: '', role: '', department: '' };
    setPage('<div class="toolbar">'
      + '<div class="search-box"><i class="bi bi-search"></i><input type="text" id="usr-q" placeholder="ค้นหา ชื่อ username อีเมล..."></div>'
      + '<select class="select" id="usr-role" style="max-width:200px"><option value="">ทุกบทบาท</option>'
      + Object.keys(LMS.Store.boot.roles || {}).map(function (r) { return '<option value="' + r + '">' + esc(LMS.Store.boot.roles[r]) + '</option>'; }).join('')
      + '</select>'
      + '<button class="btn btn-primary" id="usr-add"><i class="bi bi-plus-lg"></i> เพิ่มผู้ใช้</button>'
      + '</div>'
      + '<div id="usr-list">' + skBlocks(4, 80) + '</div>');
    function load() {
      Spinner.show('กำลังโหลด...');
      call('user.list', st).then(function (r) {
        Spinner.hide();
        var rows = r.items.map(function (u) {
          var initial = (u.full_name || '?').substring(0,1).toUpperCase();
          var avatar = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer">' : initial;
          return '<tr class="clickable" data-id="' + esc(u.id) + '">'
            + '<td><div style="display:flex;align-items:center;gap:8px">'
            + '<div class="lv-avatar" style="width:36px;height:36px;font-size:14px">' + avatar + '</div>'
            + '<div><div style="font-weight:600">' + esc(u.full_name) + '</div><div style="font-size:11px;color:#94a3b8">@' + esc(u.username) + '</div></div></div></td>'
            + '<td>' + esc(u.position || '-') + '</td>'
            + '<td>' + esc(u.department || '-') + '</td>'
            + '<td><span class="role-chip role-chip-' + esc(u.role) + '">' + esc((LMS.Store.boot.roles || {})[u.role] || u.role) + '</span></td>'
            + '<td>' + (String(u.is_active).toLowerCase() === 'yes' ? '<span class="badge b-emerald"><i class="bi bi-check-circle"></i> ใช้งาน</span>' : (String(u.is_active).toLowerCase() === 'pending' ? '<span class="pending-badge"><i class="bi bi-clock-fill"></i> รออนุมัติ</span>' : '<span class="badge b-slate"><i class="bi bi-pause-circle"></i> ปิด</span>')) + '</td>'
            + '</tr>';
        }).join('');
        var html = '<table class="data-table">'
          + '<thead><tr><th>ผู้ใช้</th><th>ตำแหน่ง</th><th>สังกัด</th><th>บทบาท</th><th>สถานะ</th></tr></thead>'
          + '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:30px">ไม่พบผู้ใช้</td></tr>') + '</tbody></table>';
        $('#usr-list').innerHTML = html;
        $$('#usr-list [data-id]').forEach(function (tr) { tr.addEventListener('click', function () { openUserModal(tr.getAttribute('data-id')); }); });
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    var t;
    $('#usr-q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.q = $('#usr-q').value; load(); }, 300); });
    $('#usr-role').addEventListener('change', function () { st.role = $('#usr-role').value; load(); });
    $('#usr-add').addEventListener('click', function () { openUserModal(null); });
    load();
  };
  function openUserModal(id) {
    var u = id ? null : { id: '', username: '', password: '', full_name: '', position: '', level: '', department: '', role: 'teacher', email: '', phone: '', avatar: '', is_active: true };
    function render(u) {
      var roles = LMS.Store.boot.roles || {};
      var html = '<form id="user-form">'
        + '<div class="row-2">'
        + '<div class="field"><label>ชื่อผู้ใช้ <span class="req">*</span></label><input type="text" name="username" class="input" value="' + esc(u.username) + '" pattern="[-a-z0-9_.]{3,30}" required></div>'
        + '<div class="field"><label>บทบาท <span class="req">*</span></label><select name="role" class="select" required>'
        + Object.keys(roles).map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + esc(roles[r]) + '</option>'; }).join('')
        + '</select></div>'
        + '</div>'
        + '<div class="row-2">'
        + '<div class="field"><label>ชื่อ-สกุล <span class="req">*</span></label><input type="text" name="full_name" class="input" value="' + esc(u.full_name) + '" required></div>'
        + '<div class="field"><label>ตำแหน่ง</label><input type="text" name="position" class="input" value="' + esc(u.position) + '"></div>'
        + '</div>'
        + '<div class="row-2">'
        + '<div class="field"><label>ระดับ</label><input type="text" name="level" class="input" value="' + esc(u.level) + '"></div>'
        + '<div class="field"><label>สังกัด</label><input type="text" name="department" class="input" value="' + esc(u.department) + '"></div>'
        + '</div>'
        + '<div class="row-2">'
        + '<div class="field"><label>อีเมล</label><input type="email" name="email" class="input" value="' + esc(u.email) + '"></div>'
        + '<div class="field"><label>โทรศัพท์</label><input type="tel" name="phone" class="input" value="' + esc(u.phone) + '"></div>'
        + '</div>'
        + (u.id ? '' : '<div class="field"><label>รหัสผ่าน</label><input type="text" name="password" class="input" value="123456" placeholder="ค่าเริ่มต้น 123456"><div class="field-hint">เว้นว่างเพื่อใช้ "123456" — ผู้ใช้ควรเปลี่ยนเองภายหลัง</div></div>')
        + '<div class="field"><label><input type="checkbox" name="is_active"' + (u.is_active === false ? '' : ' checked') + '> ใช้งานได้ (active)</label></div>'
        + '</form>';
      var footer = '<button class="btn btn-ghost" data-modal-close>ยกเลิก</button>';
      if (u.id) {
        footer += '<button class="btn btn-warning" id="user-reset"><i class="bi bi-key-fill"></i> รีเซ็ตรหัส</button>';
        footer += '<button class="btn btn-danger" id="user-delete"><i class="bi bi-trash"></i> ลบ</button>';
      }
      footer += '<button class="btn btn-primary" id="user-save"><i class="bi bi-check-lg"></i> บันทึก</button>';
      Modal.open({
        title: u.id ? ('แก้ไขผู้ใช้ — ' + u.full_name) : 'เพิ่มผู้ใช้ใหม่',
        large: true,
        html: html,
        footer: footer,
        onOpen: function () {
          $('#user-save').addEventListener('click', function () {
            var f = $('#user-form');
            var data = { id: u.id || '' };
            ['username','password','full_name','position','level','department','role','email','phone','avatar'].forEach(function (k) {
              if (f[k]) data[k] = f[k].value;
            });
            data.is_active = f.is_active.checked;
            Spinner.show('กำลังบันทึก...');
            call('user.upsert', data).then(function () { Spinner.hide(); Modal.close(); toast('บันทึกแล้ว', 'success'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
          });
          if (u.id) {
            $('#user-reset').addEventListener('click', function () {
              Swal.fire({ title: 'รหัสผ่านใหม่', input: 'text', inputValue: '123456', showCancelButton: true, confirmButtonText: 'รีเซ็ต' })
                .then(function (r) {
                  if (!r.isConfirmed) return;
                  Spinner.show('กำลังรีเซ็ต...');
                  call('user.reset_password', { id: u.id, new_password: r.value }).then(function () { Spinner.hide(); toast('รีเซ็ตรหัสผ่านแล้ว', 'success'); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
                });
            });
            $('#user-delete').addEventListener('click', function () {
              confirmModal({ title: 'ลบผู้ใช้?', message: 'หากผู้ใช้มีใบลาแล้ว ระบบจะปิดการใช้งานแทนการลบ', okText: 'ลบ/ปิด', danger: true })
                .then(function (ok) {
                  if (!ok) return;
                  Spinner.show('กำลังดำเนินการ...');
                  call('user.delete', { id: u.id }).then(function (r) { Spinner.hide(); Modal.close(); toast(r.mode === 'deleted' ? 'ลบแล้ว' : 'ปิดการใช้งานแล้ว', 'success'); LMS.dispatch(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
                });
            });
          }
        }
      });
    }
    if (id) {
      Spinner.show('กำลังโหลด...');
      call('user.get', { id: id }).then(function (u) { Spinner.hide(); render(u); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    } else {
      render(u);
    }
  }
  // ── Pending Registrations (admin / approver) ────────────
  Routes['#/pending-users'] = function () {
    if (!hasCap('user.manage')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    setPage('<div class="card">'
      + '<div class="card-head"><i class="bi bi-person-fill-exclamation" style="color:#f59e0b"></i>'
      + ' <span class="card-title">คำขอสมัครสมาชิก</span>'
      + '<span style="margin-left:auto;font-size:12px;color:#64748b">รายการที่รอการอนุมัติจากผู้ดูแลระบบหรือฝ่ายบุคคล</span>'
      + '</div>'
      + '<div class="card-body" id="pending-list">' + skBlocks(3, 70) + '</div>'
      + '</div>');
    loadPending();

    function loadPending() {
      Spinner.show('กำลังโหลด...');
      call('user.list_pending', {}).then(function (r) {
        Spinner.hide();
        if (!r.items || r.items.length === 0) {
          $('#pending-list').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8">'
            + '<i class="bi bi-check-circle-fill" style="font-size:36px;color:#10b981;display:block;margin-bottom:10px"></i>'
            + '<strong>ไม่มีคำขอสมัครสมาชิกที่รอการอนุมัติ</strong>'
            + '<div style="font-size:13px;margin-top:6px">คำขอสมัครใหม่จะปรากฏที่นี่เมื่อมีพนักงานสมัคร</div></div>';
          return;
        }
        var rows = r.items.map(function (u) {
          var initial = (u.full_name || '?').substring(0,1).toUpperCase();
          return '<tr>'
            + '<td><div style="display:flex;align-items:center;gap:10px">'
            + '<div class="lv-avatar" style="width:38px;height:38px;font-size:15px">' + initial + '</div>'
            + '<div><div style="font-weight:600">' + esc(u.full_name) + '</div>'
            + '<div style="font-size:11px;color:#94a3b8">@' + esc(u.username) + '</div></div>'
            + '</div></td>'
            + '<td>' + esc(u.position || '-') + '</td>'
            + '<td>' + esc(u.department || '-') + '</td>'
            + '<td>' + esc(u.email || '-') + '</td>'
            + '<td>' + esc(u.phone || '-') + '</td>'
            + '<td><span class="pending-badge"><i class="bi bi-clock-fill"></i> รออนุมัติ</span></td>'
            + '<td style="white-space:nowrap">'
            + '<button class="btn btn-primary btn-sm" style="padding:4px 12px;font-size:12px" data-approve="' + esc(u.id) + '" data-name="' + esc(u.full_name) + '"><i class="bi bi-check-lg"></i> อนุมัติ</button> '
            + '<button class="btn btn-danger btn-sm" style="padding:4px 12px;font-size:12px" data-reject="' + esc(u.id) + '" data-name="' + esc(u.full_name) + '"><i class="bi bi-x-lg"></i> ปฏิเสธ</button>'
            + '</td>'
            + '</tr>';
        }).join('');
        $('#pending-list').innerHTML = '<table class="data-table"><thead><tr>'
          + '<th>พนักงาน</th><th>ตำแหน่ง</th><th>สังกัด</th><th>อีเมล</th><th>โทรศัพท์</th><th>สถานะ</th><th>การดำเนินการ</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table>';

        // Wire approve buttons
        $$('[data-approve]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-approve');
            var name = btn.getAttribute('data-name');
            var roles = LMS.Store.boot.roles || {};
            var roleOpts = Object.keys(roles).map(function (r) {
              return '<option value="' + r + '"' + (r === 'employee' ? ' selected' : '') + '>' + esc(roles[r]) + '</option>';
            }).join('');
            var html = '<div style="margin-bottom:12px;font-size:14px;color:#64748b">กำลังอนุมัติบัญชีของ <strong style="color:#1e293b">' + esc(name) + '</strong></div>'
              + '<div class="field"><label style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;display:block">กำหนดบทบาท <span class="req">*</span></label>'
              + '<select id="approve-role" class="select">' + roleOpts + '</select></div>'
              + '<div style="margin-top:10px;font-size:12px;color:#94a3b8"><i class="bi bi-info-circle"></i> บทบาทสามารถแก้ไขได้ภายหลังในหน้าจัดการผู้ใช้</div>';
            var footer = '<button class="btn btn-ghost" data-modal-close>ยกเลิก</button>'
              + '<button class="btn btn-primary" id="confirm-approve"><i class="bi bi-check-circle-fill"></i> ยืนยันอนุมัติ</button>';
            Modal.open({
              title: '<i class="bi bi-person-check-fill" style="color:#10b981"></i> อนุมัติการสมัครสมาชิก',
              html: html,
              footer: footer,
              onOpen: function () {
                $('#confirm-approve').addEventListener('click', function () {
                  var role = $('#approve-role').value;
                  Spinner.show('กำลังอนุมัติ...');
                  call('user.approve_registration', { id: id, action: 'approve', role: role }).then(function () {
                    Spinner.hide(); Modal.close();
                    toast('อนุมัติบัญชี ' + name + ' เรียบร้อยแล้ว', 'success');
                    loadPending();
                  }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
                });
              }
            });
          });
        });

        // Wire reject buttons
        $$('[data-reject]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-reject');
            var name = btn.getAttribute('data-name');
            confirmModal({
              title: 'ปฏิเสธคำขอสมัคร?',
              message: 'บัญชีของ "' + name + '" จะถูกลบออกจากระบบ ต้องการดำเนินการต่อหรือไม่?',
              okText: 'ปฏิเสธ', danger: true
            }).then(function (ok) {
              if (!ok) return;
              Spinner.show('กำลังดำเนินการ...');
              call('user.approve_registration', { id: id, action: 'reject' }).then(function () {
                Spinner.hide();
                toast('ปฏิเสธคำขอของ ' + name + ' แล้ว', 'success');
                loadPending();
              }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
            });
          });
        });
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
  };
  // ── Settings ───────────────────────────────────────
  Routes['#/settings'] = function () {
    if (!hasCap('setting.manage')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    setPage(skBlocks(2, 200));
    Spinner.show('กำลังโหลดการตั้งค่า...');
    Promise.all([
      call('setting.get', {}),
      call('holiday.list', {})
    ]).then(function (res) {
      Spinner.hide();
      renderSettings(res[0], res[1]);
    }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
  };
  function renderSettings(s, holidays) {
    function field(name, label, val, hint, type) {
      type = type || 'text';
      return '<div class="field"><label>' + esc(label) + '</label>'
        + '<input type="' + type + '" name="' + name + '" class="input" value="' + esc(val == null ? '' : val) + '">'
        + (hint ? '<div class="field-hint">' + esc(hint) + '</div>' : '') + '</div>';
    }
    function selField(name, label, val, options, hint) {
      return '<div class="field"><label>' + esc(label) + '</label>'
        + '<select name="' + name + '" class="select">'
        + options.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('')
        + '</select>' + (hint ? '<div class="field-hint">' + esc(hint) + '</div>' : '') + '</div>';
    }
    var html = '<div class="hero" style="margin-bottom:14px">'
      + '<span class="hero-pill"><i class="bi bi-gear-fill"></i> ตั้งค่าระบบ</span>'
      + '<div class="hero-greet">การตั้งค่าระบบ</div>'
      + '<div class="hero-sub">กำหนดข้อมูลบริษัท · ลิมิตการลา · พฤติกรรมระบบ · จัดการวันหยุด</div>'
      + '</div>'
      + '<form id="set-form">'
      + '<div class="grid-2">'
      + '<div class="card"><div class="card-head"><i class="bi bi-building" style="color:#024ad8"></i> <span class="card-title">ข้อมูลบริษัท</span></div>'
      + '<div class="card-body">'
      + field('org_name', 'ชื่อบริษัท', s.org_name)
      + field('org_address', 'ที่อยู่', s.org_address)
      + field('org_phone', 'โทรศัพท์', s.org_phone)
      + field('org_email', 'อีเมล', s.org_email, '', 'email')
      + '</div></div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-calendar-range" style="color:#10b981"></i> <span class="card-title">ลิมิตการลา (วัน/ปี)</span></div>'
      + '<div class="card-body">'
      + field('limit_sick', 'ลาป่วย (วัน)', s.limit_sick, 'มาตรฐานราชการ: 60 วัน', 'number')
      + field('limit_personal', 'ลากิจส่วนตัว (วัน)', s.limit_personal, 'มาตรฐานราชการ: 45 วัน', 'number')
      + field('limit_annual', 'ลาพักร้อน (วัน)', s.limit_annual, 'เช่น 10 วันต่อปี', 'number')
      + field('warn_threshold', 'แจ้งเตือนเมื่อใช้ถึง (%)', s.warn_threshold, 'เช่น 80 = แจ้งเตือนเมื่อใช้สิทธิ์ถึง 80%', 'number')
      + '</div></div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-diagram-3-fill" style="color:#ec4899"></i> <span class="card-title">ขั้นตอนการอนุมัติ</span></div>'
      + '<div class="card-body">'
      + selField('approval_stages', 'จำนวนชั้นการอนุมัติ', s.approval_stages,
                 [
                   {v:'1', l:'1 ชั้น — ฝ่ายบุคคลอนุมัติเลย (ลัดทุกขั้น)'},
                   {v:'2', l:'2 ชั้น — หัวหน้างาน → ฝ่ายบุคคล (ข้ามเจ้าหน้าที่ตรวจสอบ)'},
                   {v:'3', l:'3 ชั้น — ตรวจสอบ → หัวหน้างาน → ฝ่ายบุคคล (default)'}
                 ],
                 'เลือกได้ตามความเหมาะสมของโรงเรียน — เปลี่ยนได้ทุกเมื่อ มีผลกับใบลาใหม่ทันที')
      + '</div></div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-toggles" style="color:#296ef9"></i> <span class="card-title">พฤติกรรมระบบ</span></div>'
      + '<div class="card-body">'
      + selField('show_demo_users', 'แสดงการ์ดบัญชีทดลองในหน้าล็อกอิน', s.show_demo_users,
                 [{v:'yes',l:'เปิด (โหมด Demo / Training)'}, {v:'no',l:'ปิด (Production แนะนำ)'}],
                 'ปิดเมื่อ deploy ใช้งานจริงเพื่อความปลอดภัย')
      + field('session_hours', 'อายุของ Session (ชั่วโมง)', s.session_hours, 'เริ่มต้น 8 ชั่วโมง', 'number')
      + '</div></div>'
      + '<div class="card" style="grid-column: span 2"><div class="card-head"><i class="bi bi-line" style="color:#06c755"></i> <span class="card-title">เชื่อมต่อ LINE Official Account (LINE OA)</span></div>'
      + '<div class="card-body">'
      + '  <p style="font-size:12.5px;color:#64748b;margin-bottom:12px">เชื่อมต่อ LINE OA เพื่อส่งการแจ้งเตือนและระบบตอบกลับแบบ Flex Message ฟรี</p>'
      + '  <div class="grid-2">'
      +      field('line_channel_access_token', 'Channel Access Token', s.line_channel_access_token, 'ดูที่ LINE Developers Console -> Messaging API')
      +      field('line_channel_secret', 'Channel Secret', s.line_channel_secret, 'ดูที่ LINE Developers Console -> Basic Settings')
      + '  </div>'
      + '  <div class="grid-2" style="margin-top:12px">'
      +      field('email_from_alias', 'อีเมลผู้ส่งแจ้งเตือน (Gmail Alias - ปล่อยว่างไว้หากใช้เมลหลัก)', s.email_from_alias, 'เช่น hr@yourcompany.com (ต้องยืนยันเป็น Alias ใน Gmail บัญชีที่ใช้ deploy ก่อน)')
      + '  </div>'
      + '  <div style="background:#f8fafc;padding:12px;border-radius:10px;border:1px solid #e2e8f0;margin-top:12px">'
      + '    <label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">Webhook URL (นำไปใส่ที่ฝั่ง LINE Console):</label>'
      + '    <div style="display:flex;gap:8px;align-items:center">'
      + '      <input type="text" id="line-webhook-url" class="input" style="font-family:monospace;font-size:12px;background:#f1f5f9;flex:1" readonly value="กำลังโหลด...">'
      + '      <button type="button" class="btn btn-ghost" onclick="navigator.clipboard.writeText($(\'#line-webhook-url\').value);toast(\'คัดลอกลง Clipboard แล้ว\',\'success\')" style="padding:8px" title="คัดลอกลิงก์"><i class="bi bi-clipboard"></i></button>'
      + '    </div>'
      + '  </div>'
      + '</div></div>'
      + '<div class="card" style="grid-column: span 2">'
      + '<div class="card-head"><i class="bi bi-calendar2-week-fill" style="color:#f59e0b"></i> <span class="card-title">จัดการวันหยุดประจำปีของบริษัท</span></div>'
      + '<div class="card-body">'
      + '  <p style="font-size:12.5px;color:#64748b;margin-bottom:12px">กำหนดวันหยุดบริษัทเพื่อหักออกจากวันลาสะสมโดยอัตโนมัติ (ระบบจะหักวันหยุดประจำปีและวันเสาร์-อาทิตย์ออกจากการคิดวันลา)</p>'
      + '  <div style="display:flex;gap:10px;margin-bottom:16px;background:#f8fafc;padding:12px;border-radius:10px;align-items:flex-end;flex-wrap:wrap">'
      + '    <div style="flex:1;min-width:160px"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">วันที่</label><input type="date" id="new-holiday-date" class="input" style="padding:8px 10px;font-size:13px"></div>'
      + '    <div style="flex:2;min-width:200px"><label style="font-size:12px;font-weight:600;color:#475569;display:block;margin-bottom:4px">ชื่อวันหยุด</label><input type="text" id="new-holiday-name" class="input" placeholder="เช่น วันขึ้นปีใหม่" style="padding:8px 10px;font-size:13px"></div>'
      + '    <button type="button" class="btn btn-primary" id="btn-add-holiday" style="padding:8.5px 16px;font-size:13px"><i class="bi bi-plus-lg"></i> เพิ่มวันหยุด</button>'
      + '  </div>'
      + '  <div style="max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px">'
      + '    <table class="table" style="font-size:13px;width:100%;border-collapse:collapse" id="holiday-table">'
      + '      <thead><tr style="background:#f1f5f9;text-align:left;position:sticky;top:0;z-index:1"><th style="padding:10px 12px;font-weight:600;color:#475569">วันที่</th><th style="padding:10px 12px;font-weight:600;color:#475569">ชื่อวันหยุด</th><th style="padding:10px 12px;text-align:center;font-weight:600;color:#475569;width:80px">จัดการ</th></tr></thead>'
      + '      <tbody></tbody>'
      + '    </table>'
      + '  </div>'
      + '</div></div>'
      + '</div>'
      + '<div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">'
      + '<button type="button" class="btn btn-ghost" onclick="LMS.dispatch()">ยกเลิก</button>'
      + '<button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> บันทึกการตั้งค่า</button>'
      + '</div>'
      + '</form>';
    setPage(html);

    call('line.webhook_url', {}).then(function (url) {
      var el = $('#line-webhook-url');
      if (el) el.value = url;
    }).catch(function () {
      var el = $('#line-webhook-url');
      if (el) el.value = 'ไม่สามารถดึง URL ได้ (กรุณาตรวจสอบการ Deploy)';
    });

    // Render holidays table
    function renderHolidaysTable(items) {
      var tbody = $('#holiday-table tbody');
      if (!tbody) return;
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:20px">ไม่มีข้อมูลวันหยุดในระบบ</td></tr>';
        return;
      }
      tbody.innerHTML = items.map(function (h) {
        return '<tr style="border-bottom:1px solid #f1f5f9">'
          + '<td style="padding:10px 12px">' + esc(TH.dateLong(h.holiday_date)) + '</td>'
          + '<td style="padding:10px 12px;font-weight:500">' + esc(h.name) + '</td>'
          + '<td style="padding:10px 12px;text-align:center">'
          + '  <button type="button" class="btn btn-ghost btn-sm btn-delete-holiday" data-id="' + h.id + '" data-name="' + esc(h.name) + '" style="color:#ef4444;padding:4px 8px"><i class="bi bi-trash3-fill"></i></button>'
          + '</td></tr>';
      }).join('');
    }
    renderHolidaysTable(holidays || []);

    // Bind Add Holiday action
    var btnAdd = $('#btn-add-holiday');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        var dateInput = $('#new-holiday-date');
        var nameInput = $('#new-holiday-name');
        var dateVal = dateInput ? dateInput.value : '';
        var nameVal = nameInput ? nameInput.value : '';
        
        if (!dateVal) { toast('กรุณาเลือกวันที่', 'warning'); return; }
        if (!nameVal.trim()) { toast('กรุณาระบุชื่อวันหยุด', 'warning'); return; }
        
        Spinner.show('กำลังบันทึกวันหยุด...');
        call('holiday.upsert', { holiday_date: dateVal, name: nameVal }).then(function () {
          Spinner.hide();
          toast('เพิ่มวันหยุดเรียบร้อยแล้ว', 'success');
          if (dateInput) dateInput.value = '';
          if (nameInput) nameInput.value = '';
          
          // Reload list
          call('holiday.list', {}).then(function (newList) {
            renderHolidaysTable(newList);
            // Invalidate bootstrap data
            call('app.bootstrap', {}).then(function (bootData) {
              LMS.Store.boot = bootData;
            });
          });
        }).catch(function (er) {
          Spinner.hide();
          alertError('ผิดพลาด', er.message);
        });
      });
    }

    // Bind Delete Holiday action (Event delegation)
    var tableBody = $('#holiday-table tbody');
    if (tableBody) {
      tableBody.addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-delete-holiday');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var name = btn.getAttribute('data-name');
        confirmModal('ยืนยันการลบ', 'คุณต้องการลบวันหยุด "' + name + '" หรือไม่?', 'danger', 'ลบ').then(function (ok) {
          if (!ok) return;
          Spinner.show('กำลังลบวันหยุด...');
          call('holiday.delete', { id: id }).then(function () {
            Spinner.hide();
            toast('ลบวันหยุดเรียบร้อยแล้ว', 'success');
            // Reload list
            call('holiday.list', {}).then(function (newList) {
              renderHolidaysTable(newList);
              // Invalidate bootstrap data
              call('app.bootstrap', {}).then(function (bootData) {
                LMS.Store.boot = bootData;
              });
            });
          }).catch(function (er) {
            Spinner.hide();
            alertError('เกิดข้อผิดพลาด', er.message);
          });
        });
      });
    }

    $('#set-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var data = {};
      ['org_name','org_address','org_phone','org_email','limit_sick','limit_personal','limit_annual','warn_threshold','show_demo_users','session_hours','approval_stages','line_channel_access_token','line_channel_secret','email_from_alias'].forEach(function (k) {
        if (f[k]) data[k] = f[k].value;
      });
      Spinner.show('กำลังบันทึก...', { stages: ['ตรวจสอบข้อมูล','บันทึก','รีเฟรชระบบ'] });
      call('setting.update', data).then(function () { Spinner.hide(); toast('บันทึกการตั้งค่าแล้ว', 'success'); }).catch(function (er) { Spinner.hide(); alertError('ผิดพลาด', er.message); });
    });
  }
  // ── Audit ──────────────────────────────────────────
  Routes['#/audit'] = function () {
    if (!hasCap('audit.manage')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    var st = { page: 1 };
    setPage('<div class="toolbar"><div style="font-weight:700"><i class="bi bi-shield-check" style="color:#024ad8"></i> บันทึกการใช้งาน</div></div><div id="aud-list">' + skBlocks(5, 50) + '</div>');
    function load() {
      Spinner.show('กำลังโหลด...');
      call('audit.list', st).then(function (r) {
        Spinner.hide();
        var rows = r.items.map(function (a) {
          return '<tr><td>' + TH.smart(a.created_at) + '</td>'
            + '<td>' + esc(a.user_name) + '</td>'
            + '<td><code>' + esc(a.action) + '</code></td>'
            + '<td>' + esc(a.entity) + '</td>'
            + '<td><small style="color:#94a3b8">' + esc(a.entity_id) + '</small></td>'
            + '</tr>';
        }).join('');
        var html = '<table class="data-table">'
          + '<thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>Entity</th><th>ID</th></tr></thead>'
          + '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:30px">ไม่มีข้อมูล</td></tr>') + '</tbody></table>'
          + '<div style="margin-top:14px">' + pagerHtml(r) + '</div>';
        $('#aud-list').innerHTML = html;
        wirePager(r, function (n) { st.page = n; load(); });
      }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    load();
  };
  // ── Workforce / Calendar / Schedule / Missions ───────────
  function _mkMonthKey(v) {
    if (!v) { var dn = new Date(); return dn.getFullYear() + '-' + ('0' + (dn.getMonth() + 1)).slice(-2); }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    var dn2 = new Date();
    return dn2.getFullYear() + '-' + ('0' + (dn2.getMonth() + 1)).slice(-2);
  }
  function _addMonthKey(v, delta) {
    var m = _mkMonthKey(v).split('-');
    var d = new Date(Number(m[0]), Number(m[1]) - 1 + delta, 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function _monthLabel(key) {
    var m = _mkMonthKey(key).split('-');
    var d = new Date(Number(m[0]), Number(m[1]) - 1, 1);
    return TH.MONTHS[d.getMonth()] + ' ' + TH.beYear(d);
  }
  function _toneClass(type) {
    return ({ sick: 'rose', personal: 'amber', annual: 'emerald', maternity: 'emerald' })[type] || 'indigo';
  }
  function _badgeLabel(status) {
    return (LMS.Store.boot.statuses || {})[status] || status;
  }
  Routes['#/calendar'] = function () {
    if (!hasCap('calendar.view_own|calendar.view_department|calendar.view_all')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    var st = { month: _mkMonthKey(new Date()) };
    setPage('<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:220px"><div style="font-weight:800;font-size:18px">ปฏิทินวันลาทั้งบริษัท</div><div style="font-size:12px;color:#64748b">ดูวันลาของทีมงานตามเดือน</div></div>'
      + '<button class="btn btn-ghost" id="cal-prev"><i class="bi bi-chevron-left"></i></button>'
      + '<div class="badge b-indigo" id="cal-month" style="font-size:13px;padding:8px 12px"></div>'
      + '<button class="btn btn-ghost" id="cal-next"><i class="bi bi-chevron-right"></i></button>'
      + '</div></div>'
      + '<div id="cal-box">' + skBlocks(6, 100) + '</div>');
    function render(data) {
      var headers = ['อา','จ','อ','พ','พฤ','ศ','ส'];
      var firstDow = data.days && data.days.length ? Number(data.days[0].dow || 0) : 0;
      var leadingBlanks = '';
      for (var bi = 0; bi < firstDow; bi++) leadingBlanks += '<div class="cal-day cal-day-blank" aria-hidden="true"></div>';
      var legend = '<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">'
        + ['sick','personal','annual'].map(function (t) { return '<span class="badge b-' + _toneClass(t) + '"><i class="bi bi-circle-fill"></i> ' + esc((LMS.LEAVE_TYPE_LABEL||{})[t] || t) + '</span>'; }).join('')
        + '</div></div>';
      var html = legend
        + '<div class="card"><div class="card-body">'
        + '<div class="cal-weekdays">'
        + headers.map(function (h) { return '<div class="cal-weekday">' + h + '</div>'; }).join('')
        + '</div>'
        + '<div class="cal-grid">'
        + leadingBlanks
        + data.days.map(function (d) {
            var itemHtml = d.items.slice(0, 3).map(function (it) {
              return '<a href="#/leaves/view?id=' + esc(it.id) + '" class="badge b-' + it.tone + ' cal-leave-item">'
                + '<strong>' + esc(it.leave_type_label) + '</strong><span>' + esc(it.requester_name) + '</span><em>' + esc(it.status_label || '') + '</em></a>';
            }).join('');
            if (d.count > 3) itemHtml += '<div style="font-size:11px;color:#64748b">+' + (d.count - 3) + ' รายการ</div>';
            var outer = 'background:#fff;';
            var holidayHeader = '';
            if (d.holiday_name) {
              outer += 'background:#fff5f5;border-color:#fca5a5;';
              holidayHeader = '<div style="font-size:11px;color:#dc2626;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:4px" title="' + esc(d.holiday_name) + '"><i class="bi bi-gift-fill"></i> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + esc(d.holiday_name) + '</span></div>';
            } else if (d.weekend) {
              outer += 'background:#f8fafc;';
            }
            var dateShort = String(d.date || '').slice(5);
            return '<div class="cal-day" style="' + outer + '">'
              + '<div class="cal-day-head">'
              + '<strong>' + d.day + '</strong>'
              + '<span>' + esc(dateShort || d.date) + '</span>'
              + '</div>'
              + holidayHeader
              + itemHtml
              + (d.count === 0 && !d.holiday_name ? '<div class="cal-empty"><i class="bi bi-calendar2-week"></i> ว่าง</div>' : '')
              + '</div>';
          }).join('')
        + '</div></div></div>';
      $('#cal-month').textContent = _monthLabel(data.month_key);
      $('#cal-box').innerHTML = html;
    }
    function load() {
      Spinner.show('กำลังโหลดปฏิทิน...', { stages: ['อ่านใบลาที่อนุมัติแล้ว','สรุปรายวัน','เตรียมมุมมอง'] });
      call('calendar.month', st).then(function (r) { Spinner.hide(); render(r); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    $('#cal-prev').addEventListener('click', function () { st.month = _addMonthKey(st.month, -1); load(); });
    $('#cal-next').addEventListener('click', function () { st.month = _addMonthKey(st.month, 1); load(); });
    load();
  };

  Routes['#/missions'] = function () {
    if (!hasCap('mission.create_own|mission.view_own|mission.view_department|mission.view_all')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    var st = { month: _mkMonthKey(new Date()), q: '', status: 'pending' };
    setPage('<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:220px"><div style="font-weight:800;font-size:18px">งานออกนอกพื้นที่</div><div style="font-size:12px;color:#64748b">เบิกค่าเดินทาง</div></div>'
      + '<input class="input" id="mis-q" style="max-width:240px" placeholder="ค้นหาเรื่อง / ปลายทาง">'
      + '<select class="select" id="mis-status" style="max-width:180px"><option value="">ทุกสถานะ</option></select>'
      + '<button class="btn btn-primary" id="mis-add"><i class="bi bi-plus-lg"></i> สร้างรายการ</button>'
      + '</div></div>'
      + '<div id="mis-box">' + skBlocks(5, 92) + '</div>');
    function renderStatusOptions() {
      var statuses = LMS.Store.boot.statuses || {};
      var sel = $('#mis-status');
      sel.innerHTML = '<option value="">ทุกสถานะ</option>' + Object.keys(statuses).map(function (s) { return '<option value="' + s + '"' + (st.status === s ? ' selected' : '') + '>' + esc(statuses[s]) + '</option>'; }).join('');
    }
    function createMission() {
      var html = ''
        + '<div style="display:grid;gap:10px;text-align:left">'
        + '<label>เรื่อง (หัวข้อ)</label><input id="m-title" class="input" placeholder="เช่น เดินทางไปพบลูกค้า">'
        + '<label>วัตถุประสงค์ (ระบุงานที่ไปทำ)</label><textarea id="m-purpose" class="textarea" rows="3"></textarea>'
        + '<label>สถานที่ปฏิบัติงาน (ปลายทาง)</label><input id="m-destination" class="input" placeholder="ระบุสถานที่">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '  <div><label>วันที่เริ่ม</label><input id="m-start" type="date" class="input" value="' + TH.iso(new Date()) + '"></div>'
        + '  <div><label>วันที่สิ้นสุด</label><input id="m-end" type="date" class="input" value="' + TH.iso(new Date()) + '"></div>'
        + '</div>'
        + '</div>';
      Swal.fire({
        title: 'สร้างงานออกนอกพื้นที่',
        html: html,
        showCancelButton: true,
        confirmButtonText: 'สร้าง',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: function () {
          return {
            title: document.getElementById('m-title').value,
            purpose: document.getElementById('m-purpose').value,
            destination: document.getElementById('m-destination').value,
            start_date: document.getElementById('m-start').value,
            end_date: document.getElementById('m-end').value
          };
        }
      }).then(function (r) {
        if (!r.isConfirmed) return;
        Spinner.show('กำลังบันทึก...');
        call('mission.create', r.value).then(function (res) {
          Spinner.hide();
          toast('สร้างรายการแล้ว', 'success');
          location.hash = '#/missions/view?id=' + res.id;
        }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
      });
    }
    function render(items) {
      var rows = items.map(function (m) {
        return '<a class="lv-card" href="#/missions/view?id=' + esc(m.id) + '" style="display:block">'
          + '<div class="lv-card-head">'
          + '  <div class="lv-avatar" style="background:linear-gradient(135deg,#024ad8,#296ef9);color:#fff"><i class="bi bi-signpost-2-fill"></i></div>'
          + '  <div style="flex:1;min-width:0">'
          + '    <div class="lv-name">' + esc(m.title || '-') + '</div>'
          + '    <div class="lv-no">' + esc(m.mission_no) + ' · ' + esc(m.requester && m.requester.full_name ? m.requester.full_name : '-') + '</div>'
          + '  </div>'
          + '  <span class="badge b-' + esc(m.status_tone || 'slate') + '">' + esc(m.status_label || m.status) + '</span>'
          + '</div>'
          + '<div class="lv-row"><span class="lv-meta"><i class="bi bi-geo-alt-fill"></i> ' + esc(m.destination || '-') + '</span></div>'
          + '<div class="lv-row" style="margin-top:8px;align-items:flex-end;justify-content:space-between">'
          + '  <div style="font-size:12px;color:#475569"><i class="bi bi-calendar3"></i> ' + TH.date(m.start_date) + ' → ' + TH.date(m.end_date) + '</div>'
          + '  <div class="lv-days">฿' + Number(m.expense_total || 0).toLocaleString() + '</div>'
          + '</div>'
          + '</a>';
      }).join('');
      $('#mis-box').innerHTML = rows || '<div class="empty-state"><i class="bi bi-inbox"></i><p>ไม่พบรายการ</p></div>';
    }
    function load() {
      Spinner.show('กำลังโหลดงานออกนอกพื้นที่...', { stages: ['อ่านรายการ','คำนวณค่าใช้จ่าย','จัดเรียง'] });
      call('mission.list', st).then(function (r) { Spinner.hide(); render(r.items || []); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
    }
    $('#mis-add').addEventListener('click', function () { createMission(); });
    $('#mis-q').addEventListener('input', function () { st.q = this.value; load(); });
    $('#mis-status').addEventListener('change', function () { st.status = this.value; load(); });
    renderStatusOptions();
    load();
  };
  Routes['#/missions/view'] = function (hash) {
    var id = (hash || location.hash).split('?id=')[1] || '';
    if (!id) { toast('ไม่พบรายการ', 'error'); location.hash = '#/missions'; return; }
    setPage(skBlocks(1, 180) + skBlocks(2, 100));
    Spinner.show('กำลังโหลดรายการ...');
    call('mission.get', { id: id }).then(function (d) {
      Spinner.hide();
      renderMissionDetail(d);
    }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
  };
  function renderMissionDetail(d) {
    var m = d.mission;
    var canApprove = hasCap('mission.approve');
    function refreshMission() {
      try { history.replaceState(null, '', location.pathname + location.search + '#/missions/view?id=' + encodeURIComponent(m.id)); } catch (e) { location.hash = '#/missions/view?id=' + encodeURIComponent(m.id); }
      if (window.LMS && typeof LMS.dispatch === 'function') LMS.dispatch();
      else location.reload();
    }
    var html = '<div class="hero" style="margin-bottom:14px">'
      + '<span class="hero-pill"><i class="bi bi-signpost-2-fill"></i> งานออกนอกพื้นที่</span>'
      + '<div class="hero-greet">' + esc(m.title || '-') + '</div>'
      + '<div class="hero-sub">' + esc(m.mission_no) + ' · ' + esc((m.requester && m.requester.full_name) || '-') + '</div>'
      + '<div class="hero-kpi"><div class="hkpi"><div class="hkpi-label"><i class="bi bi-geo-alt-fill"></i> ปลายทาง</div><div class="hkpi-value" style="font-size:18px">' + esc(m.destination || '-') + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-calendar-range"></i> ช่วงงาน</div><div class="hkpi-value" style="font-size:18px">' + TH.date(m.start_date) + ' → ' + TH.date(m.end_date) + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-cash-coin"></i> ค่าใช้จ่ายสะสม</div><div class="hkpi-value" style="font-size:18px">฿' + Number(m.expense_total || 0).toLocaleString() + '</div></div></div>'
      + '</div>'
      + '<div class="card" style="margin-bottom:14px"><div class="card-body">'
      + '<div class="grid-2">'
      + detailField('วัตถุประสงค์', esc(m.purpose || '-'))
      + detailField('สถานะ', '<span class="badge b-' + esc(m.status_tone) + '">' + esc(m.status_label) + '</span>')
      + detailField('การอนุมัติ', esc(m.approver_comment || '-'))
      + detailField('งบที่อนุมัติ', m.approved_amount ? '฿' + Number(m.approved_amount).toLocaleString() : '-')
      + '</div>'
      + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">'
      + (hasCap('expense.create_own') ? '<a class="btn btn-primary" href="#/expenses/new?mission_id=' + encodeURIComponent(m.id) + '"><i class="bi bi-cash-coin"></i> เบิกค่าใช้จ่ายสำหรับงานนี้</a>' : '')
      + (canApprove && m.status === 'pending' ? '<button class="btn btn-success" id="mis-approve"><i class="bi bi-check2-circle"></i> อนุมัติ</button><button class="btn btn-danger" id="mis-reject"><i class="bi bi-x-circle"></i> ไม่อนุมัติ</button>' : '')
      + (canApprove ? '<button class="btn btn-ghost" id="mis-delete" style="color:#dc2626"><i class="bi bi-trash-fill"></i> ลบใบเดินทาง</button>' : '')
      + '<a class="btn btn-ghost" href="#/missions"><i class="bi bi-arrow-left"></i> กลับรายการ</a>'
      + '</div></div></div>';
    setPage(html);

    if ($('#mis-approve')) $('#mis-approve').addEventListener('click', function () {
      Swal.fire({ title: 'อนุมัติรายการ?', input: 'number', inputPlaceholder: 'งบที่อนุมัติ (ถ้ามี)', showCancelButton: true, confirmButtonText: 'อนุมัติ' })
        .then(function (r) {
          if (!r.isConfirmed) return;
          Spinner.show('กำลังอนุมัติ...');
          call('mission.approve', { id: m.id, decision: 'approved', approved_amount: r.value || '' }).then(function () { Spinner.hide(); toast('อนุมัติแล้ว', 'success'); refreshMission(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
        });
    });
    if ($('#mis-reject')) $('#mis-reject').addEventListener('click', function () {
      Swal.fire({ title: 'ไม่อนุมัติ?', input: 'textarea', inputPlaceholder: 'ระบุเหตุผล', showCancelButton: true, confirmButtonText: 'ยืนยัน' })
        .then(function (r) {
          if (!r.isConfirmed) return;
          Spinner.show('กำลังบันทึก...');
          call('mission.approve', { id: m.id, decision: 'rejected', comment: r.value || '' }).then(function () { Spinner.hide(); toast('บันทึกแล้ว', 'success'); refreshMission(); }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
        });
    });
    if ($('#mis-delete')) $('#mis-delete').addEventListener('click', function () {
      confirmModal({ title: 'ลบใบเดินทาง?', message: 'การลบจะยกเลิกการเชื่อมโยงกับค่าใช้จ่ายที่แนบด้วย และไม่สามารถย้อนกลับได้', okText: 'ลบ', danger: true }).then(function (ok) {
        if (!ok) return;
        Spinner.show('กำลังลบใบเดินทาง...');
        call('mission.delete', { id: m.id }).then(function () { Spinner.hide(); toast('ลบใบเดินทางแล้ว', 'success'); location.hash = '#/missions'; }).catch(function (e) { Spinner.hide(); alertError('ผิดพลาด', e.message); });
      });
    });
  }

  // ── Standalone Expenses Page (#/expenses) ──────────────────
  Routes['#/expenses'] = function (hash) {
    if (!hasCap('expense.create_own|expense.manage')) { toast('ไม่มีสิทธิ์', 'warning'); location.hash = '#/dashboard'; return; }
    
    var params = {};
    if (hash.indexOf('?') >= 0) {
      hash.split('?')[1].split('&').forEach(function (pair) {
        var parts = pair.split('=');
        if (parts[0]) params[parts[0]] = decodeURIComponent(parts[1] || '');
      });
    }
    
    var isPendingExpenseView = params.status === 'pending';
    var st = { q: '', status: params.status || '', month: isPendingExpenseView ? '' : _mkMonthKey(new Date()) };
    var pageTitle = isPendingExpenseView ? 'ใบเบิกรอดำเนินการ' : 'ระบบเบิกค่าใช้จ่าย';
    var pageSub = isPendingExpenseView ? 'รายการใบเบิกที่รอตรวจสอบและอนุมัติ' : 'จัดการและติดตามคำขอเบิกเงินสะสม/ค่าเดินทาง';

    if (hash.split('?')[0] === '#/expenses/new' || params.new === '1') {
      renderExpenseFullPage(params.mission_id || '');
      return;
    }
    
    setPage('<div class="card" style="margin-bottom:14px"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + '<div style="flex:1;min-width:220px"><div style="font-weight:800;font-size:18px">' + esc(pageTitle) + '</div><div style="font-size:12px;color:#64748b">' + esc(pageSub) + '</div></div>'
      + '<input class="input" id="exp-q" style="max-width:220px" placeholder="ค้นหาผู้ขอเบิก / เลขที่ / รายละเอียด">'
      + '<select class="select" id="exp-status" style="max-width:150px"><option value="">ทุกสถานะ</option></select>'
      + '<input type="month" class="input" id="exp-month" style="max-width:150px">'
      + '<button class="btn btn-primary" id="exp-add"><i class="bi bi-plus-lg"></i> ยื่นเบิกค่าใช้จ่าย</button>'
      + '</div></div>'
      + '<div id="exp-box">' + skBlocks(5, 92) + '</div>');
      
    if ($('#exp-month')) $('#exp-month').value = st.month;
    
    var statuses = LMS.Store.boot.statuses || {};
    if ($('#exp-status')) {
      $('#exp-status').innerHTML = '<option value="">ทุกสถานะ</option>' + Object.keys(statuses).map(function (s) {
        return '<option value="' + s + '"' + (st.status === s ? ' selected' : '') + '>' + esc(statuses[s]) + '</option>';
      }).join('');
    }
    
    function render(data) {
      $('#exp-box').innerHTML = expenseCardList(data.items || [], isPendingExpenseView);
    }
    
    function load() {
      st.q = $('#exp-q').value;
      st.status = $('#exp-status').value;
      st.month = $('#exp-month').value;
      
      Spinner.show('กำลังโหลดรายการเบิก...');
      call('expense.list', st).then(function (r) {
        Spinner.hide();
        render(r);
      }).catch(function (e) {
        Spinner.hide();
        alertError('ผิดพลาด', e.message);
      });
    }
    
    $('#exp-q').addEventListener('input', load);
    $('#exp-status').addEventListener('change', load);
    $('#exp-month').addEventListener('change', load);

    function expenseCardList(items, pendingMode) {
      if (!items || items.length === 0) {
        return emptyState('receipt-cutoff', pendingMode ? 'ไม่พบใบเบิกรอดำเนินการ' : 'ไม่มีรายการเบิกค่าใช้จ่าย');
      }
      return '<div class="card-list expense-card-list">' + items.map(function (x) {
        var requester = x.requester || {};
        var requesterName = requester.full_name || '-';
        var initial = (requesterName || '?').substring(0, 1).toUpperCase();
        var avatar = requester.avatar ? '<img src="' + esc(requester.avatar) + '" alt="">' : initial;
        var missionLabel = x.mission_no ? '<span class="lv-meta"><i class="bi bi-signpost-2-fill"></i> ' + esc(x.mission_no) + '</span>' : '';
        var amount = Number(x.amount || 0).toLocaleString();
        return '<a href="#/expenses/view?id=' + esc(x.id) + '" class="lv-card expense-card">'
          + '<div class="lv-card-head">'
          + '  <div class="lv-avatar expense-avatar">' + avatar + '</div>'
          + '  <div style="flex:1;min-width:0">'
          + '    <div class="lv-name">' + esc(requesterName) + '</div>'
          + '    <div class="lv-no">' + esc(x.expense_no || '-') + '</div>'
          + '  </div>'
          + '  <span class="badge b-' + esc(x.status_tone || 'slate') + '">' + esc(x.status_label || x.status || '-') + '</span>'
          + '</div>'
          + '<div class="lv-row">'
          + '  <span class="lv-meta"><i class="bi bi-receipt-cutoff"></i> ' + esc(x.expense_type || '-') + '</span>'
          + missionLabel
          + '</div>'
          + '<div class="lv-row expense-desc">' + esc(x.description || '-') + '</div>'
          + '<div class="lv-row" style="margin-top:8px;align-items:flex-end;justify-content:space-between">'
          + '  <div style="font-size:12px;color:#475569"><i class="bi bi-calendar3"></i> ' + TH.date(x.expense_date) + '</div>'
          + '  <div class="lv-days expense-amount">฿' + amount + '</div>'
          + '</div>'
          + '</a>';
      }).join('') + '</div>';
    }

    function expenseTypeOptions(selectedType) {
      var types = ['ค่าเดินทาง', 'ค่าอาหาร', 'ค่าที่พัก', 'ค่าทางด่วน', 'อื่น ๆ'];
      return types.map(function (t) {
        var sel = (selectedType === t || (!selectedType && t === 'ค่าเดินทาง')) ? ' selected' : '';
        return '<option value="' + t + '"' + sel + '>' + t + '</option>';
      }).join('');
    }

    function expenseMissionOptions(missions, selectedMissionId) {
      return '<option value="">-- ไม่เชื่อมโยงงาน --</option>' + (missions || []).map(function (m) {
        var sel = (String(m.id) === String(selectedMissionId || '')) ? ' selected' : '';
        return '<option value="' + m.id + '"' + sel + '>' + esc(m.mission_no) + ' : ' + esc(m.title) + ' (' + esc(m.destination) + ')</option>';
      }).join('');
    }

    function expenseFormHtml(typeOpts, missionOpts, preset) {
      preset = preset || {};
      var evidenceNote = preset.receipt_url ? 'มีหลักฐานแนบอยู่แล้ว (เลือกไฟล์ใหม่หากต้องการเปลี่ยน)' : 'แนบรูปภาพหลักฐานการจ่ายเงิน';
      return '<div class="expense-form-shell">'
        + '<div class="wiz-section expense-form-section">'
        + '  <div class="wiz-section-icon"><i class="bi bi-receipt-cutoff"></i></div>'
        + '  <div><div class="wiz-section-title">รายละเอียดใบเบิก</div><div class="wiz-section-sub">ระบุรายการ ค่าใช้จ่าย และวันที่ใช้งาน</div></div>'
        + '</div>'
        + '<div class="grid-2">'
        + '  <div class="field"><label>ประเภทค่าใช้จ่าย <span class="req">*</span></label><select id="fe-type" class="select">' + typeOpts + '</select></div>'
        + '  <div class="field"><label>จำนวนเงิน (บาท) <span class="req">*</span></label><input id="fe-amt" type="number" class="input" value="' + (preset.amount || '') + '" placeholder="0.00"></div>'
        + '</div>'
        + '<div class="field"><label>รายละเอียด / หัวข้อ <span class="req">*</span></label><input id="fe-desc" class="input" placeholder="เช่น ค่ารถแท็กซี่ไปพบลูกค้า" value="' + esc(preset.description || '') + '"></div>'
        + '<div class="grid-2">'
        + '  <div class="field"><label>วันที่ใช้จ่าย <span class="req">*</span></label><input id="fe-date" type="date" class="input" value="' + (preset.expense_date || TH.iso(new Date())) + '"></div>'
        + '  <div class="field"><label>เชื่อมโยงกับงานออกนอกพื้นที่</label><select id="fe-mission" class="select">' + missionOpts + '</select></div>'
        + '</div>'
        + '<div class="wiz-section expense-form-section">'
        + '  <div class="wiz-section-icon"><i class="bi bi-image-fill"></i></div>'
        + '  <div><div class="wiz-section-title">หลักฐานการจ่ายเงิน</div><div class="wiz-section-sub">แนบรูปใบเสร็จหรือสลิปเพื่อประกอบการอนุมัติ</div></div>'
        + '</div>'
        + '<div class="field"><label>แนบหลักฐานการจ่ายเงิน (รูปภาพ)</label><input id="fe-file" type="file" accept="image/*" class="input"><div id="fe-file-note" class="field-hint">' + evidenceNote + '</div></div>'
        + '</div>';
    }

    function bindExpenseFileNote(evidenceNote) {
      var fi = document.getElementById('fe-file');
      var note = document.getElementById('fe-file-note');
      if (!fi) return;
      fi.addEventListener('change', function () {
        var file = fi.files && fi.files[0];
        if (!file) {
          if (note) note.textContent = evidenceNote;
          return;
        }
        if (note) note.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;color:#10b981"><i class="bi bi-image"></i> ' + esc(file.name) + '</span>';
      });
    }

    function collectExpensePayload(preset) {
      preset = preset || {};
      var fileInput = document.getElementById('fe-file');
      var file = fileInput && fileInput.files && fileInput.files[0];
      var amt = parseFloat(document.getElementById('fe-amt').value);
      var desc = document.getElementById('fe-desc').value.trim();
      var date = document.getElementById('fe-date').value;

      if (!desc) return Promise.reject(new Error('กรุณาระบุรายละเอียด/หัวข้อ'));
      if (isNaN(amt) || amt <= 0) return Promise.reject(new Error('กรุณาระบุจำนวนเงินที่มากกว่า 0'));
      if (!date) return Promise.reject(new Error('กรุณาระบุวันที่ใช้จ่าย'));

      var payload = {
        id: preset.id || '',
        expense_type: document.getElementById('fe-type').value,
        description: desc,
        amount: amt,
        expense_date: date,
        mission_id: document.getElementById('fe-mission').value,
        receipt_url: preset.receipt_url || ''
      };

      if (!file) return Promise.resolve(payload);

      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) {
          var img = new Image();
          img.onload = function () {
            var max_size = 600;
            var quality = 0.5;
            var dataUrl = '';
            var attempt = 0;
            while (attempt < 5) {
              var canvas = document.createElement('canvas');
              var w = img.width;
              var h = img.height;
              if (w > h) {
                if (w > max_size) { h *= max_size / w; w = max_size; }
              } else {
                if (h > max_size) { w *= max_size / h; h = max_size; }
              }
              canvas.width = w; canvas.height = h;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              try {
                dataUrl = canvas.toDataURL('image/jpeg', quality);
              } catch (err) {
                dataUrl = e.target.result;
                break;
              }
              if (dataUrl.length <= 48000) break;
              max_size = Math.round(max_size * 0.8);
              quality = Math.max(0.2, quality - 0.1);
              attempt++;
            }
            payload.receipt_url = dataUrl || e.target.result;
            resolve(payload);
          };
          img.onerror = function () {
            payload.receipt_url = e.target.result;
            resolve(payload);
          };
          img.src = e.target.result;
        };
        reader.onerror = function () { resolve(payload); };
        reader.readAsDataURL(file);
      });
    }

    function saveExpense(payload, isEdit, onDone) {
      Spinner.show('กำลังบันทึกใบเบิก...');
      call(isEdit ? 'expense.update' : 'expense.create', payload).then(function (r) {
        Spinner.hide();
        toast('บันทึกใบเบิกเรียบร้อย', 'success');
        if (onDone) onDone(r);
      }).catch(function (err) {
        Spinner.hide();
        alertError('ผิดพลาด', err.message);
      });
    }

    function renderExpenseFullPage(preloadMissionId) {
      Spinner.show('กำลังโหลดข้อมูลฟอร์ม...');
      call('mission.list', {}).then(function (res) {
        Spinner.hide();
        var missions = res.items || [];
        var typeOpts = expenseTypeOptions('');
        var missionOpts = expenseMissionOptions(missions, preloadMissionId);
        var evidenceNote = 'แนบรูปภาพหลักฐานการจ่ายเงิน';
        setPage('<div class="expense-page-form">'
          + '<div class="expense-page-title">ยื่นใบเบิกค่าใช้จ่าย</div>'
          + '<div class="wiz expense-full-form">'
          + '<div class="wiz-pane">' + expenseFormHtml(typeOpts, missionOpts, {}) + '</div>'
          + '<div class="expense-form-actions">'
          + '<button class="btn btn-primary" id="exp-submit"><i class="bi bi-send-fill"></i> ส่งคำขอเบิก</button>'
          + '<button class="btn btn-danger" id="exp-draft"><i class="bi bi-save"></i> บันทึกแบบร่าง</button>'
          + '<a class="btn btn-secondary" href="#/expenses"><i class="bi bi-x-lg"></i> ยกเลิก</a>'
          + '</div>'
          + '</div>'
          + '</div>');
        bindExpenseFileNote(evidenceNote);
        $('#exp-submit').addEventListener('click', function () {
          collectExpensePayload({}).then(function (payload) {
            saveExpense(payload, false, function () { location.hash = '#/expenses'; });
          }).catch(function (err) { alertError('ตรวจสอบข้อมูล', err.message); });
        });
        $('#exp-draft').addEventListener('click', function () {
          collectExpensePayload({}).then(function (payload) {
            payload.draft = true;
            saveExpense(payload, false, function () { location.hash = '#/expenses'; });
          }).catch(function (err) { alertError('ตรวจสอบข้อมูล', err.message); });
        });
      }).catch(function (e) {
        Spinner.hide();
        alertError('ผิดพลาด', e.message);
      });
    }
    
    function openExpenseForm(preloadMissionId, isEditFlow, existingData) {
      Spinner.show('กำลังโหลดข้อมูลฟอร์ม...');
      call('mission.list', {}).then(function (res) {
        Spinner.hide();
        var missions = res.items || [];
        var preset = existingData || {};
        var missionOpts = expenseMissionOptions(missions, preloadMissionId || preset.mission_id);
        var typeOpts = expenseTypeOptions(preset.expense_type);
        
        var isEdit = !!preset.id;
        var modalTitle = isEdit ? 'แก้ไขใบเบิกค่าใช้จ่าย' : 'ยื่นใบเบิกค่าใช้จ่าย';
        var evidenceNote = preset.receipt_url ? 'มีหลักฐานแนบอยู่แล้ว (เลือกไฟล์ใหม่หากต้องการเปลี่ยน)' : 'แนบรูปภาพหลักฐานการจ่ายเงิน';
        
        var html = expenseFormHtml(typeOpts, missionOpts, preset);
          
        Swal.fire({
          title: modalTitle,
          html: html,
          width: '760px',
          customClass: { popup: 'expense-form-popup' },
          showCancelButton: true,
          showDenyButton: !isEdit || preset.status === 'draft',
          confirmButtonText: isEdit ? 'บันทึก' : 'ส่งคำขอเบิก',
          denyButtonText: 'บันทึกแบบร่าง',
          cancelButtonText: 'ยกเลิก',
          focusConfirm: false,
          didOpen: function () {
            bindExpenseFileNote(evidenceNote);
          },
          preConfirm: function () {
            return collectExpensePayload(preset).catch(function (err) {
              Swal.showValidationMessage(err.message);
              return false;
            });
          }
        }).then(function (result) {
          if (result.isDismissed) return;
          
          var payload = result.value;
          if (result.isDenied) {
            payload.draft = true;
          }
          
          saveExpense(payload, isEdit, load);
        });
      }).catch(function (e) {
        Spinner.hide();
        alertError('ผิดพลาด', e.message);
      });
    }
    
    $('#exp-add').addEventListener('click', function () {
      location.hash = '#/expenses/new';
    });
    
    if (params.edit) {
      Spinner.show('กำลังโหลดข้อมูลใบเบิก...');
      call('expense.get', { id: params.edit }).then(function (r) {
        Spinner.hide();
        openExpenseForm('', true, r.expense);
      }).catch(function (e) {
        Spinner.hide();
        alertError('ผิดพลาด', e.message);
      });
    }
    
    load();
  };

  // ── Standalone Expense Detail View Page (#/expenses/view) ─────
  Routes['#/expenses/view'] = function (hash) {
    var id = (hash || location.hash).split('?id=')[1] || '';
    if (!id) { toast('ไม่พบรายการ', 'error'); location.hash = '#/expenses'; return; }
    
    setPage(skBlocks(1, 180) + skBlocks(2, 100));
    Spinner.show('กำลังโหลดรายการ...');
    
    call('expense.get', { id: id }).then(function (d) {
      Spinner.hide();
      renderExpenseDetail(d);
    }).catch(function (e) {
      Spinner.hide();
      alertError('ผิดพลาด', e.message);
      location.hash = '#/expenses';
    });
  };
  
  function renderExpenseDetail(d) {
    var ex = d.expense;
    var u = LMS.Store.user || {};
    var isOwner = String(ex.created_by) === String(u.id);
    var canApprove = hasCap('expense.manage');
    
    var missionLabel = ex.mission_no ? (ex.mission_title ? ex.mission_no + ' : ' + ex.mission_title : ex.mission_no) : '-';
    var missionLink = ex.mission_id ? '<a href="#/missions/view?id=' + encodeURIComponent(ex.mission_id) + '" style="font-weight:600"><i class="bi bi-signpost-2-fill"></i> ' + esc(missionLabel) + '</a>' : '-';
    
    var receiptHtml = ex.receipt_url
      ? '<div style="margin-top:10px;"><div style="font-weight:600;font-size:13px;color:#475569;margin-bottom:6px;">หลักฐานการจ่ายเงิน</div>'
        + '<img src="' + esc(ex.receipt_url) + '" id="receipt-preview" style="max-width:240px;max-height:180px;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;object-fit:contain;box-shadow:0 4px 12px rgba(0,0,0,0.06);">'
        + '<div style="font-size:11px;color:#94a3b8;margin-top:4px;"><i class="bi bi-zoom-in"></i> คลิกที่รูปเพื่อขยายใหญ่</div></div>'
      : '<div style="margin-top:10px;color:#94a3b8;font-size:13px;"><i class="bi bi-image-alt"></i> ไม่มีหลักฐานการจ่ายเงินแนบมา</div>';
      
    var html = '<div class="hero" style="margin-bottom:14px">'
      + '<span class="hero-pill"><i class="bi bi-cash-coin"></i> ใบเบิกค่าใช้จ่าย</span>'
      + '<div class="hero-greet">' + esc(ex.description || '-') + '</div>'
      + '<div class="hero-sub">' + esc(ex.expense_no) + ' · ' + esc((ex.requester && ex.requester.full_name) || '-') + '</div>'
      + '<div class="hero-kpi">'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-calendar-event"></i> วันที่ใช้จ่าย</div><div class="hkpi-value" style="font-size:18px">' + TH.date(ex.expense_date) + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-tag-fill"></i> ประเภท</div><div class="hkpi-value" style="font-size:18px">' + esc(ex.expense_type) + '</div></div>'
      + '<div class="hkpi"><div class="hkpi-label"><i class="bi bi-cash"></i> ยอดเบิก</div><div class="hkpi-value" style="font-size:18px;color:#ef4444">฿' + Number(ex.amount || 0).toLocaleString() + '</div></div>'
      + '</div>'
      + '</div>'
      + '<div class="grid-2" style="margin-bottom:14px">'
      + '<div class="card"><div class="card-head"><i class="bi bi-info-circle-fill" style="color:#024ad8"></i> <span class="card-title">ข้อมูลใบเบิก</span></div>'
      + '<div class="card-body">'
      + '<div style="display:grid;gap:12px;">'
      + detailField('ผู้ขอเบิก', esc((ex.requester && ex.requester.full_name) || '-') + ' (' + esc((ex.requester && ex.requester.department) || '-') + ')')
      + detailField('สถานะใบเบิก', '<span class="badge b-' + esc(ex.status_tone) + '">' + esc(ex.status_label) + '</span>')
      + detailField('เชื่อมโยงงานออกนอกพื้นที่', missionLink)
      + '</div>'
      + '</div></div>'
      + '<div class="card"><div class="card-head"><i class="bi bi-card-image" style="color:#10b981"></i> <span class="card-title">หลักฐาน/เอกสารแนบ</span></div>'
      + '<div class="card-body">'
      + receiptHtml
      + '</div></div>'
      + '</div>';
      
    var approvalDetails = '';
    if (ex.status === 'approved' || ex.status === 'rejected') {
      var commentLabel = ex.status === 'approved' ? 'หมายเหตุการอนุมัติ' : 'เหตุผลที่ปฏิเสธ';
      approvalDetails = '<div class="card" style="margin-bottom:14px"><div class="card-head"><i class="bi bi-shield-check" style="color:#10b981"></i> <span class="card-title">ผลการพิจารณา</span></div>'
        + '<div class="card-body"><div class="grid-2">'
        + detailField('ยอดเงินที่อนุมัติ', ex.approved_amount != null && ex.approved_amount !== '' ? '<strong style="color:#10b981;font-size:16px;">฿' + Number(ex.approved_amount).toLocaleString() + '</strong>' : '-')
        + detailField('วันเวลาที่พิจารณา', ex.approver_at ? TH.dateTime(ex.approver_at) : '-')
        + detailField(commentLabel, esc(ex.approver_comment || '-'))
        + '</div></div></div>';
    }
    
    html += approvalDetails;
    
    var actionButtons = '';
    
    if (canApprove && ex.status === 'pending') {
      actionButtons += '<button class="btn btn-success" id="exp-approve"><i class="bi bi-check2-circle"></i> อนุมัติ</button>'
        + '<button class="btn btn-danger" id="exp-reject"><i class="bi bi-x-circle"></i> ปฏิเสธการเบิก</button>';
    }
    
    if (isOwner && ex.status === 'draft') {
      actionButtons += '<button class="btn btn-primary" id="exp-submit"><i class="bi bi-send-fill"></i> ส่งขออนุมัติ</button>'
        + '<button class="btn btn-success" id="exp-edit"><i class="bi bi-pencil-fill"></i> แก้ไข</button>'
        + '<button class="btn btn-danger" id="exp-delete"><i class="bi bi-trash-fill"></i> ลบใบเบิก</button>';
    }
    
    if (isOwner && ex.status === 'pending') {
      actionButtons += '<button class="btn btn-ghost" id="exp-cancel" style="color:#ef4444;"><i class="bi bi-x-circle-fill"></i> ยกเลิกคำขอ</button>';
    }
    
    if (ex.status !== 'draft') {
      actionButtons += '<button class="btn btn-primary" id="exp-print"><i class="bi bi-printer-fill"></i> พิมพ์ใบเบิกเงิน</button>';
    }
    
    actionButtons += '<a class="btn btn-ghost" href="#/expenses"><i class="bi bi-arrow-left"></i> กลับรายการ</a>';
    
    html += '<div class="card"><div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;">' + actionButtons + '</div></div>';
    
    setPage(html);
    
    function refreshDetail() {
      LMS.dispatch();
    }
    
    if ($('#receipt-preview')) {
      $('#receipt-preview').addEventListener('click', function () {
        Swal.fire({
          imageUrl: ex.receipt_url,
          imageAlt: 'หลักฐานการจ่ายเงิน',
          showConfirmButton: false,
          showCloseButton: true,
          width: 'auto',
          maxWidth: '80%'
        });
      });
    }
    
    if ($('#exp-approve')) {
      $('#exp-approve').addEventListener('click', function () {
        Swal.fire({
          title: 'อนุมัติการเบิกเงิน?',
          html: '<div style="text-align:left;display:grid;gap:8px;">'
            + '<label style="font-weight:600;">ยอดเงินที่อนุมัติ (บาท)</label>'
            + '<input type="number" id="app-amt" class="input" value="' + ex.amount + '">'
            + '<label style="font-weight:600;">หมายเหตุการอนุมัติ (ถ้ามี)</label>'
            + '<textarea id="app-comment" class="textarea" rows="2"></textarea>'
            + '</div>',
          showCancelButton: true,
          confirmButtonText: 'อนุมัติ',
          cancelButtonText: 'ยกเลิก',
          preConfirm: function () {
            var amt = parseFloat(document.getElementById('app-amt').value);
            if (isNaN(amt) || amt <= 0) { Swal.showValidationMessage('กรุณาระบุจำนวนเงินที่มากกว่า 0'); return false; }
            return {
              approved_amount: amt,
              comment: document.getElementById('app-comment').value.trim()
            };
          }
        }).then(function (r) {
          if (!r.isConfirmed) return;
          Spinner.show('กำลังบันทึกอนุมัติ...');
          call('expense.approve', { id: ex.id, decision: 'approved', approved_amount: r.value.approved_amount, comment: r.value.comment }).then(function () {
            Spinner.hide();
            toast('อนุมัติคำขอเบิกเงินแล้ว', 'success');
            refreshDetail();
          }).catch(function (e) {
            Spinner.hide();
            alertError('ผิดพลาด', e.message);
          });
        });
      });
    }
    
    if ($('#exp-reject')) {
      $('#exp-reject').addEventListener('click', function () {
        Swal.fire({
          title: 'ปฏิเสธการเบิกเงิน?',
          html: '<div style="text-align:left;display:grid;gap:8px;">'
            + '<label style="font-weight:600;">เหตุผลที่ปฏิเสธการเบิก <span class="req">*</span></label>'
            + '<textarea id="app-comment" class="textarea" rows="3" placeholder="ระบุเหตุผลในการปฏิเสธคำขอ"></textarea>'
            + '</div>',
          showCancelButton: true,
          confirmButtonText: 'ปฏิเสธ',
          cancelButtonText: 'ยกเลิก',
          preConfirm: function () {
            var comment = document.getElementById('app-comment').value.trim();
            if (!comment) { Swal.showValidationMessage('กรุณาระบุเหตุผล'); return false; }
            return comment;
          }
        }).then(function (r) {
          if (!r.isConfirmed) return;
          Spinner.show('กำลังบันทึก...');
          call('expense.approve', { id: ex.id, decision: 'rejected', comment: r.value }).then(function () {
            Spinner.hide();
            toast('ปฏิเสธคำขอเบิกเงินแล้ว', 'success');
            refreshDetail();
          }).catch(function (e) {
            Spinner.hide();
            alertError('ผิดพลาด', e.message);
          });
        });
      });
    }
    
    if ($('#exp-submit')) {
      $('#exp-submit').addEventListener('click', function () {
        confirmModal({ title: 'ส่งขออนุมัติ?', message: 'ส่งใบเบิกนี้เพื่อเข้าสู่ขั้นตอนการพิจารณาและส่งเมลแจ้งเตือนถึง HR' }).then(function (ok) {
          if (!ok) return;
          Spinner.show('กำลังส่งขออนุมัติ...');
          call('expense.submit', { id: ex.id }).then(function () {
            Spinner.hide();
            toast('ส่งใบเบิกสำเร็จ', 'success');
            refreshDetail();
          }).catch(function (e) {
            Spinner.hide();
            alertError('ผิดพลาด', e.message);
          });
        });
      });
    }
    
    if ($('#exp-edit')) {
      $('#exp-edit').addEventListener('click', function () {
        location.hash = '#/expenses?edit=' + ex.id;
      });
    }
    
    if ($('#exp-delete')) {
      $('#exp-delete').addEventListener('click', function () {
        confirmModal({ title: 'ลบใบเบิก?', message: 'คุณแน่ใจว่าต้องการลบใบเบิกนี้? ข้อมูลจะไม่สามารถกู้คืนได้', okText: 'ลบ', danger: true }).then(function (ok) {
          if (!ok) return;
          Spinner.show('กำลังลบใบเบิก...');
          call('expense.delete', { id: ex.id }).then(function () {
            Spinner.hide();
            toast('ลบใบเบิกเรียบร้อย', 'success');
            location.hash = '#/expenses';
          }).catch(function (e) {
            Spinner.hide();
            alertError('ผิดพลาด', e.message);
          });
        });
      });
    }
    
    if ($('#exp-cancel')) {
      $('#exp-cancel').addEventListener('click', function () {
        confirmModal({ title: 'ยกเลิกคำขอเบิกเงิน?', message: 'คุณแน่ใจว่าต้องการยกเลิกคำขอใบเบิกนี้?', danger: true }).then(function (ok) {
          if (!ok) return;
          Spinner.show('กำลังยกเลิกคำขอ...');
          call('expense.cancel', { id: ex.id }).then(function () {
            Spinner.hide();
            toast('ยกเลิกใบเบิกเรียบร้อย', 'success');
            refreshDetail();
          }).catch(function (e) {
            Spinner.hide();
            alertError('ผิดพลาด', e.message);
          });
        });
      });
    }
    
    if ($('#exp-print')) {
      $('#exp-print').addEventListener('click', function () {
        var w = window.open('', '_blank');
        var org = d.org || {};
        var slipImg = ex.receipt_url ? '<div class="evidence-wrap"><img src="' + esc(ex.receipt_url) + '" class="evidence-img"></div>' : '';
        
        var html = '<html><head><title>ใบเบิกเงินและขออนุมัติค่าใช้จ่าย</title><style>'
          + '@import url("https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&display=swap");'
          + '@page{size:A4 portrait;margin:10mm;}'
          + '*{box-sizing:border-box;}'
          + 'body{font-family:"Sarabun",sans-serif;padding:0;font-size:12px;color:#000;line-height:1.28;}'
          + '.header{text-align:center;font-weight:bold;font-size:17px;margin:12px 0 14px;text-transform:uppercase;letter-spacing:.4px;}'
          + '.company-title{font-size:14px;font-weight:bold;margin-bottom:3px;}'
          + 'table{width:100%;border-collapse:collapse;margin:10px 0 8px;}th,td{border:1px solid #000;padding:5px 7px;text-align:left;vertical-align:top;}th{text-align:center;background:#f8fafc;}'
          + '.center{text-align:center;}.right{text-align:right;}'
          + '.signature-box{display:flex;justify-content:space-around;margin-top:18px;}'
          + '.sig-line{text-align:center;width:220px;font-size:11px;}.sig-line div{border-bottom:1px dotted #000;height:18px;margin-bottom:4px;}'
          + '.dotted{border-bottom:1px dotted #000;display:inline-block;padding:0 8px;}'
          + '.evidence-title{font-weight:bold;margin:10px 0 6px;}'
          + '.evidence-wrap{text-align:center;margin-top:4px;page-break-inside:avoid;break-inside:avoid;}'
          + '.evidence-img{display:block;width:auto;max-width:86%;max-height:245px;object-fit:contain;margin:0 auto;border:1px solid #ccc;border-radius:4px;}'
          + '@media print{.evidence-img{max-height:245px;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}'
          + '</style></head><body>'
          + '<div>'
          + '  <div class="company-title">บริษัท ' + esc(org.org_name || '.......................................') + ' จำกัด</div>'
          + '  <div style="margin-top:3px;">ที่อยู่ ' + esc(org.org_address || '..............................................................................') + '</div>'
          + '  <div style="margin-top:3px;">เบอร์โทรศัพท์ <span class="dotted" style="width:150px;">' + esc(org.org_phone || '-') + '</span></div>'
          + '</div>'
          + '<div class="header">ใบขออนุมัติจ่าย / ใบเบิกเงินค่าใช้จ่าย</div>'
          + '<div style="text-align:right;margin-bottom:12px;">เลขที่ใบเบิก <strong class="dotted" style="width:120px;text-align:center;">' + esc(ex.expense_no) + '</strong> วันที่เบิก <span class="dotted" style="width:120px;text-align:center;">' + TH.date(ex.created_at) + '</span></div>'
          + '<div style="margin-bottom:7px;">ข้าพเจ้า <span class="dotted" style="width:220px;text-align:center;">' + esc((ex.requester && ex.requester.full_name) || '-') + '</span> แผนก/ฝ่าย <span class="dotted" style="width:150px;text-align:center;">' + esc((ex.requester && ex.requester.department) || '-') + '</span></div>'
          + '<div style="margin-bottom:7px;">มีความประสงค์ขออนุมัติเบิกเงินค่า <span class="dotted" style="width:150px;text-align:center;">' + esc(ex.expense_type) + '</span> ดังรายละเอียดต่อไปนี้:</div>'
          + '<table>'
          + '<thead><tr><th style="width:60px;">ลำดับ</th><th>รายละเอียดการใช้จ่าย</th><th style="width:150px;text-align:right;">จำนวนเงิน (บาท)</th></tr></thead>'
          + '<tbody>'
          + '<tr><td class="center">1</td><td>' + esc(ex.description) + ' (' + TH.date(ex.expense_date) + ')</td><td class="right">' + Number(ex.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2}) + '</td></tr>'
          + '<tr><td colspan="2"><div style="display:flex;justify-content:space-between;"><span>(ตัวอักษร) <span id="baht-text"></span></span><span style="font-weight:bold;">รวมเป็นเงินทั้งสิ้น</span></div></td><td class="right" style="font-weight:bold;">' + Number(ex.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2}) + '</td></tr>'
          + '</tbody>'
          + '</table>'
          + '<div style="margin-bottom:6px;font-size:11px;color:#475569;">* ยอดเงินที่ได้รับการอนุมัติจริง: <span class="dotted" style="width:120px;text-align:center;font-weight:bold;color:#10b981;">' + (ex.approved_amount != null && ex.approved_amount !== '' ? '฿' + Number(ex.approved_amount).toLocaleString(undefined, {minimumFractionDigits: 2}) : 'รอการพิจารณา') + '</span></div>'
          + '<div class="signature-box">'
          + '  <div class="sig-line"><div></div><span>ผู้ขอเบิกเงิน / ผู้รับเงิน</span><br><span style="font-size:12px;">( ' + esc((ex.requester && ex.requester.full_name) || '.......................................') + ' )</span></div>'
          + '  <div class="sig-line"><div></div><span>ผู้อนุมัติจ่าย</span><br><span style="font-size:12px;">( ....................................... )</span></div>'
          + '</div>'
          
          + '<div class="evidence-title">*** เอกสารหลักฐานประกอบการจ่ายเงิน</div>'
          + slipImg
          + ''
          + 'function tb(n){'
          + '  var num=parseFloat(n).toFixed(2);if(num==0)return"ศูนย์บาทถ้วน";'
          + '  var s=num.split("."),i=s[0],d=s[1],r="",tn=["ศูนย์","หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า","สิบ"],tu=["","สิบ","ร้อย","พัน","หมื่น","แสน","ล้าน"];'
          + '  for(var j=0;j<i.length;j++){'
          + '    var k=parseInt(i.charAt(j)),p=i.length-j-1;'
          + '    if(k!==0){'
          + '      if(p===1&&k===1)r+="สิบ";'
          + '      else if(p===1&&k===2)r+="ยี่สิบ";'
          + '      else if(p===0&&k===1&&i.length>1)r+="เอ็ด";'
          + '      else r+=tn[k]+tu[p];'
          + '    }'
          + '  }'
          + '  r+="บาท";'
          + '  if(d=="00")r+="ถ้วน";'
          + '  else{'
          + '    for(var j=0;j<d.length;j++){'
          + '      var k=parseInt(d.charAt(j)),p=d.length-j-1;'
          + '      if(k!==0){'
          + '        if(p===1&&k===1)r+="สิบ";'
          + '        else if(p===1&&k===2)r+="ยี่สิบ";'
          + '        else if(p===0&&k===1&&d.length>1)r+="เอ็ด";'
          + '        else r+=tn[k]+tu[p];'
          + '      }'
          + '    }'
          + '    r+="สตางค์";'
          + '  }'
          + '  return r;'
          + '}'
          + 'document.getElementById("baht-text").innerText=tb(' + Number(ex.amount || 0) + ');'
          + 'function triggerPrint(){'
          + '  var img=document.querySelector(".evidence-img");'
          + '  if(!img || img.complete || img.naturalWidth>0){'
          + '    window.print();'
          + '  }else{'
          + '    img.onload=function(){window.print();};'
          + '    img.onerror=function(){window.print();};'
          + '  }'
          + '}'
          + 'if(document.readyState==="complete"){setTimeout(triggerPrint,200);}'
          + 'else{window.addEventListener("load",function(){setTimeout(triggerPrint,200);});}'
          + '<\/script></body></html>';
          
        w.document.write(html);
        w.document.close();
        w.focus();
      });
    }
  }

  // ── Standalone Expenses End ──

  })();

(function () {
  function setText(t) { var el = document.getElementById('bl-text'); if (el) el.textContent = t; }
  function injectAll() {
    var scripts = document.querySelectorAll('script[type^="text/x-lms-"]');
    if (!scripts.length) { setText('❌ ไม่พบ script blocks ของระบบ'); return; }
    setText('กำลังโหลดสคริปต์ ' + scripts.length + ' ส่วน...');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].textContent || '';
      if (!src) continue;
      try {
        var s = document.createElement('script');
        s.text = src;
        document.body.appendChild(s);
      } catch (e) {
        setText('❌ Inject error: ' + e.message);
        return;
      }
    }
    // Fallback boot — กรณี IIFE register handler ไม่ทัน
    setTimeout(function () {
      if (typeof window.LMS_boot === 'function' && !window.__lmsBootCalled) {
        window.__lmsBootCalled = true;
        try { window.LMS_boot(); } catch (e) {
          setText('❌ Boot error: ' + e.message);
          if (window.console) console.error('[LMS] LMS_boot threw:', e);
        }
      } else if (typeof window.LMS_boot !== 'function') {
        setText('❌ ไม่พบฟังก์ชัน LMS_boot — สคริปต์หลักอาจโหลดไม่สำเร็จ');
        if (window.console) console.error('[LMS] window.LMS_boot is not a function. window.LMS =', window.LMS);
      }
    }, 200);
  }
  function start() { injectAll(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, false);
  } else {
    start();
  }
})();