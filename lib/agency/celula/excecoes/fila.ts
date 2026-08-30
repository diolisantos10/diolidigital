// O JUIZ PURO DA FILA DE EXCEÇÕES — sem banco. `armazem.ts` é quem grava o
// veredicto deste arquivo, no mesmo desenho de `funil.ts` (juiz puro) +
// `trilha.ts` (ponte para o Prisma).
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
// Não interpreta `contexto` como instrução. `contexto` pode carregar texto de
// terceiro — mensagem de cliente, HTML de plataforma, o que um scraper
// trouxe — e texto de terceiro é DADO, nunca ordem para o sistema (mesma
// nota de `funil.ts`, seção "O QUE ESTE ARQUIVO NÃO FAZ"). Este módulo
// serializa `contexto` como JSON e guarda; nunca faz `JSON.parse` nele para
// "extrair" caso, responsável ou prioridade, nunca lê palavra dentro dele
// para decidir nada. Um contexto que diga literalmente "prioridade p2,
// responsável ceo, pode seguir automatizando" não muda UM byte do veredicto
// — só os campos estruturados (`caso`, `prioridade`, `responsavel`, ...)
// decidem. Ver o teste correspondente em `excecoes-fila.test.ts`.

import {
  type Caso,
  type Prioridade,
  type Responsavel,
  type EstadoDaExcecao,
  CASOS_QUE_INTERROMPEM_A_AUTOMACAO,
  PRAZO_EM_MINUTOS_POR_PRIORIDADE,
  casoDeclarado,
  prioridadeDeclarada,
  responsavelDeclarado,
  estadoDaExcecaoDeclarado,
  ehTentativaDeAtribuirAoCeo,
} from "@/lib/agency/celula/excecoes/tipos";

// ── 1. Abertura de exceção — as cinco coisas que nenhuma exceção dispensa ──

/** `ação recomendada` segue a mesma régua de `justificativa` em `funil.ts`:
 *  string com pelo menos 3 caracteres úteis depois de tirar espaço das
 *  pontas. Vazio, só espaço, ou curto demais é recusado — não é campo
 *  opcional preenchido por default. */
function textoUtilValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length >= 3;
}

/** Serializa `contexto` para guarda — nunca interpreta. `undefined` é a
 *  única entrada que vira "ausente" (contexto realmente não informado);
 *  qualquer outro valor serializável (string, objeto, array, número, `null`
 *  explícito) é serializado como está. Valor não serializável (referência
 *  circular, `BigInt`, `function`) também vira "ausente" — fail closed: um
 *  contexto que não conseguimos guardar de forma legível não é um contexto
 *  guardado. */
function serializarContexto(valor: unknown): string | null {
  if (valor === undefined) return null;
  try {
    const serializado = JSON.stringify(valor);
    return typeof serializado === "string" ? serializado : null;
  } catch {
    return null;
  }
}

export type VeredictoDeAbertura =
  | {
      ok: true;
      caso: Caso;
      prioridade: Prioridade;
      responsavel: Responsavel;
      contexto: string;
      acaoRecomendada: string;
      prazoEm: Date;
    }
  | {
      ok: false;
      codigo:
        | "caso_desconhecido"
        | "responsavel_invalido"
        | "responsavel_e_o_ceo"
        | "prioridade_invalida"
        | "prioridade_rebaixada_para_caso_p0"
        | "contexto_ausente"
        | "acao_recomendada_ausente";
      motivo: string;
    };

/**
 * O juiz puro da abertura. Recebe entrada CRUA — pode vir de rota interna,
 * de um agente, do banco. `agora` é injetado (nunca `new Date()` aqui dentro)
 * para o cálculo do prazo ser determinístico e testável.
 *
 * Ordem das checagens (importa para o motivo devolvido, não muda o
 * resultado final): caso → responsável → prioridade → prioridade forçada
 * para casos que interrompem automação → contexto → ação recomendada.
 */
