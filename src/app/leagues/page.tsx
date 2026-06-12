import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import LeagueForms from "@/components/LeagueForms";
import { Users, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const myLeagueIds = new Set<string>();
  if (user) {
    const { data } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", user.id);
    (data ?? []).forEach((r) => myLeagueIds.add(r.league_id));
  }

  const { data: leagues } = await supabase
    .from("leagues")
    .select("id, name, is_public, is_global, invite_code, starting_cash, owner_id, created_at")
    .order("is_global", { ascending: false })
    .order("created_at", { ascending: false });

  const mine = (leagues ?? []).filter((l) => myLeagueIds.has(l.id));
  const publicLeagues = (leagues ?? []).filter(
    (l) => l.is_public && !myLeagueIds.has(l.id)
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black">Leagues</h1>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-black text-slate-600">
          <Users size={18} /> Your leagues
        </h2>
        {!mine.length ? (
          <p className="panel p-6 font-bold text-slate-400">
            {user ? "You haven't joined any leagues yet." : "Sign in to join leagues."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((l) => (
              <Link
                key={l.id}
                href={`/leagues/${l.id}`}
                className="panel flex items-center justify-between p-5 transition hover:-translate-y-0.5"
              >
                <div>
                  <p className="font-black">{l.name}</p>
                  <p className="text-xs font-bold text-slate-400">
                    {l.is_global ? "Everyone plays here" : l.is_public ? "Public league" : "Private league"}
                    {" · "}${Number(l.starting_cash).toLocaleString()} start
                  </p>
                </div>
                {l.is_global && <Globe className="text-blue-400" size={20} />}
              </Link>
            ))}
          </div>
        )}
      </section>

      {user && <LeagueForms />}

      {publicLeagues.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-black text-slate-600">Public leagues</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {publicLeagues.map((l) => (
              <Link key={l.id} href={`/leagues/${l.id}`} className="panel p-5">
                <p className="font-black">{l.name}</p>
                <p className="text-xs font-bold text-slate-400">
                  ${Number(l.starting_cash).toLocaleString()} start
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
