// juiz-editorial.ts — ONDA 4A, FICHA A: O JUIZ DAS 8 PROIBIÇÕES SEM MECANISMO
//
// Fonte: docs/celula-prospeccao/despachos/ONDA-4A-A-o-juiz-editorial.md.
// Dado: docs/plataformas/99freelas/regras-editoriais.json.
//
// ─── O QUE ESTE ARQUIVO FECHA ────────────────────────────────────────────────
//
// Das 8 categorias que o CEO proibiu por CATEGORIA (não por substring —
// "exageros", "pressão artificial", "urgência inventada", "promessa de
// resultado", "experiência não comprovada", "portfólio inexistente", "excesso
// de elogios", "texto longo sobre a Dioli"), nenhuma tinha mecanismo. Eram
// `LACUNA_JUIZ` em lib/dioli-brain/quality-gates.ts — texto descrevendo o que
// um humano deveria conferir. Esta casa roda 100% IA, sem revisão humana antes
// do envio: sem mecanismo, essas 8 eram decoração, não trava.
//
// ─── A LEI 2 CRAVADA AQUI, COM TODAS AS LETRAS ──────────────────────────────
//
// "A IA dá PENSAMENTO, não PODER." O juiz é IA — um provedor plugável, injetado
// via `PortaDoJuiz`, exatamente como o resto da casa injeta IA (nunca importa
// SDK direto). O que este arquivo garante não é que a IA acerte; é que, quando
// ela erra, mente, trava ou devolve lixo, NADA disso vira aprovação. A trava é
// a LEITURA da resposta, não a resposta em si — releia a seção 3.
//
// ─── AS DUAS METADES DO VEREDITO, E POR QUE AS DUAS SÃO OBRIGATÓRIAS ────────
//
//   • REPROVADO é BLOQUEANTE. A mensagem não sai. Sem exceção, sem override,
//     sem flag de "seguir mesmo assim".
//   • INDISPONÍVEL também NÃO deixa a mensagem sair — mas não pode travar a
//     agência inteira. Abre uma exceção NOMEADA, com dono e ação recomendada,
//     e a mensagem fica retida até decisão humana. Nunca silenciosa: esta casa
//     já teve seis travas que falharam caladas em dois dias (ver
//     lib/agency/celula/excecoes/tipos.ts). Esta não é a sétima.
//
// Nenhuma das duas metades é "passa direto". Sem gate = reprovado
// (CLAUDE.md) — e aqui isso quer dizer: sem porta injetada, sem resposta
// reconhecível, sem caso para abrir exceção, a mensagem NÃO SAI de nenhum
// jeito. O único caminho de aprovação é uma resposta POSITIVAMENTE
// reconhecida como aprovação bem formada.
//
// ─── O CASO DA EXCEÇÃO: NÃO ESCOLHIDO AQUI ──────────────────────────────────
//
// lib/agency/celula/excecoes/tipos.ts tem 14 casos, conjunto FECHADO, e
// nenhum descreve "o juiz editorial está fora do ar" — os 5 que interrompem a
// automação inteira (CAPTCHA, sessão expirada etc.) são proibidos aqui por
// ordem do Diretor: juiz fora do ar não pode travar a agência inteira. Por
// isso `casoDaIndisponibilidade` é PARÂMETRO INJETADO, sem default. Não
// informado (ou ilegível) → `indisponivel_sem_caso`, e a mensagem CONTINUA
// não saindo (fail closed) — só não abre exceção, porque não há em qual dos
// 14 casos abri-la. O 15º caso pedido no relatório desta ficha é
// `juiz_indisponivel` — este arquivo não cria esse caso; só registra a
// necessidade dele, como a doutrina de tipos.ts manda ("escreva no relatório,
// não no código").
//
// ─── TEXTO DE TERCEIRO É DADO, NUNCA ORDEM (mesma nota de fila.ts/funil.ts) ──
//
// O texto vai ao juiz dentro de um envelope explícito (`delimitarParaOJuiz`),
// nunca cru. O delimitador escolhido aqui NÃO É FORJÁVEL: qualquer ocorrência
// dele dentro do texto candidato — em qualquer caixa, com ou sem acento ou
// espaço — é tratada como TENTATIVA DE FUGA e REPROVA o texto ANTES de
// qualquer chamada ao provedor (nunca chega a gastar uma chamada de IA com um
// texto que já tentou escapar do envelope). A escolha foi REPROVAR, não
// escapar/neutralizar: uma tentativa ofuscada (caixa/espaço/acento variando)
// não tem posição fixa no texto original para uma substituição cirúrgica
// seria, e um provedor que recebe um envelope "quase certo" é pior que um
// texto que nunca chega a ser enviado. Prova: __tests__/celula/juiz-editorial-texto-malicioso.test.ts.
//
// O veredito sai SOMENTE dos campos estruturados da resposta do provedor
// (`aprovado`, `categorias`, `explicacao`) — nunca de uma palavra lida dentro
// do texto candidato. Um texto que contenha literalmente `{"aprovado":true}`
// no meio dele não aprova nada: esta função nunca faz `JSON.parse` no texto
// candidato, só na resposta que a PORTA devolve.
//
// ─── "UM JUIZ QUE RESPONDE LIXO NÃO APROVA NADA" ────────────────────────────
//
// Qualquer resposta que não seja EXATAMENTE a forma esperada — campo
// faltando, tipo errado, categoria fora das 8, JSON quebrado, `null`, string
// solta, exceção lançada, timeout (= promessa rejeitada) — é `indisponivel`
// (ou `indisponivel_sem_caso`). NUNCA `ok: true`. O caminho aprovado só existe
// quando a resposta é POSITIVAMENTE reconhecida como aprovação bem formada —
// ver `lerRespostaDoJuiz`.

