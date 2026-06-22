-- ============================================================
-- CardHub Index — drive the chunked Edge Function price sync from
-- pg_cron via pg_net. All-in-Supabase, no external runner.
-- ============================================================
create extension if not exists pg_net;

-- progress/lock state for the chunked sync
create table if not exists public.sync_runs (
  id          bigint generated always as identity primary key,
  cycle_id    bigint not null,
  cursor_pid  bigint not null default 0,
  done_count  int not null default 0,
  status      text not null default 'running' check (status in ('running','done','failed')),
  locked_at   timestamptz,
  started_at  timestamptz not null default now()
);
alter table public.sync_runs enable row level security; -- no policies: service-only

-- private config: Edge Function URL + shared secret (locked table)
create table if not exists public.app_config (
  key text primary key,
  value text
);
alter table public.app_config enable row level security; -- no policies: service-only
insert into public.app_config (key, value) values
  ('edge_url', 'https://lqwmsrwoyoalcuzxkzsu.supabase.co/functions/v1/sync-prices'),
  ('cron_secret', 'CHANGE_ME_same_as_edge_CRON_SECRET')
on conflict (key) do nothing;

-- pg_cron driver: ping the Edge Function every minute. The function decides
-- whether to start a run, process the next chunk, finalize, or stay idle.
do $$ begin perform cron.unschedule('cardhub-sync-driver'); exception when others then null; end $$;
select cron.schedule('cardhub-sync-driver', '* * * * *', $$
  select net.http_post(
    url := (select value from public.app_config where key = 'edge_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
