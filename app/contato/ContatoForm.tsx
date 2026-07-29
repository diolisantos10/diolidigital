"use client";

import { useState } from "react";

// Envia a mensagem por e-mail para a Dioli via FormSubmit (sem expor o e-mail na
// tela e sem precisar de backend). Troque o destino se mudarem o e-mail.
const DESTINO = "agenciadioli@gmail.com";
const ENDPOINT = `https://formsubmit.co/ajax/${DESTINO}`;

type Estado = "idle" | "enviando" | "ok" | "erro";

export function ContatoForm() {
  const [estado, setEstado] = useState<Estado>("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setEstado("enviando");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          nome: data.get("nome"),
          email: data.get("email"),
          mensagem: data.get("mensagem"),
          _subject: "Novo contato pelo site — Dioli Digital",
          _template: "table",
          _captcha: "false",
        }),
      });
      if (res.ok) {
        setEstado("ok");
        form.reset();
      } else {
        setEstado("erro");
      }
    } catch {
      setEstado("erro");
    }
  }

  if (estado === "ok") {
    return (
      <div className="rounded-2xl border border-[var(--cyan)]/40 bg-[var(--cyan)]/10 p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--cyan)]/30 text-[#0E7C74]">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-[var(--navy)]">Mensagem enviada! 🎉</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
          Obrigado pelo contato. A gente responde rápido — normalmente em poucas horas úteis.
        </p>
        <button
          onClick={() => setEstado("idle")}
          className="mt-6 text-[14px] font-semibold text-[var(--azure)] hover:underline"
        >
          Enviar outra mensagem
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="nome" className="mb-1.5 block text-[13px] font-semibold text-[var(--navy)]">Seu nome</label>
        <input
          id="nome" name="nome" type="text" required placeholder="Como podemos te chamar?"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--azure)]/40"
        />
      </div>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-[var(--navy)]">Seu e-mail</label>
        <input
          id="email" name="email" type="email" required placeholder="seu@email.com"
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--azure)]/40"
        />
      </div>
      <div>
        <label htmlFor="mensagem" className="mb-1.5 block text-[13px] font-semibold text-[var(--navy)]">Sua mensagem</label>
        <textarea
          id="mensagem" name="mensagem" required rows={5} placeholder="Conta pra gente o que você precisa…"
          className="w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--azure)]/40"
        />
      </div>
      {estado === "erro" && (
        <p className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-[13px] text-[var(--danger)]">
          Ops, não deu pra enviar agora. Tenta de novo ou fala com a gente no WhatsApp.
        </p>
      )}
      <button
        type="submit"
        disabled={estado === "enviando"}
        style={{ backgroundColor: "#070A1F", color: "#FFFFFF" }}
        className="inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold shadow-[var(--shadow-md)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando…" : "Enviar mensagem"}
      </button>
    </form>
  );
}
