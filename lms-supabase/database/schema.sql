-- LMS Database Schema for Supabase
-- Created for: บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด

-- ── 1. CLEANUP & EXTENSIONS ───────────────────────────────────────
-- Enable uuid-ossp for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop trigger on auth.users (system table, so it always exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop custom functions (order: dependencies first)
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.check_profile_update CASCADE;
DROP FUNCTION IF EXISTS public.check_leave_update CASCADE;
DROP FUNCTION IF EXISTS public.get_my_role CASCADE;

-- Drop tables with CASCADE to automatically drop all foreign keys, indexes, and triggers
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.missions CASCADE;
DROP TABLE IF EXISTS public.leaves CASCADE;
DROP TABLE IF EXISTS public.holidays CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ── 2. TABLES CREATION ─────────────────────────────────────────────

-- Profiles Table (links directly to Supabase Auth auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    position TEXT,
    level TEXT,
    department TEXT,
    role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'approver', 'supervisor', 'checker', 'employee')),
    email TEXT,
    phone TEXT,
    avatar TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    line_user_id TEXT,
    line_connect_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaves Table
CREATE TABLE public.leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_no TEXT UNIQUE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'personal', 'maternity', 'annual')),
    reason TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(5,2) NOT NULL,
    contact_address TEXT,
    contact_phone TEXT,
    last_leave_type TEXT,
    last_leave_start DATE,
    last_leave_end DATE,
    last_leave_days NUMERIC(5,2),
    status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'checked', 'reviewed', 'approved', 'rejected', 'cancelled')),
    checker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    checker_comment TEXT,
    checker_at TIMESTAMPTZ,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    supervisor_comment TEXT,
    supervisor_at TIMESTAMPTZ,
    approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approver_decision TEXT CHECK (approver_decision IN ('approved', 'rejected') OR approver_decision IS NULL),
    approver_comment TEXT,
    approver_at TIMESTAMPTZ,
    written_at DATE DEFAULT CURRENT_DATE,
    written_place TEXT,
    fiscal_year INT NOT NULL,
    attachment_url TEXT,
    leave_unit TEXT DEFAULT 'day' CHECK (leave_unit IN ('day', 'hour')),
    start_time TEXT,
    end_time TEXT,
    hours NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings Table
CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Holidays Table
CREATE TABLE public.holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Missions Table
CREATE TABLE public.missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_no TEXT UNIQUE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    purpose TEXT,
    destination TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    transport_type TEXT,
    requested_amount NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
    approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approver_comment TEXT,
    approver_at TIMESTAMPTZ,
    approved_amount NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses Table
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_no TEXT UNIQUE,
    mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL,
    expense_type TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    receipt_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
    approver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approver_comment TEXT,
    approver_at TIMESTAMPTZ,
    approved_amount NUMERIC(10,2),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE public.audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. AUTOMATIC TIMESTAMPS & CODE GENERATION TRIGGERS ───────────

-- Helper function to update updated_at automatically
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_leaves_modtime BEFORE UPDATE ON public.leaves FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_settings_modtime BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_holidays_modtime BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_missions_modtime BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_expenses_modtime BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Sequence formatting trigger for leave_no (Format: LV{YY}{MM}{NNNN})
CREATE OR REPLACE FUNCTION generate_leave_no()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INT;
  yy_mm TEXT;
