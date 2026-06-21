"use client";
// ⌘K global card search, available from any page.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";

interface Hit {
  asset_id: number; name: string; set_name: string; variant: string;
  image_url: string | null; slug: string; game_slug: string; price: number | null;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setHits([]); setActive(0); }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const supabase = browserClient();
      const { data } = await supabase
        .from("v_market")
        .select("asset_id, name, set_name, variant, image_url, slug, game_slug, price")
        .not("price", "is", null)
        .ilike("name", `%${q.trim()}%`)
        .order("price", { ascending: false, nullsFirst: false })
        .limit(8);
      setHits((data ?? []) as Hit[]);
      setActive(0);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: Hit) => {
    setOpen(false);
    router.push(`/card/${h.game_slug}/${h.slug}?v=${encodeURIComponent(h.variant)}`);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-400 hover:border-slate-300 sm:flex"
      >
        <Search size={15} /> Search cards…
        <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs">⌘K</span>
      </button>
      <button onClick={() => setOpen(true)} className="text-slate-500 sm:hidden" aria-label="Search">
        <Search size={20} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="panel w-full max-w-xl overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4">
              <Search size={18} className="text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
                  if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                  if (e.key === "Enter" && hits[active]) go(hits[active]);
                }}
                placeholder="Search Pokémon & One Piece cards…"
                className="w-full bg-transparent py-4 font-semibold outline-none"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length >= 2 && !hits.length && (
                <p className="p-6 text-center font-bold text-slate-400">No cards found.</p>
              )}
              {hits.map((h, i) => (
                <button
                  key={h.asset_id}
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left " +
                    (i === active ? "bg-blue-50" : "hover:bg-slate-50")
                  }
                >
                  <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-slate-100">
                    {h.image_url && (
                      <Image src={h.image_url} alt={h.name} fill sizes="36px" className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{h.name}</p>
                    <p className="truncate text-xs font-bold text-slate-400">
                      {h.set_name} · {h.variant}
                    </p>
                  </div>
                  <p className="font-black">
                    {h.price != null
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(h.price)
                      : "—"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
