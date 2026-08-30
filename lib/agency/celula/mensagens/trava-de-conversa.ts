// trava-de-conversa.ts — UM AGENTE POR VEZ NUMA CONVERSA, E NUNCA A MESMA
// COISA DUAS VEZES.
//
// ─── O OBJETIVO (ficha C, Onda 2 da Célula de Prospecção) ───────────────────
//
// Antes de qualquer agente escrever ou enviar numa conversa do 99Freelas, esta
// trava bloqueia a conversa, carrega o estado inteiro dela e impede os três
// defeitos que o CEO nomeou: mensagem duplicada, dois agentes se
// contradizendo e pergunta repetida — mais o teto de uso de um modelo de
// mensagem dentro da mesma conversa.
//
// ─── A RESERVA É A TRAVA ──────────────────────────────────────────────────
//
// `PortaDaConversa.reservar` é ATÔMICA — "lê, verifica, depois grava" é
// exatamente o buraco por onde dois agentes entram na mesma janela, e este
// arquivo nunca faz isso. A trava reserva primeiro; só depois lê o estado e
// confere as regras.
//
// ─── QUANDO A TRAVA LIBERA SOZINHA, E QUANDO ELA NÃO LIBERA ─────────────────
//
// Em todo caminho de BLOQUEIO (conversa ocupada não conta — nada foi
// reservado por nós) e em toda EXCEÇÃO lançada durante a conferência, esta
// função libera a reserva antes de devolver o veredito ou relançar o erro. A
// conversa nunca fica presa por um bloqueio ou por um raciocínio que quebrou
// no meio.
//
// No caminho de SUCESSO (`ok: true`) a reserva **não** é liberada aqui — ela é
// devolvida ao chamador como a função `liberar()`. O motivo: quem chamou esta
// trava ainda precisa montar a fala final, efetivamente enviá-la e persistir
// o novo estado (isso é de outra ficha — este arquivo não implementa o motor
// de escolha da próxima mensagem). Liberar a reserva antes disso reabriria a
// janela que a trava existe para fechar. É o próprio chamador quem sabe
// quando terminou de usar o estado, e é ele quem deve chamar `liberar()`.
//
// ─── PERGUNTA REPETIDA REAPROVEITA O CONTADOR DA CASA ────────────────────────
//
// `identificarPergunta`, `LIMITE_DE_INSISTENCIA` e `oQueDizerNoLugar` vêm de
// `lib/agency/comercial/pergunta-repetida.ts` — nasceram de um defeito medido
// em produção (a mesma pergunta feita dez vezes em vinte turnos) e não são
// reescritos aqui.
//
// ⚠️ UMA ADAPTAÇÃO, DECLARADA: `pergunta-repetida.ts` também exporta
// `vezesJaPerguntada(falasDoSdr, perguntaId)`, que conta sobre um array de
// FALAS CRUAS (ela roda `identificarPergunta` em cada uma). O contrato de
// `EstadoDaConversa.perguntasJaFeitas`, definido pela ficha, guarda **ids já
// classificados** ("ids de `pergunta-repetida.ts`"), não falas cruas — ou
// seja, a classificação já aconteceu no momento em que cada fala foi gravada
// no estado. Rodar `identificarPergunta` sobre um id (uma string como
// "budget_range", sem "?") nunca vai classificar nada; chamar
// `vezesJaPerguntada` sobre esse array literalmente não funcionaria. Por isso
// a contagem aqui é uma comparação de igualdade direta sobre os ids já
// prontos (`vezesNoEstado`, abaixo) — a REGRA de "o que conta como a mesma
// pergunta" continua vindo de um lugar só (`identificarPergunta`, usada sobre
// a fala CANDIDATA para descobrir o id dela); não nasceu aqui um segundo
// classificador. Isto é uma interpretação do contrato dado pela ficha — sinalizada
// no relatório de entrega para o PM confirmar.
//
// ─── CONTRADIÇÃO DE AGENTE: RÉGUA ESTREITA DE PROPÓSITO ─────────────────────
//
// Só compara VALORES DECLARADOS explicitamente na última mensagem enviada
// contra a fala candidata — preço (um único "R$ X" declarado em cada texto),
// prazo (via `extrairPrazo`, já da casa) e um punhado de afirmações/negações
// de escopo sobre serviços conhecidos. Nunca compara estilo de redação. Régua
// larga aqui barra conversa legítima e é desligada — a régua estreita fica de
// propósito, mesmo sabendo que ela deixa passar contradições mais sutis.

