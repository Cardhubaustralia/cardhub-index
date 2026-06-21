-- ============================================================
-- CardHub Index — sealed/singles split, set browse, fast change calc
-- ============================================================

-- ------------------------------------------------------------
-- 1. SEALED vs SINGLE flag
-- ------------------------------------------------------------
alter table public.cards add column if not exists is_sealed boolean not null default false;

update public.cards set is_sealed = (
  lower(coalesce(rarity, '')) like '%sealed%'
  or name ~* '(booster box|booster pack|booster bundle|elite trainer|trainer box|blister|collection box|premium collection|build & battle|build and battle|\mbundle\M|\mdeck\M|\mcase\M|\mdisplay\M|gift set|mini tin|\mtin\M|pencil case|binder|poster collection|sticker|sleeves|playmat|\mbox\M)'
);
create index if not exists cards_sealed_idx on public.cards(is_sealed);

-- ------------------------------------------------------------
-- 2. FAST change recompute (set-based, bounded scan — no API timeout)
-- ------------------------------------------------------------
create or replace function public.refresh_long_changes()
returns void language plpgsql security definer set search_path = public as $$
begin
  with s7 as (
    select distinct on (asset_id) asset_id, price
      from price_snapshots
     where captured_at <= now() - interval '7 days'
       and captured_at >= now() - interval '30 days'
     order by asset_id, captured_at desc
  ),
  s30 as (
    select distinct on (asset_id) asset_id, price
      from price_snapshots
     where captured_at <= now() - interval '30 days'
       and captured_at >= now() - interval '75 days'
     order by asset_id, captured_at desc
  ),
  calc as (
    select a.id,
      case when s7.price > 0  then round((a.price - s7.price)  / s7.price  * 100, 4) end as c7,
      case when s30.price > 0 then round((a.price - s30.price) / s30.price * 100, 4) end as c30
    from assets a
    left join s7  on s7.asset_id  = a.id
    left join s30 on s30.asset_id = a.id
    where a.price is not null and a.tradeable
  )
  update assets a
     set change_7d_pct = calc.c7,
         change_30d_pct = calc.c30
    from calc
   where a.id = calc.id;
end $$;
revoke execute on function public.refresh_long_changes() from anon, authenticated;

-- ------------------------------------------------------------
-- 3. MARKET view gains is_sealed + set release date
--    (drop first — CREATE OR REPLACE can't reorder/insert columns)
-- ------------------------------------------------------------
drop view if exists public.v_market cascade;
create or replace view public.v_market as
select a.id as asset_id, a.variant, a.price, a.prev_price, a.change_pct,
       a.change_7d_pct, a.change_30d_pct, a.price_source, a.price_updated_at,
       c.product_id, c.name, c.clean_name, c.number, c.rarity, c.image_url, c.slug,
       c.is_sealed,
       s.group_id, s.name as set_name, s.slug as set_slug, s.published_on,
       g.category_id, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable;
grant select on public.v_market to anon, authenticated;

-- ------------------------------------------------------------
-- 4. MOVERS: real 7d change, price >= 5
-- ------------------------------------------------------------
drop view if exists public.v_movers cascade;
create or replace view public.v_movers as
select a.id as asset_id, a.variant, a.price, a.prev_price,
       a.change_pct, a.change_7d_pct, a.change_30d_pct,
       c.product_id, c.name, c.number, c.rarity, c.image_url, c.slug, c.is_sealed,
       s.name as set_name, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable and a.price is not null and a.price >= 5
  and a.change_7d_pct is not null and a.change_7d_pct <> 0;
grant select on public.v_movers to anon, authenticated;

-- ------------------------------------------------------------
-- 5. SET browse view (card counts per set, newest first)
-- ------------------------------------------------------------
drop view if exists public.v_sets cascade;
create or replace view public.v_sets as
select s.group_id, s.name, s.slug, s.published_on, s.category_id,
       g.slug as game_slug, g.display_name as game_name,
       extract(year from s.published_on)::int as year,
       count(a.id) filter (where a.tradeable and a.price is not null and not c.is_sealed) as single_count,
       count(a.id) filter (where a.tradeable and a.price is not null and c.is_sealed) as sealed_count
from public.sets s
join public.games g on g.category_id = s.category_id
left join public.cards c on c.group_id = s.group_id
left join public.assets a on a.product_id = c.product_id
group by s.group_id, s.name, s.slug, s.published_on, s.category_id, g.slug, g.display_name;
grant select on public.v_sets to anon, authenticated;
