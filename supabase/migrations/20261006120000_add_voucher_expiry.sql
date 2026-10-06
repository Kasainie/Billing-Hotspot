alter table public.vouchers
  add column if not exists validity_seconds integer,
  add column if not exists activated_at timestamptz,
  add column if not exists expires_at timestamptz;

alter table public.vouchers
  add constraint vouchers_validity_seconds_positive
  check (validity_seconds is null or validity_seconds > 0);

create index if not exists vouchers_tenant_expiry_idx
  on public.vouchers (tenant_id, expires_at)
  where expires_at is not null;

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
    'Dy DD Mon YYYY HH24:MI:SS'
  ) || ' UTC';

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

drop trigger if exists activate_voucher_on_radius_start on public.radacct;
create trigger activate_voucher_on_radius_start
after insert or update on public.radacct
for each row
execute function public.activate_voucher_on_radius_start();
