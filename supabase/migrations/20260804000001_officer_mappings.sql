-- OfficerMappings table for linking Stock API officer names to LMS users
CREATE TABLE IF NOT EXISTS public."OfficerMappings" (
  id TEXT PRIMARY KEY,
  api_officer_name TEXT NOT NULL DEFAULT '',
  api_officer_id TEXT DEFAULT '',
  lms_user_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public."OfficerMappings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public."OfficerMappings"
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
