// Why didn't my order fill? Dumps recent orders + the state of their cycles.
// Run:  npx tsx scripts/diagnose-orders.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();

  const { data: orders } = await db
    .from("orders")
    .select("id, side, qty, status, est_price, executed_price, reject_reason, cycle_id, league_id, asset_id, created_at, executed_at")
    .order("created_at", { ascending: false })
    .limit(20);

  console.log("=== RECENT ORDERS ===");
  for (const o of orders ?? []) {
    console.log(
      `${o.created_at?.slice(0,16)} ${o.side.toUpperCase().padEnd(4)} x${o.qty} ` +
      `status=${o.status.padEnd(9)} cycle=${o.cycle_id} est=${o.est_price} ` +
      `exec=${o.executed_price ?? "-"} ${o.reject_reason ? "REJECT:"+o.reject_reason : ""}`
    );
  }

  const cycleIds = [...new Set((orders ?? []).map((o) => o.cycle_id))];
  console.log("\n=== CYCLES THOSE ORDERS BELONG TO ===");
  const { data: cycles } = await db
    .from("trade_cycles")
    .select("id, status, opens_at, locks_at, executes_at, prices_synced_at, executed_at, filled_count, rejected_count")
    .in("id", cycleIds);
  const now = Date.now();
  for (const c of cycles ?? []) {
    const rel = (iso: string | null) =>
      iso ? `${Math.round((new Date(iso).getTime() - now) / 60000)}m` : "—";
    console.log(
      `#${c.id} status=${c.status.padEnd(10)} locks=${rel(c.locks_at)} exec=${rel(c.executes_at)} ` +
      `synced=${c.prices_synced_at ? "YES" : "no "} executed_at=${c.executed_at ?? "—"} ` +
      `filled=${c.filled_count} rej=${c.rejected_count}`
    );
  }

  console.log("\n=== STUCK CYCLES (locked/executing/scheduled but past executes_at) ===");
  const { data: stuck } = await db
    .from("trade_cycles")
    .select("id, status, executes_at, prices_synced_at")
    .in("status", ["scheduled", "open", "locked", "executing"])
    .lte("executes_at", new Date().toISOString())
    .order("executes_at");
  for (const c of stuck ?? []) {
    console.log(`#${c.id} status=${c.status} executes_at=${c.executes_at} synced=${c.prices_synced_at ? "YES":"no"}`);
  }
  if (!stuck?.length) console.log("(none — all past cycles executed)");
}
main().catch((e) => { console.error(e); process.exit(1); });
