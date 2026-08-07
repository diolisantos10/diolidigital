// OPERAÇÕES SOBRE O TRABALHO JÁ CONTRATADO — a terceira família de pedido.
//
// ── O buraco, com prova ─────────────────────────────────────────────────────
// Pedido `cmshiesdq00000pp2adk7zxe4` (Foocci, 06/08/2026 09:46). O CEO escreveu:
//
//   "Eu quero que você adiante. É preciso dar calendário de posts para hoje.
//    Então, ao invés do primeiro post, o primeiro carrossel, que está programado
//    pra amanhã, é preciso que vocês adiantem um dia e possam o primeiro
//    carrossel hoje."
//
// A triagem parou em `precisa_decisao` com o motivo **"não se encaixa em nenhum
// dos serviços que a máquina produz sozinha — é gestão de calendário, não
// atendimento criativo"**. O motivo estava CERTO e o desfecho estava ERRADO:
// mudar a data de peça já aprovada é operação do próprio sistema, e o pedido
// ficou esperando gente que nunca veio. É o mesmo padrão que deixou o roteiro
// dele dois dias num balde — só que agora o balde tinha um rótulo bonito.
//
// ── A distinção que faltava no vocabulário da casa ──────────────────────────
// A triagem só conhecia DUAS famílias: "peça nova no ciclo" e "peça nova como
// escopo extra". As duas produzem trabalho e as duas custam dinheiro. Existe uma
// terceira, e ela não é nenhuma das duas:
//
//   OPERAÇÃO — mexer no trabalho que JÁ EXISTE e JÁ FOI APROVADO.
//   Não produz peça, não gera orçamento, não consome ciclo. Só muda quando o
//   que já está pronto acontece.
//
// Por isso ela tem catálogo próprio, fechado, com trava por operação — e não um
// item de `SELF_SERVE_CATALOG`, que é a tabela de PREÇO. Operação não tem preço:
// tem permissão.
//
// ── AS TRAVAS, e por que são as que são ─────────────────────────────────────
//  1. **NUNCA mexe em peça publicada.** O que foi ao ar é do público do cliente,
//     não da agência. Remarcar o passado é mentira de calendário.
//  2. **NUNCA agenda para o passado.** Adiantar um dia às 14h uma peça marcada
//     para hoje às 10h significaria ontem. O piso é o próximo horário viável, e
//     ele é DITO ao cliente — nunca aplicado em silêncio.
//  3. **Só toca peça em `scheduled`.** Peça em qualquer outro estado é recusada
//     NOMEANDO o estado. `draft` é peça sem aval do cliente: mexer na data dela
//     seria a agência decidir calendário que o cliente ainda não aprovou.
//  4. **O espaçamento é preservado.** O deslocamento é o MESMO para todas as
//     peças. A alternativa (empurrar cada uma para o primeiro vago) amontoaria
//     seis carrosséis em três dias — o cliente pediu antecipação, não enxurrada.
//
// ── O que este catálogo NÃO faz, e é declarado ──────────────────────────────
// "Pausar" e "retomar" são reconhecidos pelo leitor e **não são executados**.
// Não existe estado de "pausado" que alguma tela leia: `SocialPost.status` tem
// draft|scheduled|approved|published|failed, e `draft` é lido pelo portal como
// "Esperando você" — escrever pausa ali mentiria para o cliente. Estado gravado
// que ninguém lê é vazamento, e inventar um seria o defeito que esta casa mais
// repete. Enquanto não houver coluna com leitor, pausar PARA com motivo — que é
// o desfecho honesto, não o cômodo.

import { prisma } from "@/lib/db/client";

// ─────────────────────────────────────────────────────────────────────────────
// O CATÁLOGO — lista FECHADA
// ─────────────────────────────────────────────────────────────────────────────

export type OperacaoId = "adiantar-calendario" | "adiar-calendario" | "remarcar-horario";

