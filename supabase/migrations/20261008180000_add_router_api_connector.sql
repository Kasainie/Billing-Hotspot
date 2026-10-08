alter table public.router_monitors
  add column if not exists connector_token_hash text,
  add column if not exists connector_last_seen_at timestamptz;

create table if not exists public.router_remote_sessions (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references public.router_monitors (id) on delete cascade,
  session_type text not null check (session_type in ('hotspot', 'pppoe')),
  router_session_id text not null,
  username text not null,
  mac_address text,
  ip_address text,
  caller_id text,
  uptime_seconds integer check (uptime_seconds >= 0),
  observed_at timestamptz not null default now(),
  unique (router_id, session_type, router_session_id)
);

create index if not exists router_remote_sessions_observed_idx
  on public.router_remote_sessions (router_id, observed_at desc);

create table if not exists public.router_connector_commands (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references public.router_monitors (id) on delete cascade,
  requested_by uuid references public.tenant_users (id) on delete set null,
  session_type text not null check (session_type in ('hotspot', 'pppoe')),
  router_session_id text not null,
  username text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  claim_expires_at timestamptz,
  claim_token uuid,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists router_connector_commands_queue_idx
  on public.router_connector_commands (router_id, status, created_at);

alter table public.router_remote_sessions enable row level security;
alter table public.router_connector_commands enable row level security;
