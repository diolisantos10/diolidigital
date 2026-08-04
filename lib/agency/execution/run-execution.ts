// run-execution.ts — o NÚCLEO da produção autônoma, extraído da rota HTTP para
// que TANTO o botão (rota) QUANTO o cron de recuperação chamem a MESMA lógica.
//
// Confiabilidade (a razão de existir): antes, o motor era disparado do navegador
// e a entrega sumia se a aba fechasse. Agora o progresso é marcado no BANCO
// (executionStatus/attempts/error) e um cron recupera projetos travados. É
// IDEMPOTENTE — um departamento que já produziu é pulado, então re-rodar nunca
// duplica. Nunca inventa: sem chave de IA, pula; faltando material, pergunta ao
// cliente pelo portal.

import { prisma } from "@/lib/db/client";
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
import { generate } from "@/lib/ai/generate";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { planProduction, type ProductionPlan } from "@/lib/agency/execution/pm-conductor";
import {
  auditDeliverable, revisionStatusDoVeredito,
  foiReprovadaPelaQualidade, ficouSemArbitro,
  type VereditoDaQualidade,
} from "@/lib/agency/execution/quality-auditor";
import { getActiveInsights, buildInsightBlock } from "@/lib/agency/radar/library";
import { moverTarefasDoAgente, marcarEntregue } from "@/lib/agency/esteira/tarefas";
import { abrirPedido, cobrarCliente } from "@/lib/agency/esteira/pedidos";
import {
  DEPARTAMENTOS, ctxBlock,
  type Ctx, type Departamento, type Especialista,
} from "@/lib/agency/execution/especialistas";
import {
  conferirPisoDeVerdade, resumirViolacoes,
  type VerdadeDoCliente,
} from "@/lib/agency/execution/piso-de-verdade";
import { sinteseDoFeedDoCliente } from "@/lib/agency/execution/leitura-do-cliente";
import {
  VERSAO_DA_MEDICAO, versaoDaMedicao,
  type MedicaoDoMes,
} from "@/lib/agency/esteira/mes";

/** Conteúdo mínimo aceitável de uma entrega (gate de saída: nada vazio/lixo vai ao cliente). */
const MIN_DELIVERABLE_CHARS = 40;
/** Máximo de revisões que a Qualidade pede antes de publicar (bounded — sem loop infinito). */
const MAX_QUALITY_REVISIONS = 1;
/** Tentativas de corrigir dado inventado antes de barrar a peça de vez. Uma é
 *  suficiente: se o modelo repetiu a invenção com o parecer na mão, insistir só
 *  gasta tokens — e a peça não pode ir ao cliente de qualquer forma. */
const MAX_CORRECOES_DE_PISO = 1;

