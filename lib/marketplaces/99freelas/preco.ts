// ─── PRICING ENGINE DO 99FREELAS ────────────────────────────────────────────
//
// ── A CORREÇÃO DE FATO QUE ESTE ARQUIVO CARREGA (07/08/2026) ────────────────
//
// A casa vinha dizendo: "embuta a taxa de 10–20%, senão a margem é corroída em
// toda proposta". DUAS fontes independentes da própria plataforma dizem que o
// mecanismo é OUTRO:
//
//   • Termos de Uso: "Nós ADICIONAMOS uma taxa de 10% a 20% (R$ 5,00 no mínimo)
//     NA SUA OFERTA enviada ao Cliente (a taxa é sobre o valor final)".
//   • Central de Ajuda, "Como enviar propostas?": "Sua oferta ... é o valor que
//     SERÁ RECEBIDO PELO FREELANCER após a conclusão do projeto" / "Oferta
//     final: a oferta final INCLUI uma taxa de intermediação".
//
// Ou seja: o número digitado é o LÍQUIDO da agência. A taxa é acrescentada por
// cima e quem a paga é o cliente. Embutir a taxa no que se digita NÃO protege
// margem — ela já está protegida — e faz a oferta final chegar ao cliente 11% a
// 25% mais cara, derrubando a chance de ganhar sem que ninguém veja o motivo.
//
// **O que protege a margem é o PISO**, e é isso que este arquivo trava:
//   valor = max(piso da tabela da casa, piso da categoria da plataforma).
//
// A taxa continua sendo calculada — mas para RELATAR: é ela que diz quanto o
// cliente vai ver na tela, e a diferença muda a leitura de competitividade.
//
// ── E SE A FONTE ESTIVER ERRADA? ────────────────────────────────────────────
// O regime está em `policy.json` como DADO (`taxa_incide_sobre`). Se a primeira
// proposta real mostrar o contrário, muda-se a linha do JSON e este arquivo
// passa a fazer o gross-up sem uma linha de código nova.

import { TABELA_DE_PISO, type ItemNegociavel } from "@/lib/agency/comercial/negociacao";
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";
import { politicaDe, planoDeclarado, type PlanoDaConta } from "@/lib/marketplaces/politica";

export type RegimeDeTaxa = "ACRESCIMO_AO_CLIENTE" | "DESCONTO_DO_FREELANCER";

/** Fonte: fontes/ajuda-planos-de-freelancers.md. */
export const TAXA_POR_PLANO: Record<PlanoDaConta, number> = {
  gratuito: 20,
  pro: 15,
  premium: 10,
};

/** Sem plano declarado, usa-se a MAIS CARA. Fail closed também no preço:
 *  errar para menos faz a oferta final surpreender o cliente para cima. */
export const TAXA_SEM_PLANO = 20;

export const TAXA_MINIMA_REAIS = 5;

export interface Preco {
  ok: boolean;
  /** O que se DIGITA em "Sua oferta". É o que a agência recebe. */
  ofertaADigitar: number;
  /** O piso da tabela da casa para este item. */
  pisoDaCasa: number;
  /** O piso que a plataforma impõe para a categoria. `null` = categoria não
   *  declarada — e aí o piso da plataforma NÃO é assumido como zero. */
  pisoDaCategoria: number | null;
  /** Qual dos dois venceu. */
  pisoQueVenceu: "casa" | "plataforma" | "nenhum";
  taxaPercentual: number;
  taxaEmReais: number;
  regime: RegimeDeTaxa;
  /** O número que o CLIENTE vê na tela. Relato, não trava. */
  ofertaFinalQueOClienteVe: number;
  motivo: string;
}

function pisoDaCasaPara(itemId: string): number | null {
  const balcao = SELF_SERVE_CATALOG.find((s) => s.id === itemId);
  if (balcao) return balcao.price;
  if (Object.hasOwn(TABELA_DE_PISO, itemId)) return TABELA_DE_PISO[itemId as ItemNegociavel].piso;
  return null;
}

