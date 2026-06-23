// ─── Brand Book Analyzer ─────────────────────────────────────────────────────
// Accepts any file the client can upload — PDF, images, DOCX, PPTX, SVG —
// and uses Claude Vision / Document API to extract brand identity data.
//
// Supported formats:
//   PDF            → Claude native document API (reads text + visuals)
//   PNG/JPG/WEBP   → Claude Vision (base64 image)
//   SVG            → sent as XML text
//   DOCX           → unzip → extract word/document.xml text
//   PPTX           → unzip → extract ppt/slides/*.xml text
//   ZIP            → attempt DOCX/PPTX detection inside
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import AdmZip from "adm-zip";

export interface BrandExtraction {
  brandName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  typography: string;
  tone: string;
  values: string[];
  targetAudience: string;
  positioning: string;
  summary: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `Você é um especialista em análise de identidade de marca. Analise o documento enviado — pode ser um brand book, manual da marca, apresentação de branding, identidade visual ou similar — e extraia as informações de identidade da marca.

Retorne APENAS JSON válido com esta estrutura exata:
{
  "brandName": "nome oficial da marca",
  "tagline": "slogan ou tagline, ou string vazia se não houver",
  "primaryColor": "#HEXCODE da cor primária principal (ex: #5B5BD6)",
  "secondaryColor": "#HEXCODE da cor secundária (ex: #1A1A1A), ou string vazia",
  "accentColor": "#HEXCODE de cor de destaque ou terciária, ou string vazia",
  "typography": "nome(s) da(s) fonte(s) principal(is) (ex: Geist Sans, Inter Bold)",
  "tone": "tom de voz da marca em 3-5 palavras (ex: profissional e próximo, moderno e ousado)",
  "values": ["valor 1", "valor 2", "valor 3"],
  "targetAudience": "descrição do público-alvo em 1-2 frases",
  "positioning": "posicionamento da marca no mercado em 1-2 frases",
  "summary": "resumo da identidade completa da marca em 2-3 frases"
}

Para cores: identifique pelos swatches visuais, pela paleta de cores apresentada ou por menção textual (ex: "Cor Principal: #5B5BD6"). Se não conseguir extrair um hex exato, estime pela cor predominante visível.
Se alguma informação não estiver no documento, use string vazia ou array vazio — nunca invente.`;

// ── Text extractors ───────────────────────────────────────────────────────────

function stripXmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

function extractDocxText(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return "";
    return stripXmlTags(entry.getData().toString("utf8"));
  } catch { return ""; }
}

function extractPptxText(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);
    const slides = zip.getEntries()
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    return slides.map(s => stripXmlTags(s.getData().toString("utf8"))).join("\n\n");
  } catch { return ""; }
}

// ── Claude response utilities ─────────────────────────────────────────────────

function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

function validate(data: unknown): BrandExtraction | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.brandName !== "string" || !d.brandName) return null;
  return {
    brandName:      String(d.brandName ?? ""),
    tagline:        String(d.tagline ?? ""),
    primaryColor:   String(d.primaryColor ?? ""),
    secondaryColor: String(d.secondaryColor ?? ""),
    accentColor:    String(d.accentColor ?? ""),
    typography:     String(d.typography ?? ""),
    tone:           String(d.tone ?? ""),
    values:         Array.isArray(d.values) ? (d.values as string[]).map(String) : [],
    targetAudience: String(d.targetAudience ?? ""),
    positioning:    String(d.positioning ?? ""),
    summary:        String(d.summary ?? ""),
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveProviderKey("claude", session.workspaceId);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "Nenhuma chave Claude conectada. Configure em Integrações." }, { status: 503 });
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Falha ao ler o upload." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: `Arquivo muito grande — máximo 20 MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(1)} MB` }, { status: 400 });
  }

  const mime = file.type;
  const buf = Buffer.from(await file.arrayBuffer());

  // ── Build Claude content blocks ───────────────────────────────────────────

  type TextBlock = { type: "text"; text: string };
  type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
  type DocBlock   = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
  type Block = TextBlock | ImageBlock | DocBlock;

  const instruction = "Analise este documento e extraia a identidade de marca. Retorne apenas JSON.";
  let content: Block[];
  let fileLabel: string;

  if (mime === "application/pdf") {
    // Claude reads PDF natively — text, tables, and visuals
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
    fileLabel = "PDF";

  } else if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    content = [
      { type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
    fileLabel = "Imagem";

  } else if (mime === "image/svg+xml") {
    const svgText = buf.toString("utf8").slice(0, 10_000);
    content = [{ type: "text", text: `${instruction}\n\nArquivo SVG:\n${svgText}` }];
    fileLabel = "SVG";

  } else if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const text = extractDocxText(buf);
    if (!text) return NextResponse.json({ ok: false, error: "Não foi possível extrair texto do DOCX." }, { status: 422 });
    content = [{ type: "text", text: `${instruction}\n\nConteúdo do documento Word:\n${text.slice(0, 15_000)}` }];
    fileLabel = "DOCX";

  } else if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    const text = extractPptxText(buf);
    if (!text) return NextResponse.json({ ok: false, error: "Não foi possível extrair texto do PPTX." }, { status: 422 });
    content = [{ type: "text", text: `${instruction}\n\nConteúdo da apresentação PowerPoint:\n${text.slice(0, 15_000)}` }];
    fileLabel = "PPTX";

  } else {
    // Unknown — try as UTF-8 text (TXT, CSV, etc.)
    const text = buf.toString("utf8").slice(0, 15_000);
    content = [{ type: "text", text: `${instruction}\n\nConteúdo do arquivo:\n${text}` }];
    fileLabel = "Arquivo";
  }

  // ── Call Claude ───────────────────────────────────────────────────────────

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: `Claude HTTP ${res.status}: ${err.slice(0, 300)}` }, { status: 502 });
    }

    const json = (await res.json()) as { content?: { text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return NextResponse.json({ ok: false, error: "Resposta Claude vazia." }, { status: 502 });

    const extraction = validate(extractJson(text));
    if (!extraction) return NextResponse.json({ ok: false, error: "Claude não conseguiu extrair dados de marca do arquivo. Verifique se é realmente um brand book ou documento de identidade visual." }, { status: 422 });

    return NextResponse.json({ ok: true, extraction, fileName: file.name, fileType: fileLabel });

  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout (90s)" : String(err);
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude: ${msg}` }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
