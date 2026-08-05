-- Alter hours, days, and last_leave_days in Leaves table to NUMERIC to support floating/decimal values
ALTER TABLE public."Leaves"
  ALTER COLUMN hours TYPE NUMERIC USING (CASE WHEN hours IS NULL OR TRIM(hours::text) = '' THEN NULL ELSE hours::text::numeric END),
  ALTER COLUMN days TYPE NUMERIC USING (CASE WHEN days IS NULL OR TRIM(days::text) = '' THEN NULL ELSE days::text::numeric END),
  ALTER COLUMN last_leave_days TYPE NUMERIC USING (CASE WHEN last_leave_days IS NULL OR TRIM(last_leave_days::text) = '' THEN NULL ELSE last_leave_days::text::numeric END);
