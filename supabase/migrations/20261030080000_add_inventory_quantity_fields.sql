alter table public.equipment
  add column if not exists quantity integer not null default 0 check (quantity >= 0),
  add column if not exists unit text not null default 'pcs',
  add column if not exists minimum_quantity integer not null default 0 check (minimum_quantity >= 0);
