alter table public.tenant_users
  add column if not exists email_verified boolean not null default true;

create table if not exists public.email_verification_codes (
  user_id uuid primary key references public.tenant_users (id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.email_verification_codes enable row level security;
