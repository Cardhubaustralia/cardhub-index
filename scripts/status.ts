// Health check: cron/cycle state, prices, orders, history.
// Run:  npx tsx scripts/status.ts
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { adminClient } = await import("../src/lib/supabase/admin");
  const db = adminClient();
  const line = "-".repeat(56);

  console.log("\n=== CYCLES (last 8) ===");
  const { data: cycles } = await db
    .from("trade_cycles")
    .select("id, status, opens_at, locks_at, executes_at, prices_synced_at, filled_count, rejected_count")
    .order("executes_at", { ascending: false })
    .limit(8);
  for (const c of cycles ?? []) {
    console.log(
      `#${c.id} ${c.status.padEnd(9)} exec ${new Date(c.executes_at).toISOString()} ` +
      `synced:${c.prices_synced_at ? "yes" : "no "} filled:${c.filled_count} rej:${c.rejected_count}`
    );
  }
  console.log(line);

  const now = Date.now();
  const next = (cycles ?? []).find((c) => new Date(c.executes_at).getTime() > now);
  if (next) {
    const mins = Math.round((new Date(next.executes_at).getTime() - now) / 60000);
    console.log(`Next execution: cycle #${next.id} in ${mins} min (status ${next.status})`);
  } else {
    console.log("⚠ No future cycle scheduled — run `npm run cycle:tick`");
  }

  console.log("\n=== PRICES ===");
  for (const g of [{ id: 3, n: "pokemon" }, { id: 68, n: "one-piece" }]) {
    const { count: priced } = await db
      .from("assets").select("id, cards!inner(category_id)", { count: "exact", head: true })
      .eq("cards.category_id", g.id).not("price", "is", null);
    console.log(`${g.n}: ${priced ?? 0} priced assets`);
  }
  const { data: snapCount } = await db.rpc("count_snapshots").maybeSingle?.() ?? { data: null };
  void snapCount;

  console.log("\n=== ORDERS ===");
  for (const s of ["pending", "filled", "rejected", "cancelled"]) {
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("status", s);
    console.log(`${s.padEnd(10)}: ${count ?? 0}`);
  }

  console.log("\n=== PLAYERS ===");
  const { count: profiles } = await db.from("profiles").select("user_id", { count: "exact", head: true });
  const { count: portfolios } = await db.from("portfolios").select("id", { count: "exact", head: true });
  console.log(`profiles: ${profiles ?? 0} · portfolios: ${portfolios ?? 0}`);

  console.log("\n=== PORTFOLIO VALUE HISTORY ===");
  const { count: hist } = await db.from("portfolio_history").select("portfolio_id", { count: "exact", head: true });
  console.log(`${hist ?? 0} value snapshots recorded`);
  console.log(line);
  console.log("If cycles aren't advancing on their own, Vercel cron isn't firing —");
  console.log("see README 'Cron' section (Hobby plan = daily only).");
}
main().catch((e) => { console.error(e); process.exit(1); });
