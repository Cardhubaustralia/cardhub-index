// Cycle state machine — driven by a cron hitting /api/cron/tick
// (or `npm run cycle:tick`). Idempotent; safe to call every minute.
import { SupabaseClient } from "@supabase/supabase-js";
import { syncAllPrices, syncCardmarketOverlay } from "./sync";

export interface TickResult {
  opened: number[];
  locked: number[];
  synced: number[];
  executed: number[];
  failed: number[];
}

export async function tick(
  db: SupabaseClient,
  log: (m: string) => void = console.log
): Promise<TickResult> {
  const result: TickResult = { opened: [], locked: [], synced: [], executed: [], failed: [] };
  const nowIso = new Date().toISOString();

  // 1. make sure upcoming cycles exist
  await db.rpc("ensure_cycles", { p_days: 3 });

  // 2. scheduled -> open
  {
    const { data } = await db
      .from("trade_cycles")
      .update({ status: "open" })
      .eq("status", "scheduled")
      .lte("opens_at", nowIso)
      .select("id");
    (data ?? []).forEach((c: { id: number }) => result.opened.push(c.id));
  }

  // 3. open -> locked (orders freeze), then run the price sync
  {
    const { data } = await db
      .from("trade_cycles")
      .update({ status: "locked" })
      .eq("status", "open")
      .lte("locks_at", nowIso)
      .select("id");
    for (const c of data ?? []) {
      result.locked.push(c.id);
      try {
        log(`cycle ${c.id}: syncing prices…`);
        await syncCardmarketOverlay(db, 500, log);
        await syncAllPrices(db, c.id, log);
        await db.rpc("refresh_long_changes");
        await db.rpc("snapshot_market_index", { p_cycle_id: c.id });
        await db
          .from("trade_cycles")
          .update({ prices_synced_at: new Date().toISOString() })
          .eq("id", c.id);
        result.synced.push(c.id);
      } catch (e) {
        log(`cycle ${c.id}: price sync FAILED: ${e}`);
        // leave locked; next tick can retry sync via the catch-up branch below
      }
    }
  }

  // 3b. catch-up: locked cycles that still have no synced prices
  {
    const { data } = await db
      .from("trade_cycles")
      .select("id")
      .eq("status", "locked")
      .is("prices_synced_at", null)
      .lte("locks_at", nowIso);
    for (const c of data ?? []) {
      try {
        log(`cycle ${c.id}: retrying price sync…`);
        await syncAllPrices(db, c.id, log);
        await db.rpc("refresh_long_changes");
        await db.rpc("snapshot_market_index", { p_cycle_id: c.id });
        await db
          .from("trade_cycles")
          .update({ prices_synced_at: new Date().toISOString() })
          .eq("id", c.id);
        result.synced.push(c.id);
      } catch (e) {
        log(`cycle ${c.id}: retry failed: ${e}`);
      }
    }
  }

  // 4. locked + synced + time reached -> execute (atomic in SQL)
  {
    const { data } = await db
      .from("trade_cycles")
      .select("id")
      .eq("status", "locked")
      .not("prices_synced_at", "is", null)
      .lte("executes_at", nowIso);
    for (const c of data ?? []) {
      const { data: out, error } = await db.rpc("execute_cycle", { p_cycle_id: c.id });
      if (error) {
        log(`cycle ${c.id}: execution FAILED (rolled back): ${error.message}`);
        await db.from("trade_cycles").update({ status: "failed" }).eq("id", c.id);
        result.failed.push(c.id);
      } else {
        log(`cycle ${c.id}: executed ${JSON.stringify(out)}`);
        result.executed.push(c.id);
      }
    }
  }

  return result;
}