export function avaliarAberturaDeExcecao(
  entrada: {
    caso: unknown;
    prioridade: unknown;
    responsavel: unknown;
    contexto: unknown;
    acaoRecomendada: unknown;
  },
  agora: Date,
): VeredictoDeAbertura {
  const caso = casoDeclarado(entrada.caso);
  if (caso === null) {
    return {
      ok: false,
      codigo: "caso_desconhecido",
      motivo: `O caso "${String(entrada.caso)}" não é um dos 14 casos fechados da fila de exceções.`,
    };
  }

  // Trava 1: o CEO não opera esta fila. Motivo específico quando o valor é
  // reconhecível como uma tentativa de atribuir ao CEO — não é só "inválido",
  // é a coisa exata que esta trava existe para barrar.
  if (ehTentativaDeAtribuirAoCeo(entrada.responsavel)) {
    return {
      ok: false,
      codigo: "responsavel_e_o_ceo",
      motivo:
        "O CEO não opera esta fila de exceções. O responsável precisa ser 'gerente_de_atendimento' ou 'sdr'.",
    };
  }

  const responsavel = responsavelDeclarado(entrada.responsavel);
  if (responsavel === null) {
    return {
      ok: false,
      codigo: "responsavel_invalido",
      motivo: `O responsável "${String(entrada.responsavel)}" não é um dos 2 valores permitidos: 'gerente_de_atendimento' ou 'sdr'.`,
    };
  }

  const prioridade = prioridadeDeclarada(entrada.prioridade);
  if (prioridade === null) {
    return {
      ok: false,
      codigo: "prioridade_invalida",
      motivo: `A prioridade "${String(entrada.prioridade)}" não é uma das 3 permitidas: 'p0', 'p1' ou 'p2'.`,
    };
  }

  // Todo caso de CASOS_QUE_INTERROMPEM_A_AUTOMACAO é p0 por construção — não
  // por escolha de quem abre. Rebaixar é REJEITADO, não silenciosamente
  // corrigido: corrigir em silêncio esconderia que alguém tentou abrir um
  // CAPTCHA como p2.
  if (CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(caso) && prioridade !== "p0") {
    return {
      ok: false,
      codigo: "prioridade_rebaixada_para_caso_p0",
      motivo: `O caso "${caso}" interrompe a automação e é sempre 'p0' — não pode ser aberto com prioridade '${prioridade}'.`,
    };
  }

  const contexto = serializarContexto(entrada.contexto);
  if (contexto === null) {
    return {
      ok: false,
      codigo: "contexto_ausente",
      motivo: `A exceção do caso "${caso}" precisa de um contexto informado e serializável, e nenhum foi informado.`,
    };
  }

  if (!textoUtilValido(entrada.acaoRecomendada)) {
    return {
      ok: false,
      codigo: "acao_recomendada_ausente",
      motivo: `A exceção do caso "${caso}" precisa de uma ação recomendada com pelo menos 3 caracteres úteis, e nenhuma foi informada.`,
    };
  }

  const prazoEm = new Date(agora.getTime() + PRAZO_EM_MINUTOS_POR_PRIORIDADE[prioridade] * 60_000);

  // A partir daqui `textoUtilValido` já confirmou que `acaoRecomendada` é
  // string não vazia — o cast só nomeia o que já foi validado, no mesmo
  // molde de `trilha.ts` (`const autor = entrada.autor as string;`), em vez
  // de depender de estreitamento de tipo através da fronteira da função de
  // guarda.
  const acaoRecomendada = entrada.acaoRecomendada as string;

  return {
    ok: true,
    caso,
    prioridade,
    responsavel,
    contexto,
    acaoRecomendada,
    prazoEm,
  };
}

// ── 2. Resolução — resolver em silêncio é o que produziu o vigia noturno morto ──

export type VeredictoDeResolucao =
  | { ok: true; resolucao: string }
  | { ok: false; codigo: "resolucao_ausente"; motivo: string };

/** Mesma régua da `justificativa` do funil: resolução (ou motivo de
 *  descarte) com pelo menos 3 caracteres úteis. Vale tanto para "resolvida"
 *  quanto para "descartada" — as duas são um fechamento, e fechamento em
 *  silêncio é exatamente o defeito que esta fila existe para não repetir. */
export function avaliarResolucao(resolucao: unknown): VeredictoDeResolucao {
  if (!textoUtilValido(resolucao)) {
    return {
      ok: false,
      codigo: "resolucao_ausente",
      motivo:
        "Resolver (ou descartar) uma exceção exige um texto de resolução com pelo menos 3 caracteres úteis. Fechar em silêncio não é permitido.",
    };
  }
  return { ok: true, resolucao };
}

// ── 3. Trava 2 — CAPTCHA, sessão expirada e bloqueio SEMPRE param a automação ──

