import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import MarketCard from "@/components/MarketCard";
import MarketFilters, { SetOpt, RarityOpt } from "@/components/MarketFilters";
import { MarketRow } from "@/components/CardTile";

export const dynamic = "force-dynamic";

const SORTS: Record<string, { col: string; asc: boolean }> = {
  popular: { col: "price", asc: false },
  "price-asc": { col: "price", asc: true },
  gain: { col: "change_7d_pct", asc: false },
  lose: { col: "change_7d_pct", asc: true },
  new: { col: "published_on", asc: false },
};
const PRICE_BANDS: Record<string, { min?: number; max?: number }> = {
  "": {}, "5-25": { min: 5, max: 25 }, "25-100": { min: 25, max: 100 },
  "100-500": { min: 100, max: 500 }, "500+": { min: 500 },
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const game = sp.game === "one-piece" ? "one-piece" : "pokemon"; // split by game
  const q = sp.q ?? "";
  const sort = sp.sort ?? "popular";
  const type = sp.type === "sealed" ? "sealed" : "singles";
  const setSlug = sp.set ?? "";
  const rarity = sp.rarity ?? "";
  const band = sp.band ?? "";
  const showAll = sp.all === "1";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const pageSize = 50;
  const s = SORTS[sort] ?? SORTS.popular;
  const supabase = await serverClient();

  const qs = (over: Record<string, string>) => {
    const base: Record<string, string> = {
      game, q, sort, type, set: setSlug, rarity, band, all: showAll ? "1" : "",
    };
    return Object.entries({ ...base, ...over })
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
  };

  // grid
  let query = supabase
    .from("v_market")
    .select("*", { count: "exact" })
    .not("price", "is", null)
    .eq("game_slug", game)
    .eq("is_sealed", type === "sealed")
    .order(s.col, { ascending: s.asc, nullsFirst: false })
    .range((pageNum - 1) * pageSize, pageNum * pageSize - 1);
  if (setSlug) query = query.eq("set_slug", setSlug);
  if (q) query = query.ilike("name", `%${q}%`);
  if (rarity) query = query.eq("rarity", rarity);
  const pb = PRICE_BANDS[band];
  if (pb?.min != null) query = query.gte("price", pb.min);
  if (pb?.max != null) query = query.lte("price", pb.max);
  if (!showAll && pb?.min == null) query = query.gte("price", 5);

  const { data: rows, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  // filter options (for the chosen game)
  const [{ data: setData }, { data: rarityData }] = await Promise.all([
    supabase.from("v_sets").select("slug, name, single_count, sealed_count")
      .eq("game_slug", game).order("published_on", { ascending: false, nullsFirst: false }),
    supabase.from("v_rarities").select("rarity, n").eq("game_slug", game)
      .order("n", { ascending: false }),
  ]);
  const sets: SetOpt[] = (setData ?? [])
    .map((s2: { slug: string; name: string; single_count: number; sealed_count: number }) => ({
      slug: s2.slug, name: s2.name,
      count: type === "sealed" ? s2.sealed_count : s2.single_count,
    }))
    .filter((s2) => s2.count > 0);
  const rarities = (rarityData ?? []) as RarityOpt[];

  const activeSet = sets.find((x) => x.slug === setSlug);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Market</h1>

      <MarketFilters
        game={game} type={type} set={setSlug} rarity={rarity} band={band}
        sort={sort} q={q} showAll={showAll} sets={sets} rarities={rarities}
      />

      <div className="flex items-center justify-between pt-1">
        <h2 className="font-black">
          {q ? `“${q}”`
            : activeSet ? activeSet.name
            : `Popular ${type === "sealed" ? "sealed" : "singles"}`}
          {count != null && (
            <span className="ml-2 text-sm font-bold text-slate-400">{count.toLocaleString()}</span>
          )}
        </h2>
      </div>

      {!rows?.length ? (
        <p className="panel p-8 text-center font-bold text-slate-500">No cards found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {(rows as MarketRow[]).map((r) => <MarketCard key={r.asset_id} row={r} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 font-bold">
          {pageNum > 1 && (
            <Link className="btn-ghost" href={`/market?${qs({ page: String(pageNum - 1) })}`}>← Prev</Link>
          )}
          <span className="text-sm text-slate-500">Page {pageNum} of {totalPages}</span>
          {pageNum < totalPages && (
            <Link className="btn-ghost" href={`/market?${qs({ page: String(pageNum + 1) })}`}>Next →</Link>
          )}
        </div>
      )}
    </div>
  );
}
