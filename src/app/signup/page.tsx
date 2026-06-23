"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setLoading(false);
      return setError("Username must be 3-20 letters, numbers, or underscores");
    }
    const supabase = browserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) return setError(error.message);
    // If email confirmation is OFF, Supabase returns a session and the user
    // is already signed in — go straight into the app. Otherwise show the
    // "check your email" screen.
    if (data.session) {
      router.push("/portfolio");
      router.refresh();
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <div className="panel space-y-3 p-8 text-center">
          <h1 className="text-2xl font-black">Check your email 📬</h1>
          <p className="font-bold text-slate-500">
            We sent a confirmation link to <span className="text-slate-800">{email}</span>.
            Click it, then sign in — your $10,000 is waiting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <form onSubmit={submit} className="panel space-y-4 p-8">
        <h1 className="text-2xl font-black">Join CardHub Index</h1>
        <p className="-mt-2 text-sm font-bold text-slate-500">
          Start with $10,000 of virtual cash and trade real card prices.
        </p>
        <input
          required placeholder="Username" className="field"
          value={username} onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="email" required placeholder="Email" className="field"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" required minLength={8} placeholder="Password (8+ characters)"
          className="field" value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-sm font-bold text-slate-500">
          Already playing?{" "}
          <Link href="/login" className="text-blue-600 underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
