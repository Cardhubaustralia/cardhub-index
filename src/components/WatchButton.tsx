"use client";
import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toggleWatch } from "@/lib/actions";

export default function WatchButton({
  assetId, initialWatching, signedIn,
}: {
  assetId: number; initialWatching: boolean; signedIn: boolean;
}) {
  const [watching, setWatching] = useState(initialWatching);
  const [pending, start] = useTransition();
  if (!signedIn) return null;
  return (
    <button
      onClick={() => start(async () => {
        const res = await toggleWatch(assetId, watching);
        if (res.ok) setWatching((w) => !w);
      })}
      disabled={pending}
      className={
        "inline-flex items-center gap-1.5 rounded-2xl border-2 px-3 py-1.5 text-sm font-extrabold transition " +
        (watching
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
      }
    >
      {watching ? <Eye size={15} /> : <EyeOff size={15} />}
      {watching ? "Watching" : "Watch"}
    </button>
  );
}
