create table if not exists public.pppoe_accounts (
  account_number integer generated always as identity (start with 42000) primary key,
  phone text not null unique,
  name text not null,
  email text not null,
  customer_id uuid unique references public.customers (id),
  created_at timestamptz not null default now(),
  constraint pppoe_accounts_phone_check check (phone ~ '^254[17][0-9]{8}$')
);

create table if not exists public.pppoe_payments (
  id uuid primary key default gen_random_uuid(),
  account_number integer not null references public.pppoe_accounts (account_number),
  product_id text not null,
  product_name text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  amount integer not null check (amount > 0),
  package_snapshot jsonb not null,
  status text not null default 'initiating',
  merchant_request_id text,
  checkout_request_id text,
  receipt text,
  failure_reason text,
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists pppoe_payments_checkout_request_unique_idx
  on public.pppoe_payments (checkout_request_id)
  where checkout_request_id is not null;

create unique index if not exists pppoe_payments_receipt_unique_idx
  on public.pppoe_payments (receipt)
  where receipt is not null;

create index if not exists pppoe_payments_account_created_idx
  on public.pppoe_payments (account_number, created_at desc);

alter table public.pppoe_accounts enable row level security;
alter table public.pppoe_payments enable row level security;
