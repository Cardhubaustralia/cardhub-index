-- ============================================================
-- CardHub Index — allow backfilled market-index rows (cycle_id = 0)
-- The FK to trade_cycles blocks historical points that have no cycle.
-- ============================================================
alter table public.market_index_snapshots
  drop constraint if exists market_index_snapshots_cycle_id_fkey;
