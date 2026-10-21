create table if not exists public.passkey_mobile_handoffs (
  token_hash text primary key,
  code_challenge text not null,
  user_id uuid not null references public.tenant_users (id) on delete cascade,
  tenant_id text not null references public.tenants (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists passkey_mobile_handoffs_expires_idx
  on public.passkey_mobile_handoffs (expires_at);

alter table public.passkey_mobile_handoffs enable row level security;
