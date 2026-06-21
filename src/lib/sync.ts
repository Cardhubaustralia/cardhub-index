// Catalog + price sync engine. Server-only (service role).
import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchExpansions, fetchCards, fetchProductPrices, fetchCardmarketPrice,
} from "./tcgapis";

// Global rate limiter: space API calls ~35ms apart (~1700/min, under the
// 2000/min ceiling) regardless of concurrency.
let _nextSlot = 0;
const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function rateSlot() {
  const now = Date.now();
  const wait = Math.max(0, _nextSlot - now);
  _nextSlot = Math.max(now, _nextSlot) + 35;
  if (wait) await _sleep(wait);
}

export const GAMES = [
  { categoryId: 3, slug: "pokemon", name: "Pokemon", displayName: "Pokémon" },
  { categoryId: 68, slug: "one-piece", name: "One Piece Card Game", displayName: "One Piece Card Game" },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ------------------------------------------------------------
// CATALOG SYNC — games, sets, cards. Run daily (new sets) or on demand.
// ------------------------------------------------------------
export async function syncCatalog(db: SupabaseClient, log: (m: string) => void = console.log) {
  for (const g of GAMES) {
    await db.from("games").upsert(
      { category_id: g.categoryId, slug: g.slug, name: g.name, display_name: g.displayName },
      { onConflict: "category_id" }
    );

    const expansions = await fetchExpansions(g.categoryId);
    log(`${g.slug}: ${expansions.length} sets`);
    const setRows = expansions.map((e) => ({
      group_id: e.groupId,
      category_id: g.categoryId,
      name: e.name,
      abbreviation: e.abbreviation ?? null,
      published_on: e.publishedOn ? e.publishedOn.slice(0, 10) : null,
      slug: slugify(e.name),
    }));
    for (const batch of chunk(setRows, 500)) {
      const { error } = await db.from("sets").upsert(batch, { onConflict: "group_id" });
      if (error) throw new Error(`sets upsert: ${error.message}`);
    }

    for (const e of expansions) {
      const cards = await fetchCards(e.groupId);
      if (!cards.length) continue;
      const seen = new Set<number>();
      const rows = cards
        .filter((c) => {
          if (seen.has(c.productId)) return false;
          seen.add(c.productId);
          return true;
        })
        .map((c) => ({
          product_id: c.productId,
          group_id: e.groupId,
          category_id: g.categoryId,
          name: c.name,
          clean_name: c.cleanName ?? null,
          number: c.number ?? null,
          rarity: c.rarity ?? null,
          image_url: c.image ?? c.imageUrl ?? null,
          slug: `${slugify(e.name)}-${slugify(c.name)}-${c.productId}`,
        }));
      for (const batch of chunk(rows, 500)) {
        const { error } = await db.from("cards").upsert(batch, { onConflict: "product_id" });
        if (error) throw new Error(`cards upsert (${e.name}): ${error.message}`);
      }
      log(`${g.slug} / ${e.name}: ${rows.length} cards`);
    }
  }
}

// ------------------------------------------------------------
// FX — EUR -> USD via ECB (frankfurter.dev), cached per run
// ------------------------------------------------------------
export async function fetchEurUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
    const json = await res.json();
    const rate = json?.rates?.USD;
    if (typeof rate === "number" && rate > 0.5 && rate < 2.5) return rate;
  } catch { /* fall through */ }
  return 1.08; // safe fallback
}

// ------------------------------------------------------------
// PRICE SYNC — per-product /api/v2/prices/{id}, keyed by variant.
// Unambiguous (no same-name collisions). One call per product,
// globally rate-limited. Designed to run in a long worker (GH Actions).
// ------------------------------------------------------------
export interface PriceSyncResult { game: string; assets: number; skipped: number }

const SYNC_CONCURRENCY = 10;

