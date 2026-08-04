// Returns client-safe Brain pipeline data for the portal.
// Strips internal fields (promptSummary, cognitiveFlow, etc.) before sending.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { requireSession } from "@/lib/auth/api-guard";

// O nome que o CLIENTE vê. Precisa cobrir os dois vocabulários: o do Brain
// (`social`, `traffic`) e o do motor de produção (`social-media`,
// `paid-traffic`) — que são os ids gravados por `createApprovalRequest`.
//
// Faltava a metade do motor aqui: um cliente que recebia trabalho de tráfego
// via a palavra "paid-traffic" no portal dele. Jargão interno vazando é
// exatamente o que o teste do portal existe para impedir.
const CLIENT_SAFE_DEPARTMENTS: Record<string, string> = {
  proposal:        "Proposta do projeto",
  strategy:        "Estratégia",
  social:          "Social Media",
  "social-media":  "Social Media",
  design:          "Design",
  traffic:         "Tráfego Pago",
  "paid-traffic":  "Tráfego Pago",
  analytics:       "Analytics",
  financeiro:      "Financeiro",
  quality:         "Revisão de Qualidade",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const clientRequestId = searchParams.get("clientRequestId");
  const clientId        = searchParams.get("clientId");
  // A4: o cookie httpOnly vale como o token — mas só quando a chamada não é o
  // caminho interno (sessão + clientRequestId/clientId explícitos).
  const token = searchParams.get("token")
    ?? (clientRequestId || clientId ? null : tokenDoPortal(request));

  // Token-based access — the only public path. Everything else needs a session.
  if (token) {
    const access = await validatePortalAccess(token);
    if (!access.valid) {
      return NextResponse.json({ error: "Access denied", reason: access.reason }, { status: 403 });
    }
    let reqId = access.record?.clientRequestId ?? null;
    // Token issued for a client (not a specific request): resolve the most
    // recent Brain request for that client at view time.
    if (!reqId && access.record?.clientId) {
      const latest = await prisma.clientRequestDb.findFirst({
        where: { clientId: access.record.clientId },
        orderBy: { createdAt: "desc" },
      });
      reqId = latest?.id ?? null;
      if (!reqId) {
        // Valid token, but no Brain request yet — cliente criado DIRETO.
        // As aprovações dele vivem por `clientId` (cards do calendário): sem
        // esta busca, o Início dizia "nada depende de você" com 6 peças
        // esperando — a contradição do lançamento da Foocci.
        const client = await prisma.client.findUnique({ where: { id: access.record.clientId } });
        const approvals = await buscarAprovacoes({ clientId: access.record.clientId, clientVisible: true });
        return NextResponse.json({
          id: null, businessName: client?.name ?? "Cliente", status: "new",
          services: [], objectives: [], createdAt: null, pipeline: [],
          approvals: approvals.map((ap) => mapearAprovacao(ap, () => null)),
        });
      }
    }
    if (!reqId) {
      return NextResponse.json({ error: "Token not linked to a request" }, { status: 404 });
    }
    return NextResponse.json(await buildPortalData(reqId));
  }

  // Direct clientRequestId / clientId — internal use only (agency session).
  const { error } = await requireSession();
  if (error) return error;

  if (clientRequestId) {
    return NextResponse.json(await buildPortalData(clientRequestId));
  }

  // clientId — return all requests for this client (portal by client ID)
  if (clientId) {
    try {
      const requests = await prisma.clientRequestDb.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const results = await Promise.all(requests.map((r) => buildPortalData(r.id)));
      return NextResponse.json(results);
    } catch {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "token, clientRequestId, or clientId required" }, { status: 400 });
}

