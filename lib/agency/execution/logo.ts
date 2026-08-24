// logo.ts — O LOGO EM ARQUIVO. O que separa "conceito de marca" de identidade
// visual entregue.
//
// O buraco do raio-X de 02/08/2026: o pet shop novo contratava identidade
// visual — não tinha logo, nem cor, nem nada — e recebia um TEXTO descrevendo a
// marca. "Paleta: terracota e areia. Tipografia: Playfair Display." Bonito, e
// impossível de colocar na fachada. Meio serviço cobrado inteiro.
//
// ── A DECISÃO TÉCNICA QUE SUSTENTA ESTE ARQUIVO ─────────────────────────────
//
// O logo é montado em DUAS PEÇAS, por origens diferentes, e isso não é
// preciosismo:
//
//   • O SÍMBOLO vem do modelo de imagem. Um símbolo é forma — é exatamente o
//     que modelo de imagem faz bem.
//   • O NOME DA MARCA é composto por NÓS, em SVG, com tipografia real.
//
// Porque modelo de imagem ERRA LETRA. Sempre. Um logo com o nome do cliente
// escrito errado é pior do que nenhum logo: é a agência entregando o erro mais
// visível que existe, no ativo mais permanente que o cliente tem. Compondo o
// wordmark em SVG, o nome sai certo por construção — não por sorte do modelo.
//
// E o SVG é o que faz disso um entregável de verdade: vetor escala para
// fachada, camiseta e cardápio. PNG de logo é rascunho.

import { prisma } from "@/lib/db/client";
import { generateDesign } from "@/lib/ai/design-engine";
import { guardarArquivo } from "@/lib/agency/media/armazenamento";
import { logoDoCliente } from "@/lib/agency/esteira/material-do-drive";
import { ehACasa } from "@/lib/agency/design/logo-da-casa";
import { LOGOTIPO_DA_CASA, SIMBOLO_DA_CASA } from "@/lib/agency/design/marca-da-casa";

/** As fontes que o wordmark pode usar. Lista fechada e com fallback genérico
 *  em cada uma: o SVG é aberto na máquina do CLIENTE, que não tem as nossas
 *  fontes. Sem o fallback, o logo dele abriria em Times New Roman. */
export const FAMILIAS: Record<string, string> = {
  serifada: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
  geometrica: "'Poppins', 'Futura', 'Century Gothic', sans-serif",
  neutra: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  manuscrita: "'Pacifico', 'Brush Script MT', cursive",
  condensada: "'Oswald', 'Impact', 'Arial Narrow', sans-serif",
};

export interface KitDeMarca {
  /** Ids no MediaAsset, na ordem em que o cliente deve receber. */
  arquivos: Array<{ id: string; nome: string; para: string }>;
  erro?: string;
}

/**
 * Produz o kit de marca do cliente e guarda tudo no armazenamento da casa.
 *
 * Idempotente por cliente: quem já tem logo não ganha outro. Um cliente que
 * recebe dois logos diferentes em dois meses não tem marca — tem confusão.
 */
