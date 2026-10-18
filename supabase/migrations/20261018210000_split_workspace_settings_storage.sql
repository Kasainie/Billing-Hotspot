alter table public.tenant_workspace_settings
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists secrets_configured jsonb not null default '{}'::jsonb,
  alter column settings_encrypted drop not null;
