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
  emptyStrategyView,
  type AgencyClientView,
  type ApprovalDecision,
  type ApprovalView,
  type AreaMetrics,
  type BrandView,
  type Cascade,
  type ChatMessageView,
  type ClientIdentity,
  type ClientMaterialView,
  type DeliverableView,
  type IntegrationView,
  type Metric,
  type ProjectView,
  type RequestView,
  type StrategyRoomView,
  type StrategyView,
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

// ─── Entregas: departamento e visibilidade ──────────────────────────────────

/** De que área saiu a entrega. Derivado de `Deliverable.type`, que é o único
 *  campo que carrega a origem. Sem correspondência → `null`, e a tela escreve
 *  "departamento não registrado" em vez de chutar "Design". */
const DEPARTAMENTO_DA_ENTREGA: Record<string, string> = {
  post: "Social Media", carrossel: "Social Media", reels: "Social Media",
  legenda: "Social Media", calendario: "Social Media",
  arte: "Design", peca: "Design", banner: "Design", identidade: "Design",
  brandbook: "Branding", marca: "Branding", moodboard: "Branding",
  campanha: "Tráfego Pago", anuncio: "Tráfego Pago", criativo: "Tráfego Pago",
  estrategia: "Estratégia", plano: "Estratégia", proposta: "Estratégia",
  relatorio: "Analytics",
};

function departamentoDaEntrega(tipo: string): string | null {
  const chave = tipo.toLowerCase().trim();
  return DEPARTAMENTO_DA_ENTREGA[chave] ?? null;
}

/** Bytes em algo que uma pessoa lê. `null` quando o tamanho não foi gravado —
 *  "0 B" seria a tela afirmando que o arquivo está vazio. */
function fmtTamanho(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A DECISÃO DO CARD, traduzida de `ApprovalRequest`.
 *
 * `questionOpenedAt` vem ANTES do status de propósito: "tenho uma dúvida" não é
 * decisão (o status continua `pending` no esquema, e o prazo pausa). Se a
 * ordem invertesse, um card com dúvida aberta apareceria como "aguardando
 * decisão" simples e alguém cobraria o cliente por uma bola que está com a
 * agência.
 */
function decisaoDaAprovacao(a: { status: string; questionOpenedAt: Date | null }): ApprovalDecision {
  if (a.questionOpenedAt) return "duvida_aberta";
  if (a.status === "approved") return "aprovado";
  if (a.status === "revision_requested") return "ajuste_pedido";
  if (a.status === "rejected") return "reprovado";
  return "pendente";
}

const ROTULO_DA_DECISAO: Record<ApprovalDecision, string> = {
  pendente: "Aguardando decisão",
  aprovado: "Aprovado",
  ajuste_pedido: "Ajustes pedidos",
  reprovado: "Reprovado — refazer",
  duvida_aberta: "Dúvida aberta",
};

/** Lê o resumo executivo e os especialistas de `StrategyRoom.analysisJson`.
 *  JSON malformado NÃO vira sala vazia silenciosa: vira sala sem resumo, com o
 *  status preservado, porque "não consegui ler" e "não tem" são coisas
 *  diferentes. */
function lerSalaDeEstrategia(json: string | null): { summary: string | null; specialists: number | null; hypotheses: string[] } {
  if (!json) return { summary: null, specialists: null, hypotheses: [] };
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const summary =
      typeof o.executiveSummary === "string" ? o.executiveSummary
      : typeof o.summary === "string" ? o.summary
      : typeof o.synthesis === "string" ? o.synthesis
      : null;
    const specialists = Array.isArray(o.specialists) ? o.specialists.length : null;
    const hipoteses = Array.isArray(o.hypotheses)
      ? o.hypotheses.filter((h): h is string => typeof h === "string")
      : Array.isArray(o.opportunities)
        ? o.opportunities.filter((h): h is string => typeof h === "string")
        : [];
    return { summary: summary?.trim() || null, specialists, hypotheses: hipoteses };
  } catch {
    return { summary: null, specialists: null, hypotheses: [] };
  }
}

