create table if not exists public.router_connector_queries (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references public.router_monitors (id) on delete cascade,
  requested_by uuid references public.tenant_users (id) on delete set null,
  resource text not null check (resource in ('logs', 'backups', 'scheduler', 'scripts')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  result jsonb,
  error_message text,
  claim_expires_at timestamptz,
  claim_token uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists router_connector_queries_queue_idx
  on public.router_connector_queries (router_id, status, created_at);

alter table public.router_connector_queries enable row level security;
