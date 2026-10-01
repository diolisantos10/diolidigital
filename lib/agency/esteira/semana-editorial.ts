// semana-editorial.ts — A ROTINA SEMANAL: DA PAUTA À ARTE, TODA QUINTA 10H.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO FAZ
// ═══════════════════════════════════════════════════════════════════════════
//
// `calendario-editorial.ts` propõe o MÊS inteiro, só em texto, fase "pauta".
// Este arquivo pega UMA SEMANA de cada vez — a semana que começa na PRÓXIMA
// segunda-feira — e:
//
//   1. FINALIZA a legenda de cada peça em fase "pauta" daquela semana (IA,
//      pelas MESMAS travas de sempre: `conferirDataDaPeca`,
//      `frasesDeDirecaoInterna`, `conferirPilar`) e regrava `scriptJson` com
//      `"fase":"final"`;
//   2. MANDA DESENHAR A ARTE dessas peças, chamando `produzirArtesPendentes`
//      com o recorte NOMEADO (`refazer`) — é isto que tira a pauta da
//      exclusão da rodada global (ver `execution/artes.ts`);
//   3. APLICA O MODO DE APROVAÇÃO da marca (`modo-de-aprovacao.ts`, de W1):
//      piloto automático aprova na hora; semanal abre UM card; aprovação-CEO
//      não faz nada (espera o master); mensal fica para outro bloco.
//
// Tudo isto por QUINTA-FEIRA 10h Brasília (`ehQuinta10hBrasilia`), para a
// semana SEGUINTE (`semanaSeguinte`) — dando ao cliente de sexta até domingo
// para decidir antes de a semana começar. Quem não decidiu até SEXTA 18h
// Brasília (`prazoDeAprovacao`) e está no modo SEMANAL é considerado
// silenciosamente aprovado (`aplicarSilencioSemanal`) — nunca quem pediu
// ajuste, e nunca em APROVACAO_CEO.
//
// ═══════════════════════════════════════════════════════════════════════════
// AS FUNÇÕES DE FUSO SÃO PURAS, E ISSO NÃO É DETALHE
// ═══════════════════════════════════════════════════════════════════════════
//
// `ehQuinta10hBrasilia`, `semanaSeguinte` e `prazoDeAprovacao` não tocam banco
// nem relógio: recebem `agora` como parâmetro e devolvem o veredito. É o que
// permite provar "quinta 13:00Z é 10h Brasília" sem `vi.setSystemTime` e sem
// mockar nada — Brasília é UTC-3 fixo (sem horário de verão desde 2019), e o
// servidor desta casa roda em UTC. Nunca use `new Date()`/`Date.now()` cru
// dentro delas.
//
// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTÊNCIA — POR QUE 12 TIQUES NA MESMA HORA NÃO DUPLICAM
// ═══════════════════════════════════════════════════════════════════════════
//
// `ehQuinta10hBrasilia` é verdadeira a HORA INTEIRA (10:00 a 10:59 Brasília),
// de propósito: o despertador bate a cada 5 minutos, e checar só o minuto
// exato arriscaria perder a batida por um segundo de atraso. `finalizarSemana`
// filtra por `ehFasePauta` — uma peça que já virou "fase":"final" na primeira
// batida simplesmente não aparece mais na segunda: idempotência PELO DADO, não
// por uma trava extra que alguém teria de lembrar de escrever.
// `aplicarSilencioSemanal` é idempotente pelo mesmo motivo (peça já aprovada
// não entra de novo — `cardsQueJaDecidem`) e por construção do próprio
// `registrarAprovacaoPorRegra` (W1), que não deveria aprovar duas vezes a
// mesma peça.

import { instrucaoDoCombo, legendaCitaPreco } from "@/lib/agency/esteira/cardapio";
import "server-only";

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { conferirDataDaPeca, NOME_DO_DIA, type DiaDaSemana } from "@/lib/agency/esteira/calendario-do-cliente";
import { frasesDeDirecaoInterna, motivoDaDirecaoInterna } from "@/lib/agency/esteira/direcao-interna";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { ehFasePauta, type GeradorDeIA } from "@/lib/agency/esteira/calendario-editorial";
import { conferirPromocaoNoFormato } from "@/lib/agency/esteira/promocao-so-em-stories";
import { produzirArtesPendentes } from "@/lib/agency/execution/artes";
import { corpoDoCard, cardsQueJaDecidem, DEPARTAMENTO, type PecaDoCard } from "@/lib/agency/esteira/cards-de-aprovacao";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import {
  modoEmVigor,
  carimboDoModo,
  carimboDoSilencio,
  registrarAprovacaoPorRegra,
  ehPostDeFonteExterna,
} from "@/lib/agency/esteira/modo-de-aprovacao";

/** O dono da chamada de IA de FINALIZAÇÃO — separado do gerador do mês (ver
 *  `lib/ai/donos.ts`): o mês PROPÕE, a semana TORNA definitivo. */
const AGENT_ID = "esteira-semana-editorial";

// ═════════════════════════════════════════════════════════════════════════
// AS FUNÇÕES PURAS DE FUSO
// ═════════════════════════════════════════════════════════════════════════

const HORA_MS = 60 * 60_000;
const DIA_MS = 24 * HORA_MS;
/** Brasília é UTC-3 fixo (sem horário de verão desde 2019). */
const OFFSET_BRASILIA_MS = 3 * HORA_MS;

/** O dia e a hora, em Brasília, deste instante — sem depender do fuso do
 *  processo: desloca o instante em -3h e lê os campos UTC do resultado.
 *  Exportada (bloco MENSAL, 27/09/2026) para `mes-editorial.ts` ler a MESMA
 *  hora civil de Brasília que decide "é quinta 10h?" aqui — nunca uma segunda
 *  cópia desta conta. */
