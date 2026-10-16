alter table public.router_metric_samples
  add column if not exists wireguard_ip text;
