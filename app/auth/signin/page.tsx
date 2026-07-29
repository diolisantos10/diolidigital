"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DioliLogo } from "@/components/brand/DioliLogo";

function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const email = emailRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      const data: { ok?: boolean; error?: string } = await res.json();

      if (res.ok && data.ok) {
        const callback = searchParams.get("callbackUrl") ?? "";
        const dest =
          callback.startsWith("/agency/") ? callback : "/agency/dashboard";
        // Hard navigation ensures the browser picks up the new session cookie.
        window.location.replace(dest);
        return;
      }

      setError(data.error ?? "Erro ao entrar. Tente novamente.");
    } catch {
      setError("Erro de rede. Verifique sua conexão.");
    }

    setPending(false);
  }

  return (
    <div className="min-h-screen bg-[#070A1F] flex items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <DioliLogo variant="full" tone="light" markSize={28} className="text-[15px]" />
        </div>

        <div className="bg-white rounded-[14px] border border-[var(--border)] shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-8">
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)] mb-1">Entrar</h1>
          <p className="text-[13px] text-[var(--text-muted)] mb-6">Acesse o painel da agência</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">
                E-mail
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="seu@email.com"
                className="w-full border border-[var(--border)] rounded-[8px] px-3 py-2.5 text-[13px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[#9AF5F0]/40 placeholder:text-[var(--text-subtle)]"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">
                Senha
              </label>
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full border border-[var(--border)] rounded-[8px] px-3 py-2.5 text-[13px] text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[#9AF5F0]/40 placeholder:text-[var(--text-subtle)]"
              />
            </div>

            {error && (
              <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-[7px] px-3 py-2">
                <p className="text-[12px] text-[#DC2626]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-[#070A1F] text-white rounded-[8px] py-2.5 text-[13px] font-semibold hover:bg-[#0D1230] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
