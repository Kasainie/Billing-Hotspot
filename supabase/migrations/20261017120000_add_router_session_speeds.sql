ALTER TABLE public.router_remote_sessions
  ADD COLUMN IF NOT EXISTS download_bps bigint,
  ADD COLUMN IF NOT EXISTS upload_bps bigint;
