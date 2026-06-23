// Cycle state machine. In production this runs as Supabase pg_cron
// (`run_tick()` every minute — state + execution only). The full tick,
// incl. the heavy price sync at lockout, is also available via
// `npm run cycle:tick`. Idempotent.
//
// KEY DESIGN: execution does NOT depend on the price sync. Any cycle past
// its execute time fills at the most recent prices, so trades always go
// through on schedule even if a sync was slow or a cron run was missed.
import { SupabaseClient } from "@supabase/supabase-js";
import { syncAllPrices, syncCardmarketOverlay } from "./sync";

export interface TickResult {
  opened: number[]; locked: number[]; synced: number[];
  executed: number[]; failed: number[];
}

export async function tick(
  db: SupabaseClient,
  opts: { sync?: boolean } = {},
  log: (m: string) => void = console.log
): Promise<TickResult> {
  const doSync = opts.sync ?? true;
  const result: TickResult = { opened: [], locked: [], synced: [], executed: [], failed: [] };
  const nowIso = () => new Date().toISOString();

  // 1. ensure upcoming cycles exist
  await db.rpc("ensure_cycles", { p_days: 3 });

  // 2. scheduled -> open
  {
    const { data } = await db.from("trade_cycles").update({ status: "open" })
      .eq("status", "scheduled").lte("opens_at", nowIso()).select("id");
    (data ?? []).forEach((c: { id: number }) => result.opened.push(c.id));
  }

  // 3. lockout sync — only for cycles IN the lockout window (locked-time
  //    reached but not yet due). Skipped on light ticks. Overdue cycles are
  //    NOT synced here so they can execute immediately in step 4.
  if (doSync) {
    const { data } = await db.from("trade_cycles").update({ status: "locked" })
      .eq("status", "open").lte("locks_at", nowIso()).gt("executes_at", nowIso())
      .select("id");
    for (const c of data ?? []) {
      result.locked.push(c.id);
      try {
        log(`cycle ${c.id}: syncing prices…`);
        await syncCardmarketOverlay(db, 500, log);
        await syncAllPrices(db, c.id, log);
        await db.rpc("refresh_long_changes");
        await db.rpc("snapshot_market_index", { p_cycle_id: c.id });
        await db.from("trade_cycles").update({ prices_synced_at: nowIso() }).eq("id", c.id);
        result.synced.push(c.id);
      } catch (e) {
        log(`cycle ${c.id}: price sync failed (will execute at last prices): ${e}`);
      }
    }
  }

  // 4. EXECUTE every cycle that is due (past executes_at) and not yet done.
  //    Independent of sync — fills at the most recent prices. Atomically
  //    claims each cycle so concurrent ticks can't double-execute.
  {
    const { data: due } = await db.from("trade_cycles")
      .select("id, status")
      .in("status", ["open", "locked", "executing"])
      .lte("executes_at", nowIso())
      .order("executes_at");
    for (const c of due ?? []) {
      // claim: flip to 'executing' only if still open/locked
      const { data: claimed } = await db.from("trade_cycles")
        .update({ status: "executing" }).eq("id", c.id)
        .in("status", ["open", "locked", "executing"]).select("id");
      if (!claimed?.length) continue;
      const { data: out, error } = await db.rpc("execute_cycle", { p_cycle_id: c.id });
      if (error) {
        log(`cycle ${c.id}: execution error (will retry next tick): ${error.message}`);
        result.failed.push(c.id);
      } else {
        log(`cycle ${c.id}: executed ${JSON.stringify(out)}`);
        result.executed.push(c.id);
      }
    }
  }

  // 5. rank-change notifications after values moved
  if (result.executed.length) {
    const { error } = await db.rpc("notify_ranks");
    if (error) log(`notify_ranks: ${error.message}`);
  }

  return result;
}
