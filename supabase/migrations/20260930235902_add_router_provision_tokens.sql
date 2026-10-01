create table if not exists public.router_provisioning_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  config_script text,
  status text not null default 'pending',
  source_ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  applied_at timestamptz
);

create index if not exists router_provisioning_tokens_expires_idx
  on public.router_provisioning_tokens (expires_at);

alter table public.router_provisioning_tokens enable row level security;