const ESTADO_DA_SALA: Record<string, { label: string; tone: StrategyRoomView["tone"] }> = {
  generating: { label: "Em análise", tone: "partial" },
  ready: { label: "Pronta", tone: "ok" },
  failed: { label: "Falhou", tone: "warn" },
};

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
    const [projetos, solicitacoesBrain, pedidos, ficha, cerebroDaMarca] = await Promise.all([
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
      // O POSICIONAMENTO vem daqui, e não da ficha de marca: os nove campos da
      // ficha (propósito, público, voz, léxico, proibições, referências,
      // atributos formais, limites de promessa, hierarquia) NÃO incluem
      // posicionamento. Ele é campo do `BrandBrain`, e o contrato manda buscá-lo
      // lá. Ler "propósito e promessa" como se fosse posicionamento seria trocar
      // uma coisa pela outra — promessa é o que o cliente ganha; posicionamento
      // é o lugar que a marca ocupa contra as alternativas.
      prisma.brandBrain.findUnique({
        where: { clientId },
        select: { positioning: true },
      }).catch(() => null),
    ]);

    const idsDeProjeto = projetos.map((p) => p.id);
    const idsDeSolicitacao = solicitacoesBrain.map((s) => s.id);

    const [entregas, tarefas, aprovacoes, mensagens, meta, google, drive, briefings, salas, materiais] = await Promise.all([
      idsDeProjeto.length
        ? prisma.deliverable.findMany({
            where: { projectId: { in: idsDeProjeto } },
            select: {
              id: true, name: true, type: true, status: true, projectId: true,
              version: true, updatedAt: true,
              // `visibility` é o que separa "a agência produziu" de "o cliente
              // já viu". Sem ele a aba de Entregas mostraria como entregue o
              // que ainda está em cima da mesa.
              visibility: true,
              content: true,
              _count: { select: { versions: true } },
            },
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
          questionOpenedAt: true, createdAt: true, reviewNote: true,
          // O VÍNCULO COM A PEÇA. Sem ele o card é "aprove alguma coisa" — e em
          // 14/08 uma tela desta casa deixou aprovar peça sem mostrar a arte.
          // Contrato §9: "nunca exibir aprovação sem conteúdo".
          deliverableVersion: {
            select: {
              id: true, number: true, content: true,
              deliverable: { select: { id: true, name: true } },
            },
          },
          _count: { select: { comments: true } },
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
      // ── ESTRATÉGIA ────────────────────────────────────────────────────────
      // Objetivo, público, mensagem e critério de sucesso são campos REAIS do
      // `Briefing`. Não existe tabela de "objetivo estratégico do cliente"
      // nesta casa, e inventar uma vazia seria pior que ler a que existe.
      prisma.briefing.findMany({
        where: { clientId },
        select: {
          id: true, goal: true, audience: true, keyMessage: true,
          successCriteria: true, notes: true, projectId: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }).catch(() => []),
      idsDeProjeto.length
        ? prisma.strategyRoom.findMany({
            where: { projectId: { in: idsDeProjeto } },
            select: { id: true, projectId: true, status: true, analysisJson: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          }).catch(() => [])
        : Promise.resolve([]),
      // ── MATERIAL DO CLIENTE ───────────────────────────────────────────────
      // `kind = "inbound"` é o que o CLIENTE mandou. A consulta NÃO traz
      // "generated" nem "deliverable" de propósito: se as três viessem juntas,
      // bastaria um esquecimento de filtro na tela para o logo que o cliente
      // enviou aparecer na fila de aprovação dele mesmo.
      prisma.mediaAsset.findMany({
        where: { workspaceId, clientId, kind: "inbound" },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedBy: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
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
      title: d.name,
      projectName: nomeDoProjeto.get(d.projectId) ?? null,
      department: departamentoDaEntrega(d.type),
      statusLabel: ENTREGA_ROTULO[d.status] ?? d.status,
      when: fmtData(d.updatedAt),
      version: d.version,
      versionCount: d._count.versions,
      // Só "compartilhado" conta como apresentada. "aguardando_publicacao" é a
      // agência tendo terminado, não o cliente tendo visto — e a diferença é a
      // que separa "entregamos" de "está pronto aqui dentro".
      shared: d.visibility === "compartilhado",
      hasContent: Boolean(d.content && d.content.trim().length > 0) || d._count.versions > 0,
    }));

    // ── Material enviado pelo CLIENTE ───────────────────────────────────────
    // Lista separada, nunca concatenada à de cima. Ver o comentário do tipo.
    const clientMaterials: ClientMaterialView[] = materiais.map((m) => ({
      id: m.id,
      fileName: m.fileName,
      mimeType: m.mimeType,
      size: fmtTamanho(m.sizeBytes),
      uploadedBy: m.uploadedBy,
      when: fmtData(m.createdAt),
    }));

    // ── Aprovações ──────────────────────────────────────────────────────────
    //
    // ⚠️ A LISTA NÃO É MAIS SÓ DE `pending`, e a mudança é do contrato.
    // O porte anterior filtrava `status === "pending"`, o que fazia a aba de
    // Aprovações esquecer tudo que já foi decidido — inclusive as reprovações.
    // Mas §9 pede "histórico auditável" e §11 pede que peça reprovada não fique
    // agendada: as duas coisas exigem que o card reprovado continue visível.
    // O que a tela faz com cada estado é decisão dela; sumir com o registro
    // não era.
    const approvalViews: ApprovalView[] = aprovacoes.map((a) => {
      const decision = decisaoDaAprovacao(a);
      const v = a.deliverableVersion;
      return {
        id: a.id,
        title: DEPARTAMENTO_ROTULO[a.department] ?? a.department,
        context: a.questionOpenedAt
          ? "Dúvida aberta — o prazo está pausado e a bola está com a agência"
          : a.expiresAt
            ? `Prazo até ${fmtData(a.expiresAt)}`
            : "Sem prazo definido",
        statusLabel: ROTULO_DA_DECISAO[decision],
        decision,
        // `clientVisible` é o campo que decide de quem é a bola. Não é
        // heurística: é o mesmo campo que o portal usa para existir.
        decidesIt: a.clientVisible ? "Cliente" : "Agência",
        when: fmtData(a.createdAt),
        // `null` quando o card não aponta para peça nenhuma. A tela desenha o
        // aviso e NÃO desenha botão de decisão.
        content: v
          ? {
              label: v.deliverable?.name ?? "Entrega sem nome",
              versionLabel: `v${v.number}`,
              deliverableId: v.deliverable?.id ?? null,
            }
          : null,
        note: a.reviewNote?.trim() || null,
        commentCount: a._count.comments,
      };
    });

    /** Só o que ainda espera alguém. É o número do selo e do contador de aba —
     *  contar decidido junto faria o cabeçalho cobrar uma bola que já rolou. */
    const aprovacoesPendentes = approvalViews.filter(
      (a) => a.decision === "pendente" || a.decision === "duvida_aberta",
    );

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

    // ── Estratégia ──────────────────────────────────────────────────────────
    //
    // A aba nova. Ela NÃO inventa tabela: lê o `Briefing` mais recente (o único
    // lugar desta casa onde objetivo, público, mensagem-chave e critério de
    // sucesso são escritos por gente), o posicionamento da ficha de marca e as
    // `StrategyRoom` dos projetos. Roadmap estratégico e Decision Log não têm
    // fonte — e por isso saem VAZIOS com o motivo, nunca deduzidos do que está
    // perto. Guardrail 1.
    const briefing = briefings[0] ?? null;
    const nada = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

    const salaViews: StrategyRoomView[] = salas.map((s) => {
      const lida = lerSalaDeEstrategia(s.analysisJson);
      const estado = ESTADO_DA_SALA[s.status] ?? { label: s.status, tone: "partial" as const };
      return {
        id: s.id,
        projectId: s.projectId,
        projectName: nomeDoProjeto.get(s.projectId) ?? "Projeto sem nome",
        statusLabel: estado.label,
        tone: estado.tone,
        summary: lida.summary,
        specialists: lida.specialists,
        when: fmtData(s.updatedAt),
      };
    });

    const hipoteses = salas.flatMap((s) =>
      lerSalaDeEstrategia(s.analysisJson).hypotheses.map((h) => ({
        title: h,
        note: nomeDoProjeto.get(s.projectId) ?? null,
        roomId: s.id,
      })),
    );

    const strategy: StrategyView = {
      ...emptyStrategyView(),
      objectives: briefing
        ? [
            { label: "Objetivo do cliente", value: nada(briefing.goal), source: "Briefing do projeto" },
            { label: "Critério de sucesso", value: nada(briefing.successCriteria), source: "Briefing do projeto" },
            { label: "Observações da estratégia", value: nada(briefing.notes), source: "Briefing do projeto" },
          ]
        : [],
      positioning: nada(cerebroDaMarca?.positioning),
      audience: nada(briefing?.audience),
      keyMessage: nada(briefing?.keyMessage),
      successCriteria: nada(briefing?.successCriteria),
      rooms: salaViews,
      hypotheses: hipoteses,
      // Riscos declarados: as tarefas bloqueadas são o ÚNICO risco que esta
      // casa registra de verdade. Não é o "risco estratégico" do mockup, e a
      // tela diz isso com todas as letras em vez de fingir que é.
      risks: tarefas
        .filter((t) => t.status === "blocked")
        .map((t) => ({ title: t.title, note: nomeDoProjeto.get(t.projectId) ?? null })),
    };

    // ── KPIs por área ───────────────────────────────────────────────────────
    const bloqueadas = tarefas.filter((t) => t.status === "blocked").length;
    const emAndamento = tarefas.filter((t) => t.status === "in_progress").length;
    const aguardandoCliente = aprovacoesPendentes.filter((a) => a.decidesIt === "Cliente").length;
    const compartilhadas = deliverableViews.filter((d) => d.shared).length;

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
      // ── As faixas que faltavam. Toda aba tem a sua: aba sem faixa de número
      //    fica com o cabeçalho colado no primeiro card, e a trilha de abas
      //    passa a "pular" de altura ao navegar.
      strategy: [
        strategy.objectives.some((o) => o.value !== null)
          ? comDado("OBJETIVO", "definido", "escrito no briefing do projeto")
          : semDado("OBJETIVO", "nenhum briefing com objetivo registrado"),
        strategy.positioning
          ? comDado("POSICIONAMENTO", "definido", "confirmado na ficha de marca")
          : semDado("POSICIONAMENTO", "ainda não confirmado na ficha de marca"),
        comDado("SALAS DE ESTRATÉGIA", salaViews.length, "debates registrados"),
        comDado("HIPÓTESES", hipoteses.length, "lidas das salas"),
        strategy.risks.length > 0
          ? comDado("RISCOS ABERTOS", strategy.risks.length, "tarefas bloqueadas hoje")
          : semDado("RISCOS ABERTOS", "nenhuma tarefa bloqueada"),
        semDado("ROADMAP", "não existe tabela de roadmap estratégico nesta casa"),
      ],
      branding: [
        ficha ? comDado("CAMPOS DEFINIDOS", `${ficha.definidos}/${ficha.campos.length}`, "da ficha de marca") : semDado("CAMPOS DEFINIDOS", "nenhuma ficha de marca aberta"),
        brand.health !== null ? comDado("PRONTIDÃO", `${brand.health}%`, "conhecimento confirmado") : semDado("PRONTIDÃO", "sem ficha para medir"),
        semDado("ATIVOS DE MARCA", "os arquivos de marca vivem no Material de Marca, abaixo"),
        semDado("AUDITORIA", "o Brand Auditor ainda não roda para este cliente"),
      ],
      design: [
        comDado("PEÇAS REGISTRADAS", deliverableViews.filter((d) => d.department === "Design").length, "entregas de Design"),
        comDado("EM REVISÃO", entregas.filter((d) => d.status === "in_review").length, "aguardando revisão interna"),
        comDado("COM AJUSTE PEDIDO", entregas.filter((d) => d.status === "revision_requested").length, "voltaram para a mesa"),
        semDado("CAPACIDADE DA EQUIPE", "a capacidade criativa não é registrada neste sistema"),
      ],
      approvals: [
        comDado("AGUARDANDO DECISÃO", aprovacoesPendentes.length, "cards abertos"),
        comDado("COM O CLIENTE", aguardandoCliente, "a bola está do lado dele"),
        comDado("COM A AGÊNCIA", aprovacoesPendentes.length - aguardandoCliente, "revisão interna ou dúvida aberta"),
        comDado("DÚVIDAS ABERTAS", approvalViews.filter((a) => a.decision === "duvida_aberta").length, "prazo pausado"),
        comDado("REPROVADAS", approvalViews.filter((a) => a.decision === "reprovado").length, "descartadas como direção"),
        comDado("SEM CONTEÚDO ANEXADO", approvalViews.filter((a) => a.content === null).length, "não podem ser decididas"),
      ],
      deliveries: [
        comDado("ENTREGAS DA AGÊNCIA", deliverableViews.length, "produzidas para este cliente"),
        comDado("APRESENTADAS", compartilhadas, "o cliente já viu"),
        comDado("AINDA INTERNAS", deliverableViews.length - compartilhadas, "prontas mas não apresentadas"),
        comDado("MATERIAL DO CLIENTE", clientMaterials.length, "arquivos que ELE mandou"),
      ],
      intel: [
        comDado("FONTES CONECTADAS", integrationViews.filter((i) => i.tone === "ok").length, "respondendo hoje"),
        semDado("SÍNTESE EXECUTIVA", "depende de série histórica conectada"),
        semDado("PREVISÃO DE RECEITA", "depende de conta de analytics conectada"),
        semDado("DECISION LOG", "não existe tabela de decisões do relacionamento"),
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
      clientMaterials,
      approvals: approvalViews,
      integrations: integrationViews,
      brand,
      strategy,
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
