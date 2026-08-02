// artes.ts — O DESIGN PASSA A PRODUZIR IMAGEM, NÃO DESCRIÇÃO DE IMAGEM.
//
// O buraco: `design-engine.ts` — gerador de imagem, pronto, funcionando, com
// fallback de modelo e tudo — não tinha um único chamador na esteira de
// produção. O departamento de Design entregava TEXTO descrevendo o que uma
// peça deveria ser ("fundo escuro, tipografia serifada, o pão em close").
// Bonito de ler e impossível de postar: o Instagram exige mídia em todo
// formato, então cada post ficava parado esperando uma imagem que ninguém
// produzia. A agência vendia arte e entregava briefing de arte.
//
// O QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO:
//
// Não põe texto na imagem. Modelo de imagem erra letra, e errar letra numa peça
// é o cliente publicando "PROMOÇÂO" no perfil dele. Pior: preço, telefone e
// prazo dentro de um pixel escapam do piso de verdade, que lê texto e não
// enxerga imagem — seria o único lugar da casa onde um dado inventado passaria
// sem ninguém conferir. Legenda é texto, e texto vai na legenda.

import { prisma } from "@/lib/db/client";
import { generateDesign } from "@/lib/ai/design-engine";
import { guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";

/** Quantas artes por rodada. Cada uma é uma chamada cara de modelo de imagem —
 *  um calendário de 12 posts custaria 12 de uma vez se não houvesse teto. */
const MAX_ARTES_POR_RODADA = 6;

/** Depois disto, a peça para de tentar sozinha. Modelo de imagem falha por
 *  motivos que não melhoram com insistência (conteúdo recusado, conta sem
 *  acesso), e cada tentativa custa. */
const MAX_TENTATIVAS_POR_PECA = 3;

export interface ArtesFeitas {
  produzidas: number;
  falhas: Array<{ postId: string; erro: string }>;
  /** Peças que desistiram — precisam de gente ou de material do cliente. */
  desistiram: string[];
}

/**
 * Produz a arte que falta nos posts já agendados.
 *
 * Só toca em post SEM mídia. Post com foto do cliente não é sobrescrito: a foto
 * real da padaria dele vale mais que qualquer imagem gerada, e trocá-la seria a
 * agência decidindo que sabe melhor.
 */
export async function produzirArtesPendentes(): Promise<ArtesFeitas> {
  const saida: ArtesFeitas = { produzidas: 0, falhas: [], desistiram: [] };

  const pendentes = await prisma.socialPost.findMany({
    where: { mediaUrl: null, status: { in: ["draft", "scheduled", "approved"] } },
    // `mediaUrl: null` cobre o carrossel também: ele só recebe a capa quando
    // TODAS as telas ficam prontas, então um carrossel pela metade continua
    // aparecendo como pendente na rodada seguinte.
    orderBy: { scheduledFor: "asc" },
    take: MAX_ARTES_POR_RODADA,
  }).catch(() => []);
  if (pendentes.length === 0) return saida;

  for (const post of pendentes) {
    const tentativas = contarTentativas(post.lastError);

    // ── REEL: o vídeo do CLIENTE, editado ────────────────────────────────────
    // Gerar imagem estática e publicá-la como reel entregaria algo que ele não
    // comprou. O que a casa faz é EDITAR o material bruto que ele mandou — que
    // até 02/08/2026 ficava parado no armazenamento, sem ninguém tocar.
    if (post.format === "reel" || post.format === "video") {
      if (tentativas >= MAX_TENTATIVAS_POR_PECA) { saida.desistiram.push(post.id); continue; }
      const r = await montarReel(post);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      if (r.semMaterial) {
        // Não é falha da máquina: falta material do cliente. Gastar tentativa
        // aqui esgotaria o teto esperando algo que só ele pode resolver.
        saida.desistiram.push(post.id);
        await marcarErro(post.id, `aguardando vídeo do cliente — ${r.erro}`, null);
      } else {
        await marcarErro(post.id, r.erro, tentativas + 1);
      }
      continue;
    }

    if (tentativas >= MAX_TENTATIVAS_POR_PECA) {
      saida.desistiram.push(post.id);
      continue;
    }

    const marca = await lerMarca(post.clientId);

    // ── CARROSSEL: uma arte POR TELA ─────────────────────────────────────────
    // Gerar uma imagem só e repetir seria entregar cinco vezes a mesma coisa.
    // Cada tela é uma ideia, e a arte tem que acompanhar a ideia dela.
    if (post.format === "carousel" || post.format === "carrossel") {
      const r = await montarCarrossel(post, marca);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      await marcarErro(post.id, r.erro, tentativas + 1);
      continue;
    }

    // Story é VERTICAL. Gerar quadrado e publicar como story corta a peça no
    // meio — e o cliente vê o próprio conteúdo mutilado no perfil dele.
    const proporcao = post.format === "story" ? "portrait" : "square";

    const r = await generateDesign({
      prompt: montarPrompt({
        legenda: post.caption,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
        formato: post.format,
      }),
      size: proporcao,
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));

    if (!r.ok || !r.url) {
      const erro = r.error ?? "o gerador de imagem não devolveu nada";
      saida.falhas.push({ postId: post.id, erro });
      await marcarErro(post.id, erro, tentativas + 1);
      continue;
    }

    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) {
      saida.falhas.push({ postId: post.id, erro: "não consegui baixar a imagem gerada" });
      continue;
    }

    // Guardada no MESMO lugar que o material do cliente: um só armazenamento,
    // uma só cota, um só link assinado que a Meta consegue buscar.
    const guardado = await guardarArquivo({
      bytes,
      fileName: `arte-${post.id}.png`,
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!guardado.ok) {
      saida.falhas.push({ postId: post.id, erro: guardado.motivo });
      continue;
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: null },
    });
    saida.produzidas++;
  }

  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

