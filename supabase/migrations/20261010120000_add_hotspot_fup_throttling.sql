alter table public.packages
  add column if not exists fup_upload_rate text,
  add column if not exists fup_download_rate text;

create index if not exists radacct_username_idx
  on public.radacct (username);

create index if not exists hotspot_purchases_radius_username_fup_idx
  on public.hotspot_purchases (radius_username)
  where status = 'completed' and radius_username is not null;

create or replace function public.apply_hotspot_fup_throttle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  purchase_tenant_id text;
  package_snapshot jsonb;
  fup_enabled boolean;
  usage_limit_bytes bigint;
  upload_rate text;
  download_rate text;
  usage_start timestamptz;
  total_usage_bytes numeric;
begin
  if new.username is null or new.username = '' then
    return new;
  end if;

  select purchase.tenant_id, purchase.package_snapshot, purchase.paid_at
  into purchase_tenant_id, package_snapshot, usage_start
  from public.hotspot_purchases as purchase
  where purchase.radius_username = new.username
    and purchase.status = 'completed'
  limit 1;

  if found then
    fup_enabled := package_snapshot ->> 'fupEnabled' = 'true';
    if not fup_enabled then
      return new;
    end if;

    usage_limit_bytes := nullif(package_snapshot ->> 'fupLimitBytes', '')::bigint;
    upload_rate := upper(package_snapshot ->> 'fupUploadRate');
    download_rate := upper(package_snapshot ->> 'fupDownloadRate');
  else
    select voucher.tenant_id, plan.fup_enabled, plan.fup_limit_bytes,
      plan.fup_upload_rate, plan.fup_download_rate, voucher.activated_at
    into purchase_tenant_id, fup_enabled, usage_limit_bytes, upload_rate, download_rate, usage_start
    from public.vouchers as voucher
    inner join public.packages as plan
      on plan.id = voucher.package_id and plan.tenant_id = voucher.tenant_id
    where voucher.username = new.username
    limit 1;

    if found then
      if not fup_enabled then
        return new;
      end if;
    else
      select customer.tenant_id, plan.fup_enabled, plan.fup_limit_bytes,
        plan.fup_upload_rate, plan.fup_download_rate,
        coalesce((select max(payment.paid_at)
          from public.payments as payment
          where payment.tenant_id = customer.tenant_id
            and payment.customer_id = customer.id
            and payment.status = 'paid'), customer.created_at)
      into purchase_tenant_id, fup_enabled, usage_limit_bytes, upload_rate, download_rate, usage_start
      from public.customers as customer
      inner join public.packages as plan
        on plan.tenant_id = customer.tenant_id
        and plan.name = customer.plan
        and plan.type in ('Hotspot', 'Bundle', 'Trial', 'PPPoE')
      where customer.radius_username = new.username
      order by plan.created_at desc
      limit 1;

      if not found or not fup_enabled then
        return new;
      end if;
    end if;
  end if;

  if usage_limit_bytes is null or usage_limit_bytes < 1
    or upload_rate is null or download_rate is null
    or upload_rate !~ '^[0-9]+([.][0-9]+)?[KMG]?$'
    or download_rate !~ '^[0-9]+([.][0-9]+)?[KMG]?$'
    or upload_rate ~ '^0+([.]0+)?[KMG]?$'
    or download_rate ~ '^0+([.]0+)?[KMG]?$' then
    return new;
  end if;

  select coalesce(sum(coalesce(accounting.acctinputoctets, 0)::numeric
    + coalesce(accounting.acctoutputoctets, 0)::numeric), 0)
  into total_usage_bytes
  from public.radacct as accounting
  where accounting.username = new.username
    and (usage_start is null or accounting.acctstarttime >= usage_start);

  if total_usage_bytes < usage_limit_bytes then
    return new;
  end if;

  update public.radreply
  set value = upload_rate || '/' || download_rate
  where tenant_id = purchase_tenant_id
    and username = new.username
    and attribute = 'Mikrotik-Rate-Limit'
    and value is distinct from upload_rate || '/' || download_rate;

  return new;
end;
$$;

drop trigger if exists hotspot_fup_throttle_on_accounting on public.radacct;

create trigger hotspot_fup_throttle_on_accounting
after insert or update of acctinputoctets, acctoutputoctets, acctstoptime
on public.radacct
for each row
execute function public.apply_hotspot_fup_throttle();
