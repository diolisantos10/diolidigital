// assinatura.ts — A COBRANÇA RECORRENTE. A agência aprende a cobrar o 2º mês.
//
// ═══════════════════════════════════════════════════════════════════════════
// O ACHADO DO CEO (27/08/2026), E ELE É GRAVE
// ═══════════════════════════════════════════════════════════════════════════
//
// A vitrine vende PLANO MENSAL — Ritmo R$ 290, Presença R$ 490, Conteúdo R$ 790,
// com permanência mínima em meses. O código só sabia criar cobrança AVULSA: uma
// `preference` de Checkout Pro (`app/api/self-serve/order/route.ts`), que cobra
// UMA vez e acaba. Do segundo mês em diante a casa **entrega e não recebe**.
//
// E não haveria alarme. Não existe nada nesta casa que fique vermelho quando um
// dinheiro simplesmente não chega — a ausência não dispara nada. O defeito só
// apareceria no dia em que alguém somasse o extrato, meses depois.
//
// ─── O SEGUNDO DEFEITO, DENTRO DO PRIMEIRO, E PIOR ──────────────────────────
//
// O portão (`portao-de-pagamento.ts`) libera pela EXISTÊNCIA de uma linha em
// `PagamentoConfirmado`. Essa linha é única por pedido e nunca expira. Então o
// pagamento do mês 1 liberava produção no mês 2, no mês 12 e no mês 40 — para
// um cliente que parou de pagar no primeiro. A trava fail-closed da casa tinha
// um vazamento com validade infinita, e ela estava verde.
//
// É por isso que a assinatura não é um campo no pedido: é um FATO próprio. A
// presença de uma `AssinaturaRecorrente` muda a pergunta do portão de *"existe
// pagamento?"* para *"a competência do MÊS CORRENTE está paga?"*.
//
// ═══════════════════════════════════════════════════════════════════════════
// AS TRAVAS, E POR QUE CADA UMA
// ═══════════════════════════════════════════════════════════════════════════
//
//   • **Idempotência no banco**, como já era em `PagamentoConfirmado`: o
//     provedor reenvia o mesmo aviso por horas quando não recebe 200.
//     `provedorPagamentoId @unique` faz o reenvio cair no mesmo registro.
//   • **Não cobrar duas vezes o mesmo mês**: `@@unique(assinaturaId,
//     competencia)`. É OUTRA falha — dois pagamentos com ids diferentes na mesma
//     competência passariam pela trava de cima. Uma trava só não bastava.
//   • **Fail-closed continua fail-closed**: mês não pago = não produz. Nenhum
//     caminho deste arquivo devolve "em dia" por erro, por ausência ou por
//     exceção. Erro de leitura vira `leitura_indisponivel`, que é recusa.
//   • **Cancelamento e falha têm caminho**, com dono e próxima ação. Sem beco.
//
// ⛔ NADA AQUI COBRA NINGUÉM. Este módulo lê e grava o que o provedor informou;
// quem cobra é o Mercado Pago, pelo `preapproval` que o cliente autorizou. Foi
// provado com dublê do provedor (`__tests__/financeiro/assinatura-recorrente.test.ts`),
// sem cartão real e sem uma única cobrança de verdade.

import { prisma } from "@/lib/db/client";
import { pisoDoServico, servicoPorChave } from "@/lib/agency/financeiro/tabela-de-precos";

/** Os estados de uma assinatura. Nenhum deles libera produção sozinho. */
export type EstadoDaAssinatura = "pendente" | "ativa" | "inadimplente" | "cancelada";

/**
 * A COMPETÊNCIA: o mês que uma cobrança paga, em `AAAA-MM`.
 *
 * ⚠️ **UTC, sempre.** A casa roda em Railway (UTC) e o CEO está em UTC−3. Usar
 * o fuso local do processo faria a virada do mês acontecer em horas diferentes
 * em máquinas diferentes — e uma produção liberada no dia 30 à noite numa
 * réplica e barrada em outra é o pior tipo de defeito: intermitente, e sempre
 * culpando outra coisa.
 */
export function competenciaDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

