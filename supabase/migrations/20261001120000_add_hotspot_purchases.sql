create table if not exists public.hotspot_purchases (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  product_name text not null,
  duration_seconds integer not null,
  amount integer not null,
  phone text not null,
  status text not null default 'initiating',
  merchant_request_id text,
  checkout_request_id text,
  receipt text,
  radius_username text,
  failure_reason text,
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint hotspot_purchases_duration_positive check (duration_seconds > 0),
  constraint hotspot_purchases_amount_positive check (amount > 0)
);

create unique index if not exists hotspot_purchases_checkout_request_unique_idx
  on public.hotspot_purchases (checkout_request_id)
  where checkout_request_id is not null;

create unique index if not exists hotspot_purchases_receipt_unique_idx
  on public.hotspot_purchases (receipt)
  where receipt is not null;

alter table public.hotspot_purchases enable row level security;
alter table public.hotspot_purchases add column if not exists package_snapshot jsonb;

alter table public.packages
  add column if not exists type text not null default 'Hotspot',
  add column if not exists availability text not null default 'live',
  add column if not exists listed boolean not null default true,
  add column if not exists rate_limit text not null default '20M/10M',
  add column if not exists duration_seconds integer not null default 2592000,
  add column if not exists devices_per_account integer not null default 1,
  add column if not exists burst_limit text,
  add column if not exists burst_threshold text,
  add column if not exists burst_time_seconds integer,
  add column if not exists fup_enabled boolean not null default false,
  add column if not exists fup_limit_bytes bigint,
  add column if not exists schedule_enabled boolean not null default false,
  add column if not exists schedule_spec text,
  add column if not exists nas_restrictions jsonb not null default '[]'::jsonb;

update public.packages
set availability = case when active then 'live' else 'off' end,
    listed = active
where availability = 'live' and listed = true;

alter table public.packages
  add constraint packages_type_check check (type in ('Hotspot', 'PPPoE', 'Bundle', 'Trial', 'TV')),
  add constraint packages_availability_check check (availability in ('live', 'hidden', 'off')),
  add constraint packages_duration_positive_check check (duration_seconds > 0),
  add constraint packages_devices_positive_check check (devices_per_account > 0),
  add constraint packages_nas_restrictions_array_check check (jsonb_typeof(nas_restrictions) = 'array');