"use client";
// Buy/sell panel: per-league cash + holding, live estimate, cap/cash
// guards, a confirm step, and your pending orders with cancel.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrder, cancelOrder } from "@/lib/actions";
import { usd } from "@/lib/format";

export interface LeagueCtx {
  id: string;
  name: string;
  cash: number;
  maxPct: number;
  value: number;          // portfolio value at current prices
  holdingQty: number;
  holdingAvg: number;
  eligible: boolean;      // is this card in the game's pool & game active
  pending: { id: string; side: string; qty: number; est_price: number | null }[];
}

export default function TradePanel({
  assetId,
  price,
  leagues,
  signedIn,
  tradingOpen,
}: {
  assetId: number;
  price: number | null;
  leagues: LeagueCtx[];
  signedIn: boolean;
  tradingOpen: boolean;
}) {
  const playable = leagues.filter((l) => l.eligible);
  const [qty, setQty] = useState(1);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [leagueId, setLeagueId] = useState(playable[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!signedIn) {
    return (
      <div className="panel p-5 text-center">
        <p className="font-bold text-slate-600">
          <a href="/login" className="text-blue-600 underline">Sign in</a> to trade this card
        </p>
      </div>
    );
  }
  if (price == null) {
    return (
      <div className="panel p-5 text-center font-bold text-slate-500">
        No market price yet — not tradeable this cycle
      </div>
    );
  }
  if (!playable.length) {
    return (
      <div className="panel p-5 text-center font-bold text-slate-500">
        This card isn&apos;t in the pool of any game you&apos;re in.{" "}
        <a href="/leagues" className="text-blue-600 underline">Join or create a game</a> that includes it.
      </div>
    );
  }

  const lg = playable.find((l) => l.id === leagueId) ?? playable[0];
  const est = price * qty;
  const cap = lg ? lg.value * (lg.maxPct / 100) : 0;
  const heldValueAfter = lg ? (lg.holdingQty + qty) * price : 0;

  // guards (advisory; server re-checks at execution)
  const maxBuy = lg ? Math.floor(lg.cash / price) : 0;
  const maxSell = lg?.holdingQty ?? 0;
  let warn: string | null = null;
  if (side === "buy") {
    if (est > (lg?.cash ?? 0)) warn = "Costs more than your available cash";
    else if (heldValueAfter > cap) warn = `Would exceed the ${lg?.maxPct}% per-card limit`;
  } else {
    if (qty > maxSell) warn = "You don't hold that many copies";
  }

  const setMax = () => setQty(Math.max(1, side === "buy" ? maxBuy : maxSell));

  const submit = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await placeOrder(leagueId, assetId, side, qty);
      setMsg({ ok: res.ok, text: res.message });
      setConfirming(false);
      if (res.ok) router.refresh();
    });
  };

  const doCancel = (id: string) =>
    startTransition(async () => {
      await cancelOrder(id);
      router.refresh();
    });

  return (
    <div className="panel space-y-4 p-5">
      <h3 className="text-lg font-black">Trade</h3>

      {playable.length > 1 && (
        <select className="field" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
          {playable.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}

      {/* position summary */}
      {lg && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-slate-400">Cash</p>
            <p className="font-black">{usd(lg.cash)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-xs font-bold uppercase text-slate-400">You hold</p>
            <p className="font-black">
              {lg.holdingQty}{" "}
              {lg.holdingQty > 0 && <span className="text-xs font-bold text-slate-400">@ {usd(lg.holdingAvg)}</span>}
            </p>
          </div>
        </div>
      )}

      {/* buy/sell toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setSide("buy"); setConfirming(false); }}
          className={"rounded-2xl py-2 font-extrabold " +
            (side === "buy" ? "bg-emerald-500 text-white shadow-[0_3px_0_0_#047857]" : "bg-slate-100 text-slate-500")}
        >
          Buy
        </button>
        <button
          onClick={() => { setSide("sell"); setConfirming(false); }}
          className={"rounded-2xl py-2 font-extrabold " +
            (side === "sell" ? "bg-rose-500 text-white shadow-[0_3px_0_0_#be123c]" : "bg-slate-100 text-slate-500")}
        >
          Sell
        </button>
      </div>

      {!tradingOpen && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
          Orders are locked right now — reopens after this cycle executes.
        </p>
      )}

      {/* qty */}
      <div className="flex items-center gap-2">
        <button className="btn-ghost h-11 w-11 text-xl" onClick={() => { setQty((n) => Math.max(1, n - 1)); setConfirming(false); }}>−</button>
        <input
          type="number" min={1} max={10000} value={qty}
          onChange={(e) => { setQty(Math.max(1, Math.min(10000, Number(e.target.value) || 1))); setConfirming(false); }}
          className="field text-center text-lg font-black"
        />
        <button className="btn-ghost h-11 w-11 text-xl" onClick={() => { setQty((n) => Math.min(10000, n + 1)); setConfirming(false); }}>+</button>
        <button onClick={() => { setMax(); setConfirming(false); }} className="btn-ghost px-3 py-2 text-sm">Max</button>
      </div>

      {/* estimate */}
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold">
        <div className="flex justify-between">
          <span className="text-slate-500">{side === "buy" ? "Est. cost" : "Est. proceeds"}</span>
          <span className="font-black">{usd(est)}</span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>Executes at the next price</span>
          <span>{side === "buy" ? `Cash after ≈ ${usd((lg?.cash ?? 0) - est)}` : `Cash after ≈ ${usd((lg?.cash ?? 0) + est)}`}</span>
        </div>
      </div>

      {warn && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">{warn}</p>
      )}

      {/* action / confirm */}
      {!confirming ? (
        <button
          className={side === "buy" ? "btn-buy w-full" : "btn-sell w-full"}
          disabled={pending || !tradingOpen || !leagueId || !!warn}
          onClick={() => setConfirming(true)}
        >
          {side === "buy" ? "Buy" : "Sell"} {qty} {qty === 1 ? "copy" : "copies"}
        </button>
      ) : (
        <div className="space-y-2 rounded-2xl border-2 border-slate-200 p-3">
          <p className="text-center text-sm font-bold text-slate-600">
            {side === "buy" ? "Buy" : "Sell"} {qty} at the next price (~{usd(price)} each)?
            <br /><span className="text-xs text-slate-400">Filled when the cycle executes — the final price may differ.</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            <button className={side === "buy" ? "btn-buy" : "btn-sell"} disabled={pending} onClick={submit}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={"rounded-2xl px-4 py-2 text-sm font-bold " +
          (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {msg.text}
        </p>
      )}

      {/* your pending orders this cycle */}
      {lg && lg.pending.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold uppercase text-slate-400">Your locked-in orders</p>
          {lg.pending.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm font-bold">
              <span className={o.side === "buy" ? "text-emerald-600" : "text-rose-600"}>
                {o.side.toUpperCase()} ×{o.qty}
              </span>
              <span className="text-slate-400">~{usd(Number(o.est_price))}</span>
              {tradingOpen && (
                <button onClick={() => doCancel(o.id)} disabled={pending}
                  className="text-xs font-extrabold text-rose-600 hover:underline">
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
