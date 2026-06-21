// Catalog + price sync engine. Server-only (service role).
import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchExpansions, fetchCards, fetchPricesCsv, fetchCardmarketPrice,
  parseCsv, pick, COL,
} from "./tcgapis";

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
// PRICE SYNC — whole-game CSV per game (1 request), upsert assets,
// snapshot to price_snapshots for the given cycle.
// ------------------------------------------------------------
export interface PriceSyncResult { game: string; assets: number; skipped: number }

// The prices CSV has no productId column, so we match each row back to
// the catalog by (set name, product name) — both sides originate from
// TCGPlayer product names, so exact (case-insensitive) matching is solid.
const norm = (s: string) => s.trim().toLowerCase();

export async function syncPricesForGame(
  db: SupabaseClient,
  game: (typeof GAMES)[number],
  cycleId: number,
  eurUsd: number,
  log: (m: string) => void = console.log
): Promise<PriceSyncResult> {
  // 1. sets for this game
  const { data: sets, error: setsErr } = await db
    .from("sets")
    .select("group_id, name")
    .eq("category_id", game.categoryId);
  if (setsErr) throw new Error(setsErr.message);

  // 2. card name -> productId map (paged: Supabase caps requests at 1000 rows)
  const cardMap = new Map<string, number>();
  let dupNames = 0;
  {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await db
        .from("cards")
        .select("product_id, group_id, name")
        .eq("category_id", game.categoryId)
        .order("product_id")
        .range(from, from + page - 1);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const key = `${r.group_id}::${norm(r.name)}`;
        if (cardMap.has(key)) dupNames++;
        else cardMap.set(key, Number(r.product_id));
      }
      if (!data || data.length < page) break;
      from += page;
    }
  }
  log(`${game.slug}: ${cardMap.size} catalogued products (${dupNames} duplicate names ignored)`);

  const setByName = new Map<string, number>();
  (sets ?? []).forEach((s) => setByName.set(norm(s.name), s.group_id));

  // 3. Cardmarket overlay for the blend
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
  const assets = new Map<string, AssetRow>(); // dedupe on (productId, variant)
  let skippedUnknown = 0;
  let skippedNoPrice = 0;
  let failedSets = 0;
  const now = new Date().toISOString();

  // 4. one CSV per expansion (the whole-game CSV is capped at ~7000 rows)
  for (const set of sets ?? []) {
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(await fetchPricesCsv(game.name, set.name));
    } catch (e) {
      failedSets++;
      log(`${game.slug} / ${set.name}: CSV failed (${e}) — skipping set`);
      continue;
    }
    for (const row of rows) {
      const setName = norm(pick(row, COL.set));
      const groupId = setByName.get(setName) ?? set.group_id;
      const pid = cardMap.get(`${groupId}::${norm(pick(row, COL.name))}`);
      if (!pid) { skippedUnknown++; continue; }
      const tcg = parseFloat(
        pick(row, COL.marketPrice) || pick(row, COL.price) || pick(row, COL.lowPrice)
      );
      if (!tcg || tcg <= 0) { skippedNoPrice++; continue; }
      const variant = pick(row, COL.variant) || "Normal";
      const cmEur = cmMap.get(`${pid}:${variant}`) ?? null;
      const cmUsd = cmEur ? cmEur * eurUsd : null;
      const price = cmUsd ? (tcg + cmUsd) / 2 : tcg;
      assets.set(`${pid}:${variant}`, {
        product_id: pid,
        variant,
        price: Math.round(price * 100) / 100,
        tcgplayer_price: tcg,
        cardmarket_eur: cmEur,
        price_source: cmUsd ? "blend" : "tcgplayer",
        price_updated_at: now,
      });
    }
  }

  // 5. upsert: rolls price -> prev_price + snapshots, via RPC
  const rows = [...assets.values()];
  for (const batch of chunk(rows, 1000)) {
    const { error } = await db.rpc("upsert_asset_prices", {
      p_rows: batch,
      p_cycle_id: cycleId,
    });
    if (error) throw new Error(`upsert_asset_prices: ${error.message}`);
  }

  log(
    `${game.slug}: upserted ${rows.length} assets ` +
    `(${skippedUnknown} rows unmatched, ${skippedNoPrice} no price, ${failedSets} sets failed)`
  );
  return { game: game.slug, assets: rows.length, skipped: skippedUnknown + skippedNoPrice };
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
