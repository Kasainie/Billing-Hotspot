create table if not exists public.hotspot_portal_settings (
  id integer primary key default 1 check (id = 1),
  active_template text not null default 'original'
    check (active_template in ('original', 'fresh', 'skyline')),
  updated_at timestamptz not null default now()
);

alter table public.hotspot_portal_settings enable row level security;

insert into public.hotspot_portal_settings (id, active_template)
values (1, 'original')
on conflict (id) do nothing;