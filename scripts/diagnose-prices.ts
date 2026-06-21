// Inspect the prices CSV so we can verify column names and row coverage.
// Run:  npx tsx scripts/diagnose-prices.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { fetchPricesCsv, parseCsv } = await import("../src/lib/tcgapis");

  for (const game of ["Pokemon", "One Piece Card Game"]) {
    console.log(`\n================ ${game} ================`);
    const csv = await fetchPricesCsv(game);
    console.log(`CSV size: ${(csv.length / 1024).toFixed(0)} KB`);
    const rows = parseCsv(csv);
    console.log(`Data rows: ${rows.length}`);
    if (!rows.length) {
      console.log("RAW FIRST 500 CHARS:\n" + csv.slice(0, 500));
      continue;
    }
    console.log(`Columns: ${Object.keys(rows[0]).join(" | ")}`);
    console.log("Sample row 1:", JSON.stringify(rows[0], null, 2).slice(0, 800));
    console.log("Sample row 2:", JSON.stringify(rows[Math.floor(rows.length / 2)], null, 2).slice(0, 800));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
