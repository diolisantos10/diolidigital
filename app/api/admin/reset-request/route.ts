// POST /api/admin/reset-request  { requestId: string }
//
// Surgical reset of ONE client request back to the post-SDR / briefing stage.
// KEEPS: the ClientRequest (the briefing), the Client, the BrandBrain.
// DELETES everything produced after the briefing: project(s) + all their
// children (tasks, deliverables, strategy rooms, material requests, timeline
// events, project briefings), the Brain scope artifacts, the client-facing
// approval requests, and the portal conversation. Status returns to "new".
//
// Auth: a master session OR the x-admin-secret header (== ADMIN_TASK_SECRET env).
// Scoped to a single request by id or businessName — never a global wipe.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { buildClientSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { orchestratePMReasoning } from "@/lib/dioli-brain/pm-orchestrator";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { generate } from "@/lib/ai/generate";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { segredoConfere } from "@/lib/security/crypto";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ⚠️ O PIOR DOS SEIS: com este segredo a rota roda SEM escopo de workspace —
  // apaga projeto de qualquer inquilino. Comparar com `===` deixava o segredo
  // ser descoberto byte a byte por medição de tempo.
  const secret = request.headers.get("x-admin-secret");
  const secretOk = segredoConfere(secret, process.env.ADMIN_TASK_SECRET);

  let workspaceScope: string | undefined;
  if (!secretOk) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "master") {
      return NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 });
    }
    workspaceScope = session.workspaceId;
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  // Adotar as solicitações órfãs: dar dono às que nasceram sem workspace.
  //
  // O conserto de raiz está no serviço de criação (toda solicitação nova já
  // nasce com dono). Isto aqui é para as que já existiam antes — sem elas,
  // continuariam dependendo do remendo de leitura para sempre.
  //
  // Não é destrutivo e é idempotente: rodar de novo não muda mais nada.
  if (action === "adotar-orfas") {
    const destino = workspaceScope ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id;
    if (!destino) return NextResponse.json({ ok: false, error: "Nenhum workspace para adotar" }, { status: 409 });
    const r = await prisma.clientRequestDb.updateMany({
      where: { workspaceId: null },
      data: { workspaceId: destino },
    });
    return NextResponse.json({ ok: true, action: "adotar-orfas", workspaceId: destino, adotadas: r.count });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  if (!requestId && !businessName) {
    return NextResponse.json({ error: "requestId ou businessName obrigatório" }, { status: 400 });
  }

  const keepMostRecent = body.keepMostRecent === true;

  // Thorough: ALL requests for this business (there may be duplicates), and ALL
  // projects for the linked client(s) — including any orphaned/mislinked ones.
  //
  // Sobre o escopo por workspace: a solicitação que chega pelo briefing público
  // nascia SEM workspace — quem
  // preenche o formulário não está logado e não tem como saber qual é. Na
  // produção de 01/08/2026, 6 das 7 solicitações estavam com `workspaceId`
  // nulo, e o filtro por workspace as escondia por completo: `status`, `fire`,
  // `send-proposal` e `delete` respondiam "Solicitação não encontrada" para
  // briefings que existiam e apareciam na tela.
  //
  // Aceitar o nulo junto com o workspace da sessão é o que reconecta as duas
  // pontas. Não afrouxa nada em prática: a solicitação órfã não pertence a
  // outro workspace — ela não pertence a nenhum.
  const requests = await prisma.clientRequestDb.findMany({
    where: {
      ...(workspaceScope ? { OR: [{ workspaceId: workspaceScope }, { workspaceId: null }] } : {}),
      ...(requestId ? { id: requestId } : { businessName: { contains: businessName } }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientId: true, businessName: true, createdAt: true, status: true },
  });
  if (requests.length === 0) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const reqIds0 = requests.map((r) => r.id);
  const clientIds0 = [...new Set(requests.map((r) => r.clientId).filter((c): c is string => !!c))];
  const projectWhere = { OR: [{ clientRequestId: { in: reqIds0 } }, ...(clientIds0.length ? [{ clientId: { in: clientIds0 } }] : [])] };

  // Apagar a solicitação INTEIRA — a única operação aqui que não tem volta.
  //
  // Existe porque a porta de entrada acumula lixo de teste ("UI Bridge Test
  // 1781835336580") e duplicata, e a alternativa era o reset global no modo
  // "everything", que levaria junto as solicitações boas. Apagar uma de cada
  // vez, por id, é o oposto disso.
  //
  // Duas travas, e as duas existem porque um `businessName` parcial casa com
  // mais do que se espera — "Diego" casa com dois cadastros diferentes:
  //   1. exige `requestId` explícito; nome não serve para apagar;
  //   2. exige a frase de confirmação, como o reset global.
  if (action === "delete") {
    if (!requestId) {
      return NextResponse.json(
        { error: "Para apagar é obrigatório o requestId — nome de negócio casa com mais de uma solicitação" },
        { status: 400 },
      );
    }
    if (body.confirm !== "DELETE_REQUEST") {
      return NextResponse.json({ error: 'confirm obrigatório: "DELETE_REQUEST"' }, { status: 400 });
    }
    const alvo = requests[0];
    const projetos = await prisma.project.findMany({ where: projectWhere, select: { id: true } });
    const projectIds = projetos.map((p) => p.id);

    const removido = { projetos: projectIds.length, entregas: 0, tarefas: 0 };
    await prisma.$transaction(async (tx) => {
      if (projectIds.length) {
        // Estes dois apontam para o projeto sem cascata — soltar antes de apagar.
        await tx.activityEvent.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
        await tx.aIRunLog.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
        removido.entregas = await tx.deliverable.count({ where: { projectId: { in: projectIds } } });
        removido.tarefas = await tx.task.count({ where: { projectId: { in: projectIds } } });
        // Projeto cascateia entregas, tarefas, briefings, salas, ciclos.
        await tx.project.deleteMany({ where: { id: { in: projectIds } } });
      }
      // Sem cascata a partir da solicitação — explícitos.
      await tx.evidenceItem.deleteMany({ where: { clientRequestId: alvo.id } });
      await tx.portalAccess.deleteMany({ where: { clientRequestId: alvo.id } });
      await tx.brainUpdate.deleteMany({ where: { clientRequestId: alvo.id } });
      await tx.socialPost.deleteMany({ where: { clientRequestId: alvo.id } });
      // A solicitação cascateia artefatos, aprovações, comentários e conversas.
      await tx.clientRequestDb.delete({ where: { id: alvo.id } });
    });

    return NextResponse.json({
      ok: true, action: "delete",
      apagada: { id: alvo.id, businessName: alvo.businessName, createdAt: alvo.createdAt },
      removido,
    });
  }

  // Somente leitura: onde este negócio está no pipeline agora?
  if (action === "status") {
    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: { id: true, name: true, stage: true, proposalStatus: true, executionStatus: true, executionError: true, createdAt: true },
    });
    const projectIds = projects.map((p) => p.id);
    const [deliverables, approvals, messages, artifacts] = await Promise.all([
      prisma.deliverable.count({ where: { projectId: { in: projectIds } } }),
      prisma.approvalRequest.count({ where: { clientRequestId: { in: reqIds0 } } }),
      prisma.portalMessage.count({ where: { clientRequestId: { in: reqIds0 } } }),
      prisma.brainArtifact.count({ where: { clientRequestId: { in: reqIds0 } } }),
    ]);
    const pendingProposals = await prisma.approvalRequest.count({ where: { clientRequestId: { in: reqIds0 }, department: "proposal", status: "pending" } });
    const portal = await prisma.portalAccess.findFirst({ where: { clientRequestId: { in: reqIds0 }, revokedAt: null }, select: { token: true } });
    return NextResponse.json({
      ok: true, action: "status", businessName: requests[0].businessName,
      requests: requests.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
      projects, counts: { deliverables, approvals, messages, artifacts, pendingProposals },
      portalToken: portal?.token ?? null,
    });
  }

  // Agency sends the proposal to the client: generate it, drop a readable
  // summary in the portal, and create a client-visible "proposal" approval.
  // The CLIENT approving it (in the portal) is what creates the project.
  if (action === "send-proposal") {
    const target = requests[0];
    const snapshot = await buildClientSnapshot(target.id);
    if (!snapshot) return NextResponse.json({ ok: false, error: "Snapshot indisponível — briefing incompleto?" }, { status: 409 });
    const proposal = await orchestratePMReasoning(snapshot, workspaceScope);

    // Real values from the budget agent (computeEstimate → the same numbers the
    // SDR quotes). Plain language for a non-marketing business owner. Phase 1 is
    // the FINANCIAL proposal; the detailed schedule is released after approval.
    const fullReq = await prisma.clientRequestDb.findUnique({ where: { id: target.id }, select: { briefingJson: true, workspaceId: true } });
    const scope = (() => { try { return JSON.parse(fullReq?.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })();
    const est = computeEstimate(scope as Parameters<typeof computeEstimate>[0]);
    const money = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
    const wsId = fullReq?.workspaceId ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id;

    // Auto-explain: keep the technical term AND add a short plain-language
    // meaning inline (e.g. "3 criativos/semana (3 artes novas por semana)"), so
    // the proposal serves both audiences at once — no toggle, no clicking.
    const baseItems = est.items.length
      ? est.items.map((it) => `${it.label}${it.detail ? ` — ${it.detail}` : ""}`)
      : (proposal.tasks ?? []).slice(0, 8).map((t: { title: string }) => t.title);
    let friendlyItems = baseItems;
    const explR = await generate({
      system: "Você reescreve itens de uma proposta de marketing para uma cliente que NÃO é da área. REGRA: mantenha o termo técnico E acrescente, entre parênteses, uma explicação curta e simples do que significa (ex.: '3 criativos/semana (3 artes novas por semana)'). Não invente itens nem números. Responda SOMENTE JSON válido.",
      user: `Itens da proposta:\n${baseItems.map((i) => `- ${i}`).join("\n")}\n\nReescreva cada item mantendo o termo + explicação simples entre parênteses. Mesma quantidade, mesma ordem.\nJSON: {"items": ["...", "..."]}`,
      maxTokens: 700, workspaceId: wsId, preferredProvider: "claude",
      agentId: "comercial-proposta", clientId: target.clientId ?? null,
    });
    if (explR.ok) {
      const got = (explR.data as { items?: unknown }).items;
      if (Array.isArray(got) && got.length) friendlyItems = got.map((x) => String(x));
    }
    const deliverables = friendlyItems.map((i) => `• ${i}`).join("\n");
    const valueLines = est.items.length
      ? est.items.map((it) => `• ${it.label}: ${money(it.minPrice)}${it.maxPrice > it.minPrice ? ` a ${money(it.maxPrice)}` : ""}${it.unit ? ` / ${it.unit}` : ""}`).join("\n")
      : "• A combinar";
    const totalLine = est.totalMax > 0
      ? `Total: ${money(est.totalMin)}${est.totalMax > est.totalMin ? ` a ${money(est.totalMax)}` : ""} / mês`
      : "";

    const proposalText =
`${proposal.name}

✨ O QUE VOCÊ RECEBE
${deliverables}

💰 INVESTIMENTO
${valueLines}
${totalLine}

🤝 Como é uma parceria, esse valor fica por nossa conta — os números acima são a referência do quanto o serviço vale no mercado.

✅ PRÓXIMO PASSO
Se estiver tudo certo, é só clicar em Aprovar aqui embaixo. Assim que você aprovar, a gente libera o cronograma completo — o passo a passo, com datas, de como tudo vai acontecer.`;

    const msg = `📋 ${target.businessName}, sua proposta já está aqui no portal! Abre a aba "Aprovações", dá uma olhada com calma e, se gostar, é só aprovar. Qualquer dúvida ou ajuste, me chama por aqui. 💛`;
    await prisma.portalMessage.create({
      data: { clientRequestId: target.id, authorRole: "team", authorName: "Equipe Dioli", body: msg, readByTeam: true },
    });
    const approval = await createApprovalRequest({ clientRequestId: target.id, department: "proposal", requestedBy: "Agência", clientVisible: true });
    await prisma.approvalRequest.update({ where: { id: approval.id }, data: { reviewNote: proposalText } });
    await prisma.clientRequestDb.update({ where: { id: target.id }, data: { status: "scope_ready" } });
    // Ensure the client has portal access to read + approve the proposal.
    let portal = await prisma.portalAccess.findFirst({ where: { clientRequestId: target.id, revokedAt: null } });
    if (!portal) portal = await prisma.portalAccess.create({ data: { clientRequestId: target.id, clientId: target.clientId ?? undefined } });
    // WhatsApp trigger: a signal the Meta agent consumes to notify the client
    // ("sua proposta está no portal") with the link. The Meta agent owns the
    // actual send + its own dedupe/outbox; here we only emit the event + link.
    if (wsId) {
      await prisma.activityEvent.create({
        data: {
          workspaceId: wsId,
          clientId: target.clientId ?? null,
          type: "whatsapp_notify",
          message: JSON.stringify({ kind: "proposal_sent", businessName: target.businessName, portalPath: `/portal/access/${portal.token}` }),
        },
      });
    }
    return NextResponse.json({ ok: true, action: "send-proposal", businessName: target.businessName, approvalId: approval.id, proposalName: proposal.name, portalToken: portal.token });
  }

  // Diagnostic: reproduce the Social Media generation and compare token budgets.
  // Reveals the REAL error (which run-execution swallows as "IA indisponível").
  if (action === "diag-ai") {
    const target = requests[0];
    const ws = workspaceScope ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id;
    const sys = "Você é um agente sênior de uma agência de marketing brasileira. Produza conteúdo real, específico e pronto para o cliente. Responda SOMENTE com JSON válido.";
    const socialPrompt = `Você é o agente de Social Media. Produza um pacote de 6 posts/stories para o negócio "${target.businessName}". Para cada peça: formato (story/feed/reel), headline, legenda completa (2 a 3 frases) e ideia de visual. Português do Brasil, específico.\nResponda em JSON: {"title":"...","summary":"...","items":[{"format":"...","headline":"...","caption":"...","visual":"..."}]}`;
    const [a, b] = await Promise.all([
      generate({ system: sys, user: socialPrompt, maxTokens: 1800, workspaceId: ws, preferredProvider: "claude", agentId: "admin-diagnostico" }),
      generate({ system: sys, user: socialPrompt, maxTokens: 4096, workspaceId: ws, preferredProvider: "claude", agentId: "admin-diagnostico" }),
    ]);
    return NextResponse.json({
      ok: true, action: "diag-ai", businessName: target.businessName,
      at1800: a.ok ? { ok: true, items: Array.isArray((a.data as { items?: unknown[] })?.items) ? (a.data as { items: unknown[] }).items.length : null } : { ok: false, error: a.error },
      at4096: b.ok ? { ok: true, items: Array.isArray((b.data as { items?: unknown[] })?.items) ? (b.data as { items: unknown[] }).items.length : null } : { ok: false, error: b.error },
    });
  }

  // Fire the durable execution core for this business's project (must exist).
  if (action === "fire") {
    const project = await prisma.project.findFirst({ where: projectWhere, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!project) {
      return NextResponse.json({ ok: false, action: "fire", error: "Sem projeto — gere o escopo e aprove primeiro (ou marca parceira)." }, { status: 409 });
    }
    const result = await runProjectExecution(project.id);
    return NextResponse.json({ ok: true, action: "fire", projectId: project.id, result });
  }

  // Dedupe: keep the most recent request (index 0), delete the older duplicates
  // (cascades their artifacts/approvals/messages). The kept briefing stays.
  if (keepMostRecent && requests.length > 1) {
    const older = requests.slice(1).map((r) => r.id);
    const del = await prisma.clientRequestDb.deleteMany({ where: { id: { in: older } } });
    return NextResponse.json({
      ok: true, action: "dedupe", businessName: requests[0].businessName,
      kept: requests[0].id, keptCreatedAt: requests[0].createdAt, deletedDuplicates: del.count,
    });
  }

  const reqIds = requests.map((r) => r.id);
  const clientIds = [...new Set(requests.map((r) => r.clientId).filter((c): c is string => !!c))];

  // Projects linked either by request OR by client (catches mislinked/orphaned).
  const projects = await prisma.project.findMany({
    where: { OR: [{ clientRequestId: { in: reqIds } }, ...(clientIds.length ? [{ clientId: { in: clientIds } }] : [])] },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const removed = { requests: reqIds.length, projects: projectIds.length, artifacts: 0, approvals: 0, messages: 0 };

  await prisma.$transaction(async (tx) => {
    if (projectIds.length) {
      await tx.activityEvent.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
      await tx.aIRunLog.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    removed.artifacts = (await tx.brainArtifact.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    removed.approvals = (await tx.approvalRequest.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    removed.messages  = (await tx.portalMessage.deleteMany({ where: { clientRequestId: { in: reqIds } } })).count;
    // All matching requests back to the post-SDR briefing stage.
    await tx.clientRequestDb.updateMany({ where: { id: { in: reqIds } }, data: { status: "new" } });
  });

  return NextResponse.json({
    ok: true,
    businessName: requests[0].businessName,
    resetTo: "new",
    removed,
  });
}
