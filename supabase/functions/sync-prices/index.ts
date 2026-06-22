// CardHub Index — chunked price sync as a Supabase Edge Function (Deno).
// pg_cron pings this every minute. Each invocation prices the next slice of
// products (cursor-based) until the active cycle is fully synced, then runs
// the post-sync steps. Stays well under the Edge Function wall-time limit.
//
// Deploy:  supabase functions deploy sync-prices --no-verify-jwt
// Secrets: supabase secrets set TCGAPIS_API_KEY=... CRON_SECRET=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHUNK = 2500;          // products per invocation (~2 min of calls)
const CONCURRENCY = 8;
const RATE_MS = 40;          // ~1500 req/min, under the 2000 cap
const LOCK_MIN = 3;          // a chunk lock is considered stale after this

const BASE = "https://api.tcgapis.com";
const KEY = Deno.env.get("TCGAPIS_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

let nextSlot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function rateSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + RATE_MS;
  if (wait) await sleep(wait);
}

async function fetchProductPrices(pid: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await rateSlot();
    try {
      const res = await fetch(`${BASE}/api/v2/prices/${pid}`, { headers: { "x-api-key": KEY } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (_e) {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  // 1. find or start an active run
  let { data: run } = await db.from("sync_runs").select("*").eq("status", "running")
    .order("id", { ascending: false }).limit(1).maybeSingle();

  if (!run) {
    // start one only if a cycle is in its lockout window and unsynced
    const nowIso = new Date().toISOString();
    const { data: cyc } = await db.from("trade_cycles").select("id")
      .in("status", ["open", "locked"]).lte("locks_at", nowIso).gt("executes_at", nowIso)
      .is("prices_synced_at", null).order("executes_at").limit(1).maybeSingle();
    if (!cyc) return Response.json({ idle: true });
    const { data: created } = await db.from("sync_runs")
      .insert({ cycle_id: cyc.id, cursor_pid: 0, done_count: 0, status: "running" })
      .select("*").single();
    run = created;
  }

  // 2. claim the chunk lock (skip if another invocation holds it)
  const staleBefore = new Date(Date.now() - LOCK_MIN * 60_000).toISOString();
  const { data: claimed } = await db.from("sync_runs")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", run.id).eq("status", "running")
    .or(`locked_at.is.null,locked_at.lt.${staleBefore}`)
    .select("id");
  if (!claimed?.length) return Response.json({ busy: true, run: run.id });

  // 3. next slice of products (by product_id cursor)
  const { data: cards } = await db.from("cards").select("product_id")
    .in("category_id", [3, 68]).gt("product_id", run.cursor_pid)
    .order("product_id").limit(CHUNK);
  const pids = (cards ?? []).map((c: { product_id: number }) => Number(c.product_id));

  if (!pids.length) {
    // done — finalize
    await db.rpc("refresh_long_changes");
    await db.rpc("snapshot_market_index", { p_cycle_id: run.cycle_id });
    await db.from("trade_cycles").update({ prices_synced_at: new Date().toISOString() })
      .eq("id", run.cycle_id);
    await db.from("sync_runs").update({ status: "done", locked_at: null }).eq("id", run.id);
    return Response.json({ done: true, run: run.id, total: run.done_count });
  }

  // 4. fetch + upsert this slice
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  const buckets: number[][] = Array.from({ length: CONCURRENCY }, () => []);
  pids.forEach((p, i) => buckets[i % CONCURRENCY].push(p));
  await Promise.all(buckets.map(async (list) => {
    for (const pid of list) {
      const pr = await fetchProductPrices(pid);
      const prices = pr?.data?.prices;
      if (!prices) continue;
      for (const [variant, p] of Object.entries(prices)) {
        const tcg = (p as { marketPrice?: number; midPrice?: number }).marketPrice
          ?? (p as { midPrice?: number }).midPrice ?? null;
        if (!tcg || tcg <= 0) continue;
        rows.push({
          product_id: pid, variant,
          price: Math.round(tcg * 100) / 100,
          tcgplayer_price: tcg, cardmarket_eur: null,
          price_source: "tcgplayer", price_updated_at: now,
        });
      }
    }
  }));

  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.rpc("upsert_asset_prices", {
      p_rows: rows.slice(i, i + 1000), p_cycle_id: run.cycle_id,
    });
    if (error) console.error("upsert", error.message);
  }

  await db.from("sync_runs").update({
    cursor_pid: pids[pids.length - 1],
    done_count: run.done_count + rows.length,
    locked_at: null,
  }).eq("id", run.id);

  return Response.json({ run: run.id, processed: pids.length, upserted: rows.length });
});