function deliverableMarkdown(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const lines: string[] = [];
  if (typeof data.summary === "string") lines.push(data.summary, "");
  items.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const head = (it.headline ?? it.angle ?? it.direction ?? `Item ${i + 1}`) as string;
    lines.push(`**${i + 1}. ${head}**`);
    for (const [k, label] of [["format", "Formato"], ["caption", "Legenda"], ["cenas", "Cenas"], ["visual", "Visual"], ["direction", "Direção"], ["palette", "Paleta"], ["cta", "CTA"], ["audience", "Público"], ["note", "Obs"]] as const) {
      if (typeof it[k] === "string" && (it[k] as string).trim()) lines.push(`- ${label}: ${it[k]}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

export interface ExecutionResult {
  ok: boolean;
  status: "done" | "failed" | "skipped_running";
  produced: string[];
  askedClient: string[];
  skipped: string[];
  /** Como o PM regeu esta produção (ordem dos departamentos, objetivo). */
  pmPlan?: { orderedDepartments: string[]; goal: string; pmMode: string };
  /** Parecer da Qualidade por entrega. TRÊS estados — `nao_auditado` não é
   *  aprovação, é ausência de árbitro (ver `quality-auditor.ts`). */
  qualityAudit?: Array<{ department: string; verdict: VereditoDaQualidade; issues: string[] }>;
  /** Peças que a Qualidade REPROVOU e que sobreviveram às revisões. Não são
   *  apresentadas ao cliente: `apresentar`/`apresentarCiclo` recusam enquanto
   *  existir `quality_flag`, e `pacote-travado.ts` refaz até escalar. */
  reprovadosPelaQualidade?: ReprovadoPelaQualidade[];
  /** Peças que foram ao cliente SEM árbitro (IA da Qualidade fora do ar, timeout
   *  ou resposta ilegível). Não bloqueiam — mas nunca contam como aprovadas. */
  naoAuditados?: NaoAuditado[];
  /** Quantos pedidos de material o PM cobrou do cliente nesta passada. */
  pedidosCobrados?: number;
  /** O PM tentou apresentar o pacote ao cliente sozinho? Ausente = nem tentou
   *  (pacote incompleto). `ok: false` = tentou e foi BARRADO — quase sempre
   *  pela Qualidade, e é exatamente para isso que o freio existe. */
  apresentado?: ApresentacaoAutomatica;
  /** Peças que afirmaram dado que a agência não sustenta e NÃO foram publicadas.
   *  Diferente do parecer da Qualidade: isto é fato objetivo, e bloqueia. */
  barradosNoPiso?: BarradoNoPiso[];
  error?: string;
}

export interface BarradoNoPiso {
  especialista: string;
  violacoes: string[];
  parecer: string;
}

export interface ReprovadoPelaQualidade {
  especialista: string;
  deliverableId: string;
  issues: string[];
  parecer: string;
}

export interface NaoAuditado {
  especialista: string;
  deliverableId: string;
  /** Por que ninguém olhou: `ia_indisponivel` | `timeout` | `erro` | `resposta_invalida`. */
  motivo: string;
}

export interface ApresentacaoAutomatica {
  ok: boolean;
  motivo?: string;
}

/**
 * O cliente já tem foto/vídeo próprio para a agência usar?
 *
 * É função com nome, e não leitura solta no meio do contexto, porque a resposta
 * mora em TRÊS campos que o briefing escreve com nomes diferentes — e nenhum
 * deles se chama "material próprio". Um `scope.hasRawMaterial` solto parece
 * certo, compila, roda, e está sempre falso.
 *
 * A ordem importa: `needsVideoProduction === true` é resposta EXPLÍCITA do
 * cliente ("a Dioli produz o vídeo") e ganha de qualquer outro sinal.
 */
function temMaterialProprio(scope: Record<string, unknown>): boolean {
  const social = (scope.social ?? {}) as Record<string, unknown>;
  if (social.needsVideoProduction === true) return false;
  return (
    social.hasPhotos === true ||
    social.hasVideomaker === true ||
    social.creativesReady === true ||
    // Compatibilidade com briefing preenchido por outra via.
    scope.hasRawMaterial === true ||
    scope.materialBruto === true
  );
}

/**
 * Roda a produção de um projeto de ponta a ponta, com estado durável no banco.
 * Sem sessão — a rota HTTP já autentica; o cron chama direto. Idempotente.
 */
export async function runProjectExecution(projectId: string): Promise<ExecutionResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto não encontrado" };
  if (!project.clientRequestId) {
    await prisma.project.update({ where: { id: projectId }, data: { executionStatus: "failed", executionError: "Projeto sem solicitação vinculada" } });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto sem solicitação vinculada" };
  }

  // Trava anti-concorrência: se já está rodando há pouco, não roda de novo.
  if (project.executionStatus === "running" && project.executionStartedAt && Date.now() - project.executionStartedAt.getTime() < 10 * 60_000) {
    return { ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [], error: "já em execução" };
  }

  // ── O PORTÃO DE DIREÇÃO ────────────────────────────────────────────────────
  // A produção inteira só roda depois que o cliente avaliza o caminho. Aprovar
  // uma direção custa uma conversa; refazer um mês de produção custa o mês.
  // Sem este portão, a agência descobre que errou o rumo depois de gastar tudo.
  if (!project.directionApprovedAt) {
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "idle", executionError: null },
    }).catch(() => { /* best-effort */ });
    return {
      ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [],
      error: "aguardando o cliente aprovar a direção — a produção não começa antes disso",
    };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      executionStatus: "running",
      executionStartedAt: new Date(),
      executionRequestedAt: project.executionRequestedAt ?? new Date(),
      executionAttempts: { increment: 1 },
      executionError: null,
    },
  });

  const clientRequestId = project.clientRequestId;
  try {
    // Qual ciclo está aberto agora. NULO no pacote inicial — o projeto ainda não
    // virou rotina, e as entregas dele nascem sem ciclo (é o que `aprovarPacote`
    // depois carimba como sendo do ciclo 1).
    const cicloDoMomento = (await import("@/lib/agency/esteira/ciclos"))
      .cicloAberto(projectId)
      .then((c) => c?.id ?? null)
      .catch(() => null);
    const cicloId = await cicloDoMomento;

    const [req, client, artifacts, existing, materiaisResolvidos, feedDoCliente] = await Promise.all([
      prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
      prisma.client.findFirst({ where: { id: project.clientId }, include: { brandBrain: true } }),
      prisma.brainArtifact.findMany({ where: { clientRequestId, status: "approved" }, select: { department: true, canvasJson: true } }),
      // ── A FOLHA EM BRANCO DO MÊS ─────────────────────────────────────────
      // A idempotência é por especialista DENTRO DO CICLO. Era por projeto, e
      // valia para sempre: o cliente vitalício recebia uma entrega na vida —
      // no mês 2 o motor via "todos já produziram" e não fazia nada. Nenhum
      // teste pegava, porque cada peça estava certa; a operação contínua é que
      // não existia.
      prisma.deliverable.findMany({
        where: { projectId, cycleId: cicloId },
        select: { ownerAgentId: true },
      }),
      // O que o cliente já entregou. Sem isto, quem depende de material seria
      // cobrado para sempre — inclusive depois de o cliente ter respondido.
      prisma.materialRequest.findMany({
        where: { projectId, status: { not: "pending" } },
        select: { type: true },
      }),
      // ── A LEITURA MINUCIOSA DO CLIENTE (pedido do CEO, 04/08/2026) ───────
      // Uma vez por execução, ANTES de qualquer especialista produzir: o feed
      // real do Instagram vira síntese e entra no contexto de TODOS. Nunca
      // lança e nunca trava — sem conexão, devolve a degradação declarada
      // ("feed não lido: <motivo>") que proíbe inferir estilo do nada.
      sinteseDoFeedDoCliente(project.workspaceId, project.clientId, clientRequestId),
    ]);
    if (!req) throw new Error("Solicitação não encontrada");

    const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })() as Record<string, unknown>;
    const services = (() => { try { return JSON.parse(req.services ?? "[]"); } catch { return []; } })() as string[];
    const objectives = (() => { try { return JSON.parse(req.objectives ?? "[]"); } catch { return []; } })() as string[];
    const strategyArtifact = artifacts.find((a) => a.department === "strategy");
    const strategyHeadline = (() => {
      if (!strategyArtifact) return "";
      try { const c = JSON.parse(strategyArtifact.canvasJson); return (c.positioning ?? c.mainObjective ?? c.summary ?? "") as string; } catch { return ""; }
    })();
    const brand = client?.brandBrain ?? null;

    const context: Ctx = {
      businessName: req.businessName || client?.name || "o cliente",
      segment: req.segment || (typeof scope.segment === "string" ? scope.segment : "") || client?.industry || "",
      targetAudience: typeof scope.targetAudience === "string" ? scope.targetAudience : (brand?.targetAudience ?? ""),
      tone: brand?.tone ?? "",
      services, objectives, strategyHeadline,
      hasBrandAssets: !!(brand && (brand.primaryColor || brand.typography || brand.tagline)),
      // Contratou identidade visual? Então não há marca para pedir — há marca
      // para criar. Lê tanto o bloco do briefing quanto o serviço contratado,
      // porque um cliente pode pedir "identidade visual" sem o SDR ter chegado
      // à pergunta do bloco.
      criandoIdentidade: (() => {
        const b = (scope.branding ?? {}) as Record<string, unknown>;
        if (b.fromScratch === true) return true;
        if (b.requested === true && b.hasBrandBook !== true) return true;
        return services.some((s) => /identidade|logo|marca|branding/i.test(s));
      })(),
      materiaisEntregues: [...new Set(materiaisResolvidos.map((m) => m.type))],
      // O que aconteceu no mês passado, para o especialista de otimização
      // decidir o que muda. Vazio no primeiro ciclo — e o prompt dele proíbe
      // inventar desempenho passado quando isto está vazio.
      resultadoDoCicloAnterior: await resultadoDoCicloAnterior(projectId, cicloId),
      // O que o cliente REALMENTE publica — síntese ou degradação declarada.
      feedRealDoCliente: feedDoCliente.texto,
      // O cliente tem material próprio (foto/vídeo) para a agência usar?
      //
      // ESTA LINHA JÁ ESTEVE ERRADA e o erro era invisível: lia
      // `scope.hasRawMaterial`, um campo que **nenhum código deste repositório
      // escreve**. O briefing guarda a mesma informação com outro nome, dentro
      // de `social`. O `?? false` transformava "não sei" em "não tem" — sem
      // erro, sem log e sem teste vermelho — e o especialista de vídeo mandava
      // a dona do salão GRAVAR os vídeos que ela já tinha, e que ela já tinha
      // dito que tinha. Cada peça passava no seu teste; a junta arrebentava.
      hasRawMaterial: temMaterialProprio(scope),
    };

    // ── A VERDADE ANCORADA DO CLIENTE ────────────────────────────────────────
    // O que a agência SABE. Tudo que a peça afirmar além disto é invenção, e é
    // o piso determinístico que reprova — sem depender de IA nenhuma.
    const verdade: VerdadeDoCliente = {
      businessName: context.businessName,
      telefones: [client?.phone, (scope as Record<string, unknown>).prospectPhone, (scope as Record<string, unknown>).phone]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
      emails: [client?.email, (scope as Record<string, unknown>).prospectEmail, (scope as Record<string, unknown>).email]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
      servicos: services,
      valores: [
        (scope as Record<string, unknown>).monthlyBudget,
        (scope as Record<string, unknown>).adsBudget,
        (scope as Record<string, unknown>).budget,
      ].map((v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."))))
       .filter((n) => Number.isFinite(n) && n > 0),
      // A verdade OPERACIONAL — horário, área de entrega, pagamento, oferta,
      // canal e prazo — o servidor lê do que o cliente escreveu, não de quem
      // chama. Sem ela, o piso trata TODA classe como "não informada" e (por
      // ser fail-closed, de propósito) barraria qualquer peça com CTA de canal
      // ou horário. Não é opcional: é a fiação que faz o piso ser piso.
      operacao: (await buildVerdadeOperacional(clientRequestId)) ?? undefined,
    };

    const agents = (() => { try { return JSON.parse(project.agents ?? "[]"); } catch { return []; } })() as string[];
    const producedAgents = new Set(existing.map((d) => d.ownerAgentId).filter(Boolean));

    // ── O DIRETOR REGE OS DEPARTAMENTOS; O DEPARTAMENTO REGE OS SEUS ───────────
    // Duas camadas, e é o ponto da estrutura: o plano do PM ordena as CASAS
    // (estratégia antes de social, social antes de design); dentro de cada casa,
    // os especialistas produzem na ordem em que estão declarados. Um especialista
    // que já entregou é pulado — a idempotência agora é por ESPECIALISTA, não por
    // departamento, senão o primeiro a produzir calaria os colegas dele.
    const plan: ProductionPlan = await planProduction(clientRequestId, DEPARTAMENTOS.map((d) => d.id));
    const byId = new Map(DEPARTAMENTOS.map((d) => [d.id, d]));
    const orderedDepts: Departamento[] = [];
    const added = new Set<string>();
    // 1) na ordem que o PM definiu;
    for (const deptId of plan.orderedDepartments) {
      const cfg = byId.get(deptId);
      if (cfg && !added.has(cfg.id)) { orderedDepts.push(cfg); added.add(cfg.id); }
    }
    // 2) robustez: departamentos atribuídos ao projeto ou por serviço que o PM não listou.
    //    "Atribuído" vale se QUALQUER especialista da casa foi escalado.
    for (const d of DEPARTAMENTOS) {
      if (added.has(d.id)) continue;
      const escalado = d.especialistas.some((e) => agents.includes(e.id));
      if (escalado || services.some((s) => d.keywords.test(s))) { orderedDepts.push(d); added.add(d.id); }
    }

    // A fila achatada: cada item é UM especialista, já sabendo de que casa veio.
    const toRun: Array<{ dept: Departamento; esp: Especialista }> = orderedDepts.flatMap((dept) =>
      dept.especialistas
        .filter((esp) => !producedAgents.has(esp.id))
        .map((esp) => ({ dept, esp })),
    );

    const produced: string[] = [];
    const askedClient: string[] = [];
    const skipped: string[] = [];
    const qualityAudit: Array<{ department: string; verdict: VereditoDaQualidade; issues: string[] }> = [];
    const barradosNoPiso: BarradoNoPiso[] = [];
    const reprovadosPelaQualidade: ReprovadoPelaQualidade[] = [];
    const naoAuditados: NaoAuditado[] = [];

    for (const { dept, esp } of toRun) {
      // Como este trabalho se chama no relatório e no portal: casa · especialista.
      const nome = `${dept.label} · ${esp.label}`;
      if (esp.precisaDe && !esp.precisaDe.tem(context)) {
        // UMA VOZ: o agente ABRE o pedido, não fala com o cliente. O gerente de
        // projeto junta tudo numa mensagem só no fim desta passada.
        await abrirPedido({
          projectId, tipo: dept.id, descricao: esp.precisaDe.pedido,
          agentId: esp.id, agenteLabel: nome,
        });
        await moverTarefasDoAgente(projectId, esp.id, "blocked");
        askedClient.push(nome);
        continue;
      }

      // A tarefa passa a contar a verdade no MESMO instante do trabalho.
      await moverTarefasDoAgente(projectId, esp.id, "in_progress");

      // Radar Dioli: as diretrizes ATUAIS de mercado do domínio viram insumo.
      const insights = await getActiveInsights(project.workspaceId, dept.insightDomain);
      const insightBlock = buildInsightBlock(insights);

      // Cada especialista chama a IA que faz MELHOR o trabalho dele. Redação
      // criativa, número e pesquisa não são a mesma competência.
      const result = await generate({
        system: `Você é o especialista de ${esp.label} do departamento de ${dept.label} de uma agência de marketing brasileira. Produza conteúdo real, específico e pronto para o cliente. Responda SOMENTE com JSON válido.`,
        user: esp.prompt(context) + (insightBlock ? `\n\n${insightBlock}` : ""),
        maxTokens: 1800,
        workspaceId: project.workspaceId,
        preferredProvider: esp.provedor ?? "claude",
      });

      if (!result.ok) {
        skipped.push(`${nome} (IA: ${result.error})`);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        continue;
      }
      const data = result.data as Record<string, unknown>;
      let title = typeof data.title === "string" ? data.title : `${nome} — ${context.businessName}`;
      let body = deliverableMarkdown(data);
      // Gate de saída: nada vazio/curto demais chega ao cliente.
      if (!body || body.length < MIN_DELIVERABLE_CHARS) {
        skipped.push(`${nome} (resposta insuficiente)`);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        continue;
      }

      // Produziu: sai de "produzindo" e entra em revisão — é onde a Qualidade age.
      await moverTarefasDoAgente(projectId, esp.id, "review");

      // ── O PISO DE VERDADE — o freio que NÃO depende de IA ────────────────
      // Roda ANTES do juiz de IA e é bloqueante. Um LLM julgando outro LLM tem
      // o mesmo ponto cego dos dois: telefone inventado plausível parece
      // plausível para o juiz também. Este confere contra a verdade conhecida
      // do cliente, em código, sem rede — e por isso nunca fica "indisponível".
      //
      // Não julga qualidade nem gosto: responde só se a peça afirma FATO que a
      // agência não tem como sustentar. Reprovou, o especialista refaz com o
      // parecer na mão; reprovou de novo, a peça NÃO é publicada.
      let piso = conferirPisoDeVerdade(body, verdade);
      let correcoesDePiso = 0;
      while (!piso.aprovado && correcoesDePiso < MAX_CORRECOES_DE_PISO) {
        const parecer = resumirViolacoes(piso.violacoes);
        const refeito = await generate({
          system: "Você é um agente sênior de uma agência de marketing brasileira. Sua entrega afirmou dados que a agência NÃO tem como sustentar. Corrija removendo ou substituindo por \"PRECISO CONFIRMAR: <o quê>\". NUNCA troque um dado inventado por outro inventado. Responda SOMENTE JSON válido no mesmo formato.",
          user: `${esp.prompt(context)}\n\nA VERIFICAÇÃO DE VERDADE REPROVOU a versão anterior: ${parecer}\n\nRefaça sem esses dados. Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>".`,
          maxTokens: 1800, workspaceId: project.workspaceId, preferredProvider: esp.provedor ?? "claude",
        });
        correcoesDePiso++;
        if (!refeito.ok) break;
        const corrigido = deliverableMarkdown(refeito.data as Record<string, unknown>);
        if (!corrigido || corrigido.length < MIN_DELIVERABLE_CHARS) break;
        body = corrigido;
        const t = (refeito.data as Record<string, unknown>).title;
        if (typeof t === "string" && t.trim()) title = t;
        piso = conferirPisoDeVerdade(body, verdade);
      }

      if (!piso.aprovado) {
        // NÃO PUBLICA. Este é o ponto em que a casa deixa de ser 100% "sai de
        // qualquer jeito": dado inventado que sobreviveu à correção não vira
        // entrega. Fica registrado para a equipe, e o cliente não vê.
        const parecer = resumirViolacoes(piso.violacoes);
        skipped.push(`${nome} (reprovado no piso de verdade: ${piso.violacoes.map((v) => v.id).join(", ")})`);
        barradosNoPiso.push({ especialista: nome, violacoes: piso.violacoes.map((v) => v.id), parecer });
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "piso_de_verdade_barrou",
            message: `${nome} para ${context.businessName}: ${parecer}`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
        continue;
      }

      // QUALIDADE ATIVA — o loop de correção (garante boa entrega ANTES do cliente):
      // audita → se reprovar, o agente REVISA com o parecer → reentrega melhorada.
      // O cliente sempre DECIDE; nós garantimos que o que chega já está bom.
      let audit = await auditDeliverable({
        deptLabel: nome, title, content: body, brandContext: ctxBlock(context),
        marketGuidelines: insightBlock, workspaceId: project.workspaceId,
        // O estado da leitura vai como DADO, não como substring para o auditor
        // farejar no contexto — ver o comentário dos três estados lá.
        feed: { lida: feedDoCliente.lida, posts: feedDoCliente.posts },
      });
      let revisions = 0;
      // Só REPROVAÇÃO manda refazer. `nao_auditado` não é parecer — pedir ao
      // especialista que "corrija" o que ninguém apontou é queimar IA para
      // reescrever uma peça possivelmente boa às cegas.
      while (foiReprovadaPelaQualidade(audit.verdict) && revisions < MAX_QUALITY_REVISIONS) {
        const fix = await generate({
          system: "Você é um agente sênior de uma agência de marketing brasileira. A Qualidade apontou problemas na sua entrega — CORRIJA-OS e reentregue melhor. Responda SOMENTE com JSON válido no mesmo formato.",
          user: `${esp.prompt(context)}${insightBlock ? `\n\n${insightBlock}` : ""}\n\nA Qualidade REPROVOU a versão anterior por: ${audit.issues.join("; ") || audit.note}. Refaça corrigindo exatamente esses pontos.`,
          maxTokens: 1800, workspaceId: project.workspaceId, preferredProvider: esp.provedor ?? "claude",
        });
        revisions++;
        if (!fix.ok) break;
        const fixedBody = deliverableMarkdown(fix.data as Record<string, unknown>);
        if (!fixedBody || fixedBody.length < MIN_DELIVERABLE_CHARS) break;
        body = fixedBody;
        const fixedTitle = (fix.data as Record<string, unknown>).title;
        if (typeof fixedTitle === "string" && fixedTitle.trim()) title = fixedTitle;
        audit = await auditDeliverable({
          deptLabel: dept.label, title, content: body, brandContext: ctxBlock(context),
          marketGuidelines: insightBlock, workspaceId: project.workspaceId,
          feed: { lida: feedDoCliente.lida, posts: feedDoCliente.posts },
        });
      }

      // Grava a MELHOR versão, com o veredito REAL da Qualidade — três estados,
      // nunca um "ok" que quer dizer "não consegui olhar".
      //
      // Reprovada continua sendo GRAVADA de propósito: é o registro em
      // `quality_flag` que faz `pacote-travado.ts` encontrá-la, refazer até 2
      // tentativas e escalar. O que a reprovação bloqueia é a APRESENTAÇÃO —
      // `marcos.apresentar` e `mes.apresentarCiclo` recusam enquanto houver uma
      // peça em `quality_flag`, e o bloqueio vira `ActivityEvent` no fim desta
      // passada. Apagar a peça aqui mataria o caminho de conserto.
      const entregavel = await prisma.deliverable.create({
        data: {
          projectId, name: title, type: esp.deliverableType, status: "in_review", content: body,
          ownerAgentId: esp.id, cycleId: cicloId,
          revisionStatus: revisionStatusDoVeredito(audit.verdict),
          lastFeedback: audit.note || null, version: revisions + 1,
        },
        select: { id: true },
      });

      if (foiReprovadaPelaQualidade(audit.verdict)) {
        const parecer = audit.issues.join("; ") || audit.note || "qualidade insuficiente";
        reprovadosPelaQualidade.push({ especialista: nome, deliverableId: entregavel.id, issues: audit.issues, parecer });
        // O bloqueio precisa ser VISÍVEL, não um campo que ninguém abre. Sem
        // este registro, "a Qualidade reprovou" só existiria dentro de um
        // retorno de função que nenhum humano lê.
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "qualidade_reprovou",
            message: `${nome} para ${context.businessName}: REPROVADA pela Qualidade após ${revisions} revisão(ões) — ${parecer}. NÃO será apresentada ao cliente.`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
      } else if (ficouSemArbitro(audit.verdict)) {
        // NÃO bloqueia — a operação não pode parar porque um provedor caiu. Mas
        // fica declarado com todas as letras, para ser possível responder depois
        // "quantas peças foram ao cliente sem árbitro?".
        naoAuditados.push({ especialista: nome, deliverableId: entregavel.id, motivo: audit.motivo ?? "erro" });
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "qualidade_nao_auditou",
            message: `${nome} para ${context.businessName}: SEM AUDITORIA (${audit.motivo ?? "erro"}) — a peça segue para o cliente sem parecer da Qualidade. Isto NÃO é uma aprovação.`.slice(0, 900),
          },
        }).catch(() => { /* best-effort */ });
      }
      // A tarefa fecha ligada ao entregável que a cumpriu — no quadro dá para
      // clicar e ver o que foi feito, em vez de um "concluído" sem lastro.
      await marcarEntregue(projectId, esp.id, entregavel.id);

      // A aprovação é registrada, mas NÃO é mostrada ao cliente peça por peça:
      // quem apresenta é o gerente de projeto, de uma vez, quando tudo estiver
      // pronto. Cinco entregas pingando no portal é o que faz o cliente sentir
      // que a agência é desorganizada mesmo entregando bem.
      await createApprovalRequest({ clientRequestId, department: dept.id, requestedBy: `Especialista de ${esp.label} (${dept.label})`, clientVisible: false });
      produced.push(nome);
      qualityAudit.push({ department: nome, verdict: audit.verdict, issues: audit.issues });
    }

    // ── A MARCA CRIADA VIRA A MARCA USADA ────────────────────────────────────
    // Sem isto, a agência definia a paleta do cliente num entregável e no mês
    // seguinte lia a marca, encontrava nulo, escrevia genérico e propunha uma
    // identidade DIFERENTE. Criava a marca e esquecia dela.
    try {
      const { colherIdentidadeDaEntrega } = await import("@/lib/agency/execution/colher-identidade");
      const colhida = await colherIdentidadeDaEntrega(projectId, project.clientId);

      // ── O LOGO EM ARQUIVO ──────────────────────────────────────────────────
      // Só depois de colher: o kit usa a paleta e a tipografia que o
      // especialista definiu. Gerar antes produziria um logo preto e branco
      // ignorando a marca que a própria casa acabou de criar.
      //
      // Quem contratou identidade recebe ARQUIVO. Até 02/08/2026 o pet shop
      // sem logo pagava por identidade visual e recebia um texto descrevendo
      // a marca — meio serviço cobrado inteiro.
      if (colhida.encontrouEntrega && context.criandoIdentidade) {
        const { produzirKitDeMarca } = await import("@/lib/agency/execution/logo");
        const kit = await produzirKitDeMarca(projectId, project.clientId, project.workspaceId);
        if (kit.arquivos.length > 0) await entregarKit(projectId, cicloId, context.businessName, project.clientId, kit.arquivos);
      }
    } catch { /* best-effort: colher a marca não pode derrubar a produção */ }

    // ── UMA VOZ: o PM junta tudo que travou e cobra numa mensagem só ─────────
    let pedidosCobrados = 0;
    if (askedClient.length > 0) {
      pedidosCobrados = await cobrarCliente({ projectId, clientRequestId, nomeDoNegocio: context.businessName });
    }

    // "done" quando não restou nenhum departamento pendente de produção (o que
    // falhou por IA fica pra próxima passada do cron re-tentar).
    const allHandled = skipped.length === 0;
    await prisma.project.update({
      where: { id: projectId },
      data: {
        executionStatus: allHandled ? "done" : "failed",
        executionFinishedAt: new Date(),
        executionError: allHandled ? null : `pendências: ${skipped.join("; ")}`,
      },
    });

    // ── O PM APRESENTA SOZINHO ────────────────────────────────────────────────
    // O elo que faltava. A produção terminava e o pacote ficava parado DENTRO da
    // agência esperando uma pessoa clicar "apresentar" — trabalho pronto, cliente
    // sem saber. Numa agência que roda sem gente olhando, isso é o mesmo que não
    // ter produzido.
    //
    // Só apresenta quando o pacote está INTEIRO: nada pulado por falha de IA e
    // nada travado esperando material do cliente. Apresentar metade é pior que
    // esperar — quebra a promessa de "eu te mostro tudo de uma vez".
    //
    // A própria `apresentar` recusa se a Qualidade deixou ressalva. Isso é
    // deliberado e é o freio que faltava: peça marcada como torta NÃO chega ao
    // cliente sozinha. Ela para aqui e vira um alerta para a equipe.
    //
    // O import é dinâmico de propósito: `marcos.ts` já importa este arquivo
    // (para disparar a produção quando a direção é aprovada). Um import estático
    // aqui fecharia o ciclo entre os dois módulos.
    // A condição é "o pacote está INTEIRO", não "algo foi produzido agora".
    // A diferença apareceu em produção: depois que o destravamento refez as
    // entregas reprovadas, a passada seguinte não produziu nada — todas já
    // existiam — e o pacote pronto não era apresentado. Exigir produção nova
    // fazia a apresentação depender de coincidência.
    const jaEntregues = produced.length > 0
      ? produced.length
      : await prisma.deliverable.count({ where: { projectId, cycleId: cicloId } });

    let apresentado: ApresentacaoAutomatica | undefined;
    if (allHandled && askedClient.length === 0 && jaEntregues > 0) {
      try {
        const { apresentar } = await import("@/lib/agency/esteira/marcos");
        // Dentro de um ciclo, quem apresenta é o ciclo: o carimbo do projeto já
        // foi usado no pacote inicial e recusaria a entrega de todo mês 2 em
        // diante com "já apresentado".
        const r = cicloId
          ? await (await import("@/lib/agency/esteira/mes")).apresentarCiclo(projectId, cicloId)
          : await apresentar(projectId);
        apresentado = { ok: r.ok, motivo: r.erro };
        if (!r.ok) {
          // Nenhum humano vai ler um retorno de função. O bloqueio precisa
          // existir no banco para aparecer no painel e no relatório do Diretor.
          await prisma.activityEvent.create({
            data: {
              workspaceId: project.workspaceId,
              projectId,
              clientId: project.clientId,
              type: "apresentacao_bloqueada",
              message: `O pacote de ${context.businessName} ficou pronto mas NÃO foi apresentado: ${r.erro ?? "motivo não informado"}`,
            },
          }).catch(() => { /* best-effort: o bloqueio não pode derrubar a produção */ });
        }
      } catch {
        apresentado = { ok: false, motivo: "falha ao apresentar" };
      }
    }

    return {
      ok: true, status: allHandled ? "done" : "failed", produced, askedClient, skipped, qualityAudit,
      pedidosCobrados, apresentado, barradosNoPiso, reprovadosPelaQualidade, naoAuditados,
      pmPlan: { orderedDepartments: plan.orderedDepartments, goal: plan.goal, pmMode: plan.pmMode },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "erro na execução";
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "failed", executionFinishedAt: new Date(), executionError: msg },
    }).catch(() => { /* best-effort */ });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: msg };
  }
}

