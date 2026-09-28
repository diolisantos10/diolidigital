// GET/POST /api/agency/clients/[id]/entrada — POR MARCA: upload de foto/vídeo
// + UMA FRASE vira peça no calendário, com prioridade (1D-D1, 27/09/2026,
// ordem do CEO).
//
// GET  → lista as entradas do cliente, com status.
// POST → multipart (arquivos + frase): master/project_manager/social_staff;
//        teto de tamanho e MIME imagem/vídeo; salva via `armazenamento.ts`,
//        interpreta pela IA + conferência determinística de data
//        (`interpretarFrase`) e encaixa no calendário na hora
//        (`encaixarNoCalendario`) — a menos que a interpretação precise de
//        confirmação, caso em que fica em "preciso_confirmar" e espera
//        `POST .../entrada/[entradaId]/confirmar`.
//
// Guarda igual a `app/api/agency/clients/[id]/pacote/route.ts`: sessão
// obrigatória, nunca sessão de portal, CSRF na mutação, rate limit, e a posse
// do cliente vem de `posse-do-cliente.ts` — 404, nunca 403, para cliente de
// outro workspace.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { guardarArquivo, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";
import { interpretarFrase, encaixarNoCalendario, entradaExistenteParaMedia } from "@/lib/agency/esteira/entrada-de-material";

export const dynamic = "force-dynamic";

const PODEM_ENVIAR = ["master", "project_manager", "social_staff"] as const;

/** Só imagem/vídeo aqui — mais estreito que `MIMES_ACEITOS` de
 *  `armazenamento.ts` (que também aceita PDF/docx/etc.): entrada de material
 *  é sobre a PEÇA, nunca sobre documento. */
const MIME_ACEITO = /^(?:image|video)\//;

/** Um teto razoável por envio — não é o teto de tamanho (esse já é por
 *  arquivo, `MAX_BYTES_POR_ARQUIVO`), é o de QUANTOS arquivos por pedido. */
const MAX_ARQUIVOS_POR_ENVIO = 10;

/** O teto do CORPO INTEIRO do multipart — achado de segurança S6, 28/09/2026.
 *  `MAX_BYTES_POR_ARQUIVO` e `MAX_ARQUIVOS_POR_ENVIO` acima só valem DEPOIS de
 *  `request.formData()` já ter lido e bufferizado o envio INTEIRO em memória —
 *  `formData()` não tem teto de fábrica em route handler (o `bodySizeLimit`
 *  do `next.config.ts` só vale para Server Actions), e não há `middleware.ts`
 *  nesta casa para segurar isso antes do handler. Sem esta linha, um envio de
 *  muitos gigabytes é bufferizado por inteiro antes de qualquer checagem
 *  rodar — o mesmo raciocínio de `app/api/brain/client-requests/route.ts`.
 *
 *  ⚠️ É a camada BARATA, não a única: `Content-Length` é declarado pelo
 *  CHAMADOR — pode faltar (`Transfer-Encoding: chunked`) ou mentir para
 *  menos. Multipart não tem, hoje, uma segunda camada equivalente à de JSON
 *  (medir o texto de novo depois de lido) sem trocar `formData()` por um
 *  parser de stream — isso fica descrito como pendência, não resolvido aqui. */
