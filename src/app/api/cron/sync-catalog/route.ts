// Daily catalog refresh (new sets/cards).
// GET /api/cron/sync-catalog  with  Authorization: Bearer $CRON_SECRET
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncCatalog } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const logs: string[] = [];
  try {
    await syncCatalog(adminClient(), (m) => logs.push(m));
    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), logs }, { status: 500 });
  }
}
