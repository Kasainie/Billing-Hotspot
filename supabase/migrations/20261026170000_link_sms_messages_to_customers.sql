alter table public.sms_messages
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index if not exists sms_messages_tenant_customer_created_idx
  on public.sms_messages (tenant_id, customer_id, created_at desc);

with normalized_customer_phones as (
  select
    id,
    tenant_id,
    case
      when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^0[17][0-9]{8}$'
        then '254' || substr(regexp_replace(phone, '[^0-9]', '', 'g'), 2)
      when regexp_replace(phone, '[^0-9]', '', 'g') ~ '^254[17][0-9]{8}$'
        then regexp_replace(phone, '[^0-9]', '', 'g')
      else null
    end as normalized_phone
  from public.customers
  where phone is not null
),
unique_customer_phones as (
  select tenant_id, normalized_phone, min(id::text)::uuid as customer_id
  from normalized_customer_phones
  where normalized_phone is not null
  group by tenant_id, normalized_phone
  having count(*) = 1
)
update public.sms_messages as messages
set customer_id = customers.customer_id
from unique_customer_phones as customers
where messages.customer_id is null
  and messages.tenant_id = customers.tenant_id
  and messages.recipient = customers.normalized_phone;