export function civilBrasilia(agora: Date): { ano: number; mesIndex: number; dia: number; diaDaSemana: number; hora: number } {
  const brt = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
  return {
    ano: brt.getUTCFullYear(),
    mesIndex: brt.getUTCMonth(),
    dia: brt.getUTCDate(),
    diaDaSemana: brt.getUTCDay(),
    hora: brt.getUTCHours(),
  };
}

/**
 * É quinta-feira, hora 10 em Brasília? Verdadeira a HORA INTEIRA (10:00 a
 * 10:59 Brasília) — ver o cabeçalho quanto à idempotência que isso exige (e
 * entrega).
 */
export function ehQuinta10hBrasilia(agora: Date): boolean {
  const c = civilBrasilia(agora);
  return c.diaDaSemana === 4 && c.hora === 10;
}

/**
 * A TRAVA DA SEMANA (1C-C2, 28/09/2026, ordem do CEO).
 *
 * A quinta 10h Brasília que GERA a semana de `post.scheduledFor` (a mesma
 * regra de `semanaSeguinte`: a semana de uma peça é gerada na quinta 4 dias
 * antes da segunda daquela semana) TRAVA a peça — e ela fica travada dali em
 * diante, mesmo em rodadas seguintes. Não é o teste "é quinta às 10h agora"
 * (esse é `ehQuinta10hBrasilia`, hora-a-hora, para disparar a rotina); é "essa
 * quinta já passou", monotônico — uma peça da semana corrente (cuja quinta de
 * geração já ficou para trás há dias) está travada tanto quanto uma que
 * acabou de passar da hora exata.
 *
 * Mudar a peça DEPOIS da trava (ajuste do cliente no portal, edição da
 * equipe em `PATCH /api/social-posts/[id]`) vira REGENERAÇÃO DA PEÇA e conta
 * no limite mensal de refações do cliente — ver `limite-de-refacoes.ts`.
 *
 * Post sem `scheduledFor` nunca está travado: sem data não existe semana a
 * travar (é o caso de peça avulsa, fora do calendário editorial).
 *
 * PURA: não toca banco nem relógio.
 */
export function semanaTravada(post: { scheduledFor: Date | null }, agora: Date): boolean {
  if (!post.scheduledFor) return false;
  const c = civilBrasilia(post.scheduledFor);
  const diasDesdeSegunda = (c.diaDaSemana + 6) % 7;
  // "00:00 Brasília" da SEGUNDA da semana da peça — mesma conta de `semanaSeguinte`.
  const segundaDaSemanaUtc = Date.UTC(c.ano, c.mesIndex, c.dia - diasDesdeSegunda, 3, 0, 0, 0);
  // A quinta que gera essa semana é 4 dias ANTES dessa segunda (quinta+4=segunda),
  // às 10h Brasília — mesmo instante que `ehQuinta10hBrasilia` testaria "sim"
  // para essa semana, na primeira hora em que ele seria verdadeiro.
  const geracaoQuinta10hUtc = segundaDaSemanaUtc - 4 * DIA_MS + 10 * HORA_MS;
  return agora.getTime() >= geracaoQuinta10hUtc;
}

export interface JanelaDaSemana {
  /** Segunda 00:00:00.000 Brasília, como instante UTC. */
  de: Date;
  /** Domingo 23:59:59.999 Brasília, como instante UTC. */
  ate: Date;
}

/**
 * A semana SEGUINTE à semana que contém `agora`, em Brasília — segunda 00:00
 * até domingo 23:59:59.999. Chamada numa quinta-feira, devolve a segunda a
 * segunda logo depois do fim de semana, e vai até o domingo daquela semana.
 */
export function semanaSeguinte(agora: Date): JanelaDaSemana {
  const c = civilBrasilia(agora);
  // Segunda=0 ... domingo=6, para poder subtrair e achar a segunda desta semana.
  const diasDesdeSegunda = (c.diaDaSemana + 6) % 7;
  // Date.UTC(Y, M, D, 3, 0, 0, 0) É o instante UTC de "00:00 Brasília no dia
  // civil D" — D pode vir negativo ou maior que o mês; Date.UTC normaliza.
  const inicioDaSemanaAtualUtc = Date.UTC(c.ano, c.mesIndex, c.dia - diasDesdeSegunda, 3, 0, 0, 0);
  const inicioDaSemanaSeguinteUtc = inicioDaSemanaAtualUtc + 7 * DIA_MS;
  const fimDaSemanaSeguinteUtc = inicioDaSemanaSeguinteUtc + 7 * DIA_MS - 1;
  return { de: new Date(inicioDaSemanaSeguinteUtc), ate: new Date(fimDaSemanaSeguinteUtc) };
}

/**
 * O prazo de decisão do cliente para esta semana: sexta-feira 18:00 Brasília
 * ANTERIOR a ela (= 21:00 UTC, porque Brasília é UTC-3) — a segunda da semana
 * menos 3 dias, mais 18 horas.
 */
export function prazoDeAprovacao(semana: JanelaDaSemana): Date {
  return new Date(semana.de.getTime() - 3 * DIA_MS + 18 * HORA_MS);
}

/**
 * O PRAZO, EM PORTUGUÊS, PARA O CLIENTE LER — "sexta-feira, 02/10, às 18h".
 *
 * Existe para o portal (`GET /api/portal/esteira`) não reimplementar a
 * conversão para Brasília: é a mesma `civilBrasilia` que decide "é quinta 10h?"
 * aqui em cima, agora exportada por este único ponto de saída. Nasce em W4
 * para alimentar o aviso de `modoAprovacao === "SEMANAL"` antes do "aprovar
 * tudo" (`AprovacoesDoCliente.tsx`).
 */
export function prazoEmPortugues(prazo: Date): string {
  const c = civilBrasilia(prazo);
  const dia = String(c.dia).padStart(2, "0");
  const mes = String(c.mesIndex + 1).padStart(2, "0");
  const hora = String(c.hora).padStart(2, "0");
  return `${NOME_DO_DIA[c.diaDaSemana as DiaDaSemana]}, ${dia}/${mes}, às ${hora}h`;
}