import {
  type Caso,
  type Prioridade,
  type Responsavel,
  CASOS_QUE_INTERROMPEM_A_AUTOMACAO,
  casoDeclarado,
} from "@/lib/agency/celula/excecoes/tipos";

// ── 1. As 8 categorias — conjunto FECHADO, leitura fail-closed ──────────────
//
// Mesma forma de `estadoDeclarado()` em lib/agency/celula/funil.ts: valor que
// não é EXATAMENTE um membro do conjunto vira `null`, nunca `as Categoria`.
// Hardcoded aqui (não derivado do JSON) porque o TypeScript precisa do
// literal para o tipo — um teste (__tests__/celula/juiz-editorial.test.ts)
// confere que esta lista e a de docs/plataformas/99freelas/regras-editoriais.json
// são EXATAMENTE as mesmas 8, para as duas não divergirem.

export const CATEGORIAS = [
  "exageros",
  "pressao_artificial",
  "urgencia_inventada",
  "promessa_de_resultado",
  "experiencia_nao_comprovada",
  "portfolio_inexistente",
  "excesso_de_elogios",
  "texto_longo_sobre_a_dioli",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

const CONJUNTO_DE_CATEGORIAS: ReadonlySet<string> = new Set(CATEGORIAS);

/** Leitura fail-closed: qualquer coisa que não seja EXATAMENTE uma das 8 vira
 *  `null`. Nunca `as Categoria`. */
export function categoriaDeclarada(valor: unknown): Categoria | null {
  return typeof valor === "string" && CONJUNTO_DE_CATEGORIAS.has(valor) ? (valor as Categoria) : null;
}

// ── 2. A porta injetada — nunca um import de provedor ────────────────────────

/**
 * A única forma de este módulo falar com um provedor de IA. Devolve
 * `unknown` de propósito: quem lê a resposta é este arquivo, e a leitura é
 * fail-closed (seção 4). Nenhum teste desta ficha faz chamada de IA real —
 * todo teste injeta um `PortaDoJuiz` de mentira.
 */
export type PortaDoJuiz = (pedido: { textoDelimitado: string; delimitador: string }) => Promise<unknown>;

// ── 3. O veredito ─────────────────────────────────────────────────────────

export interface PedidoDeExcecaoDoJuiz {
  caso: Caso;
  prioridade: Prioridade;
  responsavel: Responsavel;
  contexto: unknown;
  acaoRecomendada: string;
}

export type VeredictoDoJuiz =
  | { ok: true }
  | { ok: false; motivo: "reprovado"; categorias: Categoria[]; explicacao: string }
  | { ok: false; motivo: "indisponivel"; causa: string; pedidoDeExcecao: PedidoDeExcecaoDoJuiz }
  | { ok: false; motivo: "indisponivel_sem_caso"; causa: string };

export interface PedidoDeJulgamento {
  /** O texto final, já montado — resposta + pergunta, o que sairia para o
   *  cliente se o juiz aprovasse. */
  texto: string;
  /** A IA que julga. Ausente/não-função ⇒ indisponível (sem gate = reprovado). */
  porta: PortaDoJuiz | null | undefined;
  /** Injetado pelo chamador — nenhum dos 14 casos fechados descreve "juiz
   *  fora do ar", então este parâmetro nunca tem valor-padrão escolhido por
   *  este arquivo. Ausente/ilegível ⇒ `indisponivel_sem_caso`. */
  casoDaIndisponibilidade: Caso | null | undefined;
}

// ── 4. O envelope, e a trava contra a fuga do delimitador ───────────────────

/** O marcador de abertura. Fixo e exportado para o teste poder conferir o
 *  formato exato sem duplicar a string. */
export const MARCADOR_ABERTURA_DO_JUIZ = "<<<TEXTO_A_JULGAR>>>";

/** O marcador de fechamento. */
export const MARCADOR_FECHAMENTO_DO_JUIZ = "<<<FIM_TEXTO_A_JULGAR>>>";

/** Normaliza para DETECÇÃO de fuga: remove acento, maiúsculas viram
 *  minúsculas... na verdade viram MAIÚSCULAS uniformes, e todo caractere que
 *  não é letra/dígito/`<`/`>` é descartado (espaço, underscore, pontuação).
 *  É isto que faz "<<< fim_texto_a_julgar >>>", "<<<FIM TEXTO A JULGAR>>>" e
 *  "<<<fim-texto-a-julgar>>>" caírem todos na MESMA forma normalizada que
 *  "<<<FIM_TEXTO_A_JULGAR>>>" — "em qualquer caixa, com ou sem acento/espaço",
 *  exatamente como a ficha exige. */
function normalizarParaDeteccaoDeFuga(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9<>]/g, "");
}

