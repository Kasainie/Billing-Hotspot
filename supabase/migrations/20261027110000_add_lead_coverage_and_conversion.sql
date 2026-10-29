alter table public.leads
  add column if not exists location text,
  add column if not exists coverage_status text not null default 'pending',
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_coverage_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_coverage_status_check
      check (coverage_status in ('pending', 'covered', 'unavailable'));
  end if;
end;
$$;

create index if not exists leads_tenant_coverage_status_idx
  on public.leads (tenant_id, coverage_status);

create unique index if not exists leads_tenant_customer_unique_idx
  on public.leads (tenant_id, customer_id)
  where customer_id is not null;
