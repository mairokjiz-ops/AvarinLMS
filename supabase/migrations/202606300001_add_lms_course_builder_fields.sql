alter table if exists public."Courses"
  add column if not exists category text,
  add column if not exists duration_hours numeric default 0,
  add column if not exists pass_score numeric default 80,
  add column if not exists instructor text,
  add column if not exists ai_summary text,
  add column if not exists ai_modules text,
  add column if not exists ai_quiz text,
  add column if not exists ai_flashcards text,
  add column if not exists ai_key_points text,
  add column if not exists ai_checklist text;