const TETO_DO_CORPO_MULTIPART = MAX_ARQUIVOS_POR_ENVIO * MAX_BYTES_POR_ARQUIVO + 5_000_000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;
  // Sessão de portal nunca lê a tela administrativa de entrada de material.
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entradas = await prisma.entradaDeMaterial.findMany({
    where: { clientId: id, workspaceId: session.workspaceId },
    orderBy: { criadaEm: "desc" },
    select: {
      id: true, origem: true, frase: true, status: true, motivo: true,
      mediaAssetIdsJson: true, socialPostIdsJson: true, interpretacaoJson: true,
      criadaEm: true, atualizadaEm: true,
    },
  });

  return NextResponse.json({ entradas: entradas.map(paraSaida) });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { session, error } = await requireSession([...PODEM_ENVIAR]);
  if (error) return error;
  if (session.clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (deveBloquearMutacaoCrossSite(request)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const { allowed, retryAfter } = rateLimit(`entrada-de-material:${session.userId}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitos envios em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // O teto de tamanho vem ANTES do parse — ver `TETO_DO_CORPO_MULTIPART`.
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > TETO_DO_CORPO_MULTIPART) {
    return NextResponse.json({ error: "Envio grande demais." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }

  const frase = String(form.get("frase") ?? "").trim();
  if (!frase) {
    return NextResponse.json(
      { error: "Escreva a frase — ela é o que diz o que fazer com o material (ex.: \"lançamento X, postar dia 15/10\")." },
      { status: 400 },
    );
  }
  if (frase.length > 500) {
    return NextResponse.json({ error: "Frase longa demais (máximo 500 caracteres)." }, { status: 400 });
  }

  const arquivos = form.getAll("arquivos").filter((v): v is File => v instanceof Blob) as File[];
  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Mande pelo menos uma foto ou vídeo." }, { status: 400 });
  }
  if (arquivos.length > MAX_ARQUIVOS_POR_ENVIO) {
    return NextResponse.json({ error: `No máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio.` }, { status: 400 });
  }
  for (const arq of arquivos) {
    if (!MIME_ACEITO.test(arq.type || "")) {
      return NextResponse.json(
        { error: `Só aceito foto ou vídeo aqui — "${arq.name}" veio como "${arq.type || "tipo desconhecido"}".` },
        { status: 400 },
      );
    }
    if (arq.size > MAX_BYTES_POR_ARQUIVO) {
      const mb = Math.round(MAX_BYTES_POR_ARQUIVO / 1024 / 1024);
      return NextResponse.json({ error: `"${arq.name}" passa de ${mb} MB.` }, { status: 413 });
    }
  }

  const midias: { mime: string; duracaoS: number | null }[] = [];
  const mediaAssetIds: string[] = [];

  for (const arq of arquivos) {
    const bytes = Buffer.from(await arq.arrayBuffer());
    const mime = arq.type || "application/octet-stream";
    const duracaoS = mime.startsWith("video/") ? await medirDuracaoDoVideo(bytes).catch(() => null) : null;

    const guardado = await guardarArquivo({
      bytes,
      fileName: arq.name || "arquivo",
      mimeType: mime,
      workspaceId: session.workspaceId,
      clientId: id,
      kind: "inbound",
      uploadedBy: `equipe:${session.email}`,
      duracaoS,
    });
    if (!guardado.ok) {
      return NextResponse.json({ error: guardado.motivo, codigo: guardado.erro }, { status: 400 });
    }
    mediaAssetIds.push(guardado.arquivo.id);
    midias.push({ mime, duracaoS });
  }

  // DEDUPE — achado da `qualidade` (D5, 28/09/2026): a mesma foto já pode ter
  // entrado por OUTRO caminho (a vigia do Drive, `vigia-da-entrada.ts`) antes
  // desta equipe subir de novo pela tela. Sem isto, a mesma imagem virava
  // DOIS posts agendados. Confere TODOS os arquivos deste envio — um só já
  // duplicado marca a entrada inteira como recusada, sem interpretar/encaixar.
  let duplicadaDe: string | null = null;
  for (const mediaAssetId of mediaAssetIds) {
    const existente = await entradaExistenteParaMedia({ workspaceId: session.workspaceId, clientId: id, mediaAssetId });
    if (existente) { duplicadaDe = existente.id; break; }
  }

  const agora = new Date();
  const entrada = await prisma.entradaDeMaterial.create({
    data: {
      workspaceId: session.workspaceId,
      clientId: id,
      origem: "upload",
      frase,
      mediaAssetIdsJson: JSON.stringify(mediaAssetIds),
      status: duplicadaDe ? "recusada" : "recebida",
      motivo: duplicadaDe
        ? `este material já entrou antes (entrada ${duplicadaDe}) — não criei um segundo post para a mesma mídia`
        : null,
    },
  });

  if (duplicadaDe) {
    return NextResponse.json({ entrada: paraSaida(entrada) }, { status: 201 });
  }

  const resultado = await interpretarFrase({
    workspaceId: session.workspaceId, clientId: id, frase, hoje: agora, midias,
  });

  if (!resultado.ok) {
    const recusada = await prisma.entradaDeMaterial.update({
      where: { id: entrada.id },
      data: { status: "recusada", motivo: resultado.motivo },
    });
    return NextResponse.json({ entrada: paraSaida(recusada) }, { status: 201 });
  }

  const salva = await prisma.entradaDeMaterial.update({
    where: { id: entrada.id },
    data: {
      interpretacaoJson: JSON.stringify(resultado.interpretacao),
      status: resultado.interpretacao.dataAmbigua ? "preciso_confirmar" : "interpretada",
      motivo: resultado.interpretacao.dataAmbigua ? resultado.interpretacao.motivoDaAmbiguidade : null,
    },
  });

  if (resultado.interpretacao.dataAmbigua) {
    return NextResponse.json({ entrada: paraSaida(salva) }, { status: 201 });
  }

  const encaixe = await encaixarNoCalendario({
    workspaceId: session.workspaceId, clientId: id, entradaId: entrada.id, agora,
  });

  const final = encaixe.ok
    ? await prisma.entradaDeMaterial.findUnique({ where: { id: entrada.id } })
    : await prisma.entradaDeMaterial.update({
        where: { id: entrada.id },
        data: { status: "recusada", motivo: encaixe.motivo },
      });

  return NextResponse.json({ entrada: paraSaida(final ?? salva) }, { status: 201 });
}

async function medirDuracaoDoVideo(bytes: Buffer): Promise<number | null> {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { duracaoDe } = await import("@/lib/agency/media/video");

  const dir = await mkdtemp(path.join(tmpdir(), "dioli-entrada-"));
  try {
    const caminho = path.join(dir, "bruto");
    await writeFile(caminho, bytes);
    return await duracaoDe(caminho);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}

interface EntradaDb {
  id: string;
  origem: string;
  frase: string;
  status: string;
  motivo: string | null;
  mediaAssetIdsJson?: string;
  socialPostIdsJson: string;
  interpretacaoJson?: string | null;
  criadaEm: Date;
  atualizadaEm: Date;
}

function paraSaida(e: EntradaDb) {
  return {
    id: e.id,
    origem: e.origem,
    frase: e.frase,
    status: e.status,
    motivo: e.motivo,
    mediaAssetIds: lerListaJson(e.mediaAssetIdsJson),
    socialPostIds: lerListaJson(e.socialPostIdsJson),
    interpretacao: e.interpretacaoJson ? JSON.parse(e.interpretacaoJson) : null,
    criadaEm: e.criadaEm,
    atualizadaEm: e.atualizadaEm,
  };
}

function lerListaJson(bruto: string | null | undefined): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
