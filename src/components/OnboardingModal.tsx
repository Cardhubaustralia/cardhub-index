"use client";
// Welcome carousel shown to new players once (after first sign-in).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markOnboarded } from "@/lib/actions";
import {
  Sparkles, Clock, ShoppingCart, Briefcase, Trophy, UserCog, X, ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: Sparkles, accent: "bg-yellow-100 text-yellow-700",
    title: "Welcome to CardHub Index",
    body: "You've got $10,000 in virtual cash in the Global League. Buy and sell real Pokémon and One Piece cards — fake money, real market prices.",
  },
  {
    icon: Clock, accent: "bg-blue-100 text-blue-700",
    title: "Lock in, then trade",
    body: "Prices update three times a day. Place buy and sell orders during the open window — they lock 30 minutes before each update and execute at the fresh price. Watch the countdown up top.",
  },
  {
    icon: ShoppingCart, accent: "bg-emerald-100 text-emerald-700",
    title: "Trade the market",
    body: "Browse singles and sealed across both games, sorted by movers, popularity or set. Find a card, pick a quantity, and queue your order.",
  },
  {
    icon: Briefcase, accent: "bg-violet-100 text-violet-700",
    title: "Track your portfolio",
    body: "Watch your holdings, cash, profit and full transaction history update every cycle. Charts show how your value moves over time.",
  },
  {
    icon: Trophy, accent: "bg-amber-100 text-amber-700",
    title: "Climb the leaderboard",
    body: "Compete in the Global League or spin up a private league with friends using an invite code. Highest portfolio value wins the season.",
  },
  {
    icon: UserCog, accent: "bg-rose-100 text-rose-700",
    title: "Make it yours",
    body: "Set the display name that appears on leaderboards in Settings. Then go find your first card!",
  },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!open) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const Icon = step.icon;

  const finish = () => {
    setOpen(false);
    startTransition(async () => {
      await markOnboarded();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="panel relative w-full max-w-md overflow-hidden p-0">
        <button
          onClick={finish}
          className="absolute right-4 top-4 z-10 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center gap-4 px-8 pb-6 pt-10 text-center">
          <span className={`grid h-16 w-16 place-items-center rounded-3xl ${step.accent}`}>
            <Icon size={30} />
          </span>
          <h2 className="text-2xl font-black">{step.title}</h2>
          <p className="font-semibold text-slate-500">{step.body}</p>
        </div>

        <div className="flex items-center justify-center gap-2 pb-5">
          {STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={
                "h-2 rounded-full transition-all " +
                (idx === i ? "w-6 bg-blue-500" : "w-2 bg-slate-200 hover:bg-slate-300")
              }
              aria-label={`Step ${idx + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={finish}
            className="text-sm font-bold text-slate-400 hover:text-slate-600"
            disabled={pending}
          >
            Skip
          </button>
          {last ? (
            <button className="btn-primary" onClick={finish} disabled={pending}>
              Start trading <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setI((n) => n + 1)}>
              Next <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
