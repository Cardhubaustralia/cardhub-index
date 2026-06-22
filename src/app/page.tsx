import Link from "next/link";
import { Suspense } from "react";
import { serverClient } from "@/lib/supabase/server";
import MarketOverview from "@/components/MarketOverview";
import DashboardMovers from "@/components/DashboardMovers";
import { SkeletonStatRow, SkeletonHeroMovers, SkeletonList } from "@/components/Skeletons";
import { ArrowRight } from "lucide-react";

export const revalidate = 120;

export default async function Dashboard() {
  const supabase = await serverClient();
  const { count: pricedCount } = await supabase
    .from("assets").select("id", { count: "exact", head: true }).not("price", "is", null);
  const empty = !pricedCount;

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
          <Link href="/leagues" className="btn-ghost">Join a game</Link>
        </div>
      </section>

      {empty ? (
        <section className="panel p-8 text-center font-bold text-slate-500">
          Market data hasn&apos;t been synced yet. Run the catalog + price sync to
          bring the exchange to life.
        </section>
      ) : (
        <>
          <Suspense fallback={<div className="space-y-4"><SkeletonStatRow /><SkeletonStatRow n={2} /></div>}>
            <MarketOverview />
          </Suspense>
          <Suspense
            fallback={
              <div className="space-y-8">
                <SkeletonHeroMovers />
                <div className="grid gap-8 lg:grid-cols-3">
                  <SkeletonList /><SkeletonList /><SkeletonList />
                </div>
              </div>
            }
          >
            <DashboardMovers />
          </Suspense>
        </>
      )}
    </div>
  );
}
