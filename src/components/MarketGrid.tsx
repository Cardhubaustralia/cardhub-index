import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import MarketCard from "@/components/MarketCard";
import { MarketRow } from "@/components/CardTile";

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

export interface MarketParams {
  game: string; q: string; sort: string; type: string;
  setSlug: string; rarity: string; band: string; showAll: boolean; pageNum: number;
  activeSetName?: string;
}

export default async function MarketGrid(p: MarketParams) {
  const supabase = await serverClient();
  const pageSize = 50;
  const s = SORTS[p.sort] ?? SORTS.popular;

  let query = supabase
    .from("v_market").select("*", { count: "exact" })
    .not("price", "is", null)
    .eq("game_slug", p.game)
    .eq("is_sealed", p.type === "sealed")
    .order(s.col, { ascending: s.asc, nullsFirst: false })
    .range((p.pageNum - 1) * pageSize, p.pageNum * pageSize - 1);
  if (p.setSlug) query = query.eq("set_slug", p.setSlug);
  if (p.q) query = query.ilike("name", `%${p.q}%`);
  if (p.rarity) query = query.eq("rarity", p.rarity);
  const pb = PRICE_BANDS[p.band];
  if (pb?.min != null) query = query.gte("price", pb.min);
  if (pb?.max != null) query = query.lte("price", pb.max);
  if (!p.showAll && pb?.min == null) query = query.gte("price", 5);

  const { data: rows, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const qs = (over: Record<string, string>) => {
    const base: Record<string, string> = {
      game: p.game, q: p.q, sort: p.sort, type: p.type, set: p.setSlug,
      rarity: p.rarity, band: p.band, all: p.showAll ? "1" : "",
    };
    return Object.entries({ ...base, ...over }).filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  };

  return (
    <>
      <div className="flex items-center justify-between pt-1">
        <h2 className="font-black">
          {p.q ? `“${p.q}”` : p.activeSetName ?? `Popular ${p.type === "sealed" ? "sealed" : "singles"}`}
          {count != null && <span className="ml-2 text-sm font-bold text-slate-400">{count.toLocaleString()}</span>}
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
          {p.pageNum > 1 && (
            <Link className="btn-ghost" href={`/market?${qs({ page: String(p.pageNum - 1) })}`}>← Prev</Link>
          )}
          <span className="text-sm text-slate-500">Page {p.pageNum} of {totalPages}</span>
          {p.pageNum < totalPages && (
            <Link className="btn-ghost" href={`/market?${qs({ page: String(p.pageNum + 1) })}`}>Next →</Link>
          )}
        </div>
      )}
    </>
  );
}
