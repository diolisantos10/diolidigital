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
import { guardarArquivo } from "@/lib/agency/media/armazenamento";

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
    orderBy: { scheduledFor: "asc" },
    take: MAX_ARTES_POR_RODADA,
  }).catch(() => []);
  if (pendentes.length === 0) return saida;

  for (const post of pendentes) {
    // Reels e stories são vídeo. Gerar uma imagem estática e publicá-la como
    // reel entregaria ao cliente algo que ele não comprou.
    if (post.format === "reel" || post.format === "video") {
      saida.desistiram.push(post.id);
      continue;
    }

    const tentativas = contarTentativas(post.lastError);
    if (tentativas >= MAX_TENTATIVAS_POR_PECA) {
      saida.desistiram.push(post.id);
      continue;
    }

    const marca = await lerMarca(post.clientId);
    const r = await generateDesign({
      prompt: montarPrompt({
        legenda: post.caption,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
      }),
      size: "square",
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));

    if (!r.ok || !r.url) {
      const erro = r.error ?? "o gerador de imagem não devolveu nada";
      saida.falhas.push({ postId: post.id, erro });
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { lastError: `[arte ${tentativas + 1}/${MAX_TENTATIVAS_POR_PECA}] ${erro}`.slice(0, 500) },
      }).catch(() => { /* best-effort */ });
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
}): string {
  const partes = [
    "Fotografia publicitária profissional para redes sociais, formato quadrado, alta qualidade.",
    input.segmento ? `Negócio: ${input.segmento}${input.negocio ? ` (${input.negocio})` : ""}.` : "",
    input.pilar ? `Tema da peça: ${input.pilar}.` : "",
    `Cena a retratar: ${input.legenda.slice(0, 500)}`,
    input.cores.length > 0 ? `Paleta da marca, para a ambientação e os objetos: ${input.cores.join(", ")}.` : "",
    input.tom ? `Clima: ${input.tom}.` : "",
    "Iluminação natural, composição limpa, espaço negativo para respiro.",
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