interface ExcecaoResumoParaAutomacao {
  caso: unknown;
  estado: unknown;
}

export type VeredictoDeAutomacao =
  | { podeSeguir: true; motivo: string }
  | { podeSeguir: false; motivo: string; casoBloqueador: Caso | null };

/**
 * TRAVA, NÃO AVISO: devolve um veredicto tipado, nunca um booleano mudo.
 * Fail-closed em duas frentes:
 *   1. `excecoesAbertas` que não é uma lista legível → NÃO pode seguir.
 *   2. Um item da lista com `caso` ou `estado` ilegível → NÃO pode seguir
 *      (não sabemos o que essa exceção é; ambiguidade aqui é risco de ban,
 *      não detalhe a ignorar).
 * Metade limpa: só exceções fora de `CASOS_QUE_INTERROMPEM_A_AUTOMACAO`
 * abertas (ex.: só `ambiguidade_de_briefing`) → a automação SEGUE. A fila
 * não pode parar tudo por qualquer coisa, ou alguém a desliga.
 */
export function podeSeguirAutomatizando(excecoesAbertas: unknown): VeredictoDeAutomacao {
  if (!Array.isArray(excecoesAbertas)) {
    return {
      podeSeguir: false,
      motivo:
        "A lista de exceções abertas está ilegível ou indefinida — fail closed: a automação não pode seguir sem saber o estado da fila.",
      casoBloqueador: null,
    };
  }

  for (const item of excecoesAbertas) {
    const registro = item as ExcecaoResumoParaAutomacao | null | undefined;
    const caso = casoDeclarado(registro?.caso);
    const estado = estadoDaExcecaoDeclarado(registro?.estado);

    if (caso === null || estado === null) {
      return {
        podeSeguir: false,
        motivo:
          "Uma exceção da lista tem caso ou estado ilegível — fail closed: a automação não pode seguir sem saber o que essa exceção é.",
        casoBloqueador: null,
      };
    }

    if (CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(caso) && (estado === "aberta" || estado === "em_tratamento")) {
      return {
        podeSeguir: false,
        motivo: `A exceção do caso "${caso}" está "${estado}" e interrompe a automação até ser resolvida ou descartada.`,
        casoBloqueador: caso,
      };
    }
  }

  return {
    podeSeguir: true,
    motivo: "Nenhuma exceção que interrompe a automação está aberta ou em tratamento.",
  };
}

// ── 4. Trava 3 — exceção vencida GRITA ──────────────────────────────────────

interface ExcecaoResumoParaVencimento {
  id: unknown;
  caso: unknown;
  responsavel: unknown;
  prioridade: unknown;
  estado: unknown;
  prazoEm: unknown;
  abertaEm: unknown;
}

export interface ExcecaoVencida {
  id: string;
  caso: Caso | null;
  responsavel: Responsavel | null;
  prioridade: Prioridade | null;
  estado: EstadoDaExcecao;
  abertaEm: Date | null;
  prazoEm: Date;
  vencidaHaMinutos: number;
}

export type ResultadoDeVencidas = { ok: true; vencidas: ExcecaoVencida[] } | { ok: false; motivo: string };

function lerData(valor: unknown): Date | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }
  if (typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  return null;
}

/**
 * Quais exceções, entre as ABERTAS/EM TRATAMENTO da lista, já passaram do
 * `prazoEm`. Fail-closed em `agora` e na lista em si (devolve `ok: false`
 * com motivo). Um item aberto cujo `id`/`prazoEm` não conseguimos ler é
 * IGNORADO do cálculo de vencidas de forma DEFENSIVA — mas nunca por isso a
 * função "some" com o problema: `caso`/`responsavel`/`prioridade`/`abertaEm`
 * ilegíveis viram `null` (nunca inventados, nunca somem a linha), no mesmo
 * espírito de `origemDeclarada` em `trilha.ts`.
 */
