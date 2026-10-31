create table if not exists public.procurement_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'Network equipment',
  quantity integer not null default 1 check (quantity > 0),
  unit text not null default 'pcs',
  estimated_unit_cost integer not null default 0 check (estimated_unit_cost >= 0),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'needed' check (status in ('needed', 'ordered', 'purchased')),
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists procurement_items_tenant_created_idx
  on public.procurement_items (tenant_id, created_at desc);

alter table public.procurement_items enable row level security;
