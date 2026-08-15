// leitura-de-marca.ts — A LEITURA DO BRAND BOOK, DENTRO DO MOTOR.
//
// ── POR QUE ESTE ARQUIVO MORA EM `lib/ai/` E NÃO EM `lib/agency/` ───────────
//
// Porque ele fala com a IA, e a Regra de Ouro desta casa é que **ninguém fala
// com a IA por fora do motor**. O portão que guarda isso
// (`__tests__/brain/no-parallel-brain.test.ts`) permite duas coisas: `lib/ai/`, e
// uma lista CONGELADA de dívida anterior ao portão que só pode diminuir.
//
// A primeira versão desta mudança pôs este arquivo em `lib/agency/brand/` e o
// portão reprovou — corretamente. A saída NÃO foi acrescentar uma exceção: foi
// pôr o código onde ele deveria estar desde sempre, ao lado de `visao.ts`, que
// é o mesmo caso (um formato que o `generate()` de texto não carrega).
//
// E o efeito colateral é o que o portão pede: a lista congelada **encolheu**.
// `app/api/brain/analyze-brand-book/route.ts` saiu dela, porque não fala mais
// com a IA — ele chama daqui.
//
// ⚠️ Dívida honesta que fica: `generate()` transporta `system` + `user` como
// TEXTO, e o adaptador de provedor (`ProviderAdapter.call`) tem essa forma para
// os três provedores. Bloco de documento (o PDF nativo) não cabe nesse contrato
// sem mudar os três. Enquanto não mudar, a leitura de documento fala com o
// Claude aqui dentro — no motor, sob a mesma regra, e não espalhada por rotas.
//
// ── POR QUE SAIU DE DENTRO DA ROTA (15/08/2026) ────────────────────────────
//
// O analisador morava inteiro em `app/api/brain/analyze-brand-book/route.ts`, e
// a primeira linha do handler é `if (!session || session.clientId) → 403`. Ou
// seja: **só a agência logada conseguia disparar a análise.**
//
// Isso estava certo enquanto o brand book só chegava pela tela da agência. Deixou
// de estar no momento em que o CLIENTE passou a mandar o brand book pelo portal,
// onde não existe sessão — existe token. Sem esta extração havia só dois
// caminhos, e os dois ruins: ou o cliente manda o PDF e ninguém lê (o arquivo
// vira anexo morto), ou se abre a rota para o portal — e aí um token de cliente
// passaria a gastar a chave de IA da agência à vontade.
//
// A saída é a de sempre nesta casa: **uma implementação, dois chamadores.** A
// decisão de QUEM PODE continua em cada porta; o que é comum — ler o arquivo,
// falar com o modelo, validar o que voltou — mora aqui e não se duplica.
//
// ── O QUE ESTA ANÁLISE ALCANÇA, E É MENOS DO QUE PARECE ─────────────────────
//
// Ela extrai **TEXTO**: paleta, tipografia, tom, público, posicionamento.
// **Nenhum byte de logo sai de dentro do PDF** — não há biblioteca de PDF neste
// projeto, e "extrair a imagem do logo do brand book" não é uma coisa que este
// código faça nem finja fazer.
//
// Medido contra a ficha de marca (`proposta-do-brand-book.ts`): o brand book
// alcança **3 dos 9 campos**, e nenhum dos três tira a marca do dia zero. Quem
// chamar isto e mostrar o resultado na tela é obrigado a dizer o que continua
// faltando — senão o dono manda o PDF, vê a ficha andar três pontos, e conclui
// que o sistema comeu o arquivo dele.

import AdmZip from "adm-zip";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import type { BrandExtraction } from "@/lib/types/brand-extraction";

export const MAX_BYTES_DO_BRAND_BOOK = 20 * 1024 * 1024; // 20 MB
export const TIMEOUT_MS = 90_000;

export const SYSTEM_PROMPT = `Você é um especialista em análise de identidade de marca. Analise o documento enviado — pode ser um brand book, manual da marca, apresentação de branding, identidade visual ou similar — e extraia as informações de identidade da marca.

Retorne APENAS JSON válido com esta estrutura exata:
{
  "brandName": "nome oficial da marca",
  "tagline": "slogan ou tagline, ou string vazia se não houver",
  "primaryColor": "#HEXCODE da cor primária principal (ex: #070A1F)",
  "secondaryColor": "#HEXCODE da cor secundária (ex: #1A1A1A), ou string vazia",
  "accentColor": "#HEXCODE de cor de destaque ou terciária, ou string vazia",
  "typography": "nome(s) da(s) fonte(s) principal(is) (ex: Geist Sans, Inter Bold)",
  "tone": "tom de voz da marca em 3-5 palavras (ex: profissional e próximo, moderno e ousado)",
  "values": ["valor 1", "valor 2", "valor 3"],
  "targetAudience": "descrição do público-alvo em 1-2 frases",
  "positioning": "posicionamento da marca no mercado em 1-2 frases",
  "summary": "resumo da identidade completa da marca em 2-3 frases"
}

Para cores: identifique pelos swatches visuais, pela paleta de cores apresentada ou por menção textual (ex: "Cor Principal: #070A1F"). Se não conseguir extrair um hex exato, estime pela cor predominante visível.
Se alguma informação não estiver no documento, use string vazia ou array vazio — nunca invente.`;

