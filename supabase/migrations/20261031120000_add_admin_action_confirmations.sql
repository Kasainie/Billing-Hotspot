create table if not exists public.admin_action_confirmation_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  owner_user_id uuid not null references public.tenant_users (id) on delete cascade,
  action text not null,
  record_id text not null,
  payload_hash text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_confirmation_lookup_idx
  on public.admin_action_confirmation_codes (tenant_id, action, record_id);

alter table public.admin_action_confirmation_codes enable row level security;
