import Link from "next/link";
import Image from "next/image";
import { usd, pct, pctClass } from "@/lib/format";
import { ArrowUpRight } from "lucide-react";

export interface HeroRow {
  asset_id: number;
  variant: string;
  price: number | null;
  prev_price: number | null;
  change_7d_pct: number | null;
  change_30d_pct: number | null;
  name: string;
  number: string | null;
  image_url: string | null;
  slug: string;
  set_name: string;
  game_slug: string;
}

function badge(chg: number | null) {
  if (chg == null) return null;
  if (chg >= 20) return { label: "BREAKOUT", cls: "bg-amber-100 text-amber-700" };
  if (chg >= 5) return { label: "MOMENTUM", cls: "bg-emerald-100 text-emerald-700" };
  if (chg <= -10) return { label: "DIP", cls: "bg-rose-100 text-rose-700" };
  return { label: "ACTIVE", cls: "bg-blue-100 text-blue-700" };
}

export default function HeroMovers({ rows }: { rows: HeroRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => {
        const chg = r.change_7d_pct ?? r.change_30d_pct;
        const b = badge(chg);
        // approximate "entry" from the 7d change for a from→now feel
        const entry =
          r.price != null && chg != null ? r.price / (1 + chg / 100) : r.prev_price;
        return (
          <Link
            key={r.asset_id}
            href={`/card/${r.game_slug}/${r.slug}?v=${encodeURIComponent(r.variant)}`}
            className="panel group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="relative h-24 w-[68px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {r.image_url && (
                  <Image src={r.image_url} alt={r.name} fill sizes="68px" className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="truncate font-extrabold leading-tight">{r.name}</p>
                  <ArrowUpRight size={14} className="shrink-0 text-slate-300 group-hover:text-blue-400" />
                </div>
                <p className="truncate text-xs font-bold text-slate-400">{r.set_name}</p>
                {b && <span className={`chip mt-2 ${b.cls}`}>{b.label}</span>}
              </div>
            </div>
            <div className="flex items-end justify-between border-t border-slate-100 pt-3">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400">Was → now</p>
                <p className="text-sm font-bold text-slate-500">
                  {usd(entry)} <span className="text-slate-300">→</span>{" "}
                  <span className="text-slate-800">{usd(r.price)}</span>
                </p>
              </div>
              <p className={`text-lg font-black ${pctClass(chg)}`}>{pct(chg)}</p>
            </div>
          </Link>
        );
      })}
    </section>
  );
}
