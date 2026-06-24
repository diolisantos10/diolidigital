// POST /api/self-serve/order
// Creates a self-serve order from the public vitrine.
//
// 1. Saves the order as a ClientRequestDb (source = "self_serve").
// 2. If MERCADOPAGO_ACCESS_TOKEN is configured, creates a Checkout Pro
//    preference and returns the init_point URL for redirect.
// 3. If no payment gateway is configured, returns success with a WhatsApp
//    follow-up (manual payment via Pix/WhatsApp).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";

const AGENCY_WHATSAPP = "5511989400692";
const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export interface OrderBody {
  serviceId: string;
  name: string;
  email: string;
  phone: string;          // e.g. "+55 11 99999-9999"
  note?: string;          // optional brief from buyer
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const { serviceId, name, email, phone, note } = body;
  if (!serviceId || !name || !email || !phone) {
    return NextResponse.json({ ok: false, error: "Campos obrigatórios: serviceId, name, email, phone." }, { status: 400 });
  }

  const service = SELF_SERVE_CATALOG.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ ok: false, error: "Serviço não encontrado." }, { status: 404 });
  }

  // ── 1. Save order as a ClientRequestDb ─────────────────────────────────
  const rawContext = [
    `Serviço: ${service.label}`,
    `Valor: R$ ${service.price}`,
    `Nome: ${name}`,
    `Email: ${email}`,
    `WhatsApp: ${phone}`,
    note ? `Observação: ${note}` : "",
  ].filter(Boolean).join("\n");

  let dbId: string;
  try {
    const row = await prisma.clientRequestDb.create({
      data: {
        businessName: name,
        segment:      service.category,
        services:     JSON.stringify([service.label]),
        objectives:   JSON.stringify([service.description]),
        rawContext,
        source:       "self_serve",
        status:       "new",
        attachmentsJson: "[]",
        briefingJson: JSON.stringify({
          businessName: name,
          segment: service.category,
          objectives: [service.description],
          wantsSocialMedia: service.category === "social" || service.category === "video",
          wantsPaidTraffic: service.category === "traffic",
          branding: { requested: service.category === "design", wantsRebrand: false },
          budgetRange: `R$ ${service.price}`,
          prospectName:  name,
          prospectEmail: email,
          prospectPhone: phone,
        }),
      },
    });
    dbId = row.id;
  } catch (err) {
    console.error("[self-serve/order] DB error:", err);
    return NextResponse.json({ ok: false, error: "Erro ao salvar pedido." }, { status: 500 });
  }

  // ── 2. Mercado Pago Checkout Pro (if configured) ────────────────────────
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (mpToken) {
    try {
      const preference = {
        items: [
          {
            id:          service.id,
            title:       service.label,
            description: service.description,
            quantity:    1,
            unit_price:  service.price,
            currency_id: "BRL",
          },
        ],
        payer: { name, email },
        back_urls: {
          success: `${APP_URL}/vitrine/sucesso?order=${dbId}`,
          failure: `${APP_URL}/vitrine?erro=pagamento`,
          pending: `${APP_URL}/vitrine/sucesso?order=${dbId}&pending=1`,
        },
        auto_return: "approved",
        notification_url: `${APP_URL}/api/self-serve/webhook`,
        external_reference: dbId,
        statement_descriptor: "Dioli Digital",
      };

      const mpRes = await fetch(MP_PREFERENCES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      });

      if (mpRes.ok) {
        const mpData = (await mpRes.json()) as { init_point?: string; sandbox_init_point?: string };
        const checkoutUrl = mpData.init_point ?? mpData.sandbox_init_point;
        if (checkoutUrl) {
          return NextResponse.json({ ok: true, orderId: dbId, checkoutUrl, method: "mercadopago" });
        }
      }
      // MP failed — fall through to WhatsApp flow
      console.warn("[self-serve/order] MP checkout failed, falling back to WhatsApp.");
    } catch (err) {
      console.warn("[self-serve/order] MP error:", err);
    }
  }

  // ── 3. Fallback: WhatsApp manual flow ──────────────────────────────────
  const waText = encodeURIComponent(
    `Olá! Acabei de solicitar o serviço *${service.label}* (R$ ${service.price}) pela vitrine da Dioli Digital.\n\nNome: ${name}\nE-mail: ${email}${note ? `\n\nObservação: ${note}` : ""}`
  );
  const whatsappUrl = `https://wa.me/${AGENCY_WHATSAPP}?text=${waText}`;

  return NextResponse.json({ ok: true, orderId: dbId, whatsappUrl, method: "whatsapp" });
}
