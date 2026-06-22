import { usd, pct, pctClass } from "@/lib/format";
import { Trophy } from "lucide-react";

export interface LeaderboardRow {
  user_id: string;
  username: string;
  display_name: string | null;
  value: number;
  cash: number;
  holdings_value: number;
  starting_cash: number;
  profit: number;
  rank: number;
}

const MEDALS = ["text-amber-400", "text-slate-400", "text-amber-700"];

export default function Leaderboard({
  rows,
  highlightUserId,
}: {
  rows: LeaderboardRow[];
  highlightUserId?: string;
}) {
  if (!rows.length) {
    return (
      <p className="panel p-8 text-center font-bold text-slate-400">
        No players yet — invite some friends!
      </p>
    );
  }
  return (
    <section className="panel overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
            <th className="px-5 py-3 w-14">#</th>
            <th className="px-3 py-3">Player</th>
            <th className="px-3 py-3 text-right">Portfolio</th>
            <th className="px-3 py-3 text-right hidden sm:table-cell">Cash</th>
            <th className="px-5 py-3 text-right">Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const profitPct = (Number(r.profit) / Number(r.starting_cash)) * 100;
            return (
              <tr
                key={r.user_id}
                className={
                  "border-t border-slate-100 font-bold " +
                  (r.user_id === highlightUserId ? "bg-blue-50/70" : "")
                }
              >
                <td className="px-5 py-3">
                  {r.rank <= 3 ? (
                    <Trophy size={16} className={MEDALS[r.rank - 1]} />
                  ) : (
                    <span className="text-slate-400">{r.rank}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {r.display_name || r.username}
                  <span className="ml-1 text-xs text-slate-400">@{r.username}</span>
                </td>
                <td className="px-3 py-3 text-right font-black">{usd(Number(r.value))}</td>
                <td className="px-3 py-3 text-right hidden sm:table-cell text-slate-500">
                  {usd(Number(r.cash))}
                </td>
                <td className={`px-5 py-3 text-right ${pctClass(Number(r.profit))}`}>
                  {usd(Number(r.profit))}{" "}
                  <span className="text-xs">({pct(profitPct)})</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
