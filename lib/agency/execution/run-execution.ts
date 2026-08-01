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
import { generate } from "@/lib/ai/generate";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { planProduction, type ProductionPlan } from "@/lib/agency/execution/pm-conductor";
import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";
import { getActiveInsights, buildInsightBlock } from "@/lib/agency/radar/library";
import { moverTarefasDoAgente, marcarEntregue } from "@/lib/agency/esteira/tarefas";
import { abrirPedido, cobrarCliente } from "@/lib/agency/esteira/pedidos";
import {
  DEPARTAMENTOS, ctxBlock,
  type Ctx, type Departamento, type Especialista,
} from "@/lib/agency/execution/especialistas";

/** Conteúdo mínimo aceitável de uma entrega (gate de saída: nada vazio/lixo vai ao cliente). */
const MIN_DELIVERABLE_CHARS = 40;
/** Máximo de revisões que a Qualidade pede antes de publicar (bounded — sem loop infinito). */
const MAX_QUALITY_REVISIONS = 1;

function deliverableMarkdown(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const lines: string[] = [];
  if (typeof data.summary === "string") lines.push(data.summary, "");
  items.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const head = (it.headline ?? it.angle ?? it.direction ?? `Item ${i + 1}`) as string;
    lines.push(`**${i + 1}. ${head}**`);
    for (const [k, label] of [["format", "Formato"], ["caption", "Legenda"], ["visual", "Visual"], ["direction", "Direção"], ["palette", "Paleta"], ["cta", "CTA"], ["audience", "Público"], ["note", "Obs"]] as const) {
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
  /** Parecer da Qualidade por entrega (SOMBRA — não bloqueia; só registra). */
  qualityAudit?: Array<{ department: string; verdict: "pass" | "flag"; issues: string[] }>;
  /** Quantos pedidos de material o PM cobrou do cliente nesta passada. */
  pedidosCobrados?: number;
  /** O PM tentou apresentar o pacote ao cliente sozinho? Ausente = nem tentou
   *  (pacote incompleto). `ok: false` = tentou e foi BARRADO — quase sempre
   *  pela Qualidade, e é exatamente para isso que o freio existe. */
  apresentado?: ApresentacaoAutomatica;
  error?: string;
}

export interface ApresentacaoAutomatica {
  ok: boolean;
  motivo?: string;
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
    const [req, client, artifacts, existing] = await Promise.all([
      prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
      prisma.client.findFirst({ where: { id: project.clientId }, include: { brandBrain: true } }),
      prisma.brainArtifact.findMany({ where: { clientRequestId, status: "approved" }, select: { department: true, canvasJson: true } }),
      prisma.deliverable.findMany({ where: { projectId }, select: { ownerAgentId: true } }),
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
      // Perguntado pelo SDR no briefing. Ausente = NÃO — e "não" aqui é a
      // resposta segura: o roteiro sai para o cliente gravar, em vez de assumir
      // um acervo que talvez não exista.
      hasRawMaterial: (() => {
        const v = (scope as Record<string, unknown>).hasRawMaterial ?? (scope as Record<string, unknown>).materialBruto;
        return v === true || v === "sim" || v === "yes";
      })(),
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
    const qualityAudit: Array<{ department: string; verdict: "pass" | "flag"; issues: string[] }> = [];

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

      // QUALIDADE ATIVA — o loop de correção (garante boa entrega ANTES do cliente):
      // audita → se reprovar, o agente REVISA com o parecer → reentrega melhorada.
      // O cliente sempre DECIDE; nós garantimos que o que chega já está bom.
      let audit = await auditDeliverable({
        deptLabel: nome, title, content: body, brandContext: ctxBlock(context),
        marketGuidelines: insightBlock, workspaceId: project.workspaceId,
      });
      let revisions = 0;
      while (audit.verdict === "flag" && revisions < MAX_QUALITY_REVISIONS) {
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
        });
      }

      // Publica a MELHOR versão. Se mesmo após a revisão ainda estiver flag, vai
      // ao cliente (ele decide) MAS marcado quality_flag pra a equipe olhar.
      const entregavel = await prisma.deliverable.create({
        data: {
          projectId, name: title, type: esp.deliverableType, status: "in_review", content: body,
          ownerAgentId: esp.id, revisionStatus: audit.verdict === "flag" ? "quality_flag" : "quality_ok",
          lastFeedback: audit.note || null, version: revisions + 1,
        },
        select: { id: true },
      });
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
    let apresentado: ApresentacaoAutomatica | undefined;
    if (allHandled && askedClient.length === 0 && produced.length > 0) {
      try {
        const { apresentar } = await import("@/lib/agency/esteira/marcos");
        const r = await apresentar(projectId);
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
      pedidosCobrados, apresentado,
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
