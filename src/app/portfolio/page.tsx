import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { usd, pct, pctClass } from "@/lib/format";
import CancelOrderButton from "@/components/CancelOrderButton";
import PriceChart from "@/components/PriceChart";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portfolio");

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, cash, league_id, leagues(name, is_global, starting_cash)")
    .eq("user_id", user.id);
  if (!portfolios?.length) {
    return (
      <p className="panel p-8 text-center font-bold text-slate-500">
        No portfolio yet — sign out and back in, or join a league.
      </p>
    );
  }

  const { league } = await searchParams;
  const active =
    portfolios.find((p) => p.league_id === league) ??
    portfolios.find((p) => (p.leagues as unknown as { is_global: boolean })?.is_global) ??
    portfolios[0];
  const activeLeague = active.leagues as unknown as {
    name: string; is_global: boolean; starting_cash: number;
  };

  const [{ data: holdings }, { data: orders }, { data: history }] =
    await Promise.all([
      supabase
        .from("holdings")
        .select("qty, avg_cost, assets(id, variant, price, change_pct, cards(name, slug, image_url, games(slug)))")
        .eq("portfolio_id", active.id)
        .gt("qty", 0),
      supabase
        .from("orders")
        .select("id, side, qty, status, est_price, executed_price, executed_value, reject_reason, created_at, assets(variant, cards(name, slug, games(slug)))")
        .eq("portfolio_id", active.id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("portfolio_history")
        .select("value, captured_at")
        .eq("portfolio_id", active.id)
        .order("captured_at")
        .limit(500),
    ]);

  type H = {
    qty: number; avg_cost: number;
    assets: {
      id: number; variant: string; price: number | null; change_pct: number | null;
      cards: { name: string; slug: string; image_url: string | null; games: { slug: string } };
    };
  };
  const rows = (holdings ?? []) as unknown as H[];
  const holdingsValue = rows.reduce(
    (sum, h) => sum + h.qty * Number(h.assets?.price ?? 0), 0);
  const totalValue = Number(active.cash) + holdingsValue;
  const profit = totalValue - Number(activeLeague.starting_cash);
  const profitPct = (profit / Number(activeLeague.starting_cash)) * 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black">Portfolio</h1>
        {portfolios.length > 1 && (
          <div className="flex gap-2">
            {portfolios.map((p) => {
              const l = p.leagues as unknown as { name: string };
              return (
                <Link
                  key={p.id}
                  href={`/portfolio?league=${p.league_id}`}
                  className={
                    "rounded-2xl px-3 py-1.5 text-sm font-extrabold " +
                    (p.id === active.id
                      ? "bg-blue-500 text-white"
                      : "border-2 border-slate-200 bg-white text-slate-600")
                  }
                >
                  {l?.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Total value</p>
          <p className="text-xl font-black">{usd(totalValue)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Cash</p>
          <p className="text-xl font-black">{usd(Number(active.cash))}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Cards</p>
          <p className="text-xl font-black">{usd(holdingsValue)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Profit</p>
          <p className={`text-xl font-black ${pctClass(profit)}`}>
            {usd(profit)} <span className="text-sm">({pct(profitPct)})</span>
          </p>
        </div>
      </div>

      {(history?.length ?? 0) > 1 && (
        <section className="panel p-5">
          <h2 className="mb-3 font-black">Value over time</h2>
          <PriceChart
            data={(history ?? []).map((h) => ({
              t: h.captured_at as string,
              price: Number(h.value),
            }))}
            up={profit >= 0}
          />
        </section>
      )}

      <section className="panel overflow-hidden">
        <h2 className="px-5 pt-4 font-black">Holdings ({rows.length})</h2>
        {!rows.length ? (
          <p className="px-5 pb-6 pt-2 font-bold text-slate-400">
            Nothing yet — <Link className="text-blue-600 underline" href="/market">go buy some cards</Link>.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Card</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Avg cost</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-5 py-2 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const price = Number(h.assets?.price ?? 0);
                const value = h.qty * price;
                const cost = h.qty * Number(h.avg_cost);
                const pl = value - cost;
                return (
                  <tr key={h.assets.id} className="border-t border-slate-100 font-bold">
                    <td className="px-5 py-3">
                      <Link
                        href={`/card/${h.assets.cards.games.slug}/${h.assets.cards.slug}?v=${encodeURIComponent(h.assets.variant)}`}
                        className="hover:underline"
                      >
                        {h.assets.cards.name}
                        <span className="text-slate-400"> · {h.assets.variant}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right">{h.qty}</td>
                    <td className="px-3 py-3 text-right">{usd(Number(h.avg_cost))}</td>
                    <td className="px-3 py-3 text-right">{usd(price)}</td>
                    <td className="px-3 py-3 text-right font-black">{usd(value)}</td>
                    <td className={`px-5 py-3 text-right ${pctClass(pl)}`}>
                      {usd(pl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-black">Recent orders</h2>
          <Link
            href={`/portfolio/history?league=${active.league_id}`}
            className="text-sm font-extrabold text-blue-600 hover:underline"
          >
            Full history →
          </Link>
        </div>
        {!orders?.length ? (
          <p className="px-5 pb-6 pt-2 font-bold text-slate-400">No orders yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2">Card</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const a = o.assets as unknown as {
                  variant: string;
                  cards: { name: string; slug: string; games: { slug: string } };
                };
                return (
                  <tr key={o.id} className="border-t border-slate-100 font-bold">
                    <td className="px-5 py-3">
                      {a?.cards?.name}
                      <span className="text-slate-400"> · {a?.variant}</span>
                    </td>
                    <td className={"px-3 py-3 " + (o.side === "buy" ? "text-emerald-600" : "text-rose-600")}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-right">{o.qty}</td>
                    <td className="px-3 py-3 text-right">
                      {usd(Number(o.executed_price ?? o.est_price))}
                      {o.status === "pending" && <span className="text-slate-400"> est.</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          "chip " +
                          (o.status === "filled"
                            ? "bg-emerald-100 text-emerald-700"
                            : o.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : o.status === "rejected"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-500")
                        }
                        title={o.reject_reason ?? undefined}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {o.status === "pending" && <CancelOrderButton orderId={o.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