/** Quantas vezes esta peça já falhou. O contador mora no próprio `lastError`
 *  para não inventar mais uma coluna que um dia diverge do que aconteceu. */
function contarTentativas(lastError: string | null): number {
  const m = lastError?.match(/^\[arte (\d+)\//);
  return m ? Number(m[1]) : 0;
}

async function lerMarca(clientId: string | null): Promise<{
  nome: string; segmento: string; cores: string[]; tom: string;
}> {
  const vazio = { nome: "", segmento: "", cores: [] as string[], tom: "" };
  if (!clientId) return vazio;
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, industry: true, brandBrain: true },
  }).catch(() => null);
  if (!c) return vazio;
  const b = c.brandBrain;
  return {
    nome: c.name ?? "",
    segmento: c.industry ?? "",
    cores: [b?.primaryColor, b?.secondaryColor].filter((v): v is string => !!v),
    tom: b?.tone ?? "",
  };
}

/**
 * O prompt da arte.
 *
 * A legenda entra como ASSUNTO — o que a cena mostra — nunca como texto a ser
 * desenhado. E a proibição de tipografia é repetida de propósito: modelos de
 * imagem inserem letra por conta própria mesmo sem pedir.
 */
export function montarPrompt(input: {
  legenda: string;
  pilar: string | null;
  negocio: string;
  segmento: string;
  cores: string[];
  tom: string;
  formato?: string;
}): string {
  const vertical = input.formato === "story";
  const partes = [
    `Fotografia publicitária profissional para redes sociais, formato ${vertical ? "vertical 9:16 (story de celular)" : "quadrado"}, alta qualidade.`,
    input.segmento ? `Negócio: ${input.segmento}${input.negocio ? ` (${input.negocio})` : ""}.` : "",
    input.pilar ? `Tema da peça: ${input.pilar}.` : "",
    `Cena a retratar: ${input.legenda.slice(0, 500)}`,
    input.cores.length > 0 ? `Paleta da marca, para a ambientação e os objetos: ${input.cores.join(", ")}.` : "",
    input.tom ? `Clima: ${input.tom}.` : "",
    vertical
      // Story é lido de celular na mão, em segundos, e o topo e a base ficam
      // sob os elementos da interface do Instagram.
      ? "Assunto centralizado no terço do meio, com margem generosa em cima e embaixo. Iluminação natural, composição limpa."
      : "Iluminação natural, composição limpa, espaço negativo para respiro.",
    // Repetido de propósito — ver o cabeçalho do arquivo.
    "IMPORTANTE: a imagem NÃO pode conter nenhum texto, letra, número, palavra, logotipo, marca d'água, placa ou etiqueta escrita. Apenas a cena visual, sem tipografia de nenhum tipo.",
  ];
  return partes.filter(Boolean).join(" ");
}

