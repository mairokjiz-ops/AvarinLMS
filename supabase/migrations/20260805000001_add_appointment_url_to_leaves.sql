-- Add appointment_url column to Leaves table if not exists
ALTER TABLE public."Leaves" ADD COLUMN IF NOT EXISTS appointment_url TEXT DEFAULT '';
