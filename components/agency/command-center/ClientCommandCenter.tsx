"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  Client Command Center — o casco.
//
//  Porte de `AgencyShell` + `Home` de `app/page.tsx` do pacote aprovado
//  (CLAUDE_HANDOFF.md, 14/08/2026). Mesmo DOM, mesmas classes.
//
//  O EIXO DO PAINEL É O CLIENTE, não o projeto — é a mudança conceitual do
//  handoff. O casco recebe UM cliente e todas as abas leem esse mesmo cliente.
//  Projeto virou conteúdo de uma aba; `/agency/projects/[id]` continua sendo a
//  página de detalhe de um projeto.
//
//  ── O QUE MUDA EM RELAÇÃO AO PORTE ANTERIOR ─────────────────────────────
//
//  1. A BARRA SUPERIOR DA REFERÊNCIA (`.agencyBar`) NÃO É MONTADA. Este
//     sistema já tem `AgencySidebar` + `AgencyTopBar` no `app/agency/layout`.
//     Desenhar a barra da referência aqui daria DUAS barras e dois logotipos
//     na mesma tela.
//
//  2. AS ABAS QUE JÁ TÊM TELA NESTA CASA MONTAM A TELA QUE JÁ EXISTE, não uma
//     segunda versão dela: `FichaDeMarca`, `MaterialDeMarca`, `RedesDoCliente`,
//     `ReconciliarCarrosseis` e o Brand Hub entram inteiros dentro das abas
//     correspondentes. Nada do que a página anterior mostrava foi perdido.
//
//  3. NENHUM CONTROLE QUE NÃO FAZ NADA. A referência trazia um modal de "nova
//     solicitação" com caixa de texto que descartava o que fosse digitado, e
//     uma "entrevista de marca" de três perguntas fixas. Os dois viraram
//     navegação para o lugar real: `/agency/requests` e a Ficha de Marca (que
//     nesta casa já pergunta de verdade, `lib/agency/esteira/ficha-de-marca`).
//
//  A NAVEGAÇÃO NÃO TEM BARRA DE ROLAGEM: a trilha de abas rola por seta
//  (`navArrow prev` / `navArrow next`) — critério de aceite 3 do handoff. As
//  setas se apagam sozinhas quando não há para onde rolar.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientSheet, PMChat } from "./modals";
import { OverviewTab, RequestsTab, ProjectsTab, ApprovalsModule, DeliverablesModule } from "./tabs-core";
import { SocialTab, DesignTab, TrafficTab, IntelligenceTab } from "./tabs-depts";
import { BrandingTab } from "./tabs-branding";
import { IntegrationsTab } from "./tabs-integrations";
import { ErrorBlock, LoadingBlock } from "./primitives";
import type { AgencyClientView } from "@/lib/agency/command-center/vista";
import type { ClientSheetData } from "@/lib/agency/command-center/ficha";

const TABS: [string, string][] = [
  ["overview", "Visão Geral"],
  ["requests", "Solicitações"],
  ["projects", "Projetos"],
  ["social", "Social Media"],
  ["branding", "Branding"],
  ["design", "Design"],
  ["traffic", "Tráfego Pago"],
  ["approvals", "Aprovações"],
  ["deliverables", "Entregas"],
  ["intel", "Inteligência"],
  ["integrations", "Integrações"],
];

export type BlocosDaCasa = {
  /** `FichaDeMarca` — os nove campos que permitem julgar. */
  fichaDeMarca: React.ReactNode;
  /** `MaterialDeMarca` — o que a peça consegue usar de verdade. */
  materialDeMarca: React.ReactNode;
  /** O Brand Hub (13 campos + análise de brand book + fila de sugestões). */
  brandHub: React.ReactNode;
  /** `RedesDoCliente` — métricas reais da Meta. */
  redes: React.ReactNode;
  /** `ReconciliarCarrosseis` — só master; `null` para os demais papéis. */
  reconciliar: React.ReactNode;
  /** A linha do tempo de atividade do cliente. */
  atividade: React.ReactNode;
  /** O formulário de edição do cliente (modal próprio). */
  editar: React.ReactNode;
  /** O gerador do link do portal (modal próprio). */
  portal: React.ReactNode;
};

