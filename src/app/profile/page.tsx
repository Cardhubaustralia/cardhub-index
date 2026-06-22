import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { usd, pctClass } from "@/lib/format";
import { History, Eye, Settings, Bell, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profiles").select("username, display_name, country, created_at").eq("user_id", user.id).single();

  const [{ data: pnl }, { count: games }, { count: watched }] = await Promise.all([
    supabase.from("orders").select("realized_pnl").eq("user_id", user.id)
      .eq("status", "filled").not("realized_pnl", "is", null),
    supabase.from("league_members").select("league_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("watchlist").select("asset_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const realized = (pnl ?? []).reduce((s, r) => s + Number(r.realized_pnl ?? 0), 0);

  const tile = (href: string, Icon: typeof History, label: string, sub: string) => (
    <Link href={href} className="panel flex items-center gap-3 p-5 transition hover:-translate-y-0.5">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-600"><Icon size={20} /></span>
      <div>
        <p className="font-black">{label}</p>
        <p className="text-xs font-bold text-slate-400">{sub}</p>
      </div>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="panel flex items-center gap-4 p-6">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-blue-500 text-2xl font-black text-white">
          {(profile?.display_name || profile?.username || "?").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-black">{profile?.display_name || profile?.username}</h1>
          <p className="font-bold text-slate-400">
            @{profile?.username}
            {profile?.created_at && ` · joined ${new Date(profile.created_at).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Realized P&amp;L</p>
          <p className={`text-lg font-black ${pctClass(realized)}`}>{usd(realized)}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Games</p>
          <p className="text-lg font-black">{games ?? 0}</p>
        </div>
        <div className="panel px-4 py-3">
          <p className="text-xs font-bold uppercase text-slate-400">Watching</p>
          <p className="text-lg font-black">{watched ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tile("/portfolio/history", History, "Trade history", "Every order you've placed")}
        {tile("/profile/watchlist", Eye, "Watchlist", "Cards you're keeping an eye on")}
        {tile("/notifications", Bell, "Notifications", "Trade fills & game updates")}
        {tile("/leagues", Users, "Your games", "Standings & leagues")}
        {tile("/settings", Settings, "Account settings", "Name, country, notifications")}
      </div>
    </div>
  );
}
