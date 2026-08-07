create table if not exists public.admin_login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists admin_login_codes_active_email_idx
  on public.admin_login_codes (email, created_at desc)
  where used = false;

create index if not exists admin_login_codes_expires_at_idx
  on public.admin_login_codes (expires_at);
