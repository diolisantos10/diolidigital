// ═══════════════════════════════════════════════════════════════════════════
//  O CLIENTE COMO REGISTRO PRINCIPAL — a leitura do banco.
//
//  O `CLAUDE_HANDOFF.md` inverte o eixo do painel: o registro principal deixa
//  de ser o PROJETO e passa a ser o CLIENTE. Projetos, campanhas e entregas
//  pertencem ao cliente.
//
//  ── O QUE CASA COM O MODELO DO HANDOFF (dado real, lido aqui) ─────────────
//    · Cliente ............... `Client`
//    · Projetos .............. `Project`            (+ fase real via `lerFase`)
//    · Entregas .............. `Deliverable`
//    · Aprovações ............ `ApprovalRequest`    (por clientId OU clientRequestId)
//    · Solicitações .......... `ContentRequest`     (o que o cliente pediu)
//    · Chat do PM ............ `PortalMessage`      (a MESMA conversa do portal)
//    · Integrações ........... `MetaConnection` · `GoogleConnection` ·
//                              `GoogleDriveConnection`
//    · Brand Hub ............. `BrandBrain` via `lerFichaDeMarca`
//    · Ficha do cliente ...... `Client` + `ClientRequestDb` (briefing do SDR)
//    · Cascata do PM ......... `Task` agrupada por solicitação de origem
//
//  ── O QUE NÃO EXISTE E POR ISSO SAI VAZIO, NUNCA ESTIMADO ────────────────
//    · NPS, sentimento, risco de churn, engajamento relacional
//    · Alcance, receita atribuída, ROAS, CPA (dependem de conta conectada)
//    · Telemetria de saúde por agente e capacidade criativa
//    · Decision Log
//
//  Guardrail 1 da casa: ausência de informação não é informação. Nenhuma
//  dessas áreas recebe número derivado de outra fonte "parecida".
//
//  ── SEGREDO NÃO SAI DAQUI ────────────────────────────────────────────────
//  Os `select` de integração pedem `platform`, `name`, `status`, `scopes` e
//  data. NÃO pedem `accessTokenEncrypted`, `refreshTokenEncrypted` nem
//  `apiKeyEncrypted`. O ciphertext não é lido, não trafega e não chega ao
//  componente — que é a terceira camada da regra "a agência vê, só o cliente
//  conecta" (as outras duas são o tipo `agencyAccess` e a tela sem controle de
//  escrita).
//
//  ── POSSE ────────────────────────────────────────────────────────────────
//  A leitura é sempre `{ id, workspaceId }`. Estar logado não é ser dono; a
//  política única mora em `lib/auth/posse-de-workspace.ts` e a consulta aqui
//  segue a mesma regra em vez de reimplementá-la.
// ═══════════════════════════════════════════════════════════════════════════

import "server-only";
import { prisma } from "@/lib/db/client";
import { lerFichaDeMarca } from "@/lib/agency/esteira/ficha-de-marca";
import { lerFase, posicaoNaTrilha, TRILHA } from "@/lib/agency/esteira/fases";
import {
  emptyAgencyClientView,
  emptyAreaMetrics,
  type AgencyClientView,
  type ApprovalView,
  type AreaMetrics,
  type BrandView,
  type Cascade,
  type ChatMessageView,
  type ClientIdentity,
  type DeliverableView,
  type IntegrationView,
  type Metric,
  type ProjectView,
  type RequestView,
} from "./vista";
import { fichaVazia, type ClientSheetData } from "./ficha";

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const QUANDO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function fmtData(d: Date | null | undefined): string | null {
  return d ? DATA.format(d) : null;
}
function fmtQuando(d: Date | null | undefined): string | null {
  return d ? QUANDO.format(d) : null;
}
function inicial(nome: string): string {
  return (nome.trim()[0] ?? "?").toUpperCase();
}
function lista(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Um número medido. Existe para o par simétrico de `semDado` abaixo. */
function comDado(label: string, value: string | number, hint: string): Metric {
  return { label, value: String(value), hint };
}
/** Um número que NÃO existe. O `hint` diz por quê — nunca "0". */
function semDado(label: string, motivo: string): Metric {
  return { label, value: null, hint: motivo };
}

// ─── Rótulos ────────────────────────────────────────────────────────────────

const FASE_ROTULO: Record<string, string> = Object.fromEntries(
  TRILHA.map((t) => [t.fase, t.curto]),
);

const ENTREGA_ROTULO: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovada",
  delivered: "Entregue",
  revision_requested: "Ajuste pedido",
};

