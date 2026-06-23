-- ============================================================
-- CardHub Index — keep movers & the index in sane ranges
--  • exclude backfill-baseline artifacts (implausible 7d %)
--  • exclude freak items (booster-box cases, 1/1 promos) from
--    movers and the market index — they distort a $10k-bankroll game
-- ============================================================

-- movers: real 7d change, $5–$25k, plausible swing only
drop view if exists public.v_movers cascade;
create view public.v_movers with (security_invoker = on) as
select a.id as asset_id, a.variant, a.price, a.prev_price,
       a.change_pct, a.change_7d_pct, a.change_30d_pct,
       c.product_id, c.name, c.number, c.rarity, c.image_url, c.slug, c.is_sealed,
       s.name as set_name, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable and a.price between 5 and 25000
  and a.change_7d_pct is not null
  and a.change_7d_pct between -90 and 300;
grant select on public.v_movers to anon, authenticated;

-- market index: cap-weighted over normal-priced cards (exclude > $25k)
create or replace function public.snapshot_market_index(p_cycle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into market_index_snapshots (category_id, cycle_id, index_value, card_count, captured_at)
  select c.category_id, p_cycle_id, round(coalesce(sum(a.price), 0), 2), count(*), now()
    from assets a
    join cards c on c.product_id = a.product_id
   where a.tradeable and a.price is not null and a.price <= 25000
   group by c.category_id
  on conflict (category_id, captured_at) do update
    set index_value = excluded.index_value, card_count = excluded.card_count;
end $$;
revoke execute on function public.snapshot_market_index(bigint) from anon, authenticated;

create or replace function public.backfill_index_day(p_day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into market_index_snapshots (category_id, cycle_id, index_value, card_count, captured_at)
  select c.category_id, 0, round(sum(ps.price), 2), count(*), (p_day::timestamptz + interval '12 hours')
    from price_snapshots ps
    join assets a on a.id = ps.asset_id
    join cards c on c.product_id = a.product_id
   where ps.captured_at >= p_day and ps.captured_at < (p_day + 1)
     and a.tradeable and ps.price is not null and ps.price <= 25000
   group by c.category_id
  on conflict (category_id, captured_at) do update
    set index_value = excluded.index_value, card_count = excluded.card_count;
end $$;
revoke execute on function public.backfill_index_day(date) from anon, authenticated;
