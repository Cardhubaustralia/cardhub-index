import { Suspense } from "react";
import { serverClient } from "@/lib/supabase/server";
import MarketFilters, { SetOpt, RarityOpt, GameOpt } from "@/components/MarketFilters";
import MarketGrid from "@/components/MarketGrid";
import { SkeletonCardGrid } from "@/components/Skeletons";
import type { Universe } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const game = sp.game === "one-piece" ? "one-piece" : "pokemon";
  const q = sp.q ?? "";
  const sort = sp.sort ?? "popular";
  const type = sp.type === "sealed" ? "sealed" : "singles";
  const setSlug = sp.set ?? "";
  const rarity = sp.rarity ?? "";
  const band = sp.band ?? "";
  const showAll = sp.all === "1";
  const league = sp.league ?? "";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const supabase = await serverClient();

  // Games (leagues) the signed-in user belongs to — for the "tradeable in"
  // filter. Each game's `universe` defines its pool; an empty {} = all cards.
  const { data: { user } } = await supabase.auth.getUser();
  let myGames: GameOpt[] = [];
  let universe: Universe | null = null;
  if (user) {
    const { data: mem } = await supabase
      .from("league_members")
      .select("leagues:league_id ( id, name, is_global, universe )")
      .eq("user_id", user.id);
    myGames = (mem ?? [])
      .map((r) => (r as unknown as { leagues: GameOpt }).leagues)
      .filter(Boolean)
      // only games with a restricted pool are worth filtering by
      .filter((g) => g.is_global || (g.universe && Object.keys(g.universe).length > 0));
    if (league)
      universe = (myGames.find((g) => g.id === league)?.universe as Universe) ?? null;
  }

  // filter options (fast, needed for the bar to render immediately)
  const [{ data: setData }, { data: rarityData }] = await Promise.all([
    supabase.from("v_sets").select("slug, name, single_count, sealed_count")
      .eq("game_slug", game).order("published_on", { ascending: false, nullsFirst: false }),
    supabase.from("v_rarities").select("rarity, n").eq("game_slug", game).order("n", { ascending: false }),
  ]);
  const sets: SetOpt[] = (setData ?? [])
    .map((s: { slug: string; name: string; single_count: number; sealed_count: number }) => ({
      slug: s.slug, name: s.name, count: type === "sealed" ? s.sealed_count : s.single_count,
    }))
    .filter((s) => s.count > 0);
  const rarities = (rarityData ?? []) as RarityOpt[];
  const activeSetName = sets.find((x) => x.slug === setSlug)?.name;

  // key forces the grid Suspense to re-fall-back (show skeleton) on filter change
  const gridKey = `${game}|${type}|${setSlug}|${rarity}|${band}|${sort}|${q}|${showAll}|${league}|${pageNum}`;

  const scopedGame = league ? myGames.find((g) => g.id === league) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">
          {scopedGame ? `${scopedGame.name} market` : "Market"}
        </h1>
        {scopedGame && (
          <a
            href="/market"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-500 hover:bg-slate-200"
          >
            ✕ Show all cards
          </a>
        )}
      </div>

      {scopedGame && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-extrabold text-amber-800">
          <span className="text-base">🏆</span>
          Showing only cards you can trade in <span className="underline">{scopedGame.name}</span>.
        </div>
      )}

      <MarketFilters
        game={game} type={type} set={setSlug} rarity={rarity} band={band}
        sort={sort} q={q} showAll={showAll} sets={sets} rarities={rarities}
        league={league} games={myGames}
      />

      <Suspense key={gridKey} fallback={<div className="space-y-4"><div className="h-6 w-40 animate-pulse rounded bg-slate-200" /><SkeletonCardGrid /></div>}>
        <MarketGrid
          game={game} q={q} sort={sort} type={type} setSlug={setSlug}
          rarity={rarity} band={band} showAll={showAll} pageNum={pageNum}
          activeSetName={activeSetName} league={league} universe={universe}
        />
      </Suspense>
    </div>
  );
}
