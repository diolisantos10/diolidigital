import type { Metadata } from "next";
import Link from "next/link";
import { DioliLogo } from "@/components/brand/DioliLogo";
import { ContatoForm } from "./ContatoForm";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a Dioli Digital. Escreva pra gente e responderemos rápido.",
};

export default function ContatoPage() {
  return (
    <div className="mesh-cool flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-5 md:px-8">
          <Link href="/" aria-label="Voltar para a home">
            <DioliLogo variant="full" tone="dark" markSize={32} />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-14 md:py-20">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Contato</p>
        <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-[-0.025em] text-[var(--navy)] md:text-[40px]">
          Fale com a <span className="text-gradient-cool">gente.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Escreva sua mensagem que a gente responde rápido — normalmente em poucas horas úteis.
          Sem compromisso.
        </p>

        <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-lg)] md:p-8">
          <ContatoForm />
        </div>

        <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
          Prefere WhatsApp?{" "}
          <a
            href="https://wa.me/5511989400692?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20Dioli%20Digital."
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--azure)] hover:underline"
          >
            Falar no WhatsApp →
          </a>
        </p>
      </main>
    </div>
  );
}