async function baixarImagem(url: string): Promise<Buffer | null> {
  // O gpt-image-1 devolve base64 embutido; o dall-e-3 devolve URL hospedada.
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1];
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Monta o reel a partir do vídeo que o CLIENTE mandou.
 *
 * `semMaterial: true` distingue as duas naturezas de falha, e a distinção
 * importa: sem vídeo, nenhuma tentativa a mais resolve — quem resolve é ele.
 * Contar isso como tentativa esgotaria o teto esperando algo que a máquina não
 * pode produzir.
 */
async function montarReel(post: {
  id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null;
}): Promise<{ ok: boolean; erro: string; semMaterial?: boolean }> {
  // O material bruto do cliente: vídeo que ELE enviou e que ainda não virou peça.
  const bruto = await prisma.mediaAsset.findFirst({
    where: {
      kind: "inbound",
      mimeType: { startsWith: "video/" },
      OR: [
        ...(post.clientId ? [{ clientId: post.clientId }] : []),
        ...(post.clientRequestId ? [{ clientRequestId: post.clientRequestId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (!bruto) {
    return { ok: false, semMaterial: true, erro: "o cliente ainda não enviou nenhum vídeo para editarmos" };
  }

  const bytes = await lerArquivo(bruto.storagePath);
  if (!bytes) return { ok: false, erro: "o vídeo do cliente não está mais no armazenamento" };

  const { editarParaReel } = await import("@/lib/agency/media/video");
  const editado = await editarParaReel(bytes);
  if (!editado.ok || !editado.bytes) {
    return { ok: false, erro: editado.erro ?? "não consegui editar o vídeo" };
  }

  const guardado = await guardarArquivo({
    bytes: editado.bytes,
    fileName: `reel-${post.id}.mp4`,
    mimeType: "video/mp4",
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: null },
  });
  return { ok: true, erro: "" };
}

/** Grava a falha de forma legível. `tentativa` nulo = não gasta o teto — a
 *  causa está fora do alcance da máquina. */
async function marcarErro(postId: string, erro: string, tentativa: number | null): Promise<void> {
  const texto = tentativa === null
    ? erro
    : `[arte ${tentativa}/${MAX_TENTATIVAS_POR_PECA}] ${erro}`;
  await prisma.socialPost.update({
    where: { id: postId },
    data: { lastError: texto.slice(0, 500) },
  }).catch(() => { /* best-effort */ });
}

/**
 * Monta as artes de um carrossel — uma por tela.
 *
 * Tudo ou nada: se uma tela falhar, NADA é gravado. Um carrossel com buracos
 * publica uma sequência que perde o sentido no meio, e é pior do que não
 * publicar. Por isso as artes só são amarradas ao post quando todas existem.
 */
async function montarCarrossel(
  post: { id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null; caption: string; pillar: string | null; scenesJson?: string },
  marca: { nome: string; segmento: string; cores: string[]; tom: string },
): Promise<{ ok: boolean; erro: string }> {
  let cenas: string[] = [];
  try {
    const v = JSON.parse(post.scenesJson ?? "[]");
    if (Array.isArray(v)) cenas = v.filter((x): x is string => typeof x === "string");
  } catch { /* corrompido = sem cenas */ }

  if (cenas.length < 2) return { ok: false, erro: "o carrossel não tem telas descritas para desenhar" };

  const urls: string[] = [];
  for (const [i, cena] of cenas.entries()) {
    const r = await generateDesign({
      prompt: montarPrompt({
        // A CENA é o assunto, não a legenda: a legenda é a mesma para o
        // carrossel inteiro, e usá-la geraria N variações da mesma imagem.
        legenda: cena,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
      }),
      size: "square",
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch(() => ({ ok: false as const, url: undefined }));

    if (!r.ok || !r.url) return { ok: false, erro: `não consegui gerar a tela ${i + 1} de ${cenas.length}` };

    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) return { ok: false, erro: `não consegui baixar a tela ${i + 1}` };

    const g = await guardarArquivo({
      bytes,
      fileName: `carrossel-${post.id}-${i + 1}.png`,
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!g.ok) return { ok: false, erro: g.motivo };
    urls.push(`/api/media/${g.arquivo.id}`);
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      mediaUrlsJson: JSON.stringify(urls),
      // A capa também vai em `mediaUrl`: é o que o portal mostra como miniatura.
      mediaUrl: urls[0],
      lastError: null,
    },
  });
  return { ok: true, erro: "" };
}