export function ClientCommandCenter({
  view,
  sheet,
  loadError,
  blocos,
  onEditar,
  onPortal,
}: {
  view: AgencyClientView;
  sheet: ClientSheetData;
  /** Falha ao carregar o cliente. Estado obrigatório de erro. */
  loadError?: string | null;
  blocos: BlocosDaCasa;
  onEditar: () => void;
  onPortal: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [showSheet, setShowSheet] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const tabRail = useRef<HTMLElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncArrows = useCallback(() => {
    const el = tabRail.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = tabRail.current;
    if (!el) return;
    el.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      window.removeEventListener("resize", syncArrows);
    };
  }, [syncArrows]);

  const moveTabs = (dir: number) => tabRail.current?.scrollBy({ left: dir * 280, behavior: "smooth" });

  const openProject = (id: string) => {
    setNavigating(true);
    router.push(`/agency/projects/${id}`);
  };
  const newProject = () => {
    setNavigating(true);
    router.push("/agency/orchestrator");
  };

  const badge: Record<string, number> = {
    requests: view.requests.length,
    projects: view.projects.length,
    approvals: view.approvals.length,
    deliverables: view.deliverables.length,
    integrations: view.integrations.filter((i) => i.tone === "warn" || i.tone === "partial" || i.tone === "off").length,
  };

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <section className="workspaceTab">
        <ErrorBlock detail={loadError} onRetry={() => router.refresh()} />
      </section>
    );
  } else if (navigating) {
    body = (
      <section className="workspaceTab">
        <LoadingBlock rows={5} />
      </section>
    );
  } else if (tab === "overview") {
    body = <OverviewTab view={view} setTab={setTab} onOpenPortal={onPortal} atividade={blocos.atividade} />;
  } else if (tab === "requests") {
    body = <RequestsTab view={view} onOpenPortal={onPortal} />;
  } else if (tab === "social") {
    body = (
      <SocialTab view={view}>
        {blocos.redes}
        {blocos.reconciliar}
      </SocialTab>
    );
  } else if (tab === "branding") {
    body = (
      <BrandingTab view={view}>
        {blocos.fichaDeMarca}
        {blocos.materialDeMarca}
        {blocos.brandHub}
      </BrandingTab>
    );
  } else if (tab === "design") {
    body = <DesignTab view={view} />;
  } else if (tab === "traffic") {
    body = <TrafficTab view={view} />;
  } else if (tab === "projects") {
    body = <ProjectsTab view={view} onOpenProject={openProject} onNewProject={newProject} />;
  } else if (tab === "approvals") {
    body = (
      <section className="workspaceTab">
        <ApprovalsModule view={view} />
      </section>
    );
  } else if (tab === "deliverables") {
    body = (
      <section className="workspaceTab">
        <DeliverablesModule view={view} />
      </section>
    );
  } else if (tab === "intel") {
    body = <IntelligenceTab view={view} />;
  } else {
    body = <IntegrationsTab view={view} onOpenPortal={onPortal} />;
  }

  const c = view.client;

  return (
    <div className="dioliOS">
      <main className="projectPage clientWorkspace">
        <div className="projectHead clientHead">
          <div className="clientTitle">
            <span>{c.initial}</span>
            <div>
              <h1>{c.name}</h1>
              <p>
                {c.isActive ? "Cliente ativo" : "Sem projeto em curso"}
                {c.category ? ` · ${c.category}` : ""}
                {c.website ? ` · ${c.website}` : ""}
              </p>
              {/* A COR DO SELO SEGUE O SIGNIFICADO, NÃO A POSIÇÃO.
                  A folha da referência pinta de vermelho o segundo selo, seja
                  ele qual for — e no cliente sem pendência isso escrevia "Sem
                  pendência" em vermelho, que é a tela contradizendo a própria
                  frase. Quem não tem pendência recebe selo neutro; vermelho
                  fica reservado para o que realmente pede atenção. */}
              <div>
                <span className={c.isActive ? "selOk" : "selNeutro"}>
                  {c.isActive ? "Ativo" : "Sem projeto"}
                </span>
                <span className={view.approvals.length > 0 ? "selAviso" : "selNeutro"}>
                  {view.approvals.length > 0
                    ? `${view.approvals.length} pendência${view.approvals.length > 1 ? "s" : ""}`
                    : "Sem pendência"}
                </span>
                <span>{c.activeSince ? `Desde ${c.activeSince}` : "Data de início não registrada"}</span>
              </div>
            </div>
          </div>
          <div className="clientHeadActions">
            <button type="button" onClick={() => setShowSheet(true)}>▤ Ficha do cliente</button>
            <button className="pmChatButton" type="button" onClick={() => setShowChat(true)}>
              ✦ Chat do cliente {view.chat.length > 0 && <em>{view.chat.length}</em>}
            </button>
            <button type="button" onClick={onEditar}>Editar Cliente</button>
          </div>
        </div>

        <div className="clientPulse">
          <span>
            <small>RELACIONAMENTO</small>
            <b className={c.isActive ? "" : "noData"}>{c.isActive ? "Ativo" : "—"}</b>
          </span>
          <span>
            <small>CONTRATO</small>
            <b className="noData">—</b>
          </span>
          <span>
            <small>PRÓXIMA REUNIÃO</small>
            <b className="noData">—</b>
          </span>
          <span>
            <small>AGENTE PROJECT MANAGER</small>
            <b>PM Geral · Todos os clientes</b>
          </span>
          <button type="button" onClick={onPortal}>Portal do cliente ↗</button>
        </div>

        <div className="clientNavShell">
          <button
            className="navArrow prev"
            type="button"
            onClick={() => moveTabs(-1)}
            aria-label="Ver abas anteriores"
            disabled={!canPrev}
            style={{ visibility: canPrev ? "visible" : "hidden" }}
          >
            ‹
          </button>
          <nav ref={tabRail} className="projectTabs clientTabs" aria-label="Áreas do cliente">
            {TABS.map((x) => (
              <button
                type="button"
                onClick={() => setTab(x[0])}
                className={tab === x[0] ? "active" : ""}
                key={x[0]}
                aria-current={tab === x[0] ? "page" : undefined}
              >
                {x[1]}
                {(badge[x[0]] ?? 0) > 0 && <em>{badge[x[0]]}</em>}
              </button>
            ))}
          </nav>
          <button
            className="navArrow next"
            type="button"
            onClick={() => moveTabs(1)}
            aria-label="Ver próximas abas"
            disabled={!canNext}
            style={{ visibility: canNext ? "visible" : "hidden" }}
          >
            ›
          </button>
        </div>

        {body}
      </main>

      {showSheet && (
        <ClientSheet close={() => setShowSheet(false)} clientName={c.name} initial={c.initial} data={sheet} />
      )}
      {showChat && (
        <PMChat
          close={() => setShowChat(false)}
          clientName={c.name}
          messages={view.chat}
          context={{
            headline: view.brand.tagline,
            counters: [
              `${view.projects.length} projeto${view.projects.length === 1 ? "" : "s"}`,
              `${view.requests.length} solicitaç${view.requests.length === 1 ? "ão" : "ões"}`,
              `${view.approvals.length} decis${view.approvals.length === 1 ? "ão" : "ões"} pendente${view.approvals.length === 1 ? "" : "s"}`,
            ],
          }}
          cascadeAgents={["Agente Social Media", "Agente Branding", "Agente Design", "Agente Tráfego Pago"]}
          cascade={view.internal.cascade}
          /* Painel interno: o cascateamento aparece. O portal do cliente não
             monta este componente — e o dado nem sai do servidor para lá. */
          showCascade
        />
      )}

      {blocos.editar}
      {blocos.portal}
    </div>
  );
}

/** Onde a referência tinha um modal que descartava o texto digitado, o botão
 *  leva para a tela onde a solicitação nasce de verdade. */
export function LinkParaSolicitacoes({ children }: { children: React.ReactNode }) {
  return <Link href="/agency/requests">{children}</Link>;
}
