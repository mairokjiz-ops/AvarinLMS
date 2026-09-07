alter table if exists public."Users"
  add column if not exists bank_accounts text;
