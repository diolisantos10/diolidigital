"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  ClientWorkspaceShell — o casco do Dashboard Interno do Cliente.
//
//  O EIXO É O CLIENTE, não o projeto. O casco recebe UM cliente e as doze abas
//  leem esse mesmo cliente. Projeto virou conteúdo de uma aba;
//  `/agency/projects/[id]` continua sendo a página de detalhe de um projeto.
//
//  ── O QUE ESTE CASCO NÃO DESENHA, E É DE PROPÓSITO ──────────────────────
//  A `.agencyBar` do pacote de referência não é montada. Esta casa já tem
//  `AgencySidebar` + `AgencyTopBar` no `app/agency/layout`; desenhar a barra da
//  referência aqui daria DUAS barras e dois logotipos na mesma tela. O chrome
//  externo continua sendo o da Dioli, como manda o contrato — ele só já existe.
//
//  ── O DEEP-LINK ────────────────────────────────────────────────────────────
//  `?tab=branding` é contrato público: essa URL é colada em ticket, em WhatsApp
//  e em e-mail para o time. Por isso ela é lida na montagem, escrita a cada
//  troca com `history.pushState` (sem recarregar a página, sem refazer a
//  consulta ao banco) e re-lida no `popstate` — voltar e avançar do navegador
//  andam pelas abas, que é o que a pessoa espera depois de clicar em doze.
//
//  ⚠️ `router.push` do Next NÃO serve aqui: ele reexecuta o componente de
//  servidor da rota e recarrega o cliente inteiro do Prisma a cada clique de
//  aba. A troca de aba é estado de tela, não navegação de dado.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientSheet } from "./ClientSheet";
import { ProjectManagerChat } from "./ProjectManagerChat";
import { OverviewTab } from "./OverviewTab";
import { RequestsTab } from "./RequestsTab";
import { StrategyTab } from "./StrategyTab";
import { SocialMediaTab } from "./SocialMediaTab";
import { BrandingTab } from "./BrandingTab";
import { DesignTab } from "./DesignTab";
import { PaidMediaTab } from "./PaidMediaTab";
import { ProjectsTab } from "./ProjectsTab";
import { ApprovalsTab } from "./ApprovalsTab";
import { DeliveriesTab } from "./DeliveriesTab";
import { IntelligenceTab } from "./IntelligenceTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { Acao, ErrorBlock, LoadingBlock } from "./primitives";
import {
  CLIENT_WORKSPACE_TABS,
  CLIENT_WORKSPACE_TAB_PARAM,
  abaDaQuery,
  DEFAULT_CLIENT_WORKSPACE_TAB,
  type ClientWorkspaceTabId,
} from "./client-workspace-tabs";
import type { AgencyClientView } from "@/lib/agency/clients/workspace/vista";
import type { ClientSheetData } from "@/lib/agency/clients/workspace/ficha";
import type { PermissoesDoWorkspace } from "@/lib/agency/clients/workspace/permissoes";

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

