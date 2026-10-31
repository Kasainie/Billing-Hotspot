alter table public.equipment
  drop constraint if exists equipment_status_check;

alter table public.equipment
  add constraint equipment_status_check
  check (status in ('new', 'unused', 'in_service', 'spare', 'maintenance', 'retired'));
