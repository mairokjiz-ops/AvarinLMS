-- Enable RLS for all existing tables in public schema
ALTER TABLE IF EXISTS public."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Leaves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Missions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Checkins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Quizzes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UserProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."CourseChunks" ENABLE ROW LEVEL SECURITY;

-- Fallback loop to enable RLS on any other tables in public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
    END LOOP;
END $$;
