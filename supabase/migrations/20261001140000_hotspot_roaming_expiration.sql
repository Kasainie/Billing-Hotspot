create index if not exists hotspot_purchases_client_mac_paid_at_idx
  on public.hotspot_purchases (client_mac, paid_at desc)
  where status = 'completed' and client_mac is not null;

insert into public.radcheck (username, attribute, op, value)
select
  purchase.radius_username,
  'Expiration',
  ':=',
  to_char(
    (purchase.paid_at + purchase.duration_seconds * interval '1 second') at time zone 'UTC',
    'Dy DD Mon YYYY HH24:MI:SS'
  ) || ' UTC'
from public.hotspot_purchases as purchase
where purchase.status = 'completed'
  and purchase.radius_username is not null
  and purchase.paid_at is not null
  and not exists (
    select 1
    from public.radcheck as existing
    where existing.username = purchase.radius_username
      and existing.attribute = 'Expiration'
  );