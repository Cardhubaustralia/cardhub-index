"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = browserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push(params.get("next") ?? "/portfolio");
    router.refresh();
  };

  const keepInView = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-24 pt-10">
      <form onSubmit={submit} className="panel space-y-4 p-8">
        <h1 className="text-2xl font-black">Welcome back</h1>
        <input
          type="email" required placeholder="Email" className="field" onFocus={keepInView}
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" required placeholder="Password" className="field" onFocus={keepInView}
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm font-bold text-slate-500">
          New here?{" "}
          <Link href="/signup" className="text-blue-600 underline">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
