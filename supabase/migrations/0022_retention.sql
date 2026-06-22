-- ============================================================
-- CardHub Index — price-history retention
-- Keep ~100 days of raw daily snapshots (the "hot" window).
-- Older data is downsampled to weekly averages, then the raw
-- monthly partitions are dropped. Runs weekly via pg_cron.
-- ============================================================

-- weekly archive (small: one row per asset per week)
create table if not exists public.price_snapshots_weekly (
  asset_id   bigint not null,
  week_start date   not null,
  avg_price  numeric(14,2) not null,
  min_price  numeric(14,2),
  max_price  numeric(14,2),
  points     int not null,
  primary key (asset_id, week_start)
);
create index if not exists psw_asset_idx on public.price_snapshots_weekly(asset_id, week_start);
alter table public.price_snapshots_weekly enable row level security;
drop policy if exists "read weekly" on public.price_snapshots_weekly;
create policy "read weekly" on public.price_snapshots_weekly for select using (true);
grant select on public.price_snapshots_weekly to anon, authenticated;

-- Archive + prune. p_days = size of the raw hot window.
create or replace function public.archive_old_snapshots(p_days int default 100)
returns void language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - (p_days || ' days')::interval;
  r record; m text; mstart date; mend date;
begin
  -- make sure upcoming partitions exist (so the sync never hits a gap)
  perform public.ensure_partitions_range(now(), now() + interval '2 months');

  -- 1. downsample everything older than the hot window into weekly buckets
  insert into price_snapshots_weekly (asset_id, week_start, avg_price, min_price, max_price, points)
  select asset_id, date_trunc('week', captured_at)::date,
         round(avg(price), 2), min(price), max(price), count(*)
    from price_snapshots
   where captured_at < cutoff
   group by asset_id, date_trunc('week', captured_at)
  on conflict (asset_id, week_start) do update
    set avg_price = excluded.avg_price, min_price = excluded.min_price,
        max_price = excluded.max_price, points = excluded.points;

  -- 2. drop monthly partitions whose entire range is older than the cutoff
  for r in
    select c.relname
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
     where p.relname = 'price_snapshots'
  loop
    m := substring(r.relname from 'price_snapshots_(\d{4}_\d{2})');
    if m is null then continue; end if;
    mstart := to_date(m, 'YYYY_MM');
    mend := (mstart + interval '1 month')::date;
    if mend <= cutoff then
      execute format('drop table if exists public.%I', r.relname);
    end if;
  end loop;
end $$;
revoke execute on function public.archive_old_snapshots(int) from anon, authenticated;

-- run weekly (Sundays 18:00 UTC ≈ early Monday Sydney)
do $$ begin perform cron.unschedule('cardhub-retention'); exception when others then null; end $$;
select cron.schedule('cardhub-retention', '0 18 * * 0', $$ select public.archive_old_snapshots(100); $$);