import { impressaoDeTexto, extrairPrazo } from "@/lib/agency/comercial/oportunidade";
import { identificarPergunta, LIMITE_DE_INSISTENCIA, oQueDizerNoLugar } from "@/lib/agency/comercial/pergunta-repetida";

// ── O estado (a lista é do CEO, na ordem dele) ───────────────────────────────

export interface EstadoDaConversa {
  conversaId: string;
  ultimaRecebida: { em: string; texto: string } | null;
  ultimaEnviada: { em: string; texto: string; codigoDoModelo: string | null } | null;
  agenteResponsavel: string | null;
  etapa: string;
  perguntasJaFeitas: readonly string[]; // ids de `pergunta-repetida.ts`
  respostasRecebidas: Readonly<Record<string, string>>;
  arquivos: readonly { nome: string; recebidoEm: string }[];
  proximaAcao: string | null;
  modelosJaUsados: readonly string[]; // "M01", "M03"...
}

// ── A porta injetada — a Onda 1 liga no banco depois ─────────────────────────

export interface PortaDaConversa {
  ler: (conversaId: string) => Promise<EstadoDaConversa | null>;
  /** Reserva ATÔMICA. Devolve false se já existe trava viva de outro agente. */
  reservar: (p: { conversaId: string; agente: string; expiraEm: string }) => Promise<boolean>;
  liberar: (p: { conversaId: string; agente: string }) => Promise<void>;
}

// ── O veredito ────────────────────────────────────────────────────────────

export type VereditoDaTrava =
  | { ok: true; estado: EstadoDaConversa; liberar: () => Promise<void> }
  | {
      ok: false;
      motivo: string;
      causa:
        | "conversa_ocupada"
        | "conversa_inexistente"
        | "mensagem_duplicada"
        | "pergunta_repetida"
        | "contradicao_de_agente"
        | "modelo_ja_usado";
    };

/** Falha, já tipada como o ramo `ok: false` de `VereditoDaTrava` — evita
 *  repetir a forma do objeto em cada `return` das conferências. */
type Bloqueio = Extract<VereditoDaTrava, { ok: false }>;

// ── O pedido ─────────────────────────────────────────────────────────────

export interface PedidoDeTrava {
  conversaId: string;
  /** Quem está pedindo a trava — o nome que aparece para o próximo agente que
   *  bater na porta enquanto esta reserva estiver viva. */
  agente: string;
  porta: PortaDaConversa;
  /** A fala que este agente quer escrever ou enviar. */
  mensagemCandidata: string;
  /** O modelo de mensagem que esta fala usaria, se houver ("M01", "M03"...). */
  codigoDoModelo?: string | null;
  /**
   * O teto de uso do modelo NESTA conversa. Vem por parâmetro — é a régua da
   * Ficha A, não uma constante hardcoded aqui. Ausente ou não positivo ⇒ a
   * conferência de teto não roda (não há régua para aplicar).
   */
  maximoDeUsosDoModelo?: number | null;
  /** Por quanto tempo a reserva fica viva antes de expirar sozinha. */
  duracaoDaReservaMs?: number;
  agora?: Date;
}

/** Tempo generoso para compor e enviar uma fala; curto o bastante para não
 *  travar a conversa para sempre se o agente cair no meio do caminho. */
const DURACAO_PADRAO_DA_RESERVA_MS = 2 * 60 * 1000;

// ── A função principal ───────────────────────────────────────────────────

/**
 * Abre a trava da conversa, confere as regras contra a fala candidata, e
 * SEMPRE libera — automaticamente em todo caminho de bloqueio e de exceção;
 * pelo `liberar()` devolvido, no caminho de sucesso, quando o chamador já
 * tiver terminado de usar o estado.
 */
