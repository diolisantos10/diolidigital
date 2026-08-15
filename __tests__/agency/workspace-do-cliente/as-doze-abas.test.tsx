// TESTE 1 e 2 do contrato — a lista das doze abas, e cada uma renderizando
// nos dois caminhos (com dado e vazia).
//
// ── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
// O contrato de 15/08 nasceu de uma entrega incompleta: o mockup criou NOVE
// abas, o handoff falava de doze módulos, e ninguém percebeu porque a lista da
// navegação morava no componente e a lista dos módulos morava no documento. Um
// porte posterior entregou ONZE — e também passou, porque não havia nada
// perguntando "quantas são?".
//
// Este arquivo é a pergunta. Ele falha se alguém:
//   · remover uma aba,
//   · acrescentar uma décima terceira sem decisão,
//   · trocar a ORDEM (ela é contrato: sobe do relacionamento para quem produz,
//     depois para o que atravessa, e fecha nas duas de leitura),
//   · ou deixar uma aba sem componente próprio.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_WORKSPACE_TABS,
  CLIENT_WORKSPACE_TAB_IDS,
  abaDaQuery,
  areaDaAba,
  rotuloDaAba,
} from "@/components/agency/clients/workspace/client-workspace-tabs";
import { OverviewTab } from "@/components/agency/clients/workspace/OverviewTab";
import { RequestsTab } from "@/components/agency/clients/workspace/RequestsTab";
import { StrategyTab } from "@/components/agency/clients/workspace/StrategyTab";
import { SocialMediaTab } from "@/components/agency/clients/workspace/SocialMediaTab";
import { BrandingTab } from "@/components/agency/clients/workspace/BrandingTab";
import { DesignTab } from "@/components/agency/clients/workspace/DesignTab";
import { PaidMediaTab } from "@/components/agency/clients/workspace/PaidMediaTab";
import { ProjectsTab } from "@/components/agency/clients/workspace/ProjectsTab";
import { ApprovalsTab } from "@/components/agency/clients/workspace/ApprovalsTab";
import { DeliveriesTab } from "@/components/agency/clients/workspace/DeliveriesTab";
import { IntelligenceTab } from "@/components/agency/clients/workspace/IntelligenceTab";
import { IntegrationsTab } from "@/components/agency/clients/workspace/IntegrationsTab";
import { render, texto, vistaCheia, vistaVazia, permsDe } from "./_fixture";

const ORDEM_DO_CONTRATO = [
  "Visão Geral",
  "Solicitações",
  "Estratégia",
  "Social Media",
  "Branding",
  "Design",
  "Tráfego Pago",
  "Projetos",
  "Aprovações",
  "Entregas",
  "Inteligência",
  "Integrações",
];

describe("1. CLIENT_WORKSPACE_TABS tem exatamente as doze abas, na ordem", () => {
  it("são doze — nem nove do mockup, nem onze do porte anterior", () => {
    expect(CLIENT_WORKSPACE_TABS).toHaveLength(12);
  });

  it("os rótulos estão na ordem exata do contrato", () => {
    expect(CLIENT_WORKSPACE_TABS.map((t) => t.label)).toEqual(ORDEM_DO_CONTRATO);
  });

  it("Estratégia existe — é a que faltava nos DOIS pacotes de referência", () => {
    expect(CLIENT_WORKSPACE_TAB_IDS).toContain("strategy");
  });

  it("Aprovações e Entregas existem — faltavam no mockup", () => {
    expect(CLIENT_WORKSPACE_TAB_IDS).toContain("approvals");
    expect(CLIENT_WORKSPACE_TAB_IDS).toContain("deliveries");
  });

  it("nenhum id repetido — id repetido faz duas abas responderem ao mesmo link", () => {
    expect(new Set(CLIENT_WORKSPACE_TAB_IDS).size).toBe(12);
  });

  it("Ficha e Chat NÃO são abas: são ações do cabeçalho", () => {
    const rotulos = CLIENT_WORKSPACE_TABS.map((t) => t.label.toLowerCase());
    expect(rotulos.some((r) => r.includes("ficha"))).toBe(false);
    expect(rotulos.some((r) => r.includes("chat"))).toBe(false);
  });

  it("toda aba tem área de escrita declarada", () => {
    for (const t of CLIENT_WORKSPACE_TABS) expect(areaDaAba(t.id)).toBe(t.area);
  });

  it("Integrações é a única área somente-leitura", () => {
    const somenteLeitura = CLIENT_WORKSPACE_TABS.filter((t) => t.area === "somente-leitura");
    expect(somenteLeitura.map((t) => t.id)).toEqual(["integrations"]);
  });

  it("aba desconhecida no ?tab= cai na padrão em vez de dar erro", () => {
    expect(abaDaQuery("nao-existe")).toBe("overview");
    expect(abaDaQuery(null)).toBe("overview");
    expect(abaDaQuery("branding")).toBe("branding");
  });

  it("rotuloDaAba responde por todas as doze", () => {
    for (const id of CLIENT_WORKSPACE_TAB_IDS) expect(rotuloDaAba(id)).not.toBe(id);
  });
});

