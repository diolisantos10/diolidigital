// O PORTÃO DE PAGAMENTO — a trava entre o dinheiro e a produção.
//
// ─── A REGRA, DO CEO, LITERAL ────────────────────────────────────────────────
//
//   "O cliente fecha um projeto com a gente, ele vai ter que pagar antes de o
//    projeto começar a ser feito. Eu vou pedir pra fazer um bolo, e só pago o
//    bolo quando o bolo está feito? Não — eu preciso do dinheiro pra comprar os
//    insumos. Então a trava é o pagamento."
//
// Nenhuma produção começa antes do pagamento confirmado. Sem pagamento: sem
// peça, sem arte, sem token gasto, sem tarefa de especialista rodando.
//
// ─── O QUE FICA FORA DA TRAVA, DE PROPÓSITO ──────────────────────────────────
//
// A CONVERSA COMERCIAL. O SDR atende, entende, orça e propõe ANTES de qualquer
// pagamento — é a vitrine, e fechar a vitrine é fechar a loja. Este portão não
// é chamado de `app/api/sdr/*` nem de `lib/agency/comercial/*`, e o teste de
// classe (`__tests__/financeiro/portao-de-pagamento.test.ts`) prova que os
// caminhos que ele guarda são os que GASTAM, não os que vendem.
//
// ─── ONDE ELE FICA ───────────────────────────────────────────────────────────
//
// No caminho que gasta, nunca numa tela. Prompt é aviso; código é trava. Dois
// pontos, porque são dois caminhos independentes até a fatura:
//
//   1. `lib/agency/execution/run-execution.ts` — a esteira dos especialistas.
//      É o funil por onde passam os NOVE chamadores de produção (o botão, o
//      cron, o despertador, o portal, os marcos, o `produzir-agora`, o
//      `reset-request`, a `esteira`, o cliente-falso). Guardar aqui guarda os
//      nove de uma vez, e é por isso que o portão não foi espalhado por eles.
//   2. `lib/agency/execution/artes.ts` — o gerador de imagem. Ele NÃO passa por
//      `run-execution`: o despertador o chama direto, a cada 5 minutos, e cada
//      imagem custa ~US$0,17–0,25. Um portão só no item 1 deixaria a torneira
//      mais cara da casa aberta.
//
// ─── A TESTEMUNHA ────────────────────────────────────────────────────────────
//
// `PagamentoConfirmado`, e só ela. O porquê de não ser outra coisa está no
// docstring do model em `prisma/schema.prisma`; o resumo é que
// `ClientRequestDb.status = "in_progress"` é escrito por três caminhos, dois
// dos quais não cobram nada — usá-lo como prova de dinheiro seria ler "não
// recusou" como "pagou", que é a família de defeito que esta casa já pagou caro.
//
// ─── FALHA FECHADA, SEM EXCEÇÃO ──────────────────────────────────────────────
//
// Pedido sem id, pedido inexistente, registro ausente, valor zerado, banco fora
// do ar, exceção inesperada — TUDO recusa. Não existe caminho neste arquivo em
// que um erro vire liberação. `conferirPagamento` NUNCA lança: ela devolve
// recusa, porque um `throw` que alguém envolva num `.catch(() => liberado)` lá
// na frente é a trava desfeita por um catch distraído.

import { prisma } from "@/lib/db/client";

/**
 * ── O CORTE DE VIGÊNCIA (a anistia declarada) ──────────────────────────────
 *
 * A casa nunca registrou pagamento. No dia em que este portão sobe, NENHUM
 * pedido existente tem linha em `PagamentoConfirmado` — inclusive os dos
 * clientes que pagaram de verdade, por Pix, no WhatsApp, meses atrás. Ligar a
 * régua sem corte pararia a agência inteira e puniria justamente quem faturou.
 *
 * Então o corte é EXPLÍCITO, DATADO e de mão única: pedido criado ANTES desta
 * data produz como sempre produziu; pedido criado DEPOIS precisa de prova.
 *
 * ⚠️ Isto NÃO é "ausência de informação vira permissão". É uma anistia única,
 * escrita, com data, que envelhece sozinha: ela não alcança nenhum pedido novo,
 * e o conjunto que ela cobre só encolhe. Cada liberação por este caminho sai
 * rotulada como `anterior_ao_portao` — nunca como `pagamento_confirmado` — para
 * que ninguém confunda "não conferimos" com "conferimos e pagou".
 *
 * Para encerrar a anistia: registre o pagamento dos clientes antigos (origem
 * `manual`) e mova esta data para o passado. Não mexa nela para "destravar" um
 * pedido novo — para isso existe o registro manual, que tem dono e valor.
 *
 * ⚠️ ELA NUNCA PODE IR PARA A FRENTE. Um corte no futuro daria anistia a TODO
 * pedido novo — o portão continuaria compilando, os testes continuariam verdes
 * e a trava seria um enfeite, em silêncio. É a pior falha possível aqui, e por
 * isso `__tests__/financeiro/portao-de-pagamento.test.ts` tem um teste só para
 * ela: o corte não pode estar mais de 24h à frente de agora.
 */
