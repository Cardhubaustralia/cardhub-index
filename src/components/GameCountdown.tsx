"use client";
import { useEffect, useState } from "react";
import { Clock, Flag } from "lucide-react";

function fmt(ms: number) {
  if (ms <= 0) return "0m";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function GameCountdown({
  startsAt, endsAt, status, isGlobal,
}: {
  startsAt: string; endsAt: string | null; status: string; isGlobal?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700">
        <Clock size={14} /> Starts in {fmt(new Date(startsAt).getTime() - now)}
      </span>
    );
  }
  if (status === "ended") {
    return <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400"><Flag size={14} /> Ended</span>;
  }
  if (isGlobal || !endsAt) {
    return <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600"><Clock size={14} /> Ongoing</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
      <Clock size={14} /> {fmt(new Date(endsAt).getTime() - now)} left
    </span>
  );
}
