create table if not exists public.tenants (
  id text primary key,
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

insert into public.tenants (id, name, slug, status)
values ('default', 'Default workspace', 'default', 'active')
on conflict (id) do nothing;

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.tenant_users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  constraint tenant_memberships_tenant_user_unique unique (tenant_id, user_id)
);

create table if not exists public.tenant_sessions (
  token_hash text primary key,
  user_id uuid not null references public.tenant_users (id) on delete cascade,
  tenant_id text not null references public.tenants (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tenant_sessions_membership_fk
    foreign key (tenant_id, user_id)
    references public.tenant_memberships (tenant_id, user_id)
    on delete cascade
);

create table if not exists public.tenant_payment_settings (
  tenant_id text primary key references public.tenants (id) on delete cascade,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  consumer_key_encrypted text not null,
  consumer_secret_encrypted text not null,
  shortcode text not null,
  passkey_encrypted text not null,
  callback_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.sites add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.customers add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.payments add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.packages add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.hotspot_portal_settings add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.radcheck add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.radreply add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.router_provisioning_tokens add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.pppoe_accounts add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.pppoe_payments add column if not exists tenant_id text not null default 'default' references public.tenants (id);
alter table public.hotspot_purchases add column if not exists tenant_id text not null default 'default' references public.tenants (id);

alter table public.hotspot_portal_settings drop constraint if exists hotspot_portal_settings_pkey;
alter table public.hotspot_portal_settings add constraint hotspot_portal_settings_pkey primary key (tenant_id, id);

drop index if exists public.customers_radius_username_unique_idx;
create unique index if not exists customers_radius_username_unique_idx
  on public.customers (radius_username) where radius_username is not null;

alter table public.pppoe_accounts drop constraint if exists pppoe_accounts_phone_key;
create unique index if not exists pppoe_accounts_tenant_phone_unique_idx
  on public.pppoe_accounts (tenant_id, phone);

create index if not exists sites_tenant_created_idx on public.sites (tenant_id, created_at desc);
create index if not exists customers_tenant_created_idx on public.customers (tenant_id, created_at desc);
create index if not exists payments_tenant_paid_idx on public.payments (tenant_id, paid_at desc);
create index if not exists packages_tenant_created_idx on public.packages (tenant_id, created_at desc);
create index if not exists hotspot_purchases_tenant_created_idx on public.hotspot_purchases (tenant_id, created_at desc);
create index if not exists pppoe_payments_tenant_created_idx on public.pppoe_payments (tenant_id, created_at desc);
create index if not exists tenant_memberships_user_idx on public.tenant_memberships (user_id);
create index if not exists tenant_sessions_expiry_idx on public.tenant_sessions (expires_at);

alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_sessions enable row level security;
alter table public.tenant_payment_settings enable row level security;