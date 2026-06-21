-- ============================================================
-- CardHub Index — movers based on 7d/30d change (populated by the
-- history backfill), not just cycle-over-cycle change.
-- ============================================================

create or replace view public.v_movers as
select a.id as asset_id, a.variant, a.price, a.prev_price,
       a.change_pct, a.change_7d_pct, a.change_30d_pct,
       c.product_id, c.name, c.number, c.rarity, c.image_url, c.slug,
       s.name as set_name, g.slug as game_slug, g.display_name as game_name
from public.assets a
join public.cards c on c.product_id = a.product_id
join public.sets s on s.group_id = c.group_id
join public.games g on g.category_id = c.category_id
where a.tradeable and a.price is not null and a.price >= 1
  and (a.change_7d_pct is not null or a.change_30d_pct is not null or a.change_pct is not null);

grant select on public.v_movers to anon, authenticated;
