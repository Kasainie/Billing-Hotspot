create table if not exists public.mobile_money_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  transaction_id text not null,
  bill_reference text not null,
  amount integer not null check (amount > 0),
  phone text,
  transaction_at timestamptz,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched')),
  customer_id uuid references public.customers (id),
  match_reason text,
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  constraint mobile_money_transactions_tenant_transaction_unique unique (tenant_id, transaction_id)
);

create index if not exists mobile_money_transactions_tenant_status_created_idx
  on public.mobile_money_transactions (tenant_id, status, created_at desc);

alter table public.mobile_money_transactions enable row level security;
