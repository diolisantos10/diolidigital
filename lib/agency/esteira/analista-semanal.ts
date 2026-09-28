// analista-semanal.ts — TODA SEGUNDA, ANTES DE GERAR A SEMANA, A CASA OLHA
// PARA TRÁS. SERVER-ONLY.
//
// ═══════════════════════════════════════════════════════════════════════════
// A ORDEM DO CEO (F2-F1, 27/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Por marca, toda SEGUNDA de manhã (08h Brasília = 11h UTC), ANTES de gerar a
// semana seguinte: lê os insights dos posts publicados na semana anterior
// (alcance, salvamentos, compartilhamentos, comentários, cliques); grava o que
// funcionou e o que não funcionou COM O `postId` COMO EVIDÊNCIA; PROPÕE nova
// versão do DNA (sem apagar a anterior — `editarDna` cria versão "proposto");
// ajusta a semana seguinte; e escreve um relatório curto por marca, para uma
// tela do CEO.
//
// ─── REAPROVEITAMENTO, NÃO DUPLICAÇÃO (parecer `meta`, M1) ───────────────────
//
// A leitura de métrica é `lerMetricasDosPosts` (`lib/integrations/meta/
// leitura.ts`) — a MESMA régua de rate limit, cache e "vazio = não medido" que
// `app/api/meta/insights` já usa. Este arquivo NUNCA chama a Graph direto, e
// nunca pede `impressions` (descontinuada — parecer M1, item 3).
//
// ─── POR QUE A MEDIANA É "TODO O HISTÓRICO MEDIDO", INCLUSIVE A SEMANA ATUAL ─
//
// A primeira vez que uma marca é analisada não tem "semana anterior" nenhuma
// para comparar — só a semana que está sendo lida agora. Em vez de recusar
// classificar a primeira semana, a mediana da marca é calculada sobre TUDO o
// que já foi medido: os posts de todas as `AnaliseSemanal` anteriores deste
// cliente, mais os da própria semana em análise. É a mediana REAL da marca até
// agora — nunca um recorte menor por conveniência — e resolve "marca nova" sem
// inventar dado nenhum (mesma régua de sempre: ausência de informação não é
// informação).
//
// ─── A EVIDÊNCIA É COMPOSTA, DE PROPÓSITO ────────────────────────────────────
//
// `engajamentoDoPost` soma alcance + salvos + compartilhamentos + comentários
// + cliques QUANDO MEDIDOS (nunca conta ausência como zero). Um score composto
// é o que uma amostra semanal pequena permite classificar com confiança —
// discriminar "qual métrica específica melhorou" exigiria histórico maior do
// que esta ficha tem escopo para construir. Quem quiser evidência por métrica
// nomeada (ex.: "salvos especificamente") pede uma ficha nova.
//
// ─── O DNA: SÓ PROPÕE, NUNCA INVENTA UM DO ZERO ──────────────────────────────
//
// `DnaDaMarcaConteudo` (`dna-da-marca.ts`) não tem "peso de pilar" como campo —
// pilares lá são `{nome, posts}`. Os ajustes de PESO (que alimentam o PACOTE
// da marca, via `pacoteComAjustesAplicados`) vivem em `ajustesJson`, não no
// DNA. O que o DNA ganha aqui são os HORÁRIOS sugeridos (união com
// `melhoresHorarios`, sem duplicar o que já existe) e uma OBSERVAÇÃO textual,
// com evidência, resumindo os pilares que subiram/desceram — é o que a ordem
// do CEO pede ("ajustes de pilares/horários"), respeitando o contrato
// existente em vez de acrescentar um campo novo por conta própria (mudar o
// contrato do DNA é decisão de quem é dono dele, fora desta ficha). Cliente
// sem DNA vigente: a análise roda do mesmo jeito (`dnaPropostoVersao: null`)
// — DNA nasce em `gerarDnaDaMarca`, fora do escopo deste arquivo.
//
// ─── O AJUSTE SÓ MEXE NO GERADOR DEPOIS DE "APLICADA" ────────────────────────
//
// `rodarAnaliseSemanal` só GRAVA a proposta (`status: "proposta"`). Nada muda
// no calendário até um master chamar `aplicarAjustes`. O hook no gerador
// (`ajustesDaUltimaAnaliseAplicada`/`pacoteComAjustesAplicados`, usados em
// `calendario-editorial.ts`) só lê análises com `status === "aplicada"` —
// proposta que ninguém aplicou não muda nada, por construção.
//
// ─── PII ──────────────────────────────────────────────────────────────────────
//
// Nada aqui grava e-mail ou telefone de cliente. `metricasJson` guarda só
// `SocialPost.id`/`externalPostId` (ids internos e da Meta, não PII) e números.

