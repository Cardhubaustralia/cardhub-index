"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinLeague } from "@/lib/actions";

export default function JoinGame() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="panel space-y-3 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await joinLeague(code);
          setMsg({ ok: res.ok, text: res.message });
          if (res.ok) router.refresh();
        });
      }}
    >
      <h3 className="font-black">Join with an invite code</h3>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. 7F2K9A"
        maxLength={6}
        className="field uppercase tracking-widest"
      />
      <button className="btn-primary w-full" disabled={pending || code.length < 6}>Join game</button>
      {msg && (
        <p className={"rounded-2xl px-4 py-2 text-sm font-bold " +
          (msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
