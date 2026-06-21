"use client";
// Compact 2-line market filter bar. Auto-applies on change.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Package, Layers } from "lucide-react";

export interface SetOpt { slug: string; name: string; count: number }
export interface RarityOpt { rarity: string; n: number }

interface Props {
  game: string; type: string; set: string; rarity: string; band: string;
  sort: string; q: string; showAll: boolean;
  sets: SetOpt[]; rarities: RarityOpt[];
}

const SORTS: [string, string][] = [
  ["popular", "Popular"], ["price-asc", "Price ↑"],
  ["gain", "Gainers"], ["lose", "Fallers"], ["new", "Newest sets"],
];
const BANDS: [string, string][] = [
  ["", "Any price"], ["5-25", "$5–25"], ["25-100", "$25–100"],
  ["100-500", "$100–500"], ["500+", "$500+"],
];

export default function MarketFilters(p: Props) {
  const router = useRouter();
  const [q, setQ] = useState(p.q);

  const push = (over: Record<string, string>) => {
    const base: Record<string, string> = {
      game: p.game, type: p.type, set: p.set, rarity: p.rarity,
      band: p.band, sort: p.sort, q, all: p.showAll ? "1" : "",
    };
    const merged = { ...base, ...over, page: "" };
    const qs = Object.entries(merged).filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    router.push(`/market?${qs}`);
  };

  const tab = (val: string, label: string, current: string, key: string, Icon?: typeof Package) => (
    <button
      onClick={() => push({ [key]: val, set: key === "game" ? "" : p.set })}
      className={
        "inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-extrabold " +
        (current === val
          ? "bg-blue-500 text-white shadow-[0_3px_0_0_#1d4ed8]"
          : "bg-white text-slate-600 border-2 border-slate-200 hover:border-slate-300")
      }
    >
      {Icon && <Icon size={15} />} {label}
    </button>
  );

  const sel = "field w-auto py-1.5 text-sm";

  return (
    <div className="space-y-2">
      {/* line 1 */}
      <div className="flex flex-wrap items-center gap-2">
        {tab("pokemon", "Pokémon", p.game, "game")}
        {tab("one-piece", "One Piece", p.game, "game")}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {tab("singles", "Singles", p.type, "type", Layers)}
        {tab("sealed", "Sealed", p.type, "type", Package)}
        <button
          onClick={() => push({ all: p.showAll ? "" : "1" })}
          className={
            "ml-auto rounded-xl px-3 py-1.5 text-xs font-extrabold " +
            (p.showAll ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
          }
        >
          {p.showAll ? "Showing all prices" : "Hiding under $5"}
        </button>
      </div>

      {/* line 2 */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={p.set} onChange={(e) => push({ set: e.target.value })} className={sel}>
          <option value="">All sets</option>
          {p.sets.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name} ({s.count})</option>
          ))}
        </select>
        <select value={p.rarity} onChange={(e) => push({ rarity: e.target.value })} className={sel}>
          <option value="">All rarities</option>
          {p.rarities.map((r) => (
            <option key={r.rarity} value={r.rarity}>{r.rarity} ({r.n})</option>
          ))}
        </select>
        <select value={p.band} onChange={(e) => push({ band: e.target.value })} className={sel}>
          {BANDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={p.sort} onChange={(e) => push({ sort: e.target.value })} className={sel}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); push({ q }); }}
          className="relative ml-auto"
        >
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards…"
            className="field w-56 py-1.5 pl-9 text-sm"
          />
        </form>
      </div>
    </div>
  );
}
