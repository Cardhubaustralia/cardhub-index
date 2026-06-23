import Link from "next/link";
import Image from "next/image";
import { usd, pct, pctClass, sanePct } from "@/lib/format";
import { MarketRow } from "@/components/CardTile";

export default function MarketCard({ row }: { row: MarketRow & {
  is_sealed?: boolean; published_on?: string | null;
} }) {
  const chg = sanePct(row.change_7d_pct ?? row.change_pct ?? null);
  return (
    <Link
      href={`/card/${row.game_slug}/${row.slug}?v=${encodeURIComponent(row.variant)}`}
      className="panel group flex flex-col overflow-hidden p-0 transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[5/7] w-full bg-slate-100">
        {row.image_url && (
          <Image
            src={row.image_url}
            alt={row.name}
            fill
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 200px"
            className="object-contain p-2 transition group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {row.is_sealed && (
            <span className="chip bg-violet-100 text-violet-700">Sealed</span>
          )}
          {row.rarity && (
            <span className="chip bg-white/90 text-slate-600 shadow-sm">{row.rarity}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 border-t border-slate-100 p-3">
        <p className="truncate font-extrabold leading-tight">{row.name}</p>
        <p className="truncate text-xs font-bold text-slate-400">
          {row.set_name}
          {row.number ? ` · #${row.number}` : ""}
        </p>
        <p className="truncate text-xs font-bold text-slate-400">{row.variant}</p>
        <div className="mt-1.5 flex items-end justify-between">
          <p className="text-lg font-black">{usd(row.price)}</p>
          <p className={`text-xs font-extrabold ${pctClass(chg)}`}>
            {pct(chg)} <span className="text-slate-300">7d</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
