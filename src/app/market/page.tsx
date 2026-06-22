import { Suspense } from "react";
import { serverClient } from "@/lib/supabase/server";
import MarketFilters, { SetOpt, RarityOpt } from "@/components/MarketFilters";
import MarketGrid from "@/components/MarketGrid";
import { SkeletonCardGrid } from "@/components/Skeletons";

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
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const supabase = await serverClient();

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
  const gridKey = `${game}|${type}|${setSlug}|${rarity}|${band}|${sort}|${q}|${showAll}|${pageNum}`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Market</h1>

      <MarketFilters
        game={game} type={type} set={setSlug} rarity={rarity} band={band}
        sort={sort} q={q} showAll={showAll} sets={sets} rarities={rarities}
      />

      <Suspense key={gridKey} fallback={<div className="space-y-4"><div className="h-6 w-40 animate-pulse rounded bg-slate-200" /><SkeletonCardGrid /></div>}>
        <MarketGrid
          game={game} q={q} sort={sort} type={type} setSlug={setSlug}
          rarity={rarity} band={band} showAll={showAll} pageNum={pageNum}
          activeSetName={activeSetName}
        />
      </Suspense>
    </div>
  );
}