export const CORTE_DO_PORTAO_DE_PAGAMENTO = new Date("2026-08-25T00:00:00.000Z");

export type MotivoDeLiberacao =
  | "pagamento_confirmado"
  | "anterior_ao_portao"
  /** Parceria isenta e VIGENTE. Libera a esteira sem afirmar que houve
   *  dinheiro — ver `IsencaoDeParceria` no schema. */
  | "parceria_isenta";

export type MotivoDeRecusa =
  | "pedido_ausente"
  | "pedido_nao_encontrado"
  | "sem_registro_de_pagamento"
  | "valor_nao_positivo"
  /** Havia isenção de parceria, mas ela VENCEU. Diferente de nunca ter havido:
   *  o operador precisa saber que existiu e acabou, para renovar ou cobrar. */
  | "parceria_vencida"
  | "leitura_indisponivel";

export type VereditoDePagamento =
  | { liberado: true; motivo: MotivoDeLiberacao; detalhe: string }
  | { liberado: false; motivo: MotivoDeRecusa; detalhe: string; mensagemAoCliente: string };

/**
 * ── A INSTRUÇÃO GÊMEA ──────────────────────────────────────────────────────
 *
 * Toda proibição precisa da instrução gêmea: proibição sem alternativa empurra
 * o operador para o contorno. Cada recusa diz, em português de gente, o que
 * está acontecendo E o que fazer para liberar. Nada de código de erro, nada de
 * "verifique o status" — o que a pessoa precisa saber é onde está o dinheiro e
 * quem destrava.
 */
const INSTRUCAO_GEMEA: Record<MotivoDeRecusa, string> = {
  pedido_ausente:
    "Este projeto ainda não está ligado a um pedido, então não há o que cobrar nem o que liberar. " +
    "A produção só começa depois que o pedido existe e está pago. " +
    "Fale com a Dioli no WhatsApp que a gente abre o pedido e te manda o link de pagamento.",

  pedido_nao_encontrado:
    "Não encontramos o pedido deste projeto, então não conseguimos confirmar o pagamento — e sem essa confirmação a produção não começa. " +
    "Fale com a Dioli no WhatsApp: a gente localiza o pedido e reabre a produção no mesmo dia.",

  sem_registro_de_pagamento:
    "Este projeto está aguardando o pagamento. A produção começa assim que o pagamento for confirmado — é com ele que a gente compra os insumos do trabalho. " +
    "Se você já pagou por Pix ou transferência, mande o comprovante para a Dioli no WhatsApp que a gente confirma e libera na hora. " +
    "Se ainda não pagou, peça o link de pagamento por lá.",

  // A parceria acabou. O cliente NÃO leva bronca — ele não fez nada errado, e o
  // combinado tinha data desde o começo. A instrução gêmea aponta a renovação,
  // que é a próxima ação de verdade, e nomeia gente.
  parceria_vencida:
    "A parceria que cobria este projeto chegou ao fim da validade combinada, então a produção fica aguardando. " +
    "Fale com a Dioli no WhatsApp: dá para renovar a parceria ou seguir com um dos planos — a gente resolve por lá.",

  valor_nao_positivo:
    "O pagamento deste projeto está registrado com valor zerado, e valor zerado não é pagamento. " +
    "A produção fica aguardando. Mande o comprovante para a Dioli no WhatsApp que a gente corrige o registro e libera.",

  leitura_indisponivel:
    "Não conseguimos confirmar o pagamento deste projeto agora — o sistema de cobrança não respondeu. " +
    "A produção fica aguardando de propósito: preferimos esperar a produzir sem ter certeza de que o pagamento entrou. " +
    "Vamos tentar de novo automaticamente. Se estiver com pressa, chame a Dioli no WhatsApp.",
};