// Defensive, client-safe canvas summariser — pulls a headline + a few highlight
// bullets across the varied department canvas shapes, and strips anything that
// looks like a price (the portal never shows values).
//
// ⚠️ Achado A1 da auditoria do Hub: filtro léxico é HEURÍSTICA, não trava. A
// correção completa (campo de visibilidade no dado do canvas, curadoria na
// escrita) fica para o próximo lote; até lá o deny-list abaixo é o mínimo
// seguro — fail-closed: na dúvida entre esconder um bullet inocente e vazar
// custo interno na tela do cliente, esconde-se o bullet.
const PADROES_DE_VALOR_INTERNO: RegExp[] = [
  /r\$\s*\d/i,                                            // R$ 500
  /\b(usd|eur|us\$|u\$s?)\s*\d/i,                          // USD 500 (passava)
  /\d+\s*(reais|d[óo]lares|euros)\b/i,                     // 500 reais
  /\d+\s*\/\s*m[êe]s/i,                                    // 2.000/mês
  /\b\d{1,3}(\.\d{3})+(,\d{2})?\b/,                        // 2.400 / 1.234,56
  /\b\d+(?:[.,]\d+)?\s*k\b/i,                              // 3k (passava)
  /\b(custo|or[çc]amento|margem|honor[áa]rio|mensalidade|investimento|verba|fee)\b[^.]{0,40}\d/i,
];
function noPrice(s: string): boolean {
  return !PADROES_DE_VALOR_INTERNO.some((re) => re.test(s));
}
function summarizeCanvas(canvas: unknown): { headline: string | null; bullets: string[] } {
  if (!canvas || typeof canvas !== "object") return { headline: null, bullets: [] };
  const c = canvas as Record<string, unknown>;

  const HEAD = ["executiveSummary","summary","businessSummary","mainObjective","contentObjective","visualConcept","positioning","targetAudience","recommendation","diagnosis","overview","visualTone","contentRole"];
  let headline: string | null = null;
  for (const k of HEAD) {
    const v = c[k];
    if (typeof v === "string" && v.trim().length > 8 && noPrice(v)) { headline = v.trim(); break; }
  }

  const BULLETS = ["keyFindings","keyInsights","recommendations","kpis","campaigns","editorialPillars","contentTerritories","contentThemes","differentiators","secondaryObjectives","creativeBriefs","audiences","recommendedChannels","recommendedFormats","performanceGaps","assetRequirements","priorityChannels","formats","objectives"];
  const toStr = (x: unknown): string | null => {
    if (typeof x === "string") return noPrice(x) ? x.trim() || null : null;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      for (const k of ["title","name","label","summary","objective","description","finding","insight"]) {
        if (typeof o[k] === "string" && (o[k] as string).trim() && noPrice(o[k] as string)) return (o[k] as string).trim();
      }
    }
    return null;
  };
  let bullets: string[] = [];
  for (const k of BULLETS) {
    const v = c[k];
    if (Array.isArray(v) && v.length) {
      bullets = v.map(toStr).filter((x): x is string => !!x).slice(0, 6);
      if (bullets.length) break;
    }
  }
  return { headline, bullets };
}

// A consulta e o mapeamento do card de aprovação num lugar só: os DOIS estados
// do portal (com solicitação e cliente direto) precisam falar a mesma língua —
// era a divergência entre eles que fazia o Início prometer uma aba vazia.
type FiltroDeAprovacao =
  | { clientId: string; clientVisible: true }
  | { clientVisible: true; OR: Array<{ clientRequestId: string } | { clientId: string }> };

function buscarAprovacoes(where: FiltroDeAprovacao) {
  return prisma.approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      comments: {
        where: { isClientVisible: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorName: true, authorRole: true, kind: true, body: true, createdAt: true },
      },
      // O vínculo por FK à versão decidida (Fase 2, 2.2) — quando existe, é
      // ELE que dá o corpo do card, nunca casamento por ordem.
      deliverableVersion: {
        select: { number: true, content: true, deliverable: { select: { name: true } } },
      },
    },
  });
}

type AprovacaoDb = Awaited<ReturnType<typeof buscarAprovacoes>>[number];

function mapearAprovacao(ap: AprovacaoDb, deliverableContentFor: (dept: string) => string | null) {
  return {
    id:         ap.id,
    department: CLIENT_SAFE_DEPARTMENTS[ap.department] ?? ap.department,
    status:     ap.status,
    reviewedAt: ap.reviewedAt,
    // Prazo do card (spec 1.1, conteúdo obrigatório) — a derivação "expirada"
    // é feita na leitura, nunca gravada (T6).
    expiresAt:  ap.expiresAt,
    // "Dúvida aberta" (caminho C): o prazo está pausado e a bola com a agência.
    questionOpen: ap.questionOpenedAt != null,
    // Qual versão o cliente está decidindo — v1 preservada, v2 na mesa.
    version: ap.deliverableVersion?.number ?? null,
    // Corpo do card: 1º a versão vinculada por FK (a fonte de verdade); 2º a
    // nota própria; 3º o casamento determinístico por departamento. Nunca sobra.
    reviewNote:
      (ap.deliverableVersion
        ? `${ap.deliverableVersion.deliverable.name}\n\n${ap.deliverableVersion.content ?? ""}`.trim()
        : null)
      || ap.reviewNote
      || (ap.department !== "proposal" ? deliverableContentFor(ap.department) : null),
    comments:   ap.comments,
  };
}

