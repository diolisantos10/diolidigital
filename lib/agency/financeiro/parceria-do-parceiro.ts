// A PARCERIA É DO PARCEIRO — e é ela que rompe o nó circular.
//
// ═══ O NÓ, MEDIDO EM QUATRO PONTOS (27/08/2026) ═════════════════════════════
//
//   1. `conceder-isencao.ts` → `if (!clientRequestId) recusar("sem_pedido")`
//   2. `portao-de-pagamento.ts` → `isencaoDeParceria.findUnique({ clientRequestId })`
//   3. `convite-de-parceria.ts` → recusava com `sem_isencao_viva`
//   4. `client-request-service.ts` → o pedido nasce do briefing
//
//       convite → isenção → pedido → briefing → (convite)
//
// A porta existia e **não podia ser aberta a primeira vez**: não havia como
// cunhar o link do PRIMEIRO parceiro. É a família "trava construída sem
// fechadura" — a sétima ocorrência em 24 horas —, agora em forma de círculo.
//
// ⚠️ PRECISÃO, porque o diagnóstico exato importa: o **pedido** não ficava
// trancado. `budget_range` fecha com qualquer resposta, então o parceiro
// conseguia terminar o briefing — respondendo justamente a pergunta que a
// parceria deveria poupar dele. O que estava trancado era o **convite**, e com
// ele todo o tratamento de parceiro.
//
// ═══ O CONSERTO ════════════════════════════════════════════════════════════
//
// A autorização passa a viver no nível do PARCEIRO (`ParceriaDoCliente`) e
// existe ANTES de qualquer pedido. O convite nasce dela — círculo rompido.
//
// E ela vira a ÚNICA FONTE DA VERDADE: a `IsencaoDeParceria` de cada pedido
// passa a ser DERIVADA desta linha (`derivarIsencaoDoPedido`), não um ato
// manual novo. *Verdade escrita em dois lugares já está errada em um deles.*
//
// ═══ O QUE NÃO MUDA ════════════════════════════════════════════════════════
//
//   • Fail-closed: sem parceria viva o cliente é comum — verba perguntada,
//     portão de pagamento fechando normalmente.
//   • Teto de custo OBRIGATÓRIO: sem ele o parceiro come o crédito do pagante.
//   • Validade OBRIGATÓRIA e dono NOMINAL.
//   • ⛔ NUNCA um pagamento falso de R$ 0. Isto não encosta em
//     `PagamentoConfirmado`. Receita de parceria é R$ 0 com o custo contado
//     normalmente, e a margem negativa fica à vista — *parceria não é grátis:
//     é investimento, e investimento se mede.*

import { prisma } from "@/lib/db/client";

export type ParceriaViva = {
  clientId: string;
  autorizadaPor: string;
  validaAte: Date;
  escopo: string;
  pecasContratadas: number;
  tetoDeIaCentavosUsd: number;
};

export type PedidoDeAutorizacao = {
  clientId: string;
  /** A FONTE da autorização — nominal. O CEO, citando D-0B9. */
  autorizadaPor: string;
  validaAte: Date | string;
  escopo: string;
  pecasContratadas: number;
  tetoDeIaCentavosUsd: number;
  observacao?: string | null;
  /** QUEM APERTOU O BOTÃO. Sai da sessão, nunca do corpo. */
  registradaPor?: string | null;
};

export type ResultadoDaAutorizacao =
  | { ok: true; id: string; clientId: string; validaAte: Date; jaExistia: boolean }
  | { ok: false; recusa: string; motivo: string };

function recusar(recusa: string, motivo: string): ResultadoDaAutorizacao {
  return { ok: false, recusa, motivo };
}