function recusar(motivo: MotivoDeRecusa, detalhe: string): VereditoDePagamento {
  return { liberado: false, motivo, detalhe, mensagemAoCliente: INSTRUCAO_GEMEA[motivo] };
}

/**
 * O portão. Devolve se ESTE pedido pode gastar dinheiro da casa.
 *
 * NUNCA LANÇA. Toda saída é um veredito, e o veredito de qualquer coisa que
 * não seja uma prova positiva é recusa.
 */
export async function conferirPagamento(
  clientRequestId: string | null | undefined,
): Promise<VereditoDePagamento> {
  if (!clientRequestId) {
    return recusar("pedido_ausente", "produção pedida sem `clientRequestId` — não há pedido a que ligar o pagamento");
  }

  // ── A LEITURA, EM DUAS ETAPAS E NESTA ORDEM ──────────────────────────────
  //
  // Primeiro a TESTEMUNHA, sozinha. Só se ela não existir é que se pergunta a
  // data do pedido (que só serve para a anistia). Isso não é micro-otimização:
  // é o caminho do cliente PAGANTE não depender de uma segunda tabela para
  // nada. Quanto menos coisa a liberação toca, menos coisa pode derrubá-la.
  //
  // Um `.catch(() => null)` aqui seria catastrófico: `null` na testemunha é
  // indistinguível de "não pagou", e `null` no pedido cairia na anistia por
  // falta de data. Banco tossindo tem de virar `leitura_indisponivel` — que é
  // uma recusa, nunca uma liberação, e nunca um "não pagou" definitivo que o
  // operador iria caçar no lugar errado.
  let pagamento: { valorCentavos: number; origem: string; confirmadoEm: Date } | null;
  try {
    pagamento = await prisma.pagamentoConfirmado.findUnique({
      where: { clientRequestId },
      select: { valorCentavos: true, origem: true, confirmadoEm: true },
    });
  } catch (e) {
    return recusar(
      "leitura_indisponivel",
      `não consegui ler a testemunha de pagamento (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui`,
    );
  }

  // ── PROVA POSITIVA ───────────────────────────────────────────────────────
  // A existência da linha é a prova. E o valor tem de ser DINHEIRO: `> 0`.
  //
  // ⚠️ O defeito irmão que esta casa já viu em outro produto foi "teto 0" lido
  // como "sem limite". Aqui, zero centavos é ZERO — não é "valor não informado"
  // e muito menos "liberado". Negativo, idem: estorno não é pagamento.
  if (pagamento) {
    if (!Number.isFinite(pagamento.valorCentavos) || pagamento.valorCentavos <= 0) {
      return recusar(
        "valor_nao_positivo",
        `registro de pagamento com valorCentavos=${pagamento.valorCentavos} — zero e negativo não são dinheiro`,
      );
    }
    return {
      liberado: true,
      motivo: "pagamento_confirmado",
      detalhe: `pago via ${pagamento.origem}: R$ ${(pagamento.valorCentavos / 100).toFixed(2)} em ${pagamento.confirmadoEm.toISOString().slice(0, 10)}`,
    };
  }

  // ── A TERCEIRA TESTEMUNHA: A PARCERIA (27/08/2026) ───────────────────────
  //
  // O primeiro cliente real da agência (Foocci) entra por parceria e não paga
  // nada. Ele travava aqui — e o portão estava certo.
  //
  // ⚠️ ELA VEM **DEPOIS** DO PAGAMENTO, E ISSO IMPORTA: quem pagou é liberado
  // por ter pagado, sempre. A isenção nunca reescreve a razão de um pagante.
  //
  // ⛔ E ELA NÃO É UM PAGAMENTO. Não há linha em `PagamentoConfirmado`, não há
  // receita, e o motivo devolvido é `parceria_isenta` — outra palavra, de
  // propósito, para que o financeiro NUNCA some isto como venda. *Parceria não
  // é grátis: é investimento, e investimento se mede.*
  //
  // As duas travas que a fazem não virar porta escancarada:
  //   • **dono** — `autorizadaPor` é obrigatório no schema. Isenção sem dono é
  //     buraco: em seis meses ninguém sabe quem liberou.
  //   • **validade** — `validaAte` é obrigatório. Parceria eterna vira
  //     esquecimento, e a casa produz de graça anos depois do combinado. Uma
  //     isenção vencida NÃO libera: devolve `parceria_vencida`, que é uma
  //     recusa com nome próprio — o operador precisa saber que existiu e acabou.
  //
  // Fail-closed como o resto: leitura que falha é recusa, nunca liberação.
  let isencao: { autorizadaPor: string; validaAte: Date; escopo: string } | null;
  try {
    isencao = await prisma.isencaoDeParceria.findUnique({
      where: { clientRequestId },
      select: { autorizadaPor: true, validaAte: true, escopo: true },
    });
  } catch (e) {
    return recusar(
      "leitura_indisponivel",
      `não consegui ler a isenção de parceria (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui`,
    );
  }

  if (isencao) {
    const agora = new Date();
    if (!(isencao.validaAte instanceof Date) || Number.isNaN(isencao.validaAte.getTime())) {
      // Data ilegível não é "vale para sempre". Sem validade conferível, não há
      // isenção — o mesmo princípio do "sem data legível, sem anistia".
      return recusar(
        "parceria_vencida",
        `isenção de parceria com validade ilegível (autorizada por ${isencao.autorizadaPor}) — sem validade conferível não há isenção`,
      );
    }
    if (isencao.validaAte.getTime() < agora.getTime()) {
      return recusar(
        "parceria_vencida",
        `isenção de parceria venceu em ${isencao.validaAte.toISOString().slice(0, 10)} ` +
          `(autorizada por ${isencao.autorizadaPor}) — renovar ou passar a cobrar`,
      );
    }
    return {
      liberado: true,
      motivo: "parceria_isenta",
      detalhe:
        `parceria isenta autorizada por ${isencao.autorizadaPor}, válida até ` +
        `${isencao.validaAte.toISOString().slice(0, 10)} — escopo: ${isencao.escopo}. ` +
        "NÃO houve pagamento: receita R$ 0,00, custo real, margem negativa assumida.",
    };
  }

  // Sem testemunha: só resta perguntar se este pedido é anterior ao corte.
  let pedido: { createdAt: Date } | null;
  try {
    pedido = await prisma.clientRequestDb.findUnique({
      where: { id: clientRequestId },
      select: { createdAt: true },
    });
  } catch (e) {
    return recusar(
      "leitura_indisponivel",
      `não consegui ler o pedido para decidir a anistia (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui`,
    );
  }

  // ── A ANISTIA, e só ela ──────────────────────────────────────────────────
  // Pedido que a casa não achou NÃO recebe anistia: sem `createdAt` não há como
  // dizer que ele é anterior ao corte, e "não sei a data" jamais vira "é antigo".
  if (!pedido) {
    return recusar("pedido_nao_encontrado", `pedido ${clientRequestId} não existe na base`);
  }
  if (pedido.createdAt < CORTE_DO_PORTAO_DE_PAGAMENTO) {
    return {
      liberado: true,
      motivo: "anterior_ao_portao",
      detalhe:
        `pedido criado em ${pedido.createdAt.toISOString().slice(0, 10)}, antes do corte ` +
        `(${CORTE_DO_PORTAO_DE_PAGAMENTO.toISOString().slice(0, 10)}) — liberado pela anistia declarada, ` +
        `NÃO por pagamento conferido`,
    };
  }

  return recusar(
    "sem_registro_de_pagamento",
    `pedido ${clientRequestId} criado em ${pedido.createdAt.toISOString().slice(0, 10)} não tem linha em PagamentoConfirmado`,
  );
}

