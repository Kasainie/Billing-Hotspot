alter table public.hotspot_portal_settings
  drop constraint if exists hotspot_portal_settings_active_template_check;

alter table public.hotspot_portal_settings
  add constraint hotspot_portal_settings_active_template_check
  check (active_template in ('original', 'fresh', 'skyline', 'copperline', 'graphite', 'cobalt', 'lagoon', 'ember'));