// Round 2: test every viable bulk-price strategy against the live API.
// Run:  npx tsx scripts/diagnose-prices-2.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.tcgapis.com";
const KEY = process.env.TCGAPIS_API_KEY!;
const H = { "x-api-key": KEY };

async function tryJson(label: string, url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { headers: H, ...init });
    const text = await res.text();
    console.log(`\n--- ${label}\n${url}\nHTTP ${res.status} · ${text.length} bytes`);
    console.log(text.slice(0, 600));
  } catch (e) {
    console.log(`\n--- ${label}\nERROR: ${e}`);
  }
}

async function tryCsv(label: string, url: string) {
  try {
    const res = await fetch(url, { headers: H });
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.trim());
    console.log(`\n--- ${label}\n${url}\nHTTP ${res.status} · ${lines.length - 1} data rows`);
    console.log("HEADER:", lines[0]?.slice(0, 300));
    console.log("ROW 1 :", lines[1]?.slice(0, 300));
  } catch (e) {
    console.log(`\n--- ${label}\nERROR: ${e}`);
  }
}

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();
  const { data: pkm } = await db.from("cards")
    .select("product_id, name").eq("category_id", 3).limit(3);
  const { data: op } = await db.from("cards")
    .select("product_id, name").eq("category_id", 68).limit(3);
  const ids = [...(pkm ?? []), ...(op ?? [])];
  console.log("Sample products:", JSON.stringify(ids));
  const pid = ids[0]?.product_id;

  // 1. does the prices CSV support field selection (productId)?
  await tryCsv("CSV + fields param",
    `${BASE}/csv/prices/Pokemon?fields=productId,name,set,condition,marketPrice`);

  // 2. does it support expansion filtering?
  await tryCsv("CSV + expansion param",
    `${BASE}/csv/prices/Pokemon?expansion=${encodeURIComponent("SV05: Temporal Forces")}`);

  // 3. does it paginate?
  await tryCsv("CSV + limit/offset",
    `${BASE}/csv/prices/Pokemon?limit=50&offset=7000`);

  // 4. what fields does /csv/fields report for prices?
  await tryJson("CSV fields list", `${BASE}/csv/fields/Pokemon`);

  // 5. single-product price endpoint shape (v2)
  if (pid) await tryJson("v2 prices by productId", `${BASE}/api/v2/prices/${pid}`);

  // 6. trendprices: does it cover Pokemon?
  if (pid) {
    await tryJson("trendprices latest", `${BASE}/api/v2/trendprices/${pid}`);
    await tryJson("trendprices bulk", `${BASE}/api/v2/trendprices/bulk`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: ids.map((r) => r.product_id) }),
    });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
