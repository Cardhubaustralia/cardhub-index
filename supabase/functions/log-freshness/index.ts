// CardHub Index — temporary API-freshness logger (Supabase Edge Function).
// pg_cron pings this hourly. Samples ~12 products' API last_updated into
// api_freshness_log. Self-stops 3 days after the first sample by calling
// stop_freshness_log(), which unschedules the cron job.
//
// Deploy:  supabase functions deploy log-freshness --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://api.tcgapis.com";
const KEY = Deno.env.get("TCGAPIS_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const MAX_DAYS = 3;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  // stop after the 3-day window, and unschedule the cron job
  const { data: first } = await db.from("api_freshness_log")
    .select("sampled_at").order("sampled_at").limit(1).maybeSingle();
  if (first) {
    const days = (Date.now() - new Date(first.sampled_at).getTime()) / 86400_000;
    if (days >= MAX_DAYS) {
      await db.rpc("stop_freshness_log");
      return Response.json({ stopped: true, days });
    }
  }

  const { data: products } = await db.from("assets")
    .select("product_id").not("price", "is", null)
    .order("price", { ascending: false }).limit(12);

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
    } catch (_e) { /* skip blips */ }
  }
  if (rows.length) await db.from("api_freshness_log").insert(rows);
  return Response.json({ logged: rows.length, latest_age_h: rows[0]?.age_hours ?? null });
});