import "server-only";

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { lerMetricasDosPosts, type MetricasDoPost } from "@/lib/integrations/meta/leitura";
import { lerPacote, type PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";
import { dnaVigente, editarDna, type DnaDaMarcaConteudo } from "@/lib/agency/esteira/dna-da-marca";
import { conferirNumeroComFonte } from "@/lib/agency/esteira/prova-com-fonte";

/** O dono desta chamada de IA (`lib/ai/donos.ts`) — relatório curto, sempre com
 *  `clientId` (item explícito da ficha: "custo com clientId"). */
const AGENT_ID = "esteira-analista-semanal";

// ═════════════════════════════════════════════════════════════════════════
// FUSO — PURO. Mesma régua de `semana-editorial.ts` (`civilBrasilia`), NÃO
// importada de lá: são blocos paralelos, e a conta é de poucas linhas — mesmo
// raciocínio já registrado no cabeçalho de `dna-da-marca.ts` para
// `diaEHoraBrasilia` (evita dependência cruzada entre dois blocos que evoluem
// em fichas diferentes). Coberta por teste próprio.
// ═════════════════════════════════════════════════════════════════════════

const HORA_MS = 60 * 60_000;
const DIA_MS = 24 * HORA_MS;
/** Brasília é UTC-3 fixo (sem horário de verão desde 2019). */
const OFFSET_BRASILIA_MS = 3 * HORA_MS;

function civilBrasilia(agora: Date): { diaDaSemana: number; hora: number; ano: number; mesIndex: number; dia: number } {
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
 * Segunda-feira, 08h Brasília (11h UTC) — vale a HORA INTEIRA (11:00–11:59
 * UTC), mesma régua de `ehQuinta10hBrasilia` (`semana-editorial.ts`): o
 * despertador bate a cada 5 minutos, e travar no minuto exato arriscaria
 * perder a batida por um segundo de atraso.
 */
export function ehSegunda08hBrasilia(agora: Date): boolean {
  const c = civilBrasilia(agora);
  return c.diaDaSemana === 1 && c.hora === 8;
}

export interface JanelaDaSemana {
  /** Segunda 00:00:00.000 Brasília, como instante UTC. */
  de: Date;
  /** Domingo 23:59:59.999 Brasília, como instante UTC. */
  ate: Date;
}

/**
 * A semana ANTERIOR à que contém `agora` (segunda a domingo, Brasília) — a
 * semana que acabou de terminar e que a segunda de manhã precisa analisar.
 * Mesma matemática de `semanaSeguinte` (`semana-editorial.ts`), com o sinal
 * trocado. PURA.
 */
export function semanaAnterior(agora: Date): JanelaDaSemana {
  const c = civilBrasilia(agora);
  const diasDesdeSegunda = (c.diaDaSemana + 6) % 7;
  const inicioDestaSemanaUtc = Date.UTC(c.ano, c.mesIndex, c.dia - diasDesdeSegunda, 3, 0, 0, 0);
  return {
    de: new Date(inicioDestaSemanaUtc - 7 * DIA_MS),
    ate: new Date(inicioDestaSemanaUtc - 1),
  };
}

function isoDoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A janela da semana a partir da SEGUNDA (Brasília, "AAAA-MM-DD") —
 * usada por `POST /api/social/analises/rodar` quando o master pede uma
 * semana ESPECÍFICA (reprocessamento/backfill), em vez da última semana
 * fechada. `null` para entrada fora do formato — nunca adivinha uma data.
 * PURA.
 */
export function semanaDaData(segundaAAAAMMDD: string): JanelaDaSemana | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(segundaAAAAMMDD.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mesIndex = Number(m[2]) - 1;
  const dia = Number(m[3]);
  const inicioUtc = Date.UTC(ano, mesIndex, dia, 3, 0, 0, 0); // 00:00 Brasília
  if (Number.isNaN(inicioUtc)) return null;
  return { de: new Date(inicioUtc), ate: new Date(inicioUtc + 7 * DIA_MS - 1) };
}

// ═════════════════════════════════════════════════════════════════════════
// O CONTRATO — as formas gravadas em `metricasJson`/`funcionouJson`/
// `naoFuncionouJson`/`ajustesJson`
// ═════════════════════════════════════════════════════════════════════════

export interface MetricaDoPostParaAnalise {
  socialPostId: string;
  externalPostId: string | null;
  formato: string;
  pilar: string | null;
  /** ISO. */
  publicadoEm: string;
  /** `null` = NÃO MEDIDO — nunca "deu zero" (regra da Meta e da casa). */
  alcance: number | null;
  salvos: number | null;
  compartilhamentos: number | null;
  comentarios: number | null;
  /** Hoje sempre `null` para post orgânico — a Meta não devolve "clicks" no
   *  set de insights de mídia vigente (parecer M1). O campo existe para
   *  quando/onde essa métrica vier a existir, sem precisar de migration nova. */
  cliques: number | null;
  /** `false` quando NENHUMA métrica foi lida (erro tolerado por-mídia, ou a
   *  leitura da conexão inteira falhou) — nunca inferido de valores nulos. */
  medido: boolean;
}

export interface EvidenciaDeClassificacao {
  /** Sempre "engajamento" hoje — ver o cabeçalho ("A EVIDÊNCIA É COMPOSTA"). */
  metrica: string;
  valor: number;
  mediaDaMarca: number;
}

export interface ClassificacaoDoPost {
  socialPostId: string;
  pilar: string | null;
  formato: string;
  porque: string;
  evidencia: EvidenciaDeClassificacao;
}

export interface ResultadoDaClassificacao {
  funcionou: ClassificacaoDoPost[];
  naoFuncionou: ClassificacaoDoPost[];
  /** Posts sem métrica medida, ou histórico insuficiente para uma mediana
   *  confiável — NUNCA entram em `funcionou`/`naoFuncionou`. "Não dá para
   *  concluir" nunca é inventado como um dos dois. */
  naoDaParaConcluir: { socialPostId: string; motivo: string }[];
}

export interface AjusteDePilar {
  tipo: "peso_pilar";
  pilar: string;
  direcao: "aumentar" | "diminuir";
  porque: string;
  evidencia: { posts: string[]; metrica: string };
}

export interface AjusteDeHorario {
  tipo: "horario";
  diaDaSemana: number;
  hora: string;
  porque: string;
  evidencia: { amostras: number; engajamentoMedio: number };
}

export type AjusteProposto = AjusteDePilar | AjusteDeHorario;

// ═════════════════════════════════════════════════════════════════════════
// classificarDesempenho — PURA, DETERMINÍSTICA
// ═════════════════════════════════════════════════════════════════════════

/** Mínimo de posts MEDIDOS no histórico da marca para uma mediana confiável.
 *  Abaixo disso, TODOS os posts da semana viram "não dá para concluir" — nunca
 *  um veredito inventado sobre amostra insuficiente. */
export const MINIMO_DE_AMOSTRAS_PARA_CLASSIFICAR = 3;

/** Soma de alcance + salvos + compartilhamentos + comentários + cliques,
 *  contando SÓ o que foi medido — `null` quando nada foi medido (nunca 0
 *  fingido de ausência). PURA. */
export function engajamentoDoPost(
  m: Pick<MetricaDoPostParaAnalise, "alcance" | "salvos" | "compartilhamentos" | "comentarios" | "cliques">,
): number | null {
  const partes = [m.alcance, m.salvos, m.compartilhamentos, m.comentarios, m.cliques].filter(
    (v): v is number => typeof v === "number",
  );
  if (partes.length === 0) return null;
  return partes.reduce((a, b) => a + b, 0);
}

function mediana(valores: number[]): number {
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[meio]! : (ordenado[meio - 1]! + ordenado[meio]!) / 2;
}

/**
 * `{funcionou, naoFuncionou}` — DETERMINÍSTICO: compara o engajamento de cada
 * post da semana contra a MEDIANA do histórico da marca (`historicoDaMarca`).
 * Sem amostra suficiente no histórico, ou sem métrica medida no post, ou em
 * caso de empate exato com a mediana: "não dá para concluir" — nunca inventa
 * um veredito. PURA: sem banco, sem IA, sem relógio.
 */
export function classificarDesempenho(
  metricas: MetricaDoPostParaAnalise[],
  historicoDaMarca: MetricaDoPostParaAnalise[],
): ResultadoDaClassificacao {
  const funcionou: ClassificacaoDoPost[] = [];
  const naoFuncionou: ClassificacaoDoPost[] = [];
  const naoDaParaConcluir: { socialPostId: string; motivo: string }[] = [];

  const engajamentosDoHistorico = historicoDaMarca
    .map((m) => engajamentoDoPost(m))
    .filter((v): v is number => v !== null);

  if (engajamentosDoHistorico.length < MINIMO_DE_AMOSTRAS_PARA_CLASSIFICAR) {
    for (const m of metricas) {
      naoDaParaConcluir.push({
        socialPostId: m.socialPostId,
        motivo:
          `não dá para concluir — a marca tem apenas ${engajamentosDoHistorico.length} post(s) medido(s) ` +
          `no histórico, mínimo é ${MINIMO_DE_AMOSTRAS_PARA_CLASSIFICAR}`,
      });
    }
    return { funcionou, naoFuncionou, naoDaParaConcluir };
  }

  const media = mediana(engajamentosDoHistorico);

  for (const m of metricas) {
    const engajamento = engajamentoDoPost(m);
    if (engajamento === null) {
      naoDaParaConcluir.push({
        socialPostId: m.socialPostId,
        motivo: "não dá para concluir — nenhuma métrica foi medida para este post",
      });
      continue;
    }
    const evidencia: EvidenciaDeClassificacao = { metrica: "engajamento", valor: engajamento, mediaDaMarca: media };
    const base = { socialPostId: m.socialPostId, pilar: m.pilar, formato: m.formato, evidencia };
    if (engajamento > media) {
      funcionou.push({
        ...base,
        porque: `engajamento (${engajamento}) ficou acima da mediana da marca (${media})`,
      });
    } else if (engajamento < media) {
      naoFuncionou.push({
        ...base,
        porque: `engajamento (${engajamento}) ficou abaixo da mediana da marca (${media})`,
      });
    } else {
      naoDaParaConcluir.push({
        socialPostId: m.socialPostId,
        motivo: `não dá para concluir — engajamento (${engajamento}) empatou exatamente com a mediana da marca (${media})`,
      });
    }
  }
  return { funcionou, naoFuncionou, naoDaParaConcluir };
}

// ═════════════════════════════════════════════════════════════════════════
// ajustesPropostos — PURA
// ═════════════════════════════════════════════════════════════════════════

/** Mínimo de posts do MESMO pilar acima/abaixo da mediana para propor um
 *  ajuste de peso — 1: numa cadência semanal (poucos posts por pilar), exigir
 *  mais que isso silenciaria quase toda semana. O ajuste sempre carrega os
 *  ids como evidência, nunca "porque sim". */
export const MINIMO_DE_POSTS_POR_PILAR_PARA_AJUSTAR = 1;

/** Quantos horários do topo do DNA (melhores horários medidos no acervo)
 *  entram como sugestão de ajuste, no máximo — mais que isso é lista, não
 *  ajuste priorizado. */
const MAXIMO_DE_HORARIOS_SUGERIDOS = 3;

function porPilar(classificacao: ClassificacaoDoPost[]): Map<string, ClassificacaoDoPost[]> {
  const mapa = new Map<string, ClassificacaoDoPost[]>();
  for (const c of classificacao) {
    if (!c.pilar) continue;
    mapa.set(c.pilar, [...(mapa.get(c.pilar) ?? []), c]);
  }
  return mapa;
}

/**
 * Os ajustes propostos para a semana seguinte, SEMPRE com evidência (posts
 * que sustentam a afirmação). PURA: sem banco, sem IA.
 *
 *   • peso de pilar: só para pilares que o PACOTE já declara (nunca inventa
 *     pilar novo) — um pilar com posts acima da mediana propõe "aumentar", um
 *     com posts abaixo propõe "diminuir".
 *   • horário: só quando o DNA vigente mede um horário de bom engajamento que
 *     o pacote AINDA não usa — nunca duplica um horário já declarado.
 *
 * `pacote`/`dnaVigenteConteudo` ausentes (`null`) fazem a categoria
 * correspondente ficar vazia — nunca bloqueia a outra.
 */
export function ajustesPropostos(
  classificacao: ResultadoDaClassificacao,
  pacote: PacoteDaMarca | null,
  dnaVigenteConteudo: DnaDaMarcaConteudo | null,
): AjusteProposto[] {
  const ajustes: AjusteProposto[] = [];

  if (pacote) {
    const pilaresDoPacote = new Set(pacote.pilares.map((p) => p.nome));
    const funcionouPorPilar = porPilar(classificacao.funcionou);
    const naoFuncionouPorPilar = porPilar(classificacao.naoFuncionou);

    for (const [pilar, itens] of funcionouPorPilar) {
      if (!pilaresDoPacote.has(pilar) || itens.length < MINIMO_DE_POSTS_POR_PILAR_PARA_AJUSTAR) continue;
      ajustes.push({
        tipo: "peso_pilar",
        pilar,
        direcao: "aumentar",
        porque: `${itens.length} post(s) do pilar "${pilar}" ficaram acima da mediana de engajamento da marca`,
        evidencia: { posts: itens.map((i) => i.socialPostId), metrica: "engajamento" },
      });
    }
    for (const [pilar, itens] of naoFuncionouPorPilar) {
      if (!pilaresDoPacote.has(pilar) || itens.length < MINIMO_DE_POSTS_POR_PILAR_PARA_AJUSTAR) continue;
      ajustes.push({
        tipo: "peso_pilar",
        pilar,
        direcao: "diminuir",
        porque: `${itens.length} post(s) do pilar "${pilar}" ficaram abaixo da mediana de engajamento da marca`,
        evidencia: { posts: itens.map((i) => i.socialPostId), metrica: "engajamento" },
      });
    }
  }

  if (dnaVigenteConteudo) {
    const horariosDoPacote = new Set(pacote?.horarios ?? []);
    for (const h of dnaVigenteConteudo.melhoresHorarios.slice(0, MAXIMO_DE_HORARIOS_SUGERIDOS)) {
      if (horariosDoPacote.has(h.hora)) continue;
      ajustes.push({
        tipo: "horario",
        diaDaSemana: h.diaDaSemana,
        hora: h.hora,
        porque:
          `o DNA da marca mede engajamento médio ${h.engajamentoMedio} às ${h.hora} ` +
          `(${h.amostras} amostra(s) do acervo), e o pacote ainda não usa este horário`,
        evidencia: { amostras: h.amostras, engajamentoMedio: h.engajamentoMedio },
      });
    }
  }

  return ajustes;
}

// ═════════════════════════════════════════════════════════════════════════
// pacoteComAjustesAplicados — PURA. É o que o GERADOR consulta.
// ═════════════════════════════════════════════════════════════════════════

/** ±20% por rodada de ajuste — passo pequeno e repetível, nunca um salto que
 *  reescreveria o pacote da marca de uma semana para a outra. */
const PASSO_DE_AJUSTE_DE_PESO = 0.2;
/** Piso do peso — nunca zera um pilar por ajuste automático (isso é decisão de
 *  gente, via `PUT /pacote`, não da rotina semanal). */
const PESO_MINIMO = 0.1;

/**
 * Aplica os ajustes (pesos de pilar, horários) a uma CÓPIA do pacote — nunca
 * muta o pacote gravado no `Client` (quem grava é `PUT /api/agency/clients/
 * [id]/pacote`, sempre por decisão humana). PURA.
 *
 * Ajuste de pilar cujo nome não existe mais no pacote (a marca renomeou o
 * pilar entre a análise e agora) é ignorado, silenciosamente — aplicar um
 * peso a um pilar que não existe seria inventar um pilar novo por conta
 * própria.
 */
export function pacoteComAjustesAplicados(pacote: PacoteDaMarca, ajustes: readonly AjusteProposto[]): PacoteDaMarca {
  const pilares = pacote.pilares.map((p) => ({ ...p }));
  for (const a of ajustes) {
    if (a.tipo !== "peso_pilar") continue;
    const alvo = pilares.find((p) => p.nome === a.pilar);
    if (!alvo) continue;
    const fator = a.direcao === "aumentar" ? 1 + PASSO_DE_AJUSTE_DE_PESO : 1 - PASSO_DE_AJUSTE_DE_PESO;
    alvo.peso = Math.max(PESO_MINIMO, Math.round(alvo.peso * fator * 100) / 100);
  }

  const horarios = new Set(pacote.horarios);
  for (const a of ajustes) {
    if (a.tipo === "horario") horarios.add(a.hora);
  }

  return { ...pacote, pilares, horarios: [...horarios] };
}

/**
 * Os ajustes da ÚLTIMA análise `"aplicada"` deste cliente — `null` quando não
 * há nenhuma (proposta nunca aplicada não muda nada, por construção: o hook
 * só lê o que passou por `aplicarAjustes`).
 */
export async function ajustesDaUltimaAnaliseAplicada(clientId: string): Promise<AjusteProposto[] | null> {
  try {
    const registro = await prisma.analiseSemanal.findFirst({
      where: { clientId, status: "aplicada" },
      orderBy: { semanaDe: "desc" },
      select: { ajustesJson: true },
    });
    if (!registro) return null;
    const v = JSON.parse(registro.ajustesJson) as unknown;
    return Array.isArray(v) ? (v as AjusteProposto[]) : null;
  } catch {
    return null;
  }
}

/**
 * O PONTO ÚNICO que o gerador chama (`calendario-editorial.ts`): lê a última
 * análise aplicada deste cliente e devolve o pacote já ajustado — ou o pacote
 * tal como veio, quando não há ajuste aplicado nenhum. Nunca lança: falha de
 * leitura é "sem ajuste", nunca bloqueio da geração do mês.
 */
export async function pacoteComUltimaAnaliseAplicada(
  clientId: string,
  pacote: PacoteDaMarca,
): Promise<PacoteDaMarca> {
  const ajustes = await ajustesDaUltimaAnaliseAplicada(clientId).catch(() => null);
  if (!ajustes || ajustes.length === 0) return pacote;
  return pacoteComAjustesAplicados(pacote, ajustes);
}

// ═════════════════════════════════════════════════════════════════════════
// O RELATÓRIO — IA advisory, com prova-com-fonte, e piso determinístico
// ═════════════════════════════════════════════════════════════════════════

/** A assinatura de `generate()` — mesma forma de `GeradorDeIA` em
 *  `calendario-editorial.ts`; não importada de lá (ver o cabeçalho). */
export type GeradorDeIA = (opcoes: Parameters<typeof generate>[0]) => ReturnType<typeof generate>;

/**
 * As afirmações com FONTE que sustentam o relatório: um percentual PRÉ-
 * CALCULADO EM CÓDIGO (nunca pela IA — mesma régua de `mes.ts`/
 * `escreverRelatorio`: "a comparação é feita em código") por post
 * classificado, mais o resumo de cada ajuste proposto. `conferirNumeroComFonte`
 * barra qualquer percentual que a IA escrever e que não bata com um destes.
 */
function fontesDeProvaDaAnalise(
  classificacao: ResultadoDaClassificacao,
  ajustes: readonly AjusteProposto[],
): { afirmacao: string; fonte: string }[] {
  const fontes: { afirmacao: string; fonte: string }[] = [];
  for (const c of [...classificacao.funcionou, ...classificacao.naoFuncionou]) {
    const { valor, mediaDaMarca } = c.evidencia;
    const percentual = mediaDaMarca !== 0 ? Math.round(((valor - mediaDaMarca) / mediaDaMarca) * 100) : 0;
    const sinal = percentual >= 0 ? "+" : "";
    fontes.push({
      afirmacao:
        `post ${c.socialPostId} (pilar ${c.pilar ?? "sem pilar"}): ${sinal}${percentual}% em relação à ` +
        `mediana da marca em engajamento (valor ${valor}, mediana ${mediaDaMarca})`,
      fonte: "leitura de métricas da Meta via lerMetricasDosPosts",
    });
  }
  for (const a of ajustes) {
    fontes.push({ afirmacao: a.porque, fonte: "ajustesPropostos" });
  }
  return fontes;
}

// ═════════════════════════════════════════════════════════════════════════
// NÚMERO CRU — régua PRÓPRIA deste analista (achado `qualidade`, Q7, F3)
// ═════════════════════════════════════════════════════════════════════════
//
// `conferirNumeroComFonte` (`prova-com-fonte.ts`) só reconhece como "número de
// prova" o que carrega um sufixo/unidade da lista fechada de lá (%, x, vezes,
// R$, mil, UNIDADES_DE_RESULTADO) — vocabulário pensado para peça de
// marketing. "O post p1 teve 340 comentários" não bate NENHUM desses padrões,
// então passa sem checar: número inventado chegaria à tela do CEO como se
// fosse medido. NÃO mexemos em `prova-com-fonte.ts` — ele serve outros
// relatórios com outro vocabulário, e alargar a lista fechada de lá para
// "comentários"/"alcance"/"salvos" resolveria este relatório e abriria falso
// positivo nos outros (ex.: "20 avaliações" já é válido lá por outro motivo).
//
// Esta régua é ADICIONAL: TODO número inteiro/decimal que sobrar depois de
// mascarar datas, horários e dia-do-mês-que-existe-nesta-semana precisa
// aparecer, como substring, em `metricasJson` (os valores brutos medidos:
// alcance, salvos, compartilhamentos, comentários, cliques) OU nas afirmações
// com fonte (`fontesDeProvaDaAnalise`, que já carrega valor/mediana/
// percentual). Não bateu com nenhum dos dois: número cru, sem fonte —
// mesmo destino de sempre (regenera 1x, depois cai no piso determinístico).

/** O dia do mês (Brasília) de cada dia dentro da janela — para a IA poder
 *  escrever "no dia 24" sem que "24" seja cobrado como se fosse métrica. */
function diasDoMesNaSemana(semana: JanelaDaSemana): number[] {
  const dias = new Set<number>();
  for (let t = semana.de.getTime(); t <= semana.ate.getTime(); t += DIA_MS) {
    dias.add(civilBrasilia(new Date(t)).dia);
  }
  return [...dias];
}

/** Mascara datas, horários e dia-do-mês-da-semana com "•" (mesmo comprimento,
 *  para os índices do restante do texto não se moverem) — reimplementado
 *  aqui, de propósito, em vez de importar de `prova-com-fonte.ts` (ver
 *  cabeçalho desta seção: aquele arquivo serve outro vocabulário). */
function mascararParaNumeroCru(texto: string, semana: JanelaDaSemana): string {
  let mascarado = texto;
  const IGNORAR_REGEXES: RegExp[] = [
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // datas "27/09/2026", "27/09"
    /\b\d{4}-\d{2}-\d{2}\b/g, // datas ISO "2026-09-27"
    /\b([01]?\d|2[0-3]):[0-5]\d\b/g, // horários "09:00", "18:30"
  ];
  for (const re of IGNORAR_REGEXES) {
    mascarado = mascarado.replace(re, (trecho) => "•".repeat(trecho.length));
  }
  for (const dia of diasDoMesNaSemana(semana)) {
    mascarado = mascarado.replace(new RegExp(`\\b${dia}\\b`, "g"), (trecho) => "•".repeat(trecho.length));
  }
  return mascarado;
}

/** Todo número inteiro/decimal "cru" do texto (sem sufixo/unidade), na ordem
 *  em que aparece, sem duplicata — datas/horários/dia-do-mês já mascarados. */
function extrairNumerosCrus(texto: string, semana: JanelaDaSemana): string[] {
  const mascarado = mascararParaNumeroCru(texto, semana);
  const vistos = new Set<string>();
  const encontrados: string[] = [];
  for (const m of mascarado.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
    const idx = m.index ?? 0;
    const trecho = texto.slice(idx, idx + m[0].length).trim();
    if (trecho && !vistos.has(trecho)) {
      vistos.add(trecho);
      encontrados.push(trecho);
    }
  }
  return encontrados;
}

/** Os valores brutos MEDIDOS (nunca `null`) de `metricasJson`, como texto —
 *  o pool que sustenta um número cru como "340" quando "340" é de fato um dos
 *  valores medidos (alcance, salvos, compartilhamentos, comentários, cliques). */
function valoresBrutosComoTexto(metricas: readonly MetricaDoPostParaAnalise[]): string {
  return metricas
    .flatMap((m) => [m.alcance, m.salvos, m.compartilhamentos, m.comentarios, m.cliques])
    .filter((v): v is number => typeof v === "number")
    .map((v) => `valor bruto medido: ${v}`)
    .join(" | ");
}

export type VereditoDoNumeroCru =
  | { passa: true }
  | { passa: false; motivo: string; numeros: string[] };

/**
 * Confere se todo número cru (sem sufixo/unidade) do texto aparece em
 * `metricas` (valores brutos medidos) ou em `fontes` (afirmações com valor/
 * mediana/percentual). Texto sem número cru nenhum passa direto. PURA.
 */
export function conferirNumeroCruDoRelatorio(a: {
  texto: string;
  semana: JanelaDaSemana;
  metricas: readonly MetricaDoPostParaAnalise[];
  fontes: { afirmacao: string; fonte: string }[];
}): VereditoDoNumeroCru {
  const numeros = extrairNumerosCrus(a.texto, a.semana);
  if (numeros.length === 0) return { passa: true };

  const pool = [...a.fontes.map((f) => f.afirmacao), valoresBrutosComoTexto(a.metricas)].join(" | ");
  const semFonte = numeros.filter((numero) => !pool.includes(numero));
  if (semFonte.length === 0) return { passa: true };

  return {
    passa: false,
    motivo: `preciso confirmar a fonte: ${semFonte.join(", ")}`,
    numeros: semFonte,
  };
}

/**
 * O relatório SEM IA — construído só com o que já está em `metricasJson`/
 * `classificacao`/`ajustes`. Nunca falha, nunca inventa: é o piso de
 * `gerarRelatorioSemanal` quando a IA está fora do ar, malformada, ou insiste
 * num número sem fonte mesmo após a regeneração.
 */
function relatorioDeterministico(args: {
  nomeDoNegocio: string;
  semana: JanelaDaSemana;
  classificacao: ResultadoDaClassificacao;
  ajustes: readonly AjusteProposto[];
}): string {
  const { funcionou, naoFuncionou, naoDaParaConcluir } = args.classificacao;
  const linhas = [
    `Semana de ${isoDoDia(args.semana.de)} a ${isoDoDia(args.semana.ate)} — ${args.nomeDoNegocio}`,
    `${funcionou.length} post(s) acima da mediana da marca, ${naoFuncionou.length} abaixo, ` +
      `${naoDaParaConcluir.length} sem dado suficiente para concluir.`,
    ...funcionou.map((c) => `- funcionou: post ${c.socialPostId} — ${c.porque}`),
    ...naoFuncionou.map((c) => `- não funcionou: post ${c.socialPostId} — ${c.porque}`),
    args.ajustes.length > 0
      ? `Ajustes propostos para a semana seguinte: ${args.ajustes.map((a) => a.porque).join("; ")}`
      : "Nenhum ajuste proposto para a semana seguinte.",
  ];
  return linhas.join("\n");
}

/**
 * O relatório CURTO para a tela do CEO. IA é ADVISORY (Lei 2): se falhar, vier
 * malformada, ou citar um número sem fonte MESMO APÓS regenerar uma vez, o
 * relatório determinístico assume — nunca derruba a análise (a linha em
 * `AnaliseSemanal` é gravada de qualquer jeito, com ou sem IA).
 */
export async function gerarRelatorioSemanal(args: {
  workspaceId: string;
  clientId: string;
  nomeDoNegocio: string;
  semana: JanelaDaSemana;
  classificacao: ResultadoDaClassificacao;
  ajustes: readonly AjusteProposto[];
  /** Os valores brutos medidos desta semana (`metricasJson`) — sustenta a
   *  régua de número cru (`conferirNumeroCruDoRelatorio`) abaixo. Ausente
   *  (chamada de teste antiga, sem esta ficha) = pool só com `fontes`. */
  metricas?: readonly MetricaDoPostParaAnalise[];
  gerar?: GeradorDeIA;
}): Promise<string> {
  const fontes = fontesDeProvaDaAnalise(args.classificacao, args.ajustes);
  const metricas = args.metricas ?? [];
  const piso = () => relatorioDeterministico(args);

  const linhasFuncionou = args.classificacao.funcionou.map((c) => `- post ${c.socialPostId}: ${c.porque}`).join("\n");
  const linhasNaoFuncionou = args.classificacao.naoFuncionou.map((c) => `- post ${c.socialPostId}: ${c.porque}`).join("\n");
  const linhasAjustes = args.ajustes.map((a) => `- ${a.porque}`).join("\n");
  const linhasNumeros = fontes.map((f) => `- ${f.afirmacao}`).join("\n");

  const gerar = args.gerar ?? generate;
  const pedir = () =>
    gerar({
      system:
        "Você escreve um relatório CURTO (para o dono de uma agência ler em 30 segundos) sobre o " +
        "desempenho semanal do Instagram de UM cliente. Use SOMENTE os números e percentuais fornecidos " +
        "abaixo — é PROIBIDO calcular, arredondar ou inventar qualquer percentual, comparação ou número " +
        "que não esteja EXATAMENTE na lista de NÚMEROS DISPONÍVEIS. Responda SOMENTE com JSON: " +
        '{"relatorio": string}',
      user:
        `Cliente: ${args.nomeDoNegocio}\nSemana: ${isoDoDia(args.semana.de)} a ${isoDoDia(args.semana.ate)}\n\n` +
        `O QUE FUNCIONOU:\n${linhasFuncionou || "- nenhum post ficou acima da mediana esta semana"}\n\n` +
        `O QUE NÃO FUNCIONOU:\n${linhasNaoFuncionou || "- nenhum post ficou abaixo da mediana esta semana"}\n\n` +
        `AJUSTES PROPOSTOS PARA A SEMANA SEGUINTE:\n${linhasAjustes || "- nenhum ajuste proposto"}\n\n` +
        `NÚMEROS DISPONÍVEIS (é PROIBIDO usar qualquer número fora desta lista):\n${linhasNumeros || "- nenhum"}`,
      maxTokens: 500,
      workspaceId: args.workspaceId,
      agentId: AGENT_ID,
      clientId: args.clientId,
    });

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await pedir().catch(() => null);
    if (!r || !r.ok) continue;
    const dados = r.data as Record<string, unknown> | null;
    const texto = typeof dados?.relatorio === "string" ? dados.relatorio.trim() : "";
    if (!texto) continue;
    const veredito = conferirNumeroComFonte({ texto, fontes });
    if (!veredito.passa) continue; // número sem fonte (%, x, vezes, R$, mil, unidade) — regenera
    const veredictoCru = conferirNumeroCruDoRelatorio({ texto, semana: args.semana, metricas, fontes });
    if (veredictoCru.passa) return texto;
    // Número cru sem fonte (ex.: "340 comentários" inventado): regenera 1x
    // (a próxima volta do laço) — falhou de novo, cai no piso determinístico.
  }
  return piso();
}

// ═════════════════════════════════════════════════════════════════════════
// O DNA — SÓ HORÁRIOS + OBSERVAÇÃO. Nunca muda a vigente (`editarDna` cria
// versão "proposto"). PURA.
// ═════════════════════════════════════════════════════════════════════════

export function conteudoDeDnaComAjustes(
  atual: DnaDaMarcaConteudo,
  ajustes: readonly AjusteProposto[],
  semana: JanelaDaSemana,
): DnaDaMarcaConteudo {
  const horariosExistentes = new Set(atual.melhoresHorarios.map((h) => `${h.diaDaSemana}-${h.hora}`));
  const novosHorarios = ajustes
    .filter((a): a is AjusteDeHorario => a.tipo === "horario")
    .filter((a) => !horariosExistentes.has(`${a.diaDaSemana}-${a.hora}`))
    .map((a) => ({
      diaDaSemana: a.diaDaSemana,
      hora: a.hora,
      engajamentoMedio: a.evidencia.engajamentoMedio,
      amostras: a.evidencia.amostras,
    }));

  const resumoDePilares = ajustes
    .filter((a): a is AjusteDePilar => a.tipo === "peso_pilar")
    .map((a) => `pilar "${a.pilar}": ${a.porque}`)
    .join(" | ");
  const observacaoNova = resumoDePilares
    ? `Análise semanal (${isoDoDia(semana.de)} a ${isoDoDia(semana.ate)}): ${resumoDePilares}`
    : "";

  return {
    ...atual,
    melhoresHorarios: [...atual.melhoresHorarios, ...novosHorarios],
    observacoes: [atual.observacoes, observacaoNova].filter(Boolean).join("\n\n") || undefined,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// rodarAnaliseSemanal — A ORQUESTRAÇÃO
// ═════════════════════════════════════════════════════════════════════════

function parseMetricasJson(json: string): MetricaDoPostParaAnalise[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as MetricaDoPostParaAnalise[]) : [];
  } catch {
    return [];
  }
}

export interface AnaliseRodada {
  clientId: string;
  analiseId: string;
  postsAnalisados: number;
  ajustesPropostos: number;
  dnaPropostoVersao: number | null;
}

export interface RodarAnaliseSemanalEntrada {
  workspaceId?: string;
  clientId?: string;
  agora: Date;
  /** Sobrescreve a semana calculada de `agora` (`semanaAnterior`) — usada só
   *  para reprocessar uma semana ESPECÍFICA a pedido do master
   *  (`POST /api/social/analises/rodar`, via `semanaDaData`). Ausente = a
   *  semana anterior a `agora`, o caso de sempre (despertador). */
  semanaForcada?: JanelaDaSemana;
  /** Injeção do provedor de IA — só para teste. Ausente = `generate` de verdade. */
  gerar?: GeradorDeIA;
  /** Injeção da leitura de métricas — só para teste. Ausente = `lerMetricasDosPosts` de verdade. */
  lerMetricas?: typeof lerMetricasDosPosts;
  /** Teto de marcas efetivamente ANALISADAS nesta chamada (não conta as
   *  puladas por já terem análise) — o despertador passa `1` ("1 marca por
   *  tique", mesma régua do acervo do Instagram: nunca uma rajada). Ausente =
   *  sem teto (uso de rota/teste, que quer processar tudo de uma vez). */
  limite?: number;
}

export interface RodarAnaliseSemanalSaida {
  analisadas: AnaliseRodada[];
  puladas: { clientId: string; motivo: string }[];
  falhas: { clientId: string; motivo: string }[];
}

async function analisarUmaMarca(args: {
  clientId: string;
  semana: JanelaDaSemana;
  gerar?: GeradorDeIA;
  lerMetricas: typeof lerMetricasDosPosts;
}): Promise<{ ok: "analisada"; dados: AnaliseRodada } | { ok: "pulada"; motivo: string }> {
  const cliente = await prisma.client.findUnique({
    where: { id: args.clientId },
    select: { id: true, workspaceId: true, name: true, pacoteJson: true },
  });
  if (!cliente) return { ok: "pulada", motivo: "cliente não encontrado" };

  // ── IDEMPOTÊNCIA — por (clientId, semanaDe) ─────────────────────────────
  const jaExiste = await prisma.analiseSemanal
    .findUnique({ where: { clientId_semanaDe: { clientId: cliente.id, semanaDe: args.semana.de } } })
    .catch(() => null);
  if (jaExiste) return { ok: "pulada", motivo: "já existe análise desta semana" };

  const postsDaSemana = await prisma.socialPost
    .findMany({
      where: {
        workspaceId: cliente.workspaceId,
        clientId: cliente.id,
        status: "published",
        publishedAt: { gte: args.semana.de, lte: args.semana.ate },
      },
      select: { id: true, externalPostId: true, format: true, pillar: true, publishedAt: true },
    })
    .catch(() => [] as Array<{ id: string; externalPostId: string | null; format: string; pillar: string | null; publishedAt: Date | null }>);

  if (postsDaSemana.length === 0) {
    return { ok: "pulada", motivo: "nenhum post publicado nesta semana" };
  }

  // ── A LEITURA DE MÉTRICA — via leitura.ts, nunca a Graph direto ──────────
  const idsComExterno = [...new Set(postsDaSemana.filter((p) => p.externalPostId).map((p) => p.externalPostId as string))];
  const metricasPorMediaId = new Map<string, MetricasDoPost>();
  if (idsComExterno.length > 0) {
    const leitura = await args.lerMetricas(cliente.workspaceId, cliente.id, idsComExterno).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "falha inesperada na leitura de métricas" }),
    );
    // Falha de leitura (rate limit, reconectar, conexão ausente): segue com
    // "não medido" para todos — nunca bloqueia a análise da semana, e nunca
    // inventa um número.
    if (leitura.ok) {
      for (const m of leitura.posts) metricasPorMediaId.set(m.mediaId, m);
    }
  }

  const metricasDaSemana: MetricaDoPostParaAnalise[] = postsDaSemana.map((p) => {
    const m = p.externalPostId ? metricasPorMediaId.get(p.externalPostId) : undefined;
    const medido = !!m && !m.erro && Object.keys(m.metricas).length > 0;
    return {
      socialPostId: p.id,
      externalPostId: p.externalPostId,
      formato: p.format,
      pilar: p.pillar,
      publicadoEm: (p.publishedAt ?? args.semana.de).toISOString(),
      alcance: medido ? m!.metricas.reach ?? null : null,
      salvos: medido ? m!.metricas.saved ?? null : null,
      compartilhamentos: medido ? m!.metricas.shares ?? null : null,
      comentarios: medido ? m!.metricas.comments ?? null : null,
      cliques: medido ? m!.metricas.clicks ?? null : null,
      medido,
    };
  });

  // ── O HISTÓRICO DA MARCA — todas as análises anteriores + a semana atual ─
  const historicoAnterior = await prisma.analiseSemanal
    .findMany({ where: { clientId: cliente.id }, select: { metricasJson: true } })
    .catch(() => [] as Array<{ metricasJson: string }>);
  const historicoDaMarca: MetricaDoPostParaAnalise[] = [
    ...historicoAnterior.flatMap((h) => parseMetricasJson(h.metricasJson)),
    ...metricasDaSemana,
  ];

  const classificacao = classificarDesempenho(metricasDaSemana, historicoDaMarca);

  const pacoteLido = lerPacote(cliente.pacoteJson);
  const dna = await dnaVigente(cliente.id).catch(() => null);

  const ajustes = ajustesPropostos(classificacao, pacoteLido.ok ? pacoteLido.pacote : null, dna?.conteudo ?? null);

  const relatorio = await gerarRelatorioSemanal({
    workspaceId: cliente.workspaceId,
    clientId: cliente.id,
    nomeDoNegocio: cliente.name,
    semana: args.semana,
    classificacao,
    ajustes,
    metricas: metricasDaSemana,
    gerar: args.gerar,
  });

  // ── DNA proposto — só quando há vigente E há ajuste a registrar ─────────
  let dnaPropostoVersao: number | null = null;
  if (dna && ajustes.length > 0) {
    const conteudoProposto = conteudoDeDnaComAjustes(dna.conteudo, ajustes, args.semana);
    const r = await editarDna({
      workspaceId: cliente.workspaceId,
      clientId: cliente.id,
      conteudo: conteudoProposto,
      porQuem: `ia:${AGENT_ID}`,
    });
    if (r.ok) dnaPropostoVersao = r.versao;
  }

  const criado = await prisma.analiseSemanal.create({
    data: {
      workspaceId: cliente.workspaceId,
      clientId: cliente.id,
      semanaDe: args.semana.de,
      semanaAte: args.semana.ate,
      metricasJson: JSON.stringify(metricasDaSemana),
      funcionouJson: JSON.stringify(classificacao.funcionou),
      naoFuncionouJson: JSON.stringify(classificacao.naoFuncionou),
      ajustesJson: JSON.stringify(ajustes),
      dnaPropostoVersao,
      relatorio,
      status: "proposta",
    },
    select: { id: true },
  });

  return {
    ok: "analisada",
    dados: {
      clientId: cliente.id,
      analiseId: criado.id,
      postsAnalisados: metricasDaSemana.length,
      ajustesPropostos: ajustes.length,
      dnaPropostoVersao,
    },
  };
}

