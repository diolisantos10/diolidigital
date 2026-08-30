// O CONTRATO DA PORTA DO DIOLI CONNECT — o que entra, o que sai, e as travas.
//
// ─── POR QUE ESTE ARQUIVO EXISTE SEPARADO DA ROTA ──────────────────────────
//
// A rota HTTP (`app/api/connect/despacho/route.ts`) é casca: autentica, lê o
// corpo, monta as dependências e responde. TODA a decisão — o que é aceito, o
// que é recusado e com que motivo — mora aqui, em código puro, sem Prisma e
// sem rede. Portão que só existe dentro de uma rota Next não é testável nas
// duas metades (o que barra E o que deixa passar), e portão sem as duas
// metades é enfeite.
//
// ─── A DETERMINAÇÃO QUE VIRA CÓDIGO ────────────────────────────────────────
//
// Ordem do CEO (30/08/2026), literal:
//
//   "Mantenha o piloto no SDR da Dioli Digital, exclusivamente em homologação,
//    com cliente e dados sintéticos. A D-006 impede operação real, não este
//    teste de recuperação."
//
// Homologação e sintético NÃO são parâmetros com padrão. São condição de
// abertura: `modo` tem que ser a string `"homologacao"` e `sintetico` tem que
// ser o booleano `true`. Ausente, nulo, `"true"` em texto, `1`, qualquer outra
// coisa — recusa NOMEADA. Um padrão silencioso aqui seria a porta abrindo em
// produção porque alguém esqueceu um campo, que é exatamente o modo de falha
// que o guardrail 4 da casa proíbe ("prompt é aviso; código é trava").
//
// ─── A HOMOLOGAÇÃO FINAL (30/08/2026): DUAS TRAVAS NOVAS AQUI ──────────────
//
// **A função virou lista de uma.** Era campo livre com padrão silencioso
// (`texto(corpo.funcao) ?? FUNCAO_DO_PILOTO`) — quem chamasse podia despachar
// QUALQUER ficha do catálogo por esta porta, e quem mandasse lixo no campo
// (um número, um objeto) caía no padrão sem saber. O piloto foi aprovado para
// UMA função, e agora a porta só conhece essa uma: qualquer outra é recusada
// **com o nome pedido no motivo**, para quem chama saber o que fez.
//
// **O cliente saiu do corpo do pedido, inteiro.** Este arquivo já não lê
// `clienteId` nem `cliente`. Antes o chamador mandava o id e a porta confiava —
// o "id aceito sem conferir de quem é", o padrão nº 2 do raio-x desta casa. A
// determinação do CEO foi resolver internamente, e é o que
// `cliente-de-homologacao.ts` faz: o gateway vai ao banco e escolhe sozinho o
// cliente sintético. Aqui a única regra que sobra é a mais dura de todas —
// **campo de cliente presente no corpo é RECUSA**, não um campo ignorado em
// silêncio. Ignorar deixaria quem chama achando que escolheu; recusar diz na
// cara que essa escolha não existe mais.

import type { Cobranca } from "@/lib/agency/pm/varredura";

/** O modo é literal e único. Não existe padrão. */
export const MODO_EXIGIDO = "homologacao" as const;

/** A função do piloto — o Gerente de Atendimento e SDR. */
export const FUNCAO_DO_PILOTO = "manager-atendimento";

/**
 * A LISTA DE UMA. Não é um padrão, é um conjunto fechado: o que não está aqui
 * não atravessa. É lista (e não uma comparação com a constante) porque a forma
 * do código tem que dizer a regra — o dia em que o CEO liberar uma segunda
 * função, o conserto é acrescentar um item, e a trava continua sendo a lista.
 */
export const FUNCOES_PERMITIDAS: readonly string[] = [FUNCAO_DO_PILOTO];

/**
 * Os campos de cliente que ESTA PORTA NÃO ACEITA MAIS. Presentes no corpo, a
 * resposta é recusa nomeada — nunca um "ignorei e segui".
 */
export const CAMPOS_DE_CLIENTE_PROIBIDOS = ["clienteId", "cliente"] as const;

/** Um turno do fio: quem falou e o que disse. */
export interface TurnoDoFio {
  de: "diretor-geral" | "gerente";
  texto: string;
}

