// mes.ts — A VIRADA DO MÊS. É o que transforma um projeto num cliente vitalício.
//
// O buraco, e ele era o mais caro da casa: NÃO EXISTIA MÊS 2.
//
// `abrirCiclo` era chamado uma vez, na aprovação do pacote, e `fecharCiclo`
// nunca era chamado por ninguém — não tinha um único chamador automático no
// repositório inteiro. O ciclo de agosto ficava aberto em dezembro. O cliente
// pagava mensalidade e recebia uma entrega na vida, porque a idempotência do
// motor era por especialista POR PROJETO e valia para sempre.
//
// O mês vira em quatro atos, nesta ordem, e a ordem importa:
//   1. MEDIR      — o que foi ao ar e o que rendeu. Dado real da Meta, não chute.
//   2. RELATAR    — o relatório do mês, escrito com esses números e só com eles.
//   3. FECHAR     — o ciclo fecha com os resultados e o próximo já nasce.
//   4. PRODUZIR   — a folha em branco do mês novo vai para o motor.
//
// Medir DEPOIS de produzir mediria o mês novo. Fechar antes de relatar perderia
// a competência do relatório. Produzir antes de fechar escreveria a entrega do
// mês novo dentro do ciclo velho.
//
// A REGRA DE VERDADE DESTA CASA VALE AQUI COM FORÇA DOBRADA: um relatório é o
// documento que o cliente usa para decidir se continua pagando. Número inventado
// aqui não é peça torta — é fraude. Por isso o relatório abaixo recebe os
// números prontos e é proibido de produzir qualquer outro; quando a Meta não
// responde, ele diz que não mediu, em vez de estimar.

import { prisma } from "@/lib/db/client";
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
import { generate } from "@/lib/ai/generate";
import { lerMetricasDaConta } from "@/lib/integrations/meta/leitura";
import { fecharCiclo, type CicloResumido } from "@/lib/agency/esteira/ciclos";
import { falarComOCliente } from "@/lib/agency/esteira/marcos";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";
import { lerEvolucao } from "@/lib/agency/esteira/comparacao";
import {
  auditDeliverable, revisionStatusDoVeredito, foiReprovadaPelaQualidade,
} from "@/lib/agency/execution/quality-auditor";

/** Quantos ciclos viram por rodada do relógio. Cada virada é uma chamada de IA
 *  e várias à Meta — vinte de uma vez viraria enxurrada no dia 1º. */
const MAX_VIRADAS_POR_RODADA = 5;

/**
 * A VERSÃO DA BASE DE MEDIÇÃO. Sobe toda vez que uma métrica muda de
 * SIGNIFICADO — não de valor.
 *
 * v1 (até 04/08/2026): `alcance` era o reach de UM DIA (a chamada antiga pedia
 *   reach sem janela e lia `values[0]`); `engajamento` não existia (sempre null).
 * v2 (a partir de 04/08/2026): `alcance` é o reach do CICLO INTEIRO e
 *   `engajamento` é `total_interactions` do ciclo.
 *
 * Por que isto virou código e não uma nota de rodapé: julho gravou 340 (um dia),
 * agosto gravaria 9.500 (31 dias), e o relatório entregue a um cliente pagante
 * anunciaria "+2694%". Sem revisão humana, isso chega nele. Comparar números de
 * bases diferentes não é um erro de arredondamento — é uma mentira com gráfico.
 */
export const VERSAO_DA_MEDICAO = 2;

/** Métricas cujo SIGNIFICADO depende da versão da base — só comparáveis entre
 *  ciclos medidos na MESMA base. */
export const METRICAS_DEPENDENTES_DA_BASE = ["alcance", "engajamento"] as const;

export interface MedicaoDoMes {
  /** A base em que este ciclo foi medido. Ausente = ciclo antigo, v1. */
  schemaVersao?: number;
  /** De onde veio `alcance` (ver leitura.ts): `unicas_no_periodo` (reach
   *  deduplicado) ou `soma_diaria` (soma do reach diário — repete quem viu em
   *  mais de um dia). São números DIFERENTES; comparar entre si também mente. */
  alcanceOrigem?: "unicas_no_periodo" | "soma_diaria" | null;
  postsPublicados: number;
  postsAgendadosNaoPublicados: number;
  /** Vazio quando a Meta não respondeu — e aí o relatório DIZ isso. */
  alcance: number | null;
  /** `views` — a métrica que SUBSTITUIU "impressões" (a Meta descontinuou
   *  `impressions` na v22.0 da Graph; leitura.ts documenta a fonte). */
  visualizacoes: number | null;
  seguidores: number | null;
  engajamento: number | null;
  /** Ressalva de medição parcial (ex.: janela encurtada pela Meta). */
  ressalva?: string | null;
  /** Tráfego pago no período. `null` = não havia campanha, ou não consegui ler.
   *  Nunca zeros: zero gasto é notícia, "não medi" é outra coisa. */
  pago: { gastoBRL: number; cliques: number; alcance: number; cpcBRL: number | null } | null;
  /** Por que não mediu, quando não mediu. */
  porQueNaoMediu: string | null;
}

