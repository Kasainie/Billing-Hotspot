create table if not exists public.password_reset_tokens (
  token_hash text primary key,
  user_id uuid not null unique references public.tenant_users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.password_reset_tokens enable row level security;