export async function comATravaDaConversa(pedido: PedidoDeTrava): Promise<VereditoDaTrava> {
  const agora = pedido.agora ?? new Date();
  const expiraEm = new Date(agora.getTime() + (pedido.duracaoDaReservaMs ?? DURACAO_PADRAO_DA_RESERVA_MS)).toISOString();

  const reservou = await pedido.porta.reservar({
    conversaId: pedido.conversaId,
    agente: pedido.agente,
    expiraEm,
  });

  if (!reservou) {
    // Nada foi reservado por nós — não há o que liberar. Tenta nomear quem
    // está dentro; se nem isso for possível, nomeia genericamente.
    const estadoAtual = await pedido.porta.ler(pedido.conversaId).catch(() => null);
    const quem = estadoAtual?.agenteResponsavel ?? "outro agente";
    return {
      ok: false,
      causa: "conversa_ocupada",
      motivo: `A conversa "${pedido.conversaId}" já está sendo atendida por "${quem}". Espere a liberação antes de escrever ou enviar.`,
    };
  }

  const liberar = () => pedido.porta.liberar({ conversaId: pedido.conversaId, agente: pedido.agente });

  try {
    const estado = await pedido.porta.ler(pedido.conversaId);
    if (!estado) {
      await liberar();
      return {
        ok: false,
        causa: "conversa_inexistente",
        motivo: `A conversa "${pedido.conversaId}" não foi encontrada. Ausência de estado não é conversa nova por padrão — confirme o id antes de escrever.`,
      };
    }

    const bloqueio: Bloqueio | null =
      verificarMensagemDuplicada(estado, pedido.mensagemCandidata) ??
      verificarPerguntaRepetida(estado, pedido.mensagemCandidata) ??
      verificarContradicao(estado, pedido.mensagemCandidata) ??
      verificarLimiteDeModelo(estado, pedido.codigoDoModelo, pedido.maximoDeUsosDoModelo);

    if (bloqueio) {
      await liberar();
      return bloqueio;
    }

    return { ok: true, estado, liberar };
  } catch (erro) {
    await liberar().catch(() => {
      // A exceção original importa mais que uma falha ao liberar durante o
      // tratamento dela — não deixamos um segundo erro esconder o primeiro.
    });
    throw erro;
  }
}

// ── As conferências, cada uma isolada e exportada para teste direto ──────────

/** Mensagem candidata idêntica à última já enviada nesta conversa ⇒ BLOQUEIO. */
export function verificarMensagemDuplicada(estado: EstadoDaConversa, candidata: string): Bloqueio | null {
  if (!estado.ultimaEnviada) return null;
  if (impressaoDeTexto(candidata) !== impressaoDeTexto(estado.ultimaEnviada.texto)) return null;
  return {
    ok: false,
    causa: "mensagem_duplicada",
    motivo: `Esta fala é idêntica à última mensagem já enviada nesta conversa (em ${estado.ultimaEnviada.em}). Não envie a mesma coisa duas vezes.`,
  };
}

/**
 * Pergunta já respondida (bloqueia já na primeira repetição) ou pergunta
 * feita vezes demais (passou de `LIMITE_DE_INSISTENCIA`) ⇒ BLOQUEIO, com o
 * que dizer no lugar (`oQueDizerNoLugar`).
 */
export function verificarPerguntaRepetida(estado: EstadoDaConversa, candidata: string): Bloqueio | null {
  const perguntaId = identificarPergunta(candidata);
  if (!perguntaId) return null; // não é pergunta — nada a travar aqui

  const falaDoCliente = estado.ultimaRecebida?.texto;

  if (Object.prototype.hasOwnProperty.call(estado.respostasRecebidas, perguntaId)) {
    const jaRespondida = estado.respostasRecebidas[perguntaId];
    const sugestao = oQueDizerNoLugar(perguntaId, undefined, estado.perguntasJaFeitas, falaDoCliente);
    return {
      ok: false,
      causa: "pergunta_repetida",
      motivo:
        `A pergunta "${perguntaId}" já tem resposta registrada nesta conversa ("${jaRespondida}"). ` +
        `Não pergunte de novo — diga isto no lugar: ${sugestao}`,
    };
  }

  const vezes = vezesNoEstado(estado.perguntasJaFeitas, perguntaId);
  if (vezes >= LIMITE_DE_INSISTENCIA) {
    const sugestao = oQueDizerNoLugar(perguntaId, undefined, estado.perguntasJaFeitas, falaDoCliente);
    return {
      ok: false,
      causa: "pergunta_repetida",
      motivo:
        `A pergunta "${perguntaId}" já foi feita ${vezes} vez(es) nesta conversa — o limite é ${LIMITE_DE_INSISTENCIA}. ` +
        `Não insista — diga isto no lugar: ${sugestao}`,
    };
  }

  return null;
}