export async function syncPricesForGame(
  db: SupabaseClient,
  game: (typeof GAMES)[number],
  cycleId: number,
  eurUsd: number,
  log: (m: string) => void = console.log
): Promise<PriceSyncResult> {
  // 1. all catalogued products for this game (paged; 1000-row cap).
  //    Price every variant the API returns so new cards/variants get
  //    asset rows created automatically (upsert_asset_prices joins cards).
  const productIds: number[] = [];
  {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await db
        .from("cards")
        .select("product_id")
        .eq("category_id", game.categoryId)
        .order("product_id")
        .range(from, from + page - 1);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) productIds.push(Number(r.product_id));
      if (!data || data.length < page) break;
      from += page;
    }
  }
  log(`${game.slug}: ${productIds.length} products to price`);

  // 2. Cardmarket overlay for the blend
  const { data: cmRows } = await db
    .from("assets")
    .select("product_id, variant, cardmarket_eur")
    .not("cardmarket_eur", "is", null);
  const cmMap = new Map<string, number>();
  (cmRows ?? []).forEach((r: { product_id: number; variant: string; cardmarket_eur: number }) =>
    cmMap.set(`${r.product_id}:${r.variant}`, Number(r.cardmarket_eur))
  );

  type AssetRow = {
    product_id: number; variant: string; price: number;
    tcgplayer_price: number; cardmarket_eur: number | null; price_source: string;
    price_updated_at: string;
  };
  const now = new Date().toISOString();
  let pending: AssetRow[] = [];
  let upserted = 0;
  let processed = 0;
  let noPrice = 0;

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    const { error } = await db.rpc("upsert_asset_prices", { p_rows: batch, p_cycle_id: cycleId });
    if (error) throw new Error(`upsert_asset_prices: ${error.message}`);
    upserted += batch.length;
  };

  const buckets: number[][] = Array.from({ length: SYNC_CONCURRENCY }, () => []);
  productIds.forEach((pid, i) => buckets[i % SYNC_CONCURRENCY].push(pid));

  const worker = async (list: number[]) => {
    for (const pid of list) {
      // retry transient network failures (e.g. laptop sleep / wifi blip)
      let pr: Awaited<ReturnType<typeof fetchProductPrices>> = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        await rateSlot();
        try {
          pr = await fetchProductPrices(pid);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await _sleep(500 * (attempt + 1)); // 0.5s, 1s, 1.5s backoff
        }
      }
      if (lastErr) { log(`${game.slug} product ${pid}: ${lastErr} (gave up)`); processed++; continue; }
      try {
        if (pr?.data?.prices) {
          for (const [v, p] of Object.entries(pr.data.prices)) {
            const tcg = p?.marketPrice ?? p?.midPrice ?? null;
            if (!tcg || tcg <= 0) { noPrice++; continue; }
            const cmEur = cmMap.get(`${pid}:${v}`) ?? null;
            const cmUsd = cmEur ? cmEur * eurUsd : null;
            const price = cmUsd ? (tcg + cmUsd) / 2 : tcg;
            pending.push({
              product_id: pid, variant: v,
              price: Math.round(price * 100) / 100,
              tcgplayer_price: tcg,
              cardmarket_eur: cmEur,
              price_source: cmUsd ? "blend" : "tcgplayer",
              price_updated_at: now,
            });
          }
        }
      } catch (e) {
        log(`${game.slug} product ${pid}: ${e}`);
      }
      processed++;
      if (pending.length >= 1000) await flush();
      if (processed % 2000 === 0)
        log(`  ${game.slug}: ${processed}/${productIds.length} products · ${upserted} prices`);
    }
  };

  await Promise.all(buckets.map(worker));
  await flush();

  log(`${game.slug}: upserted ${upserted} prices (${noPrice} variants had no price)`);
  return { game: game.slug, assets: upserted, skipped: noPrice };
}

// Refresh Cardmarket EUR prices for the most actively traded assets
// (per-product API calls, so we cap the universe).
export async function syncCardmarketOverlay(
  db: SupabaseClient,
  limit = 500,
  log: (m: string) => void = console.log
) {
  const { data, error } = await db.rpc("top_traded_assets", { p_limit: limit });
  if (error) { log(`cardmarket overlay skipped: ${error.message}`); return 0; }
  let updated = 0;
  for (const row of data ?? []) {
    const cmId = row.cardmarket_id as number | null;
    if (!cmId) continue;
    try {
      const cm = await fetchCardmarketPrice(cmId);
      const eur = cm.avg7 ?? cm.trend ?? cm.avg30 ?? cm.avg ?? null;
      if (eur && eur > 0) {
        await db.from("assets").update({ cardmarket_eur: eur }).eq("id", row.asset_id);
        updated++;
      }
    } catch { /* individual failures are fine */ }
  }
  log(`cardmarket overlay: ${updated} assets refreshed`);
  return updated;
}

export async function syncAllPrices(
  db: SupabaseClient,
  cycleId: number,
  log: (m: string) => void = console.log
) {
  await db.rpc("ensure_snapshot_partition", { p_ts: new Date().toISOString() });
  const eurUsd = await fetchEurUsd();
  log(`EUR/USD = ${eurUsd}`);
  const results: PriceSyncResult[] = [];
  for (const g of GAMES) {
    results.push(await syncPricesForGame(db, g, cycleId, eurUsd, log));
  }
  return results;
}
