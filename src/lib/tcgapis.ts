// Server-side TCGAPIs client. NEVER import this in client components.

const BASE = "https://api.tcgapis.com";

function headers() {
  const key = process.env.TCGAPIS_API_KEY;
  if (!key) throw new Error("TCGAPIS_API_KEY is not set");
  return { "x-api-key": key };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`TCGAPIs ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export interface ApiList<T> {
  success: boolean;
  count: number;
  total?: number;
  offset?: number;
  limit?: number;
  data: T[];
}

export interface ApiGame { categoryId: number; name: string; displayName: string }
export interface ApiExpansion {
  groupId: number; name: string; abbreviation?: string; publishedOn?: string;
}
export interface ApiCard {
  productId: number; name: string; image?: string; imageUrl?: string;
  rarity?: string; number?: string; cleanName?: string;
}

export async function fetchGames() {
  return getJson<ApiList<ApiGame>>("/api/v2/games?limit=100");
}

export async function fetchExpansions(categoryId: number) {
  const out: ApiExpansion[] = [];
  let offset = 0;
  for (;;) {
    const page = await getJson<ApiList<ApiExpansion>>(
      `/api/v2/expansions/${categoryId}?limit=100&offset=${offset}`
    );
    out.push(...page.data);
    offset += page.data.length;
    if (!page.total || offset >= page.total || page.data.length === 0) break;
  }
  return out;
}

export async function fetchCards(groupId: number) {
  const out: ApiCard[] = [];
  let offset = 0;
  for (;;) {
    const page = await getJson<ApiList<ApiCard>>(
      `/api/v2/cards/${groupId}?limit=100&offset=${offset}`
    );
    out.push(...page.data);
    offset += page.data.length;
    if (!page.total || offset >= page.total || page.data.length === 0) break;
  }
  return out;
}

// Price CSV. The whole-game CSV is CAPPED at ~7000 rows and has NO
// productId column, so we fetch PER EXPANSION (uncapped) and match rows
// back to the catalog by set + name + printing.
// CSV columns (verified live 2026-06-13):
//   game,name,set,rarity,condition,price,lowPrice,highPrice,marketPrice,
//   directLowPrice,currency,marketplace,lastUpdated
export async function fetchPricesCsv(
  gameName: string,
  expansion?: string
): Promise<string> {
  const url =
    `${BASE}/csv/prices/${encodeURIComponent(gameName)}` +
    (expansion ? `?expansion=${encodeURIComponent(expansion)}` : "");
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`prices CSV ${gameName}/${expansion ?? "all"} -> ${res.status}`);
  return res.text();
}

// Per-product current prices, keyed by variant — UNAMBIGUOUS (unlike the
// per-set CSV which has no productId and collides on same-name cards).
// Shape: data.prices = { "<variant>": { lowPrice, midPrice, highPrice, marketPrice, directLowPrice } }
export interface ProductPrices {
  success: boolean;
  data: {
    productId: number;
    prices: Record<string, {
      lowPrice: number | null; midPrice: number | null; highPrice: number | null;
      marketPrice: number | null; directLowPrice: number | null;
    }>;
  };
}
export async function fetchProductPrices(productId: number): Promise<ProductPrices | null> {
  const res = await fetch(`${BASE}/api/v2/prices/${productId}`, {
    headers: headers(), cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`prices ${productId} -> ${res.status}`);
  return res.json() as Promise<ProductPrices>;
}

// Cardmarket price guide for a single product (used for the blended
// overlay on actively-traded cards only).
export interface CardmarketPrice {
  idProduct: number;
  low: number | null; avg: number | null; trend: number | null;
  avg1: number | null; avg7: number | null; avg30: number | null;
  "trend-foil": number | null; "avg7-foil": number | null; "avg30-foil": number | null;
}
export async function fetchCardmarketPrice(idProduct: number) {
  const json = await getJson<{ success: boolean; data: CardmarketPrice }>(
    `/api/v2/cardmarket/prices/${idProduct}`
  );
  return json.data;
}

// Historic prices for one product. Shape (verified live 2026-06-13):
//   data.prices = { "YYYY-MM-DD": { "<variant>": { highPrice, lowPrice, midPrice } } }
export interface HistoricPrices {
  success: boolean;
  data: {
    productId: number;
    createdAt?: string;
    prices: Record<string, Record<string, {
      highPrice: number | null;
      lowPrice: number | null;
      midPrice: number | null;
    }>>;
  };
}
export async function fetchHistoricPrices(productId: number): Promise<HistoricPrices | null> {
  const res = await fetch(`${BASE}/api/v2/historic-prices/${productId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`historic-prices ${productId} -> ${res.status}`);
  return res.json() as Promise<HistoricPrices>;
}

// ---------------- CSV parsing ----------------
// Tolerant CSV parser (handles quoted fields with commas/newlines).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
    return obj;
  });
}