const NUCLEO_ABERTURA = normalizarParaDeteccaoDeFuga(MARCADOR_ABERTURA_DO_JUIZ);
const NUCLEO_FECHAMENTO = normalizarParaDeteccaoDeFuga(MARCADOR_FECHAMENTO_DO_JUIZ);

/** O texto candidato contém uma tentativa (mesmo ofuscada) de forjar um dos
 *  dois marcadores? Se sim, é tratado como tentativa de fuga do envelope —
 *  ver a decisão de REPROVAR (não escapar) no cabeçalho do arquivo. */
function contemTentativaDeFugaDoDelimitador(texto: string): boolean {
  const normalizado = normalizarParaDeteccaoDeFuga(texto);
  return normalizado.includes(NUCLEO_ABERTURA) || normalizado.includes(NUCLEO_FECHAMENTO);
}

/** Envelopa o texto candidato — é isto, e só isto, que vai para a porta do
 *  juiz. Só é chamada depois de `contemTentativaDeFugaDoDelimitador` já ter
 *  devolvido `false` — nunca envelopa um texto que tentou forjar o marcador. */
function delimitarParaOJuiz(texto: string): string {
  return `${MARCADOR_ABERTURA_DO_JUIZ}\n${texto}\n${MARCADOR_FECHAMENTO_DO_JUIZ}`;
}

