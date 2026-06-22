import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { usd } from "@/lib/format";
import CancelOrderButton from "@/components/CancelOrderButton";
import CountdownBar from "@/components/CountdownBar";
import { ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

interface Row {
  id: string; side: string; qty: number; est_price: number | null; league_id: string;
  assets: { variant: string; cards: { name: string; slug: string; games: { slug: string } } };
}

export default async function CheckoutPage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/checkout");

  const [{ data: orders }, { data: cycle }, { data: members }] = await Promise.all([
    supabase.from("orders")
      .select("id, side, qty, est_price, league_id, assets(variant, cards(name, slug, games(slug)))")
      .eq("user_id", user.id).eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.rpc("current_open_cycle").maybeSingle(),
    supabase.from("league_members").select("league_id, leagues(name)").eq("user_id", user.id),
  ]);

  const openCycle = cycle as { locks_at: string; executes_at: string } | null;
  const rows = (orders ?? []) as unknown as Row[];
  const leagueName = new Map(
    (members ?? []).map((m) => [m.league_id, (m.leagues as unknown as { name: string })?.name ?? "Game"])
  );

  // group by league
  const byLeague = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byLeague.has(r.league_id)) byLeague.set(r.league_id, []);
    byLeague.get(r.league_id)!.push(r);
  }
  const tradingOpen = !!cycle;

  return (
    <div className="space-y-6">
      {openCycle && (
        <CountdownBar locksAt={openCycle.locks_at} executesAt={openCycle.executes_at} />
      )}

      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <ShoppingCart size={22} /> Pending trades
        </h1>
        <Link href="/portfolio" className="btn-ghost text-sm">Portfolio →</Link>
      </div>

      {!rows.length ? (
        <p className="panel p-8 text-center font-bold text-slate-500">
          No pending trades. Orders you place show here until the cycle executes.
        </p>
      ) : (
        [...byLeague.entries()].map(([lid, list]) => {
          const buys = list.filter((o) => o.side === "buy")
            .reduce((s, o) => s + o.qty * Number(o.est_price ?? 0), 0);
          const sells = list.filter((o) => o.side === "sell")
            .reduce((s, o) => s + o.qty * Number(o.est_price ?? 0), 0);
          const net = sells - buys; // +ve = net cash in
          return (
            <section key={lid} className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h2 className="font-black">{leagueName.get(lid)}</h2>
                <span className={"text-sm font-extrabold " + (net >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  Net {net >= 0 ? "+" : ""}{usd(net)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((o) => (
                    <tr key={o.id} className="border-b border-slate-50 font-bold last:border-0">
                      <td className="px-5 py-3">
                        <Link href={`/card/${o.assets.cards.games.slug}/${o.assets.cards.slug}`} className="hover:underline">
                          {o.assets.cards.name}
                          <span className="text-slate-400"> · {o.assets.variant}</span>
                        </Link>
                      </td>
                      <td className={"px-3 py-3 " + (o.side === "buy" ? "text-emerald-600" : "text-rose-600")}>
                        {o.side.toUpperCase()} ×{o.qty}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500">
                        ~{usd(Number(o.est_price) * o.qty)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {tradingOpen && <CancelOrderButton orderId={o.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}

      {rows.length > 0 && (
        <p className="text-center text-sm font-bold text-slate-400">
          {tradingOpen
            ? "These execute at the next price update. You can cancel until the lockout."
            : "Trading is locked — these will execute at this cycle's new prices."}
        </p>
      )}
    </div>
  );
}
