import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import JoinGame from "@/components/JoinGame";
import GameCountdown from "@/components/GameCountdown";
import { universeLabel } from "@/lib/universe";
import { Users, Globe, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

interface GameRow {
  id: string; name: string; is_global: boolean; join_policy: string;
  starting_cash: number; starts_at: string; ends_at: string | null;
  universe: Record<string, unknown>; member_count: number; game_status: string;
}

function GameCard({ g, joined }: { g: GameRow; joined?: boolean }) {
  return (
    <Link href={`/leagues/${g.id}`}
      className="panel flex flex-col gap-2 p-5 transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-black">{g.name}</p>
        {g.is_global ? <Globe size={18} className="text-blue-400" />
          : <span className="chip bg-slate-100 text-slate-500">{g.join_policy}</span>}
      </div>
      <p className="text-xs font-bold text-slate-400">{universeLabel(g.universe)}</p>
      <div className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-500">
          <Users size={14} /> {g.member_count}
        </span>
        <GameCountdown startsAt={g.starts_at} endsAt={g.ends_at}
          status={g.game_status} isGlobal={g.is_global} />
      </div>
      {!g.is_global && (
        <p className="text-xs font-bold text-slate-400">
          ${Number(g.starting_cash).toLocaleString()} start
        </p>
      )}
      {joined === false && g.join_policy === "open" && (
        <span className="mt-1 text-xs font-extrabold text-blue-600">Tap to view &amp; join →</span>
      )}
    </Link>
  );
}

export default async function GamesPage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  const mineIds = new Set<string>();
  let role = "user";
  if (user) {
    const [{ data: mem }, { data: prof }] = await Promise.all([
      supabase.from("league_members").select("league_id").eq("user_id", user.id),
      supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle(),
    ]);
    (mem ?? []).forEach((r) => mineIds.add(r.league_id));
    role = prof?.role ?? "user";
  }
  const canCreate = role === "lead" || role === "admin";

  const { data: games } = await supabase
    .from("v_games").select("*")
    .order("is_global", { ascending: false })
    .order("member_count", { ascending: false });

  const all = (games ?? []) as GameRow[];
  const mine = all.filter((g) => mineIds.has(g.id));
  const open = all.filter((g) => !mineIds.has(g.id) && g.join_policy === "open" && g.game_status !== "ended");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Games</h1>
        {canCreate && (
          <Link href="/leagues/create" className="btn-primary text-sm">
            <Plus size={16} /> Create game
          </Link>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-black text-slate-600"><Users size={18} /> Your games</h2>
        {!mine.length ? (
          <p className="panel p-6 font-bold text-slate-400">
            {user ? "You haven't joined any games yet." : "Sign in to play."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((g) => <GameCard key={g.id} g={g} />)}
          </div>
        )}
      </section>

      {user && <div className="max-w-md"><JoinGame /></div>}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-black text-slate-600">Open games to join</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((g) => <GameCard key={g.id} g={g} joined={false} />)}
          </div>
        </section>
      )}
    </div>
  );
}