export async function produzirKitDeMarca(
  projectId: string,
  clientId: string | null,
  workspaceId: string,
): Promise<KitDeMarca> {
  const saida: KitDeMarca = { arquivos: [] };
  if (!clientId) return { ...saida, erro: "projeto sem cliente" };

  // ── O LOGO REAL DO CLIENTE VEM ANTES DE QUALQUER DESENHO (07/08/2026) ─────
  // Se ele conectou o Drive e declarou "isto é o meu logo", a casa NÃO inventa
  // outro. Gerar um símbolo ao lado do logo oficial é entregar duas marcas ao
  // mesmo cliente — e foi por não ter de onde buscar o arquivo real que o logo
  // da Foocci é, até hoje, o nome escrito em fonte.
  const oficial = await logoDoCliente(clientId).catch(() => null);
  if (oficial) {
    saida.arquivos.push({
      id: oficial.mediaAssetId,
      nome: oficial.nome,
      para: "o logo oficial que o próprio cliente entregou pelo Google Drive — use este, não recrie",
    });
    return saida;
  }

  const jaTem = await prisma.mediaAsset.findFirst({
    where: { clientId, kind: "deliverable", fileName: { startsWith: "logo-" } },
    select: { id: true },
  }).catch(() => null);
  if (jaTem) return saida; // já existe — nada a fazer, e não é erro

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, industry: true, brandBrain: true, workspaceId: true },
  }).catch(() => null);
  if (!cliente?.name) return { ...saida, erro: "cliente sem nome — não há o que escrever no logo" };

  // ── A CASA JÁ TEM MARCA — NÃO SE DESENHA OUTRA (08/08/2026) ───────────────
  // Pedir um kit de marca para a própria Dioli e receber um símbolo inventado
  // por modelo de imagem seria a agência criando uma SEGUNDA identidade para si
  // mesma. O kit dela existe, é vetor, e está versionado: entrega-se o que
  // existe. Mesmo princípio do bloco acima (logo oficial do cliente vence).
  if (ehACasa(cliente.name)) {
    for (const [tom, para] of [
      ["navy", "uso sobre fundo claro — papel, site, apresentação"],
      ["white", "uso sobre fundo escuro — story, fachada, camiseta"],
    ] as const) {
      for (const [peca, svg] of [
        ["logotipo", LOGOTIPO_DA_CASA[tom]],
        ["simbolo", SIMBOLO_DA_CASA[tom]],
      ] as const) {
        const g = await guardarArquivo({
          bytes: Buffer.from(svg, "utf8"),
          fileName: `logo-dioli-${peca}-${tom}.svg`,
          mimeType: "image/svg+xml",
          workspaceId, clientId, projectId, kind: "deliverable", uploadedBy: "design",
        });
        if (g.ok) saida.arquivos.push({ id: g.arquivo.id, nome: g.arquivo.fileName, para });
      }
    }
    return saida;
  }

  const b = cliente.brandBrain;
  const primaria = corValida(b?.primaryColor) ?? "#1A1A1A";
  const secundaria = corValida(b?.secondaryColor) ?? "#8A8A8A";
  const familia = escolherFamilia(b?.typography ?? "", cliente.industry ?? "");

  // ── 1. O SÍMBOLO ──────────────────────────────────────────────────────────
  const simbolo = await generateDesign({
    prompt: promptDoSimbolo({
      negocio: cliente.name,
      segmento: cliente.industry ?? "",
      cor: primaria,
      posicionamento: b?.positioning ?? "",
    }),
    size: "square",
    quality: "high",
    workspaceId,
    conta: { departmentId: "design", clientId, projectId, agentId: "design-engine" },
  }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));

  if (simbolo.ok && simbolo.url) {
    const bytes = await baixar(simbolo.url).catch(() => null);
    if (bytes) {
      const g = await guardarArquivo({
        bytes, fileName: `logo-simbolo-${slug(cliente.name)}.png`, mimeType: "image/png",
        workspaceId, clientId, projectId, kind: "deliverable", uploadedBy: "design",
      });
      if (g.ok) saida.arquivos.push({ id: g.arquivo.id, nome: g.arquivo.fileName, para: "o símbolo isolado — perfil, favicon, selo" });
    }
  } else {
    saida.erro = simbolo.error ?? "não consegui gerar o símbolo";
  }

  // ── 2. O WORDMARK, EM VETOR ───────────────────────────────────────────────
  // Sai mesmo que o símbolo falhe: um wordmark bem composto já é um logo
  // utilizável, e é melhor entregar isso do que nada.
  for (const [variacao, fundo, tinta] of [
    ["claro", "#FFFFFF", primaria],
    ["escuro", primaria, "#FFFFFF"],
  ] as const) {
    const svg = montarWordmark({
      nome: cliente.name,
      tagline: b?.tagline ?? null,
      familia: FAMILIAS[familia]!,
      fundo, tinta, apoio: variacao === "claro" ? secundaria : "#FFFFFFAA",
    });
    const g = await guardarArquivo({
      bytes: Buffer.from(svg, "utf8"),
      fileName: `logo-${variacao}-${slug(cliente.name)}.svg`,
      mimeType: "image/svg+xml",
      workspaceId, clientId, projectId, kind: "deliverable", uploadedBy: "design",
    });
    if (g.ok) {
      saida.arquivos.push({
        id: g.arquivo.id, nome: g.arquivo.fileName,
        para: variacao === "claro" ? "uso sobre fundo claro — papel, cardápio, site" : "uso sobre fundo escuro — fachada, camiseta, story",
      });
    }
  }

  return saida;
}

/**
 * O manual de marca: o documento que diz como usar o que foi entregue.
 *
 * Só descreve o que EXISTE — cores, fontes e arquivos reais do kit. Manual que
 * inventa regra para uma peça que não foi entregue é o tipo de documento que
 * faz o cliente perceber que a agência não olhou o próprio trabalho.
 */
export function montarManual(input: {
  negocio: string;
  primaria: string;
  secundaria: string;
  tipografia: string;
  tagline: string | null;
  arquivos: Array<{ nome: string; para: string }>;
}): string {
  const linhas = [
    `Este é o manual da marca ${input.negocio}. Ele diz o que foi entregue e como usar cada peça.`,
    "",
    "**1. As cores**",
    `- Principal: ${input.primaria}`,
    `- Apoio: ${input.secundaria}`,
    "- Obs: use a principal em fundo, título e detalhe. A de apoio nunca deve competir com ela.",
    "",
    "**2. A tipografia**",
    `- Fonte: ${input.tipografia}`,
    "- Obs: o logo já vem com a fonte desenhada em vetor. Para textos do dia a dia, use a mesma família.",
    "",
    "**3. Os arquivos**",
    ...input.arquivos.map((a) => `- ${a.nome}: ${a.para}`),
    "",
    "**4. O que não fazer**",
    "- Obs: não estique o logo em uma direção só, não troque as cores, não escreva o nome com outra fonte e não coloque o logo claro em fundo claro.",
  ];
  if (input.tagline) {
    linhas.splice(2, 0, `**0. A assinatura**`, `- Frase: ${input.tagline}`, "- Obs: use junto do logo quando houver espaço; sozinha, nunca.", "");
  }
  return linhas.join("\n");
}

