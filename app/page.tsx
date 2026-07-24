import type { Metadata } from "next";
import Link from "next/link";
import { DioliLogo } from "@/components/brand/DioliLogo";
import { OrbitMotif } from "@/components/brand/OrbitMotif";

/* ═══════════════════════════════════════════════════════════════════════════
   ⚙️  EDITE AQUI — seus dados de contato (troque os valores entre aspas)
   ─────────────────────────────────────────────────────────────────────────── */
const CONTATO = {
  // WhatsApp com código do país, só dígitos. Ex.: 55 + DDD + número.
  whatsapp: "5511999999999", // ← TROQUE pelo seu número real
  instagram: "https://instagram.com/dioli.digital", // ← confira/ajuste
  email: "contato@dioli.studio", // ← confira/ajuste
};
const WHATS_MSG = "Olá! Vim pelo site da Dioli Digital e quero saber mais sobre os serviços.";
const whatsappUrl = `https://wa.me/${CONTATO.whatsapp}?text=${encodeURIComponent(WHATS_MSG)}`;
/* ═══════════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  title: "Dioli Digital — Estúdio digital com IA",
  description:
    "Estratégia humana. Execução inteligente. Estúdio digital com IA que combina estratégia, marketing, automação e tecnologia para criar marcas, sistemas e operações digitais mais inteligentes.",
  openGraph: {
    title: "Dioli Digital — Estúdio digital com IA",
    description: "Estratégia humana. Execução inteligente.",
    type: "website",
    locale: "pt_BR",
  },
};

/* ── Ícones de linha (minimalistas — brand book: "linhas finas e ícones minimalistas") */
type IconProps = { className?: string };
const Icon = {
  target: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  pen: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 6.5l3 3" />
    </svg>
  ),
  trend: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 15l5-5 3 3 6-7" /><path d="M18 6h3v3" />
    </svg>
  ),
  spark: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
  layers: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M9 20h6M12 15v5" />
    </svg>
  ),
  check: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  x: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  whats: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.11 1.516 5.844L.037 24l6.334-1.658A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.374l-.36-.214-3.757.984 1.003-3.653-.234-.374A9.818 9.818 0 1112 21.818z" />
    </svg>
  ),
};

/* ── Conteúdo — copy oficial do Brand Book Dioli Digital v1 ─────────────────── */
const PILARES = [
  {
    n: "01",
    icon: Icon.target,
    nome: "Estratégia Digital",
    desc: "Entender o negócio e criar um plano para crescer.",
    itens: ["Diagnóstico e imersão", "Planejamento estratégico", "Roadmap de crescimento"],
  },
  {
    n: "02",
    icon: Icon.pen,
    nome: "Branding & Conteúdo",
    desc: "Deixar a marca mais profissional e criar conteúdos melhores.",
    itens: ["Identidade visual e branding", "Produção de conteúdo", "Gestão de redes sociais"],
  },
  {
    n: "03",
    icon: Icon.trend,
    nome: "Growth & Performance",
    desc: "Atrair mais clientes e vender mais.",
    itens: ["Tráfego pago e orgânico", "Otimização de conversão (CRO)", "Análise de dados e métricas"],
  },
  {
    n: "04",
    icon: Icon.spark,
    nome: "Automação & IA",
    desc: "Automatizar tarefas, atendimento e processos.",
    itens: ["Chatbots e atendimento 24/7", "Automação de processos (RPA)", "Integrações com IA"],
  },
  {
    n: "05",
    icon: Icon.layers,
    nome: "Sistemas & Plataformas",
    desc: "Criar sites, páginas, aplicativos e ferramentas digitais.",
    itens: ["Desenvolvimento de sites", "Landing pages e e-commerces", "Aplicativos e sistemas web"],
  },
];

const JORNADA = [
  { etapa: "Clareza", precisa: "Entender onde está e por onde começar.", entrega: "Estratégia, diagnóstico e plano de ação." },
  { etapa: "Presença", precisa: "Se apresentar melhor.", entrega: "Branding, identidade, conteúdo e comunicação." },
  { etapa: "Demanda", precisa: "Atrair mais pessoas e vender melhor.", entrega: "Campanhas, anúncios, funis e conversão." },
  { etapa: "Eficiência", precisa: "Reduzir tarefas manuais.", entrega: "Automações, IA e fluxos digitais." },
  { etapa: "Escala", precisa: "Estruturar melhor a operação.", entrega: "Sites, sistemas, dashboards, apps e plataformas." },
];