async function buildPortalData(clientRequestId: string) {
  const clientRequest = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!clientRequest) return null;

  const [artifacts, approvals] = await Promise.all([
    prisma.brainArtifact.findMany({
      where: { clientRequestId, status: "approved" },
      orderBy: { approvedAt: "asc" },
      select: {
        id: true, department: true, canvasId: true, canvasJson: true,
        version: true, status: true, approvedAt: true,
      },
    }),
    // Por OR: as aprovações da solicitação (fluxo Brain) E as do cliente
    // direto (cards de calendário por `clientId`) — um dono só, duas chaves.
    buscarAprovacoes({
      clientVisible: true,
      OR: [
        { clientRequestId },
        ...(clientRequest.clientId ? [{ clientId: clientRequest.clientId }] : []),
      ],
    }),
  ]);

  // The agents produce deliverables into their own table (with the full content).
  // Surface that content on the approval card so it isn't empty.
  //
  // Achado A2 (auditoria do Hub): o fallback `leftoverContent.shift()` casava
  // conteúdo por SOBRA DE FILA — o cliente podia aprovar um card lendo o texto
  // de outra entrega. Morreu. Agora o casamento é determinístico (agente dono →
  // departamento) e, sem casamento, o card fica sem corpo — integridade acima
  // de completude (Fase 2, 2.2). O filtro de `visibility` é a outra metade:
  // entrega "interno" nunca abastece card de portal, mesmo do próprio cliente.
  const project = await prisma.project.findFirst({ where: { clientRequestId }, select: { id: true } });
  const deliverables = project
    ? await prisma.deliverable.findMany({
        where: { projectId: project.id, visibility: "compartilhado" },
        orderBy: { createdAt: "asc" },
        select: { name: true, content: true, ownerAgentId: true },
      })
    : [];
  const AGENT_TO_DEPT: Record<string, string> = { a3: "social-media", a2: "design", a4: "paid-traffic" };
  const contentByDept = new Map<string, string>();
  for (const dv of deliverables) {
    const dept = dv.ownerAgentId ? AGENT_TO_DEPT[dv.ownerAgentId] : undefined;
    const body = dv.content ? `${dv.name}\n\n${dv.content}` : dv.name;
    if (dept && !contentByDept.has(dept)) contentByDept.set(dept, body);
  }
  const deliverableContentFor = (deptRaw: string): string | null =>
    contentByDept.get(deptRaw) ?? null;

  const services = (() => { try { return JSON.parse(clientRequest.services); } catch { return []; } })();
  const objectives = (() => { try { return JSON.parse(clientRequest.objectives); } catch { return []; } })();
  const scope = (() => {
    try { return (JSON.parse(clientRequest.briefingJson ?? "{}")?.scope ?? {}) as Record<string, unknown>; }
    catch { return {} as Record<string, unknown>; }
  })();

  // Per-department client-safe content (feeds each contracted service's tab).
  const departments: Record<string, { label: string; headline: string | null; bullets: string[]; approvedAt: Date | string | null }> = {};
  for (const a of artifacts) {
    let canvas: unknown = null;
    try { canvas = JSON.parse(a.canvasJson); } catch { /* ignore */ }
    const { headline, bullets } = summarizeCanvas(canvas);
    departments[a.department] = {
      label: CLIENT_SAFE_DEPARTMENTS[a.department] ?? a.department,
      headline, bullets, approvedAt: a.approvedAt,
    };
  }

  return {
    id:           clientRequest.id,
    businessName: clientRequest.businessName,
    status:       clientRequest.status,
    segment:      clientRequest.segment || (typeof scope.segment === "string" ? scope.segment : ""),
    targetAudience: typeof scope.targetAudience === "string" ? scope.targetAudience : "",
    socialPlatforms: (() => {
      const p = (scope.social as { platforms?: unknown } | undefined)?.platforms;
      return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
    })(),
    services,
    objectives,
    departments,
    createdAt:    clientRequest.createdAt,
    pipeline: artifacts.map((a) => ({
      id:           a.id,
      departmentKey: a.department,
      department:   CLIENT_SAFE_DEPARTMENTS[a.department] ?? a.department,
      approvedAt:   a.approvedAt,
      version:      a.version,
    })),
    approvals: approvals.map((ap) => mapearAprovacao(ap, deliverableContentFor)),
  };
}
