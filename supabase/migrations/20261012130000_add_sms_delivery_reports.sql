alter table public.sms_messages
  add column if not exists delivery_status text not null default 'queued',
  add column if not exists delivery_report jsonb,
  add column if not exists delivery_reported_at timestamptz,
  add column if not exists resend_of_id uuid;

create index if not exists sms_messages_tenant_delivery_created_idx
  on public.sms_messages (tenant_id, delivery_status, created_at desc);
