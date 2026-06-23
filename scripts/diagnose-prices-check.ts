// Why are some prices/% absurd? Compares our stored price + 7d baseline
// against the LIVE API for the current top movers and priciest assets.
//   npx tsx scripts/diagnose-prices-check.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.tcgapis.com";
const KEY = process.env.TCGAPIS_API_KEY!;

async function apiPrice(pid: number, variant: string) {
  try {
    const r = await fetch(`${BASE}/api/v2/prices/${pid}`, { headers: { "x-api-key": KEY } });
    const j = await r.json();
    const p = j?.data?.prices?.[variant];
    return p ? (p.marketPrice ?? p.midPrice ?? null) : null;
  } catch { return null; }
}

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();

  const show = async (label: string, rows: { asset_id: number; product_id: number; variant: string; price: number; change_7d_pct: number | null; cards?: { name: string } }[]) => {
    console.log(`\n=== ${label} ===`);
    for (const a of rows) {
      const apiNow = await apiPrice(a.product_id, a.variant);
      // 7d-ago snapshot actually used
      const { data: s7 } = await db.from("price_snapshots")
        .select("price, captured_at").eq("asset_id", a.asset_id)
        .lte("captured_at", new Date(Date.now() - 7 * 86400_000).toISOString())
        .order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const name = (a.cards?.name ?? "?").slice(0, 26).padEnd(26);
      console.log(
        `${name} ${a.variant.slice(0,18).padEnd(18)} stored=$${a.price}  API=$${apiNow ?? "—"}  ` +
        `7dAgo=$${s7?.price ?? "—"}  chg7d=${a.change_7d_pct ?? "—"}%`
      );
    }
  };

  const { data: movers } = await db.from("assets")
    .select("id, product_id, variant, price, change_7d_pct, cards!inner(name)")
    .not("change_7d_pct", "is", null).gte("price", 5)
    .order("change_7d_pct", { ascending: false }).limit(8);
  await show("TOP 8 BY 7d % (the 'movers')",
    (movers ?? []).map((m) => ({ asset_id: m.id, product_id: m.product_id, variant: m.variant, price: Number(m.price), change_7d_pct: m.change_7d_pct as number, cards: m.cards as unknown as { name: string } })));

  const { data: pricey } = await db.from("assets")
    .select("id, product_id, variant, price, change_7d_pct, cards!inner(name)")
    .order("price", { ascending: false }).limit(8);
  await show("TOP 8 BY PRICE (absurd highs?)",
    (pricey ?? []).map((m) => ({ asset_id: m.id, product_id: m.product_id, variant: m.variant, price: Number(m.price), change_7d_pct: m.change_7d_pct as number, cards: m.cards as unknown as { name: string } })));

  console.log("\nRead: stored vs API — if they match, the price is real (API value).");
  console.log("If 7dAgo is tiny/odd vs stored, the % is a backfill-baseline artifact (clears as live cycles accrue).");
}
main().catch((e) => { console.error(e); process.exit(1); });
