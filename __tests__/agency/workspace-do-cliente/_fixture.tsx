// A base dos testes do workspace do cliente.
//
// ⚠️ ESTE ARQUIVO NÃO É COMPONENTE DE PRODUÇÃO, e é por isso que ele pode ter
// nome e número inventados. Ele mora em `__tests__/`, nunca é importado por
// `components/` nem por `app/`, e o teste `sem-dado-ficticio` confere
// exatamente isso: que a ficção viva aqui e só aqui.
//
// Os nomes escolhidos são propositalmente absurdos ("Marca de Teste Ltda.") em
// vez de plausíveis. Nome plausível em fixture é o que acaba copiado para a
// tela por engano e passa despercebido numa revisão.

import { renderToStaticMarkup } from "react-dom/server";
import type { AgencyClientView, ClientIdentity } from "@/lib/agency/clients/workspace/vista";
import { emptyAgencyClientView } from "@/lib/agency/clients/workspace/vista";
import type { ClientSheetData } from "@/lib/agency/clients/workspace/ficha";
import { fichaVazia } from "@/lib/agency/clients/workspace/ficha";
import { permissoesDoWorkspace } from "@/lib/agency/clients/workspace/permissoes";
import { CLIENT_WORKSPACE_TAB_IDS } from "@/components/agency/clients/workspace/client-workspace-tabs";
import type { AgencyRole } from "@/lib/agency/roles";

export const IDENTIDADE: ClientIdentity = {
  id: "cliente-de-teste",
  name: "Marca de Teste Ltda.",
  initial: "M",
  category: "Categoria de teste",
  activeSince: "2026-01",
  isActive: true,
  website: "exemplo.invalido",
  email: "contato@exemplo.invalido",
  phone: null,
};

/** A vista VAZIA — o esqueleto honesto de um cliente sem nada ligado. */
export function vistaVazia(): AgencyClientView {
  return emptyAgencyClientView(IDENTIDADE);
}

/** A vista CHEIA — um de cada coisa, para o caminho com dado. */
export function vistaCheia(): AgencyClientView {
  const v = emptyAgencyClientView(IDENTIDADE);
  return {
    ...v,
    projects: [
      {
        id: "p1", name: "Projeto de teste", kind: "campanha", progress: 40,
        statusLabel: "Em produção", agents: ["Agente Design"],
        deliverableCount: 2, decisionCount: 1,
      },
    ],
    requests: [
      {
        id: "r1", code: "SOL-001", title: "Pedido de teste", routedTo: "Projeto de teste",
        statusLabel: "Em produção", when: "01 ago, 10:00", priority: "medium",
      },
    ],
    deliverables: [
      {
        id: "d1", title: "Entrega de teste", projectName: "Projeto de teste",
        department: "Design", statusLabel: "Em revisão", when: "02 ago 2026",
        version: 2, versionCount: 2, shared: false, hasContent: true,
      },
    ],
    clientMaterials: [
      {
        id: "m1", fileName: "arquivo-de-teste.png", mimeType: "image/png",
        size: "1,2 MB", uploadedBy: "cliente", when: "01 ago 2026",
      },
    ],
    approvals: [
      {
        id: "a1", title: "Design", context: "Prazo até 10 ago 2026",
        statusLabel: "Aguardando decisão", decision: "pendente", decidesIt: "Cliente",
        when: "02 ago 2026",
        content: { label: "Entrega de teste", versionLabel: "v2", deliverableId: "d1" },
        note: null, commentCount: 1,
      },
      // O CARD QUEBRADO: sem peça vinculada. Ele existe na fixture de propósito
      // — é o caso que a tela precisa recusar a decidir.
      {
        id: "a2", title: "Social Media", context: "Sem prazo definido",
        statusLabel: "Aguardando decisão", decision: "pendente", decidesIt: "Agência",
        when: "03 ago 2026", content: null, note: null, commentCount: 0,
      },
    ],
    integrations: [
      {
        glyph: "◉", name: "Instagram de teste", scopes: "perfil · insights",
        statusLabel: "Conectado", tone: "ok", lastSync: "03 ago, 09:00",
        consumers: null, agencyAccess: "Somente leitura",
      },
    ],
    brand: {
      health: 44,
      headline: "Marca de Teste Ltda.",
      tagline: "Uma frase de teste.",
      knowledge: [
        { area: "Campo de teste confirmado", pct: 100, state: "confirmed" },
        { area: "Campo de teste em lacuna", pct: 0, state: "missing" },
      ],
    },
    strategy: {
      objectives: [{ label: "Objetivo do cliente", value: "Objetivo de teste", source: "Briefing do projeto" }],
      positioning: "Posicionamento de teste",
      audience: "Público de teste",
      keyMessage: "Mensagem de teste",
      successCriteria: "Critério de teste",
      rooms: [
        {
          id: "s1", projectId: "p1", projectName: "Projeto de teste",
          statusLabel: "Pronta", tone: "ok", summary: "Resumo de teste",
          specialists: 3, when: "02 ago 2026",
        },
      ],
      hypotheses: [{ title: "Hipótese de teste", note: "Projeto de teste", roomId: "s1" }],
      risks: [{ title: "Tarefa travada de teste", note: "Projeto de teste" }],
    },
    chat: [
      { id: "c1", author: "Marca de Teste Ltda.", side: "client", when: "01 ago, 09:00", body: "Mensagem de teste" },
    ],
    areaMetrics: {
      ...v.areaMetrics,
      overview: [{ label: "PROJETOS ATIVOS", value: "1", hint: "iniciativas em curso" }],
      requests: [{ label: "SOLICITAÇÕES", value: "1", hint: "pedidos registrados" }],
      strategy: [{ label: "SALAS DE ESTRATÉGIA", value: "1", hint: "debates registrados" }],
      approvals: [{ label: "AGUARDANDO DECISÃO", value: "2", hint: "cards abertos" }],
      deliveries: [{ label: "ENTREGAS DA AGÊNCIA", value: "1", hint: "produzidas" }],
    },
    internal: { cascade: [{ requestId: "p1", chain: ["Projeto de teste", "Agente Design"] }] },
  };
}

export function fichaDeTeste(): ClientSheetData {
  return {
    ...fichaVazia(IDENTIDADE.name),
    company: [{ term: "Nome da marca", value: IDENTIDADE.name }],
    contact: [{ term: "E-mail", value: IDENTIDADE.email }],
  };
}

export function permsDe(role: AgencyRole) {
  return permissoesDoWorkspace(role, CLIENT_WORKSPACE_TAB_IDS);
}

/**
 * Renderiza um componente de verdade e devolve o HTML.
 *
 * `renderToStaticMarkup` roda o corpo do componente inteiro — incluindo
 * `useState`, os `map` sobre as listas e as condicionais de estado vazio. O que
 * ele não roda é `useEffect`, que aqui só cuida de scroll e de `history`.
 */
export function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** O texto visível, sem as tags — para procurar frase que a pessoa lê. */
export function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}
