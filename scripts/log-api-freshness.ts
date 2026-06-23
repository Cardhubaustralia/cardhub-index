// Hourly sampler: records the API's last_updated for ~12 products.
// Self-stops 3 days after the first sample, so it can't run forever.
//   npm run log:freshness
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.tcgapis.com";
const KEY = process.env.TCGAPIS_API_KEY!;
const MAX_DAYS = 3;

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();

  // stop after the 3-day window
  const { data: first } = await db.from("api_freshness_log")
    .select("sampled_at").order("sampled_at").limit(1).maybeSingle();
  if (first) {
    const days = (Date.now() - new Date(first.sampled_at).getTime()) / 86400_000;
    if (days >= MAX_DAYS) {
      console.log(`Freshness window closed (${days.toFixed(1)} days). Not sampling.`);
      return;
    }
  }

  const { data: products } = await db.from("assets")
    .select("product_id, cards!inner(category_id)")
    .not("price", "is", null).order("price", { ascending: false }).limit(12);

  const now = Date.now();
  const rows: { product_id: number; api_last_updated: string | null; age_hours: number | null }[] = [];
  for (const a of products ?? []) {
    try {
      const res = await fetch(`${BASE}/api/v2/prices/${a.product_id}`, { headers: { "x-api-key": KEY } });
      const j = await res.json();
      const lu = (j?.data?.last_updated as string) ?? null;
      rows.push({
        product_id: Number(a.product_id),
        api_last_updated: lu,
        age_hours: lu ? Math.round(((now - new Date(lu).getTime()) / 3_600_000) * 100) / 100 : null,
      });
    } catch (e) { console.error(a.product_id, e); }
  }
  if (rows.length) {
    const { error } = await db.from("api_freshness_log").insert(rows);
    if (error) throw new Error(error.message);
  }
  console.log(`Logged ${rows.length} samples. Latest age: ${rows[0]?.age_hours ?? "?"}h`);
}
main().catch((e) => { console.error(e); process.exit(1); });
