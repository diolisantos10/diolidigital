// ficha-unica.ts — A FICHA DE MARCA ÚNICA. Uma fonte da verdade.
//
// ── O DEFEITO QUE ISTO FECHA (CEO, 04/10/2026) ───────────────────────────────
// A aba Branding tinha DOIS blocos que não conversavam: a Ficha de Marca (9
// campos de régua) e o Brand Hub (13 campos). O Brand Hub mostrava 13 caixas e
// GRAVAVA 6 — resumo, estilo visual, referências, produtos, o que evitar,
// canais e notas sumiam ao salvar. E "cor/tipografia" e "tom" existiam nos dois,
// cada um lido por uma parte da produção.
//
// A regra do CEO para peça que vive dando problema: não remendar, refazer mais
// simples. Então: UM registro (`BrandBrain`), UMA tela, e nenhum campo mostrado
// é descartado ao salvar.
//
// ── ONDE CADA CAMPO MORA ─────────────────────────────────────────────────────
// Os que a produção já lia continuam nas MESMAS colunas (nada a migrar, nada se
// perde): tagline, positioning, targetAudience, tone, typography,
// primaryColor/secondaryColor (derivadas da paleta) e values (regras). O resto
// mora em `fichaExtraJson`. Os 9 campos de régua (propósito, voz, léxico…)
// continuam no escritor deles (`escrita-da-ficha.ts`) — a ficha única os
// mostra e grava pelo mesmo caminho, não por um segundo.
//
// ── TUDO TEXTO LIVRE, TUDO OPCIONAL ──────────────────────────────────────────
// O sistema se adapta ao usuário: nenhum campo bloqueia salvar. Paleta e
// produtos são TAMBÉM interpretados (para a arte e a legenda usarem), mas o
// texto que a pessoa escreveu é guardado como ela escreveu.

import { prisma } from "@/lib/db/client";

import { CAMPOS_DA_FICHA_UNICA, type FichaUnica } from "./ficha-unica-campos";

export { CAMPOS_DA_FICHA_UNICA, DO_BRAND_HUB, fichaDoBrandHub } from "./ficha-unica-campos";
export type { ChaveDaFichaUnica, FichaUnica } from "./ficha-unica-campos";

export interface CorDaPaleta { nome: string; hex: string | null; uso: string }
export interface ProdutoDaMarca { nome: string; descricao: string; preco: string | null }

const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i;

/** "Vermelho #C8102E fundo; Preto #111 texto" → [{nome, hex, uso}]. Aceita
 *  vírgula, ponto e vírgula, quebra de linha e "·" como separador. Item sem
 *  código entra com `hex: null` — nada é descartado. */
export function lerPaleta(texto: string | null | undefined): CorDaPaleta[] {
  return (texto ?? "")
    .split(/[\n;,·]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = HEX.exec(p);
      if (!m) return { nome: p, hex: null, uso: "" };
      const nome = p.slice(0, m.index).replace(/[:\-–—]+\s*$/, "").trim();
      const uso = p.slice(m.index + m[0].length).replace(/^[\s:\-–—()]+|[)\s]+$/g, "").trim();
      return { nome, hex: m[0].toUpperCase(), uso };
    });
}

/** "Temaki — salmão fresco — R$ 29,90" → {nome, descricao, preco}. Um por linha. */
export function lerProdutos(texto: string | null | undefined): ProdutoDaMarca[] {
  return (texto ?? "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const partes = l.split(/\s+[—–-]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
      const temPreco = partes.length > 1 && /(R\$|\d+[.,]\d{2}\b|\$)/.test(partes[partes.length - 1]!);
      const preco = temPreco ? partes.pop()! : null;
      const [nome = l, ...resto] = partes;
      return { nome, descricao: resto.join(" — "), preco };
    });
}

