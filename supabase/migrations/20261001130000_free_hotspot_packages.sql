alter table public.hotspot_purchases
  alter column phone drop not null,
  add column if not exists source_ip text,
  add column if not exists client_mac text;

alter table public.hotspot_purchases
  drop constraint if exists hotspot_purchases_amount_positive;

alter table public.hotspot_purchases
  add constraint hotspot_purchases_amount_nonnegative check (amount >= 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'packages_price_nonnegative_check'
      and conrelid = 'public.packages'::regclass
  ) then
    alter table public.packages
      add constraint packages_price_nonnegative_check check (monthly_price >= 0);
  end if;
end
$$;