BEGIN
  IF NEW.leave_no IS NOT NULL AND NEW.leave_no <> '' THEN
    RETURN NEW;
  END IF;

  yy_mm := to_char(NEW.start_date, 'YYMM');
  
  SELECT COALESCE(MAX(SUBSTRING(leave_no, 7)::INTEGER), 0) + 1
  INTO seq_val
  FROM public.leaves
  WHERE leave_no LIKE 'LV' || yy_mm || '%';

  NEW.leave_no := 'LV' || yy_mm || lpad(COALESCE(seq_val, 1)::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_leave_no
BEFORE INSERT ON public.leaves
FOR EACH ROW EXECUTE FUNCTION generate_leave_no();

-- Sequence formatting trigger for mission_no (Format: MS{YY}{MM}{NNNN})
CREATE OR REPLACE FUNCTION generate_mission_no()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INT;
  yy_mm TEXT;
BEGIN
  IF NEW.mission_no IS NOT NULL AND NEW.mission_no <> '' THEN
    RETURN NEW;
  END IF;

  yy_mm := to_char(NEW.start_date, 'YYMM');
  
  SELECT COALESCE(MAX(SUBSTRING(mission_no, 7)::INTEGER), 0) + 1
  INTO seq_val
  FROM public.missions
  WHERE mission_no LIKE 'MS' || yy_mm || '%';

  NEW.mission_no := 'MS' || yy_mm || lpad(COALESCE(seq_val, 1)::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_mission_no
BEFORE INSERT ON public.missions
FOR EACH ROW EXECUTE FUNCTION generate_mission_no();

-- Sequence formatting trigger for expense_no (Format: EX{YY}{MM}{NNNN})
CREATE OR REPLACE FUNCTION generate_expense_no()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INT;
  yy_mm TEXT;
BEGIN
  IF NEW.expense_no IS NOT NULL AND NEW.expense_no <> '' THEN
    RETURN NEW;
  END IF;

  yy_mm := to_char(NEW.expense_date, 'YYMM');
  
  SELECT COALESCE(MAX(SUBSTRING(expense_no, 7)::INTEGER), 0) + 1
  INTO seq_val
  FROM public.expenses
  WHERE expense_no LIKE 'EX' || yy_mm || '%';

  NEW.expense_no := 'EX' || yy_mm || lpad(COALESCE(seq_val, 1)::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_expense_no
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION generate_expense_no();


-- ── 4. SUPABASE AUTH TRIGGERS (SYNC USERS TO PROFILES) ─────────────

-- Trigger to create a profile row automatically when a user signs up/registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_role TEXT := 'employee';
  username_val TEXT;
BEGIN
  -- Extract details from metadata if provided, otherwise fallback
  username_val := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  
  -- Force 'admin' for the first user if necessary, or read from meta
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    default_role := 'admin';
  ELSE
    default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  END IF;

  INSERT INTO public.profiles (
    id, 
    email, 
    username,
    full_name, 
    role, 
    position,
    level,
    department,
    phone,
    avatar,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    username_val,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username', username_val),
    default_role,
    COALESCE(NEW.raw_user_meta_data->>'position', 'พนักงาน'),
    COALESCE(NEW.raw_user_meta_data->>'level', 'พนักงาน'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'ทั่วไป'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar', ''),
    TRUE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 5. ROW LEVEL SECURITY (RLS) POLICIES & TRIGGER INTEGRATION ────

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Role fetching function to avoid policy recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Trigger to validate profile updates (non-admins cannot modify role/is_active)
CREATE OR REPLACE FUNCTION public.check_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    IF public.get_my_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can modify roles or active status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_update();

-- 5A. Profiles Policies
CREATE POLICY "Allow authenticated users to read all profiles" 
  ON public.profiles FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow users to update own profiles" 
  ON public.profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Allow admin to manage profiles" 
  ON public.profiles FOR ALL TO authenticated 
  USING (public.get_my_role() = 'admin');

-- Trigger to validate leave updates
CREATE OR REPLACE FUNCTION public.check_leave_update()
RETURNS TRIGGER AS $$
DECLARE
  current_user_role TEXT;
BEGIN
  current_user_role := public.get_my_role();

  -- If the user is just an employee, enforce limits
  IF COALESCE(current_user_role, 'employee') = 'employee' THEN
    -- Must be the owner
    IF auth.uid() <> OLD.requester_id THEN
      RAISE EXCEPTION 'You can only update your own leaves';
    END IF;

    -- Can only update if in draft, pending, or cancelled status
    IF OLD.status NOT IN ('draft', 'pending', 'cancelled') THEN
      RAISE EXCEPTION 'You can only update draft, pending, or cancelled leaves';
    END IF;

    -- Prevent tampering with approval columns
    IF NEW.checker_id IS DISTINCT FROM OLD.checker_id OR
       NEW.checker_comment IS DISTINCT FROM OLD.checker_comment OR
       NEW.checker_at IS DISTINCT FROM OLD.checker_at OR
       NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id OR
       NEW.supervisor_comment IS DISTINCT FROM OLD.supervisor_comment OR
       NEW.supervisor_at IS DISTINCT FROM OLD.supervisor_at OR
       NEW.approver_id IS DISTINCT FROM OLD.approver_id OR
       NEW.approver_comment IS DISTINCT FROM OLD.approver_comment OR
       NEW.approver_decision IS DISTINCT FROM OLD.approver_decision OR
       NEW.approver_at IS DISTINCT FROM OLD.approver_at THEN
      RAISE EXCEPTION 'Cannot modify approval columns';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_leave_update
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.check_leave_update();

-- 5B. Leaves Policies
CREATE POLICY "Allow users to view own leaves or managers/admins to view assigned/all" 
  ON public.leaves FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR status = 'approved' -- Allow company calendar view of approved leaves
    OR public.get_my_role() IN ('admin', 'approver')
    -- Checkers can view leaves assigned to them
    OR (public.get_my_role() = 'checker' AND (checker_id = auth.uid() OR checker_id IS NULL))
    -- Supervisors can view leaves assigned to them
    OR (public.get_my_role() = 'supervisor' AND (supervisor_id = auth.uid() OR supervisor_id IS NULL))
  );

CREATE POLICY "Allow users to create leaves for themselves" 
  ON public.leaves FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Allow users to update leaves" 
  ON public.leaves FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'approver', 'supervisor', 'checker')
  );

CREATE POLICY "Allow admin to delete leaves"
  ON public.leaves FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- 5C. Settings Policies
CREATE POLICY "Allow authenticated users to read settings" 
  ON public.settings FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow admin to manage settings" 
  ON public.settings FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

-- 5D. Holidays Policies
CREATE POLICY "Allow authenticated users to read holidays" 
  ON public.holidays FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "Allow admin to manage holidays" 
  ON public.holidays FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

-- 5E. Missions Policies
CREATE POLICY "Allow user to view own missions or managers to view all/assigned"
  ON public.missions FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'approver')
  );

