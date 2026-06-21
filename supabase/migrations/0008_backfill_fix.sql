-- ============================================================
-- CardHub Index — make backfill_snapshots self-create partitions
-- Fixes "no partition of relation price_snapshots found for row"
-- when historical dates fall outside pre-created partitions.
-- ============================================================

create or replace function public.backfill_snapshots(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  m record;
begin
  -- ensure a monthly partition exists for every date present in the batch
  for m in
    select distinct date_trunc('month', (x->>'captured_at')::timestamptz) as mon
      from jsonb_array_elements(p_rows) as x
  loop
    perform public.ensure_snapshot_partition(m.mon);
  end loop;

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
