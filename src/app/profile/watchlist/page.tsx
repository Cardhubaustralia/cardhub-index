import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import MarketCard from "@/components/MarketCard";
import { MarketRow } from "@/components/CardTile";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile/watchlist");

  const { data: watch } = await supabase
    .from("watchlist").select("asset_id").eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const ids = (watch ?? []).map((w) => w.asset_id);

  const { data: rows } = ids.length
    ? await supabase.from("v_market").select("*").in("asset_id", ids)
    : { data: [] };

  // preserve watch order
  const byId = new Map((rows ?? []).map((r) => [r.asset_id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MarketRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Watchlist</h1>
        <Link href="/profile" className="btn-ghost text-sm">← Profile</Link>
      </div>
      {!ordered.length ? (
        <p className="panel p-8 text-center font-bold text-slate-400">
          You&apos;re not watching any cards yet. Hit <span className="text-amber-600">Watch</span> on any card to track it here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {ordered.map((r) => <MarketCard key={r.asset_id} row={r} />)}
        </div>
      )}
    </div>
  );
}
