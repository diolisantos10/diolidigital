// custo-de-infraestrutura.ts — A SEGUNDA PARCELA DO CUSTO SAI DO ESCURO.
//
// ─── A ORDEM ────────────────────────────────────────────────────────────────
//
// Do Diretor Geral, 27/08/2026: *"Medir o custo é a sua prioridade número um —
// é ela que destrava a negociação. Ataque na ordem do que é fácil e grande:
// taxa do Mercado Pago e infraestrutura (Railway tem números)."*
//
// ─── O QUE FOI MEDIDO, E É METADE DA CONTA ──────────────────────────────────
//
// O CONSUMO **foi medido**, na fonte, em 27/08/2026: sete dias de amostragem da
// própria Railway (10.081 amostras por métrica, produção). Não é estimativa e
// não é a média de ninguém: é o que estes dois serviços gastaram.
//
// O PREÇO UNITÁRIO **não**. E é aqui que a honestidade decide a conta: a Railway
// publica uma tabela de preços, mas a casa não sabe qual PLANO está contratado,
// se há crédito, franquia ou desconto. *A fatura existe; ela é que não entrou
// nesta casa.* Multiplicar consumo medido por preço de catálogo produziria um
// número com cara de medido e sangue de chute — e é essa a família de defeito
// que a doutrina desta casa proíbe.
//
// Então este módulo entrega: **consumo medido**, e o custo `nao_medido` até o
// CEO informar a fatura. Quando ele informar, `custoDeInfraestrutura()` passa a
// devolver `medido` — e a folga entre a tabela e o piso aparece sozinha, sem
// ninguém recalcular nada à mão.
//
// ⚠️ E FALTA O RATEIO. Mesmo com a fatura, o custo por CLIENTE precisa de um
// divisor. Hoje ele existe e é honesto: dividir pelo número de clientes ativos.
// Com um cliente, a infraestrutura inteira é o custo dele — o que é verdade, e é
// desconfortável de propósito.

import type { Dinheiro } from "@/lib/agency/financeiro/dinheiro";
import { medido } from "@/lib/agency/financeiro/dinheiro";

/**
 * O CONSUMO MEDIDO. Números da Railway, produção, 7 dias, 20/08→27/08/2026.
 *
 * ⚠️ Estes números são um RETRATO, não um sensor. Eles envelhecem: dobre a
 * carteira e o consumo muda. `medidoEm` está aqui para que ninguém confunda um
 * número de agosto com o custo de dezembro — e a próxima medição substitui esta
 * constante, com a data nova.
 */
export const CONSUMO_MEDIDO = {
  medidoEm: "2026-08-27",
  janelaHoras: 168,
  amostrasPorMetrica: 10_081,
  fonte: "Railway — métricas do projeto Dioli Digital, ambiente production",
  servicos: {
    /** O app Next.js. */
    diolidigital: {
      cpuVcpuMedio: 0.0030,
      memoriaGbMedia: 0.3321,
      discoGb: 0.5728,
    },
    /** O banco. */
    postgres: {
      cpuVcpuMedio: 0.00029,
      memoriaGbMedia: 0.03464,
      discoGb: 0.19939,
    },
  },
} as const;

/** O consumo somado dos dois serviços — o que a casa inteira gasta. */
export function consumoTotal(): { cpuVcpu: number; memoriaGb: number; discoGb: number } {
  const s = CONSUMO_MEDIDO.servicos;
  return {
    cpuVcpu: s.diolidigital.cpuVcpuMedio + s.postgres.cpuVcpuMedio,
    memoriaGb: s.diolidigital.memoriaGbMedia + s.postgres.memoriaGbMedia,
    discoGb: s.diolidigital.discoGb + s.postgres.discoGb,
  };
}

/**
 * A FATURA MENSAL DA NUVEM, em centavos de dólar.
 *
 * ⛔ `null` = **o CEO ainda não informou**. Não é zero e não é "de graça".
 *
 * Esta é a única coisa que falta para a infraestrutura sair da lista de NÃO
 * MEDIDOS — e ela é um número que só existe no extrato do dono da conta. Assim
 * que estiver aqui, o custo por cliente sai sozinho.
 *
 * ⚠️ NÃO PREENCHA COM A TABELA DE PREÇOS DA RAILWAY. O que vale é o que foi
 * DEBITADO: plano, crédito e franquia mudam o número, e um preço de catálogo
 * escrito aqui viraria margem que o negociador gastaria de verdade.
 */
export const FATURA_MENSAL_USD_CENTAVOS: number | null = null;

/** Quem tem de trazer o número, e o que exatamente. */
export const DONO_DA_FATURA =
  "CEO — informar o total DEBITADO pela Railway no último mês fechado (não a tabela de preços)";

export interface CustoDeInfra {
  /** O custo mensal da nuvem inteira. */
  total: Dinheiro;
  /** O custo por cliente ativo. */
  porCliente: Dinheiro;
  clientesAtivos: number;
  motivo: string;
}

/**
 * O custo de infraestrutura por cliente.
 *
 * ⛔ Fail-closed do jeito financeiro: sem fatura, `nao_medido` — e é o
 * `nao_medido` que segura o piso lá em cima. Sem cliente ativo, também
 * `nao_medido`: dividir por zero não dá infinito, dá conta errada.
 */
export function custoDeInfraestrutura(clientesAtivos: number): CustoDeInfra {
  const naoMedido = (motivo: string): CustoDeInfra => ({
    total: { estado: "nao_medido", motivo },
    porCliente: { estado: "nao_medido", motivo },
    clientesAtivos,
    motivo,
  });

  if (FATURA_MENSAL_USD_CENTAVOS === null) {
    return naoMedido(
      "o CONSUMO está medido (Railway, 7 dias, 27/08/2026) mas a FATURA não entrou nesta casa. " +
      `${DONO_DA_FATURA}. Multiplicar consumo medido por preço de catálogo daria um número com cara ` +
      "de medido e sangue de chute — e é sobre esse número que o negociador desceria o preço.",
    );
  }
  if (!Number.isFinite(clientesAtivos) || clientesAtivos <= 0) {
    return naoMedido(
      "não há cliente ativo para ratear a infraestrutura. Com zero clientes o custo por cliente não é zero: não existe.",
    );
  }

  return {
    total: medido(FATURA_MENSAL_USD_CENTAVOS, "extrato", "USD"),
    porCliente: medido(Math.ceil(FATURA_MENSAL_USD_CENTAVOS / clientesAtivos), "derivado", "USD"),
    clientesAtivos,
    motivo:
      `fatura informada, rateada por ${clientesAtivos} cliente(s) ativo(s). ` +
      "Com um cliente só, a nuvem inteira é o custo dele — o que é verdade, e é desconfortável de propósito.",
  };
}