/**
 * Registra que o dinheiro entrou. ÚNICO caminho de escrita da testemunha.
 *
 * Idempotente por `clientRequestId` (o gateway reenvia webhook): a segunda vez
 * cai no mesmo registro em vez de criar um segundo. Recusa valor não positivo
 * na ESCRITA também — uma linha de R$ 0,00 não deve nem nascer.
 */
export async function registrarPagamento(entrada: {
  clientRequestId: string;
  origem: "mercadopago" | "manual";
  valorCentavos: number;
  provedorId?: string | null;
  moeda?: string;
  confirmadoEm?: Date;
  /** Obrigatório quando `origem = "manual"`: registro manual sempre tem dono. */
  registradoPor?: string | null;
  observacao?: string | null;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!entrada.clientRequestId) return { ok: false, motivo: "sem clientRequestId" };
  if (!Number.isFinite(entrada.valorCentavos) || entrada.valorCentavos <= 0) {
    return { ok: false, motivo: `valor não positivo (${entrada.valorCentavos}) — zero não é pagamento` };
  }
  if (entrada.origem === "manual" && !entrada.registradoPor) {
    return { ok: false, motivo: "registro manual sem dono — quem confirmou tem de estar na linha" };
  }

  const dados = {
    origem: entrada.origem,
    provedorId: entrada.provedorId ?? null,
    valorCentavos: Math.round(entrada.valorCentavos),
    moeda: entrada.moeda ?? "BRL",
    confirmadoEm: entrada.confirmadoEm ?? new Date(),
    registradoPor: entrada.registradoPor ?? null,
    observacao: entrada.observacao ?? null,
  };

  try {
    await prisma.pagamentoConfirmado.upsert({
      where: { clientRequestId: entrada.clientRequestId },
      // Reenvio do gateway não reescreve o que já está confirmado: o primeiro
      // registro é o que vale. Atualizar aqui deixaria um webhook repetido (ou
      // atrasado) sobrescrever valor e data de um pagamento já auditado.
      update: {},
      create: { clientRequestId: entrada.clientRequestId, ...dados },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "falha ao gravar" };
  }
}

/**
 * O portão para quem só tem o CLIENTE na mão.
 *
 * ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Nem todo caminho de produção carrega o `clientRequestId`. O post do cliente
 * DIRETO nasce com ele nulo (`publicacao.ts`), e a refação pedida pelo portal
 * às vezes chega só com o `clientId`. Recusar por ausência de chave ali seria
 * barrar o cliente-piloto inteiro — e uma trava que barra quem pagou não é
 * rigor, é defeito.
 *
 * Então a chave é DERIVADA: o pedido mais recente do cliente que tem projeto.
 * Derivação, nunca invenção — não achando nada, o veredito é o de
 * `conferirPagamento(null)`, que é RECUSA. Ausência de vínculo continua sendo
 * ausência de prova.
 *
 * Como `conferirPagamento`, NUNCA lança.
 */
export async function conferirPagamentoDaAncora(ancora: {
  clientRequestId?: string | null;
  clientId?: string | null;
}): Promise<VereditoDePagamento> {
  if (ancora.clientRequestId) return conferirPagamento(ancora.clientRequestId);
  if (!ancora.clientId) return conferirPagamento(null);

  // 1. O pedido mais recente DESTE cliente. Derivação, nunca invenção.
  //
  // `try` e não só `.catch`: um driver sem a relação estoura de forma SÍNCRONA,
  // e aí um `.catch` pendurado no fim da cadeia não pega. Falha de leitura vira
  // recusa explícita — degradar para parado, jamais para gastando.
  try {
    const pedido = await prisma.clientRequestDb.findFirst({
      where: { clientId: ancora.clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (pedido) return conferirPagamento(pedido.id);
  } catch (e) {
    return recusar(
      "leitura_indisponivel",
      `não consegui procurar o pedido do cliente ${ancora.clientId} (${e instanceof Error ? e.message : "erro"})`,
    );
  }

  // 2. O CLIENTE DIRETO: criado à mão pelo time, sem pedido nenhum (é o caso do
  //    piloto). Não existe pedido a que ligar um pagamento, e inventar um seria
  //    pior que não ter portão. O que existe é a IDADE do cadastro — e ela cai
  //    na mesma anistia declarada, pela mesma razão: o cliente que já estava na
  //    casa antes do portão não pode ser parado por uma régua que nasceu depois
  //    dele. Cliente direto criado DEPOIS do corte não passa: quem abre cliente
  //    novo à mão agora abre com pedido e com pagamento.
  let cliente: { createdAt: Date } | null;
  try {
    cliente = await prisma.client.findUnique({
      where: { id: ancora.clientId },
      select: { createdAt: true },
    });
  } catch (e) {
    return recusar(
      "leitura_indisponivel",
      `não consegui ler o cadastro do cliente ${ancora.clientId} (${e instanceof Error ? e.message : "erro"})`,
    );
  }
  if (cliente?.createdAt && cliente.createdAt < CORTE_DO_PORTAO_DE_PAGAMENTO) {
    return {
      liberado: true,
      motivo: "anterior_ao_portao",
      detalhe:
        `cliente direto ${ancora.clientId}, cadastrado em ${cliente.createdAt.toISOString().slice(0, 10)}, ` +
        `antes do corte — liberado pela anistia declarada, NÃO por pagamento conferido`,
    };
  }
  // Sem data legível, sem anistia. "Não sei quando" jamais vira "é antigo".
  return recusar(
    "sem_registro_de_pagamento",
    `cliente ${ancora.clientId} não tem pedido nem pagamento, e o cadastro não é anterior ao corte`,
  );
}
