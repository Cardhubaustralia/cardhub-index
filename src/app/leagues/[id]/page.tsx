import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import Leaderboard, { LeaderboardRow } from "@/components/Leaderboard";
import JoinPublicButton from "@/components/JoinPublicButton";
import GameCountdown from "@/components/GameCountdown";
import GameAdminPanel from "@/components/GameAdminPanel";
import { SetLite } from "@/components/CreateGameForm";
import { universeLabel } from "@/lib/universe";
import { Users, Trophy, Coins, Calendar } from "lucide-react";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: game } = await supabase.from("v_games").select("*").eq("id", id).maybeSingle();
  if (!game) notFound();

  let isMember = false;
  if (user) {
    const { data } = await supabase.from("league_members")
      .select("user_id").eq("league_id", id).eq("user_id", user.id).maybeSingle();
    isMember = !!data;
  }

  const { data: rowsData } = await supabase
    .rpc("leaderboard").eq("league_id", id).order("rank").limit(100);
  const rows = (rowsData ?? []) as LeaderboardRow[];
  const top3 = rows.slice(0, 3);

  const started = game.game_status !== "upcoming";
  const isOwner = !!user && !game.is_global && game.owner_id === user.id;

  let sets: SetLite[] = [];
  if (isOwner) {
    const { data: setData } = await supabase
      .from("v_sets").select("slug, name, group_id, game_slug").order("name");
    sets = (setData ?? []) as SetLite[];
  }

  const stat = (Icon: typeof Users, label: string, value: string) => (
    <div className="panel flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon size={18} /></span>
      <div>
        <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
        <p className="font-black">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-black">{game.name}</h1>
          <p className="text-sm font-bold text-slate-500">{universeLabel(game.universe)}</p>
          <GameCountdown startsAt={game.starts_at} endsAt={game.ends_at}
            status={game.game_status} isGlobal={game.is_global} />
        </div>
        <div className="flex items-center gap-3">
          {isMember && game.invite_code && game.join_policy === "invite" && (
            <span className="chip bg-blue-50 text-blue-700">
              Invite: <span className="ml-1 tracking-widest">{game.invite_code}</span>
            </span>
          )}
          {!isMember && user && game.join_policy === "open" && game.game_status !== "ended" && (
            <JoinPublicButton leagueId={game.id} />
          )}
        </div>
      </div>

      {isOwner && (
        <GameAdminPanel
          leagueId={game.id}
          sets={sets}
          current={{
            name: game.name,
            join_policy: game.join_policy,
            max_position_pct: Number(game.max_position_pct),
            starts_at: game.starts_at,
            ends_at: game.ends_at,
            universe: game.universe,
          }}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(Users, "Players", String(game.member_count))}
        {stat(Coins, "Starting cash", usd(Number(game.starting_cash)))}
        {stat(Trophy, "Max per card", `${Number(game.max_position_pct)}%`)}
        {stat(Calendar, "Status", game.game_status)}
      </div>

      {top3.length > 0 && started && (
        <section className="grid gap-3 sm:grid-cols-3">
          {top3.map((r, i: number) => (
            <div key={r.user_id} className="panel flex items-center gap-3 p-4">
              <span className="text-2xl">{["🥇", "🥈", "🥉"][i]}</span>
              <div className="min-w-0">
                <p className="truncate font-black">{r.display_name || r.username}</p>
                <p className="text-sm font-bold text-emerald-600">{usd(Number(r.value))}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {!started ? (
        <p className="panel p-8 text-center font-bold text-slate-500">
          This game hasn&apos;t started yet — the leaderboard opens when trading begins.
        </p>
      ) : (
        <Leaderboard rows={rows ?? []} highlightUserId={user?.id} />
      )}
    </div>
  );
}