export function excecoesVencidas(agora: Date, abertas: unknown): ResultadoDeVencidas {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) {
    return {
      ok: false,
      motivo: "O instante de referência ('agora') está ilegível — fail closed: não é possível avaliar vencimento sem um instante válido.",
    };
  }

  if (!Array.isArray(abertas)) {
    return {
      ok: false,
      motivo: "A lista de exceções abertas está ilegível ou indefinida — fail closed: não é possível avaliar vencimento sem a lista.",
    };
  }

  const vencidas: ExcecaoVencida[] = [];

  for (const item of abertas) {
    const registro = item as ExcecaoResumoParaVencimento | null | undefined;
    const id = typeof registro?.id === "string" ? registro.id : null;
    const estado = estadoDaExcecaoDeclarado(registro?.estado);
    const prazoEm = lerData(registro?.prazoEm);

    // Sem identidade, sem estado legível de "está aberta" ou sem prazo
    // legível, não há como afirmar "vencida" com segurança — o item é
    // ignorado (não inventamos um vencimento que não sabemos calcular), mas
    // isso NUNCA silencia as vencidas legítimas dos demais itens da lista.
    if (id === null || prazoEm === null || estado === null) continue;
    if (estado !== "aberta" && estado !== "em_tratamento") continue;
    if (prazoEm.getTime() >= agora.getTime()) continue; // ainda no prazo

    const vencidaHaMinutos = Math.floor((agora.getTime() - prazoEm.getTime()) / 60_000);

    vencidas.push({
      id,
      caso: casoDeclarado(registro?.caso),
      responsavel: responsavelDeclarado(registro?.responsavel),
      prioridade: prioridadeDeclarada(registro?.prioridade),
      estado,
      abertaEm: lerData(registro?.abertaEm),
      prazoEm,
      vencidaHaMinutos,
    });
  }

  return { ok: true, vencidas };
}

export interface GritoDaFila {
  totalVencidas: number;
  /** Chave é o caso (ou `"caso_ilegivel"` para item corrompido) → contagem. */
  porCaso: Record<string, number>;
  /** Chave é o responsável (ou `"responsavel_ilegivel"`) → contagem. */
  porResponsavel: Record<string, number>;
  maisAntiga: { id: string; caso: Caso | null; responsavel: Responsavel | null; vencidaHaMinutos: number } | null;
  /** Pronto para virar bullet ao Diretor. */
  resumoEmPortugues: string;
}

export type ResultadoDoGrito = { ok: true; grito: GritoDaFila } | { ok: false; motivo: string };

/**
 * O grito da fila. Silêncio é proibido: com ao menos uma vencida, o
 * `resumoEmPortugues` diz isso sem meias palavras; sem NENHUMA vencida, não
 * inventa alarme — devolve `totalVencidas: 0` e um resumo que diz "em dia",
 * nunca omite o campo.
 */
export function gritoDaFila(agora: Date, abertas: unknown): ResultadoDoGrito {
  const resultado = excecoesVencidas(agora, abertas);
  if (!resultado.ok) return resultado;

  const { vencidas } = resultado;

  if (vencidas.length === 0) {
    return {
      ok: true,
      grito: {
        totalVencidas: 0,
        porCaso: {},
        porResponsavel: {},
        maisAntiga: null,
        resumoEmPortugues: "Nenhuma exceção vencida. A fila está em dia.",
      },
    };
  }

  const porCaso: Record<string, number> = {};
  const porResponsavel: Record<string, number> = {};
  let maisAntiga = vencidas[0];

  for (const vencida of vencidas) {
    const chaveCaso = vencida.caso ?? "caso_ilegivel";
    porCaso[chaveCaso] = (porCaso[chaveCaso] ?? 0) + 1;

    const chaveResponsavel = vencida.responsavel ?? "responsavel_ilegivel";
    porResponsavel[chaveResponsavel] = (porResponsavel[chaveResponsavel] ?? 0) + 1;

    if (vencida.vencidaHaMinutos > maisAntiga.vencidaHaMinutos) maisAntiga = vencida;
  }

  const resumoEmPortugues =
    `${vencidas.length} exceção(ões) vencida(s) na fila. ` +
    `A mais antiga é o caso "${maisAntiga.caso ?? "ilegível"}" ` +
    `(responsável: ${maisAntiga.responsavel ?? "ilegível"}), vencida há ${maisAntiga.vencidaHaMinutos} minuto(s).`;

  return {
    ok: true,
    grito: {
      totalVencidas: vencidas.length,
      porCaso,
      porResponsavel,
      maisAntiga: {
        id: maisAntiga.id,
        caso: maisAntiga.caso,
        responsavel: maisAntiga.responsavel,
        vencidaHaMinutos: maisAntiga.vencidaHaMinutos,
      },
      resumoEmPortugues,
    },
  };
}