// ── Extratores de texto ─────────────────────────────────────────────────────

function stripXmlTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

export function extractDocxText(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);
    const entry = zip.getEntry("word/document.xml");
    if (!entry) return "";
    return stripXmlTags(entry.getData().toString("utf8"));
  } catch { return ""; }
}

export function extractPptxText(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);
    const slides = zip.getEntries()
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    return slides.map(s => stripXmlTags(s.getData().toString("utf8"))).join("\n\n");
  } catch { return ""; }
}

// ── O que voltou do modelo ──────────────────────────────────────────────────

export function extractJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

/**
 * O que voltou é uma extração de verdade?
 *
 * `brandName` vazio reprova a extração inteira, e isso não é rigor decorativo:
 * é o campo que `extracaoDoCorpo` (a ponte com a ficha) exige para aceitar
 * qualquer coisa. Uma extração sem nome de marca chegaria lá e seria recusada
 * de todo jeito — melhor recusar aqui, onde ainda dá para dizer o porquê.
 */
export function validate(data: unknown): BrandExtraction | null {
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

export type ResultadoDaAnalise =
  | { ok: true; extraction: BrandExtraction; tipoDoArquivo: string }
  | { ok: false; erro: string; status: number };

/**
 * Lê UM documento de marca e devolve o que der para extrair.
 *
 * Fail-closed em todos os ramos: qualquer dúvida devolve `ok: false` com recado
 * em português e o status que a porta HTTP deve usar. Não existe caminho que
 * devolva uma extração pela metade fingindo sucesso.
 */
export async function analisarBrandBook(entrada: {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  /** De quem é a chave de IA. É a fronteira do inquilino — nunca uma chave
   *  global: o custo da leitura é do workspace dono do arquivo. */
  workspaceId: string;
}): Promise<ResultadoDaAnalise> {
  const { bytes: buf, mimeType: mime, fileName } = entrada;

  if (buf.length > MAX_BYTES_DO_BRAND_BOOK) {
    return {
      ok: false,
      status: 400,
      erro: `Arquivo muito grande para a leitura automática — máximo 20 MB. Seu arquivo: ${(buf.length / 1024 / 1024).toFixed(1)} MB`,
    };
  }

  const resolved = await resolveProviderKey("claude", entrada.workspaceId);
  if (!resolved) {
    return { ok: false, status: 503, erro: "Nenhuma chave Claude conectada. Configure em Integrações." };
  }

  type TextBlock = { type: "text"; text: string };
  type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
  type DocBlock   = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
  type Block = TextBlock | ImageBlock | DocBlock;

  const instruction = "Analise este documento e extraia a identidade de marca. Retorne apenas JSON.";
  let content: Block[];
  let tipoDoArquivo: string;

  if (mime === "application/pdf") {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
    tipoDoArquivo = "PDF";

  } else if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    content = [
      { type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } },
      { type: "text", text: instruction },
    ];
    tipoDoArquivo = "Imagem";

  } else if (mime === "image/svg+xml") {
    const svgText = buf.toString("utf8").slice(0, 10_000);
    content = [{ type: "text", text: `${instruction}\n\nArquivo SVG:\n${svgText}` }];
    tipoDoArquivo = "SVG";

  } else if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const text = extractDocxText(buf);
    if (!text) return { ok: false, status: 422, erro: "Não foi possível extrair texto do DOCX." };
    content = [{ type: "text", text: `${instruction}\n\nConteúdo do documento Word:\n${text.slice(0, 15_000)}` }];
    tipoDoArquivo = "DOCX";

  } else if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    const text = extractPptxText(buf);
    if (!text) return { ok: false, status: 422, erro: "Não foi possível extrair texto do PPTX." };
    content = [{ type: "text", text: `${instruction}\n\nConteúdo da apresentação PowerPoint:\n${text.slice(0, 15_000)}` }];
    tipoDoArquivo = "PPTX";

  } else {
    const text = buf.toString("utf8").slice(0, 15_000);
    content = [{ type: "text", text: `${instruction}\n\nConteúdo do arquivo:\n${text}` }];
    tipoDoArquivo = "Arquivo";
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
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, status: 502, erro: `Claude HTTP ${res.status}: ${err.slice(0, 300)}` };
    }

    const json = (await res.json()) as { content?: { text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return { ok: false, status: 502, erro: "Resposta Claude vazia." };

    const extraction = validate(extractJson(text));
    if (!extraction) {
      return {
        ok: false,
        status: 422,
        erro: `Não consegui extrair dados de marca de "${fileName}". Verifique se é realmente um brand book ou documento de identidade visual.`,
      };
    }

    return { ok: true, extraction, tipoDoArquivo };

  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "timeout (90s)" : String(err);
    return { ok: false, status: 502, erro: `Falha ao chamar Claude: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