// ─── Teste 2: cada aba tem componente próprio e renderiza nos dois estados ──

const DIR = path.join(process.cwd(), "components/agency/clients/workspace");

const ARQUIVO_DA_ABA: Record<string, string> = {
  overview: "OverviewTab.tsx",
  requests: "RequestsTab.tsx",
  strategy: "StrategyTab.tsx",
  social: "SocialMediaTab.tsx",
  branding: "BrandingTab.tsx",
  design: "DesignTab.tsx",
  traffic: "PaidMediaTab.tsx",
  projects: "ProjectsTab.tsx",
  approvals: "ApprovalsTab.tsx",
  deliveries: "DeliveriesTab.tsx",
  intel: "IntelligenceTab.tsx",
  integrations: "IntegrationsTab.tsx",
};

const nada = () => {};

function montar(id: string, view: ReturnType<typeof vistaCheia>) {
  const comum = { view, perms: permsDe("master"), setTab: nada as never };
  switch (id) {
    case "overview": return <OverviewTab {...comum} onOpenPortal={nada} />;
    case "requests": return <RequestsTab {...comum} onOpenPortal={nada} />;
    case "strategy": return <StrategyTab {...comum} />;
    case "social": return <SocialMediaTab {...comum} />;
    case "branding": return <BrandingTab {...comum} />;
    case "design": return <DesignTab {...comum} />;
    case "traffic": return <PaidMediaTab {...comum} />;
    case "projects": return <ProjectsTab {...comum} onOpenProject={nada} onNewProject={nada} />;
    case "approvals": return <ApprovalsTab {...comum} />;
    case "deliveries": return <DeliveriesTab {...comum} />;
    case "intel": return <IntelligenceTab {...comum} />;
    default: return <IntegrationsTab {...comum} onOpenPortal={nada} />;
  }
}

describe("2. cada aba tem componente próprio e renderiza com dado e vazia", () => {
  it("existe um arquivo por aba — nenhuma aba compartilha componente", () => {
    for (const id of CLIENT_WORKSPACE_TAB_IDS) {
      const arq = ARQUIVO_DA_ABA[id];
      expect(arq, `aba "${id}" sem arquivo declarado`).toBeTruthy();
      expect(fs.existsSync(path.join(DIR, arq!)), `${arq} não existe`).toBe(true);
    }
    expect(new Set(Object.values(ARQUIVO_DA_ABA)).size).toBe(12);
  });

  for (const id of CLIENT_WORKSPACE_TAB_IDS) {
    it(`"${rotuloDaAba(id)}" renderiza COM DADO`, () => {
      const html = render(montar(id, vistaCheia()));
      expect(html.length).toBeGreaterThan(200);
      // Toda aba desenha o cabeçalho azul-marinho padronizado — é a estrutura
      // obrigatória do contrato. Sem ele a aba virou outra coisa.
      expect(html).toMatch(/class="(workspaceTab|brandingTab)/);
    });

    it(`"${rotuloDaAba(id)}" renderiza VAZIA, com explicação — não some nem vira card genérico`, () => {
      const html = render(montar(id, vistaVazia()));
      expect(html.length).toBeGreaterThan(200);
      const t = texto(html);
      // O estado vazio da casa é a frase MAIS o motivo. Uma aba vazia que não
      // explica nada é indistinguível de uma aba quebrada.
      expect(t.length).toBeGreaterThan(120);
      expect(
        /não|nenhum|sem |vazi|ainda/i.test(t),
        `a aba "${id}" ficou vazia SEM dizer por quê`,
      ).toBe(true);
    });
  }
});
