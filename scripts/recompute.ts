// Recompute 7d/30d change for every asset, in batches (avoids timeouts).
// Run after a backfill:  npm run recompute
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const CHUNK = 4000;

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();

  const { data: maxRow } = await db
    .from("assets").select("id").order("id", { ascending: false }).limit(1).single();
  const maxId = Number(maxRow?.id ?? 0);
  console.log(`Recomputing 7d/30d changes for asset ids 1..${maxId} in chunks of ${CHUNK}…`);

  for (let from = 1; from <= maxId; from += CHUNK) {
    const to = from + CHUNK;
    const { error } = await db.rpc("refresh_long_changes_batch", { p_from: from, p_to: to });
    if (error) throw new Error(`chunk ${from}-${to}: ${error.message}`);
    if (((from - 1) / CHUNK) % 10 === 0) console.log(`  …through id ${to}`);
  }

  const { count } = await db
    .from("assets").select("id", { count: "exact", head: true })
    .not("change_7d_pct", "is", null);
  console.log(`Done. ${count ?? 0} assets now have a 7d change.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
