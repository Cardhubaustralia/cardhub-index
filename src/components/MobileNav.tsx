"use client";
// Bottom tab bar for mobile (hidden on >=sm). App-style navigation.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, Briefcase, Users, Trophy, User } from "lucide-react";

const TABS = [
  { href: "/market", label: "Market", Icon: TrendingUp },
  { href: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { href: "/leagues", label: "Games", Icon: Users },
  { href: "/leaderboard", label: "Ranks", Icon: Trophy },
  { href: "/profile", label: "You", Icon: User },
];

export default function MobileNav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-6xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          const dest = !signedIn && (href === "/portfolio" || href === "/profile") ? "/login" : href;
          return (
            <Link
              key={href}
              href={dest}
              className={
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-extrabold " +
                (active ? "text-blue-600" : "text-slate-400")
              }
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