CREATE POLICY "Allow user to create missions for themselves"
  ON public.missions FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Allow user to update own pending missions"
  ON public.missions FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status IN ('draft', 'pending', 'cancelled'))
  WITH CHECK (requester_id = auth.uid() AND status IN ('draft', 'pending', 'cancelled'));

CREATE POLICY "Allow managers to approve missions"
  ON public.missions FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'approver'));

-- 5F. Expenses Policies
CREATE POLICY "Allow user to view own expenses or managers/admins to view all"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_my_role() IN ('admin', 'approver')
  );

CREATE POLICY "Allow user to create expenses for themselves"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Allow user to update own pending expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status IN ('draft', 'pending', 'cancelled'))
  WITH CHECK (created_by = auth.uid() AND status IN ('draft', 'pending', 'cancelled'));

CREATE POLICY "Allow managers to approve expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'approver'));

-- 5G. Audit Logs Policies
CREATE POLICY "Allow admin to view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated USING (public.get_my_role() = 'admin');

CREATE POLICY "Allow users to insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- ── 6. SEED DATA ───────────────────────────────────────────────────

-- Default Settings
INSERT INTO public.settings (key, value) VALUES
('org_name', 'บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด'),
('org_address', '555/63 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10000'),
('org_phone', '0-2000-0000'),
('org_email', 'hr@averintshop.com'),
('limit_sick', '30'),
('limit_personal', '6'),
('limit_maternity', '10'),
('limit_annual', '10'),
('leave_workday_hours', '8'),
('warn_threshold', '80'),
('show_demo_users', 'yes'),
('session_hours', '8'),
('approval_stages', '3'),
('line_channel_access_token', ''),
('line_channel_secret', ''),
('email_from_alias', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Default Holidays (Current Year)
INSERT INTO public.holidays (holiday_date, name) VALUES
(date_trunc('year', now())::date + interval '0 days', 'วันขึ้นปีใหม่'), -- Jan 1
(date_trunc('year', now())::date + interval '3 months' + interval '5 days', 'วันจักรี'), -- Apr 6
(date_trunc('year', now())::date + interval '3 months' + interval '12 days', 'วันสงกรานต์'), -- Apr 13
(date_trunc('year', now())::date + interval '3 months' + interval '13 days', 'วันสงกรานต์'), -- Apr 14
(date_trunc('year', now())::date + interval '3 months' + interval '14 days', 'วันสงกรานต์'), -- Apr 15
(date_trunc('year', now())::date + interval '4 months' + interval '0 days', 'วันแรงงานแห่งชาติ'), -- May 1
(date_trunc('year', now())::date + interval '4 months' + interval '3 days', 'วันฉัตรมงคล'), -- May 4
(date_trunc('year', now())::date + interval '5 months' + interval '2 days', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'), -- Jun 3
(date_trunc('year', now())::date + interval '6 months' + interval '27 days', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'), -- Jul 28
(date_trunc('year', now())::date + interval '7 months' + interval '11 days', 'วันแม่แห่งชาติ'), -- Aug 12
(date_trunc('year', now())::date + interval '9 months' + interval '12 days', 'วันคล้ายวันสวรรคต ร.9'), -- Oct 13
(date_trunc('year', now())::date + interval '9 months' + interval '22 days', 'วันปิยมหาราช'), -- Oct 23
(date_trunc('year', now())::date + interval '11 months' + interval '4 days', 'วันพ่อแห่งชาติ'), -- Dec 5
(date_trunc('year', now())::date + interval '11 months' + interval '9 days', 'วันรัฐธรรมนูญ'), -- Dec 10
(date_trunc('year', now())::date + interval '11 months' + interval '30 days', 'วันสิ้นปี') -- Dec 31
ON CONFLICT (holiday_date) DO NOTHING;
