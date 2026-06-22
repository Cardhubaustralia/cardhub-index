// How often does TCGAPIs actually update prices? Prints the API's own
// `last_updated` per product so you can confirm the refresh cadence.
// Run it now and again in a few hours — compare the timestamps.
//   npx tsx scripts/check-api-freshness.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.tcgapis.com";
const KEY = process.env.TCGAPIS_API_KEY!;

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();
  // sample a spread of actively-priced cards
  const { data } = await db.from("assets")
    .select("product_id, price, cards!inner(name)")
    .not("price", "is", null).order("price", { ascending: false }).limit(20);

  console.log("product            last_updated (API)            age");
  const ages: number[] = [];
  for (const a of data ?? []) {
    try {
      const res = await fetch(`${BASE}/api/v2/prices/${a.product_id}`, { headers: { "x-api-key": KEY } });
      const j = await res.json();
      const lu = j?.data?.last_updated as string | undefined;
      const name = (a.cards as unknown as { name: string }).name.slice(0, 16).padEnd(16);
      if (lu) {
        const ageH = (Date.now() - new Date(lu).getTime()) / 3_600_000;
        ages.push(ageH);
        console.log(`${name}   ${lu}   ${ageH.toFixed(1)}h ago`);
      } else {
        console.log(`${name}   (no last_updated)`);
      }
    } catch (e) { console.log(`${a.product_id}: ${e}`); }
  }
  if (ages.length) {
    ages.sort((x, y) => x - y);
    console.log(`\nFreshest: ${ages[0].toFixed(1)}h · Oldest: ${ages[ages.length-1].toFixed(1)}h · Median: ${ages[Math.floor(ages.length/2)].toFixed(1)}h`);
    console.log("Run again in a few hours — if these timestamps don't move, the API updates less often than the cycle.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