/**
 * A rotina inteira: por marca, para a SEMANA ANTERIOR a `agora`. Sem
 * `clientId`, varre todos os clientes do workspace (ou de todos os workspaces,
 * se `workspaceId` também faltar — uso do despertador, que confere a marca
 * mais antiga da fila e para em uma por tique, ver `despertador.ts`).
 *
 * IDEMPOTENTE por (clientId, semanaDe): rodar duas vezes na mesma semana não
 * duplica — a segunda chamada pula com o motivo.
 */
export async function rodarAnaliseSemanal(entrada: RodarAnaliseSemanalEntrada): Promise<RodarAnaliseSemanalSaida> {
  const semana = entrada.semanaForcada ?? semanaAnterior(entrada.agora);
  const lerMetricas = entrada.lerMetricas ?? lerMetricasDosPosts;

  const analisadas: AnaliseRodada[] = [];
  const puladas: { clientId: string; motivo: string }[] = [];
  const falhas: { clientId: string; motivo: string }[] = [];

  const clientesCandidatos = entrada.clientId
    ? [{ id: entrada.clientId }]
    : await prisma.client
        .findMany({
          where: entrada.workspaceId ? { workspaceId: entrada.workspaceId } : {},
          select: { id: true },
        })
        .catch(() => [] as { id: string }[]);

  for (const c of clientesCandidatos) {
    if (entrada.limite !== undefined && analisadas.length >= entrada.limite) break;
    try {
      const r = await analisarUmaMarca({ clientId: c.id, semana, gerar: entrada.gerar, lerMetricas });
      if (r.ok === "analisada") analisadas.push(r.dados);
      else puladas.push({ clientId: c.id, motivo: r.motivo });
    } catch (err) {
      falhas.push({ clientId: c.id, motivo: err instanceof Error ? err.message : "erro inesperado" });
    }
  }

  return { analisadas, puladas, falhas };
}

