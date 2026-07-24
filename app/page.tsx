import type { Metadata } from "next";
import Link from "next/link";
import { DioliLogo } from "@/components/brand/DioliLogo";

/* ═══════════════════════════════════════════════════════════════════════════
   ⚙️  EDITE AQUI — seus dados de contato (troque os valores entre aspas)
   ─────────────────────────────────────────────────────────────────────────── */
const CONTATO = {
  // Número do WhatsApp com código do país, só dígitos. Ex.: 55 + DDD + número.
  whatsapp: "5511999999999", // ← TROQUE pelo seu número real
  instagram: "https://instagram.com/dioli.digital", // ← confira/ajuste
  email: "contato@dioli.studio", // ← confira/ajuste
};
const WHATS_MSG = "Olá! Vim pelo site da Dioli e quero saber mais sobre os serviços.";
const whatsappUrl = `https://wa.me/${CONTATO.whatsapp}?text=${encodeURIComponent(WHATS_MSG)}`;
/* ═══════════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  title: "Dioli Digital — Agência Digital com IA",
  description:
    "Estratégia humana, execução inteligente. Social media, tráfego pago, identidade visual e vídeo — potencializados por IA para entregar mais rápido.",
  openGraph: {
    title: "Dioli Digital — Agência Digital com IA",
    description: "Estratégia humana. Execução inteligente.",
    type: "website",
    locale: "pt_BR",
  },
};

const SERVICOS = [
  {
    nome: "Social Media",
    desc: "Conteúdo que constrói presença, autoridade e engajamento — planejado com estratégia, não no improviso.",
    itens: ["Planejamento de conteúdo", "Design de posts e stories", "Legendas e roteiros"],
  },
  {
    nome: "Tráfego Pago",
    desc: "Anúncios que trazem clientes de verdade, não só curtidas. Verba otimizada com acompanhamento de resultado.",
    itens: ["Meta e Google Ads", "Segmentação e criativos", "Relatórios de resultado"],
  },
  {
    nome: "Identidade Visual",
    desc: "Uma marca que as pessoas lembram. Do logo à aplicação completa, com consistência em cada detalhe.",
    itens: ["Logo e identidade", "Manual de marca", "Materiais e templates"],
  },
  {
    nome: "Vídeo",
    desc: "Vídeos que param o scroll e comunicam sua mensagem — do roteiro à edição final, prontos para publicar.",
    itens: ["Reels e vídeos curtos", "Edição e legendagem", "Roteiro e direção"],
  },
];

const METODO = [
  {
    n: "01",
    titulo: "Estratégia humana",
    desc: "Começa com gente que entende do seu negócio. Ouvimos, diagnosticamos e desenhamos um plano com objetivo claro.",
  },
  {
    n: "02",
    titulo: "Execução inteligente",
    desc: "Nossos agentes de IA aceleram a produção — mais conteúdo, mais rápido, sem perder o padrão. A tecnologia trabalha, a estratégia comanda.",
  },
  {
    n: "03",
    titulo: "Entrega no prazo",
    desc: "Você acompanha tudo por um portal próprio e aprova cada entrega. Rápido, transparente e sem contratos que prendem.",
  },
];

function WhatsIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.11 1.516 5.844L.037 24l6.334-1.658A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.374l-.36-.214-3.757.984 1.003-3.653-.234-.374A9.818 9.818 0 1112 21.818z" />
    </svg>
  );
}

export default function SitePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070A1F]/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 md:px-8">
          <DioliLogo variant="full" tone="light" markSize={22} className="flex-1 text-[15px]" />
          <a
            href="#servicos"
            className="hidden text-[13px] font-medium text-white/70 transition-colors hover:text-white sm:block"
          >
            Serviços
          </a>
          <Link
            href="/auth/signin"
            className="hidden text-[13px] font-medium text-white/70 transition-colors hover:text-white sm:block"
          >
            Área do cliente
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#9AF5F0] px-4 text-[13px] font-semibold text-[#070A1F] transition-colors hover:bg-[#7DEDE7]"
          >
            <WhatsIcon className="h-4 w-4" />
            Falar agora
          </a>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#070A1F] text-white">
        {/* glow decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #9AF5F0 0%, transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 text-center md:px-8 md:pb-28 md:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-medium text-[#9AF5F0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9AF5F0]" />
            Agência digital com IA
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-[34px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[56px]">
            Estratégia humana.
            <br />
            <span className="text-[#9AF5F0]">Execução inteligente.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/70 md:text-[17px]">
            Social media, tráfego pago, identidade visual e vídeo — potencializados por
            inteligência artificial para entregar mais, com mais rapidez e no seu padrão.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#9AF5F0] px-6 text-[15px] font-semibold text-[#070A1F] transition-colors hover:bg-[#7DEDE7] sm:w-auto"
            >
              <WhatsIcon />
              Falar no WhatsApp
            </a>
            <Link
              href="/briefing"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              Fazer briefing gratuito →
            </Link>
          </div>
          <p className="mt-5 text-[12px] text-white/40">
            Resposta em até 2h úteis · Sem contratos longos
          </p>
        </div>
      </section>

      {/* ── Serviços ───────────────────────────────────────────────────────── */}
      <section id="servicos" className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[26px] font-semibold tracking-[-0.02em] md:text-[34px]">
            O que fazemos
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
            Tudo o que sua marca precisa para crescer no digital, com estratégia por trás de
            cada entrega.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICOS.map((s) => (
            <div
              key={s.nome}
              className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">{s.nome}</h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {s.desc}
              </p>
              <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
                {s.itens.map((i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9AF5F0]" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Método ─────────────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] md:text-[34px]">
              Gente que pensa. IA que executa.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
              A estratégia é humana; a produção é acelerada por inteligência artificial. Você
              ganha em qualidade e em velocidade — sem escolher entre os dois.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {METODO.map((m) => (
              <div key={m.n}>
                <div className="font-display text-[28px] font-bold text-[#9AF5F0]">{m.n}</div>
                <h3 className="mt-2 text-[18px] font-semibold text-[var(--text-primary)]">
                  {m.titulo}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Prova social (placeholder — troque pelos seus depoimentos) ─────── */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Quem confia na Dioli
          </p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] md:text-[30px]">
            Resultados que falam por si
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { q: "Espaço reservado para um depoimento real de cliente. Troque este texto por uma frase verdadeira e marcante.", a: "Nome do cliente", r: "Empresa" },
            { q: "Outro depoimento aqui. Depoimentos verdadeiros são a forma mais rápida de gerar confiança em quem chega pela primeira vez.", a: "Nome do cliente", r: "Empresa" },
            { q: "Mais um espaço para prova social. Se ainda não tem depoimentos, use um resultado concreto (ex.: '+120% de alcance em 3 meses').", a: "Nome do cliente", r: "Empresa" },
          ].map((t, i) => (
            <figure key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <blockquote className="text-[14px] leading-relaxed text-[var(--text-primary)]">
                “{t.q}”
              </blockquote>
              <figcaption className="mt-4 text-[12.5px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{t.a}</span> · {t.r}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── CTA final ──────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#070A1F] px-6 py-14 text-center text-white md:px-12 md:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{ background: "radial-gradient(circle, #9AF5F0 0%, transparent 70%)" }}
          />
          <h2 className="relative text-balance text-[26px] font-semibold tracking-[-0.02em] md:text-[38px]">
            Vamos tirar sua marca do improviso?
          </h2>
          <p className="relative mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-white/70">
            Conte o que você precisa. A gente responde rápido, com um plano claro e sem
            enrolação.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#9AF5F0] px-6 text-[15px] font-semibold text-[#070A1F] transition-colors hover:bg-[#7DEDE7] sm:w-auto"
            >
              <WhatsIcon />
              Falar no WhatsApp
            </a>
            <Link
              href="/briefing"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              Fazer briefing gratuito →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <DioliLogo variant="full" tone="dark" markSize={22} className="text-[15px]" />
            <p className="mt-2 max-w-xs text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              Estratégia humana, execução inteligente. Agência digital movida a IA.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-[13px] md:items-end">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              WhatsApp
            </a>
            <a href={CONTATO.instagram} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Instagram
            </a>
            <a href={`mailto:${CONTATO.email}`} className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              {CONTATO.email}
            </a>
            <Link href="/vitrine" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Serviços avulsos →
            </Link>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-5 text-center text-[11px] text-[var(--text-muted)] md:px-8">
          © {new Date().getFullYear()} Dioli Digital · Todos os direitos reservados
        </div>
      </footer>
    </div>
  );
}
