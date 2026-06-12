// Manual price sync against the latest locked/open cycle:  npm run sync:prices
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const { syncAllPrices } = await import("../src/lib/sync");
  const db = adminClient();
  await db.rpc("ensure_cycles", { p_days: 3 });
  const { data: cycle } = await db
    .from("trade_cycles")
    .select("id, status, executes_at")
    .in("status", ["open", "locked", "scheduled"])
    .order("executes_at")
    .limit(1)
    .single();
  if (!cycle) throw new Error("no upcoming cycle found — run migrations first");
  console.log(`syncing prices into cycle ${cycle.id} (${cycle.status})`);
  await syncAllPrices(db, cycle.id);
  await db.rpc("refresh_long_changes");
  console.log("price sync complete");
}
main().catch((e) => { console.error(e); process.exit(1); });
