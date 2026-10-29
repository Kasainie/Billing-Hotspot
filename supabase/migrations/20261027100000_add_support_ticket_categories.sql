alter table public.support_tickets
  add column if not exists category text not null default 'other';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_tickets_category_check'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_category_check
      check (category in ('no_internet', 'password_change', 'slow_speed', 'other'));
  end if;
end;
$$;

create index if not exists support_tickets_tenant_category_idx
  on public.support_tickets (tenant_id, category);
