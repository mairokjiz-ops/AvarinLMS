alter table if exists public."Expenses"
  add column if not exists bank_account text;
