alter table public.customers
  add column if not exists radius_username text;

create unique index if not exists customers_radius_username_unique_idx
  on public.customers (radius_username);