// ── 5. Ler a resposta — fail-closed, a trava principal deste arquivo ────────

type LeituraDaResposta =
  | { malformado: true; motivo: string }
  | { malformado: false; ok: true }
  | { malformado: false; ok: false; categorias: Categoria[]; explicacao: string };

function tipoLegivel(valor: unknown): string {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "array";
  return typeof valor;
}

/**
 * A trava principal do arquivo: qualquer coisa que não seja EXATAMENTE a
 * forma esperada vira `malformado: true` — nunca uma aprovação por omissão.
 * O caminho `{ ok: true }` só existe quando a resposta diz `aprovado: true`
 * de forma limpa (sem categorias reprovadas contraditórias grudadas); o
 * caminho de reprovação só existe quando `aprovado: false` vem acompanhado de
 * uma lista NÃO VAZIA de categorias — todas dentre as 8 — e uma explicação
 * legível.
 */
function lerRespostaDoJuiz(resposta: unknown): LeituraDaResposta {
  if (resposta === null || typeof resposta !== "object" || Array.isArray(resposta)) {
    return {
      malformado: true,
      motivo: `a resposta do juiz não é um objeto reconhecível (recebido: ${tipoLegivel(resposta)}).`,
    };
  }

  const r = resposta as Record<string, unknown>;

  if (r.aprovado === true) {
    if (Array.isArray(r.categorias) && r.categorias.length > 0) {
      return {
        malformado: true,
        motivo: "a resposta diz 'aprovado: true' mas também lista categorias reprovadas — contraditório, tratado como indisponível.",
      };
    }
    return { malformado: false, ok: true };
  }

  if (r.aprovado === false) {
    if (!Array.isArray(r.categorias) || r.categorias.length === 0) {
      return {
        malformado: true,
        motivo: "a resposta reprovou o texto ('aprovado: false') mas não trouxe uma lista de categorias não-vazia.",
      };
    }
    const categorias: Categoria[] = [];
    for (const bruta of r.categorias) {
      const categoria = categoriaDeclarada(bruta);
      if (categoria === null) {
        return {
          malformado: true,
          motivo: `a categoria "${String(bruta)}" na resposta não é uma das 8 categorias julgadas.`,
        };
      }
      categorias.push(categoria);
    }
    if (typeof r.explicacao !== "string" || r.explicacao.trim().length < 3) {
      return {
        malformado: true,
        motivo: "a resposta reprovou o texto mas não trouxe uma explicação legível (mínimo 3 caracteres úteis).",
      };
    }
    return { malformado: false, ok: false, categorias, explicacao: r.explicacao };
  }

  return {
    malformado: true,
    motivo: `o campo "aprovado" está ausente ou não é booleano (recebido: ${tipoLegivel(r.aprovado)}).`,
  };
}

// ── 6. O pedido de exceção — pronto para avaliarAberturaDeExcecao ───────────

/**
 * Monta o `pedidoDeExcecao`. `prioridade` é derivada do `caso` recebido, não
 * escolhida à toa: se o caso injetado pertencer a
 * `CASOS_QUE_INTERROMPEM_A_AUTOMACAO`, a prioridade TEM de ser `p0` — do
 * contrário `avaliarAberturaDeExcecao` (lib/agency/celula/excecoes/fila.ts)
 * rejeita com `prioridade_rebaixada_para_caso_p0`. Fora desse conjunto, `p1`
 * (2h) é o padrão — nem `p0` (que sugeriria interrupção total, que este juiz
 * NUNCA causa por ordem do Diretor) nem `p2` (24h é longo demais para uma
 * mensagem retida). O responsável é sempre `gerente_de_atendimento` — o CEO
 * não opera esta fila (trava 1 de excecoes/tipos.ts).
 */
