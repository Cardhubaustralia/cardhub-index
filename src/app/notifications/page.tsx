import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { ArrowLeftRight, Megaphone } from "lucide-react";
import MarkAllRead from "@/components/MarkAllRead";

export const dynamic = "force-dynamic";

function ago(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const { filter = "all" } = await searchParams;
  let q = supabase.from("notifications").select("*")
    .order("created_at", { ascending: false }).limit(100);
  if (filter === "trade") q = q.eq("kind", "trade");
  else if (filter === "update") q = q.eq("kind", "update");
  const { data: notes } = await q;

  const tab = (key: string, label: string) => (
    <Link href={`/notifications?filter=${key}`}
      className={"rounded-2xl px-4 py-2 text-sm font-extrabold " +
        (filter === key ? "bg-blue-500 text-white" : "border-2 border-slate-200 bg-white text-slate-600")}>
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Notifications</h1>
        <MarkAllRead />
      </div>

      <div className="flex gap-2">
        {tab("all", "All")}
        {tab("trade", "Trades")}
        {tab("update", "Updates")}
      </div>

      {!notes?.length ? (
        <p className="panel p-8 text-center font-bold text-slate-400">Nothing here yet.</p>
      ) : (
        <div className="panel divide-y divide-slate-100 overflow-hidden p-0">
          {notes.map((n) => {
            const Inner = (
              <div className={"flex gap-3 px-5 py-4 " + (n.read ? "" : "bg-blue-50/40")}>
                <span className={"mt-0.5 " + (n.kind === "trade" ? "text-emerald-500" : "text-blue-500")}>
                  {n.kind === "trade" ? <ArrowLeftRight size={18} /> : <Megaphone size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{n.title}</p>
                  {n.body && <p className="text-sm font-semibold text-slate-500">{n.body}</p>}
                </div>
                <span className="whitespace-nowrap text-xs font-bold text-slate-300">{ago(n.created_at)}</span>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block hover:bg-slate-50">{Inner}</Link>
            ) : <div key={n.id}>{Inner}</div>;
          })}
        </div>
      )}
    </div>
  );
}
