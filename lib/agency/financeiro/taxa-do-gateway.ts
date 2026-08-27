// taxa-do-gateway.ts — A TAXA DO MERCADO PAGO, MEDIDA. Nunca chutada.
//
// ─── A ORDEM (CEO, 27/08/2026) ──────────────────────────────────────────────
//
//   *"A taxa do Mercado Pago entra no custo — o gateway foi ligado hoje. Meça;
//   se não conseguir, declare."*
//
// ─── FOI MEDIDO. NÃO DEU, E O MOTIVO É ÚTIL ─────────────────────────────────
//
// Duas tentativas, as duas falharam, e as duas apontam para a mesma coisa:
//
//   1. **Ler a taxa da API do provedor** — não dá desta cadeira. As variáveis
//      do Railway voltam **com os valores redigidos** para quem lê pelo app
//      conectado; o `MERCADOPAGO_ACCESS_TOKEN` existe e não é legível aqui. E
//      não deve ser: *tokens e segredos a casa não possui — vê só o código que
//      os usa.* Estimar 4,99% "porque é a taxa de tabela do mercado" seria
//      exatamente o número inventado que este módulo existe para não produzir.
//   2. **Ler a taxa dos pagamentos já recebidos** — não há nenhum. O gateway
//      subiu hoje, e a tabela `PagamentoConfirmado` não guardava a taxa de
//      qualquer forma: o webhook lia o pagamento inteiro do provedor e jogava
//      `fee_details` fora.
//
// ─── ENTÃO O QUE ESTE ARQUIVO FAZ ───────────────────────────────────────────
//
// Constrói o CAMINHO da medição, em vez de fabricar o número. `fee_details[]` do
// próprio pagamento é a única fonte honesta que existe — é o que o provedor
// REALMENTE reteve, não o que a tabela dele promete reter. O webhook passa a
// gravá-la, e este módulo passa a lê-la.
//
// Até o primeiro pagamento aprovado cair, a resposta é `nao_medido` — com o
// motivo por escrito. **Nulo não é zero.** Uma taxa lida como zero daria ao
// negociador entre 1 e 5 pontos de margem que não existem, e é justamente no
// piso que esses pontos decidem se a venda dá lucro ou prejuízo.
//
// ⚠️ FALHA FECHADA. Erro de leitura devolve `nao_medido`, nunca zero.

import { prisma } from "@/lib/db/client";
import type { Dinheiro } from "@/lib/agency/financeiro/dinheiro";
import { medido } from "@/lib/agency/financeiro/dinheiro";

/**
 * O que o provedor devolve num pagamento. Só os campos que interessam ao custo.
 * `fee_details` é a lista de retenções: `mercadopago_fee`, `financing_fee`, etc.
 */
export interface PagamentoDoProvedor {
  transaction_amount?: number;
  fee_details?: Array<{ type?: string; amount?: number }>;
  transaction_details?: { net_received_amount?: number };
}

/**
 * Extrai a taxa REAL retida num pagamento, em centavos.
 *
 * ⛔ Devolve `null`, e não `0`, quando o provedor não informou `fee_details`.
 * Um pagamento sem detalhe de taxa é um pagamento cuja taxa a casa NÃO SABE —
 * e é isso que a coluna nula precisa significar. Somar zero ali seria inventar
 * um custo baixo, que é o pior erro possível numa conta de margem.
 *
 * `fee_details` VAZIO também é `null`: lista vazia é "o provedor não detalhou",
 * não "não houve taxa". O Pix pode de fato ter taxa zero num plano — mas quem
 * afirma isso é o extrato, não a ausência de um campo.
 */
export function taxaDoPagamento(pm: PagamentoDoProvedor): number | null {
  const detalhes = pm.fee_details;
  if (!Array.isArray(detalhes) || detalhes.length === 0) return null;
  const numeros = detalhes
    .map((d) => (typeof d?.amount === "number" && Number.isFinite(d.amount) ? d.amount : null))
    .filter((n): n is number => n !== null);
  if (numeros.length === 0) return null;
  return Math.round(numeros.reduce((s, n) => s + n, 0) * 100);
}

/** O líquido que sobrou, em centavos. `null` = o provedor não informou. */
export function liquidoDoPagamento(pm: PagamentoDoProvedor): number | null {
  const n = pm.transaction_details?.net_received_amount;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export interface TaxaMedida {
  /** A taxa efetiva em pontos percentuais do bruto. `null` = não medida. */
  pct: number | null;
  /** Quantos pagamentos entraram na média. Zero = ainda não há medição. */
  amostra: number;
  /** O total retido pelo provedor, para o DRE. */
  totalRetido: Dinheiro;
  motivo: string;
}

const SEM_MEDICAO = (motivo: string): TaxaMedida => ({
  pct: null,
  amostra: 0,
  totalRetido: { estado: "nao_medido", motivo },
  motivo,
});

/**
 * A taxa efetiva do gateway, medida sobre os pagamentos que a casa REALMENTE
 * recebeu. Sem pagamento com taxa gravada, devolve `nao_medido`.
 *
 * NUNCA LANÇA e nunca devolve zero por ausência.
 */
export async function taxaDoGatewayMedida(desde?: Date): Promise<TaxaMedida> {
  let linhas: Array<{ valorCentavos: number; taxaCentavos: number | null }>;
  try {
    linhas = await prisma.pagamentoConfirmado.findMany({
      where: {
        origem: "mercadopago",
        taxaCentavos: { not: null },
        ...(desde ? { confirmadoEm: { gte: desde } } : {}),
      },
      select: { valorCentavos: true, taxaCentavos: true },
    });
  } catch (e) {
    return SEM_MEDICAO(
      `não consegui ler os pagamentos para medir a taxa (${e instanceof Error ? e.message : "erro"}) — ` +
      "leitura que falha vira NÃO MEDIDO, jamais taxa zero",
    );
  }

  const validas = linhas.filter((l) => typeof l.taxaCentavos === "number" && l.valorCentavos > 0);
  if (validas.length === 0) {
    return SEM_MEDICAO(
      "nenhum pagamento com taxa gravada ainda. O gateway foi ligado em 27/08/2026 e o webhook só passou a " +
      "guardar `fee_details` a partir deste PR — a taxa vira MEDIDA no primeiro pagamento aprovado que chegar. " +
      "⚠️ Antes disso é preciso definir MERCADOPAGO_WEBHOOK_SECRET no Railway: sem ele o webhook recusa tudo com 401.",
    );
  }

  const bruto = validas.reduce((s, l) => s + l.valorCentavos, 0);
  const retido = validas.reduce((s, l) => s + (l.taxaCentavos as number), 0);
  return {
    pct: bruto > 0 ? (retido / bruto) * 100 : null,
    amostra: validas.length,
    totalRetido: medido(retido, "extrato"),
    motivo: `medida sobre ${validas.length} pagamento(s) reais do Mercado Pago — fee_details do próprio provedor`,
  };
}