// ═════════════════════════════════════════════════════════════════════════
// A FINALIZAÇÃO DA LEGENDA — mesmas travas, um post por vez
// ═════════════════════════════════════════════════════════════════════════

function isoUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function legendaFinal(legenda: string, hashtags: unknown): string {
  const tags = (Array.isArray(hashtags) ? hashtags.filter((h): h is string => typeof h === "string") : [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");
  const corpo = legenda.trim();
  return tags ? `${corpo}\n\n${tags}` : corpo;
}

function montarSystemPromptFinal(): string {
  return (
    "Você é o editor final de social media de uma agência de marketing brasileira. Vai revisar e " +
    "FINALIZAR a legenda de UM post de Instagram antes de ela seguir para aprovação e ir ao ar. " +
    "Mantenha o pilar e a direção de arte informados — eles já foram decididos e não são seus para " +
    "mudar. Escreva em português do Brasil, falando diretamente com o público, PRONTA PARA PUBLICAR — " +
    'nunca em terceira pessoa ("post que destaca...") e nunca com instrução de produção dentro do ' +
    "texto. Só pode afirmar sobre a marca o que estiver nas REGRAS DA MARCA fornecidas. Se a legenda " +
    "citar um dia da semana, ele TEM de ser o dia real da data marcada. Responda usando a ferramenta."
  );
}

function montarUserPromptFinal(args: {
  rascunho: string;
  pilar: string | null;
  direcaoDeArte: string | null;
  data: Date;
  marcaTexto: string;
  /** O combo desta peça (W12b, 27/09/2026) — quando presente, a IA TEM que
   *  manter o preço literal na legenda final. Ver `finalizarUmPost`. */
  combo?: { nome: string; preco: string };
  /**
   * O PEDIDO DE AJUSTE, com as palavras do cliente (1C-C2, 28/09/2026) —
   * presente SÓ quando esta finalização é uma REFAÇÃO de card de semana
   * (`refazerPecaDaSemana`), nunca na rotina normal de quinta-feira. Sem isto,
   * "refazer a peça" e "gerar a legenda pela primeira vez" seriam o MESMO
   * prompt, e a IA não saberia o que o cliente pediu de diferente.
   */
  instrucaoDoAjuste?: string;
}): string {
  const nomeDoDia = NOME_DO_DIA[args.data.getUTCDay() as DiaDaSemana];
  return (
    (args.marcaTexto ? `REGRAS DA MARCA (obedeça):\n${args.marcaTexto}\n\n` : "") +
    `Data do post: ${isoUtc(args.data)} (${nomeDoDia}).\n` +
    (args.pilar ? `Pilar: ${args.pilar}\n` : "") +
    (args.direcaoDeArte ? `Direção de arte (a imagem já decidida — não mude): ${args.direcaoDeArte}\n` : "") +
    (args.combo
      ? `${instrucaoDoCombo(args.combo)}.\n`
      : "") +
    (args.instrucaoDoAjuste
      ? `PEDIDO DE AJUSTE DO CLIENTE (aplique exatamente isto, mantendo o resto do texto o mais próximo ` +
        `possível do rascunho): ${args.instrucaoDoAjuste}\n`
      : "") +
    `Rascunho atual da legenda:\n${args.rascunho}\n\n` +
    "Devolva a legenda final (pronta para publicar) e de 3 a 6 hashtags (sem o símbolo #)."
  );
}

/** O combo (W12b, 27/09/2026) gravado no `scriptJson` na criação da peça —
 *  `null` quando ausente ou ilegível. Snapshot, não índice: relê o MESMO
 *  nome+preço que `comboParaStory` escolheu, mesmo que o cardápio da marca
 *  mude entre a proposta e a finalização semanal. */
function comboDoScriptJson(scriptJson: string | null | undefined): { nome: string; preco: string } | null {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    const c = o?.combo as { nome?: unknown; preco?: unknown } | undefined;
    if (c && typeof c.nome === "string" && typeof c.preco === "string") {
      return { nome: c.nome, preco: c.preco };
    }
    return null;
  } catch {
    return null;
  }
}

/** `true` quando o post é um STORY DERIVADO (W12b, "capa_do_post_do_dia") —
 *  nasce sem legenda própria e nunca é finalizado por esta rotina: a arte
 *  dele vem do POST PAI na hora da publicação (W11), nunca daqui. Ver o
 *  cabeçalho de `calendario-editorial.ts` para o motivo de ele nascer em
 *  "fase":"pauta" permanentemente. */
export function ehCapaDerivada(scriptJson: string | null | undefined): boolean {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    return !!o && o.tipo === "capa_derivada";
  } catch {
    return false;
  }
}

function esquemaFinal(): Record<string, unknown> {
  return {
    type: "object" as const,
    properties: { legenda: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } },
    required: ["legenda", "hashtags"],
  };
}

/** Regrava `scriptJson` trocando a fase para "final" — preserva o resto do
 *  objeto (`origemGerador`, `mes`). JSON quebrado (não deveria acontecer, já
 *  que só chega aqui quem passou por `ehFasePauta`) vira um objeto novo, nunca
 *  lança: perder o rastro de origem é ruim, travar a finalização é pior. */
function scriptJsonComFaseFinal(bruto: string | null): string {
  try {
    const o = bruto ? (JSON.parse(bruto) as Record<string, unknown>) : {};
    return JSON.stringify({ ...o, fase: "final" });
  } catch {
    return JSON.stringify({ fase: "final" });
  }
}

interface PostEmPauta {
  id: string;
  workspaceId: string;
  clientId: string | null;
  caption: string;
  /** Decide a trava de PROMOÇÃO SÓ EM STORIES (27/09/2026) — ver `finalizarUmPost`. */
  format: string;
  pillar: string | null;
  artDirection: string | null;
  scheduledFor: Date | null;
  scriptJson: string | null;
}

