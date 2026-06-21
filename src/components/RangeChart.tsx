"use client";
// Card price chart with 7D / 30D / 90D toggle + stat tiles, matching
// the tcgindex.io card layout. Recharts area chart, button aesthetic
// consistent with the rest of the app.
import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { usd, pct, pctClass } from "@/lib/format";

export interface PricePoint { t: string; price: number }
type Range = "7D" | "30D" | "90D";
const DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "90D": 90 };

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export default function RangeChart({ data }: { data: PricePoint[] }) {
  const [range, setRange] = useState<Range>("30D");

  const points = useMemo(() => {
    const cutoff = Date.now() - DAYS[range] * 86400_000;
    return data
      .filter((d) => new Date(d.t).getTime() >= cutoff)
      .map((d) => ({
        ...d,
        label: new Date(d.t).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      }));
  }, [data, range]);

  const stats = useMemo(() => {
    const series = points.length ? points : data.map((d) => ({ ...d, label: "" }));
    if (series.length < 2) return null;
    const prices = series.map((p) => p.price);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    // volatility: stdev of period-over-period returns
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++)
      if (prices[i - 1] > 0) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const vol = stdev(rets) * 100;
    const volLabel = vol < 3 ? "low" : vol < 8 ? "medium" : "high";
    const trend = change > 1 ? "up" : change < -1 ? "down" : "flat";
    return { change, lo, hi, volLabel, trend };
  }, [points, data]);

  const up = (stats?.change ?? 0) >= 0;
  const stroke = up ? "#10b981" : "#f43f5e";
  const fill = up ? "#d1fae5" : "#ffe4e6";

  const trendWord =
    stats?.trend === "up" ? "uptrend" : stats?.trend === "down" ? "downtrend" : "sideways";
  const mag = Math.abs(stats?.change ?? 0);
  const intensity = mag > 20 ? "strong" : mag > 8 ? "moderate" : "mild";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-black">Price history</h2>
        <div className="flex gap-1">
          {(Object.keys(DAYS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                "rounded-xl px-3 py-1.5 text-xs font-extrabold transition " +
                (range === r
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <p className={`text-sm font-extrabold ${pctClass(stats.change)}`}>
          {pct(stats.change)} in {range} — {intensity} {trendWord}
        </p>
      )}

      <div className="h-64 w-full">
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
                tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
                tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "Price"]}
                labelStyle={{ fontWeight: 800 }}
                contentStyle={{ borderRadius: 16, border: "2px solid #e2e8f0", fontWeight: 700 }} />
              <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={3} fill={fill} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center font-bold text-slate-400">
            Not enough history yet for this range — it fills in as cycles run.
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={`${range} change`} value={pct(stats.change)} cls={pctClass(stats.change)} />
          <Tile label="Volatility" value={stats.volLabel} />
          <Tile
            label="Trend"
            value={stats.trend === "up" ? "▲ up" : stats.trend === "down" ? "▼ down" : "→ flat"}
            cls={stats.trend === "up" ? "text-emerald-600" : stats.trend === "down" ? "text-rose-600" : ""}
          />
          <Tile label={`${range} range`} value={`${usd(stats.lo)} – ${usd(stats.hi)}`} />
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-base font-black ${cls}`}>{value}</p>
    </div>
  );
}
