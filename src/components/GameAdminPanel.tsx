"use client";
// Owner-only admin panel: fix a game's settings and card pool after the
// fact (e.g. a wrong set was added). Mirrors the create form's universe
// builder, prefilled from the game's current config.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2, ChevronDown } from "lucide-react";
import { updateGame } from "@/lib/actions";
import type { Universe } from "@/lib/universe";
import type { SetLite } from "@/components/CreateGameForm";

export default function GameAdminPanel({
  leagueId, sets, current,
}: {
  leagueId: string;
  sets: SetLite[];
  current: {
    name: string;
    join_policy: "open" | "invite";
    max_position_pct: number;
    starts_at: string;
    ends_at: string | null;
    universe: Universe | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const u = current.universe ?? {};
  const [name, setName] = useState(current.name);
  const [joinPolicy, setJoinPolicy] = useState<"open" | "invite">(current.join_policy);
  const [maxPct, setMaxPct] = useState(Number(current.max_position_pct));
  const [endsAt, setEndsAt] = useState(
    current.ends_at ? current.ends_at.slice(0, 10) : ""
  );

  // universe
  const [games, setGames] = useState<string[]>(u.games ?? ["pokemon", "one-piece"]);
  const [nameLike, setNameLike] = useState(u.name_like ?? "");
  const [sealed, setSealed] = useState<"any" | "only" | "exclude">(u.sealed ?? "any");
  const [setIds, setSetIds] = useState<number[]>(u.set_ids ?? []);

  const setOptions = useMemo(
    () => sets.filter((s) => games.length === 0 || games.includes(s.game_slug)),
    [sets, games]
  );

  const toggleGame = (g: string) =>
    setGames((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const buildUniverse = (): Universe => {
    const out: Universe = {};
    if (games.length && games.length < 2) out.games = games;
    if (nameLike.trim()) out.name_like = nameLike.trim();
    if (setIds.length) out.set_ids = setIds;
    if (sealed !== "any") out.sealed = sealed;
    return out;
  };

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await updateGame({
        leagueId,
        name,
        joinPolicy,
        maxPositionPct: maxPct,
        endsAt: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : undefined,
        universe: buildUniverse(),
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="inline-flex items-center gap-2 font-black">
          <Settings2 size={18} className="text-slate-500" /> Manage game (owner)
        </span>
        <ChevronDown size={18} className={"text-slate-400 transition " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 p-6">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Game name" className="field" minLength={3} />

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold text-slate-500">Max % per card
              <input type="number" value={maxPct} min={1} max={100}
                onChange={(e) => setMaxPct(Number(e.target.value))} className="field mt-1" />
            </label>
            <label className="text-sm font-bold text-slate-500">Who can join
              <select value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as "open" | "invite")}
                className="field mt-1">
                <option value="open">Open — anyone</option>
                <option value="invite">Invite only</option>
              </select>
            </label>
            <label className="col-span-2 text-sm font-bold text-slate-500">End date
              <input type="date" value={endsAt} min={current.starts_at.slice(0, 10)}
                onChange={(e) => setEndsAt(e.target.value)} className="field mt-1" />
            </label>
          </div>

          <div className="space-y-3 rounded-2xl border-2 border-slate-200 p-4">
            <p className="text-sm font-black">Card pool</p>
            <div>
              <p className="mb-1 text-sm font-bold text-slate-500">Games</p>
              <div className="flex gap-2">
                {[["pokemon", "Pokémon"], ["one-piece", "One Piece"]].map(([g, l]) => (
                  <button key={g} type="button" onClick={() => toggleGame(g)}
                    className={"rounded-2xl px-3 py-1.5 text-sm font-extrabold " +
                      (games.includes(g) ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500")}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-bold text-slate-500">Name contains
              <input value={nameLike} onChange={(e) => setNameLike(e.target.value)}
                placeholder="e.g. charizard, mega, ex" className="field mt-1" />
            </label>
            <label className="block text-sm font-bold text-slate-500">Sealed
              <select value={sealed} onChange={(e) => setSealed(e.target.value as "any" | "only" | "exclude")}
                className="field mt-1">
                <option value="any">Singles &amp; sealed</option>
                <option value="exclude">Singles only</option>
                <option value="only">Sealed only</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-500">
              Limit to sets ({setIds.length} selected)
              <select multiple value={setIds.map(String)}
                onChange={(e) => setSetIds(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
                className="field mt-1 h-40">
                {setOptions.map((s) => (
                  <option key={s.group_id} value={s.group_id}>{s.name}</option>
                ))}
              </select>
              <span className="text-xs font-normal text-slate-400">
                ⌘/Ctrl-click to add or remove sets. Leave empty for all sets.
              </span>
            </label>
          </div>

          <p className="rounded-2xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
            Heads up: removing a set or narrowing the pool makes any cards players
            already hold outside the new pool un-sellable. Widen, don&apos;t strand.
          </p>

          <button className="btn-primary w-full" disabled={pending || name.trim().length < 3} onClick={save}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {msg && (
            <p className={"rounded-2xl px-4 py-2 text-sm font-bold " +
              (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