/**
 * O que aconteceu de verdade no período do ciclo.
 *
 * Nunca estima. `null` quer dizer "não sei" e vira uma frase honesta no
 * relatório; zero quer dizer "medi e deu zero". Confundir os dois é o começo de
 * um relatório que mente.
 */
export async function medirOMes(projectId: string, ciclo: CicloResumido): Promise<MedicaoDoMes> {
  const medicao: MedicaoDoMes = {
    schemaVersao: VERSAO_DA_MEDICAO, alcanceOrigem: null,
    postsPublicados: 0, postsAgendadosNaoPublicados: 0,
    alcance: null, visualizacoes: null, seguidores: null, engajamento: null,
    pago: null, porQueNaoMediu: null,
  };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true, clientId: true, clientRequestId: true },
  });
  if (!projeto) return medicao;

  const inicio = new Date(`${ciclo.comeca}T00:00:00.000Z`);
  const fim = new Date(`${ciclo.termina}T23:59:59.999Z`);

  if (projeto.clientRequestId) {
    const [publicados, agendados] = await Promise.all([
      prisma.socialPost.count({
        where: { clientRequestId: projeto.clientRequestId, status: "published", publishedAt: { gte: inicio, lte: fim } },
      }).catch(() => 0),
      prisma.socialPost.count({
        where: { clientRequestId: projeto.clientRequestId, status: "scheduled", scheduledFor: { lte: fim } },
      }).catch(() => 0),
    ]);
    medicao.postsPublicados = publicados;
    medicao.postsAgendadosNaoPublicados = agendados;
  }

  // Tráfego pago: lido à parte, porque ele existe ou não existe independente
  // de o Instagram estar conectado.
  const { desempenhoPagoDoPeriodo } = await import("@/lib/agency/esteira/trafego");
  const pago = await desempenhoPagoDoPeriodo(projectId, { desde: ciclo.comeca, ate: ciclo.termina }).catch(() => null);
  if (pago) {
    medicao.pago = { gastoBRL: pago.gastoBRL, cliques: pago.cliques, alcance: pago.alcance, cpcBRL: pago.cpcBRL };
  }

  // A resolução cliente→conexão e os estados "não conectou" / "reconecte"
  // moram na camada de leitura (leitura.ts) — aqui só se traduz em medição.
  if (!projeto.clientId) {
    medicao.porQueNaoMediu = "projeto sem cliente definido — não sei qual Instagram medir";
    return medicao;
  }
  const r = await lerMetricasDaConta(projeto.workspaceId, projeto.clientId, {
    desde: ciclo.comeca, ate: ciclo.termina,
  }).catch(() => null);
  if (!r?.ok) {
    medicao.porQueNaoMediu = r?.error ?? "não consegui falar com o Instagram";
    return medicao;
  }
  medicao.alcance = r.totais.alcance;
  medicao.alcanceOrigem = r.alcanceOrigem ?? null;
  medicao.visualizacoes = r.totais.visualizacoes;
  medicao.seguidores = r.perfil.seguidores;
  // "Engajamento" do relatório = total_interactions (curtidas + comentários +
  // salvamentos + compartilhamentos), a métrica vigente da Meta para isso.
  medicao.engajamento = r.totais.interacoes;
  medicao.ressalva = r.aviso ?? null;
  return medicao;
}

/**
 * A medição reduzida às métricas comparáveis mês a mês.
 *
 * Só entra o que faz sentido comparar: contagem de posts publicados, alcance,
 * seguidores, e o desempenho pago. "Posts agendados que não foram ao ar" é
 * estado, não resultado — comparar isso não diz nada ao cliente.
 */
export function numerosComparaveis(
  m: MedicaoDoMes,
  /** O outro ciclo da comparação. Quando ele foi medido noutra BASE, as métricas
   *  dependentes da base saem como `null` — "não tenho com o que comparar" — em
   *  vez de virarem um percentual entre coisas diferentes. */
  contra?: MedicaoDoMes | null,
): Record<string, number | null> {
  const numeros: Record<string, number | null> = {
    "posts publicados": m.postsPublicados,
    alcance: m.alcance,
    seguidores: m.seguidores,
    engajamento: m.engajamento,
    ...(m.pago
      ? {
          investido: m.pago.gastoBRL,
          cliques: m.pago.cliques,
          "custo por clique": m.pago.cpcBRL,
        }
      : {}),
  };
  if (contra) {
    for (const metrica of metricasForaDaComparacao(m, contra)) numeros[metrica] = null;
  }
  return numeros;
}

