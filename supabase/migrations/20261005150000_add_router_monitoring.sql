create table if not exists public.router_monitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  router_name text not null,
  token_hash text not null unique,
  previous_token_hash text,
  previous_token_expires_at timestamptz,
  enabled boolean not null default true,
  last_seen_at timestamptz,
  last_source_ip text,
  created_at timestamptz not null default now(),
  constraint router_monitors_tenant_name_unique unique (tenant_id, router_name)
);

create index if not exists router_monitors_tenant_created_idx
  on public.router_monitors (tenant_id, created_at desc);

create table if not exists public.router_metric_samples (
  id uuid primary key default gen_random_uuid(),
  router_id uuid not null references public.router_monitors (id) on delete cascade,
  sampled_at timestamptz not null default now(),
  cpu_load integer not null check (cpu_load between 0 and 100),
  free_memory_bytes bigint not null check (free_memory_bytes >= 0),
  total_memory_bytes bigint not null check (total_memory_bytes > 0),
  free_disk_bytes bigint check (free_disk_bytes >= 0),
  total_disk_bytes bigint check (total_disk_bytes > 0),
  total_rx_bytes bigint check (total_rx_bytes >= 0),
  total_tx_bytes bigint check (total_tx_bytes >= 0),
  active_hotspot_users integer not null default 0 check (active_hotspot_users >= 0),
  active_pppoe_users integer not null default 0 check (active_pppoe_users >= 0),
  uptime_seconds bigint not null check (uptime_seconds >= 0),
  router_os_version text,
  board_name text,
  temperature_celsius integer check (temperature_celsius between -50 and 150)
);

create index if not exists router_metric_samples_router_sampled_idx
  on public.router_metric_samples (router_id, sampled_at desc);

alter table public.router_monitors enable row level security;
alter table public.router_metric_samples enable row level security;