/** Ver a nota grande no topo do arquivo — a classificação continua vindo só
 *  de `identificarPergunta`; isto é uma contagem por igualdade sobre ids já
 *  prontos, não um segundo classificador de "o que é a mesma pergunta". */
function vezesNoEstado(perguntasJaFeitas: readonly string[], perguntaId: string): number {
  return perguntasJaFeitas.filter((id) => id === perguntaId).length;
}

/**
 * A mensagem candidata afirma o contrário do que a última mensagem enviada
 * afirmou sobre preço, prazo ou escopo ⇒ BLOQUEIO. Régua estreita: só compara
 * valores declarados explicitamente, nunca estilo de redação.
 */
export function verificarContradicao(estado: EstadoDaConversa, candidata: string): Bloqueio | null {
  const anterior = estado.ultimaEnviada?.texto;
  if (!anterior) return null;

  const motivo = contradizPreco(anterior, candidata) ?? contradizPrazo(anterior, candidata) ?? contradizEscopo(anterior, candidata);
  if (!motivo) return null;

  return { ok: false, causa: "contradicao_de_agente", motivo };
}

/** Só dispara quando CADA texto declara um único valor "R$ X" inequívoco, e
 *  os dois valores diferem. Texto com zero ou mais de um valor não dispara —
 *  ambiguidade não vira acusação de contradição. */
function contradizPreco(anterior: string, candidata: string): string | null {
  const a = valorUnicoDeclarado(anterior);
  const b = valorUnicoDeclarado(candidata);
  if (a === null || b === null || a === b) return null;
  return (
    `A última fala enviada declarou R$ ${formatarReais(a)} e esta fala declara R$ ${formatarReais(b)} — ` +
    `valores de preço diferentes na mesma conversa. Confira antes de enviar.`
  );
}

const RE_VALOR_REAIS = /r\$\s*([\d.,]+)/gi;

function valorUnicoDeclarado(texto: string): number | null {
  const valores = new Set<number>();
  for (const m of texto.matchAll(RE_VALOR_REAIS)) {
    const n = numeroBrLocal(m[1]);
    if (n !== null) valores.add(n);
  }
  return valores.size === 1 ? [...valores][0]! : null;
}

/**
 * Leitura pt-BR de um número declarado num texto ("1.200,50" → 1200,5).
 *
 * ⚠️ Pequena e local de propósito — não é o motor de preço da casa (esse é
 * `lib/agency/comercial/negociacao.ts` e `lib/marketplaces/99freelas/preco.ts`,
 * e nenhum preço é DECIDIDO aqui). Este helper só lê o que DUAS falas já
 * prontas declararam, para comparar uma com a outra.
 */
function numeroBrLocal(s: string): number | null {
  const limpo = s.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(limpo)) return null;
  const temDecimal = /,\d{1,2}$/.test(limpo);
  const inteiroTxt = temDecimal ? limpo.slice(0, limpo.lastIndexOf(",")) : limpo;
  const decimalTxt = temDecimal ? limpo.slice(limpo.lastIndexOf(",") + 1) : "";
  const inteiro = Number(inteiroTxt.replace(/[.,]/g, ""));
  if (!Number.isFinite(inteiro)) return null;
  const decimal = decimalTxt ? Number(`0.${decimalTxt}`) : 0;
  return inteiro + decimal;
}

