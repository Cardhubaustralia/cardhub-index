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
  const fmtIn = (iso: string) => {
    const mins = Math.round((new Date(iso).getTime() - now) / 60000);
    if (mins < 0) return `${-mins} min ago`;
    const h = Math.floor(mins / 60);
    return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
  };

  // open window right now (orders accepted)
  const { data: openCycle } = await db
    .from("trade_cycles")
    .select("id, opens_at, locks_at, executes_at")
    .in("status", ["scheduled", "open"])
    .lte("opens_at", new Date().toISOString())
    .gt("locks_at", new Date().toISOString())
    .order("executes_at")
    .limit(1)
    .maybeSingle();
  if (openCycle) {
    console.log(`Trading OPEN: cycle #${openCycle.id} — locks in ${fmtIn(openCycle.locks_at)}, executes in ${fmtIn(openCycle.executes_at)}`);
  } else {
    console.log("Trading currently CLOSED (between windows or pre-open)");
  }

  // nearest future execution (earliest, not latest)
  const { data: nextExec } = await db
    .from("trade_cycles")
    .select("id, status, executes_at")
    .gt("executes_at", new Date().toISOString())
    .order("executes_at")
    .limit(1)
    .maybeSingle();
  if (nextExec) {
    console.log(`Next execution: cycle #${nextExec.id} in ${fmtIn(nextExec.executes_at)} (status ${nextExec.status})`);
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
  console.log("\n=== MARKET INDEX (needs migration 0005) ===");
  {
    const { count, error } = await db
      .from("market_index_snapshots")
      .select("category_id", { count: "exact", head: true });
    if (error) console.log(`⚠ ${error.message} — run migration 0005_market_index.sql`);
    else {
      console.log(`${count ?? 0} index snapshots recorded`);
      const { data: stats } = await db.from("v_market_stats").select("display_name, index_value, card_count");
      for (const s of stats ?? [])
        console.log(`  ${s.display_name}: $${Number(s.index_value ?? 0).toLocaleString()} (${s.card_count ?? 0} cards)`);
    }
  }

  console.log("\n=== REALIZED P&L (needs migration 0006) ===");
  {
    const { error } = await db.from("orders").select("realized_pnl").limit(1);
    console.log(error ? `⚠ ${error.message} — run migration 0006_realized_pnl.sql` : "orders.realized_pnl column present ✓");
  }

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
  console.log("If cycles aren't advancing on their own, check the 'Trade cycle tick'");
  console.log("workflow in the repo's GitHub Actions tab.");
}
main().catch((e) => { console.error(e); process.exit(1); });
