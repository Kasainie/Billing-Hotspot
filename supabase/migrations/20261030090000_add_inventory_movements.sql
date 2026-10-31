create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  movement_type text not null check (movement_type in ('added', 'used', 'restocked', 'adjusted')),
  quantity integer not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_tenant_created_idx
  on public.inventory_movements (tenant_id, created_at desc);
create index if not exists inventory_movements_equipment_created_idx
  on public.inventory_movements (equipment_id, created_at desc);

alter table public.inventory_movements enable row level security;
