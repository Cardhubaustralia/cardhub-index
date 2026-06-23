-- ============================================================
-- CardHub Index — temporary API freshness log (3-day experiment)
-- pg_cron pings the log-freshness Edge Function hourly. The function
-- self-stops after 3 days by calling stop_freshness_log() below.
-- ============================================================
create table if not exists public.api_freshness_log (
  id               bigint generated always as identity primary key,
  sampled_at       timestamptz not null default now(),
  product_id       bigint not null,
  api_last_updated timestamptz,
  age_hours        numeric(8,2)
);
create index if not exists api_freshness_sampled_idx on public.api_freshness_log(sampled_at);

alter table public.api_freshness_log enable row level security;
drop policy if exists "read freshness" on public.api_freshness_log;
create policy "read freshness" on public.api_freshness_log for select using (true);
grant select on public.api_freshness_log to anon, authenticated;

-- unschedule the hourly job (called by the Edge Function after 3 days)
create or replace function public.stop_freshness_log()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform cron.unschedule('cardhub-freshness');
exception when others then null;
end $$;
revoke execute on function public.stop_freshness_log() from anon, authenticated;
grant execute on function public.stop_freshness_log() to service_role;

-- hourly: ping the Edge Function (reuses app_config.cron_secret)
do $$ begin perform cron.unschedule('cardhub-freshness'); exception when others then null; end $$;
select cron.schedule('cardhub-freshness', '0 * * * *', $$
  select net.http_post(
    url := 'https://lqwmsrwoyoalcuzxkzsu.supabase.co/functions/v1/log-freshness',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- When done reviewing:  select cron.unschedule('cardhub-freshness'); drop table public.api_freshness_log;
