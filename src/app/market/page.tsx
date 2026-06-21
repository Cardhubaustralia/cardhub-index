import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import MarketCard from "@/components/MarketCard";
import { MarketRow } from "@/components/CardTile";
import { Search, Package, Layers } from "lucide-react";

const PRICE_BANDS: Record<string, { label: string; min?: number; max?: number }> = {
  "": { label: "Any price" },
  "5-25": { label: "$5–25", min: 5, max: 25 },
  "25-100": { label: "$25–100", min: 25, max: 100 },
  "100-500": { label: "$100–500", min: 100, max: 500 },
  "500+": { label: "$500+", min: 500 },
};

export const dynamic = "force-dynamic";

const SORTS: Record<string, { col: string; asc: boolean; label: string }> = {
  popular: { col: "price", asc: false, label: "Popular" },
  "price-asc": { col: "price", asc: true, label: "Price ↑" },
  "gain": { col: "change_7d_pct", asc: false, label: "Gainers" },
  "lose": { col: "change_7d_pct", asc: true, label: "Fallers" },
  "new": { col: "published_on", asc: false, label: "Newest sets" },
};

interface SetRow {
  group_id: number; name: string; slug: string; year: number | null;
  game_slug: string; single_count: number; sealed_count: number;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{
    game?: string; q?: string; sort?: string; page?: string;
    type?: string; set?: string; all?: string; rarity?: string;
    year?: string; band?: string;
  }>;
}) {
  const sp = await searchParams;
  const game = sp.game ?? "all";
  const q = sp.q ?? "";
  const sort = sp.sort ?? "popular";
  const type = sp.type ?? "singles"; // singles | sealed
  const setSlug = sp.set ?? "";
  const rarity = sp.rarity ?? "";
  const year = sp.year ?? "";
  const band = sp.band ?? "";
  const showAll = sp.all === "1"; // include cards under $5
  const pageNum = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const pageSize = 48;
  const s = SORTS[sort] ?? SORTS.popular;
  const supabase = await serverClient();

  const qs = (over: Record<string, string>) => {
    const base: Record<string, string> = {
      game, q, sort, type, set: setSlug, rarity, year, band, all: showAll ? "1" : "",
    };
    const merged = { ...base, ...over };
    return Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
  };

  // ---- card grid query ----
  let query = supabase
    .from("v_market")
    .select("*", { count: "exact" })
    .not("price", "is", null)
    .eq("is_sealed", type === "sealed")
    .order(s.col, { ascending: s.asc, nullsFirst: false })
    .range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

  if (game !== "all") query = query.eq("game_slug", game);
  if (setSlug) query = query.eq("set_slug", setSlug);
  if (q) query = query.ilike("name", `%${q}%`);
  if (rarity) query = query.eq("rarity", rarity);
  if (year) query = query.gte("published_on", `${year}-01-01`).lte("published_on", `${year}-12-31`);
  const pb = PRICE_BANDS[band];
  if (pb?.min != null) query = query.gte("price", pb.min);
  if (pb?.max != null) query = query.lte("price", pb.max);
  if (!showAll && pb?.min == null) query = query.gte("price", 5);

  const { data: rows, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  // filter options
  let rarities: { rarity: string; n: number }[] = [];
  {
    let rq = supabase.from("v_rarities").select("rarity, n").order("n", { ascending: false });
    if (game !== "all") rq = rq.eq("game_slug", game);
    const { data } = await rq;
    rarities = (data ?? []) as { rarity: string; n: number }[];
  }
  const years: number[] = [];
  for (let y = new Date().getFullYear(); y >= 1999; y--) years.push(y);

  // ---- set browse (only when not searching / no set chosen) ----
  let setsByYear: [number, SetRow[]][] = [];
  let activeSet: SetRow | null = null;
  if (!q) {
    let setQ = supabase
      .from("v_sets")
      .select("*")
      .order("published_on", { ascending: false, nullsFirst: false });
    if (game !== "all") setQ = setQ.eq("game_slug", game);
    const { data: sets } = await setQ;
    const list = (sets ?? []) as SetRow[];
    activeSet = list.find((x) => x.slug === setSlug) ?? null;
    if (!setSlug) {
      const map = new Map<number, SetRow[]>();
      for (const st of list) {
        const total = (type === "sealed" ? st.sealed_count : st.single_count) ?? 0;
        if (total === 0) continue;
        const yr = st.year ?? 0;
        if (!map.has(yr)) map.set(yr, []);
        map.get(yr)!.push(st);
      }
      setsByYear = [...map.entries()].sort((a, b) => b[0] - a[0]);
    }
  }

  const gameTab = (slug: string, label: string) => (
    <Link
      key={slug}
      href={`/market?${qs({ game: slug, set: "", page: "" })}`}
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

  const typeTab = (key: string, label: string, Icon: typeof Package) => (
    <Link
      href={`/market?${qs({ type: key, set: "", page: "" })}`}
      className={
        "inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-extrabold " +
        (type === key
          ? "bg-slate-800 text-white"
          : "bg-white text-slate-600 border-2 border-slate-200 hover:border-slate-300")
      }
    >
      <Icon size={15} /> {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Market</h1>
        <form action="/market" className="flex items-center gap-2">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="sort" value={sort} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search cards…" className="field w-64 pl-9" />
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {gameTab("all", "All games")}
        {gameTab("pokemon", "Pokémon")}
        {gameTab("one-piece", "One Piece")}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {typeTab("singles", "Singles", Layers)}
        {typeTab("sealed", "Sealed", Package)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase text-slate-400">Sort</span>
        {Object.entries(SORTS).map(([key, v]) => (
          <Link
            key={key}
            href={`/market?${qs({ sort: key, page: "" })}`}
            className={
              "rounded-xl px-3 py-1.5 text-xs font-extrabold " +
              (sort === key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            {v.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Link
          href={`/market?${qs({ all: showAll ? "" : "1", page: "" })}`}
          className={
            "rounded-xl px-3 py-1.5 text-xs font-extrabold " +
            (showAll ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
          }
        >
          {showAll ? "Showing all prices" : "Hiding under $5"}
        </Link>
      </div>

      {/* Filters */}
      <form action="/market" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="game" value={game} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="set" value={setSlug} />
        <input type="hidden" name="q" value={q} />
        {showAll && <input type="hidden" name="all" value="1" />}
        <span className="text-xs font-bold uppercase text-slate-400">Filter</span>
        <select name="rarity" defaultValue={rarity} className="field w-auto py-1.5 text-sm">
          <option value="">All rarities</option>
          {rarities.map((r) => (
            <option key={r.rarity} value={r.rarity}>{r.rarity} ({r.n})</option>
          ))}
        </select>
        <select name="year" defaultValue={year} className="field w-auto py-1.5 text-sm">
          <option value="">Any year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="band" defaultValue={band} className="field w-auto py-1.5 text-sm">
          {Object.entries(PRICE_BANDS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button className="btn-ghost py-1.5 text-sm">Apply</button>
        {(rarity || year || band) && (
          <Link href={`/market?${qs({ rarity: "", year: "", band: "", page: "" })}`}
            className="text-xs font-bold text-slate-400 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {/* Browse by set */}
      {!q && !setSlug && setsByYear.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-black text-slate-600">Browse by set</h2>
          {setsByYear.map(([year, sets]) => (
            <div key={year} className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {year || "Other"}
              </p>
              <div className="flex flex-wrap gap-2">
                {sets.map((st) => (
                  <Link
                    key={st.group_id}
                    href={`/market?${qs({ set: st.slug, page: "" })}`}
                    className="panel px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300"
                  >
                    {st.name}
                    <span className="ml-1.5 text-xs text-slate-400">
                      {(type === "sealed" ? st.sealed_count : st.single_count)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Card grid header */}
      <div className="flex items-center justify-between">
        <h2 className="font-black">
          {q ? `Results for “${q}”`
            : activeSet ? `${activeSet.name} · ${type === "sealed" ? "Sealed" : "Singles"}`
            : `Popular ${type === "sealed" ? "sealed" : "singles"}`}
          {count != null && <span className="ml-2 text-sm font-bold text-slate-400">{count.toLocaleString()}</span>}
        </h2>
        {setSlug && (
          <Link href={`/market?${qs({ set: "", page: "" })}`} className="text-sm font-extrabold text-blue-600 hover:underline">
            ← All sets
          </Link>
        )}
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
