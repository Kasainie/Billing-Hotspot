alter table public.pppoe_payments
  add column if not exists gateway_provider text not null default 'daraja';

alter table public.hotspot_purchases
  add column if not exists gateway_provider text not null default 'daraja';