export function ClientWorkspaceShell({
  view,
  sheet,
  perms,
  loadError,
  blocos,
  onEditar,
  onPortal,
  /** Só para teste: a aba inicial, quando não há `window`. */
  abaInicial,
}: {
  view: AgencyClientView;
  sheet: ClientSheetData;
  perms: PermissoesDoWorkspace;
  loadError?: string | null;
  blocos: BlocosDaCasa;
  onEditar: () => void;
  onPortal: () => void;
  abaInicial?: ClientWorkspaceTabId;
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<ClientWorkspaceTabId>(abaInicial ?? DEFAULT_CLIENT_WORKSPACE_TAB);
  const [showSheet, setShowSheet] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // ── Deep-link: ler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ler = () =>
      setTabState(abaDaQuery(new URLSearchParams(window.location.search).get(CLIENT_WORKSPACE_TAB_PARAM)));
    ler();
    window.addEventListener("popstate", ler);
    return () => window.removeEventListener("popstate", ler);
  }, []);

  // ── Deep-link: escrever ────────────────────────────────────────────────────
  const setTab = useCallback((proxima: ClientWorkspaceTabId) => {
    setTabState(proxima);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set(CLIENT_WORKSPACE_TAB_PARAM, proxima);
    window.history.pushState({ [CLIENT_WORKSPACE_TAB_PARAM]: proxima }, "", url);
  }, []);

  // ── A trilha de abas rola por SETA, nunca por barra de rolagem ────────────
  // Critério do contrato: "nenhuma barra de rolagem horizontal visível". As
  // setas se apagam sozinhas quando não há para onde rolar — seta acesa que não
  // move é o mesmo botão decorativo com outra roupa.
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

  // A aba ativa é trazida para dentro do campo de visão. Sem isto, um
  // deep-link para "Integrações" abre a trilha no começo e a aba ativa fica
  // fora da tela — a pessoa vê a Visão Geral marcada e o conteúdo de outra.
  useEffect(() => {
    tabRail.current?.querySelector<HTMLElement>("[aria-current='page']")
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [tab]);

  const moveTabs = (dir: number) => tabRail.current?.scrollBy({ left: dir * 280, behavior: "smooth" });

  const openProject = (id: string) => {
    setNavigating(true);
    router.push(`/agency/projects/${id}`);
  };
  const newProject = () => {
    setNavigating(true);
    router.push("/agency/orchestrator");
  };

  const pendentes = view.approvals.filter(
    (a) => a.decision === "pendente" || a.decision === "duvida_aberta",
  );

  const badge: Partial<Record<ClientWorkspaceTabId, number>> = {
    requests: view.requests.length,
    strategy: view.strategy.rooms.length,
    projects: view.projects.length,
    approvals: pendentes.length,
    deliveries: view.deliverables.length,
    integrations: view.integrations.filter((i) => i.tone === "warn" || i.tone === "partial" || i.tone === "off").length,
  };

  /** O que cada aba precisa saber sobre quem está olhando. Uma única forma —
   *  nenhuma aba recalcula permissão a partir do papel. */
  const comum = { view, perms, setTab } as const;

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
    body = <OverviewTab {...comum} onOpenPortal={onPortal} atividade={blocos.atividade} />;
  } else if (tab === "requests") {
    body = <RequestsTab {...comum} onOpenPortal={onPortal} />;
  } else if (tab === "strategy") {
    body = <StrategyTab {...comum} />;
  } else if (tab === "social") {
    body = (
      <SocialMediaTab {...comum}>
        {blocos.redes}
        {blocos.reconciliar}
      </SocialMediaTab>
    );
  } else if (tab === "branding") {
    body = (
      <BrandingTab {...comum}>
        {blocos.fichaDeMarca}
        {blocos.materialDeMarca}
        {blocos.brandHub}
      </BrandingTab>
    );
  } else if (tab === "design") {
    body = <DesignTab {...comum} />;
  } else if (tab === "traffic") {
    body = <PaidMediaTab {...comum} />;
  } else if (tab === "projects") {
    body = <ProjectsTab {...comum} onOpenProject={openProject} onNewProject={newProject} />;
  } else if (tab === "approvals") {
    body = <ApprovalsTab {...comum} />;
  } else if (tab === "deliveries") {
    body = <DeliveriesTab {...comum} />;
  } else if (tab === "intel") {
    body = <IntelligenceTab {...comum} />;
  } else {
    body = <IntegrationsTab {...comum} onOpenPortal={onPortal} />;
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
                  frase. */}
              <div>
                <span className={c.isActive ? "selOk" : "selNeutro"}>
                  {c.isActive ? "Ativo" : "Sem projeto"}
                </span>
                <span className={pendentes.length > 0 ? "selAviso" : "selNeutro"}>
                  {pendentes.length > 0
                    ? `${pendentes.length} pendência${pendentes.length > 1 ? "s" : ""}`
                    : "Sem pendência"}
                </span>
                <span>{c.activeSince ? `Desde ${c.activeSince}` : "Data de início não registrada"}</span>
              </div>
            </div>
          </div>
          {/* Ficha e Chat são AÇÕES DO CABEÇALHO, não abas — decisão do
              contrato, e ela tem razão de ser: as duas são consulta que se faz
              DE DENTRO de qualquer aba, sem perder o lugar onde se estava. */}
          <div className="clientHeadActions">
            <Acao onClick={() => setShowSheet(true)}>▤ Ficha do cliente</Acao>
            <Acao className="pmChatButton" onClick={() => setShowChat(true)}>
              <>
                ✦ Chat do cliente {view.chat.length > 0 && <em>{view.chat.length}</em>}
              </>
            </Acao>
            {perms.escrita.overview ? (
              <Acao onClick={onEditar}>Editar cliente</Acao>
            ) : (
              <Acao indisponivel={perms.motivo.overview ?? "Sem permissão de escrita."}>Editar cliente</Acao>
            )}
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
          <Acao onClick={onPortal}>Portal do cliente ↗</Acao>
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
            {CLIENT_WORKSPACE_TABS.map((t) => (
              <button
                type="button"
                onClick={() => setTab(t.id)}
                className={tab === t.id ? "active" : ""}
                key={t.id}
                aria-current={tab === t.id ? "page" : undefined}
              >
                {t.label}
                {(badge[t.id] ?? 0) > 0 && <em>{badge[t.id]}</em>}
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
        <ClientSheet close={() => setShowSheet(false)} clientName={c.name} initial={c.initial} data={sheet} perms={perms} />
      )}
      {showChat && (
        <ProjectManagerChat
          close={() => setShowChat(false)}
          clientName={c.name}
          messages={view.chat}
          context={{
            headline: view.brand.tagline,
            counters: [
              `${view.projects.length} projeto${view.projects.length === 1 ? "" : "s"}`,
              `${view.requests.length} solicitaç${view.requests.length === 1 ? "ão" : "ões"}`,
              `${pendentes.length} decis${pendentes.length === 1 ? "ão" : "ões"} pendente${pendentes.length === 1 ? "" : "s"}`,
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
