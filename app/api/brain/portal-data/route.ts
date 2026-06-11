// Returns client-safe Brain pipeline data for the portal.
// Strips internal fields (promptSummary, cognitiveFlow, etc.) before sending.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";

const CLIENT_SAFE_DEPARTMENTS: Record<string, string> = {
  strategy:  "Estratégia",
  social:    "Social Media",
  design:    "Design",
  traffic:   "Tráfego Pago",
  analytics: "Analytics",
  quality:   "Revisão de Qualidade",
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token           = searchParams.get("token");
  const clientRequestId = searchParams.get("clientRequestId");
  const clientId        = searchParams.get("clientId");

  // Token-based access — most secure path
  if (token) {
    const access = await validatePortalAccess(token);
    if (!access.valid) {
      return NextResponse.json({ error: "Access denied", reason: access.reason }, { status: 403 });
    }
    const reqId = access.record?.clientRequestId;
    if (!reqId) {
      return NextResponse.json({ error: "Token not linked to a request" }, { status: 404 });
    }
    return NextResponse.json(await buildPortalData(reqId));
  }

  // Direct clientRequestId (internal use / testing)
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

async function buildPortalData(clientRequestId: string) {
  const [clientRequest, artifacts, approvals] = await Promise.all([
    prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
    prisma.brainArtifact.findMany({
      where: { clientRequestId, status: "approved" },
      orderBy: { approvedAt: "asc" },
      select: {
        id: true, department: true, canvasId: true,
        version: true, status: true, approvedAt: true,
      },
    }),
    prisma.approvalRequest.findMany({
      where: { clientRequestId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      include: {
        comments: {
          where: { isClientVisible: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, authorName: true, authorRole: true, body: true, createdAt: true },
        },
      },
    }),
  ]);

  if (!clientRequest) return null;

  const services = (() => { try { return JSON.parse(clientRequest.services); } catch { return []; } })();
  const objectives = (() => { try { return JSON.parse(clientRequest.objectives); } catch { return []; } })();

  return {
    id:           clientRequest.id,
    businessName: clientRequest.businessName,
    status:       clientRequest.status,
    services,
    objectives,
    createdAt:    clientRequest.createdAt,
    pipeline: artifacts.map((a) => ({
      id:           a.id,
      departmentKey: a.department,
      department:   CLIENT_SAFE_DEPARTMENTS[a.department] ?? a.department,
      approvedAt:   a.approvedAt,
      version:      a.version,
    })),
    approvals: approvals.map((ap) => ({
      id:         ap.id,
      department: CLIENT_SAFE_DEPARTMENTS[ap.department] ?? ap.department,
      status:     ap.status,
      reviewedAt: ap.reviewedAt,
      reviewNote: ap.reviewNote,
      comments:   ap.comments,
    })),
  };
}
