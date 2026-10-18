create table if not exists public.subscriber_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  type text not null check (type in ('credit', 'debit')),
  amount integer not null check (amount > 0),
  reason text not null check (char_length(reason) between 1 and 500),
  reference text,
  created_by uuid references public.tenant_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subscriber_credits_tenant_customer_created_idx
  on public.subscriber_credits (tenant_id, customer_id, created_at desc);
create unique index if not exists subscriber_credits_tenant_reference_unique_idx
  on public.subscriber_credits (tenant_id, reference)
  where reference is not null;

create table if not exists public.subscriber_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  event_type text not null check (char_length(event_type) between 1 and 40),
  description text not null check (char_length(description) between 1 and 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.tenant_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subscriber_events_tenant_customer_created_idx
  on public.subscriber_events (tenant_id, customer_id, created_at desc);

alter table public.subscriber_credits enable row level security;
alter table public.subscriber_events enable row level security;
