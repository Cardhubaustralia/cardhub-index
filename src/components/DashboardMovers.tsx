import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import CardTile, { MarketRow } from "@/components/CardTile";
import HeroMovers, { HeroRow } from "@/components/HeroMovers";
import { Flame, TrendingDown, ShoppingCart } from "lucide-react";

export default async function DashboardMovers() {
  const supabase = await serverClient();
  const [{ data: hero }, { data: gainers }, { data: losers }, { data: mostTraded }] =
    await Promise.all([
      supabase.from("v_movers").select("*").order("change_7d_pct", { ascending: false, nullsFirst: false }).limit(4),
      supabase.from("v_movers").select("*").order("change_7d_pct", { ascending: false, nullsFirst: false }).limit(6),
      supabase.from("v_movers").select("*").order("change_7d_pct", { ascending: true, nullsFirst: false }).limit(6),
      supabase.rpc("most_traded").order("total_qty", { ascending: false }).limit(6),
    ]);

  return (
    <>
      {!!hero?.length && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Flame className="text-amber-500" size={20} /> Hot this week
            </h2>
            <Link href="/market?sort=gain" className="text-sm font-extrabold text-blue-600 hover:underline">
              See all movers →
            </Link>
          </div>
          <HeroMovers rows={hero as HeroRow[]} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Flame className="text-amber-500" size={20} /> Biggest gainers (7d)
          </h2>
          {(gainers as MarketRow[] | null)?.map((r) => <CardTile key={r.asset_id} row={r} />)}
        </section>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <TrendingDown className="text-rose-500" size={20} /> Biggest fallers (7d)
          </h2>
          {(losers as MarketRow[] | null)?.map((r) => <CardTile key={r.asset_id} row={r} />)}
        </section>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <ShoppingCart className="text-blue-500" size={20} /> Most traded
          </h2>
          {(mostTraded ?? []).map((r: {
            asset_id: number; name: string; image_url: string | null; slug: string;
            number: string | null; variant: string; price: number | null;
            change_pct: number | null; set_name: string; game_slug: string;
          }) => <CardTile key={r.asset_id} row={{ ...r, rarity: null }} />)}
          {!mostTraded?.length && (
            <p className="panel p-4 text-sm font-bold text-slate-400">No trades yet this week — be the first.</p>
          )}
        </section>
      </div>
    </>
  );
}
