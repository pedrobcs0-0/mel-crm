"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/conversas");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível entrar");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-lg font-bold text-white">M</div>
        <div>
          <h1 className="text-lg font-semibold">Consultório Dra. Mel</h1>
          <p className="text-sm text-zinc-500">Painel de atendimento</p>
        </div>
      </div>
      <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-700">
        Senha de acesso
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-base outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !password}
        className="mt-5 w-full rounded-xl bg-teal-700 py-2.5 font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
      <p className="mt-6 text-center text-xs text-zinc-400">Ambiente de testes · somente dados fictícios</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
