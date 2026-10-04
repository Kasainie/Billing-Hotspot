alter table public.hotspot_portal_settings
  add column if not exists company_name text not null default 'LKTECH',
  add column if not exists welcome_headline text not null default 'Connect to what matters.',
  add column if not exists welcome_message text not null default 'Work, learn, stream, and stay close to the people who matter. Choose a plan and get online.',
  add column if not exists support_message text not null default 'Need help? Contact your network operator.';