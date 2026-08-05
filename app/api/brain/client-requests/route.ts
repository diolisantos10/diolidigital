import { NextRequest, NextResponse } from "next/server";
import { createClientRequest, listClientRequests, updateClientRequest, getClientRequest, deleteClientRequest } from "@/lib/agency/persistence/client-request-service";
import { requireSession } from "@/lib/auth/api-guard";
import {
  clienteDoWorkspace,
  naoEncontrado,
  solicitacaoDoWorkspace,
} from "@/lib/auth/posse-de-workspace";
import { runAutoScope } from "@/lib/dioli-brain/run-auto-scope";
import { rateLimited } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { briefingConfirmationEmail } from "@/lib/email/templates";

// Fire-and-forget prospect confirmation. Reads the e-mail from the briefing
// scope; a no-op when e-mail isn't configured or no address was captured.
function sendBriefingConfirmation(body: Record<string, unknown>): void {
  if (body.source !== "briefing") return;
  const scope = (body.briefingJson as { scope?: Record<string, unknown> } | undefined)?.scope;
  const email = typeof scope?.prospectEmail === "string" ? scope.prospectEmail : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;

  const { subject, html } = briefingConfirmationEmail({
    prospectName: typeof scope?.prospectName === "string" ? scope.prospectName : undefined,
    businessName: typeof scope?.businessName === "string" ? scope.businessName : undefined,
    services:     Array.isArray(body.services) ? (body.services as string[]) : undefined,
  });

  sendEmail({ to: email, subject, html })
    .then((r) => {
      if (r.skipped) console.warn("[client-requests] confirmation e-mail skipped — RESEND_API_KEY not set");
      else if (!r.ok) console.error("[client-requests] confirmation e-mail failed:", r.error);
    })
    .catch((e) => console.error("[client-requests] confirmation e-mail threw:", e));
}

// GET (list) and PATCH (mutate) are internal — session required.
// POST stays public: it is the submit target of the public /briefing form.
// It can only create "new" requests (status/source are service-controlled).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  // Single-record fetch by id.
  //
  // ⚠️ O que este registro carrega: `rawContext`, o transcript do SDR e o
  // `sdrHandoffJson` — a conversa crua do prospect, com nome, telefone e
  // valores falados. Sem a posse, um id de outra agência devolvia tudo isso.
  if (id) {
    try {
      if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();
      const record = await getClientRequest(id);
      if (!record) return naoEncontrado();
      return NextResponse.json(record);
    } catch {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }
  }

  // O `?workspaceId=` da query MORREU: OMITI-LO listava a base inteira, de
  // todas as agências. O escopo da listagem é o da sessão, sempre — não é
  // parâmetro, é fato. (As órfãs continuam aparecendo para o dono real: quem
  // decide é `apenasDoWorkspace`, dentro do serviço.)
  const status      = searchParams.get("status") ?? undefined;
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  try {
    const records = await listClientRequests({
      workspaceId: session.workspaceId,
      status: status as never,
      limit,
    });
    return NextResponse.json(records);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Public + fires the AI auto-scope pipeline — cap it tightly per IP.
  const limited = rateLimited(request, "client-requests", 8, 60_000);
  if (limited) return limited as NextResponse;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { businessName } = body;
  if (!businessName || typeof businessName !== "string") {
    return NextResponse.json({ error: "businessName required" }, { status: 400 });
  }

  try {
    const record = await createClientRequest({
      businessName,
      segment:         typeof body.segment        === "string"   ? body.segment          : undefined,
      services:        Array.isArray(body.services)              ? body.services as string[] : [],
      objectives:      Array.isArray(body.objectives)            ? body.objectives as string[] : [],
      rawContext:      typeof body.rawContext      === "string"   ? body.rawContext        : "",
      source:          typeof body.source         === "string"   ? body.source            : "briefing",
      // `workspaceId`/`clientId` do CORPO não entram mais: esta rota é pública
      // (é o submit do formulário /briefing) e aceitá-los deixava qualquer
      // pessoa plantar uma solicitação dentro da caixa de entrada de uma
      // agência escolhida a dedo — e disparar o auto-scope, que gasta a chave
      // de IA DELA. Quem resolve o dono é o servidor
      // (`resolverWorkspacePublico`); a adoção explícita é o PATCH, que tem
      // sessão. Ver a regra da casa: no caminho público, o dono é DERIVADO,
      // nunca informado.
      briefingJson:    body.briefingJson    != null              ? body.briefingJson as object : undefined,
      sdrHandoffJson:  body.sdrHandoffJson  != null              ? body.sdrHandoffJson as object : undefined,
      attachmentsJson: Array.isArray(body.attachmentsJson)       ? body.attachmentsJson as object[] : [],
    });

    // Automatically generate the full scope as soon as the briefing lands —
    // no PM click needed. Fire-and-forget: the 201 returns immediately while
    // the synchronous engine chain runs in the background.
    runAutoScope(record.id).catch((e) => {
      console.error("[client-requests] background auto-scope failed for", record.id, e);
    });

    // Confirmation e-mail to the prospect — fire-and-forget, never blocks the 201.
    sendBriefingConfirmation(body);

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    console.error("[brain/client-requests] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();

    // `workspaceId` e `clientId` do corpo eram gravados direto
    // (`client-request-service:149`): dava para TRANSFERIR a solicitação de
    // outra agência para a sua com um PATCH — e, no sentido inverso, empurrar
    // a sua para fora. Adotar a órfã continua permitido (é o caminho legítimo
    // do briefing público), mas só para o SEU workspace, e o cliente apontado
    // tem que ser seu.
    if (typeof body.workspaceId === "string" && body.workspaceId !== session.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId não pode ser trocado por outro" },
        { status: 403 },
      );
    }
    if (typeof body.clientId === "string" && !(await clienteDoWorkspace(body.clientId, session.workspaceId))) {
      return naoEncontrado();
    }

    const record = await updateClientRequest(id, body as never);
    return NextResponse.json(record);
  } catch (e) {
    console.error("[brain/client-requests] PATCH error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // O apagão em cascata (BrainArtifact, ApprovalRequest → ApprovalComment)
    // é o motivo de esta conferência não ser negociável: sem ela, um id
    // digitado destruía o histórico de aprovação de outra agência inteira.
    if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();
    await deleteClientRequest(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[brain/client-requests] DELETE error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}
