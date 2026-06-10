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

  function fillDemo() {
    if (emailRef.current) emailRef.current.value = "master@dioli.studio";
    if (passwordRef.current) passwordRef.current.value = "dioli2025";
    setError(null);
  }

  return (
    <div className="min-h-screen bg-[#F7F7F6] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-8 h-8 rounded-[8px] bg-[#5B5BD6] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="white"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="white" fillOpacity="0.6"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="white"/>
            </svg>
          </div>
          <span className="text-[18px] font-semibold text-[#1A1A1A]">Dioli Agency OS</span>
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
                placeholder="master@dioli.studio"
                className="w-full border border-[#E8E8E4] rounded-[8px] px-3 py-2.5 text-[13px] text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30 placeholder:text-[#C0C0BA]"
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
                className="w-full border border-[#E8E8E4] rounded-[8px] px-3 py-2.5 text-[13px] text-[#1A1A1A] bg-white focus:outline-none focus:ring-2 focus:ring-[#5B5BD6]/30 placeholder:text-[#C0C0BA]"
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
              className="w-full bg-[#5B5BD6] text-white rounded-[8px] py-2.5 text-[13px] font-semibold hover:bg-[#4A4AC0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 pt-5 border-t border-[#F0F0ED]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[#9B9B95] mb-0.5">Credenciais de demonstração</p>
                <p className="text-[11px] text-[#6B6B65]">
                  <span className="font-mono">master@dioli.studio</span>
                  <span className="text-[#C0C0BA] mx-1">/</span>
                  <span className="font-mono">dioli2025</span>
                </p>
              </div>
              <button
                type="button"
                onClick={fillDemo}
                className="text-[11px] font-medium text-[#5B5BD6] hover:text-[#4A4AC0] transition-colors px-2 py-1 rounded-[5px] hover:bg-[#EEF0FF]"
              >
                Preencher
              </button>
            </div>
          </div>
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
