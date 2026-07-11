// POST /api/self-serve/webhook
// Receives Mercado Pago IPN / Webhook notifications for self-serve orders.
// On payment approved: marks the ClientRequestDb as "in_progress".

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";

// Validate Mercado Pago's x-signature HMAC. Manifest per MP docs:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// Only enforced when MERCADOPAGO_WEBHOOK_SECRET is set (so it can't lock out an
// unconfigured instance); when set, a bad/missing signature is rejected.
function verifyMpSignature(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // not configured → skip (warned below)
  const sig = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!sig) return false;
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=").map((x) => x.trim())));
  const ts = parts.ts, v1 = parts.v1;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { return false; }
}

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

  if (!verifyMpSignature(req, paymentId)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    console.warn("[self-serve/webhook] MERCADOPAGO_WEBHOOK_SECRET não definido — assinatura NÃO verificada.");
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
