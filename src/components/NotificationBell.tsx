"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ArrowLeftRight, Megaphone } from "lucide-react";
import { browserClient } from "@/lib/supabase/client";
import { markNotificationsRead } from "@/lib/actions";

interface Note {
  id: number; kind: string; title: string; body: string | null;
  link: string | null; read: boolean; created_at: string;
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = async () => {
    const supabase = browserClient();
    const { data } = await supabase
      .from("notifications").select("*")
      .order("created_at", { ascending: false }).limit(12);
    const list = (data ?? []) as Note[];
    setNotes(list);
    setUnread(list.filter((n) => !n.read).length);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => { clearInterval(t); document.removeEventListener("mousedown", onClick); };
  }, []);

  const openPanel = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      await markNotificationsRead();
      setUnread(0);
      setNotes((ns) => ns.map((n) => ({ ...n, read: true })));
      router.refresh();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openPanel} className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-black">Notifications</span>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-extrabold text-blue-600 hover:underline">
              See all
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!notes.length ? (
              <p className="p-6 text-center text-sm font-bold text-slate-400">Nothing yet.</p>
            ) : notes.map((n) => {
              const Inner = (
                <div className={"flex gap-3 px-4 py-3 " + (n.read ? "" : "bg-blue-50/50")}>
                  <span className={"mt-0.5 " + (n.kind === "trade" ? "text-emerald-500" : "text-blue-500")}>
                    {n.kind === "trade" ? <ArrowLeftRight size={16} /> : <Megaphone size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{n.title}</p>
                    {n.body && <p className="truncate text-xs font-semibold text-slate-400">{n.body}</p>}
                  </div>
                  <span className="text-xs font-bold text-slate-300">{ago(n.created_at)}</span>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} onClick={() => setOpen(false)} className="block hover:bg-slate-50">{Inner}</Link>
              ) : <div key={n.id}>{Inner}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