/** A competência do mês corrente. */
export function competenciaCorrente(agora: Date = new Date()): string {
  return competenciaDe(agora);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. NASCER — a assinatura entra na casa
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoDeAssinatura =
  | { ok: true; assinaturaId: string; jaExistia: boolean }
  | { ok: false; motivo: string };

/**
 * Registra a assinatura que o provedor criou. Idempotente por `clientRequestId`
 * **e** por `provedorAssinaturaId` — as duas chaves são `@unique`, e o reenvio
 * do aviso de criação cai na linha que já existe.
 *
 * ⛔ O VALOR PASSA PELO PISO. Uma assinatura é um preço repetido 12 vezes: um
 * centavo abaixo do piso aqui é doze meses de prejuízo, não um. O mesmo freio do
 * SDR (`podeOfertar`) vale aqui, e por isso ele é chamado — não reescrito.
 */
export async function registrarAssinatura(entrada: {
  clientRequestId: string;
  clientId?: string | null;
  planoId: "ritmo" | "presenca" | "conteudo";
  valorCentavos: number;
  provedorAssinaturaId: string;
  /** Quem cuida quando a cobrança falhar. Obrigatório: inadimplência sem dono é
   *  cliente parado que ninguém liga. */
  dono: string;
  estado?: EstadoDaAssinatura;
  proximaCobrancaEm?: Date | null;
}): Promise<ResultadoDeAssinatura> {
  if (!entrada.clientRequestId) return { ok: false, motivo: "sem clientRequestId" };
  if (!entrada.provedorAssinaturaId) return { ok: false, motivo: "sem id de assinatura do provedor" };
  if (!entrada.dono?.trim()) {
    return { ok: false, motivo: "assinatura sem dono — quem cuida da inadimplência tem de estar na linha" };
  }

  const servico = servicoPorChave(`plano_${entrada.planoId}`);
  if (!servico) {
    return { ok: false, motivo: `plano "${entrada.planoId}" não está na tabela de preços da casa` };
  }
  const piso = pisoDoServico(servico);
  if (!Number.isFinite(entrada.valorCentavos) || entrada.valorCentavos < piso) {
    return {
      ok: false,
      motivo:
        `assinatura de ${servico.nome} por ${entrada.valorCentavos} centavos está abaixo do piso (${piso}). ` +
        "Assinatura é o preço repetido todo mês — um centavo abaixo do piso aqui é o ano inteiro no prejuízo.",
    };
  }

  try {
    const ja = await prisma.assinaturaRecorrente.findFirst({
      where: {
        OR: [
          { clientRequestId: entrada.clientRequestId },
          { provedorAssinaturaId: entrada.provedorAssinaturaId },
        ],
      },
      select: { id: true },
    });
    if (ja) return { ok: true, assinaturaId: ja.id, jaExistia: true };

    const linha = await prisma.assinaturaRecorrente.create({
      data: {
        clientRequestId: entrada.clientRequestId,
        clientId: entrada.clientId ?? null,
        planoId: entrada.planoId,
        valorCentavos: Math.round(entrada.valorCentavos),
        provedorAssinaturaId: entrada.provedorAssinaturaId,
        estado: entrada.estado ?? "pendente",
        dono: entrada.dono.trim(),
        proximaCobrancaEm: entrada.proximaCobrancaEm ?? null,
      },
      select: { id: true },
    });
    return { ok: true, assinaturaId: linha.id, jaExistia: false };
  } catch (e) {
    // Corrida entre dois webhooks simultâneos: o banco recusa a segunda pela
    // chave única, e a resposta certa é buscar a que venceu — nunca estourar.
    const existente = await prisma.assinaturaRecorrente
      .findUnique({ where: { provedorAssinaturaId: entrada.provedorAssinaturaId }, select: { id: true } })
      .catch(() => null);
    if (existente) return { ok: true, assinaturaId: existente.id, jaExistia: true };
    return { ok: false, motivo: e instanceof Error ? e.message : "falha ao gravar assinatura" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. COBRAR — a mensalidade de um mês
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoDeCobranca =
  | { ok: true; cobrancaId: string; duplicada: boolean; competencia: string }
  | { ok: false; motivo: string };

/**
 * Registra o que o provedor informou sobre UMA cobrança mensal.
 *
 * ─── AS DUAS DUPLICATAS, QUE SÃO DIFERENTES ────────────────────────────────
 *
 *   1. **Mesmo pagamento, aviso repetido.** O provedor reenvia. Achamos pelo
 *      `provedorPagamentoId` e devolvemos a linha que já existe. `duplicada:
 *      true`, `ok: true` — o chamador responde 200 e o provedor para de
 *      reenviar. Devolver erro aqui faria o Mercado Pago reenviar para sempre.
 *   2. **Mesma competência, pagamento diferente.** Setembro cobrado duas vezes,
 *      com dois ids. A trava 1 não pegaria. O banco recusa pela chave composta,
 *      e a resposta é a mesma: devolve a cobrança que já pagava aquele mês.
 *      **Nunca** grava a segunda.
 *
 * ⚠️ Só `aprovada` entra como paga. "Não recusada" não é "paga".
 */
export async function registrarCobranca(entrada: {
  provedorAssinaturaId: string;
  provedorPagamentoId: string;
  valorCentavos: number;
  estado: "aprovada" | "recusada";
  confirmadoEm: Date;
  /** A competência que esta cobrança paga. Omitida, deriva de `confirmadoEm`. */
  competencia?: string;
  taxaCentavos?: number | null;
  liquidoCentavos?: number | null;
  motivo?: string | null;
  moeda?: string;
}): Promise<ResultadoDeCobranca> {
  if (!entrada.provedorPagamentoId) return { ok: false, motivo: "sem id de pagamento do provedor" };

  let assinatura: { id: string; cobrancasFalhadas: number } | null;
  try {
    assinatura = await prisma.assinaturaRecorrente.findUnique({
      where: { provedorAssinaturaId: entrada.provedorAssinaturaId },
      select: { id: true, cobrancasFalhadas: true },
    });
  } catch (e) {
    return { ok: false, motivo: `não consegui ler a assinatura (${e instanceof Error ? e.message : "erro"})` };
  }
  if (!assinatura) {
    return { ok: false, motivo: `assinatura ${entrada.provedorAssinaturaId} não existe na base` };
  }

  const competencia = entrada.competencia ?? competenciaDe(entrada.confirmadoEm);
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return { ok: false, motivo: `competência "${competencia}" fora do formato AAAA-MM` };
  }
  if (entrada.estado === "aprovada" && (!Number.isFinite(entrada.valorCentavos) || entrada.valorCentavos <= 0)) {
    return { ok: false, motivo: `cobrança aprovada com valor ${entrada.valorCentavos} — zero não é pagamento` };
  }

  // ── DUPLICATA 1: o mesmo pagamento, avisado de novo ──────────────────────
  const mesmoPagamento = await prisma.cobrancaRecorrente
    .findUnique({ where: { provedorPagamentoId: entrada.provedorPagamentoId }, select: { id: true, competencia: true } })
    .catch(() => null);
  if (mesmoPagamento) {
    return { ok: true, cobrancaId: mesmoPagamento.id, duplicada: true, competencia: mesmoPagamento.competencia };
  }

  // ── DUPLICATA 2: o mesmo mês, por outro pagamento ────────────────────────
  const mesmoMes = await prisma.cobrancaRecorrente
    .findFirst({ where: { assinaturaId: assinatura.id, competencia }, select: { id: true } })
    .catch(() => null);
  if (mesmoMes) {
    console.warn(
      `[assinatura] SEGUNDA COBRANÇA PARA ${competencia} na assinatura ${entrada.provedorAssinaturaId} ` +
      `(pagamento ${entrada.provedorPagamentoId}) RECUSADA — o mês já estava pago. Isto é caso de gente olhar: ` +
      "se o dinheiro entrou duas vezes no provedor, há um estorno a fazer.",
    );
    return { ok: true, cobrancaId: mesmoMes.id, duplicada: true, competencia };
  }

  try {
    const linha = await prisma.cobrancaRecorrente.create({
      data: {
        assinaturaId: assinatura.id,
        provedorPagamentoId: entrada.provedorPagamentoId,
        competencia,
        valorCentavos: Math.round(entrada.valorCentavos || 0),
        moeda: entrada.moeda ?? "BRL",
        taxaCentavos: entrada.taxaCentavos ?? null,
        liquidoCentavos: entrada.liquidoCentavos ?? null,
        estado: entrada.estado,
        motivo: entrada.motivo ?? null,
        confirmadoEm: entrada.confirmadoEm,
      },
      select: { id: true },
    });

    // O estado da assinatura segue a cobrança — e a falha NUNCA fica muda.
    if (entrada.estado === "aprovada") {
      await prisma.assinaturaRecorrente.update({
        where: { id: assinatura.id },
        data: {
          estado: "ativa",
          motivoDoEstado: null,
          cobrancasFalhadas: 0,
          ultimaCobrancaEm: entrada.confirmadoEm,
        },
      });
    } else {
      await prisma.assinaturaRecorrente.update({
        where: { id: assinatura.id },
        data: {
          estado: "inadimplente",
          motivoDoEstado:
            `cobrança de ${competencia} recusada${entrada.motivo ? `: ${entrada.motivo}` : ""}. ` +
            "A produção deste cliente está PARADA até o mês ser pago.",
          cobrancasFalhadas: assinatura.cobrancasFalhadas + 1,
        },
      });
    }

    return { ok: true, cobrancaId: linha.id, duplicada: false, competencia };
  } catch (e) {
    // A chave composta do banco é a última palavra: se duas requisições
    // simultâneas passaram pelas checagens acima, uma perde aqui — e perder é
    // o comportamento certo. Devolvemos a que venceu.
    const venceu = await prisma.cobrancaRecorrente
      .findFirst({ where: { assinaturaId: assinatura.id, competencia }, select: { id: true } })
      .catch(() => null);
    if (venceu) return { ok: true, cobrancaId: venceu.id, duplicada: true, competencia };
    return { ok: false, motivo: e instanceof Error ? e.message : "falha ao gravar cobrança" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LIBERAR — ou não. A pergunta que o portão faz.
// ═══════════════════════════════════════════════════════════════════════════

export type VereditoDaMensalidade =
  | { tipo: "sem_assinatura" }
  | { tipo: "em_dia"; competencia: string; detalhe: string }
  | { tipo: "mes_nao_pago"; competencia: string; detalhe: string; dono: string }
  | { tipo: "cancelada"; detalhe: string; dono: string }
  | { tipo: "leitura_indisponivel"; detalhe: string };

/**
 * Este pedido é mensal? E, se for, o MÊS CORRENTE está pago?
 *
 * ⛔ **NUNCA LANÇA e NUNCA libera por ausência.** Erro de leitura devolve
 * `leitura_indisponivel`, que o portão trata como recusa. Degradar para parado,
 * jamais para produzindo de graça.
 *
 * `sem_assinatura` NÃO é liberação: é "esta pergunta não se aplica a este
 * pedido", e o portão segue com as regras de sempre (pagamento avulso, isenção,
 * anistia). É o que mantém o comportamento de todo pedido que já existe.
 */
export async function mensalidadeEmDia(
  clientRequestId: string,
  agora: Date = new Date(),
): Promise<VereditoDaMensalidade> {
  let assinatura: {
    id: string; estado: string; dono: string; motivoDoEstado: string | null; canceladaEm: Date | null;
  } | null;
  try {
    assinatura = await prisma.assinaturaRecorrente.findUnique({
      where: { clientRequestId },
      select: { id: true, estado: true, dono: true, motivoDoEstado: true, canceladaEm: true },
    });
  } catch (e) {
    return {
      tipo: "leitura_indisponivel",
      detalhe: `não consegui ler a assinatura de ${clientRequestId} (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui`,
    };
  }
  if (!assinatura) return { tipo: "sem_assinatura" };

  const competencia = competenciaCorrente(agora);

  // ── CANCELADA: caminho com dono e próxima ação, nunca beco ───────────────
  //
  // ⚠️ E o cancelamento NÃO apaga o mês já pago. Quem cancela dia 20 pagou o mês
  // inteiro e tem direito a ele — cortar na hora do clique seria a casa ficando
  // com dinheiro por serviço não entregue. Por isso a checagem do mês pago vem
  // ANTES de recusar por cancelamento.
  let cobranca: { estado: string; confirmadoEm: Date } | null;
  try {
    cobranca = await prisma.cobrancaRecorrente.findFirst({
      where: { assinaturaId: assinatura.id, competencia, estado: "aprovada" },
      select: { estado: true, confirmadoEm: true },
    });
  } catch (e) {
    return {
      tipo: "leitura_indisponivel",
      detalhe: `não consegui ler a cobrança de ${competencia} (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui`,
    };
  }

  if (cobranca) {
    return {
      tipo: "em_dia",
      competencia,
      detalhe:
        `mensalidade de ${competencia} paga em ${cobranca.confirmadoEm.toISOString().slice(0, 10)}` +
        (assinatura.estado === "cancelada"
          ? " — assinatura cancelada, mas o mês pago é entregue até o fim; a renovação é que não acontece"
          : ""),
    };
  }

  if (assinatura.estado === "cancelada") {
    return {
      tipo: "cancelada",
      dono: assinatura.dono,
      detalhe:
        `assinatura cancelada${assinatura.canceladaEm ? ` em ${assinatura.canceladaEm.toISOString().slice(0, 10)}` : ""}` +
        `${assinatura.motivoDoEstado ? ` (${assinatura.motivoDoEstado})` : ""} e ${competencia} não está pago`,
    };
  }

  return {
    tipo: "mes_nao_pago",
    competencia,
    dono: assinatura.dono,
    detalhe:
      `assinatura ${assinatura.estado} sem cobrança APROVADA para ${competencia}` +
      `${assinatura.motivoDoEstado ? ` — ${assinatura.motivoDoEstado}` : ""}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CANCELAR — e o que acontece com o cliente
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marca a assinatura como cancelada. **Não é um apagar**: a linha fica, com data
 * e motivo, porque o financeiro precisa saber que existiu e quando acabou.
 *
 * O mês já pago continua sendo entregue (ver `mensalidadeEmDia`). O que o
 * cancelamento faz é impedir a renovação — e é isso que se diz ao cliente.
 */
export async function cancelarAssinatura(entrada: {
  provedorAssinaturaId: string;
  motivo: string;
  em?: Date;
}): Promise<{ ok: true; jaEstavaCancelada: boolean } | { ok: false; motivo: string }> {
  try {
    const a = await prisma.assinaturaRecorrente.findUnique({
      where: { provedorAssinaturaId: entrada.provedorAssinaturaId },
      select: { id: true, estado: true },
    });
    if (!a) return { ok: false, motivo: `assinatura ${entrada.provedorAssinaturaId} não existe na base` };
    if (a.estado === "cancelada") return { ok: true, jaEstavaCancelada: true };
    await prisma.assinaturaRecorrente.update({
      where: { id: a.id },
      data: {
        estado: "cancelada",
        motivoDoEstado: entrada.motivo,
        canceladaEm: entrada.em ?? new Date(),
        proximaCobrancaEm: null,
      },
    });
    return { ok: true, jaEstavaCancelada: false };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "falha ao cancelar" };
  }
}

/**
 * A INSTRUÇÃO GÊMEA da recorrência: o que se diz ao cliente, e qual é a próxima
 * ação. Toda proibição precisa de alternativa — proibição sem saída empurra o
 * operador para o contorno e deixa o cliente numa tela muda.
 */
export const O_QUE_DIZER: Record<"mes_nao_pago" | "cancelada", string> = {
  mes_nao_pago:
    "A mensalidade deste mês ainda não foi confirmada, e a produção fica aguardando — é com ela que a gente " +
    "compra os insumos do trabalho. Se a cobrança falhou no cartão, dá para atualizar o cartão ou pagar por Pix: " +
    "chame a Dioli no WhatsApp que a gente manda o link e libera na hora.",
  cancelada:
    "Sua assinatura foi cancelada, então não haverá nova cobrança — e o mês que você já pagou a gente entrega até o fim. " +
    "Se quiser voltar, chame a Dioli no WhatsApp: a gente reativa o plano ou monta outro do seu tamanho.",
};