/** A versão de um ciclo gravado. Ciclo velho não tem o campo — é v1. */
export function versaoDaMedicao(m: MedicaoDoMes | null | undefined): number {
  const v = m?.schemaVersao;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

/**
 * QUAIS métricas saem da comparação — não "se" sai alguma.
 *
 * A régua é DIFERENTE por métrica, e tratar as duas como um bloco só reprovava
 * comparação legítima: `alcanceOrigem` descreve SÓ o alcance (`soma_diaria` vs.
 * `unicas_no_periodo`), enquanto `engajamento` é `total_interactions` nas duas
 * origens — a régua dele não muda quando a origem do alcance muda. Dois meses
 * v2, um com total deduplicado e outro sem, tinham o engajamento derrubado sem
 * motivo, e o cliente lia que "a forma de medir mudou" para uma métrica cuja
 * forma de medir não mudou. Portão que reprova o legítimo custa tão caro quanto
 * o que deixa passar o ilegítimo.
 *
 *   engajamento → só a VERSÃO da base importa (v1 nem media engajamento).
 *   alcance     → versão E origem.
 */
export function metricasForaDaComparacao(
  a: MedicaoDoMes,
  b: MedicaoDoMes,
): Array<(typeof METRICAS_DEPENDENTES_DA_BASE)[number]> {
  const fora: Array<(typeof METRICAS_DEPENDENTES_DA_BASE)[number]> = [];
  const versaoDivergente = versaoDaMedicao(a) !== versaoDaMedicao(b);
  // Origem só existe na v2. Quando um dos lados não mediu alcance, não há o que
  // divergir — a própria métrica já sai como null na comparação.
  const origemDivergente =
    a.alcance !== null && b.alcance !== null &&
    (a.alcanceOrigem ?? null) !== (b.alcanceOrigem ?? null);
  if (versaoDivergente || origemDivergente) fora.push("alcance");
  if (versaoDivergente) fora.push("engajamento");
  return fora;
}

/** Atalho: nenhuma métrica de base ficou de fora. */
export function mesmaBaseDeMedicao(a: MedicaoDoMes, b: MedicaoDoMes): boolean {
  return metricasForaDaComparacao(a, b).length === 0;
}

/**
 * O par pronto para `lerEvolucao`, já com as métricas incomparáveis fora — e a
 * frase que explica ao cliente por que elas ficaram de fora.
 */
export function compararComOMesAnterior(
  atual: MedicaoDoMes,
  anterior: MedicaoDoMes | null,
): {
  atual: Record<string, number | null>;
  anterior: Record<string, number | null> | null;
  ressalvaDeBase: string | null;
} {
  if (!anterior) {
    return { atual: numerosComparaveis(atual), anterior: null, ressalvaDeBase: null };
  }
  const fora = metricasForaDaComparacao(atual, anterior);
  return {
    atual: numerosComparaveis(atual, anterior),
    anterior: numerosComparaveis(anterior, atual),
    ressalvaDeBase: fora.length === 0 ? null : ressalvaDeBaseParaOCliente(fora),
  };
}

/**
 * A FRASE QUE VAI AO CLIENTE, palavra por palavra.
 *
 * Ela não é instrução de prompt: `escreverRelatorio` a concatena ao corpo do
 * relatório EM CÓDIGO. Sem ela, o cliente que tem o relatório do mês passado na
 * mão faz a conta sozinho — 340 em julho, 9.500 em agosto, "+2694%" na cabeça
 * dele — e a agência nunca desmentiu. Prompt é sugestão; isto é trava.
 */
export function ressalvaDeBaseParaOCliente(metricas: string[]): string {
  const plural = metricas.length > 1;
  return (
    `Observação sobre a comparação: ${metricas.join(" e ")} ${plural ? "não entram" : "não entra"} ` +
    `na comparação com o mês anterior. A forma de medir ${plural ? "essas métricas" : "essa métrica"} mudou ` +
    `e o mês anterior foi medido em outra base — os números não são comparáveis entre si, ` +
    `e por isso não calculamos variação percentual ${plural ? "delas" : "dela"} neste relatório. ` +
    `A comparação ${plural ? "dessas métricas" : "dessa métrica"} começa no mês que vem.`
  );
}

/**
 * Corta o corpo para caber num limite E garante que a ressalva sobreviva ao
 * corte — anexando-a DEPOIS de cortar, nunca antes.
 *
 * Por que existe: a ressalva mora no fim do relatório, e a mensagem ao cliente
 * levava `corpo.slice(0, 900)`. Num relatório de tamanho normal o corte caía no
 * meio do texto e a ressalva ficava de fora — o Deliverable avisava, a mensagem
 * não. Quem lê a mensagem e tem o relatório do mês passado na mão faz a conta
 * errada sozinho, que é exatamente o que a ressalva existe para impedir.
 *
 * É a mesma lição de `blocoComGuarda` em `execution/leitura-do-cliente.ts`:
 * frase de guarda no fim de um texto que será truncado é frase que some. Aqui
 * ela reapareceu em outro arquivo — a lição não atravessa o corredor sozinha.
 */
export function trechoComRessalva(corpo: string, ressalva: string | null, limite: number): string {
  if (!ressalva) return corpo.slice(0, limite);
  const cauda = `\n\n---\n\n${ressalva}`;
  // A ressalva já está no fim do corpo (escreverRelatorio a anexou). Corta o
  // texto ANTES dela e recoloca-a inteira: o cliente perde miolo, nunca o aviso.
  const semRessalva = corpo.endsWith(cauda) ? corpo.slice(0, -cauda.length) : corpo;
  const espacoParaOCorpo = Math.max(0, limite - cauda.length);
  return `${semRessalva.slice(0, espacoParaOCorpo)}${cauda}`;
}

/** Como o alcance é apresentado no relatório, conforme a origem do número. */
const QUALIFICADOR_DO_ALCANCE: Record<string, string> = {
  unicas_no_periodo: " (contas únicas alcançadas no período)",
  soma_diaria: " (soma do alcance diário — repete quem viu em mais de um dia)",
  desconhecido: "",
};

/**
 * Escreve o relatório do mês — só com o que foi medido.
 *
 * O prompt entrega os números prontos e proíbe qualquer outro. É o mesmo
 * princípio do resto da casa (ausência de informação não é informação), mas
 * aqui a peça é a que o cliente usa para decidir se continua pagando.
 */
export async function escreverRelatorio(input: {
  workspaceId: string;
  nomeDoNegocio: string;
  referencia: string;
  medicao: MedicaoDoMes;
  planoDoMes: string[];
  verdade: VerdadeDoCliente;
  /** Os números do ciclo anterior. `null` = primeiro mês do cliente, e o
   *  relatório DIZ isso em vez de inventar uma evolução. */
  mesAnterior?: Record<string, number | null> | null;
  referenciaAnterior?: string | null;
  /** Os números DESTE mês JÁ filtrados pela base de medição — sempre vindos de
   *  `compararComOMesAnterior`. OBRIGATÓRIO de propósito: quando tinha default
   *  (`?? numerosComparaveis(medicao)`), o chamador que esquecesse caía nos
   *  números crus em silêncio, e o silêncio aprovava justamente a comparação
   *  entre bases diferentes que esta trava existe para barrar. */
  mesAtual: Record<string, number | null>;
  /** Por que uma métrica ficou de fora da comparação (mudança de base). */
  ressalvaDeBase?: string | null;
}): Promise<{ titulo: string; corpo: string } | null> {
  const numeros = [
    `- Posts publicados no período: ${input.medicao.postsPublicados}`,
    input.medicao.postsAgendadosNaoPublicados > 0
      ? `- Posts agendados que ainda não foram ao ar: ${input.medicao.postsAgendadosNaoPublicados}`
      : null,
    // O qualificador do alcance vai JUNTO do número: "soma do alcance diário"
    // não é "contas únicas", e o cliente lê o rótulo, não o código.
    input.medicao.alcance !== null
      ? `- Alcance${QUALIFICADOR_DO_ALCANCE[input.medicao.alcanceOrigem ?? "desconhecido"]}: ${input.medicao.alcance}`
      : null,
    input.medicao.visualizacoes !== null ? `- Visualizações: ${input.medicao.visualizacoes}` : null,
    input.medicao.ressalva ? `- Observação da medição (diga ao cliente): ${input.medicao.ressalva}` : null,
    input.medicao.seguidores !== null ? `- Seguidores: ${input.medicao.seguidores}` : null,
    input.medicao.engajamento !== null ? `- Engajamento: ${input.medicao.engajamento}` : null,
    input.medicao.pago ? `- Anúncios — investido: R$ ${input.medicao.pago.gastoBRL.toFixed(2)}` : null,
    input.medicao.pago ? `- Anúncios — cliques: ${input.medicao.pago.cliques}` : null,
    input.medicao.pago ? `- Anúncios — alcance: ${input.medicao.pago.alcance}` : null,
    input.medicao.pago?.cpcBRL !== null && input.medicao.pago ? `- Anúncios — custo por clique: R$ ${input.medicao.pago.cpcBRL}` : null,
  ].filter(Boolean).join("\n");

  // A COMPARAÇÃO É FEITA EM CÓDIGO, e a IA recebe o resultado pronto. Se ela
  // calculasse, poderia escrever "crescemos 30%" a partir de números que dão
  // 12% — e o percentual é exatamente onde o cliente presta atenção.
  const evolucao = lerEvolucao(input.mesAtual, input.mesAnterior ?? null);
  const blocoEvolucao = evolucao.temBase
    ? `\n\nCOMPARAÇÃO COM ${input.referenciaAnterior ?? "o mês anterior"} (já calculada — use EXATAMENTE estes números e percentuais, é PROIBIDO recalcular ou arredondar):\n${evolucao.linhas.join("\n")}` +
      (input.ressalvaDeBase
        ? `\n\nATENÇÃO — MÉTRICAS FORA DA COMPARAÇÃO: ${input.ressalvaDeBase} Diga isso ao cliente com todas as letras e NÃO calcule nem cite variação percentual dessas métricas. Inventar essa comparação é o erro mais caro que este relatório pode conter.`
        : "") +
      (evolucao.pioraram.length > 0
        ? `\n\nO QUE PIOROU: ${evolucao.pioraram.join("; ")}. Diga isto com todas as letras numa seção própria e proponha o que faremos a respeito. Esconder queda é o jeito mais rápido de perder a confiança do cliente.`
        : "")
    : "\n\nNÃO há mês anterior para comparar — este é o primeiro ciclo medido. Diga isso e explique que a comparação começa no mês que vem. NÃO invente evolução nem compare com médias de mercado.";

  const semMedicao = input.medicao.porQueNaoMediu
    ? `\n\nATENÇÃO: as métricas do Instagram NÃO foram medidas neste mês. Motivo: ${input.medicao.porQueNaoMediu}. Escreva isto com todas as letras no relatório, como uma seção própria, e diga o que precisa acontecer para medir no mês que vem. NÃO estime, NÃO compare com médias de mercado, NÃO diga que "o desempenho foi bom".`
    : "";

  const r = await generate({
    system:
      "Você escreve o relatório mensal de uma agência de marketing brasileira para o cliente dela. " +
      "O cliente decide se continua pagando com base neste documento. " +
      "Você SÓ pode usar os números que receber. É PROIBIDO inventar qualquer número, percentual, " +
      "comparação com o mês anterior ou benchmark de mercado. Se um dado não foi entregue a você, " +
      "escreva que ele não foi medido e por quê. Responda SOMENTE com JSON válido: " +
      '{"title": string, "summary": string, "items": [{"headline": string, "note": string}]}',
    user:
      `Relatório de ${input.referencia} para ${input.nomeDoNegocio}.\n\n` +
      `O QUE FOI MEDIDO (é tudo o que você tem):\n${numeros || "- nada foi medido neste período"}\n\n` +
      `O QUE ESTAVA PLANEJADO PARA O MÊS:\n${input.planoDoMes.map((p) => `- ${p}`).join("\n") || "- plano não registrado"}` +
      blocoEvolucao +
      semMedicao +
      "\n\nEscreva em português do Brasil, direto, sem jargão de agência. " +
      "Se um número não está acima, ele não existe para você.",
    maxTokens: 1400,
    workspaceId: input.workspaceId,
  });
  if (!r.ok) return null;

  const dados = r.data as Record<string, unknown>;
  const titulo = typeof dados.title === "string" && dados.title.trim()
    ? dados.title.trim()
    : `Relatório de ${input.referencia}`;
  const itens = Array.isArray(dados.items) ? dados.items as Array<Record<string, unknown>> : [];
  const corpo = [
    typeof dados.summary === "string" ? dados.summary.trim() : "",
    "",
    ...itens.map((i, n) => `**${n + 1}. ${String(i.headline ?? "").trim()}**\n${String(i.note ?? "").trim()}`),
  ].join("\n").trim();
  if (corpo.length < 80) return null;

  // ── A RESSALVA VAI NO ENTREGÁVEL, NÃO NO PROMPT ───────────────────────────
  // O prompt acima MANDA a IA dizer isto; mandar não é garantir. O que protege
  // o cliente é a frase estar no documento que ele lê, e nada além de código
  // pode garantir isso. Se a IA já disse (por qualquer aproximação), o texto
  // canônico entra assim mesmo: repetir a ressalva não faz mal a ninguém;
  // omiti-la deixa o cliente calculando "+2694%" sozinho.
  const corpoFinal = input.ressalvaDeBase
    ? `${corpo}\n\n---\n\n${input.ressalvaDeBase}`
    : corpo;

  // O piso determinístico vale aqui como em qualquer peça — e aqui é onde ele
  // mais importa: telefone, valor ou promessa inventada num relatório é o que
  // destrói a relação de uma vez.
  const piso = conferirPisoDeVerdade(corpoFinal, input.verdade);
  if (!piso.aprovado) {
    console.warn(`[mes] relatório reprovado no piso de verdade: ${resumirViolacoes(piso.violacoes)}`);
    return null;
  }

  return { titulo, corpo: corpoFinal };
}

export interface ViradaFeita {
  projectId: string;
  referenciaFechada: string;
  proximaReferencia: string | null;
  relatorioEntregue: boolean;
  motivo?: string;
}

/**
 * Vira o mês de UM projeto: mede, relata, fecha e manda produzir o mês novo.
 *
 * Best-effort no relatório, nunca no fechamento: se a IA falhar, o ciclo fecha
 * do mesmo jeito com os números crus. Um ciclo que não fecha porque o texto não
 * saiu é a operação inteira parada por causa de uma frase.
 */
export async function virarOMes(projectId: string, ciclo: CicloResumido): Promise<ViradaFeita> {
  const saida: ViradaFeita = {
    projectId, referenciaFechada: ciclo.referencia, proximaReferencia: null, relatorioEntregue: false,
  };

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, workspaceId: true, clientId: true, clientRequestId: true,
      client: { select: { name: true, phone: true, email: true } },
    },
  });
  if (!projeto) { saida.motivo = "projeto não encontrado"; return saida; }

  const medicao = await medirOMes(projectId, ciclo);

  // ── O MÊS PASSADO ─────────────────────────────────────────────────────────
  // Sem isto o relatório descreve e não compara — e "está melhorando?" é a
  // pergunta que o cliente faz quando olha a fatura.
  const anterior = await prisma.cycle.findFirst({
    where: { projectId, status: "fechado", reference: { lt: ciclo.referencia } },
    orderBy: { reference: "desc" },
    select: { reference: true, resultsJson: true },
  }).catch(() => null);
  const medicaoAnterior = anterior
    ? (() => {
        try { return JSON.parse(anterior.resultsJson) as MedicaoDoMes; }
        catch { return null; }
      })()
    : null;
  // AQUI mora a trava do P0: se o mês passado foi medido noutra base, alcance e
  // engajamento saem da comparação em vez de virarem um percentual inventado.
  const par = compararComOMesAnterior(medicao, medicaoAnterior);
  const numerosAnteriores = par.anterior;

  const nome = projeto.client?.name ?? "o cliente";
  const relatorio = await escreverRelatorio({
    workspaceId: projeto.workspaceId,
    nomeDoNegocio: nome,
    referencia: ciclo.referencia,
    medicao,
    planoDoMes: ciclo.itens.map((i) => i.titulo),
    mesAnterior: numerosAnteriores,
    mesAtual: par.atual,
    ressalvaDeBase: par.ressalvaDeBase,
    referenciaAnterior: anterior?.reference ?? null,
    verdade: {
      businessName: nome,
      telefones: [projeto.client?.phone].filter((v): v is string => !!v),
      emails: [projeto.client?.email].filter((v): v is string => !!v),
      servicos: [],
      valores: [],
      // O relatório fala com o cliente sobre a operação dele ("continuamos
      // divulgando o delivery em Moema"). Sem a verdade operacional do banco,
      // o piso leria isso como afirmação não sustentada e reprovaria o mês.
      operacao: projeto.clientRequestId
        ? (await buildVerdadeOperacional(projeto.clientRequestId)) ?? undefined
        : undefined,
    },
  }).catch(() => null);

  // ── O RELATÓRIO PASSA POR ÁRBITRO. DE VERDADE. ────────────────────────────
  //
  // Até 04/08/2026 esta peça nascia `quality_ok` sem nunca ter sido auditada.
  // De todas as portas dos fundos encontradas pela auditoria adversarial, esta
  // era a menos defensável: o relatório mensal é a peça que o cliente MAIS lê e
  // a única com a qual ele decide se continua pagando. Ela afirma números, faz
  // comparação com o mês anterior e explica queda. É exatamente o tipo de peça
  // para a qual o árbitro existe — e era a única que não passava por ele.
  //
  // Custo: UMA chamada de IA por projeto por MÊS. Não há argumento de custo.
  //
  // Reprovado BLOQUEIA: o texto não é mandado ao cliente, o time é chamado. O
  // ciclo fecha do mesmo jeito — a operação nunca para por causa de um texto.
  let vereditoDoRelatorio = relatorio
    ? await auditDeliverable({
        deptLabel: "Relatório mensal",
        title: relatorio.titulo,
        content: relatorio.corpo,
        brandContext: [
          `Negócio: ${nome}`,
          `Documento: relatório de resultados do mês ${ciclo.referencia}, escrito para o cliente que paga a mensalidade.`,
          "Todo número deste relatório foi medido, não estimado. Reprove se o texto afirmar resultado, comparação ou causa que os números não sustentam.",
        ].join("\n"),
        workspaceId: projeto.workspaceId,
      }).catch(() => null)
    : null;
  // `auditDeliverable` já é fail-safe, mas a virada do mês não pode morrer por
  // uma leitura auxiliar: erro aqui vira "ninguém olhou", nunca "está bom".
  if (relatorio && !vereditoDoRelatorio) {
    vereditoDoRelatorio = { verdict: "nao_auditado", issues: [], note: "a auditoria do relatório falhou", motivo: "erro" };
  }
  const relatorioReprovado = vereditoDoRelatorio ? foiReprovadaPelaQualidade(vereditoDoRelatorio.verdict) : false;

  if (relatorio && vereditoDoRelatorio) {
    await prisma.deliverable.create({
      data: {
        projectId, name: relatorio.titulo, type: "report", status: "in_review",
        content: relatorio.corpo, ownerAgentId: "relatorio-mensal", cycleId: ciclo.id,
        revisionStatus: revisionStatusDoVeredito(vereditoDoRelatorio.verdict),
        lastFeedback: (vereditoDoRelatorio.issues.join("; ") || vereditoDoRelatorio.note).slice(0, 500),
      },
    }).catch(() => null);
    saida.relatorioEntregue = !relatorioReprovado;
    if (relatorioReprovado) {
      saida.motivo = `relatório de ${ciclo.referencia} reprovado pela Qualidade — não foi enviado ao cliente`;
      await prisma.activityEvent.create({
        data: {
          workspaceId: projeto.workspaceId, clientId: projeto.clientId, projectId,
          type: "relatorio_reprovado",
          message: `${nome} — o relatório de ${ciclo.referencia} foi REPROVADO pela Qualidade e NÃO foi enviado: ${vereditoDoRelatorio.issues.join("; ") || vereditoDoRelatorio.note}. Precisa de gente.`.slice(0, 900),
        },
      }).catch(() => { /* best-effort */ });
    }
  }

  // ── ALERTA DE QUEDA ───────────────────────────────────────────────────────
  // O time precisa saber ANTES do cliente. Uma queda que só aparece quando ele
  // reclama já custou a relação.
  // Mesma base filtrada do relatório: alertar o time de uma "queda" que é só
  // mudança de régua faria o time ligar para o cliente por causa de nada.
  const evolucao = lerEvolucao(par.atual, numerosAnteriores);
  if (evolucao.pioraram.length > 0) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId, clientId: projeto.clientId, projectId,
        type: "queda_no_ciclo",
        message: `${nome} — ${ciclo.referencia} piorou em: ${evolucao.pioraram.join("; ")}. O relatório vai dizer isso ao cliente.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort */ });
  }

  // O resumo do ciclo é lido por telas dos DOIS lados. Texto reprovado pela
  // Qualidade não vira resumo de nada: o ciclo fecha com os números crus.
  const resumo = relatorio && !relatorioReprovado
    ? relatorio.corpo.slice(0, 400)
    : `Ciclo fechado ${relatorioReprovado ? "com o relatório barrado pela Qualidade" : "sem relatório escrito"}. ${medicao.postsPublicados} post(s) publicado(s).`;

  const { proximo } = await fecharCiclo({
    projectId,
    cycleId: ciclo.id,
    resultados: { ...medicao },
    resumo,
  });
  saida.proximaReferencia = proximo?.referencia ?? null;

  // Reprovado pela Qualidade NÃO vai ao cliente — nem em trecho. O ciclo já
  // fechou com os números crus acima; o texto espera gente.
  if (relatorio && !relatorioReprovado) {
    await falarComOCliente(
      projeto,
      `Fechamos ${ciclo.referencia}. 📊\n\n${trechoComRessalva(relatorio.corpo, par.ressalvaDeBase, 900)}\n\nO plano do mês novo já está sendo montado — te mostro assim que estiver pronto.`,
      "ciclo",
    ).catch(() => false);
  }

  // A folha em branco: o motor produz o mês novo porque o ciclo mudou e a
  // idempotência é por ciclo. Sem esta linha o mês nasceria e nada aconteceria
  // até alguém cutucar.
  if (proximo) {
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "pending", executionRequestedAt: new Date(), executionAttempts: 0 },
    }).catch(() => { /* best-effort */ });
  }

  return saida;
}

/**
 * Vira todo ciclo cujo mês já acabou.
 *
 * Chamado pelo relógio. Não vira o ciclo do mês corrente — só o que já terminou.
 */
export async function virarOsMesesVencidos(hoje: Date = new Date()): Promise<ViradaFeita[]> {
  const referenciaHoje = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
  const vencidos = await prisma.cycle.findMany({
    where: {
      status: { in: ["aberto", "entregue"] },
      // Comparação de string funciona porque a data é sempre AAAA-MM-DD.
      endsOn: { lt: `${referenciaHoje}-01` },
    },
    orderBy: { endsOn: "asc" },
    take: MAX_VIRADAS_POR_RODADA,
  }).catch(() => []);

  const feitas: ViradaFeita[] = [];
  for (const c of vencidos) {
    try {
      feitas.push(await virarOMes(c.projectId, {
        id: c.id, referencia: c.reference, status: c.status as CicloResumido["status"],
        comeca: c.startsOn, termina: c.endsOn,
        itens: (() => { try { return JSON.parse(c.planJson); } catch { return []; } })(),
        resumo: c.summary,
      }));
    } catch (err) {
      // Um projeto problemático não pode impedir a virada dos outros.
      console.warn(`[mes] não consegui virar ${c.projectId}/${c.reference}:`, err instanceof Error ? err.message : err);
    }
  }
  return feitas;
}

/**
 * Apresenta ao cliente o pacote DESTE ciclo.
 *
 * Existe separado de `apresentar` porque aquele carimba `Project.presentedAt`,
 * que só serve ao pacote inicial: do mês 2 em diante ele responderia "já
 * apresentado" e a entrega ficaria pronta e invisível para sempre.
 */
export async function apresentarCiclo(
  projectId: string,
  cycleId: string,
  opts: { mesmoComRessalva?: boolean } = {},
): Promise<{ ok: boolean; erro?: string; avisouCliente?: boolean }> {
  const ciclo = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!ciclo) return { ok: false, erro: "ciclo não encontrado" };
  if (ciclo.presentedAt) return { ok: true, erro: "já apresentado — nada mudou" };

  const entregaveis = await prisma.deliverable.findMany({
    where: { projectId, cycleId },
    select: { id: true, name: true, revisionStatus: true },
  });
  if (entregaveis.length === 0) return { ok: false, erro: "não há nada pronto para apresentar neste ciclo" };

  const comRessalva = entregaveis.filter((d) => d.revisionStatus === "quality_flag");
  if (comRessalva.length > 0 && opts.mesmoComRessalva !== true) {
    return { ok: false, erro: `${comRessalva.length} entrega(s) com ressalva da Qualidade. Resolva antes de mostrar ao cliente.` };
  }

  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientRequestId: true, workspaceId: true, clientId: true },
  });
  if (!projeto) return { ok: false, erro: "projeto não encontrado" };

  await prisma.cycle.update({ where: { id: cycleId }, data: { presentedAt: new Date(), status: "entregue" } });

  if (projeto.clientRequestId) {
    await prisma.approvalRequest.updateMany({
      where: { clientRequestId: projeto.clientRequestId, status: "pending" },
      data: { clientVisible: true },
    }).catch(() => { /* best-effort */ });
  }

  // Mesma regra do pacote inicial (marcos.ts): apresentar o ciclo é o ato que
  // torna as entregas DELE "compartilhado" — antes disso o portal, que filtra
  // por `visibility` fail-closed, não as mostra.
  await prisma.deliverable.updateMany({
    where: { projectId, cycleId },
    data: { visibility: "compartilhado" },
  }).catch(() => { /* best-effort */ });

  const avisou = await falarComOCliente(projeto, [
    `O material de ${ciclo.reference} está pronto! 🎉`,
    "",
    ...entregaveis.map((d) => `• ${d.name}`),
    "",
    "Está tudo na aba de aprovações. Aprove e a gente já agenda as publicações.",
  ].join("\n"), "entrega");

  // Aprovado ou não, o calendário do mês já nasce como proposta de datas — o
  // cliente vê o mês inteiro junto com as peças.
  try {
    const { agendarPostsDaEntrega } = await import("@/lib/agency/esteira/publicacao");
    await agendarPostsDaEntrega(projectId);
  } catch { /* best-effort */ }

  return { ok: true, avisouCliente: avisou };
}
