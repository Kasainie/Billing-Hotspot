create table if not exists public.tenant_workspace_settings (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  settings_encrypted text not null,
  updated_at timestamptz not null default now()
);
