alter table public.customers
  add column if not exists location text,
  add column if not exists account_number integer;

update public.customers as customer
set account_number = account.account_number
from public.pppoe_accounts as account
where account.tenant_id = customer.tenant_id
  and account.customer_id = customer.id
  and customer.account_number is null;

do $$
declare
  account_sequence text;
  sequence_value bigint;
  sequence_called boolean;
  highest_account_number bigint;
begin
  account_sequence := pg_get_serial_sequence('public.pppoe_accounts', 'account_number');
  if account_sequence is null then
    raise exception 'Unable to locate the PPPoE account number sequence';
  end if;

  execute format('select last_value, is_called from %s', account_sequence)
    into sequence_value, sequence_called;

  select greatest(
    coalesce((select max(account_number) from public.customers), 41999),
    coalesce((select max(account_number) from public.pppoe_accounts), 41999),
    case when sequence_called then sequence_value else 41999 end
  )
  into highest_account_number;

  perform setval(account_sequence::regclass, highest_account_number, true);

  update public.customers
  set account_number = nextval(account_sequence::regclass)::integer
  where account_number is null;
end;
$$;

alter table public.customers
  alter column account_number set not null;

create unique index if not exists customers_tenant_account_number_unique_idx
  on public.customers (tenant_id, account_number);
