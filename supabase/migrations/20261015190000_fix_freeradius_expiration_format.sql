update public.radcheck
set value = concat_ws(
  ' ',
  split_part(value, ' ', 2),
  split_part(value, ' ', 3),
  split_part(value, ' ', 4),
  left(split_part(value, ' ', 5), 5)
)
where attribute = 'Expiration'
  and value ~ '^[A-Za-z]{3} [0-9]{1,2} [A-Za-z]{3} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC$';

create or replace function public.activate_voucher_on_radius_start()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  activated_voucher record;
  expiration_value text;
  matching_vouchers integer;
begin
  if new.acctstarttime is null or (tg_op = 'UPDATE' and old.acctstarttime is not null) then
    return new;
  end if;

  select count(*)
  into matching_vouchers
  from public.vouchers as voucher
  where voucher.username = new.username
    and voucher.status = 'active'
    and voucher.validity_seconds is not null
    and voucher.activated_at is null;

  if matching_vouchers <> 1 then
    return new;
  end if;

  update public.vouchers as voucher
  set
    activated_at = new.acctstarttime,
    expires_at = new.acctstarttime + make_interval(secs => voucher.validity_seconds)
  where voucher.username = new.username
    and voucher.status = 'active'
    and voucher.validity_seconds is not null
    and voucher.activated_at is null
  returning voucher.tenant_id, voucher.username, voucher.expires_at
  into activated_voucher;

  if not found then
    return new;
  end if;

  expiration_value := to_char(
    activated_voucher.expires_at at time zone 'UTC',
    'DD Mon YYYY HH24:MI'
  );

  update public.radcheck
  set op = ':=', value = expiration_value
  where tenant_id = activated_voucher.tenant_id
    and username = activated_voucher.username
    and attribute = 'Expiration';

  if not found then
    insert into public.radcheck (tenant_id, username, attribute, op, value)
    values (activated_voucher.tenant_id, activated_voucher.username, 'Expiration', ':=', expiration_value);
  end if;

  return new;
end;
$$;
