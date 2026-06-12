import Link from "next/link";
import Image from "next/image";
import { usd, pct, pctClass } from "@/lib/format";

export interface MarketRow {
  asset_id: number;
  variant: string;
  price: number | null;
  change_pct: number | null;
  name: string;
  number: string | null;
  rarity: string | null;
  image_url: string | null;
  slug: string;
  set_name: string;
  game_slug: string;
}

export default function CardTile({ row }: { row: MarketRow }) {
  return (
    <Link
      href={`/card/${row.game_slug}/${row.slug}?v=${encodeURIComponent(row.variant)}`}
      className="panel flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {row.image_url && (
          <Image
            src={row.image_url}
            alt={row.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold leading-tight">{row.name}</p>
        <p className="truncate text-xs font-bold text-slate-400">
          {row.set_name}
          {row.number ? ` · #${row.number}` : ""} · {row.variant}
        </p>
      </div>
      <div className="text-right">
        <p className="font-black">{usd(row.price)}</p>
        <p className={`text-xs font-extrabold ${pctClass(row.change_pct)}`}>
          {pct(row.change_pct)}
        </p>
      </div>
    </Link>
  );
}