export interface Operacao {
  id: OperacaoId;
  label: string;
  /** O que o cliente vê quando ela roda. */
  verbo: string;
  /** O que ela exige do texto do cliente para poder rodar sem chutar. */
  exige: "dias" | "hora";
}

export const OPERACOES: Operacao[] = [
  {
    id: "adiantar-calendario",
    label: "Adiantar o calendário de publicações",
    verbo: "adiantei",
    exige: "dias",
  },
  {
    id: "adiar-calendario",
    label: "Adiar o calendário de publicações",
    verbo: "adiei",
    exige: "dias",
  },
  {
    id: "remarcar-horario",
    label: "Trocar o horário das publicações programadas",
    verbo: "remarquei",
    exige: "hora",
  },
];

/** Estados que a operação PODE mover. Um só, e de propósito: `scheduled` é o
 *  único estado desta casa que significa "o cliente aprovou e tem data". */
export const ESTADO_OPERAVEL = "scheduled";

/** Por que cada estado NÃO é operável, em português, para a recusa poder nomear
 *  o motivo em vez de dizer "não deu". */
const PORQUE_NAO_MEXO: Record<string, string> = {
  published: "já foi publicada — não mexo no que já está no ar",
  failed: "falhou na publicação e precisa da equipe antes de qualquer remarcação",
  draft: "ainda está esperando a sua aprovação, então ela não tem data valendo",
  approved: "está aprovada mas ainda não entrou no calendário que vale",
  revision_requested: "está em ajuste — a data volta a valer quando a nova versão for aprovada",
};

