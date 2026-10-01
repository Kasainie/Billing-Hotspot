alter table public.router_provisioning_tokens
  add column if not exists router_data jsonb;