/** O pedido, como ele chega pela porta. Tudo `unknown` — nada é confiado. */
export interface PedidoDeDespacho {
  modo?: unknown;
  sintetico?: unknown;
  funcao?: unknown;
  /**
   * ⛔ NÃO É ENTRADA. Declarados só para a porta poder RECUSAR quem os mandar.
   * O cliente sintético é resolvido pelo gateway (`cliente-de-homologacao.ts`).
   */
  cliente?: unknown;
  clienteId?: unknown;
  pergunta?: unknown;
  /** As entradas obrigatórias da ficha, com as chaves EXATAS que ela declara. */
  dossie?: unknown;
  /** O fio: os turnos anteriores desta mesma conversa. */
  historico?: unknown;
  /** O que a varredura do PM já classificou como parado (opcional). */
  cobrancas?: unknown;
  /** Gatilhos humanos que o chamador reconheceu — só tornam a porta MAIS estrita. */
  gatilhos?: unknown;
  /** O fio da conversa. Ausente = a porta abre um novo. */
  correlationId?: unknown;
}

/** O pedido depois de conferido — só existe se passou por todas as travas.
 *  Repare no que NÃO existe aqui: cliente e clienteId. Um pedido conferido não
 *  carrega cliente nenhum, porque o cliente não vem do pedido. */
export interface PedidoConferido {
  modo: typeof MODO_EXIGIDO;
  sintetico: true;
  funcao: string;
  pergunta: string;
  dossie: Record<string, string>;
  historico: TurnoDoFio[];
  cobrancas: Cobranca[];
  gatilhos: string[];
  correlationId?: string;
}

export type Conferencia =
  | { ok: true; pedido: PedidoConferido }
  | { ok: false; motivo: string };

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/**
 * A conferência do corpo. Fail-closed em cada campo: o que não é exatamente o
 * que se espera vira recusa com o motivo dito em português.
 */
