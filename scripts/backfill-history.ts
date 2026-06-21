// Backfill real daily price history from TCGAPIs /historic-prices into
// price_snapshots, so charts (7D/30D/90D) populate immediately.
//
//   npx tsx scripts/backfill-history.ts                 # everything
//   npx tsx scripts/backfill-history.ts --game=pokemon  # one game
//   npx tsx scripts/backfill-history.ts --min-price=5   # skip cheap cards
//   npx tsx scripts/backfill-history.ts --limit=2000    # cap (testing)
//
// Resumable: products already backfilled (a cycle_id=0 snapshot exists)
// are skipped, so you can stop and re-run safely.
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const GAME_CAT: Record<string, number> = { pokemon: 3, "one-piece": 68 };
const CONCURRENCY = 8;            // ~under the 2000 req/min ceiling
const BATCH_ROWS = 2000;
const HISTORY_DAYS = 100;         // charts only show up to 90d; keep it lean
const SINCE = new Date(Date.now() - HISTORY_DAYS * 86400_000)
  .toISOString()
  .slice(0, 10);

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const { fetchHistoricPrices } = await import("../src/lib/tcgapis");
  const db = adminClient();

  const minPrice = args["min-price"] ? Number(args["min-price"]) : 0;
  const limit = args.limit ? Number(args.limit) : Infinity;
  const catId = args.game ? GAME_CAT[args.game] : undefined;

  // partitions: historic data goes back ~10 months
  await db.rpc("ensure_partitions_range", {
    p_from: new Date(Date.now() - 400 * 86400_000).toISOString(),
    p_to: new Date().toISOString(),
  });

  // products to process: distinct product_ids with at least one priced asset
  console.log("Loading product list…");
  const products = new Map<number, Set<string>>(); // productId -> variants we hold
  {
    let from = 0;
    const page = 1000;
    for (;;) {
      let q = db
        .from("assets")
        .select("product_id, variant, price, cards!inner(category_id)")
        .not("price", "is", null)
        .gte("price", minPrice)
        .order("product_id")
        .range(from, from + page - 1);
      if (catId) q = q.eq("cards.category_id", catId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const pid = Number(r.product_id);
        if (!products.has(pid)) products.set(pid, new Set());
        products.get(pid)!.add(r.variant);
      }
      if (!data || data.length < page) break;
      from += page;
    }
  }
  console.log(`${products.size} products to consider`);

  // resume: skip products that already have backfilled history
  const done = new Set<number>();
  {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await db
        .from("price_snapshots")
        .select("asset_id, assets!inner(product_id)")
        .eq("cycle_id", 0)
        .order("asset_id")
        .range(from, from + page - 1);
      if (error) break; // table/col fine; if it errors just don't resume
      for (const r of data ?? []) {
        const p = (r.assets as unknown as { product_id: number })?.product_id;
        if (p) done.add(Number(p));
      }
      if (!data || data.length < page) break;
      from += page;
    }
  }
  if (done.size) console.log(`${done.size} products already backfilled — skipping`);

  const todo = [...products.entries()].filter(([pid]) => !done.has(pid)).slice(0, limit);
  console.log(`Backfilling ${todo.length} products with ${CONCURRENCY}-way concurrency…\n`);

  let processed = 0;
  let inserted = 0;
  let pending: { product_id: number; variant: string; captured_at: string; price: number }[] = [];

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    const { data, error } = await db.rpc("backfill_snapshots", { p_rows: batch });
    if (error) console.error(`  backfill_snapshots error: ${error.message}`);
    else inserted += Number(data ?? 0);
  };

  const worker = async (entries: [number, Set<string>][]) => {
    for (const [pid, variants] of entries) {
      try {
        const hp = await fetchHistoricPrices(pid);
        if (hp?.data?.prices) {
          for (const [date, byVariant] of Object.entries(hp.data.prices)) {
            if (date < SINCE) continue; // last ~100 days only
            for (const v of variants) {
              const p = byVariant[v];
              const price = p?.midPrice ?? (p?.lowPrice != null && p?.highPrice != null
                ? (p.lowPrice + p.highPrice) / 2 : null);
              if (price && price > 0) {
                pending.push({
                  product_id: pid,
                  variant: v,
                  captured_at: `${date}T00:00:00.000Z`,
                  price: Math.round(price * 100) / 100,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`  product ${pid}: ${e}`);
      }
      processed++;
      if (pending.length >= BATCH_ROWS) await flush();
      if (processed % 500 === 0)
        console.log(`  ${processed}/${todo.length} products · ${inserted} snapshots inserted`);
    }
  };

  // split work across N workers
  const buckets: [number, Set<string>][][] = Array.from({ length: CONCURRENCY }, () => []);
  todo.forEach((entry, i) => buckets[i % CONCURRENCY].push(entry));
  await Promise.all(buckets.map(worker));
  await flush();

  console.log(`\nDone. ${processed} products processed, ${inserted} snapshots inserted.`);
  console.log("Recomputing 7d/30d changes…");
  await db.rpc("refresh_long_changes");
  console.log("Backfill complete. Charts should now show history.");
}
main().catch((e) => { console.error(e); process.exit(1); });