const PEDIDO_ROTULO: Record<string, string> = {
  novo: "Novo",
  em_triagem: "Em triagem",
  triado: "Triado",
  em_producao: "Em produção",
  entregue: "Entregue",
  precisa_decisao: "Precisa decisão",
  recusado: "Recusado",
};

/** O nome que aparece na tela para o departamento. Este mapa é uma CÓPIA
 *  DELIBERADA e reduzida do `CLIENT_SAFE_DEPARTMENTS` de
 *  `app/api/brain/portal-data/route.ts` — mas aqui ele é só rótulo de tela
 *  interna, não trava de exposição. A trava continua sendo a de lá. */
const DEPARTAMENTO_ROTULO: Record<string, string> = {
  proposal: "Proposta do projeto",
  strategy: "Estratégia",
  social: "Social Media",
  "social-media": "Social Media",
  design: "Design",
  traffic: "Tráfego Pago",
  "paid-traffic": "Tráfego Pago",
  analytics: "Analytics",
  financeiro: "Financeiro",
  quality: "Revisão de Qualidade",
};

// ─── Integrações ────────────────────────────────────────────────────────────

const GLIFO: Record<string, string> = {
  instagram: "◉",
  facebook: "f",
  whatsapp: "✆",
  google: "G",
  drive: "▲",
};

/** `connected` → verde; `expired`/`error` → atenção; `revoked` → desligado. */
function tomDaConexao(status: string): { tone: IntegrationView["tone"]; label: string } {
  if (status === "connected") return { tone: "ok", label: "Conectado" };
  if (status === "expired") return { tone: "warn", label: "Expirado" };
  if (status === "error") return { tone: "warn", label: "Com erro" };
  if (status === "revoked") return { tone: "off", label: "Revogado" };
  return { tone: "partial", label: status };
}

// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoDaCarga = {
  view: AgencyClientView;
  sheet: ClientSheetData;
  /** Preenchido = a página desenha o estado de erro com esta evidência. */
  error: string | null;
  /** Papel de quem está olhando — a aba "Reconciliar" só existe para master. */
  encontrado: boolean;
};