// ─── Internos ───────────────────────────────────────────────────────────────

/**
 * O prompt do símbolo.
 *
 * A proibição de texto é repetida três vezes e não é exagero: modelo de imagem
 * insere letra por conta própria mesmo quando ninguém pede, e uma letra no
 * símbolo destrói a peça — o nome já vem do wordmark.
 */
export function promptDoSimbolo(input: {
  negocio: string; segmento: string; cor: string; posicionamento: string;
}): string {
  return [
    "Símbolo de marca (ícone de logotipo), design gráfico profissional, vetorial e minimalista.",
    input.segmento ? `Para um negócio de: ${input.segmento}.` : "",
    input.posicionamento ? `A marca se posiciona como: ${input.posicionamento}.` : "",
    `Cor predominante: ${input.cor}, sobre fundo branco liso.`,
    "Uma forma só, cheia, geométrica, legível a 16 pixels e reconhecível em uma cor só.",
    "Estilo: traço limpo, sem gradiente, sem sombra, sem 3D, sem brilho, sem moldura.",
    "CRÍTICO: o símbolo NÃO pode conter NENHUMA letra, NENHUM número, NENHUMA palavra e NENHUM texto de qualquer tipo.",
    "Não escreva o nome do negócio. Não inclua tipografia. Apenas a forma abstrata ou o ícone.",
    "Repito: zero texto na imagem.",
  ].filter(Boolean).join(" ");
}

/**
 * Compõe o wordmark em SVG.
 *
 * O nome é escrito por nós, com tipografia real — é o ponto do arquivo inteiro.
 * O `&` e o `<` do nome do cliente são escapados: "Bar & Cia" quebraria o XML
 * e entregaria um arquivo corrompido com o nome dele dentro.
 */
export function montarWordmark(input: {
  nome: string; tagline: string | null; familia: string;
  fundo: string; tinta: string; apoio: string;
}): string {
  const nome = escaparXml(input.nome.trim().slice(0, 40));
  const tagline = input.tagline ? escaparXml(input.tagline.trim().slice(0, 60)) : null;

  // Largura proporcional ao nome: um logo com muito ar de um lado parece
  // desalinhado em qualquer aplicação.
  const largura = Math.max(420, nome.length * 34 + 120);
  const altura = tagline ? 200 : 160;
  const meio = largura / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" role="img" aria-label="${nome}">
  <rect width="${largura}" height="${altura}" fill="${input.fundo}"/>
  <text x="${meio}" y="${tagline ? 100 : 96}" text-anchor="middle"
        font-family="${input.familia}" font-size="58" font-weight="600"
        letter-spacing="1.5" fill="${input.tinta}">${nome}</text>
${tagline ? `  <text x="${meio}" y="146" text-anchor="middle"
        font-family="${input.familia}" font-size="20" font-weight="400"
        letter-spacing="4" fill="${input.apoio}">${tagline.toUpperCase()}</text>\n` : ""}</svg>`;
}

function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Aceita só hex de verdade. "azul petróleo" num atributo `fill` de SVG não
 *  pinta nada — o logo sairia preto e ninguém saberia por quê. */
export function corValida(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/#[0-9a-fA-F]{6}\b/);
  return m ? m[0] : null;
}

/** Traduz a tipografia que o especialista descreveu numa das famílias que
 *  sabemos compor. Sem palpite: o que não reconhece vira a escolha do segmento. */
export function escolherFamilia(tipografia: string, segmento: string): keyof typeof FAMILIAS {
  const t = tipografia.toLowerCase();
  if (/playfair|didot|garamond|georgia|serif|cl[áa]ssic/.test(t)) return "serifada";
  if (/poppins|futura|geom[ée]tric|circular/.test(t)) return "geometrica";
  if (/script|manuscrit|caligr|pacifico|cursiv/.test(t)) return "manuscrita";
  if (/oswald|condens|impact/.test(t)) return "condensada";
  if (/inter|helvetica|roboto|sans|neutr/.test(t)) return "neutra";

  const s = segmento.toLowerCase();
  if (/restaurante|padaria|caf[ée]|confeitaria|bistr[ôo]|gastr/.test(s)) return "serifada";
  if (/sal[ãa]o|beleza|est[ée]tica|spa|moda/.test(s)) return "manuscrita";
  if (/academia|esporte|fitness|constru|oficina/.test(s)) return "condensada";
  return "geometrica";
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "marca";
}

async function baixar(url: string): Promise<Buffer | null> {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1];
    return b64 ? Buffer.from(b64, "base64") : null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
