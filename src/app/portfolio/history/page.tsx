import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { usd, pctClass } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; filter?: string; page?: string }>;
}) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portfolio/history");

  const { league, filter = "all", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, league_id, leagues(name, is_global)")
    .eq("user_id", user.id);
  if (!portfolios?.length) redirect("/portfolio");

  const active =
    portfolios.find((p) => p.league_id === league) ??
    portfolios.find((p) => (p.leagues as unknown as { is_global: boolean })?.is_global) ??
    portfolios[0];

  let query = supabase
    .from("orders")
    .select(
      "id, side, qty, status, est_price, executed_price, executed_value, realized_pnl, reject_reason, created_at, executed_at, assets(variant, cards(name, slug, games(slug)))",
      { count: "exact" }
    )
    .eq("portfolio_id", active.id)
    .order("created_at", { ascending: false })
    .range((pageNum - 1) * PAGE, pageNum * PAGE - 1);

  if (filter === "filled") query = query.eq("status", "filled");
  else if (filter === "buy") query = query.eq("side", "buy").eq("status", "filled");
  else if (filter === "sell") query = query.eq("side", "sell").eq("status", "filled");
  else if (filter === "pending") query = query.eq("status", "pending");

  const { data: orders, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  // realized P&L total across all filled sells (separate aggregate query)
  const { data: pnlRows } = await supabase
    .from("orders")
    .select("realized_pnl")
    .eq("portfolio_id", active.id)
    .eq("status", "filled")
    .not("realized_pnl", "is", null);
  const realized = (pnlRows ?? []).reduce(
    (s, r) => s + Number(r.realized_pnl ?? 0), 0);

  const filterTab = (key: string, label: string) => (
    <Link
      key={key}
      href={`/portfolio/history?league=${active.league_id}&filter=${key}`}
      className={
        "rounded-2xl px-3 py-1.5 text-sm font-extrabold " +
        (filter === key
          ? "bg-blue-500 text-white"
          : "border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-300")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Account history</h1>
          <p className="text-sm font-bold text-slate-400">
            Every order and transaction on this portfolio.
          </p>
        </div>
        <Link href="/portfolio" className="btn-ghost text-sm">← Back to portfolio</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Realized P&amp;L</p>
          <p className={`text-xl font-black ${pctClass(realized)}`}>{usd(realized)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Total orders</p>
          <p className="text-xl font-black">{count ?? 0}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">League</p>
          <p className="truncate text-xl font-black">
            {(active.leagues as unknown as { name: string })?.name}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterTab("all", "All")}
        {filterTab("filled", "Filled")}
        {filterTab("buy", "Buys")}
        {filterTab("sell", "Sells")}
        {filterTab("pending", "Pending")}
      </div>

      <section className="panel overflow-x-auto">
        {!orders?.length ? (
          <p className="p-8 text-center font-bold text-slate-400">No transactions here yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Date</th>
                <th className="px-3 py-3">Card</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-right">Realized P&amp;L</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const a = o.assets as unknown as {
                  variant: string;
                  cards: { name: string; slug: string; games: { slug: string } };
                };
                const when = o.executed_at ?? o.created_at;
                return (
                  <tr key={o.id} className="border-t border-slate-100 font-bold">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                      {new Date(when).toLocaleDateString("en-AU", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3">
                      {a?.cards ? (
                        <Link
                          href={`/card/${a.cards.games.slug}/${a.cards.slug}?v=${encodeURIComponent(a.variant)}`}
                          className="hover:underline"
                        >
                          {a.cards.name}
                          <span className="text-slate-400"> · {a.variant}</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td className={"px-3 py-3 " + (o.side === "buy" ? "text-emerald-600" : "text-rose-600")}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-right">{o.qty}</td>
                    <td className="px-3 py-3 text-right">
                      {usd(Number(o.executed_price ?? o.est_price))}
                      {o.status === "pending" && <span className="text-slate-400"> est.</span>}
                    </td>
                    <td className="px-3 py-3 text-right">{usd(Number(o.executed_value ?? 0)) }</td>
                    <td className={`px-3 py-3 text-right ${pctClass(o.realized_pnl)}`}>
                      {o.realized_pnl == null ? "—" : usd(Number(o.realized_pnl))}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          "chip " +
                          (o.status === "filled" ? "bg-emerald-100 text-emerald-700"
                            : o.status === "pending" ? "bg-amber-100 text-amber-700"
                            : o.status === "rejected" ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-500")
                        }
                        title={o.reject_reason ?? undefined}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 font-bold">
          {pageNum > 1 && (
            <Link className="btn-ghost"
              href={`/portfolio/history?league=${active.league_id}&filter=${filter}&page=${pageNum - 1}`}>
              ← Prev
            </Link>
          )}
          <span className="text-sm text-slate-500">Page {pageNum} of {totalPages}</span>
          {pageNum < totalPages && (
            <Link className="btn-ghost"
              href={`/portfolio/history?league=${active.league_id}&filter=${filter}&page=${pageNum + 1}`}>
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