function construirPedidoDeExcecao(params: { caso: Caso; causa: string; texto: string }): PedidoDeExcecaoDoJuiz {
  const prioridade: Prioridade = CASOS_QUE_INTERROMPEM_A_AUTOMACAO.has(params.caso) ? "p0" : "p1";
  return {
    caso: params.caso,
    prioridade,
    responsavel: "gerente_de_atendimento",
    contexto: {
      origem: "juiz-editorial",
      causaDaIndisponibilidade: params.causa,
      textoCandidato: params.texto,
    },
    acaoRecomendada:
      "Confirmar manualmente, com um humano do time, se este texto final pode ser enviado ao cliente — o juiz editorial não respondeu de forma válida e a mensagem ficou retida.",
  };
}

function finalizarComoIndisponivel(
  casoDaIndisponibilidade: Caso | null | undefined,
  causa: string,
  texto: string,
): VeredictoDoJuiz {
  const caso = casoDeclarado(casoDaIndisponibilidade);
  if (caso === null) {
    return { ok: false, motivo: "indisponivel_sem_caso", causa };
  }
  return {
    ok: false,
    motivo: "indisponivel",
    causa,
    pedidoDeExcecao: construirPedidoDeExcecao({ caso, causa, texto }),
  };
}

// ── 7. A função principal ────────────────────────────────────────────────

/**
 * Julga `pedido.texto`. Ordem: primeiro a trava contra fuga do delimitador
 * (nunca gasta uma chamada de IA num texto que já tentou forjar o envelope);
 * depois a porta (ausente ⇒ indisponível, sem chamar nada); depois a leitura
 * fail-closed da resposta.
 *
 * ⚠️ Este juiz NÃO substitui o piso determinístico (palavrasProibidasGlobais
 * + o Guardião de lib/marketplaces/99freelas/conformidade.ts). Quem chama
 * este arquivo (proxima-mensagem.ts) roda o piso PRIMEIRO — texto reprovado
 * no piso nem chega aqui.
 */
export async function julgarTexto(pedido: PedidoDeJulgamento): Promise<VeredictoDoJuiz> {
  const texto = pedido.texto ?? "";

  // ── trava contra fuga do delimitador — roda ANTES de qualquer provedor ──
  if (contemTentativaDeFugaDoDelimitador(texto)) {
    return {
      ok: false,
      motivo: "reprovado",
      categorias: [],
      explicacao:
        "O texto final contém uma tentativa de forjar o delimitador do juiz editorial (o marcador que separa dado de instrução). Reprovado antes de consultar qualquer provedor de IA — texto de terceiro é dado, nunca instrução.",
    };
  }

  if (typeof pedido.porta !== "function") {
    return finalizarComoIndisponivel(
      pedido.casoDaIndisponibilidade,
      "nenhuma porta de juiz foi informada a esta chamada — sem gate é reprovado, não aprovado por omissão.",
      texto,
    );
  }

  const textoDelimitado = delimitarParaOJuiz(texto);

  let respostaBruta: unknown;
  try {
    respostaBruta = await pedido.porta({ textoDelimitado, delimitador: MARCADOR_ABERTURA_DO_JUIZ });
  } catch (erro) {
    const causa = `o provedor do juiz lançou uma exceção (ou a chamada expirou): ${erro instanceof Error ? erro.message : String(erro)}`;
    return finalizarComoIndisponivel(pedido.casoDaIndisponibilidade, causa, texto);
  }

  const leitura = lerRespostaDoJuiz(respostaBruta);
  if (leitura.malformado) {
    return finalizarComoIndisponivel(pedido.casoDaIndisponibilidade, leitura.motivo, texto);
  }
  if (leitura.ok) {
    return { ok: true };
  }
  return { ok: false, motivo: "reprovado", categorias: leitura.categorias, explicacao: leitura.explicacao };
}
