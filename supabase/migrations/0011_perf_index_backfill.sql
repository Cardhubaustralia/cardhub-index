-- ============================================================
-- CardHub Index — perf: batched change recompute, longer service
-- timeout, and market-index history backfill (for trend graphs).
-- ============================================================

-- 1. give server-side jobs room to run heavy queries
alter role service_role set statement_timeout = '300s';

-- 2. batched change recompute (correlated subqueries use the PK index,
--    so each id-range chunk is fast and never times out)
create or replace function public.refresh_long_changes_batch(p_from bigint, p_to bigint)
returns void language sql security definer set search_path = public as $$
  update assets a set
    change_7d_pct = (
      select case when s.price > 0 then round((a.price - s.price) / s.price * 100, 4) end
        from price_snapshots s
       where s.asset_id = a.id and s.captured_at <= now() - interval '7 days'
       order by s.captured_at desc limit 1
    ),
    change_30d_pct = (
      select case when s.price > 0 then round((a.price - s.price) / s.price * 100, 4) end
        from price_snapshots s
       where s.asset_id = a.id and s.captured_at <= now() - interval '30 days'
       order by s.captured_at desc limit 1
    )
  where a.id >= p_from and a.id < p_to and a.price is not null and a.tradeable;
$$;
revoke execute on function public.refresh_long_changes_batch(bigint, bigint) from anon, authenticated;

-- 3. market-index history: allow many daily points per game
alter table public.market_index_snapshots drop constraint if exists market_index_snapshots_pkey;
alter table public.market_index_snapshots alter column cycle_id drop not null;
-- de-dupe any existing rows on (category_id, captured_at) before re-keying
delete from public.market_index_snapshots a using public.market_index_snapshots b
 where a.ctid < b.ctid and a.category_id = b.category_id and a.captured_at = b.captured_at;
alter table public.market_index_snapshots
  add constraint market_index_snapshots_pkey primary key (category_id, captured_at);

create or replace function public.snapshot_market_index(p_cycle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into market_index_snapshots (category_id, cycle_id, index_value, card_count, captured_at)
  select c.category_id, p_cycle_id,
         round(coalesce(sum(a.price), 0), 2), count(*), now()
    from assets a
    join cards c on c.product_id = a.product_id
   where a.tradeable and a.price is not null
   group by c.category_id
  on conflict (category_id, captured_at) do update
    set index_value = excluded.index_value, card_count = excluded.card_count;
end $$;
revoke execute on function public.snapshot_market_index(bigint) from anon, authenticated;

-- 4. build one historical index point per game per day, from the
--    backfilled price snapshots. Idempotent (upsert on the day).
create or replace function public.backfill_index_day(p_day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into market_index_snapshots (category_id, cycle_id, index_value, card_count, captured_at)
  select c.category_id, 0,
         round(sum(ps.price), 2), count(*),
         (p_day::timestamptz + interval '12 hours')
    from price_snapshots ps
    join assets a on a.id = ps.asset_id
    join cards c on c.product_id = a.product_id
   where ps.captured_at >= p_day and ps.captured_at < (p_day + 1)
     and a.tradeable and ps.price is not null
   group by c.category_id
  on conflict (category_id, captured_at) do update
    set index_value = excluded.index_value, card_count = excluded.card_count;
end $$;
revoke execute on function public.backfill_index_day(date) from anon, authenticated;