// ═════════════════════════════════════════════════════════════════════════
// aplicarAjustes / descartarAnalise — as duas ações do master
// ═════════════════════════════════════════════════════════════════════════

/** Registra QUEM decidiu — `AnaliseSemanal` não tem coluna própria para isso
 *  (o contrato desta ficha não previu uma), então o rastro vai para
 *  `ActivityEvent`, o mesmo jeito que o resto da casa audita decisão sem
 *  campo dedicado. Best-effort: falha de log nunca desfaz a decisão em si. */
async function registrarDecisao(a: {
  workspaceId: string;
  clientId: string;
  analiseId: string;
  porQuem: string;
  tipo: "analise_semanal_aplicada" | "analise_semanal_descartada";
}): Promise<void> {
  await prisma.activityEvent
    .create({
      data: {
        workspaceId: a.workspaceId,
        clientId: a.clientId,
        type: a.tipo,
        message: `análise semanal ${a.analiseId}: ${a.tipo === "analise_semanal_aplicada" ? "aplicada" : "descartada"} por ${a.porQuem}`,
      },
    })
    .catch(() => { /* best-effort — auditoria não pode derrubar a decisão */ });
}

/**
 * Aplica os ajustes de uma análise: o gerador (`pacoteComUltimaAnaliseAplicada`)
 * passa a considerá-la a partir de agora. Idempotente: aplicar de novo uma
 * análise já aplicada é `ok: true` sem re-escrever nada.
 */
