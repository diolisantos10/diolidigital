// POST /api/sdr/upload
//
// Public endpoint (no auth — called from the public /briefing page).
// Accepts a briefing file (PDF, Word, PowerPoint, image, text) and returns
// the extracted text so the SDR agent (Claude) can READ the briefing and
// continue the conversation with that context.
//
// Extraction strategy:
//   DOCX / PPTX   → unzip + strip XML (fast, no AI)
//   TXT/CSV/MD/SVG→ utf8 text
//   PDF           → Claude document API (reads text + layout)
//   PNG/JPG/WEBP  → Claude Vision (transcribes/describes the briefing)
//
// The file bytes themselves are NOT stored — only the extracted text is
// returned to the client, which feeds it into the conversation. Storage of
// the raw file is a separate (future) concern.

import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/security/rate-limit";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import AdmZip from "adm-zip";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_CHARS = 8_000;            // cap fed back to the SDR
const TIMEOUT_MS = 60_000;

const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "text/markdown": "MD",
};

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
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    return slides.map((s) => stripXmlTags(s.getData().toString("utf8"))).join("\n\n");
  } catch { return ""; }
}

// Ask Claude to transcribe a PDF or image into plain briefing text.
async function extractWithClaude(buf: Buffer, mime: string): Promise<string> {
  const resolved = await resolveProviderKey("claude");
  if (!resolved) return "";

  type Block =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

  const instruction =
    "Este arquivo é um briefing de um cliente de marketing. Transcreva e organize TODO o conteúdo textual relevante (negócio, serviços desejados, objetivos, quantidades, prazos, contato). Responda apenas com o texto do briefing, sem comentários.";

  let content: Block[];
  if (mime === "application/pdf") {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
  } else {
    content = [
      { type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
  }

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[sdr/upload] Claude HTTP ${res.status}`);
      return "";
    }
    const json = (await res.json()) as { content?: { text: string }[] };
    return json.content?.[0]?.text?.trim() ?? "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const _limited = rateLimited(req, "sdr-upload", 12, 60_000);
  if (_limited) return _limited as NextResponse;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, reason: "too_large" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const fileType = MIME_LABEL[mime] ?? (file.name.split(".").pop()?.toUpperCase() ?? "FILE");
  const buf = Buffer.from(await file.arrayBuffer());

  let extractedText = "";

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    extractedText = extractDocxText(buf);
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    extractedText = extractPptxText(buf);
  } else if (/^text\//.test(mime) || mime === "image/svg+xml") {
    extractedText = buf.toString("utf8");
  } else if (mime === "application/pdf" || ["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    extractedText = await extractWithClaude(buf, mime);
  }
  // .doc (legacy binary) and unknown types fall through with empty text —
  // the file is still acknowledged as an attachment.

  extractedText = extractedText.replace(/\s+\n/g, "\n").trim().slice(0, MAX_TEXT_CHARS);

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    fileType,
    sizeBytes: file.size,
    mimeType: mime,
    extractedText,
  });
}
