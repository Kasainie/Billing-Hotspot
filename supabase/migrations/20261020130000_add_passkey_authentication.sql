create table if not exists public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tenant_users (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists passkey_credentials_user_created_idx
  on public.passkey_credentials (user_id, created_at);

create table if not exists public.passkey_challenges (
  challenge_hash text primary key,
  challenge text not null,
  user_id uuid references public.tenant_users (id) on delete cascade,
  purpose text not null check (purpose in ('registration', 'authentication')),
  origin text not null,
  rp_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists passkey_challenges_expires_idx
  on public.passkey_challenges (expires_at);

alter table public.passkey_credentials enable row level security;
alter table public.passkey_challenges enable row level security;
