// POST /api/self-serve/webhook
// Receives Mercado Pago IPN / Webhook notifications for self-serve orders.
// On payment approved: marks the ClientRequestDb as "in_progress".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) return NextResponse.json({ ok: false }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // MP sends { type: "payment", data: { id: "..." } }
  const type = body.type as string | undefined;
  const paymentId = (body.data as Record<string, string> | undefined)?.id;
  if (type !== "payment" || !paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    // Fetch payment from MP to get status + external_reference
    const pmRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!pmRes.ok) return NextResponse.json({ ok: false }, { status: 502 });

    const pm = (await pmRes.json()) as {
      status?: string;
      external_reference?: string;
    };

    if (pm.status === "approved" && pm.external_reference) {
      await prisma.clientRequestDb.update({
        where: { id: pm.external_reference },
        data:  { status: "in_progress" },
      });
    }
  } catch (err) {
    console.error("[self-serve/webhook] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
