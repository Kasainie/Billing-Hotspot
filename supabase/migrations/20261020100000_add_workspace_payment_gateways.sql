create table if not exists public.tenant_payment_gateways (
  tenant_id text not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('airtel-money', 'pesapal', 'intasend')),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  enabled boolean not null default false,
  public_settings jsonb not null default '{}'::jsonb,
  secrets_encrypted text not null,
  updated_at timestamptz not null default now(),
  constraint tenant_payment_gateways_pkey primary key (tenant_id, provider)
);

alter table public.tenant_payment_gateways enable row level security;
