// CONCEDER A ISENÇÃO DE PARCERIA — a porta de entrada que não existia.
//
// ── O buraco, medido em 27/08/2026 ──────────────────────────────────────────
// `IsencaoDeParceria` nasceu ontem (#356) com o portão que a LÊ e o reset que a
// APAGA. Uma varredura do repositório inteiro por `isencaoDeParceria` devolve
// exatamente três usos:
//
//   • `portao-de-pagamento.ts:273`  → findUnique   (lê)
//   • `app/api/admin/reset/route.ts:188` → deleteMany (apaga)
//   • `persistence/cliente-vinculos.ts` → o vínculo, na fusão de cliente
//
// **Nada, em lugar nenhum, cria uma.** O portão consulta uma tabela que ninguém
// consegue preencher — e o cliente 001, que entra por parceria e não paga nada,
// era por definição inconcedível. Trava perfeita numa porta sem maçaneta.
//
// ── Por que biblioteca, e não rota HTTP ─────────────────────────────────────
// Isto libera produção DE GRAÇA. Uma rota é uma porta na internet, e uma porta
// dessas errada não custa um bug: custa o crédito da casa inteira, que é finito
// e sem recarga automática. A concessão é ato raro, nominal e humano — mora num
// script, como `destravar-pedidos.mts`. Se um dia virar rota, a decisão é do
// CEO, e ela precisa da mesma autenticação de `/api/admin/pagamentos`.
//
// ── Fail-closed, e sem NENHUM valor padrão ──────────────────────────────────
// Todo campo obrigatório do schema é obrigatório aqui, e nenhum ganha padrão.
// Padrão em campo de isenção é a forma silenciosa de escancarar a porta: quem
// esquece o teto recebe um teto, não um erro, e a casa descobre no extrato.

import { prisma } from "@/lib/db/client";

export type PedidoDeIsencao = {
  clientRequestId: string;
  clientId?: string | null;
  /** Nominal. Isenção sem dono é buraco — em seis meses ninguém sabe quem liberou. */
  autorizadaPor: string;
  /** Data de validade. Parceria eterna vira esquecimento. */
  validaAte: Date | string;
  /** O que a parceria cobre, em texto do operador. */
  escopo: string;
  /** Quantas peças. Zero é ZERO, nunca "sem limite". */
  pecasContratadas: number;
  /** Teto de custo de IA, em centavos de dólar. Zero é ZERO, nunca "liberado". */
  tetoDeIaCentavosUsd: number;
  observacao?: string | null;
};

export type ResultadoDaConcessao =
  | { ok: true; id: string; validaAte: Date }
  | { ok: false; motivo: string; recusa: string };

function recusar(recusa: string, motivo: string): ResultadoDaConcessao {
  return { ok: false, recusa, motivo };
}

