import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createClientRequest, listClientRequests, updateClientRequest, getClientRequest, deleteClientRequest } from "@/lib/agency/persistence/client-request-service";
import { requireSession } from "@/lib/auth/api-guard";
import { runAutoScope } from "@/lib/dioli-brain/run-auto-scope";
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
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  // Single-record fetch by id.
  if (id) {
    try {
      const record = await getClientRequest(id);
      if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(record);
    } catch {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }
  }

  const workspaceId = searchParams.get("workspaceId") ?? undefined;
  const status      = searchParams.get("status") ?? undefined;
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  try {
    const records = await listClientRequests({ workspaceId, status: status as never, limit });
    return NextResponse.json(records);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
      workspaceId:     typeof body.workspaceId    === "string"   ? body.workspaceId       : undefined,
      clientId:        typeof body.clientId       === "string"   ? body.clientId          : undefined,
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
  const { error } = await requireSession();
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
    const record = await updateClientRequest(id, body as never);
    return NextResponse.json(record);
  } catch (e) {
    console.error("[brain/client-requests] PATCH error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await deleteClientRequest(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[brain/client-requests] DELETE error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}
