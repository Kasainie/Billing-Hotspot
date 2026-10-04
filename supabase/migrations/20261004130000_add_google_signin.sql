alter table public.tenant_users
  alter column password_hash drop not null,
  add column if not exists google_subject text;

create unique index if not exists tenant_users_google_subject_unique_idx
  on public.tenant_users (google_subject)
  where google_subject is not null;
