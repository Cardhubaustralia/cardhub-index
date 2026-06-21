-- ============================================================
-- CardHub Index — historical price backfill support
-- Bulk-insert real daily prices from TCGAPIs /historic-prices
-- into price_snapshots (cycle_id = 0 marks backfilled rows).
-- ============================================================

-- Ensure all monthly partitions exist across a date range.
create or replace function public.ensure_partitions_range(p_from timestamptz, p_to timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare d timestamptz := date_trunc('month', p_from);
begin
  while d <= p_to loop
    perform public.ensure_snapshot_partition(d);
    d := d + interval '1 month';
  end loop;
end $$;
revoke execute on function public.ensure_partitions_range(timestamptz, timestamptz) from anon, authenticated;

-- Bulk insert historical snapshots. Rows: {product_id, variant, captured_at, price}.
-- Matches to assets by (product_id, variant); de-dupes on (asset_id, captured_at).
create or replace function public.backfill_snapshots(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with src as (
    select * from jsonb_to_recordset(p_rows) as x(
      product_id bigint, variant text, captured_at timestamptz, price numeric
    )
  ),
  ins as (
    insert into price_snapshots (asset_id, cycle_id, price, tcgplayer, captured_at)
    select a.id, 0, s.price, s.price, s.captured_at
      from src s
      join assets a on a.product_id = s.product_id and a.variant = s.variant
     where s.price is not null and s.price > 0
    on conflict (asset_id, captured_at) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;
revoke execute on function public.backfill_snapshots(jsonb) from anon, authenticated;

-- After backfilling, recompute 7d/30d changes from the new history.
-- (refresh_long_changes already exists; this is just a reminder hook.)
