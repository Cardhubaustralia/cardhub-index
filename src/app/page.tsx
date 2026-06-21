import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import CardTile, { MarketRow } from "@/components/CardTile";
import MarketOverview from "@/components/MarketOverview";
import { Flame, TrendingDown, ShoppingCart, ArrowRight } from "lucide-react";

export const revalidate = 120;

export default async function Dashboard() {
  const supabase = await serverClient();

  const [{ data: gainers }, { data: losers }, { data: mostTraded }] =
    await Promise.all([
      supabase
        .from("v_movers")
        .select("*")
        .order("change_pct", { ascending: false })
        .limit(6),
      supabase
        .from("v_movers")
        .select("*")
        .order("change_pct", { ascending: true })
        .limit(6),
      supabase
        .from("v_most_traded")
        .select("*")
        .order("total_qty", { ascending: false })
        .limit(6),
    ]);

  const empty = !gainers?.length && !losers?.length;

  return (
    <div className="space-y-10">
      <section className="panel flex flex-col items-start gap-3 p-8">
        <span className="chip bg-yellow-100 text-yellow-800">Pre-Season Sandbox</span>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">
          Trade Pokémon &amp; One Piece cards.
          <br />
          <span className="text-blue-500">Fake money. Real prices.</span>
        </h1>
        <p className="max-w-xl font-semibold text-slate-500">
          Everyone starts with $10,000. Prices update three times a day from real
          market data — lock in your trades before the window closes and climb the
          leaderboard.
        </p>
        <div className="flex gap-3 pt-1">
          <Link href="/market" className="btn-primary">
            Browse the market <ArrowRight size={16} />
          </Link>
          <Link href="/leagues" className="btn-ghost">Join a league</Link>
        </div>
      </section>

      {empty ? (
        <section className="panel p-8 text-center font-bold text-slate-500">
          Market data hasn&apos;t been synced yet. Run the catalog + price sync to
          bring the exchange to life.
        </section>
      ) : (
        <>
        <MarketOverview />
        <div className="grid gap-8 lg:grid-cols-3">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Flame className="text-amber-500" size={20} /> Biggest gainers
            </h2>
            {(gainers as MarketRow[] | null)?.map((r) => (
              <CardTile key={`${r.asset_id}`} row={r} />
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <TrendingDown className="text-rose-500" size={20} /> Biggest fallers
            </h2>
            {(losers as MarketRow[] | null)?.map((r) => (
              <CardTile key={`${r.asset_id}`} row={r} />
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <ShoppingCart className="text-blue-500" size={20} /> Most traded
            </h2>
            {(mostTraded ?? []).map(
              (r: {
                asset_id: number; name: string; image_url: string | null;
                slug: string; number: string | null; variant: string;
                price: number | null; change_pct: number | null;
                set_name: string; game_slug: string; total_qty: number;
              }) => (
                <CardTile
                  key={r.asset_id}
                  row={{ ...r, rarity: null }}
                />
              )
            )}
            {!mostTraded?.length && (
              <p className="panel p-4 text-sm font-bold text-slate-400">
                No trades yet this week — be the first.
              </p>
            )}
          </section>
        </div>
        </>
      )}
    </div>
  );
}
