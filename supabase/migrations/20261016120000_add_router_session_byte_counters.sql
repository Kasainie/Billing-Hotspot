ALTER TABLE public.router_remote_sessions
  ADD COLUMN IF NOT EXISTS download_bytes bigint,
  ADD COLUMN IF NOT EXISTS upload_bytes bigint;
