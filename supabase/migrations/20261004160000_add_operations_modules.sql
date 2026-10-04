create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_tenant_created_idx on public.leads (tenant_id, created_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  requester_name text not null,
  requester_email text,
  subject text not null,
  description text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_tenant_updated_idx on public.support_tickets (tenant_id, updated_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  category text not null,
  description text not null,
  amount integer not null check (amount > 0),
  paid_to text,
  reference text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists expenses_tenant_occurred_idx on public.expenses (tenant_id, occurred_at desc);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  username text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  constraint vouchers_tenant_username_unique unique (tenant_id, username)
);

create index if not exists vouchers_tenant_created_idx on public.vouchers (tenant_id, created_at desc);

alter table public.leads enable row level security;
alter table public.support_tickets enable row level security;
alter table public.expenses enable row level security;
alter table public.vouchers enable row level security;