function formatarReais(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

/** Usa `extrairPrazo` (já da casa, `lib/agency/comercial/oportunidade.ts`) nos
 *  dois textos. Só dispara quando os dois declaram prazo E o texto declarado
 *  difere depois de normalizado. */
function contradizPrazo(anterior: string, candidata: string): string | null {
  const a = extrairPrazo(anterior);
  const b = extrairPrazo(candidata);
  if (!a || !b) return null;
  const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalizar(a) === normalizar(b)) return null;
  return `A última fala enviada declarou o prazo "${a}" e esta fala declara "${b}" — prazos diferentes na mesma conversa. Confira antes de enviar.`;
}

/** Serviços conhecidos o bastante para valer o risco de comparar polaridade
 *  (incluído/não incluído) entre as duas falas. Lista deliberadamente curta —
 *  uma régua larga demais aqui barra conversa legítima. */
const SERVICOS_CONHECIDOS: { id: string; padrao: RegExp }[] = [
  { id: "redes sociais", padrao: /redes\s+sociais|social\s*m[íi]dia|instagram\b/i },
  { id: "tráfego pago", padrao: /tr[áa]fego\s+pago|an[úu]ncios?\s+pagos?|m[íi]dia\s+paga|google\s+ads|facebook\s+ads/i },
  { id: "identidade visual", padrao: /identidade\s+visual|logo(?:tipo)?\b/i },
  { id: "site", padrao: /\bsite\b|landing\s*page/i },
  { id: "publicação", padrao: /publica[çc][ãa]o/i },
];

/** Só conta como NEGAÇÃO um verbo de exclusão explícito perto do serviço —
 *  nunca a simples palavra "não" em outro lugar da frase. */
const RE_NEGACAO = /\bn[ãa]o\s+(?:inclui|cont[ée]mpla|faz\s+parte|entra)\b|\bsem\b/i;
/** Só conta como AFIRMAÇÃO um verbo de inclusão explícito — "com" sozinho é
 *  comum demais para servir de sinal e fica de fora de propósito. */
const RE_AFIRMACAO = /\binclui\b|\bcont[ée]mpla\b|\bfaz\s+parte\b|\best[áa]\s+no\s+escopo\b/i;

function polaridadesDeclaradas(texto: string): Map<string, boolean> {
  const mapa = new Map<string, boolean>();
  for (const frase of texto.split(/(?<=[.!?;\n])\s+/)) {
    for (const { id, padrao } of SERVICOS_CONHECIDOS) {
      if (!padrao.test(frase)) continue;
      if (RE_NEGACAO.test(frase)) mapa.set(id, false);
      else if (RE_AFIRMACAO.test(frase)) mapa.set(id, true);
    }
  }
  return mapa;
}

function contradizEscopo(anterior: string, candidata: string): string | null {
  const antes = polaridadesDeclaradas(anterior);
  const agora = polaridadesDeclaradas(candidata);
  for (const [servico, incluidoAntes] of antes) {
    const incluidoAgora = agora.get(servico);
    if (incluidoAgora === undefined || incluidoAgora === incluidoAntes) continue;
    return (
      `A última fala enviada disse que "${servico}" ${incluidoAntes ? "faz parte" : "não faz parte"} do escopo, ` +
      `e esta fala diz o contrário. Confira antes de enviar.`
    );
  }
  return null;
}

/**
 * O modelo desta fala já foi usado além do teto ⇒ BLOQUEIO. O teto vem por
 * parâmetro (é da Ficha A) — sem ele, ou sem modelo declarado, esta
 * conferência não roda.
 */
export function verificarLimiteDeModelo(
  estado: EstadoDaConversa,
  codigoDoModelo: string | null | undefined,
  maximoDeUsos: number | null | undefined,
): Bloqueio | null {
  if (!codigoDoModelo) return null;
  if (typeof maximoDeUsos !== "number" || !Number.isFinite(maximoDeUsos) || maximoDeUsos <= 0) return null;

  const vezes = estado.modelosJaUsados.filter((m) => m === codigoDoModelo).length;
  if (vezes < maximoDeUsos) return null;

  return {
    ok: false,
    causa: "modelo_ja_usado",
    motivo: `O modelo "${codigoDoModelo}" já foi usado ${vezes} vez(es) nesta conversa — o teto é ${maximoDeUsos}. Escolha outro modelo.`,
  };
}
