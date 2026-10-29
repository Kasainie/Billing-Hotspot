alter table public.tenant_sms_settings
  add column if not exists infobip_base_url text,
  add column if not exists infobip_api_key_encrypted text,
  add column if not exists infobip_sms_sender text,
  add column if not exists infobip_whatsapp_sender text;

alter table public.tenant_sms_settings
  drop column if exists username,
  drop column if exists api_key_encrypted,
  drop column if exists sender_id,
  drop column if exists twilio_account_sid,
  drop column if exists twilio_auth_token_encrypted,
  drop column if exists sms_from,
  drop column if exists messaging_service_sid,
  drop column if exists whatsapp_from;
