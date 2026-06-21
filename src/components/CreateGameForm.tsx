"use client";
// Create a custom game: name, join policy, cash, duration, and a card
// universe (all / by game / preset / sets / rarity / name).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGame, UniverseRules } from "@/lib/actions";

export interface SetLite { slug: string; name: string; group_id: number; game_slug: string }

const PRESETS: { key: string; label: string; build: (r: UniverseRules) => UniverseRules }[] = [
  { key: "all", label: "All cards", build: () => ({}) },
  { key: "pikachu", label: "Pikachu only", build: () => ({ name_like: "pikachu" }) },
  { key: "mega", label: "Mega Evolutions", build: () => ({ name_like: "mega" }) },
  { key: "charizard", label: "Charizard only", build: () => ({ name_like: "charizard" }) },
  { key: "sealed", label: "Sealed only", build: () => ({ sealed: "only" }) },
  { key: "custom", label: "Custom…", build: (r) => r },
];

export default function CreateGameForm({ sets }: { sets: SetLite[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [name, setName] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "invite">("open");
  const [cash, setCash] = useState(10000);
  const [maxPct, setMaxPct] = useState(25);
  const [duration, setDuration] = useState(80);
  const [preset, setPreset] = useState("all");

  // custom universe
  const [games, setGames] = useState<string[]>(["pokemon", "one-piece"]);
  const [nameLike, setNameLike] = useState("");
  const [sealed, setSealed] = useState<"any" | "only" | "exclude">("any");
  const [setIds, setSetIds] = useState<number[]>([]);

  const setOptions = useMemo(
    () => sets.filter((s) => games.length === 0 || games.includes(s.game_slug)),
    [sets, games]
  );

  const buildUniverse = (): UniverseRules => {
    if (preset !== "custom") return PRESETS.find((p) => p.key === preset)!.build({});
    const u: UniverseRules = {};
    if (games.length && games.length < 2) u.games = games;
    if (nameLike.trim()) u.name_like = nameLike.trim();
    if (setIds.length) u.set_ids = setIds;
    if (sealed !== "any") u.sealed = sealed;
    return u;
  };

  const submit = () => {
    setMsg(null);
    start(async () => {
      const res = await createGame({
        name, joinPolicy, startingCash: cash, maxPositionPct: maxPct,
        durationDays: duration, universe: buildUniverse(),
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.leagueId) router.push(`/leagues/${res.leagueId}`);
    });
  };

  const toggleGame = (g: string) =>
    setGames((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  return (
    <div className="panel space-y-4 p-6">
      <h3 className="text-lg font-black">Create a game</h3>

      <input value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Game name" className="field" minLength={3} />

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-bold text-slate-500">Starting cash
          <input type="number" value={cash} min={100} step={100}
            onChange={(e) => setCash(Number(e.target.value))} className="field mt-1" />
        </label>
        <label className="text-sm font-bold text-slate-500">Duration (days)
          <input type="number" value={duration} min={1} max={730}
            onChange={(e) => setDuration(Number(e.target.value))} className="field mt-1" />
        </label>
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
      </div>

      <div>
        <p className="mb-1 text-sm font-bold text-slate-500">Card pool</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)} type="button"
              className={"rounded-2xl px-3 py-1.5 text-sm font-extrabold " +
                (preset === p.key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="space-y-3 rounded-2xl border-2 border-slate-200 p-4">
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
            <select value={sealed} onChange={(e) => setSealed(e.target.value as "any"|"only"|"exclude")}
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
            <span className="text-xs font-normal text-slate-400">⌘/Ctrl-click to pick multiple. Leave empty for all sets.</span>
          </label>
        </div>
      )}

      <button className="btn-primary w-full" disabled={pending || name.trim().length < 3} onClick={submit}>
        Create game
      </button>
      {msg && (
        <p className={"rounded-2xl px-4 py-2 text-sm font-bold " +
          (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
