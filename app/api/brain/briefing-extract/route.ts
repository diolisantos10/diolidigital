// POST /api/brain/briefing-extract
//
// Public endpoint (no auth required — called from the public /briefing page).
// Reads the conversation so far and the user's latest message, calls Claude
// Haiku to extract structured prospect fields that the rule-based regex may
// have missed, and returns them as JSON.
//
// Lei 2: AI only reads and extracts — it never sets pricing, question flow,
// or any structural rule. The client merges only into empty scope fields.
// Rule-based engine is the authoritative fallback when this returns ok:false.
//
// Security: ANTHROPIC_API_KEY stays server-side; PII is used only within the
// request/response cycle and never logged.

import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/security/rate-limit";
import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";

const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const MODEL       = "claude-haiku-4-5-20251001";
const TIMEOUT_MS  = 20_000;
const MAX_HISTORY = 10; // conversation turns sent to the model (keeps cost low)

interface ConvMsg { role: string; text: string }

interface ExtractRequest {
  messages: ConvMsg[];
  currentMessage: string;
}

interface ExtractedFields {
  prospectName?: string | null;
  businessName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  segment?: string | null;
  wantsSocialMedia?: boolean | null;
  wantsPaidTraffic?: boolean | null;
  objectives?: string[];
}

function buildPrompt(messages: ConvMsg[], currentMessage: string): string {
  const history = messages
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY)
    .map((m) => `${m.role === "assistant" ? "Consultora" : "Prospect"}: ${m.text}`)
    .join("\n");

  return `Você é um extrator de contexto. Analise a conversa abaixo e retorne um objeto JSON com os campos identificados.

REGRAS ESTRITAS:
- Extraia APENAS campos mencionados explicitamente pelo Prospect. Não invente.
- E-mail: apenas aceite formato valido (contém @ e dominio). Caso contrário: null.
- Telefone: apenas números de telefone/celular reais. Caso contrário: null.
- Nome da pessoa: nome próprio do prospect (não o negócio). Null se não mencionado.
- Nome do negócio: nome da empresa/marca. Null se não mencionado.
- Segmento: tipo de negócio (ex: "Restaurante / Alimentação", "Moda", "Saúde"). Null se não claro.
- wantsSocialMedia: true se mencionou redes sociais, social media, Instagram, Facebook, TikTok. False se recusou. Null se não mencionado.
- wantsPaidTraffic: true se mencionou tráfego pago, ads, anúncios, Meta Ads, Google Ads. False se recusou. Null se não mencionado.
- objectives: lista de objetivos de marketing mencionados (ex: "aumentar vendas", "fidelizar clientes"). Array vazio se não mencionado.

CONVERSA ATÉ AGORA:
${history}
Prospect: ${currentMessage}

Retorne SOMENTE o JSON válido, sem explicações adicionais:
{
  "prospectName": "nome ou null",
  "businessName": "nome do negócio ou null",
  "prospectEmail": "email@valido.com ou null",
  "prospectPhone": "telefone ou null",
  "segment": "segmento ou null",
  "wantsSocialMedia": true/false/null,
  "wantsPaidTraffic": true/false/null,
  "objectives": []
}`;
}

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function isValidPhone(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// Validate and sanitise the raw AI output before returning it to the client.
function validateExtracted(raw: unknown): ExtractedFields {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const out: ExtractedFields = {};

  if (isNonEmptyString(r.prospectName))  out.prospectName  = r.prospectName.trim();
  if (isNonEmptyString(r.businessName))  out.businessName  = r.businessName.trim();
  if (isValidEmail(r.prospectEmail))     out.prospectEmail = r.prospectEmail.trim();
  if (isValidPhone(r.prospectPhone))     out.prospectPhone = (r.prospectPhone as string).trim();
  if (isNonEmptyString(r.segment))       out.segment       = r.segment.trim();

  if (r.wantsSocialMedia === true || r.wantsSocialMedia === false) {
    out.wantsSocialMedia = r.wantsSocialMedia;
  }
  if (r.wantsPaidTraffic === true || r.wantsPaidTraffic === false) {
    out.wantsPaidTraffic = r.wantsPaidTraffic;
  }

  if (Array.isArray(r.objectives)) {
    out.objectives = (r.objectives as unknown[])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 6);
  }

  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _limited = rateLimited(req, "briefing-extract", 30, 60_000);
  if (_limited) return _limited as NextResponse;

  // A QUARTA porta da mesma família, que o raio-x não listou: esta rota também
  // é pública (só teto de ritmo por IP) e também caía no `findFirst` global.
  const resolved = await chaveDeRotaPublica("claude");
  if (!resolved) {
    // Not configured — tell client to rely on rule-based engine (not an error).
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }
  const apiKey = resolved.apiKey;

  let body: ExtractRequest;
  try {
    body = await req.json() as ExtractRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || typeof body.currentMessage !== "string") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const prompt = buildPrompt(body.messages, body.currentMessage);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[briefing-extract] Claude HTTP ${res.status}`);
      return NextResponse.json({ ok: false, reason: "provider_error" });
    }

    const json = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = json.content?.[0]?.text ?? "";

    // Strip markdown fences if present
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const jsonStart = stripped.indexOf("{");
    const jsonEnd   = stripped.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ ok: false, reason: "parse_error" });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1));
    } catch {
      return NextResponse.json({ ok: false, reason: "parse_error" });
    }

    const extracted = validateExtracted(raw);
    return NextResponse.json({ ok: true, extracted });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[briefing-extract] ${reason}`);
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}
