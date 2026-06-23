"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
    <div className="min-h-screen bg-[#F7F7F6] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="flex items-center gap-1.5">
            <svg width="38" height="26" viewBox="0 0 38 26" fill="none">
              <circle cx="13" cy="13" r="12" stroke="#070A1F" strokeWidth="2.2"/>
              <circle cx="29" cy="13" r="7.5" fill="#9AF5F0" fillOpacity="0.25" stroke="#070A1F" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <span className="text-[18px] font-bold text-[#070A1F] tracking-[-0.02em]">Dioli</span>
            <span className="text-[11px] font-semibold text-[#070A1F]/50 ml-1.5 tracking-[0.12em] uppercase">Digital</span>
          </div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E5E5E2] shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-8">
          <h1 className="text-[18px] font-semibold text-[#1A1A1A] mb-1">Entrar</h1>
          <p className="text-[13px] text-[#9B9B95] mb-6">Acesse o painel da agência</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[12px] font-semibold text-[#6B6B65] mb-1.5">
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
                className="w-full border border-[#E8E8E4] rounded-[8px] px-3 py-2.5 text-[13px] text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#9AF5F0]/40 placeholder:text-[#C0C0BA]"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[12px] font-semibold text-[#6B6B65] mb-1.5">
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
                className="w-full border border-[#E8E8E4] rounded-[8px] px-3 py-2.5 text-[13px] text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#9AF5F0]/40 placeholder:text-[#C0C0BA]"
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