/** Texto obrigatório e com conteúdo. Espaço em branco não é nome de gente. */
function textoUtil(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Inteiro >= 0. `NaN`, fração e negativo são recusa, não zero. */
function inteiroNaoNegativo(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (!Number.isInteger(v) || v < 0) return null;
  return v;
}

/**
 * Concede a isenção — ou recusa com nome próprio, e NUNCA no meio do caminho.
 *
 * Tudo é conferido ANTES de escrever. Uma concessão pela metade (linha criada
 * com escopo vazio, por exemplo) é pior que recusa: ela LIBERA, e o operador
 * acha que a trava conferiu o que ele digitou.
 *
 * ⛔ NÃO é pagamento, e não encosta em `PagamentoConfirmado`. Receita da
 * parceria é R$ 0 e o custo é contado normalmente — a margem negativa fica
 * visível, que é o ponto. *Parceria não é grátis: é investimento, e
 * investimento se mede.*
 */
export async function concederIsencaoDeParceria(
  pedido: PedidoDeIsencao,
  agora: Date = new Date(),
): Promise<ResultadoDaConcessao> {
  const clientRequestId = textoUtil(pedido.clientRequestId);
  if (!clientRequestId) return recusar("sem_pedido", "isenção sem pedido não isenta nada");

  const autorizadaPor = textoUtil(pedido.autorizadaPor);
  if (!autorizadaPor) {
    return recusar(
      "sem_dono",
      "isenção sem dono é buraco: `autorizadaPor` é nominal e obrigatório. " +
        "Em seis meses ninguém sabe quem liberou, e 'sempre foi assim' vira a resposta.",
    );
  }

  const escopo = textoUtil(pedido.escopo);
  if (!escopo) {
    return recusar(
      "sem_escopo",
      "isenção sem escopo cobre tudo, para sempre — diga o que a parceria cobre",
    );
  }

  // A validade é conferida DUAS vezes, e as duas recusas têm nomes diferentes:
  // ilegível não é a mesma coisa que vencida, e o operador precisa saber qual.
  const validaAte = pedido.validaAte instanceof Date ? pedido.validaAte : new Date(pedido.validaAte);
  if (Number.isNaN(validaAte.getTime())) {
    return recusar(
      "validade_ilegivel",
      "data de validade ilegível — e data ilegível NÃO vira 'vale para sempre'",
    );
  }
  if (validaAte.getTime() <= agora.getTime()) {
    return recusar(
      "validade_no_passado",
      `validade ${validaAte.toISOString().slice(0, 10)} já passou — ` +
        "conceder uma isenção nascida vencida é escrever uma linha que o portão vai recusar",
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
      "teto de IA em centavos de dólar: inteiro >= 0. Sem teto, o parceiro come o " +
        "crédito do cliente pagante — e o crédito desta casa é finito e sem recarga automática.",
    );
  }

  // O pedido tem de EXISTIR. Isenção órfã é produção liberada de graça sem
  // cliente a que responder — o mesmo buraco que os testes-guarda da casa
  // pegaram na fusão de cliente e no reset de inauguração.
  let existe: { id: string; clientId: string | null } | null;
  try {
    existe = await prisma.clientRequestDb.findUnique({
      where: { id: clientRequestId },
      select: { id: true, clientId: true },
    });
  } catch (e) {
    return recusar("leitura_indisponivel", `não consegui conferir o pedido (${e instanceof Error ? e.message : "erro"})`);
  }
  if (!existe) return recusar("pedido_inexistente", `não existe pedido ${clientRequestId}`);

  try {
    const criada = await prisma.isencaoDeParceria.create({
      data: {
        clientRequestId,
        // ⚠️ DERIVADO DO PEDIDO quando não vier informado — e isso NÃO é
        // conveniência. O DRE agrupa por cliente: uma isenção sem `clientId`
        // não sabe a qual linha pertence, e a parceria fica invisível no
        // relatório que deveria mostrar a margem negativa dela. Isenção que
        // ninguém enxerga no financeiro é exatamente o gasto não medido que a
        // ordem do CEO (D-0B9) proíbe.
        clientId: textoUtil(pedido.clientId) ?? existe.clientId ?? null,
        autorizadaPor,
        validaAte,
        escopo,
        pecasContratadas,
        tetoDeIaCentavosUsd,
        observacao: textoUtil(pedido.observacao) ?? null,
      },
      select: { id: true, validaAte: true },
    });
    return { ok: true, id: criada.id, validaAte: criada.validaAte };
  } catch (e) {
    // `clientRequestId` é `@unique`: a segunda concessão para o mesmo pedido
    // cai aqui. Isso é recusa com nome, não erro — renovar é OUTRO ato.
    const msg = e instanceof Error ? e.message : "erro";
    if (/unique|constraint/i.test(msg)) {
      return recusar("ja_existe", `o pedido ${clientRequestId} já tem isenção — renovar é outro ato, não uma segunda linha`);
    }
    return recusar("escrita_falhou", `não consegui gravar a isenção (${msg})`);
  }
}
