"use client";
// Other players' locked-in orders for this card, this cycle.
// Hidden (blurred placeholders) during the open window; revealed at lockout.
import { useEffect, useState } from "react";
import { Lock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";

interface FlowRow {
  order_id: string; side: string | null; qty: number | null;
  username: string | null; created_at: string; revealed: boolean;
}

export default function OrderFlow({ assetId }: { assetId: number }) {
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const supabase = browserClient();
      const { data } = await supabase.rpc("order_flow_for_asset", { p_asset_id: assetId });
      if (alive) { setRows((data ?? []) as FlowRow[]); setLoaded(true); }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [assetId]);

  if (!loaded) return null;
  if (!rows.length) {
    return (
      <section className="panel p-5">
        <h2 className="mb-1 font-black">Order flow</h2>
        <p className="text-sm font-bold text-slate-400">
          No orders locked in for this card this cycle yet.
        </p>
      </section>
    );
  }

  const revealed = rows[0]?.revealed;

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black">Order flow</h2>
        <span className="chip bg-slate-100 text-slate-500">{rows.length} this cycle</span>
      </div>

      {!revealed && (
        <p className="mb-3 flex items-center gap-1.5 rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
          <Lock size={14} /> Hidden until the lockout window — no peeking at the crowd before you trade.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.order_id}
            className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-2.5 font-bold"
          >
            {r.revealed ? (
              <>
                <span className="flex items-center gap-2">
                  {r.side === "buy" ? (
                    <ArrowUpRight size={16} className="text-emerald-600" />
                  ) : (
                    <ArrowDownRight size={16} className="text-rose-600" />
                  )}
                  <span className={r.side === "buy" ? "text-emerald-600" : "text-rose-600"}>
                    {r.side?.toUpperCase()}
                  </span>
                  <span className="text-slate-500">×{r.qty}</span>
                </span>
                <span className="text-sm text-slate-400">@{r.username}</span>
              </>
            ) : (
              <>
                <span className="select-none items-center gap-2 blur-sm">
                  ●●● ×●●
                </span>
                <span className="select-none text-sm text-slate-300 blur-sm">@●●●●●●</span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
