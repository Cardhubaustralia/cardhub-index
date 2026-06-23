export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(Number(n));

export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

// Treat implausible swings (>1000%) as unknown — they're backfill-baseline
// artifacts that self-heal once a full window of live data has accrued.
export const sanePct = (n: number | null | undefined) =>
  n == null || Math.abs(Number(n)) > 1000 ? null : n;

export const pctClass = (n: number | null | undefined) =>
  n == null ? "text-slate-400" : n >= 0 ? "text-emerald-600" : "text-rose-600";