function pisoDaCategoriaPara(politicaCru: Record<string, unknown>, categoria: string | null): number | null {
  if (!categoria) return null;
  const p = (politicaCru.precificacao ?? {}) as Record<string, unknown>;
  const tabela = (p.piso_por_categoria_reais ?? {}) as Record<string, unknown>;
  const chave = Object.keys(tabela).find((k) => k.toLowerCase() === categoria.trim().toLowerCase());
  const v = chave ? tabela[chave] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * O preço de uma proposta.
 *
 * FAIL CLOSED em duas situações, as duas devolvendo `ok: false`:
 *   • item que não existe na tabela da casa — preço que não existe não se
 *     inventa (é a mesma regra do roteiro avulso, de 06/08);
 *   • categoria declarada pelo anúncio que a plataforma não reconhece — aí o
 *     piso da plataforma é DESCONHECIDO, e desconhecido não vale zero.
 *
 * Categoria AUSENTE (o anúncio não disse) é outra coisa: não é dado corrompido,
 * é dado que não existe. O piso da casa vale sozinho e o motivo diz isso.
 */
export function precificar(p: {
  /** id do catálogo da casa (`negociacao.ts` ou balcão). */
  item: string;
  /** A categoria COMO O ANÚNCIO DECLAROU. `null` quando não declarou. */
  categoriaDaPlataforma?: string | null;
  /** Um valor acima do piso, quando a casa quiser cobrar mais. Nunca abaixo. */
  valorDesejado?: number | null;
  plataforma?: string;
}): Preco {
  const politica = politicaDe(p.plataforma ?? "99freelas");
  const limites = (politica.cru.limites_da_plataforma ?? {}) as Record<string, unknown>;
  const precificacao = (politica.cru.precificacao ?? {}) as Record<string, unknown>;

  const plano = planoDeclarado(limites.plano_declarado_da_conta);
  const taxaPercentual = plano ? TAXA_POR_PLANO[plano] : TAXA_SEM_PLANO;
  const regime: RegimeDeTaxa =
    precificacao.taxa_incide_sobre === "DESCONTO_DO_FREELANCER" ? "DESCONTO_DO_FREELANCER" : "ACRESCIMO_AO_CLIENTE";

  const pisoDaCasa = pisoDaCasaPara(p.item);
  const categoria = p.categoriaDaPlataforma ?? null;
  const pisoDaCategoria = pisoDaCategoriaPara(politica.cru, categoria);

  const vazio = (motivo: string): Preco => ({
    ok: false,
    ofertaADigitar: 0,
    pisoDaCasa: pisoDaCasa ?? 0,
    pisoDaCategoria,
    pisoQueVenceu: "nenhum",
    taxaPercentual,
    taxaEmReais: 0,
    regime,
    ofertaFinalQueOClienteVe: 0,
    motivo,
  });

  if (pisoDaCasa === null) {
    return vazio(
      `"${p.item}" não está na tabela de piso da casa. Preço que não existe não se inventa — a proposta para e alguém orça.`,
    );
  }
  if (categoria !== null && pisoDaCategoria === null) {
    return vazio(
      `O anúncio declarou a categoria "${categoria}", que não está na tabela de valor mínimo do 99Freelas. Piso da plataforma DESCONHECIDO — e desconhecido não vale zero. Confira a categoria na tela antes de enviar.`,
    );
  }

  const pisoEfetivo = Math.max(pisoDaCasa, pisoDaCategoria ?? 0);
  const pisoQueVenceu: Preco["pisoQueVenceu"] =
    pisoDaCategoria !== null && pisoDaCategoria > pisoDaCasa ? "plataforma" : "casa";

  const desejado = typeof p.valorDesejado === "number" && Number.isFinite(p.valorDesejado) ? p.valorDesejado : 0;
  const ofertaADigitar = Math.max(pisoEfetivo, Math.round(desejado));

  // A taxa incide sobre o VALOR FINAL (Termos), então é gross-up e não um
  // percentual simples sobre a oferta: final = oferta / (1 − taxa).
  const bruta = ofertaADigitar / (1 - taxaPercentual / 100);
  const taxaCalculada = Math.max(TAXA_MINIMA_REAIS, Math.round((bruta - ofertaADigitar) * 100) / 100);
  const ofertaFinal = Math.round((ofertaADigitar + taxaCalculada) * 100) / 100;

  const notaDaTaxa =
    regime === "ACRESCIMO_AO_CLIENTE"
      ? `A taxa de ${taxaPercentual}% (R$ ${taxaCalculada.toFixed(2)}) é ACRESCENTADA por cima: o cliente vê R$ ${ofertaFinal.toFixed(2)} e a agência recebe R$ ${ofertaADigitar}. NÃO embutir é o certo — embutir só encarece a oferta final.`
      : `Regime DESCONTO_DO_FREELANCER declarado na política: a taxa sai do que a agência recebe. Reveja o valor antes de enviar.`;

  return {
    ok: true,
    ofertaADigitar,
    pisoDaCasa,
    pisoDaCategoria,
    pisoQueVenceu,
    taxaPercentual,
    taxaEmReais: taxaCalculada,
    regime,
    ofertaFinalQueOClienteVe: ofertaFinal,
    motivo: [
      `Piso aplicado: R$ ${pisoEfetivo} (casa R$ ${pisoDaCasa}${pisoDaCategoria !== null ? ` × plataforma R$ ${pisoDaCategoria}` : " · categoria não declarada pelo anúncio"} — venceu o da ${pisoQueVenceu}).`,
      notaDaTaxa,
      plano ? `Taxa do plano ${plano}.` : "PLANO NÃO DECLARADO: usada a taxa mais cara (20%), fail closed.",
      "⚠️ O texto da proposta NÃO pode mencionar a taxa nem a comissão — é violação (Central de Ajuda). O Compliance Validator barra.",
    ].join(" "),
  };
}