const E = [
  "Estratégica e humana",
  "Guiada por dados e inteligência",
  "Focada em resultados reais",
  "Parceira de crescimento",
  "Criativa com propósito",
  "Clara, ágil e transparente",
];
const NAO_E = [
  "Apenas uma agência criativa",
  "Mais uma empresa de automação",
  "Focada só em ferramentas",
  "Genérica ou padronizada",
  "Promessa vazia ou superficial",
  "Complexa ou burocrática",
];

/* ── Botões reutilizáveis (primário = navy, conforme brand book) ───────────── */
const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--navy)] px-6 text-[15px] font-semibold text-white shadow-[var(--shadow-md)] transition-transform hover:-translate-y-0.5";
const btnGhostDark =
  "inline-flex h-12 items-center justify-center rounded-xl border border-white/25 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10";
const btnGhostLight =
  "inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] px-6 text-[15px] font-semibold text-[var(--navy)] transition-colors hover:bg-[var(--accent)]";

export default function SitePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 md:px-8">
          <DioliLogo variant="full" tone="dark" markSize={26} className="flex-1 text-[16px]" />
          <a href="#servicos" className="hidden text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)] sm:block">
            Serviços
          </a>
          <a href="#jornada" className="hidden text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)] md:block">
            Como funciona
          </a>
          <Link href="/auth/signin" className="hidden text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)] sm:block">
            Área do cliente
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--navy)] px-4 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            <Icon.whats className="h-4 w-4" />
            Falar agora
          </a>
        </nav>
      </header>

      {/* ── Hero (claro — brand book: evitar fundo sempre escuro) ──────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        {/* órbita decorativa */}
        <OrbitMotif
          id="hero"
          className="pointer-events-none absolute right-[-8%] top-1/2 hidden w-[640px] -translate-y-1/2 text-[var(--navy)] opacity-90 lg:block"
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--azure)]" />
              Estúdio digital com IA
            </span>
            <h1 className="mt-6 text-balance text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--navy)] md:text-[64px]">
              Estratégia humana.
              <br />
              <span className="text-[var(--azure)]">Execução inteligente.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--text-secondary)] md:text-[18px]">
              Combinamos estratégia humana, marketing, automação e tecnologia para criar
              marcas, sistemas e operações digitais mais inteligentes. Menos confusão, mais
              direção.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                <Icon.whats className="h-[18px] w-[18px]" />
                Falar no WhatsApp
              </a>
              <Link href="/briefing" className={btnGhostLight}>
                Fazer briefing gratuito →
              </Link>
            </div>
            <p className="mt-6 text-[13px] font-medium text-[var(--text-muted)]">
              Clareza para decidir. Dados para crescer. · Resposta em até 2h úteis
            </p>
          </div>
        </div>
      </section>

      {/* ── Essência / ideia central (escuro — equilíbrio claro/escuro) ───────── */}
      <section className="relative overflow-hidden bg-[var(--navy)] text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--cyan)]">
                Nossa ideia central
              </p>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-[38px]">
                Estratégia humana <span className="text-[var(--cyan)]">+</span> execução
                inteligente <span className="text-[var(--cyan)]">=</span> resultados que
                importam.
              </h2>
              <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-white/70">
                Acreditamos que tecnologia sem estratégia é ruído — e criatividade sem dados é
                intuição. Existimos para conectar o que importa: pessoas, tecnologia e
                propósito.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                "Mais clareza nas decisões",
                "Mais eficiência nas operações",
                "Mais presença no digital",
                "Mais crescimento com propósito",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--cyan)]/15 text-[var(--cyan)]">
                    <Icon.check className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-medium text-white/90">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Serviços — 5 pilares ───────────────────────────────────────────────── */}
      <section id="servicos" className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Arquitetura de serviços
          </p>
          <h2 className="mt-3 text-[28px] font-bold tracking-[-0.02em] text-[var(--navy)] md:text-[40px]">
            5 pilares para gerar confiança e crescimento real.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
            Cada pilar combina estratégia humana com tecnologia inteligente para transformar
            negócios em marcas fortes, processos eficientes e resultados consistentes.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILARES.map((s) => {
            const IconEl = s.icon;
            return (
              <div
                key={s.nome}
                className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)]"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)] text-[var(--navy)]">
                    <IconEl className="h-[22px] w-[22px]" />
                  </span>
                  <span className="font-display text-[15px] font-bold text-[var(--text-subtle)]">{s.n}</span>
                </div>
                <h3 className="mt-5 text-[18px] font-semibold text-[var(--navy)]">{s.nome}</h3>
                <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {s.desc}
                </p>
                <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
                  {s.itens.map((i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px] text-[var(--text-secondary)]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--azure)]" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {/* card-CTA ocupa o 6º espaço da grade */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--navy)] bg-[var(--navy)] p-6 text-white">
            <div>
              <h3 className="text-[18px] font-semibold">Não sabe por onde começar?</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/70">
                Faça um briefing gratuito. A gente te devolve um plano claro, sem jargão e sem
                compromisso.
              </p>
            </div>
            <Link
              href="/briefing"
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--cyan)] px-5 text-[14px] font-semibold text-[var(--navy)] transition-transform hover:-translate-y-0.5"
            >
              Começar briefing →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Jornada do cliente ─────────────────────────────────────────────────── */}
      <section id="jornada" className="border-y border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="max-w-2xl">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Jornada do cliente
            </p>
            <h2 className="mt-3 text-[28px] font-bold tracking-[-0.02em] text-[var(--navy)] md:text-[40px]">
              Da clareza à escala.
            </h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
              Uma jornada guiada por estratégia, tecnologia e execução inteligente para gerar
              crescimento real — no seu ritmo.
            </p>
          </div>
          <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {JORNADA.map((j, idx) => (
              <li
                key={j.etapa}
                className="relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--navy)] text-[13px] font-bold text-white">
                  {idx + 1}
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-[var(--navy)]">{j.etapa}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-secondary)]">Você precisa:</span> {j.precisa}
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--azure)]">A Dioli entrega:</span> {j.entrega}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── O que a Dioli é / não é ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--navy)] md:text-[38px]">
            Clara por dentro e por fora.
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
            A Dioli deve parecer sofisticada porque é clara, não porque é difícil de entender.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--navy)]">
              O que a Dioli é
            </p>
            <ul className="mt-5 space-y-3.5">
              {E.map((t) => (
                <li key={t} className="flex items-center gap-3 text-[14.5px] text-[var(--text-primary)]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--cyan)]/25 text-[#0E7C74]">
                    <Icon.check className="h-3.5 w-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-7">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              O que a Dioli não é
            </p>
            <ul className="mt-5 space-y-3.5">
              {NAO_E.map((t) => (
                <li key={t} className="flex items-center gap-3 text-[14.5px] text-[var(--text-muted)]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--text-muted)]">
                    <Icon.x className="h-3.5 w-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── CTA final (escuro + órbita) ─────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[var(--navy)] px-6 py-16 text-white md:px-14 md:py-20">
          <OrbitMotif
            id="cta"
            className="pointer-events-none absolute right-[-14%] top-1/2 hidden w-[560px] -translate-y-1/2 text-white opacity-70 md:block"
          />
          <div className="relative max-w-xl">
            <h2 className="text-balance text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-[42px]">
              Sua empresa mais clara, mais digital e mais inteligente.
            </h2>
            <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-white/70">
              Crescer no digital não precisa ser complicado. Conte o que você precisa — a gente
              responde rápido, com um plano claro e sem enrolação.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} bg-[var(--cyan)] !text-[var(--navy)]`}>
                <Icon.whats className="h-[18px] w-[18px]" />
                Falar no WhatsApp
              </a>
              <Link href="/briefing" className={btnGhostDark}>
                Fazer briefing gratuito →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between md:px-8">
          <div className="max-w-xs">
            <DioliLogo variant="full" tone="dark" markSize={26} className="text-[16px]" />
            <p className="mt-3 text-[14px] font-medium text-[var(--navy)]">
              Estratégia humana. Execução inteligente.
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              Clareza para alinhar direção. Consistência para gerar confiança. Conexão para
              crescer.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 text-[13.5px] md:items-end">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)]">
              WhatsApp
            </a>
            <a href={CONTATO.instagram} target="_blank" rel="noopener noreferrer" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)]">
              Instagram
            </a>
            <a href={`mailto:${CONTATO.email}`} className="text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)]">
              {CONTATO.email}
            </a>
            <Link href="/vitrine" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)]">
              Serviços avulsos →
            </Link>
            <Link href="/auth/signin" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)]">
              Área do cliente →
            </Link>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-5 text-center text-[11.5px] text-[var(--text-muted)] md:px-8">
          © {new Date().getFullYear()} Dioli Digital · Estúdio digital com IA · Todos os direitos reservados
        </div>
      </footer>
    </div>
  );
}