type ResultadoDaFinalizacaoDoPost = { ok: true } | { ok: false; motivo: string };

/**
 * Finaliza a legenda de UM post — as MESMAS travas de `publicacao.ts`, na
 * entrada. Peça que falha fica em fase "pauta" (não regrava nada): a próxima
 * rodada semanal tenta de novo, e o motivo vai para o placar do chamador.
 */
async function finalizarUmPost(args: {
  post: PostEmPauta;
  marcaTexto: string;
  gerar: GeradorDeIA;
  /** Ver o campo de mesmo nome em `montarUserPromptFinal`. */
  instrucaoDoAjuste?: string;
}): Promise<ResultadoDaFinalizacaoDoPost> {
  const { post } = args;
  if (!post.clientId) return { ok: false, motivo: "post sem cliente definido" };
  if (!post.scheduledFor) return { ok: false, motivo: "post sem data marcada" };

  const combo = comboDoScriptJson(post.scriptJson);

  const r = await args.gerar({
    system: montarSystemPromptFinal(),
    user: montarUserPromptFinal({
      rascunho: post.caption,
      pilar: post.pillar,
      direcaoDeArte: post.artDirection,
      data: post.scheduledFor,
      marcaTexto: args.marcaTexto,
      combo: combo ?? undefined,
      instrucaoDoAjuste: args.instrucaoDoAjuste,
    }),
    maxTokens: 700,
    esquema: esquemaFinal(),
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    postId: post.id,
    agentId: AGENT_ID,
  });
  if (!r.ok) return { ok: false, motivo: r.error };
  const dados = r.data as { legenda?: unknown; hashtags?: unknown };
  if (typeof dados.legenda !== "string" || !dados.legenda.trim()) {
    return { ok: false, motivo: 'a IA não devolveu "legenda"' };
  }

  const caption = legendaFinal(dados.legenda, dados.hashtags);

  const internas = frasesDeDirecaoInterna(caption);
  if (internas.length > 0) return { ok: false, motivo: motivoDaDirecaoInterna(internas) };

  // ── PROMOÇÃO SÓ EM STORIES (CEO, 27/09/2026) ────────────────────────────
  // A MESMA trava do gerador (`calendario-editorial.ts`, `conferirPeca`),
  // agora na FINALIZAÇÃO: a legenda final pode ter mudado em relação ao
  // rascunho, e a direção de arte também é conferida — as duas viram pixel ou
  // letra na peça que vai ao ar.
  const vereditoDePromocao = conferirPromocaoNoFormato({
    formato: post.format,
    texto: `${caption}\n${post.artDirection ?? ""}`,
  });
  if (!vereditoDePromocao.passa) return { ok: false, motivo: vereditoDePromocao.motivo };

  const dataCheck = conferirDataDaPeca({ texto: caption, agendadaPara: post.scheduledFor });
  if (!dataCheck.passa) return { ok: false, motivo: dataCheck.motivo };

  const pilarCheck = conferirPilar(post.pillar, { exigido: true });
  if (pilarCheck.bloqueado) return { ok: false, motivo: motivoCurto(pilarCheck) };

  // ── COMBO: O PREÇO NUNCA SAI DA LEGENDA (W12b, 27/09/2026) ───────────────
  // A finalização pode reescrever a legenda inteira — reconfere o MESMO
  // preço literal que `calendario-editorial.ts` gravou, byte a byte.
  if (combo && !combo.preco && legendaCitaPreco(caption)) {
    return { ok: false, motivo: "combo sem preço cadastrado, mas a legenda citou um valor — preço não se inventa" };
  }
  if (combo && combo.preco && !caption.includes(combo.preco)) {
    return {
      ok: false,
      motivo:
        `o preço do combo saiu da legenda na finalização — esperado "${combo.nome}" com o preço ` +
        `"${combo.preco}"`,
    };
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { caption, scriptJson: scriptJsonComFaseFinal(post.scriptJson) },
  });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════
// refazerPecaDaSemana — A REFAÇÃO DE UMA PEÇA DO CALENDÁRIO (1C-C2, 28/09/2026)
// ═════════════════════════════════════════════════════════════════════════
//
// Post do calendário editorial (`calendario-editorial.ts`) nunca tem
// `Deliverable` — ver `refacao.ts` para o achado completo do que acontecia
// antes deste bloco. Esta função é o MESMO caminho da rotina semanal
// (`finalizarUmPost` + `produzirArtesPendentes({ refazer })`), com dois
// ajustes: mira em UMA peça só (o recorte nomeado é `[postId]`, nunca a
// rodada global) e o pedido do cliente entra no prompt (`instrucaoDoAjuste`).
export type RefazerPecaDaSemanaSaida = { ok: true } | { ok: false; motivo: string };