export function conferirPedido(corpo: PedidoDeDespacho): Conferencia {
  // ── Trava 1: o modo. Literal, sem padrão, sem coerção. ───────────────────
  if (corpo.modo !== MODO_EXIGIDO) {
    return {
      ok: false,
      motivo:
        `modo inválido: recebi ${JSON.stringify(corpo.modo ?? null)} e esta porta só abre com ` +
        `"${MODO_EXIGIDO}". A D-006 impede operação real; o piloto roda em homologação e só nela.`,
    };
  }

  // ── Trava 2: sintético. O booleano `true`, não a string, não o número. ───
  if (corpo.sintetico !== true) {
    return {
      ok: false,
      motivo:
        `sintetico inválido: recebi ${JSON.stringify(corpo.sintetico ?? null)} e esta porta exige o ` +
        `booleano true. Dado real não entra em ensaio (determinação do CEO).`,
    };
  }

  // ── Trava 3: o cliente NÃO vem de quem chama. ────────────────────────────
  //
  // A recusa é por campo PRESENTE, não por valor errado: mesmo um `[TESTE]`
  // impecável é recusado, porque o defeito não era o valor — era a porta deixar
  // o chamador escolher. Conferir o valor manteria o furo com um filtro em
  // cima; tirar a entrada fecha o furo.
  for (const campo of CAMPOS_DE_CLIENTE_PROIBIDOS) {
    const enviado = (corpo as Record<string, unknown>)[campo];
    if (enviado === undefined) continue;
    return {
      ok: false,
      motivo:
        `"${campo}" não é mais entrada desta porta — recebi ${JSON.stringify(enviado)} e recusei. ` +
        `O cliente sintético de homologação é resolvido pelo próprio gateway, no banco, conferindo o carimbo de ` +
        `teste e o domínio de homologação na linha lida. Quem chama não escolhe cliente: o que o chamador não ` +
        `escolhe, ele não força. Remova "${campo}" do corpo — a resposta devolve o cliente que foi resolvido.`,
    };
  }

  // ── Trava 4: a função é uma lista de uma. ────────────────────────────────
  //
  // Ausente cai na única função permitida — e isso NÃO é o padrão silencioso de
  // antes: quando a lista tem um item só, "não escolher" e "escolher o único"
  // são a mesma coisa, e nenhuma segunda função fica alcançável por omissão.
  // O que mudou é que escolher OUTRA coisa deixou de ser possível.
  const funcaoPedida = corpo.funcao === undefined || corpo.funcao === null ? FUNCAO_DO_PILOTO : corpo.funcao;
  if (typeof funcaoPedida !== "string" || !FUNCOES_PERMITIDAS.includes(funcaoPedida)) {
    return {
      ok: false,
      motivo:
        `funcao ${JSON.stringify(funcaoPedida)} recusada: esta porta está presa a ` +
        `${FUNCOES_PERMITIDAS.map((f) => `"${f}"`).join(", ")} e não despacha nenhuma outra ficha. ` +
        `O piloto foi aprovado para essa função e só para ela.`,
    };
  }
  const funcao = funcaoPedida;

  const pergunta = texto(corpo.pergunta);
  if (!pergunta) {
    return { ok: false, motivo: "pergunta é obrigatória — a porta despacha uma pergunta, não um silêncio" };
  }

  // ── O dossiê: mapa de texto para texto, e nada além disso. ───────────────
  const dossie: Record<string, string> = {};
  if (corpo.dossie !== undefined && corpo.dossie !== null) {
    if (typeof corpo.dossie !== "object" || Array.isArray(corpo.dossie)) {
      return { ok: false, motivo: "dossie deve ser um objeto de chaves e textos" };
    }
    for (const [chave, valor] of Object.entries(corpo.dossie as Record<string, unknown>)) {
      if (typeof valor !== "string") {
        return { ok: false, motivo: `dossie["${chave}"] não é texto — o rastro guarda o que foi usado, não um objeto solto` };
      }
      dossie[chave] = valor;
    }
  }

  // ── O fio. ───────────────────────────────────────────────────────────────
  const historico: TurnoDoFio[] = [];
  if (corpo.historico !== undefined && corpo.historico !== null) {
    if (!Array.isArray(corpo.historico)) {
      return { ok: false, motivo: "historico deve ser uma lista de turnos" };
    }
    for (const [i, bruto] of corpo.historico.entries()) {
      const turno = bruto as { de?: unknown; texto?: unknown };
      const de = turno?.de;
      const conteudo = texto(turno?.texto);
      if (de !== "diretor-geral" && de !== "gerente") {
        return { ok: false, motivo: `historico[${i}].de deve ser "diretor-geral" ou "gerente"` };
      }
      if (!conteudo) return { ok: false, motivo: `historico[${i}].texto vazio — turno sem fala não é turno` };
      historico.push({ de, texto: conteudo });
    }
  }

  // ── As cobranças da varredura, se o chamador já as apurou. ───────────────
  const cobrancas: Cobranca[] = [];
  if (corpo.cobrancas !== undefined && corpo.cobrancas !== null) {
    if (!Array.isArray(corpo.cobrancas)) {
      return { ok: false, motivo: "cobrancas deve ser a lista que a varredura do PM devolve" };
    }
    for (const [i, bruto] of corpo.cobrancas.entries()) {
      const c = bruto as Partial<Cobranca>;
      if (!texto(c?.motivo) || !texto(c?.departamento) || !texto(c?.referencia) || !texto(c?.pedido)) {
        return { ok: false, motivo: `cobrancas[${i}] incompleta — motivo, departamento, referencia e pedido são obrigatórios` };
      }
      if (typeof c.horasParado !== "number" || !Number.isFinite(c.horasParado)) {
        return { ok: false, motivo: `cobrancas[${i}].horasParado deve ser número` };
      }
      cobrancas.push({
        motivo: c.motivo as Cobranca["motivo"],
        departamento: c.departamento!,
        referencia: c.referencia!,
        horasParado: c.horasParado,
        pedido: c.pedido!,
        reincidente: c.reincidente === true,
      });
    }
  }

  const gatilhos: string[] = [];
  if (corpo.gatilhos !== undefined && corpo.gatilhos !== null) {
    if (!Array.isArray(corpo.gatilhos)) return { ok: false, motivo: "gatilhos deve ser uma lista de textos" };
    for (const g of corpo.gatilhos) {
      const t = texto(g);
      if (t) gatilhos.push(t);
    }
  }

  return {
    ok: true,
    pedido: {
      modo: MODO_EXIGIDO,
      sintetico: true,
      funcao,
      pergunta,
      dossie,
      historico,
      cobrancas,
      gatilhos,
      correlationId: texto(corpo.correlationId) ?? undefined,
    },
  };
}
