do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'radius_runtime') then
    create role radius_runtime login;
  end if;
end
$$;

alter role radius_runtime set search_path = public;

create table if not exists public.radcheck (
  id serial primary key,
  username text not null default '',
  attribute text not null default '',
  op varchar(2) not null default '==',
  value text not null default ''
);
create index if not exists radcheck_username_attribute_idx on public.radcheck (username, attribute);

create table if not exists public.radreply (
  id serial primary key,
  username text not null default '',
  attribute text not null default '',
  op varchar(2) not null default '=',
  value text not null default ''
);
create index if not exists radreply_username_attribute_idx on public.radreply (username, attribute);

create table if not exists public.radgroupcheck (
  id serial primary key,
  groupname text not null default '',
  attribute text not null default '',
  op varchar(2) not null default '==',
  value text not null default ''
);
create index if not exists radgroupcheck_groupname_attribute_idx on public.radgroupcheck (groupname, attribute);

create table if not exists public.radgroupreply (
  id serial primary key,
  groupname text not null default '',
  attribute text not null default '',
  op varchar(2) not null default '=',
  value text not null default ''
);
create index if not exists radgroupreply_groupname_attribute_idx on public.radgroupreply (groupname, attribute);

create table if not exists public.radusergroup (
  id serial primary key,
  username text not null default '',
  groupname text not null default '',
  priority integer not null default 0
);
create index if not exists radusergroup_username_idx on public.radusergroup (username);

create table if not exists public.radacct (
  radacctid bigserial primary key,
  acctsessionid text not null,
  acctuniqueid text not null unique,
  username text,
  realm text,
  nasipaddress inet not null,
  nasportid text,
  nasporttype text,
  acctstarttime timestamptz,
  acctupdatetime timestamptz,
  acctstoptime timestamptz,
  acctinterval bigint,
  acctsessiontime bigint,
  acctauthentic text,
  connectinfo_start text,
  connectinfo_stop text,
  acctinputoctets bigint,
  acctoutputoctets bigint,
  calledstationid text,
  callingstationid text,
  acctterminatecause text,
  servicetype text,
  framedprotocol text,
  framedipaddress inet,
  framedipv6address inet,
  framedipv6prefix inet,
  framedinterfaceid text,
  delegatedipv6prefix inet,
  class text
);
create index if not exists radacct_active_session_idx on public.radacct (acctuniqueid) where acctstoptime is null;
create index if not exists radacct_bulk_close_idx on public.radacct (nasipaddress, acctstarttime) where acctstoptime is null;
create index if not exists radacct_start_user_idx on public.radacct (acctstarttime, username);

alter table public.radcheck enable row level security;
alter table public.radreply enable row level security;
alter table public.radgroupcheck enable row level security;
alter table public.radgroupreply enable row level security;
alter table public.radusergroup enable row level security;
alter table public.radacct enable row level security;

grant usage on schema public to radius_runtime;
grant select on public.radcheck, public.radreply, public.radgroupcheck, public.radgroupreply, public.radusergroup to radius_runtime;
grant select, insert, update on public.radacct to radius_runtime;
grant usage, select on sequence public.radcheck_id_seq, public.radreply_id_seq, public.radgroupcheck_id_seq, public.radgroupreply_id_seq, public.radusergroup_id_seq, public.radacct_radacctid_seq to radius_runtime;

create policy radius_runtime_read on public.radcheck for select to radius_runtime using (true);
create policy radius_runtime_read on public.radreply for select to radius_runtime using (true);
create policy radius_runtime_read on public.radgroupcheck for select to radius_runtime using (true);
create policy radius_runtime_read on public.radgroupreply for select to radius_runtime using (true);
create policy radius_runtime_read on public.radusergroup for select to radius_runtime using (true);
create policy radius_runtime_select on public.radacct for select to radius_runtime using (true);
create policy radius_runtime_insert on public.radacct for insert to radius_runtime with check (true);
create policy radius_runtime_update on public.radacct for update to radius_runtime using (true) with check (true);