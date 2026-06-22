// Cron entry point: advance the cycle state machine.
// Call every minute:  GET /api/cron/tick  with  Authorization: Bearer $CRON_SECRET
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { tick } from "@/lib/cycles";

export const maxDuration = 300; // price sync can take a while
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const logs: string[] = [];
  try {
    // light tick: state transitions + execution only (no heavy price sync),
    // so this endpoint stays fast and safe to call every minute.
    const result = await tick(adminClient(), { sync: false }, (m) => logs.push(m));
    return NextResponse.json({ ok: true, result, logs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e), logs },
      { status: 500 }
    );
  }
}
