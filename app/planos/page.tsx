// PÁGINA PÚBLICA DE PLANOS — /planos
//
// Decidida pelo CEO em 05/08/2026: os PLANOS vão para o site; a tabela por
// serviço NÃO. Ela é interna, para cliente de carteira. Por isso nada aqui
// importa o catálogo de preço avulso — o único preço público além da
// mensalidade é a implantação e a peça excedente, que são termos do próprio
// plano e precisam estar escritos para o escopo existir.
//
// Os dados vêm de `lib/agency/planos.ts`, fonte única. Preço de plano escrito
// em dois lugares vira dois preços diferentes na semana em que um deles muda.

import type { Metadata } from "next";
import Link from "next/link";
import { DioliLogo } from "@/components/brand/DioliLogo";
import { OrbitMotif } from "@/components/brand/OrbitMotif";
import { PLANOS, FORA_DE_TODO_PLANO, precoEmReais } from "@/lib/agency/planos";

const WHATSAPP = "5511989400692";
function zap(msg: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

export const metadata: Metadata = {
  title: "Planos e preços — Dioli Digital",
  description:
    "Cinco planos mensais, do acompanhamento de resultados à operação completa. Cada um diz em número o que entrega — e o que não entrega.",
  openGraph: {
    title: "Planos e preços — Dioli Digital",
    description: "Do R$ 49 que mede ao R$ 2.590 que cresce. Escopo escrito, sem letra miúda.",
    type: "website",
    locale: "pt_BR",
  },
};

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function Menos({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}

export default function PlanosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text-primary)]">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 md:px-8">
          <Link href="/" className="flex-1" aria-label="Dioli Digital — página inicial">
            <DioliLogo variant="full" tone="dark" markSize={34} />
          </Link>
          <Link href="/" className="hidden text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)] sm:block">
            Serviços
          </Link>
          <Link href="/auth/signin" className="hidden text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--navy)] sm:block">
            Área do cliente
          </Link>
          <a
            href={zap("Olá! Vim pela página de planos da Dioli Digital.")}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: "#070A1F", color: "#FFFFFF" }}
            className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold transition-transform hover:-translate-y-0.5"
          >
            Falar agora
          </a>
        </nav>
      </header>

      {/* ── Abertura ───────────────────────────────────────────────────────── */}
      <section className="mesh-cool relative overflow-hidden border-b border-[var(--border)]">
        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-14 md:px-8 md:pb-20 md:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-white/70 px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--azure)]" />
            Planos mensais
          </span>
          <h1 className="mt-6 max-w-3xl text-balance text-[38px] font-bold leading-[1.04] tracking-[-0.035em] text-[var(--navy)] md:text-[58px]">
            Cinco degraus. <span className="text-gradient-cool">Você sobe quando quiser.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--text-secondary)] md:text-[18px]">
            Cada plano diz, em número, o que entrega — e traz por escrito o que <em>não</em> entrega.
            Sem letra miúda, sem “consulte-nos”.
          </p>

          {/* a escada, em uma olhada */}
          <ol className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PLANOS.map((p) => (
              <li key={p.id}>
                <a
                  href={`#${p.id}`}
                  className={`flex h-full flex-col rounded-2xl border bg-[var(--card)] p-4 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${
                    p.destaque ? "border-[var(--azure)] ring-1 ring-[var(--azure)]" : "border-[var(--border)]"
                  }`}
                >
                  <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{p.nome}</span>
                  <span className="mt-1 font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-[var(--navy)]">
                    {precoEmReais(p.preco)}
                  </span>
                  <span className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">por mês</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── As fichas ──────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="flex flex-col gap-6">
          {PLANOS.map((p) => (
            <article
              key={p.id}
              id={p.id}
              className={`scroll-mt-20 overflow-hidden rounded-3xl border bg-[var(--card)] ${
                p.destaque ? "border-[var(--azure)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--azure)]" : "border-[var(--border)]"
              }`}
            >
              {/* topo da ficha */}
              {/* No celular o nome e o preço EMPILHAM. Lado a lado, o `flex-1` do
                  texto espremia a frase em uma palavra por linha — e o celular é
                  onde a maioria lê. */}
              <div className="flex flex-col gap-4 border-b border-[var(--border)] px-6 py-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:gap-y-3 md:px-8">
                <div className="min-w-0 sm:flex-1">
                  {p.destaque && (
                    <span className="inline-flex rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--navy)]">
                      O mais contratado
                    </span>
                  )}
                  <h2 className={`text-[26px] font-bold tracking-[-0.02em] text-[var(--navy)] md:text-[30px] ${p.destaque ? "mt-2" : ""}`}>
                    {p.nome}
                  </h2>
                  <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-[var(--text-secondary)]">
                    {p.paraQuem} <span className="text-[var(--text-muted)]">{p.salto}</span>
                  </p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="font-display text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--navy)] md:text-[40px]">
                    {precoEmReais(p.preco)}
                    <span className="ml-1 text-[14px] font-semibold text-[var(--text-muted)]">/mês</span>
                  </p>
                  <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
                    {p.implantacao === null ? "Implantação isenta" : `+ implantação de ${precoEmReais(p.implantacao)}, uma vez`}
                  </p>
                </div>
              </div>

              {/* corpo: inclui | não inclui */}
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
                <div className="px-6 py-6 md:px-8">
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--azure)]">O que está incluído</p>
                  <ol className="mt-4 space-y-3">
                    {p.inclui.map((item, i) => (
                      <li key={item} className="flex items-start gap-3 text-[14.5px] leading-relaxed text-[var(--text-primary)]">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--accent)] font-display text-[11px] font-bold text-[var(--navy)]">
                          {i + 1}
                        </span>
                        <span className="text-pretty">{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="border-t border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-6 md:border-l md:border-t-0 md:px-8">
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--text-muted)]">O que não está incluído</p>
                  <ul className="mt-4 space-y-3">
                    {p.naoInclui.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                        <Menos className="mt-[5px] h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" />
                        <span className="text-pretty">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* rodapé da ficha */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--border)] px-6 py-4 text-[13px] text-[var(--text-secondary)] md:px-8">
                <span>
                  Permanência{" "}
                  <b className="font-semibold text-[var(--navy)]">
                    {p.permanencia === 0 ? "nenhuma" : `${p.permanencia} meses`}
                  </b>
                </span>
                {p.pecaExtra !== null && (
                  <span>
                    Peça extra <b className="font-semibold text-[var(--navy)]">{precoEmReais(p.pecaExtra)}</b>
                  </span>
                )}
                <a
                  href={zap(`Olá! Quero contratar o plano ${p.nome} da Dioli Digital.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex h-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-[13.5px] font-semibold text-[var(--navy)] transition-colors hover:bg-[var(--accent)]"
                >
                  Quero o {p.nome} →
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── O que fica fora de todo plano ──────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="max-w-2xl">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Sempre à parte</p>
            <h2 className="mt-3 text-[28px] font-bold tracking-[-0.025em] text-[var(--navy)] md:text-[40px]">
              O que <span className="text-gradient-cool">não</span> entra em plano nenhum.
            </h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--text-secondary)]">
              Preferimos dizer antes: estes quatro itens são orçados por fora, em qualquer degrau.
              Diluir eles na mensalidade encareceria o plano de todo mundo — inclusive de quem
              nunca vai usar.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FORA_DE_TODO_PLANO.map((f) => (
              <div key={f.titulo} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
                <h3 className="text-[16px] font-semibold text-[var(--navy)]">{f.titulo}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{f.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[14px] text-[var(--text-secondary)]">
            Precisa de um desses?{" "}
            <a
              href={zap("Olá! Quero um orçamento de um serviço fora do plano (vídeo, marca ou site).")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--azure)] underline underline-offset-4"
            >
              Peça um orçamento
            </a>{" "}
            — respondemos em até 2h úteis.
          </p>
        </div>
      </section>

      {/* ── Regras do contrato ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Sem letra miúda</p>
          <h2 className="mt-3 text-[28px] font-bold tracking-[-0.025em] text-[var(--navy)] md:text-[40px]">
            As regras, <span className="text-gradient-cool">na frente.</span>
          </h2>
        </div>
        <dl className="mt-10 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "Ajustes", d: "2 rodadas por peça — 3 a partir do Conteúdo. Você aprova em até 2 dias úteis; passado isso, a peça segue para a data agendada." },
            { t: "Pausa e reajuste", d: "Pausa de até 30 dias por ciclo. Reajuste anual pelo IPCA, avisado com 30 dias." },
            { t: "Tráfego pago", d: "A campanha roda na sua conta de anúncios, no seu nome. A verba fica fora da mensalidade e você paga a plataforma direto." },
            { t: "O que é seu, é seu", d: "Ficha do Google, conta de anúncios, pixel e domínio ficam sempre no seu nome — se um dia você sair, sai com tudo." },
            { t: "Avaliações", d: "Elogio só recebe resposta automática com a sua autorização registrada. Reclamação nunca é respondida por robô: vira rascunho e chama gente." },
            { t: "Sem promessa de retorno", d: "Não prometemos faturamento nem ROI. Prometemos consistência, prazo e número medido — e mostramos os três todo mês." },
          ].map((r) => (
            <div key={r.t}>
              <dt className="flex items-center gap-2 text-[15.5px] font-semibold text-[var(--navy)]">
                <Check className="h-4 w-4 text-[var(--azure)]" />
                {r.t}
              </dt>
              <dd className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">{r.d}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Fechamento ─────────────────────────────────────────────────────── */}
      <section className="mesh-navy relative overflow-hidden text-white">
        <OrbitMotif id="planos-cta" className="pointer-events-none absolute -right-20 -top-16 w-[420px] text-white opacity-40" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <h2 className="max-w-2xl text-balance text-[30px] font-bold leading-[1.1] tracking-[-0.025em] md:text-[42px]">
            Na dúvida de qual degrau é o seu?
          </h2>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-white/70">
            Faça o briefing gratuito. A gente lê o seu perfil, olha o que já existe e devolve
            a recomendação — inclusive quando a recomendação é o plano mais barato.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/briefing"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--cyan)] px-6 text-[15px] font-semibold text-[var(--navy)] transition-transform hover:-translate-y-0.5"
            >
              Fazer briefing gratuito →
            </Link>
            <a
              href={zap("Olá! Quero ajuda para escolher o plano da Dioli Digital.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-8 text-[13px] text-[var(--text-muted)] md:px-8">
          <DioliLogo variant="full" tone="dark" markSize={26} />
          <span className="ml-auto">Preços válidos a partir de 08/2026 · valores em reais</span>
          <Link href="/termos" className="hover:text-[var(--navy)]">Termos</Link>
          <Link href="/privacidade" className="hover:text-[var(--navy)]">Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}
