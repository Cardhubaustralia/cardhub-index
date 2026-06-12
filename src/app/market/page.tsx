import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import CardTile, { MarketRow } from "@/components/CardTile";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

const SORTS: Record<string, { col: string; asc: boolean; label: string }> = {
  "price-desc": { col: "price", asc: false, label: "Price ↓" },
  "price-asc": { col: "price", asc: true, label: "Price ↑" },
  "change-desc": { col: "change_pct", asc: false, label: "Movers ↑" },
  "change-asc": { col: "change_pct", asc: true, label: "Movers ↓" },
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; q?: string; sort?: string; page?: string }>;
}) {
  const { game = "all", q = "", sort = "price-desc", page = "1" } = await searchParams;
  const supabase = await serverClient();
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = 48;
  const s = SORTS[sort] ?? SORTS["price-desc"];

  let query = supabase
    .from("v_market")
    .select("*", { count: "exact" })
    .not("price", "is", null)
    .order(s.col, { ascending: s.asc, nullsFirst: false })
    .range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

  if (game !== "all") query = query.eq("game_slug", game);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data: rows, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const tab = (slug: string, label: string) => (
    <Link
      key={slug}
      href={`/market?game=${slug}&q=${encodeURIComponent(q)}&sort=${sort}`}
      className={
        "rounded-2xl px-4 py-2 text-sm font-extrabold " +
        (game === slug
          ? "bg-blue-500 text-white shadow-[0_3px_0_0_#1d4ed8]"
          : "bg-white text-slate-600 border-2 border-slate-200 hover:border-slate-300")
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Market</h1>

      <div className="flex flex-wrap items-center gap-2">
        {tab("all", "All")}
        {tab("pokemon", "Pokémon")}
        {tab("one-piece", "One Piece")}
        <form action="/market" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="sort" value={sort} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search cards…"
              className="field w-56 pl-9"
            />
          </div>
        </form>
        <div className="flex gap-1">
          {Object.entries(SORTS).map(([key, v]) => (
            <Link
              key={key}
              href={`/market?game=${game}&q=${encodeURIComponent(q)}&sort=${key}`}
              className={
                "rounded-xl px-3 py-2 text-xs font-extrabold " +
                (sort === key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
              }
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      {!rows?.length ? (
        <p className="panel p-8 text-center font-bold text-slate-500">
          No cards found{q ? ` for “${q}”` : ""}. {count === 0 && !q ? "Run the price sync to populate the market." : ""}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(rows as MarketRow[]).map((r) => (
            <CardTile key={r.asset_id} row={r} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 font-bold">
          {pageNum > 1 && (
            <Link
              className="btn-ghost"
              href={`/market?game=${game}&q=${encodeURIComponent(q)}&sort=${sort}&page=${pageNum - 1}`}
            >
              ← Prev
            </Link>
          )}
          <span className="text-sm text-slate-500">
            Page {pageNum} of {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link
              className="btn-ghost"
              href={`/market?game=${game}&q=${encodeURIComponent(q)}&sort=${sort}&page=${pageNum + 1}`}
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
