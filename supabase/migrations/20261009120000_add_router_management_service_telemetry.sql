alter table public.router_metric_samples
  add column if not exists winbox_enabled boolean,
  add column if not exists winbox_port integer check (winbox_port between 1 and 65535),
  add column if not exists web_enabled boolean,
  add column if not exists web_scheme text check (web_scheme in ('http', 'https')),
  add column if not exists web_port integer check (web_port between 1 and 65535);
