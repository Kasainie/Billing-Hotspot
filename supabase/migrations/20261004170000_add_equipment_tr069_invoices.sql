create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null,
  category text not null,
  serial_number text,
  manufacturer text,
  model text,
  status text not null default 'in_service' check (status in ('in_service', 'spare', 'maintenance', 'retired')),
  condition text not null default 'good' check (condition in ('good', 'fair', 'poor')),
  purchased_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists equipment_tenant_created_idx on public.equipment (tenant_id, created_at desc);

create table if not exists public.tr069_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  serial_number text not null,
  manufacturer text,
  model text,
  firmware_version text,
  connection_request_url text,
  status text not null default 'pending' check (status in ('pending', 'online', 'offline', 'unsupported')),
  last_inform_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tr069_devices_tenant_serial_unique unique (tenant_id, serial_number)
);

create index if not exists tr069_devices_tenant_updated_idx on public.tr069_devices (tenant_id, updated_at desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_number text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  amount integer not null check (amount > 0),
  description text not null,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoices_tenant_number_unique unique (tenant_id, invoice_number),
  constraint invoices_tenant_customer_period_unique unique (tenant_id, customer_id, period_start)
);

create index if not exists invoices_tenant_due_idx on public.invoices (tenant_id, due_at desc);

alter table public.equipment enable row level security;
alter table public.tr069_devices enable row level security;
alter table public.invoices enable row level security;
