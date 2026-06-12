"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLeague, joinLeague } from "@/lib/actions";

export default function LeagueForms() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <form
        className="panel space-y-3 p-5"
        action={(fd) =>
          startTransition(async () => {
            const res = await createLeague(fd);
            setMsg({ ok: res.ok, text: res.message });
            if (res.ok) router.refresh();
          })
        }
      >
        <h3 className="font-black">Create a league</h3>
        <input name="name" required minLength={3} placeholder="League name" className="field" />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-slate-500">
            Starting cash
            <input
              name="starting_cash" type="number" defaultValue={10000}
              min={100} step={100} className="field mt-1"
            />
          </label>
          <label className="text-sm font-bold text-slate-500">
            Max % per card
            <input
              name="max_position_pct" type="number" defaultValue={25}
              min={1} max={100} className="field mt-1"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" name="is_public" className="h-4 w-4" />
          Anyone can find and join (public)
        </label>
        <button className="btn-primary w-full" disabled={pending}>
          Create league
        </button>
      </form>

      <form
        className="panel space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await joinLeague(code);
            setMsg({ ok: res.ok, text: res.message });
            if (res.ok) router.refresh();
          });
        }}
      >
        <h3 className="font-black">Join with invite code</h3>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. 7F2K9A"
          className="field uppercase tracking-widest"
          maxLength={6}
        />
        <button className="btn-primary w-full" disabled={pending || code.length < 6}>
          Join league
        </button>
        {msg && (
          <p
            className={
              "rounded-2xl px-4 py-2 text-sm font-bold " +
              (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")
            }
          >
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}
