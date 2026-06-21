// Build market-index history (one point per game per day) from the
// backfilled price snapshots, so the dashboard trend graphs populate.
// Run once after backfilling prices:  npm run backfill:index
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const DAYS = 95;

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();
  console.log(`Building ${DAYS} days of market-index history…`);

  for (let i = DAYS; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const { error } = await db.rpc("backfill_index_day", { p_day: day });
    if (error) throw new Error(`${day}: ${error.message}`);
    if (i % 15 === 0) console.log(`  …${day}`);
  }
  console.log("Done. Dashboard trend graphs will now show ~3 months of history.");
}
main().catch((e) => { console.error(e); process.exit(1); });