export async function refazerPecaDaSemana(input: {
  postId: string;
  /** As palavras do cliente (ou da equipe) sobre o que muda nesta peça. */
  comentario: string;
  /** Injeção do provedor de IA — só para teste. */
  gerar?: GeradorDeIA;
}): Promise<RefazerPecaDaSemanaSaida> {
  const post = await prisma.socialPost
    .findUnique({
      where: { id: input.postId },
      select: {
        id: true, workspaceId: true, clientId: true, caption: true, format: true,
        pillar: true, artDirection: true, scheduledFor: true, scriptJson: true, deliverableId: true,
      },
    })
    .catch(() => null);
  if (!post) return { ok: false, motivo: "peça não encontrada" };
  // A trava de identidade: isto é card de semana só enquanto não tiver
  // Deliverable. Peça de entrega segue pelo caminho de `refacao.ts`, nunca
  // por aqui — misturar os dois é o defeito que este bloco existe para evitar.
  if (post.deliverableId) {
    return { ok: false, motivo: "peça pertence a um entregável — não é do calendário editorial" };
  }
  if (!post.clientId) return { ok: false, motivo: "peça sem cliente definido" };

  const marca = await contratoDeMarca(post.clientId).catch(() => null);
  const marcaTexto = marca && !marca.naoConstituida ? marca.texto : "";
  const gerar = input.gerar ?? generate;

  const resultado = await finalizarUmPost({
    post: {
      id: post.id,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      caption: post.caption,
      format: post.format,
      pillar: post.pillar,
      artDirection: post.artDirection,
      scheduledFor: post.scheduledFor,
      scriptJson: post.scriptJson,
    },
    marcaTexto,
    gerar,
    instrucaoDoAjuste: input.comentario,
  });
  if (!resultado.ok) return resultado;

  // A ARTE, com o recorte NOMEADO — a MESMA linha que a rotina semanal usa
  // para tirar a peça da rodada global (ver o cabeçalho de `execution/artes.ts`).
  // `mediaUrl` já preenchido não impede a refação: `refazer` força.
  await produzirArtesPendentes({ refazer: [post.id] }).catch(() => { /* best-effort, mesma régua da rotina semanal */ });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════
// O MODO DE APROVAÇÃO — abrir o card (SEMANAL/MENSAL) ou registrar por regra
// ═════════════════════════════════════════════════════════════════════════

/**
 * Abre UM card de aprovação com as peças finalizadas do PERÍODO — reusa
 * `corpoDoCard`/`createApprovalRequest` (a MESMA régua de
 * `app/api/social-posts/aprovacao/route.ts`), não a rota: aqui não há sessão
 * de staff, é a própria esteira abrindo o pedido. É o "aprovar semana" (ou
 * "aprovar mês") do portal — confirmado em
 * `app/api/portal/approvals/route.ts:360-386`: o clique de aprovação do
 * cliente promove TODAS as peças do card de uma vez (`agendarPecasAprovadas`
 * com `postsDoCard` inteiro), nunca peça a peça.
 *
 * Compartilhada entre o modo SEMANAL (`finalizarSemana`, abaixo) e o MENSAL
 * (`mes-editorial.ts`, `finalizarMes`) — a mesma lição do cabeçalho de
 * `cards-de-aprovacao.ts`: duas cópias começam idênticas e divergem no
 * primeiro ajuste. O `requestedBy` (linha abaixo) é quem diz de qual rotina
 * veio o card, não uma segunda implementação.
 *
 * Idempotente pelo DADO: peça já num card pendente ou já aprovada pelo
 * cliente (`cardsQueJaDecidem`) não entra de novo.
 */
export async function abrirCardDoPeriodo(args: {
  clientId: string;
  postIds: string[];
  /** "esteira:rotina-semanal" ou "esteira:rotina-mensal" — quem abriu o
   *  pedido. Nunca `client:` (isso seria a agência se fazendo passar pelo
   *  cliente). Padrão: a rotina semanal, para não quebrar quem já chamava
   *  sem este campo. */
  requestedBy?: string;
}): Promise<string> {
  const ja = await cardsQueJaDecidem(args.clientId);
  const restantes = args.postIds.filter((id) => !ja.emCardPendente.has(id) && !ja.aprovadaPeloCliente.has(id));
  if (restantes.length === 0) {
    return "nada a abrir — todas as peças já estão num card pendente ou já decididas";
  }
  const pecas = await prisma.socialPost.findMany({
    where: { id: { in: restantes } },
    select: {
      id: true, clientId: true, caption: true, format: true,
      pillar: true, status: true, visibility: true, scenesJson: true, scheduledFor: true,
    },
  });
  const { titulo, reviewNote, ordenados } = corpoDoCard(pecas as PecaDoCard[]);
  const aprovacao = await createApprovalRequest({
    clientId: args.clientId,
    department: DEPARTAMENTO,
    // "esteira:" — quem abriu foi uma rotina automática, não uma pessoa com
    // sessão nem o fluxo administrativo por nome. Grafia própria, nunca
    // "client:" (isso seria a agência se fazendo passar pelo cliente).
    requestedBy: args.requestedBy ?? "esteira:rotina-semanal",
    clientVisible: true,
    reviewNote,
    sourcePostIds: ordenados.map((p) => p.id),
  });
  return `card aberto (${aprovacao.id}): "${titulo}", ${ordenados.length} peça(s)`;
}

// ═════════════════════════════════════════════════════════════════════════
// finalizarPecasNaJanela — O NÚCLEO PARTILHADO entre semana e mês
// ═════════════════════════════════════════════════════════════════════════

export interface FinalizarPecasNaJanelaEntrada {
  workspaceId?: string;
  clientId?: string;
  de: Date;
  ate: Date;
  /** Injeção do provedor de IA — só para teste. */
  gerar?: GeradorDeIA;
  /** `true` quando quem chama é a rotina SEMANAL (`finalizarSemana`): exclui,
   *  ANTES de gastar IA/arte, clientes cujo `modoEmVigor` na data da PEÇA seja
   *  "MENSAL" — essas peças são finalizadas por `finalizarMes` (dia 25), nunca
   *  aqui. Sem isto, uma peça em fase "pauta" de um cliente MENSAL que caia
   *  dentro da janela semanal era finalizada, paga em arte, e ficava para
   *  sempre fora de qualquer card — `finalizarMes` só varre `finalizadosPorCliente`
   *  DESTA MESMA chamada dele (achado 1, Q4-qualidade, 27/09/2026).
   *  `finalizarMes` nunca passa isto: ele já filtra os clientes para só MENSAL
   *  antes de chamar (`mes-editorial.ts`), e excluir de novo zeraria tudo. */
  excluirMensal?: boolean;
}

export interface FinalizarPecasNaJanelaSaida {
  clientesProcessados: number;
  postsFinalizados: number;
  falhas: Array<{ postId: string; motivo: string }>;
  /** Os ids finalizados NESTA chamada, por cliente — nunca a peça que já
   *  estava em fase "final" antes dela (idempotência pelo DADO). Cliente sem
   *  NENHUMA peça finalizada com sucesso nesta chamada não aparece aqui — é
   *  a mesma régua que já existia dentro de `finalizarSemana` antes desta
   *  extração (o `continue` logo depois do laço de finalização). Quem chama
   *  decide o que fazer com o resultado: aplicar o modo de aprovação por
   *  SEMANA (`finalizarSemana`) ou abrir UM card com o MÊS inteiro
   *  (`mes-editorial.ts`, `finalizarMes`). */
  finalizadosPorCliente: Map<string, string[]>;
}

/**
 * FINALIZA a legenda de cada peça em fase "pauta" da janela `[de, ate]` (IA,
 * pelas mesmas travas de sempre) e MANDA DESENHAR A ARTE — sem decidir nada
 * sobre aprovação. Extraído de `finalizarSemana` (bloco MENSAL, 27/09/2026)
 * para as duas rotinas — semanal e mensal — nunca terem uma segunda cópia
 * desta lógica: a mesma lição do cabeçalho de `cards-de-aprovacao.ts` ("duas
 * cópias começam idênticas e divergem no primeiro ajuste").
 *
 * IDEMPOTENTE: sem peça em fase "pauta" na janela, devolve zeros sem chamar
 * IA nem arte — é o que torna seguro chamar de novo (mesmo tique repetido, ou
 * o botão manual depois do relógio já ter passado).
 */
export async function finalizarPecasNaJanela(
  entrada: FinalizarPecasNaJanelaEntrada,
): Promise<FinalizarPecasNaJanelaSaida> {
  const gerar = entrada.gerar ?? generate;
  const saida: FinalizarPecasNaJanelaSaida = {
    clientesProcessados: 0, postsFinalizados: 0, falhas: [], finalizadosPorCliente: new Map(),
  };

  const candidatos = await prisma.socialPost
    .findMany({
      where: {
        ...(entrada.workspaceId ? { workspaceId: entrada.workspaceId } : {}),
        ...(entrada.clientId ? { clientId: entrada.clientId } : {}),
        scheduledFor: { gte: entrada.de, lte: entrada.ate },
        status: "draft",
      },
      select: {
        id: true, workspaceId: true, clientId: true, caption: true, format: true,
        pillar: true, artDirection: true, scheduledFor: true, scriptJson: true,
      },
    })
    .catch(() => [] as PostEmPauta[]);

  // "capa_derivada" (W12b) NUNCA finaliza aqui — nasce em "fase":"pauta" DE
  // PROPÓSITO e permanentemente (ver o cabeçalho de `calendario-editorial.ts`),
  // sem legenda própria e sem direção de arte para a IA reescrever.
  //
  // Peça de FONTE EXTERNA (J4, 28/09/2026 — hoje só City Jobs) também nunca
  // finaliza aqui, pela mesma razão de fundo: ela chega PRONTA da fonte
  // externa (contrato §11 — "a Dioli não edita a arte"), nunca passa por
  // "fase":"pauta" e não deveria ganhar legenda reescrita por IA nem entrar
  // na rodada de arte desta rotina. Na prática `ehFasePauta` já devolve
  // `false` para ela (nunca grava o marcador de fase) — este filtro é
  // DEFESA EM PROFUNDIDADE, explícita, contra uma mudança futura em
  // `ehFasePauta` acabar arrastando peça de fonte externa para dentro da
  // rotina editorial por acidente.
  let pauta = candidatos.filter(
    (p) => p.clientId && ehFasePauta(p.scriptJson) && !ehCapaDerivada(p.scriptJson) && !ehPostDeFonteExterna(p.scriptJson),
  );

  // ANTES DE GASTAR: exclui clientes em modo MENSAL quando quem chama é a
  // rotina SEMANAL — ver o comentário de `excluirMensal` na entrada. O modo é
  // lido POR PEÇA (`post.scheduledFor`), a mesma régua de `modo-de-aprovacao.ts`
  // em toda a casa, nunca um corte por cliente inteiro.
  if (entrada.excluirMensal && pauta.length > 0) {
    const idsUnicos = [...new Set(pauta.map((p) => p.clientId as string))];
    const clientesInfo = await prisma.client
      .findMany({
        where: { id: { in: idsUnicos } },
        select: { id: true, modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
      })
      .catch(() => [] as Array<{
        id: string; modoAprovacao: string; modoPendente: string | null; modoPendenteVigenteEm: Date | null;
      }>);
    const porId = new Map(clientesInfo.map((c) => [c.id, c]));
    pauta = pauta.filter((p) => {
      const c = porId.get(p.clientId as string);
      // Cliente não encontrado OU sem `scheduledFor` (não deveria acontecer —
      // o `where` já filtrou por essa faixa — mas ausência de informação
      // nunca vira exclusão silenciosa): segue o caminho normal.
      if (!c || !p.scheduledFor) return true;
      return modoEmVigor(c, p.scheduledFor) !== "MENSAL";
    });
  }
  if (pauta.length === 0) return saida;

  const porCliente = new Map<string, PostEmPauta[]>();
  for (const p of pauta) {
    const lista = porCliente.get(p.clientId as string) ?? [];
    lista.push(p);
    porCliente.set(p.clientId as string, lista);
  }

  for (const [clientId, posts] of porCliente) {
    saida.clientesProcessados++;
    const marca = await contratoDeMarca(clientId).catch(() => null);
    const marcaTexto = marca && !marca.naoConstituida ? marca.texto : "";

    const finalizadosDesteCliente: string[] = [];
    for (const post of posts) {
      const r = await finalizarUmPost({ post, marcaTexto, gerar });
      if (r.ok) {
        saida.postsFinalizados++;
        finalizadosDesteCliente.push(post.id);
      } else {
        saida.falhas.push({ postId: post.id, motivo: r.motivo });
      }
    }
    if (finalizadosDesteCliente.length === 0) continue;

    // A ARTE, chamada com o recorte NOMEADO — é o que a tira da exclusão de
    // "fase pauta" da rodada global (ver `execution/artes.ts`).
    await produzirArtesPendentes({ refazer: finalizadosDesteCliente }).catch(() => { /* best-effort */ });

    saida.finalizadosPorCliente.set(clientId, finalizadosDesteCliente);
  }

  return saida;
}

// ═════════════════════════════════════════════════════════════════════════
// finalizarSemana
// ═════════════════════════════════════════════════════════════════════════

export interface FinalizarSemanaEntrada {
  workspaceId?: string;
  clientId?: string;
  de: Date;
  ate: Date;
  agora?: Date;
  /** Injeção do provedor de IA — só para teste. */
  gerar?: GeradorDeIA;
}

export interface FinalizarSemanaSaida {
  clientesProcessados: number;
  postsFinalizados: number;
  falhas: Array<{ postId: string; motivo: string }>;
  /** Uma linha por cliente, com o que o modo de aprovação fez. */
  aprovacoes: Array<{ clientId: string; modo: string; resultado: string }>;
}

/**
 * Finaliza a legenda das peças em fase "pauta" da janela `[de, ate]` (via
 * `finalizarPecasNaJanela`, o núcleo partilhado com o mensal), manda desenhar
 * a arte delas e aplica o modo de aprovação da marca.
 *
 * IDEMPOTENTE: se não sobrar nenhuma peça em fase "pauta" na janela, devolve
 * zeros sem chamar IA, sem chamar arte e sem tocar aprovação nenhuma — é o que
 * torna seguro rodar esta função de novo (mesmo tique repetido, ou o botão
 * manual depois do relógio já ter passado).
 */
export async function finalizarSemana(entrada: FinalizarSemanaEntrada): Promise<FinalizarSemanaSaida> {
  const agora = entrada.agora ?? new Date();

  const nucleo = await finalizarPecasNaJanela({
    workspaceId: entrada.workspaceId,
    clientId: entrada.clientId,
    de: entrada.de,
    ate: entrada.ate,
    gerar: entrada.gerar,
    // MENSAL não escapa por aqui — quem cuida é `finalizarMes`, no dia 25
    // (achado 1, Q4-qualidade, 27/09/2026).
    excluirMensal: true,
  });
  const saida: FinalizarSemanaSaida = {
    clientesProcessados: nucleo.clientesProcessados,
    postsFinalizados: nucleo.postsFinalizados,
    falhas: nucleo.falhas,
    aprovacoes: [],
  };

  for (const [clientId, finalizadosDesteCliente] of nucleo.finalizadosPorCliente) {
    // O MODO DE APROVAÇÃO, depois de finalizar — nunca antes.
    const cliente = await prisma.client
      .findUnique({
        where: { id: clientId },
        select: { workspaceId: true, modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
      })
      .catch(() => null);
    if (!cliente) continue;

    // O modo é o da DATA DA PEÇA (o começo da semana que está sendo
    // finalizada), não o do instante em que o relógio bateu — a mesma régua
    // que `modo-de-aprovacao.ts` documenta para a trava de publicação. Uma
    // troca de modo com vigência bem no início desta semana (`entrada.de`)
    // decide por ESTA leitura, e é a MESMA data que `registrarAprovacaoPorRegra`
    // vai reconferir peça a peça — usar `agora` (ainda na semana anterior,
    // quinta-feira) poderia divergir do que aquela função decide e derrubar o
    // lote inteiro por um carimbo que "não vale no modo em vigor".
    const modo = modoEmVigor(
      {
        modoAprovacao: cliente.modoAprovacao,
        modoPendente: cliente.modoPendente,
        modoPendenteVigenteEm: cliente.modoPendenteVigenteEm,
      },
      entrada.de,
    );

    if (modo === "PILOTO_AUTOMATICO") {
      const r = await registrarAprovacaoPorRegra({
        workspaceId: cliente.workspaceId,
        clientId,
        postIds: finalizadosDesteCliente,
        carimbo: carimboDoModo("PILOTO_AUTOMATICO", agora),
      });
      saida.aprovacoes.push({
        clientId, modo,
        resultado: r.ok ? `aprovado automaticamente — ${r.agendados} agendado(s)` : r.motivo,
      });
    } else if (modo === "SEMANAL") {
      const resultado = await abrirCardDoPeriodo({ clientId, postIds: finalizadosDesteCliente });
      saida.aprovacoes.push({ clientId, modo, resultado });
    } else if (modo === "MENSAL") {
      // O MÊS JÁ CUIDA (27/09/2026, bloco MENSAL) — `mes-editorial.ts`
      // (`finalizarMes`) gera, finaliza e abre o card do mês inteiro no dia
      // 25, com a MESMA `finalizarPecasNaJanela` usada aqui em cima. Nada a
      // fazer nesta rotina: nem card, nem registro em `ActivityEvent` — um
      // evento por SEMANA para uma marca cujo evento de verdade é MENSAL
      // seria ruído a cada rodada (a mesma lição que os alarmes desta casa já
      // pagaram: alarme sobre o normal ensina a ignorar alarme).
      saida.aprovacoes.push({ clientId, modo, resultado: "nada a fazer aqui — o mês cuida (mes-editorial.ts)" });
    } else {
      // APROVACAO_CEO: não faz nada. Espera o master, pela rota de W1
      // (`/api/social-posts/aprovacao-ceo`).
      saida.aprovacoes.push({ clientId, modo, resultado: "espera o master" });
    }
  }

  return saida;
}

// ═════════════════════════════════════════════════════════════════════════
// aplicarSilencioSemanal
// ═════════════════════════════════════════════════════════════════════════

export interface SilencioSemanalSaida {
  clientesTratados: number;
  postsSilenciados: number;
}

/**
 * Depois de sexta 18h Brasília (ou depois — idempotente), peças da semana
 * SEGUINTE já finalizadas (fase "final") de marcas cujo modo EM VIGOR é
 * SEMANAL e que o cliente ainda não decidiu (nem aprovou, nem pediu ajuste)
 * são consideradas aprovadas POR REGRA — o silêncio do cliente vale como sim,
 * neste modo e só neste modo.
 *
 * NUNCA aplica antes do prazo (`prazoDeAprovacao`): chamada antes da sexta
 * 18h devolve zeros sem tocar peça nenhuma. NUNCA em APROVACAO_CEO — quem não
 * respondeu nesse modo espera o master, sempre.
 *
 * ── PEÇA COM PEDIDO DE AJUSTE PENDENTE NUNCA É PUBLICADA POR SILÊNCIO
 *    (achado da `qualidade`, C10, 27/09/2026 — regressão do conserto do
 *    ajuste sem mira) ──────────────────────────────────────────────────────
 *
 * Este comentário dizia "peça em `revision_requested` nunca aparece nesta
 * consulta, porque pedir ajuste tira a peça desse estado" — **verdade só
 * para o card comum**. No card de SEMANA, quando o ajuste do cliente não tem
 * mira reconhecível, a peça NUNCA sai de `"draft"` (ela não é promovida a
 * `revision_requested`, de propósito — Achado 2, Q4-qualidade) e o
 * `ApprovalRequest` volta a `"pending"` para o cliente decidir de novo. Por
 * `status`, isso é indistinguível de um card recém-aberto que ninguém tocou:
 * as DUAS coisas entrariam nesta consulta como candidatas ao silêncio.
 *
 * `pedidoDeAjustePendente` (`cardsQueJaDecidem`) é o que diferencia: o
 * cliente JÁ escreveu um pedido de ajuste sobre esta peça (o comentário
 * existe, mesmo que a casa não tenha entendido qual peça é), e silêncio
 * NUNCA pode valer como "sim" quando ele já disse alguma coisa — mesmo que a
 * coisa dita ainda não tenha sido atendida.
 */
export async function aplicarSilencioSemanal(agora: Date): Promise<SilencioSemanalSaida> {
  const saida: SilencioSemanalSaida = { clientesTratados: 0, postsSilenciados: 0 };

  const semana = semanaSeguinte(agora);
  const prazo = prazoDeAprovacao(semana);
  if (agora.getTime() < prazo.getTime()) return saida;

  const candidatos = await prisma.socialPost
    .findMany({
      where: { scheduledFor: { gte: semana.de, lte: semana.ate }, status: "draft" },
      select: { id: true, clientId: true, scriptJson: true },
    })
    .catch(() => [] as Array<{ id: string; clientId: string | null; scriptJson: string | null }>);

  // ── PEÇA DE FONTE EXTERNA NUNCA É APROVADA POR SILÊNCIO (Achado 1, J4,
  //    28/09/2026 — Q8-qualidade) ──────────────────────────────────────────
  //
  // Este filtro varria TUDO que "não está em fase pauta" como "já finalizado,
  // pronto para o cliente decidir" — e uma peça do City Jobs NUNCA passa por
  // "fase":"pauta" (ela nasce pronta, fora da rotina editorial): por
  // `ehFasePauta`, ela sempre pareceu "finalizada", mesmo em `status:"draft"`
  // com `scheduledFor` real e SEM NUNCA ter sido vista por um humano. Contrato
  // §6.1 promete revisão humana para `com_risco` "com qualquer prioridade" —
  // sem esta exclusão, uma marca do City Jobs em modo SEMANAL/MENSAL aprovaria
  // por silêncio uma vaga com_risco na sexta 18h, sem o CEO nunca ter clicado
  // em nada. `ehPostDeFonteExterna` é a MESMA marca que a integração grava
  // (`lib/integracoes/cityjobs/posts.ts`) — nunca uma segunda régua.
  const finalizados = candidatos.filter(
    (p) => p.clientId && !ehFasePauta(p.scriptJson) && !ehPostDeFonteExterna(p.scriptJson),
  );
  if (finalizados.length === 0) return saida;

  const porCliente = new Map<string, string[]>();
  for (const p of finalizados) {
    const lista = porCliente.get(p.clientId as string) ?? [];
    lista.push(p.id);
    porCliente.set(p.clientId as string, lista);
  }

  for (const [clientId, postIds] of porCliente) {
    const cliente = await prisma.client
      .findUnique({
        where: { id: clientId },
        select: { workspaceId: true, modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
      })
      .catch(() => null);
    if (!cliente) continue;

    // Modo da DATA DA SEMANA (`semana.de`), não do instante do relógio — ver o
    // mesmo comentário em `finalizarSemana`, e pelo mesmo motivo:
    // `registrarAprovacaoPorRegra` reconfere o carimbo contra o modo na data
    // de CADA peça (`post.scheduledFor`, dentro desta mesma semana).
    const modo = modoEmVigor(
      {
        modoAprovacao: cliente.modoAprovacao,
        modoPendente: cliente.modoPendente,
        modoPendenteVigenteEm: cliente.modoPendenteVigenteEm,
      },
      semana.de,
    );
    if (modo !== "SEMANAL") continue;

    const ja = await cardsQueJaDecidem(clientId);
    const semDecisao = postIds.filter(
      (id) => !ja.aprovadaPeloCliente.has(id) && !ja.pedidoDeAjustePendente?.has(id),
    );
    saida.clientesTratados++;
    if (semDecisao.length === 0) continue;

    const r = await registrarAprovacaoPorRegra({
      workspaceId: cliente.workspaceId,
      clientId,
      postIds: semDecisao,
      carimbo: carimboDoSilencio(agora),
    });
    if (r.ok) saida.postsSilenciados += r.agendados;
  }

  return saida;
}
