// What variant strings are we actually storing? Should be PRINTINGS only
// (Normal, Holofoil, Reverse Holofoil, Foil, 1st Edition …) and never
// CONDITIONS (Near Mint, Lightly Played, Moderately Played, Damaged …).
//   npx tsx scripts/diagnose-variants.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

// Strings that would indicate condition data leaked into the price feed.
const CONDITION_WORDS = [
  "near mint", "lightly played", "moderately played", "heavily played",
  "damaged", "played", "mint", " nm", "nm ", "lp", "mp", "hp", "dmg",
];

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();

  // distinct variants + how many assets carry each
  const counts = new Map<string, number>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await db
      .from("assets").select("variant").range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? [])
      counts.set(r.variant, (counts.get(r.variant) ?? 0) + 1);
    if (!data || data.length < page) break;
    from += page;
  }

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n${rows.length} distinct variants across ${[...counts.values()].reduce((a, b) => a + b, 0)} assets:\n`);
  for (const [v, n] of rows) {
    const suspect = CONDITION_WORDS.some((w) => v.toLowerCase().includes(w.trim()));
    console.log(`${suspect ? "⚠️ " : "   "}${String(n).padStart(7)}  ${v}`);
  }

  const flagged = rows.filter(([v]) =>
    CONDITION_WORDS.some((w) => v.toLowerCase().includes(w.trim())));
  console.log(
    flagged.length
      ? `\n⚠️  ${flagged.length} variant(s) look like CONDITIONS, not printings — investigate above.`
      : `\n✅ All variants look like printings. No condition data in the price feed.`
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