export async function carregarCliente(
  clientId: string,
  workspaceId: string,
): Promise<ResultadoDaCarga> {
  const vazio = (nome: string): AgencyClientView =>
    emptyAgencyClientView({
      id: clientId, name: nome, initial: inicial(nome),
      category: null, activeSince: null, isActive: false,
      website: null, email: null, phone: null,
    });

  let cliente;
  try {
    cliente = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
      select: {
        id: true, name: true, industry: true, website: true, email: true,
        phone: true, createdAt: true,
      },
    });
  } catch (e) {
    return {
      view: vazio("Cliente"),
      sheet: fichaVazia("Cliente"),
      error: `O banco não respondeu ao carregar este cliente (${e instanceof Error ? e.message : "erro desconhecido"}).`,
      encontrado: false,
    };
  }

  if (!cliente) {
    return { view: vazio("Cliente"), sheet: fichaVazia("Cliente"), error: null, encontrado: false };
  }

  const identidade: ClientIdentity = {
    id: cliente.id,
    name: cliente.name,
    initial: inicial(cliente.name),
    category: cliente.industry || null,
    activeSince: cliente.createdAt.toISOString().slice(0, 7),
    // "Ativo" aqui é um FATO derivado, não um campo: `Client` não tem status
    // neste esquema. Ativo = tem projeto que não terminou. Sem projeto, a tela
    // diz "sem projeto ativo" — nunca "inativo", que seria uma conclusão.
    isActive: false,
    website: cliente.website || null,
    email: cliente.email || null,
    phone: cliente.phone || null,
  };

  try {
    const [projetos, solicitacoesBrain, pedidos, ficha] = await Promise.all([
      prisma.project.findMany({
        where: { clientId, workspaceId },
        select: {
          id: true, name: true, type: true, stage: true, priority: true,
          agents: true, clientRequestId: true, executionStatus: true,
          proposalStatus: true, directionApprovedAt: true, presentedAt: true,
          clientApprovedAt: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.clientRequestDb.findMany({
        where: { clientId },
        select: { id: true, businessName: true, segment: true, status: true, briefingJson: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.contentRequest.findMany({
        where: { clientId },
        select: {
          id: true, title: true, objective: true, status: true, projectId: true,
          createdAt: true, desiredFor: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      lerFichaDeMarca(clientId).catch(() => null),
    ]);

    const idsDeProjeto = projetos.map((p) => p.id);
    const idsDeSolicitacao = solicitacoesBrain.map((s) => s.id);

    const [entregas, tarefas, aprovacoes, mensagens, meta, google, drive] = await Promise.all([
      idsDeProjeto.length
        ? prisma.deliverable.findMany({
            where: { projectId: { in: idsDeProjeto } },
            select: { id: true, name: true, type: true, status: true, projectId: true, version: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      idsDeProjeto.length
        ? prisma.task.findMany({
            where: { projectId: { in: idsDeProjeto } },
            select: { id: true, title: true, status: true, agentId: true, projectId: true },
          })
        : Promise.resolve([]),
      prisma.approvalRequest.findMany({
        where: {
          OR: [
            { clientId },
            ...(idsDeSolicitacao.length ? [{ clientRequestId: { in: idsDeSolicitacao } }] : []),
          ],
        },
        select: {
          id: true, department: true, status: true, requestedBy: true,
          clientVisible: true, reviewedAt: true, expiresAt: true,
          questionOpenedAt: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.portalMessage.findMany({
        where: {
          OR: [
            { clientId },
            ...(idsDeSolicitacao.length ? [{ clientRequestId: { in: idsDeSolicitacao } }] : []),
          ],
        },
        select: { id: true, authorRole: true, authorName: true, body: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 60,
      }),
      // ⚠️ SEM `accessTokenEncrypted`. Ver o cabeçalho.
      prisma.metaConnection.findMany({
        where: { clientId, workspaceId },
        select: { platform: true, name: true, status: true, scopes: true, lastSyncedAt: true, tokenExpiresAt: true },
      }).catch(() => []),
      prisma.googleConnection.findMany({
        where: { clientId, workspaceId },
        select: { title: true, status: true, reviewsSyncedAt: true },
      }).catch(() => []),
      prisma.googleDriveConnection.findMany({
        where: { clientId, workspaceId },
        select: { contaHint: true, status: true, escopos: true, connectedAt: true },
      }).catch(() => []),
    ]);

    // ── Projetos ────────────────────────────────────────────────────────────
    const entregasPorProjeto = new Map<string, typeof entregas>();
    for (const d of entregas) {
      const arr = entregasPorProjeto.get(d.projectId) ?? [];
      arr.push(d);
      entregasPorProjeto.set(d.projectId, arr);
    }
    const tarefasPorProjeto = new Map<string, typeof tarefas>();
    for (const t of tarefas) {
      const arr = tarefasPorProjeto.get(t.projectId) ?? [];
      arr.push(t);
      tarefasPorProjeto.set(t.projectId, arr);
    }

    const projectViews: ProjectView[] = projetos.map((p) => {
      const ds = entregasPorProjeto.get(p.id) ?? [];
      const ts = tarefasPorProjeto.get(p.id) ?? [];
      // O progresso NÃO é um campo gravado: é a posição na trilha real da
      // esteira, lida pelos mesmos carimbos que o resto do sistema usa
      // (`lib/agency/esteira/fases.ts`). Campo de status escrito à mão mente em
      // duas semanas — está escrito no próprio schema.
      const leitura = lerFase({
        propostaAceita: p.proposalStatus === "accepted",
        direcaoAprovadaEm: p.directionApprovedAt,
        apresentadoEm: p.presentedAt,
        aprovadoPeloClienteEm: p.clientApprovedAt,
        execucao: p.executionStatus,
        tarefas: {
          total: ts.length,
          entregues: ts.filter((t) => t.status === "done").length,
          produzindo: ts.filter((t) => t.status === "in_progress").length,
          bloqueadas: ts.filter((t) => t.status === "blocked").length,
        },
        entregaveis: {
          total: ds.length,
          emRevisao: ds.filter((d) => d.status === "in_review").length,
          comRessalva: ds.filter((d) => d.status === "revision_requested").length,
          aprovados: ds.filter((d) => d.status === "approved" || d.status === "delivered").length,
        },
        pedidosAbertos: 0,
      });
      const pos = posicaoNaTrilha(leitura.fase);
      return {
        id: p.id,
        name: p.name,
        kind: p.type || "projeto",
        progress: Math.round((pos / (TRILHA.length - 1)) * 100),
        statusLabel: FASE_ROTULO[leitura.fase] ?? leitura.fase,
        agents: lista(p.agents),
        deliverableCount: ds.length,
        // "Decisões" = aprovações que nasceram deste projeto. Sem vínculo
        // direto no esquema, a única resposta honesta é a contagem de entregas
        // que chegaram a pedir revisão.
        decisionCount: ds.filter((d) => d.status === "in_review" || d.status === "approved").length,
      };
    });

    identidade.isActive = projetos.some((p) => p.stage !== "completed");

    // ── Solicitações (a VOZ do cliente — não a fila interna) ───────────────
    const requestViews: RequestView[] = pedidos.map((r, i) => ({
      id: r.id,
      code: `SOL-${String(i + 1).padStart(3, "0")}`,
      title: r.title,
      routedTo: r.projectId
        ? (projetos.find((p) => p.id === r.projectId)?.name ?? "Projeto")
        : "Aguardando triagem",
      statusLabel: PEDIDO_ROTULO[r.status] ?? r.status,
      when: fmtQuando(r.createdAt) ?? "—",
      priority:
        r.status === "entregue" ? "done"
        : r.status === "precisa_decisao" ? "high"
        : r.status === "em_producao" ? "medium"
        : "low",
    }));

    // ── Entregas ────────────────────────────────────────────────────────────
    const nomeDoProjeto = new Map(projetos.map((p) => [p.id, p.name]));
    const deliverableViews: DeliverableView[] = entregas.map((d) => ({
      id: d.id,
      title: `${d.name}${d.version > 1 ? ` · v${d.version}` : ""}`,
      projectName: nomeDoProjeto.get(d.projectId) ?? null,
      statusLabel: ENTREGA_ROTULO[d.status] ?? d.status,
      when: fmtData(d.updatedAt),
    }));

    // ── Aprovações ──────────────────────────────────────────────────────────
    const approvalViews: ApprovalView[] = aprovacoes
      .filter((a) => a.status === "pending")
      .map((a) => ({
        id: a.id,
        title: DEPARTAMENTO_ROTULO[a.department] ?? a.department,
        context: a.questionOpenedAt
          ? "Dúvida aberta — o prazo está pausado e a bola está com a agência"
          : a.expiresAt
            ? `Prazo até ${fmtData(a.expiresAt)}`
            : "Sem prazo definido",
        statusLabel: a.questionOpenedAt ? "Dúvida aberta" : "Aguardando decisão",
        // `clientVisible` é o campo que decide de quem é a bola. Não é
        // heurística: é o mesmo campo que o portal usa para existir.
        decidesIt: a.clientVisible ? "Cliente" : "Agência",
        when: fmtData(a.createdAt),
      }));

    // ── Chat do Agente Project Manager ─────────────────────────────────────
    // É a MESMA conversa do portal (`PortalMessage`), como manda o handoff:
    // "o chat global do Project Manager é a fonte de verdade; o chat dentro do
    // cliente é uma visão contextual da mesma conversa".
    const chatViews: ChatMessageView[] = mensagens.map((m) => ({
      id: m.id,
      author: m.authorName || (m.authorRole === "client" ? cliente.name : "Agente Project Manager"),
      side: m.authorRole === "client" ? "client" : "pm",
      when: fmtQuando(m.createdAt) ?? "—",
      body: m.body,
    }));

    // ── Integrações ────────────────────────────────────────────────────────
    const integrationViews: IntegrationView[] = [
      ...meta.map((c): IntegrationView => {
        const t = tomDaConexao(c.status);
        const escopos = lista(c.scopes);
        return {
          glyph: GLIFO[c.platform] ?? "◇",
          name: c.name || c.platform,
          scopes: escopos.length ? escopos.join(" · ") : "escopos não registrados",
          statusLabel: t.label,
          tone: t.tone,
          lastSync: fmtQuando(c.lastSyncedAt),
          consumers: null,
          agencyAccess: "Somente leitura",
        };
      }),
      ...google.map((c): IntegrationView => {
        const t = tomDaConexao(c.status);
        return {
          glyph: GLIFO.google!,
          name: c.title || "Google Business Profile",
          scopes: "avaliações · perfil do local",
          statusLabel: t.label,
          tone: t.tone,
          lastSync: fmtQuando(c.reviewsSyncedAt),
          consumers: null,
          agencyAccess: "Somente leitura",
        };
      }),
      ...drive.map((c): IntegrationView => {
        const t = tomDaConexao(c.status);
        return {
          glyph: GLIFO.drive!,
          name: `Google Drive${c.contaHint ? ` · ${c.contaHint}` : ""}`,
          scopes: c.escopos || "escopos não registrados",
          statusLabel: t.label,
          tone: t.tone,
          lastSync: fmtQuando(c.connectedAt),
          consumers: null,
          agencyAccess: "Somente leitura",
        };
      }),
    ];

    // ── Marca ───────────────────────────────────────────────────────────────
    // O mapa de conhecimento é a ficha REAL dos nove campos
    // (`lib/agency/esteira/ficha-de-marca.ts`), não uma lista decorativa. Cada
    // área é um campo, e o estado vem do `fieldStatesJson` — que existe
    // justamente para "não sei" não virar "não há".
    const brand: BrandView = ficha
      ? {
          health: ficha.campos.length ? Math.round((ficha.definidos / ficha.campos.length) * 100) : null,
          headline: cliente.name,
          tagline: ficha.campos.find((c) => c.campo === "proposito_e_promessa" && c.estado === "definido")?.valor || null,
          knowledge: ficha.campos.map((c) => ({
            area: c.rotulo,
            pct: c.estado === "definido" ? 100 : c.estado === "herdado_default" ? 50 : 0,
            state: c.estado === "definido" ? "confirmed" : c.estado === "herdado_default" ? "mixed" : "missing",
          })),
        }
      : { health: null, headline: cliente.name, tagline: null, knowledge: [] };

    // ── Cascata do Agente PM (INTERNO) ─────────────────────────────────────
    // O handoff é explícito: o painel interno nunca deve confundir solicitação
    // do cliente com tarefa operacional. Por isso a cascata é montada a partir
    // das TAREFAS (operacional) e aparece só no chat interno.
    const cascade: Cascade[] = projetos
      .map((p) => {
        const ts = tarefasPorProjeto.get(p.id) ?? [];
        const agentes = [...new Set(ts.map((t) => t.agentId).filter((x): x is string => !!x))];
        return agentes.length ? { requestId: p.id, chain: [p.name, ...agentes] } : null;
      })
      .filter((x): x is Cascade => x !== null);

    // ── KPIs por área ───────────────────────────────────────────────────────
    const bloqueadas = tarefas.filter((t) => t.status === "blocked").length;
    const emAndamento = tarefas.filter((t) => t.status === "in_progress").length;
    const aguardandoCliente = approvalViews.filter((a) => a.decidesIt === "Cliente").length;

    const areaMetrics: AreaMetrics = {
      ...emptyAreaMetrics(),
      // ⚠️ SEIS ITENS, e o número não é estético: `.kpis` da referência é uma
      // grade de seis colunas. Com cinco, a faixa fica com uma célula vazia à
      // direita — que o olho lê como "faltou carregar alguma coisa", não como
      // "só existem cinco". Medido na captura de 1280.
      overview: [
        comDado("PROJETOS ATIVOS", projetos.filter((p) => p.stage !== "completed").length, "iniciativas em curso"),
        comDado("SOLICITAÇÕES ABERTAS", pedidos.filter((r) => r.status !== "entregue" && r.status !== "recusado").length, "pedidos do cliente na fila"),
        comDado("ENTREGAS", entregas.length, "registradas para este cliente"),
        aguardandoCliente > 0
          ? comDado("AGUARDANDO O CLIENTE", aguardandoCliente, "decisões na mão dele")
          : semDado("AGUARDANDO O CLIENTE", "nada pendente do lado do cliente"),
        bloqueadas > 0
          ? comDado("TAREFAS BLOQUEADAS", bloqueadas, "precisam de destravamento")
          : semDado("TAREFAS BLOQUEADAS", "nenhuma tarefa bloqueada"),
        semDado("RECEITA ATRIBUÍDA", "nenhuma conta de analytics conectada"),
      ],
      requests: [
        comDado("SOLICITAÇÕES", pedidos.length, "pedidos do cliente registrados"),
        comDado("EM PRODUÇÃO", pedidos.filter((r) => r.status === "em_producao").length, "sendo produzidos agora"),
        comDado("PRECISAM DE DECISÃO", pedidos.filter((r) => r.status === "precisa_decisao").length, "a máquina não resolveu sozinha"),
        semDado("TEMPO MÉDIO DE RESPOSTA", "o histórico de resposta ainda não é medido"),
      ],
      projects: [
        comDado("PROJETOS", projetos.length, "no relacionamento inteiro"),
        comDado("EM ANDAMENTO", emAndamento, "tarefas sendo tocadas"),
        comDado("ENTREGAS", entregas.length, "produzidas até aqui"),
        comDado("APROVADAS", entregas.filter((d) => d.status === "approved" || d.status === "delivered").length, "passaram pelo gate"),
        bloqueadas > 0
          ? comDado("BLOQUEADAS", bloqueadas, "tarefas travadas")
          : semDado("BLOQUEADAS", "nenhuma tarefa travada"),
      ],
      social: [
        comDado("REDES CONECTADAS", meta.filter((c) => c.status === "connected").length, "contas ligadas pelo cliente"),
        semDado("ALCANCE 30D", "depende de conta de rede conectada e sincronizada"),
        semDado("ENGAJAMENTO", "depende de conta de rede conectada e sincronizada"),
        semDado("SEGUIDORES", "depende de conta de rede conectada e sincronizada"),
      ],
      traffic: [
        semDado("INVESTIMENTO", "nenhuma conta de anúncio conectada a este cliente"),
        semDado("RECEITA ATRIBUÍDA", "nenhuma conta de anúncio conectada a este cliente"),
        semDado("ROAS", "nenhuma conta de anúncio conectada a este cliente"),
        semDado("CPA", "nenhuma conta de anúncio conectada a este cliente"),
      ],
      integrations: [
        comDado("CONEXÕES", integrationViews.length, "cadastradas para este cliente"),
        comDado("SAUDÁVEIS", integrationViews.filter((i) => i.tone === "ok").length, "respondendo normalmente"),
        comDado("COM ATENÇÃO", integrationViews.filter((i) => i.tone === "warn" || i.tone === "partial").length, "precisam de ação do cliente"),
        comDado("DESLIGADAS", integrationViews.filter((i) => i.tone === "off").length, "revogadas ou nunca ligadas"),
      ],
    };

    // ── Ficha do cliente ───────────────────────────────────────────────────
    const brief = solicitacoesBrain[0];
    let escopo: Record<string, unknown> = {};
    if (brief?.briefingJson) {
      try {
        escopo = (JSON.parse(brief.briefingJson)?.scope ?? {}) as Record<string, unknown>;
      } catch { /* briefing malformado não vira briefing inventado */ }
    }
    const texto = (k: string): string | null => {
      const v = escopo[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const sheet: ClientSheetData = {
      ...fichaVazia(cliente.name),
      origin: brief
        ? { label: "Briefing", note: `Registrado em ${fmtData(brief.createdAt)}` }
        : { label: null, note: null },
      relationship: {
        label: identidade.isActive ? "Cliente ativo" : "Sem projeto em curso",
        note: identidade.activeSince ? `Cadastrado em ${identidade.activeSince}` : null,
      },
      company: [
        { term: "Nome da marca", value: cliente.name },
        { term: "Setor", value: cliente.industry || null },
        { term: "Site", value: cliente.website || null },
        { term: "Cadastrado em", value: fmtData(cliente.createdAt) },
      ],
      contact: [
        { term: "E-mail", value: cliente.email || null },
        { term: "Telefone", value: cliente.phone || null },
      ],
      briefing: {
        summary: brief ? `${brief.businessName}${brief.segment ? ` · ${brief.segment}` : ""}` : null,
        pain: texto("pain") ?? texto("challenge"),
        goal: texto("goal") ?? texto("objective"),
        audience: texto("targetAudience"),
      },
      lastReview: fmtData(entregas[0]?.updatedAt ?? null),
    };

    const view: AgencyClientView = {
      client: identidade,
      projects: projectViews,
      requests: requestViews,
      deliverables: deliverableViews,
      approvals: approvalViews,
      integrations: integrationViews,
      brand,
      chat: chatViews,
      results: [],
      areaMetrics,
      internal: { cascade },
    };

    return { view, sheet, error: null, encontrado: true };
  } catch (e) {
    // O erro carrega a própria evidência (guardrail 6): a tela mostra a
    // mensagem real, não "algo deu errado".
    return {
      view: { ...vazio(cliente.name), client: identidade },
      sheet: fichaVazia(cliente.name),
      error: e instanceof Error ? e.message : "Falha desconhecida ao ler os dados do cliente.",
      encontrado: true,
    };
  }
}