function objeto(json: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(json || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function regrasEmTexto(values: string | null | undefined): string {
  try {
    const v = JSON.parse(values || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n") : "";
  } catch {
    return "";
  }
}

/** Lê a ficha única de um cliente — todos os campos, como a pessoa escreveu. */
export async function lerFichaUnica(clientId: string): Promise<FichaUnica> {
  const b = await prisma.brandBrain.findUnique({ where: { clientId } });
  if (!b) return {};
  const extra = objeto(b.fichaExtraJson);
  const ficha: FichaUnica = {};
  for (const c of CAMPOS_DA_FICHA_UNICA) {
    let v: unknown;
    if (c.coluna === "extra") v = extra[c.chave];
    else if (c.coluna === "values") v = regrasEmTexto(b.values);
    else v = (b as Record<string, unknown>)[c.coluna];
    if (c.chave === "paleta" && !v) {
      // Cliente de antes da ficha única: as cores viviam só nas duas colunas.
      v = [b.primaryColor, b.secondaryColor].filter(Boolean).join(" · ");
    }
    if (typeof v === "string" && v.trim()) ficha[c.chave] = v;
  }
  return ficha;
}

/**
 * Grava a ficha única. Campo AUSENTE do corpo fica como estava; campo
 * presente (mesmo vazio) é gravado — apagar também é editar. Nada mostrado na
 * tela é descartado.
 */
export async function gravarFichaUnica(clientId: string, entrada: FichaUnica): Promise<FichaUnica> {
  const atual = await prisma.brandBrain.findUnique({ where: { clientId } });
  const extra = objeto(atual?.fichaExtraJson);
  const colunas: Record<string, string | null> = {};

  for (const c of CAMPOS_DA_FICHA_UNICA) {
    if (!(c.chave in entrada)) continue;
    const valor = (entrada[c.chave] ?? "").toString();
    if (c.coluna === "extra") extra[c.chave] = valor;
    else if (c.coluna === "values") {
      colunas.values = JSON.stringify(valor.split("\n").map((l) => l.trim()).filter(Boolean));
    } else colunas[c.coluna] = valor.trim() ? valor : null;
  }

  // A paleta alimenta as duas colunas que a ARTE lê: as duas primeiras cores
  // com código. Sem código, as colunas não são tocadas.
  if ("paleta" in entrada) {
    const comCodigo = lerPaleta(entrada.paleta).filter((c) => c.hex);
    if (comCodigo[0]) colunas.primaryColor = comCodigo[0].hex;
    if (comCodigo[1]) colunas.secondaryColor = comCodigo[1].hex;
  }

  const dados = { ...colunas, fichaExtraJson: JSON.stringify(extra) };
  await prisma.brandBrain.upsert({
    where: { clientId },
    create: { clientId, ...dados },
    update: dados,
  });
  return lerFichaUnica(clientId);
}

/**
 * O que a produção LÊ da ficha única: uma linha por campo, EM ORDEM DE
 * PRIORIDADE (o que proíbe e o que define a voz primeiro; a história por
 * último). O contrato de marca tem teto de tamanho e corta por LINHA inteira,
 * de baixo para cima — nunca meia regra. Notas internas nunca saem daqui.
 */
export function linhasDaFichaUnica(f: FichaUnica): Array<{ rotulo: string; linha: string }> {
  const linhas: Array<{ rotulo: string; linha: string }> = [];
  const add = (rotulo: string, v?: string) => {
    if (v && v.trim()) linhas.push({ rotulo, linha: `${rotulo}: ${v.trim().replace(/\n+/g, " · ")}` });
  };
  add("Evitar", f.evitar);
  add("Regras da marca", f.regras);
  // "Tom" NÃO entra: tom em adjetivo ("natural e direto") não é voz decidida
  // — a voz vem do campo de régua (dizemos / não dizemos), e o contrato
  // declara a falta dela em vez de aceitar um adjetivo no lugar.
  add("Slogan", f.tagline);
  add("Proposta de valor", f.proposta);
  add("Público", f.publico);
  if (f.produtos) {
    const ps = lerProdutos(f.produtos).map((p) => [p.nome, p.descricao, p.preco].filter(Boolean).join(" — "));
    add("Produtos e serviços", ps.join(" · "));
  }
  if (f.paleta) {
    const cores = lerPaleta(f.paleta).map((c) => [c.nome, c.hex, c.uso && `(${c.uso})`].filter(Boolean).join(" "));
    add("Paleta", cores.join(" · "));
  }
  add("Tipografia", f.tipografia);
  add("Estilo de foto", f.estiloDeFoto);
  add("Regras do logo", f.regrasDoLogo);
  add("Objetivos", f.objetivos);
  add("Canais", f.canais);
  add("Concorrentes e referências", f.concorrentes);
  add("Resumo", f.resumo);
  add("Manifesto", f.manifesto);
  return linhas;
}

/** As linhas juntas, sem teto — para quem não tem limite de tamanho. */
export function textoDaFichaUnica(f: FichaUnica): string {
  return linhasDaFichaUnica(f).map((l) => l.linha).join("\n");
}
