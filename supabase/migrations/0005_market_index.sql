-- ============================================================
-- CardHub Index — market index history + analytics views
-- Powers the dashboard market-overview and per-game sparklines.
-- ============================================================

-- One value per game per cycle: the total market cap of tradeable,
-- priced assets (a simple cap-weighted index).
create table if not exists public.market_index_snapshots (
  category_id  int not null references public.games(category_id),
  cycle_id     bigint not null references public.trade_cycles(id),
  index_value  numeric(16,2) not null,   -- sum of asset prices (USD)
  card_count   int not null,
  captured_at  timestamptz not null default now(),
  primary key (category_id, cycle_id)
);
create index if not exists market_index_captured_idx
  on public.market_index_snapshots(captured_at);

alter table public.market_index_snapshots enable row level security;
drop policy if exists "read market index" on public.market_index_snapshots;
create policy "read market index" on public.market_index_snapshots
  for select using (true);

-- Snapshot the index for every game at the current prices.
-- Called once per cycle right after the price sync.
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
  on conflict (category_id, cycle_id) do update
    set index_value = excluded.index_value,
        card_count = excluded.card_count,
        captured_at = excluded.captured_at;
end $$;
revoke execute on function public.snapshot_market_index(bigint) from anon, authenticated;

-- Current market stats per game with 7d/30d/90d index change.
create or replace view public.v_market_stats as
with latest as (
  select distinct on (category_id) category_id, index_value, card_count, captured_at
    from market_index_snapshots
   order by category_id, captured_at desc
)
select
  g.category_id, g.slug, g.display_name,
  l.index_value, l.card_count, l.captured_at,
  (select index_value from market_index_snapshots s
     where s.category_id = g.category_id and s.captured_at <= now() - interval '7 days'
     order by s.captured_at desc limit 1) as index_7d,
  (select index_value from market_index_snapshots s
     where s.category_id = g.category_id and s.captured_at <= now() - interval '30 days'
     order by s.captured_at desc limit 1) as index_30d,
  (select index_value from market_index_snapshots s
     where s.category_id = g.category_id and s.captured_at <= now() - interval '90 days'
     order by s.captured_at desc limit 1) as index_90d
from games g
left join latest l on l.category_id = g.category_id
where g.active;

grant select on public.v_market_stats to anon, authenticated;

-- Sparkline series: last N index points per game.
create or replace function public.market_index_series(p_category int, p_limit int default 40)
returns table (captured_at timestamptz, index_value numeric)
language sql stable security definer set search_path = public as $$
  select captured_at, index_value
    from market_index_snapshots
   where category_id = p_category
   order by captured_at desc
   limit p_limit;
$$;
grant execute on function public.market_index_series(int, int) to anon, authenticated;

-- Backfill an index point for the most recent synced cycle so the
-- dashboard has data immediately (run once after applying this file).
do $$
declare v_cycle bigint;
begin
  select id into v_cycle from trade_cycles
   where prices_synced_at is not null
   order by executes_at desc limit 1;
  if v_cycle is null then
    select id into v_cycle from trade_cycles order by executes_at limit 1;
  end if;
  if v_cycle is not null then
    perform public.snapshot_market_index(v_cycle);
  end if;
end $$;
