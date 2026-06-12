-- ============================================================
-- CardHub Index — sync helper functions (service-role only)
-- ============================================================

-- Bulk price upsert: rolls current price -> prev_price, computes
-- cycle-over-cycle change, snapshots into price_snapshots.
create or replace function public.upsert_asset_prices(p_rows jsonb, p_cycle_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  with src as (
    select * from jsonb_to_recordset(p_rows) as x(
      product_id bigint, variant text, price numeric,
      tcgplayer_price numeric, cardmarket_eur numeric,
      price_source text, price_updated_at timestamptz
    )
  )
  insert into assets (product_id, variant, price, tcgplayer_price,
                      cardmarket_eur, price_source, price_updated_at)
  select s.product_id, s.variant, s.price, s.tcgplayer_price,
         s.cardmarket_eur, s.price_source, s.price_updated_at
    from src s
    join cards c on c.product_id = s.product_id   -- guard: catalogued only
  on conflict (product_id, variant) do update set
    prev_price = assets.price,
    change_pct = case when assets.price > 0
                 then round((excluded.price - assets.price) / assets.price * 100, 4)
                 end,
    price = excluded.price,
    tcgplayer_price = excluded.tcgplayer_price,
    cardmarket_eur = excluded.cardmarket_eur,
    price_source = excluded.price_source,
    price_updated_at = excluded.price_updated_at;

  insert into price_snapshots (asset_id, cycle_id, price, tcgplayer, cardmarket, captured_at)
  select a.id, p_cycle_id, s.price, s.tcgplayer_price, s.cardmarket_eur, now()
    from jsonb_to_recordset(p_rows) as s(
      product_id bigint, variant text, price numeric,
      tcgplayer_price numeric, cardmarket_eur numeric,
      price_source text, price_updated_at timestamptz
    )
    join assets a on a.product_id = s.product_id and a.variant = s.variant
  on conflict (asset_id, captured_at) do nothing;
end $$;

-- Recompute 7d / 30d change for assets that have a current price.
-- Called once per cycle after the price sync.
create or replace function public.refresh_long_changes()
returns void language sql security definer set search_path = public as $$
  update assets a set
    change_7d_pct = (
      select case when s.price > 0
             then round((a.price - s.price) / s.price * 100, 4) end
      from price_snapshots s
      where s.asset_id = a.id and s.captured_at <= now() - interval '7 days'
      order by s.captured_at desc limit 1
    ),
    change_30d_pct = (
      select case when s.price > 0
             then round((a.price - s.price) / s.price * 100, 4) end
      from price_snapshots s
      where s.asset_id = a.id and s.captured_at <= now() - interval '30 days'
      order by s.captured_at desc limit 1
    )
  where a.price is not null and a.tradeable;
$$;

-- Most actively traded/held assets (for the Cardmarket blend overlay).
create or replace function public.top_traded_assets(p_limit int default 500)
returns table (asset_id bigint, cardmarket_id bigint)
language sql stable security definer set search_path = public as $$
  select a.id, c.cardmarket_id
    from assets a
    join cards c on c.product_id = a.product_id
    left join (
      select o.asset_id, count(*) as n from orders o
      where o.created_at > now() - interval '7 days' group by 1
    ) act on act.asset_id = a.id
    left join (
      select h.asset_id, count(*) as n from holdings h group by 1
    ) held on held.asset_id = a.id
   where a.tradeable and c.cardmarket_id is not null
   order by coalesce(act.n, 0) + coalesce(held.n, 0) desc,
            a.price desc nulls last
   limit p_limit;
$$;

-- Lock all functions in this file away from client roles.
revoke execute on function public.upsert_asset_prices(jsonb, bigint) from anon, authenticated;
revoke execute on function public.refresh_long_changes() from anon, authenticated;
revoke execute on function public.top_traded_assets(int) from anon, authenticated;
revoke execute on function public.execute_cycle(bigint) from anon, authenticated;
revoke execute on function public.ensure_cycles(int) from anon, authenticated;
revoke execute on function public.ensure_snapshot_partition(timestamptz) from anon, authenticated;