function textoUtil(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Inteiro >= 0. `NaN`, fração e negativo são RECUSA, nunca zero. */
function inteiroNaoNegativo(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (!Number.isInteger(v) || v < 0) return null;
  return v;
}

/**
 * AUTORIZA a parceria de um cliente. Sem pedido, sem briefing, sem círculo.
 *
 * Tudo é conferido ANTES de escrever: uma autorização pela metade LIBERA, e o
 * operador acha que a trava conferiu o que ele digitou. Nenhum campo tem valor
 * padrão — padrão em campo de parceria é a forma silenciosa de escancarar a
 * porta (quem esquece o teto receberia um teto, não um erro).
 */
export async function autorizarParceriaDoCliente(
  pedido: PedidoDeAutorizacao,
  agora: Date = new Date(),
): Promise<ResultadoDaAutorizacao> {
  const clientId = textoUtil(pedido.clientId);
  if (!clientId) return recusar("sem_cliente", "parceria sem parceiro não é parceria: informe o cliente");

  const autorizadaPor = textoUtil(pedido.autorizadaPor);
  if (!autorizadaPor) {
    return recusar(
      "sem_dono",
      "parceria sem dono é buraco: `autorizadaPor` é nominal e obrigatório. " +
        "Em seis meses ninguém sabe quem liberou, e 'sempre foi assim' vira a resposta.",
    );
  }

  const escopo = textoUtil(pedido.escopo);
  if (!escopo) {
    return recusar("sem_escopo", "parceria sem escopo cobre tudo, para sempre — diga o que ela cobre");
  }

  const validaAte = pedido.validaAte instanceof Date ? pedido.validaAte : new Date(pedido.validaAte);
  if (Number.isNaN(validaAte.getTime())) {
    return recusar("validade_ilegivel", "data de validade ilegível — e ilegível NÃO vira 'vale para sempre'");
  }
  if (validaAte.getTime() <= agora.getTime()) {
    return recusar(
      "validade_no_passado",
      `validade ${validaAte.toISOString().slice(0, 10)} já passou — autorizar parceria nascida vencida ` +
        "é escrever uma linha que o portão vai recusar",
    );
  }

  const pecasContratadas = inteiroNaoNegativo(pedido.pecasContratadas);
  if (pecasContratadas === null) {
    return recusar("pecas_invalidas", "peças contratadas: inteiro >= 0. Zero é ZERO, nunca 'sem limite'");
  }

  const tetoDeIaCentavosUsd = inteiroNaoNegativo(pedido.tetoDeIaCentavosUsd);
  if (tetoDeIaCentavosUsd === null) {
    return recusar(
      "teto_invalido",
      "teto de IA em centavos de dólar: inteiro >= 0. Sem teto, o parceiro come o crédito do " +
        "cliente pagante — e o crédito desta casa é finito e sem recarga automática.",
    );
  }

  try {
    const existente = await prisma.parceriaDoCliente.findUnique({ where: { clientId } });
    if (existente && !existente.revogadaEm) {
      // Idempotência com os MESMOS termos; recusa com termos DIFERENTES.
      // Alterar uma autorização auditada não é autorizar — é outra coisa, e
      // precisa de outro ato consciente (revogar e autorizar de novo).
      const igual =
        existente.autorizadaPor === autorizadaPor &&
        existente.escopo === escopo &&
        existente.validaAte.getTime() === validaAte.getTime() &&
        existente.pecasContratadas === pecasContratadas &&
        existente.tetoDeIaCentavosUsd === tetoDeIaCentavosUsd;
      if (igual) {
        return { ok: true, id: existente.id, clientId, validaAte: existente.validaAte, jaExistia: true };
      }
      return recusar(
        "ja_existe_com_outros_termos",
        "este parceiro já tem uma autorização VIVA com termos diferentes. Revogue-a antes " +
          "(alterar uma autorização auditada não é autorizar).",
      );
    }

    const linha = await prisma.parceriaDoCliente.upsert({
      where: { clientId },
      create: {
        clientId, autorizadaPor, validaAte, escopo, pecasContratadas, tetoDeIaCentavosUsd,
        observacao: textoUtil(pedido.observacao), registradaPor: textoUtil(pedido.registradaPor),
      },
      // Reautorizar um parceiro REVOGADO é legítimo e limpa a revogação.
      update: {
        autorizadaPor, validaAte, escopo, pecasContratadas, tetoDeIaCentavosUsd,
        observacao: textoUtil(pedido.observacao), registradaPor: textoUtil(pedido.registradaPor),
        revogadaEm: null,
      },
    });
    return { ok: true, id: linha.id, clientId, validaAte: linha.validaAte, jaExistia: false };
  } catch (err) {
    return recusar("erro", err instanceof Error ? err.message : String(err));
  }
}

/**
 * A PARCERIA VIVA deste cliente — a fonte da verdade, lida agora.
 *
 * `null` em todo caminho que não seja "existe, não foi revogada, e ainda vale".
 * Banco fora do ar também devolve `null`: *"não sei" significa cliente comum*,
 * nunca "trata como parceiro". Fail-closed é a metade que importa.
 */
export async function parceriaVivaDoCliente(
  clientId: string | null | undefined,
  agora: Date = new Date(),
): Promise<ParceriaViva | null> {
  const id = textoUtil(clientId);
  if (!id) return null;
  try {
    const p = await prisma.parceriaDoCliente.findUnique({ where: { clientId: id } });
    if (!p) return null;
    if (p.revogadaEm) return null;
    if (!(p.validaAte instanceof Date) || Number.isNaN(p.validaAte.getTime())) return null;
    if (p.validaAte.getTime() < agora.getTime()) return null;
    return {
      clientId: p.clientId,
      autorizadaPor: p.autorizadaPor,
      validaAte: p.validaAte,
      escopo: p.escopo,
      pecasContratadas: p.pecasContratadas,
      tetoDeIaCentavosUsd: p.tetoDeIaCentavosUsd,
    };
  } catch {
    return null;
  }
}

/** Revoga a parceria. Mata os convites do parceiro na hora — eles conferem
 *  esta linha a cada uso, então não há link a caçar. Idempotente. */
export async function revogarParceriaDoCliente(clientId: string, agora: Date = new Date()): Promise<boolean> {
  try {
    const r = await prisma.parceriaDoCliente.updateMany({
      where: { clientId: clientId.trim(), revogadaEm: null },
      data: { revogadaEm: agora },
    });
    return r.count > 0;
  } catch {
    return false;
  }
}

/**
 * A ISENÇÃO DO PEDIDO, DERIVADA da parceria do parceiro.
 *
 * ⚠️ Isto é o que faz `IsencaoDeParceria` deixar de ser um ato manual e virar
 * CONSEQUÊNCIA. Quando um pedido nasce sob parceria viva, a isenção dele é
 * escrita a partir da autorização do parceiro — os mesmos termos, a mesma
 * validade, o mesmo teto. Uma fonte, um valor.
 *
 * Idempotente: já existindo isenção para o pedido, nada é reescrito. A isenção
 * de um pedido é um FATO DAQUELE MOMENTO, e reescrevê-la depois mudaria a
 * história de uma produção que já aconteceu.
 *
 * Devolve `null` quando não há parceria viva — e aí o pedido segue pagante, com
 * o portão fechando normalmente. Nunca inventa isenção.
 */
export async function derivarIsencaoDoPedido(
  clientRequestId: string,
  clientId: string | null | undefined,
  agora: Date = new Date(),
): Promise<{ derivou: boolean; parceria: ParceriaViva } | null> {
  const pedidoId = textoUtil(clientRequestId);
  if (!pedidoId) return null;

  const parceria = await parceriaVivaDoCliente(clientId, agora);
  if (!parceria) return null;

  try {
    const jaTem = await prisma.isencaoDeParceria.findUnique({
      where: { clientRequestId: pedidoId },
      select: { id: true },
    });
    if (jaTem) return { derivou: false, parceria };

    await prisma.isencaoDeParceria.create({
      data: {
        clientRequestId: pedidoId,
        clientId: parceria.clientId,
        autorizadaPor: parceria.autorizadaPor,
        validaAte: parceria.validaAte,
        escopo: parceria.escopo,
        pecasContratadas: parceria.pecasContratadas,
        tetoDeIaCentavosUsd: parceria.tetoDeIaCentavosUsd,
        // Dono da derivação, explícito: quem ler a linha daqui a seis meses
        // precisa saber que ela não foi digitada por ninguém.
        observacao: `derivada da parceria do cliente ${parceria.clientId}`,
      },
    });
    return { derivou: true, parceria };
  } catch {
    // Corrida (dois caminhos derivando o mesmo pedido) ou banco fora do ar. Nos
    // dois casos a parceria CONTINUA valendo — quem decide o portão é a
    // parceria viva, não o sucesso desta escrita. Nunca liberar por engano, e
    // nunca barrar um parceiro legítimo por uma escrita de auditoria.
    return { derivou: false, parceria };
  }
}
