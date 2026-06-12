"use client";
// Buy/sell panel on the card page. Orders queue for the next execution.
import { useState, useTransition } from "react";
import { placeOrder } from "@/lib/actions";
import { usd } from "@/lib/format";

interface League {
  id: string;
  name: string;
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
  leagues: League[];
  signedIn: boolean;
  tradingOpen: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

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

  const submit = (side: "buy" | "sell") => {
    setMsg(null);
    startTransition(async () => {
      const res = await placeOrder(leagueId, assetId, side, qty);
      setMsg({ ok: res.ok, text: res.message });
    });
  };

  return (
    <div className="panel space-y-4 p-5">
      <h3 className="text-lg font-black">Place an order</h3>
      {!tradingOpen && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
          Orders are locked right now — the panel reopens after this cycle executes.
        </p>
      )}
      {leagues.length > 1 && (
        <select
          className="field"
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
        >
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost h-11 w-11 text-xl"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
        >
          −
        </button>
        <input
          type="number"
          min={1}
          max={10000}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
          className="field text-center text-lg font-black"
        />
        <button
          type="button"
          className="btn-ghost h-11 w-11 text-xl"
          onClick={() => setQty((q) => Math.min(10000, q + 1))}
        >
          +
        </button>
      </div>
      <p className="text-center text-sm font-bold text-slate-500">
        Est. total {usd(price * qty)} · executes at the <em>next</em> price
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          className="btn-buy"
          disabled={pending || !tradingOpen || !leagueId}
          onClick={() => submit("buy")}
        >
          Buy
        </button>
        <button
          className="btn-sell"
          disabled={pending || !tradingOpen || !leagueId}
          onClick={() => submit("sell")}
        >
          Sell
        </button>
      </div>
      {msg && (
        <p
          className={
            "rounded-2xl px-4 py-2 text-sm font-bold " +
            (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
