// Inspect the historical price endpoints so we can backfill charts.
// Run:  npx tsx scripts/diagnose-history.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.tcgapis.com";
const KEY = process.env.TCGAPIS_API_KEY!;
const H = { "x-api-key": KEY };

async function dump(label: string, url: string) {
  try {
    const res = await fetch(url, { headers: H });
    const text = await res.text();
    console.log(`\n===== ${label}\n${url}\nHTTP ${res.status} · ${text.length} bytes`);
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2).slice(0, 2500));
    } catch {
      console.log(text.slice(0, 1500));
    }
  } catch (e) {
    console.log(`\n===== ${label}\nERROR: ${e}`);
  }
}

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();
  // grab a high-value, actively-traded card so history is rich
  const { data } = await db
    .from("assets")
    .select("product_id, variant, price, cards!inner(name, category_id)")
    .order("price", { ascending: false })
    .limit(5);
  console.log("Top priced assets:", JSON.stringify(data, null, 2));
  const pid = data?.[0]?.product_id ?? 87;

  await dump("historic-prices", `${BASE}/api/v2/historic-prices/${pid}`);
  await dump("sales-history (recent)", `${BASE}/api/v2/sales-history/${pid}`);
  await dump("sales-history FULL", `${BASE}/api/v2/sales-history/${pid}/full`);
}
main().catch((e) => { console.error(e); process.exit(1); });
