create table if not exists public.tenant_sms_settings (
  tenant_id text primary key references public.tenants (id) on delete cascade,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  username text not null,
  api_key_encrypted text not null,
  sender_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  event_key text not null,
  recipient text not null,
  message_encrypted text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint sms_messages_tenant_event_unique unique (tenant_id, event_key)
);

create index if not exists sms_messages_queued_next_attempt_idx
  on public.sms_messages (status, next_attempt_at);

alter table public.tenant_sms_settings enable row level security;
alter table public.sms_messages enable row level security;
