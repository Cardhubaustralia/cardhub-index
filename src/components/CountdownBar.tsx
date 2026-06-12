"use client";
// Live countdown: shows trading-open time remaining, then the lockout phase.
import { useEffect, useState } from "react";
import { Lock, Zap, Hourglass } from "lucide-react";

function fmt(ms: number) {
  if (ms <= 0) return "0:00";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function CountdownBar({
  locksAt,
  executesAt,
}: {
  locksAt: string;
  executesAt: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lockMs = new Date(locksAt).getTime() - now;
  const execMs = new Date(executesAt).getTime() - now;

  let phase: "open" | "locked" | "executing";
  if (lockMs > 0) phase = "open";
  else if (execMs > 0) phase = "locked";
  else phase = "executing";

  return (
    <div
      className={
        "border-b text-sm font-extrabold " +
        (phase === "open"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : phase === "locked"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-800")
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2">
        {phase === "open" && (
          <>
            <Hourglass size={15} />
            Trading open — orders lock in {fmt(lockMs)}
            <span className="hidden text-emerald-600/70 sm:inline">
              · trades execute in {fmt(execMs)}
            </span>
          </>
        )}
        {phase === "locked" && (
          <>
            <Lock size={15} />
            Orders locked — prices update &amp; trades execute in {fmt(execMs)}
          </>
        )}
        {phase === "executing" && (
          <>
            <Zap size={15} />
            Executing trades… new window opens shortly
          </>
        )}
      </div>
    </div>
  );
}
