alter table public.tenant_sms_settings
  add column if not exists twilio_account_sid text,
  add column if not exists twilio_auth_token_encrypted text,
  add column if not exists sms_from text,
  add column if not exists messaging_service_sid text,
  add column if not exists whatsapp_from text;

alter table public.tenant_sms_settings
  alter column username drop not null,
  alter column api_key_encrypted drop not null;

alter table public.sms_messages
  add column if not exists channel text not null default 'sms';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_messages_channel_check'
      and conrelid = 'public.sms_messages'::regclass
  ) then
    alter table public.sms_messages
      add constraint sms_messages_channel_check check (channel in ('sms', 'whatsapp'));
  end if;
end
$$;

create index if not exists sms_messages_provider_message_id_idx
  on public.sms_messages (provider_message_id)
  where provider_message_id is not null;
