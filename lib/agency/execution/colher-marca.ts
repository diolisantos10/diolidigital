// colher-marca.ts — A BASE DE MARCA QUE A CASA ESCREVEU VIRA A MARCA QUE ELA USA.
//
// Irmão de `colher-identidade.ts`, e existe pelo mesmo motivo: entregável é
// texto, e texto nenhum especialista consulta. O que as outras casas leem é o
// `BrandBrain` — e se ele continuar vazio, o especialista de social lê nulo,
// escreve genérico, e no mês seguinte a casa propõe OUTRA marca, diferente da
// que ela mesma acabou de constituir.
//
// ⚠️ ALIMENTA O QUE JÁ EXISTE. O Brand Hub desta casa é o `BrandBrain` + a ficha
// (`esteira/ficha-de-marca.ts`). Criar um segundo lugar para a mesma verdade é a
// doença que esta casa já pagou várias vezes — então aqui não nasce tabela, não
// nasce coluna, e nada é duplicado.
//
// ─── O QUE ESTE ARQUIVO NÃO GRAVA, E É DE PROPÓSITO ──────────────────────────
//
//   • AS PROIBIÇÕES. Moram em `BrainArtifact` (`esteira/proibicoes.ts`) e
//     funcionam. O estado do campo é registrado; o conteúdo, não.
//   • AS COLUNAS JSON (`voicePairsJson`, `lexiconJson`, `referencesJson`,
//     `ownerAndHierarchyJson`, `formalTokensJson`). O entregável traz PROSA, e
//     enfiar prosa numa coluna que os leitores desserializam quebraria os
//     leitores em silêncio. Estado sim, conteúdo não — e a ficha continua
//     pedindo esses campos ao dono, que é quem tem de respondê-los.
//   • QUALQUER CAMPO EM LACUNA. Lacuna é lacuna: gravá-la como conteúdo é
//     exatamente a invenção que o contrato de saída recusou lá atrás.

import { prisma } from "@/lib/db/client";
import { CAMPOS_DA_MARCA, type CampoDaMarca } from "@/lib/agency/esteira/campos-da-marca";
import { CAMPO_DOS_MATERIAIS } from "@/lib/agency/execution/branding";

/** O especialista cuja saída é a constituição da marca. */
export const DONO_DA_BASE_DE_MARCA = "branding-base-de-marca";

/**
 * Campo da constituição → coluna de TEXTO do `BrandBrain`.
 *
 * Só os que são texto dos dois lados. O que não está aqui não tem coluna de
 * texto onde caber — e inventar uma seria criar a segunda verdade.
 */
const COLUNA_DE_TEXTO: Partial<Record<CampoDaMarca, string>> = {
  proposito_e_promessa: "purposeAndPromise",
  publico_e_relacao: "audienceRelation",
  voz: "tone",
  limites_de_promessa: "promiseLimits",
};

export interface MarcaColhida {
  encontrouEntrega: boolean;
  /** Colunas do `BrandBrain` preenchidas nesta passada. */
  camposPreenchidos: string[];
  /** Campos que o especialista declarou EM ABERTO. Não é erro — é a entrega. */
  lacunas: string[];
}

type ItemLido = { campo: string; estado: string; conteudo: string; falta: string };

/**
 * Lê os blocos do markdown entregue. O formato é o de `renderizar-entrega.ts`
 * — "- Campo: x", "- Estado: y", "- Conteúdo: z", "- Falta: w" — e é lido de lá
 * porque é lá que ele é escrito.
 */
export function lerItensDaBase(texto: string): ItemLido[] {
  const itens: ItemLido[] = [];
  let atual: ItemLido | null = null;
  const empurrar = () => { if (atual?.campo) itens.push(atual); };
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^[-*]\s*\*{0,2}(Campo|Estado|Conteúdo|Conteudo|Falta)\*{0,2}:?\s*(.+)$/i);
    if (!m) continue;
    const rotulo = m[1].toLowerCase();
    const valor = m[2].replace(/\*+/g, "").trim();
    if (rotulo === "campo") {
      empurrar();
      atual = { campo: valor.toLowerCase(), estado: "", conteudo: "", falta: "" };
      continue;
    }
    if (!atual) continue;
    if (rotulo === "estado") atual.estado = valor.toLowerCase();
    else if (rotulo === "falta") atual.falta = valor;
    else atual.conteudo = valor;
  }
  empurrar();
  return itens;
}

/** Funde os estados no `fieldStatesJson` SEM REBAIXAR o que já está definido.
 *  Quem respondeu a ficha vale mais que quem escreveu o documento. */
export function fundirEstados(
  atualJson: string | null | undefined,
  itens: ItemLido[],
  em: Date,
): string {
  let base: Record<string, unknown> = {};
  try {
    const v = JSON.parse((atualJson ?? "{}").trim() || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) base = v as Record<string, unknown>;
  } catch { base = {}; }

  for (const it of itens) {
    const anterior = base[it.campo] as { estado?: string } | undefined;
    if (anterior?.estado === "definido" && it.estado !== "definido") continue;
    base[it.campo] = {
      estado: it.estado || "lacuna",
      origem: "base_de_marca_da_casa",
      em: em.toISOString(),
      ...(it.falta ? { falta: it.falta.slice(0, 400) } : {}),
    };
  }
  return JSON.stringify(base);
}

/**
 * Lê a base de marca entregue e grava no `BrandBrain` o que dela é decisão.
 *
 * Conservador por construção: só preenche coluna VAZIA. O que o dono respondeu,
 * ou o que a agência ajustou à mão, vale mais que o que o modelo propôs.
 * Nunca lança — colher a marca não pode derrubar a produção.
 */
export async function colherBaseDeMarca(
  projectId: string,
  clientId: string | null,
  agora: Date = new Date(),
): Promise<MarcaColhida> {
  const saida: MarcaColhida = { encontrouEntrega: false, camposPreenchidos: [], lacunas: [] };
  if (!clientId) return saida;

  const entrega = await prisma.deliverable.findFirst({
    where: { projectId, ownerAgentId: DONO_DA_BASE_DE_MARCA },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  }).catch(() => null);
  if (!entrega?.content) return saida;
  saida.encontrouEntrega = true;

  const itens = lerItensDaBase(entrega.content).filter(
    (i) => (CAMPOS_DA_MARCA as readonly string[]).includes(i.campo) || i.campo === CAMPO_DOS_MATERIAIS,
  );
  if (!itens.length) return saida;

  saida.lacunas = itens.filter((i) => i.estado !== "definido").map((i) => i.campo);

  const existente = await prisma.brandBrain.findUnique({ where: { clientId } }).catch(() => null);
  const paraGravar: Record<string, string> = {};
  for (const it of itens) {
    if (it.estado !== "definido" || !it.conteudo) continue;
    const coluna = COLUNA_DE_TEXTO[it.campo as CampoDaMarca];
    if (!coluna) continue;
    if (existente && (existente as unknown as Record<string, unknown>)[coluna]) continue;
    paraGravar[coluna] = it.conteudo.slice(0, 600);
  }

  const fieldStatesJson = fundirEstados(existente?.fieldStatesJson, itens, agora);

  try {
    if (!existente) {
      await prisma.brandBrain.create({ data: { clientId, ...paraGravar, fieldStatesJson } });
    } else {
      await prisma.brandBrain.update({ where: { clientId }, data: { ...paraGravar, fieldStatesJson } });
    }
  } catch {
    return saida;
  }
  saida.camposPreenchidos = Object.keys(paraGravar);
  return saida;
}
