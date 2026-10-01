create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  status text not null default 'active',
  customers_count integer not null default 0,
  monthly_revenue integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid,
  name text not null,
  email text not null,
  phone text,
  status text not null default 'active',
  plan text,
  monthly_rate integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  amount integer not null,
  status text not null default 'paid',
  method text,
  paid_at timestamptz not null default now(),
  reference text
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  download_mbps integer not null,
  upload_mbps integer not null,
  monthly_price integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sites enable row level security;
alter table public.customers enable row level security;
alter table public.payments enable row level security;
alter table public.packages enable row level security;