/**
 * Registra o kit de marca como ENTREGA, não como arquivo solto no storage.
 *
 * A diferença importa: arquivo no armazenamento é invisível para o cliente. O
 * que ele vê no portal são entregas — e um logo que ninguém encontra é o mesmo
 * que um logo que não existe.
 */
async function entregarKit(
  projectId: string,
  cycleId: string | null,
  negocio: string,
  clientId: string | null,
  arquivos: Array<{ id: string; nome: string; para: string }>,
): Promise<void> {
  const cliente = clientId
    ? await prisma.client.findUnique({ where: { id: clientId }, select: { brandBrain: true, industry: true } }).catch(() => null)
    : null;
  const b = cliente?.brandBrain;

  const { montarManual, corValida } = await import("@/lib/agency/execution/logo");
  const manual = montarManual({
    negocio,
    primaria: corValida(b?.primaryColor) ?? b?.primaryColor ?? "não definida",
    secundaria: corValida(b?.secondaryColor) ?? b?.secondaryColor ?? "não definida",
    tipografia: b?.typography ?? "não definida",
    tagline: b?.tagline ?? null,
    arquivos: arquivos.map((a) => ({ nome: a.nome, para: a.para })),
  });

  const corpo = [
    manual,
    "",
    "**5. Baixe seus arquivos**",
    ...arquivos.map((a, i) => `- Arquivo ${i + 1}: ${a.nome} — /api/media/${a.id}`),
  ].join("\n");

  await prisma.deliverable.create({
    data: {
      projectId, name: `Kit de marca — ${negocio}`, type: "brand-kit",
      status: "in_review", content: corpo, ownerAgentId: "design-kit-de-marca",
      cycleId,
      // O kit NÃO passa pelo auditor (é arquivo montado em código, não texto de
      // IA). Marcá-lo `quality_ok` era declarar uma aprovação que nunca houve —
      // o mesmo bug do fail-open, com outra roupa. `quality_nao_auditado` diz a
      // verdade e, como não bloqueia, o kit continua chegando ao cliente.
      revisionStatus: revisionStatusDoVeredito("nao_auditado"),
    },
  }).catch(() => { /* best-effort */ });
}