function porqueNaoMexo(status: string): string {
  return PORQUE_NAO_MEXO[status] ?? `está em "${status}", que não é um estado com data valendo`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA — léxica, determinística, sem IA
// ─────────────────────────────────────────────────────────────────────────────
//
// Por que sem IA: reconhecer "adiantem um dia" não é julgamento, é vocabulário.
// E esta leitura roda ANTES da classificação por modelo justamente para que uma
// chave de IA fora do ar não volte a transformar "mude a data" em decisão humana
// que nunca vem.

function normalizar(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10,
};
const NUM = `(?:\\d{1,2}|${Object.keys(NUMERO_POR_EXTENSO).join("|")})`;

/** O OBJETO tem de estar no texto. Sem ele, "adiante" pode ser adiantamento de
 *  pagamento, de reunião ou de qualquer outra coisa — e operar o calendário do
 *  cliente por causa de um verbo solto é pior do que não operar. */
const OBJETO_DE_CALENDARIO = /\b(?:calendario|calendarios|agenda|agendamento|agendamentos|agendad\w+|programad\w+|cronograma|posts?|publicac\w+|carross(?:el|eis)|stor(?:y|ies)|reels?|feed)\b/;

// Vocabulário ESTREITO de propósito. "antes", "depois", "mais tarde" e "para"
// ficaram DE FORA: aparecem em quase todo pedido legítimo ("um post antes do
// lançamento", "posts para hoje") e transformariam pedido de peça nova em
// remarcação de calendário — que é o erro caro na direção oposta.
//
// Cuidado com o vizinho: "adiante" começa com "adia". Por isso o ADIAR lista as
// formas fechadas em vez de `adia\w*` — senão o pedido do CEO ("você adiante")
// casaria com as DUAS direções e a leitura devolveria ambiguidade onde o texto
// era claro.
const ADIANTAR = /\b(?:adiant\w*|anteci\w+|puxa\w*\s+(?:para|pra)\s+(?:a\s+)?frente)\b/;
const ADIAR = /\b(?:adiar|adie|adiem|adiado|adiada|adiados|adiadas|adiamento|posterg\w+|atras\w+|empurr\w+|joga\w*\s+(?:para|pra)\s+(?:a\s+)?frente)\b/;
const PAUSAR = /\b(?:pausa\w*|pause\w*|pausem|suspend\w+|congel\w+|segur\w+\s+(?:o|os|as|a)\s+(?:calendario|posts?|publicac\w+)|par(?:a|e|em)\s+(?:tudo|com\s+)?(?:as\s+)?publicac\w+)\b/;
const RETOMAR = /\b(?:retom\w+|reativ\w+|descongel\w+|volt\w+\s+a\s+public\w+|solt\w+\s+(?:o|os)\s+(?:calendario|posts?))\b/;

const DIAS = new RegExp(`\\b(${NUM})\\s*(?:dia|dias)\\b`, "g");
/** "às 18h", "para as 9 horas", "no horário das 15h". Exige a palavra HORA/H —
 *  número solto perto de "post" não vira horário. */
const HORA = new RegExp(`\\b(?:as|para as|pras|de|no horario das?|horario das?|horario de)\\s*(\\d{1,2})\\s*(?:h|hs|horas)\\b`, "g");
const FALA_DE_HORARIO = /\b(?:horario|horarios|hora|horas)\b/;

export interface LeituraDeOperacao {
  /** A operação executável reconhecida. `null` = isto não é uma operação. */
  operacao: OperacaoId | null;
  /** Quantos dias mover. `null` = ele não disse, e isso NÃO vira 1. */
  dias: number | null;
  /** Novo horário (0-23). `null` = ele não disse. */
  hora: number | null;
  /**
   * A operação foi reconhecida como FAMÍLIA e a casa não sabe executá-la.
   * Texto pronto para virar motivo de `precisa_decisao` — nunca silêncio.
   */
  reconhecidaSemExecucao: string | null;
  /** Os trechos DELE que sustentam a leitura. */
  evidencias: string[];
}

const NADA: LeituraDeOperacao = {
  operacao: null, dias: null, hora: null, reconhecidaSemExecucao: null, evidencias: [],
};

/**
 * Lê o texto do cliente e diz se ele pediu uma OPERAÇÃO sobre o que já existe.
 *
 * Determinística: sem IA, sem rede, sem banco. O mesmo texto dá sempre o mesmo
 * resultado, e o teste consegue provar as duas metades — a operação legítima
 * passa, a que não é operação não é confundida com uma.
 */
export function lerOperacao(textoDoCliente: string): LeituraDeOperacao {
  const t = normalizar(textoDoCliente);
  if (!t.trim()) return NADA;

  // TRAVA DE ENTRADA: sem objeto de calendário no texto, nada aqui roda.
  const objeto = t.match(OBJETO_DE_CALENDARIO);
  if (!objeto) return NADA;

  const evidencias: string[] = [objeto[0]];

  const mAdiantar = t.match(ADIANTAR);
  const mAdiar = t.match(ADIAR);
  const mPausar = t.match(PAUSAR);
  const mRetomar = t.match(RETOMAR);

  // A família reconhecida e NÃO executável vem primeiro: dizer "não sei fazer
  // isso" é melhor do que executar a operação vizinha.
  if (mPausar || mRetomar) {
    return {
      ...NADA,
      evidencias: [...evidencias, (mPausar ?? mRetomar)![0]],
      reconhecidaSemExecucao:
        "Entendi que você quer " +
        (mPausar ? "PAUSAR" : "RETOMAR") +
        " o calendário. Isso eu ainda não faço sozinho — a casa não tem um estado de \"pausado\" que apareça para você no portal, e eu não vou gravar uma pausa que ninguém enxerga. A equipe faz e te confirma por aqui.",
    };
  }

  const dias = maiorNumero(t, DIAS);
  const horas = maiorNumero(t, HORA);
  const horaValida = horas !== null && horas >= 0 && horas <= 23 ? horas : null;

  // Horário só ganha quando ele falou de horário E não falou de deslocar dias:
  // "adiantem um dia e publiquem às 18h" é adiantamento com horário — e nesse
  // caso quem manda é o deslocamento, que é o que ele pediu primeiro.
  if (mAdiantar && mAdiar) {
    // Adiantar e adiar no mesmo texto: escolher um seria chutar a direção.
    return {
      ...NADA,
      evidencias: [...evidencias, mAdiantar[0], mAdiar[0]],
      reconhecidaSemExecucao:
        "Você falou em adiantar e em adiar no mesmo pedido, e eu não vou escolher a direção por você. Me diz qual das duas (ou a equipe confirma) e eu mexo no calendário.",
    };
  }

  if (mAdiantar) {
    return { operacao: "adiantar-calendario", dias, hora: horaValida, reconhecidaSemExecucao: null, evidencias: [...evidencias, mAdiantar[0]] };
  }
  if (mAdiar) {
    return { operacao: "adiar-calendario", dias, hora: horaValida, reconhecidaSemExecucao: null, evidencias: [...evidencias, mAdiar[0]] };
  }
  if (horaValida !== null && FALA_DE_HORARIO.test(t)) {
    return { operacao: "remarcar-horario", dias: null, hora: horaValida, reconhecidaSemExecucao: null, evidencias: [...evidencias, `${horaValida}h`] };
  }

  return NADA;
}

function maiorNumero(t: string, re: RegExp): number | null {
  re.lastIndex = 0;
  const achados = [...t.matchAll(re)]
    .map((m) => {
      const bruto = m[1]!;
      return /^\d+$/.test(bruto) ? Number(bruto) : (NUMERO_POR_EXTENSO[bruto] ?? 0);
    })
    .filter((n) => n > 0);
  return achados.length > 0 ? Math.max(...achados) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O PISO DE AGENDAMENTO — nunca no passado
// ─────────────────────────────────────────────────────────────────────────────

/** Margem entre "agora" e a primeira publicação possível. O relógio de
 *  publicação roda em rodadas; marcar para daqui a um minuto seria marcar para
 *  "quando der", e o cliente lê a data como promessa. */
const MARGEM_MINUTOS = 30;
/** Depois disso, não se publica no mesmo dia: vira o próximo dia às 10h — o
 *  mesmo horário padrão que `publicacao.ts` usa para nascer calendário. */
const ULTIMA_HORA_DO_DIA = 21;
/** E não se publica de madrugada. Uma operação rodada às 23h50 empurraria a
 *  peça para 00h30 — tecnicamente "viável" e péssimo para o cliente, que
 *  acordaria com um carrossel publicado às três da manhã. */
const PRIMEIRA_HORA_DO_DIA = 8;
const HORA_PADRAO = 10;

/**
 * O primeiro horário em que esta casa aceita publicar, contado a partir de
 * `agora`. Exportado porque a resposta ao cliente TEM de dizer qual foi — o
 * pedido dele era "hoje", e se hoje não couber ele precisa saber para quando foi.
 */
export function proximoHorarioViavel(agora: Date): Date {
  const d = new Date(agora.getTime() + MARGEM_MINUTOS * 60_000);
  // Arredonda para a próxima meia hora cheia: data de publicação com minuto
  // quebrado parece defeito, não escolha.
  const minutos = d.getMinutes();
  d.setSeconds(0, 0);
  d.setMinutes(minutos <= 30 ? 30 : 60);
  if (d.getHours() >= ULTIMA_HORA_DO_DIA) {
    d.setDate(d.getDate() + 1);
    d.setHours(HORA_PADRAO, 0, 0, 0);
  } else if (d.getHours() < PRIMEIRA_HORA_DO_DIA) {
    // Inclui o caso em que a margem virou o dia: 23h50 + 30min = 00h30, e 00h30
    // não é horário de publicar nada.
    d.setHours(PRIMEIRA_HORA_DO_DIA, 0, 0, 0);
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// A EXECUÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export interface PecaMovida {
  postId: string;
  legenda: string;
  de: Date;
  para: Date;
}

export interface PecaIntocada {
  postId: string;
  status: string;
  motivo: string;
}

export interface ResultadoDaOperacao {
  ok: boolean;
  operacao: OperacaoId | null;
  movidas: PecaMovida[];
  intocadas: PecaIntocada[];
  /**
   * Quanto o bloco inteiro teve de ser empurrado por causa do piso — em
   * milissegundos. Maior que zero significa "a data que ele pediu já tinha
   * passado", e isso vai DITO na resposta.
   */
  empurradoPeloPiso: boolean;
  /** Por que não rodou. Vazio quando rodou. */
  motivo?: string;
}

export interface EntradaDaOperacao {
  /** Derivado do dono do pedido pela triagem — nunca vindo do texto. */
  clientId: string;
  operacao: OperacaoId;
  dias: number | null;
  hora: number | null;
  /** Injetável para o teste conseguir provar o piso sem depender do relógio. */
  agora?: Date;
}

/**
 * Aplica a operação ao calendário DESTE cliente.
 *
 * Toca `SocialPost.scheduledFor` e mais nada: o estado continua `scheduled`, o
 * conteúdo continua o mesmo, o aval do cliente continua valendo. Uma operação
 * que mudasse estado seria uma segunda porta para "scheduled", e a casa já
 * decidiu que essa porta é uma só (`publicacao.ts`, promoverParaAgendado).
 */
export async function executarOperacaoDeCalendario(
  entrada: EntradaDaOperacao,
): Promise<ResultadoDaOperacao> {
  const agora = entrada.agora ?? new Date();
  const base: ResultadoDaOperacao = {
    ok: false, operacao: entrada.operacao, movidas: [], intocadas: [], empurradoPeloPiso: false,
  };
  if (!entrada.clientId) return { ...base, motivo: "operação sem cliente definido" };

  const definicao = OPERACOES.find((o) => o.id === entrada.operacao);
  if (!definicao) return { ...base, motivo: `operação "${entrada.operacao}" não está no catálogo` };

  // ── O QUE ELE NÃO DISSE NÃO SE COMPLETA ───────────────────────────────────
  if (definicao.exige === "dias" && (entrada.dias === null || entrada.dias <= 0)) {
    return { ...base, motivo: "não deu para saber de quantos dias é a mudança" };
  }
  if (definicao.exige === "hora" && entrada.hora === null) {
    return { ...base, motivo: "não deu para saber para que horário é a mudança" };
  }

  const pecas = await prisma.socialPost.findMany({
    where: { clientId: entrada.clientId, scheduledFor: { not: null } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, status: true, scheduledFor: true, caption: true },
  });
  if (pecas.length === 0) {
    return { ...base, motivo: "não há nenhuma publicação com data no calendário deste cliente" };
  }

  // ── TRAVA 1 e 3 · SÓ `scheduled`, e o resto é RECUSA COM NOME ─────────────
  const operaveis = pecas.filter((p) => p.status === ESTADO_OPERAVEL && p.scheduledFor);
  const intocadas: PecaIntocada[] = pecas
    .filter((p) => p.status !== ESTADO_OPERAVEL)
    .map((p) => ({ postId: p.id, status: p.status, motivo: porqueNaoMexo(p.status) }));

  if (operaveis.length === 0) {
    const estados = [...new Set(intocadas.map((i) => i.status))].join(", ");
    return {
      ...base,
      intocadas,
      motivo: `nenhuma peça do calendário está em estado que eu possa remarcar (encontrei: ${estados || "nenhum estado"})`,
    };
  }

  // ── O DESLOCAMENTO, IGUAL PARA TODAS (trava 4) ────────────────────────────
  const um_dia = 24 * 60 * 60_000;
  const alvos = operaveis.map((p) => {
    const de = p.scheduledFor!;
    let para: Date;
    if (entrada.operacao === "remarcar-horario") {
      para = new Date(de);
      para.setHours(entrada.hora!, 0, 0, 0);
    } else {
      const sinal = entrada.operacao === "adiantar-calendario" ? -1 : 1;
      para = new Date(de.getTime() + sinal * entrada.dias! * um_dia);
      if (entrada.hora !== null) para.setHours(entrada.hora, 0, 0, 0);
    }
    return { id: p.id, legenda: p.caption, de, para };
  });

  // ── TRAVA 2 · NUNCA NO PASSADO, e o empurrão é do BLOCO ───────────────────
  // Empurrar só a primeira peça juntaria ela com a segunda. O bloco inteiro
  // anda o mesmo tanto: o espaçamento que o cliente aprovou continua de pé.
  const piso = proximoHorarioViavel(agora);
  const maisCedo = Math.min(...alvos.map((a) => a.para.getTime()));
  const correcao = maisCedo < piso.getTime() ? piso.getTime() - maisCedo : 0;
  if (correcao > 0) {
    for (const a of alvos) a.para = new Date(a.para.getTime() + correcao);
  }

  const movidas: PecaMovida[] = [];
  for (const a of alvos) {
    // Data que não mudou não vira escrita: gravar o mesmo valor sujaria o
    // `updatedAt` e faria o relatório contar trabalho que não houve.
    if (a.para.getTime() === a.de.getTime()) continue;
    await prisma.socialPost.update({
      where: { id: a.id },
      data: { scheduledFor: a.para },
    });
    movidas.push({ postId: a.id, legenda: a.legenda, de: a.de, para: a.para });
  }

  if (movidas.length === 0) {
    return { ...base, intocadas, motivo: "o calendário já estava exatamente nas datas pedidas" };
  }

  return {
    ok: true,
    operacao: entrada.operacao,
    movidas,
    intocadas,
    empurradoPeloPiso: correcao > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A RESPOSTA AO CLIENTE — as DATAS, nunca um "ok"
// ─────────────────────────────────────────────────────────────────────────────

export function dataLegivel(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} às ${hora}h${min === "00" ? "" : min}`;
}

/**
 * O texto que vai para a conversa do portal.
 *
 * Ele lista PEÇA A PEÇA, de-para. "Pronto, adiantei" não é resposta: o cliente
 * pediu uma mudança de datas e o que ele precisa conferir são as datas.
 */
export function contarAoCliente(r: ResultadoDaOperacao): string {
  const definicao = OPERACOES.find((o) => o.id === r.operacao);
  const linhas: string[] = [];

  if (!r.ok) {
    linhas.push(`Não consegui mexer no calendário: ${r.motivo}.`);
    for (const i of r.intocadas) linhas.push(`• uma peça ${i.motivo}`);
    return linhas.join("\n");
  }

  linhas.push(`Pronto — ${definicao?.verbo ?? "atualizei"} o seu calendário. Ficou assim:`);
  for (const m of r.movidas) {
    const titulo = m.legenda.replace(/\s+/g, " ").trim().slice(0, 60) || "peça sem legenda";
    linhas.push(`• ${dataLegivel(m.de)} → ${dataLegivel(m.para)} — ${titulo}`);
  }
  if (r.empurradoPeloPiso) {
    linhas.push(
      "",
      `Uma observação importante: a data que você pediu já tinha passado quando eu executei, e eu não agendo para trás. Por isso a primeira peça foi para ${dataLegivel(r.movidas[0]!.para)} — o próximo horário viável — e as outras andaram o mesmo tanto, mantendo o espaçamento entre elas.`,
    );
  }
  if (r.intocadas.length > 0) {
    linhas.push("", "Estas eu NÃO mexi:");
    for (const i of r.intocadas) linhas.push(`• uma peça ${i.motivo}`);
  }
  linhas.push("", "As novas datas já estão no seu calendário aqui no portal.");
  return linhas.join("\n");
}
