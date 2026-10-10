alter table public.router_provisioning_tokens
  add column if not exists configured_at timestamptz;
