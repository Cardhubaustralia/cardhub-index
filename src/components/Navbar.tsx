import Link from "next/link";
import { TrendingUp, Trophy, Users, Briefcase, Settings, LogIn } from "lucide-react";
import GlobalSearch from "@/components/GlobalSearch";

export default function Navbar({ username }: { username: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-500 text-lg font-black text-white shadow-[0_3px_0_0_#1d4ed8]">
            C
          </span>
          <span className="text-lg font-black tracking-tight">
            CardHub <span className="text-blue-500">Index</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-bold text-slate-600 sm:flex">
          <Link href="/market" className="rounded-xl px-3 py-2 hover:bg-slate-100">
            <span className="flex items-center gap-1.5"><TrendingUp size={16} /> Market</span>
          </Link>
          <Link href="/portfolio" className="rounded-xl px-3 py-2 hover:bg-slate-100">
            <span className="flex items-center gap-1.5"><Briefcase size={16} /> Portfolio</span>
          </Link>
          <Link href="/leagues" className="rounded-xl px-3 py-2 hover:bg-slate-100">
            <span className="flex items-center gap-1.5"><Users size={16} /> Leagues</span>
          </Link>
          <Link href="/leaderboard" className="rounded-xl px-3 py-2 hover:bg-slate-100">
            <span className="flex items-center gap-1.5"><Trophy size={16} /> Leaderboard</span>
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />
          {username ? (
            <Link href="/settings" className="btn-ghost text-sm">
              <Settings size={15} /> {username}
            </Link>
          ) : (
            <Link href="/login" className="btn-primary text-sm">
              <LogIn size={15} /> Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
