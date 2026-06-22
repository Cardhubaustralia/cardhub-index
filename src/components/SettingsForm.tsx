"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/actions";
import { browserClient } from "@/lib/supabase/client";

export default function SettingsForm({
  email,
  username,
  displayName,
  country,
  notifyTrades,
  notifyGeneral,
}: {
  email: string;
  username: string;
  displayName: string;
  country: string;
  notifyTrades: boolean;
  notifyGeneral: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const signOut = async () => {
    const supabase = browserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const resetPassword = async () => {
    const supabase = browserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: "Password reset email sent" }
    );
  };

  return (
    <div className="space-y-4">
      <form
        className="panel space-y-4 p-6"
        action={(fd) =>
          startTransition(async () => {
            const res = await updateProfile(fd);
            setMsg({ ok: res.ok, text: res.message });
            if (res.ok) router.refresh();
          })
        }
      >
        <label className="block text-sm font-bold text-slate-500">
          Email
          <input value={email} disabled className="field mt-1 bg-slate-50 text-slate-400" />
        </label>
        <label className="block text-sm font-bold text-slate-500">
          Username
          <input name="username" defaultValue={username} required className="field mt-1" />
        </label>
        <label className="block text-sm font-bold text-slate-500">
          Display name
          <input name="display_name" defaultValue={displayName} className="field mt-1" />
        </label>
        <label className="block text-sm font-bold text-slate-500">
          Country
          <input name="country" defaultValue={country} placeholder="AU" className="field mt-1" />
        </label>

        <div className="space-y-2 rounded-2xl border-2 border-slate-200 p-4">
          <p className="text-sm font-black">Notifications</p>
          <label className="flex items-center justify-between text-sm font-bold text-slate-600">
            Trade fills &amp; rejections
            <input type="checkbox" name="notify_trades" defaultChecked={notifyTrades} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between text-sm font-bold text-slate-600">
            Game updates (days left, etc.)
            <input type="checkbox" name="notify_general" defaultChecked={notifyGeneral} className="h-4 w-4" />
          </label>
        </div>
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
        <button className="btn-primary w-full" disabled={pending}>
          Save profile
        </button>
      </form>

      <div className="panel flex items-center justify-between p-6">
        <button onClick={resetPassword} className="btn-ghost text-sm">
          Reset password
        </button>
        <button onClick={signOut} className="btn-sell text-sm">
          Sign out
        </button>
      </div>
    </div>
  );
}