/**
 * Os números do último ciclo FECHADO, em texto pronto para o prompt.
 *
 * Devolve string vazia quando não há ciclo anterior. Vazio é o sinal que faz o
 * especialista de otimização dizer "a otimização começa quando houver o
 * primeiro mês medido" em vez de inventar um desempenho que nunca existiu.
 */
async function resultadoDoCicloAnterior(projectId: string, cicloAtualId: string | null): Promise<string> {
  const anterior = await prisma.cycle.findFirst({
    where: { projectId, status: "fechado", ...(cicloAtualId ? { id: { not: cicloAtualId } } : {}) },
    orderBy: { reference: "desc" },
    select: { reference: true, resultsJson: true },
  }).catch(() => null);
  if (!anterior) return "";

  try {
    const r = JSON.parse(anterior.resultsJson) as Record<string, unknown>;
    const pago = r.pago as Record<string, number> | null;
    // ── RESÍDUO DE OUTRA BASE DE MEDIÇÃO ─────────────────────────────────────
    // `alcance` e `engajamento` mudaram de SIGNIFICADO em 04/08/2026 (mes.ts:
    // VERSAO_DA_MEDICAO). Na v1, `alcance` era o reach de UM DIA. Injetar
    // "- Alcance: 340" sob o rótulo "números reais, medidos — use SOMENTE
    // estes", com o prompt mandando citar o número, faria a peça de otimização
    // do mês 2 dizer ao cliente "no mês passado alcançamos 340 pessoas" — um
    // mês inteiro subestimado ~30x — e ancoraria TODAS as recomendações nisso.
    // Base velha: o número não entra, e a ausência é declarada (vazio é vazio).
    const versaoAnterior = versaoDaMedicao(r as unknown as MedicaoDoMes);
    const baseComparavel = versaoAnterior >= VERSAO_DA_MEDICAO;
    const tinhaNumerosDeBase = r.alcance != null || r.engajamento != null;
    const linhas = [
      `Competência: ${anterior.reference}`,
      `- Posts publicados: ${r.postsPublicados ?? 0}`,
      baseComparavel && r.alcance != null ? `- Alcance: ${r.alcance}` : null,
      r.seguidores != null ? `- Seguidores: ${r.seguidores}` : null,
      baseComparavel && r.engajamento != null ? `- Engajamento: ${r.engajamento}` : null,
      !baseComparavel && tinhaNumerosDeBase
        ? `- ATENÇÃO: alcance e engajamento do ciclo anterior foram OMITIDOS porque foram medidos noutra base (v${versaoAnterior}, hoje v${VERSAO_DA_MEDICAO}) e significam outra coisa. NÃO cite, NÃO compare e NÃO estime alcance ou engajamento do período anterior — diga que a comparação começa no primeiro mês medido na base atual.`
        : null,
      pago ? `- Anúncios: R$ ${pago.gastoBRL} investidos, ${pago.cliques} cliques, CPC R$ ${pago.cpcBRL ?? "não medido"}` : null,
      r.porQueNaoMediu ? `- ATENÇÃO: as métricas não foram medidas neste ciclo (${r.porQueNaoMediu})` : null,
    ].filter(Boolean);
    return linhas.join("\n");
  } catch {
    return "";
  }
}