export async function aplicarAjustes(a: { analiseId: string; porQuem: string }): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const registro = await prisma.analiseSemanal.findUnique({
      where: { id: a.analiseId },
      select: { status: true, workspaceId: true, clientId: true },
    });
    if (!registro) return { ok: false, motivo: "análise não encontrada" };
    if (registro.status === "descartada") {
      return { ok: false, motivo: "esta análise foi descartada e não pode ser aplicada" };
    }
    if (registro.status !== "aplicada") {
      await prisma.analiseSemanal.update({ where: { id: a.analiseId }, data: { status: "aplicada" } });
      await registrarDecisao({
        workspaceId: registro.workspaceId,
        clientId: registro.clientId,
        analiseId: a.analiseId,
        porQuem: a.porQuem,
        tipo: "analise_semanal_aplicada",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "erro inesperado ao aplicar os ajustes" };
  }
}

/**
 * Descarta uma análise: ela nunca chega a mudar o gerador. Análise já
 * `"aplicada"` não pode ser descartada por aqui — descartar não desfaz o que
 * já mudou o pacote/DNA; quem quiser reverter edita o pacote à mão.
 */
export async function descartarAnalise(a: { analiseId: string; porQuem: string }): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const registro = await prisma.analiseSemanal.findUnique({
      where: { id: a.analiseId },
      select: { status: true, workspaceId: true, clientId: true },
    });
    if (!registro) return { ok: false, motivo: "análise não encontrada" };
    if (registro.status === "aplicada") {
      return { ok: false, motivo: "esta análise já foi aplicada — descartar não desfaz o que já mudou o gerador" };
    }
    if (registro.status !== "descartada") {
      await prisma.analiseSemanal.update({ where: { id: a.analiseId }, data: { status: "descartada" } });
      await registrarDecisao({
        workspaceId: registro.workspaceId,
        clientId: registro.clientId,
        analiseId: a.analiseId,
        porQuem: a.porQuem,
        tipo: "analise_semanal_descartada",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "erro inesperado ao descartar a análise" };
  }
}
