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
import { generate } from "@/lib/ai/generate";
import { getInsights } from "@/lib/integrations/meta/client";
import { fecharCiclo, type CicloResumido } from "@/lib/agency/esteira/ciclos";
import { falarComOCliente } from "@/lib/agency/esteira/marcos";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";
import { lerEvolucao } from "@/lib/agency/esteira/comparacao";

/** Quantos ciclos viram por rodada do relógio. Cada virada é uma chamada de IA
 *  e várias à Meta — vinte de uma vez viraria enxurrada no dia 1º. */
const MAX_VIRADAS_POR_RODADA = 5;

export interface MedicaoDoMes {
  postsPublicados: number;
  postsAgendadosNaoPublicados: number;
  /** Vazio quando a Meta não respondeu — e aí o relatório DIZ isso. */
  alcance: number | null;
  impressoes: number | null;
  seguidores: number | null;
  engajamento: number | null;
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
    postsPublicados: 0, postsAgendadosNaoPublicados: 0,
    alcance: null, impressoes: null, seguidores: null, engajamento: null,
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

  const conexao = await prisma.metaConnection.findFirst({
    where: { workspaceId: projeto.workspaceId, clientId: projeto.clientId, platform: "instagram", status: "connected" },
    select: { id: true },
  }).catch(() => null);
  if (!conexao) {
    medicao.porQueNaoMediu = "o cliente ainda não conectou o Instagram";
    return medicao;
  }

  const r = await getInsights(projeto.workspaceId, conexao.id).catch(() => null);
  if (!r?.ok) {
    medicao.porQueNaoMediu = r?.error ?? "não consegui falar com o Instagram";
    return medicao;
  }
  medicao.alcance = r.reach ?? null;
  medicao.impressoes = r.impressions ?? null;
  medicao.seguidores = r.followers ?? null;
  medicao.engajamento = r.engagement ?? null;
  return medicao;
}

/**
 * A medição reduzida às métricas comparáveis mês a mês.
 *
 * Só entra o que faz sentido comparar: contagem de posts publicados, alcance,
 * seguidores, e o desempenho pago. "Posts agendados que não foram ao ar" é
 * estado, não resultado — comparar isso não diz nada ao cliente.
 */
export function numerosComparaveis(m: MedicaoDoMes): Record<string, number | null> {
  return {
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
}

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
}): Promise<{ titulo: string; corpo: string } | null> {
  const numeros = [
    `- Posts publicados no período: ${input.medicao.postsPublicados}`,
    input.medicao.postsAgendadosNaoPublicados > 0
      ? `- Posts agendados que ainda não foram ao ar: ${input.medicao.postsAgendadosNaoPublicados}`
      : null,
    input.medicao.alcance !== null ? `- Alcance: ${input.medicao.alcance}` : null,
    input.medicao.impressoes !== null ? `- Impressões: ${input.medicao.impressoes}` : null,
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
  const evolucao = lerEvolucao(numerosComparaveis(input.medicao), input.mesAnterior ?? null);
  const blocoEvolucao = evolucao.temBase
    ? `\n\nCOMPARAÇÃO COM ${input.referenciaAnterior ?? "o mês anterior"} (já calculada — use EXATAMENTE estes números e percentuais, é PROIBIDO recalcular ou arredondar):\n${evolucao.linhas.join("\n")}` +
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

  // O piso determinístico vale aqui como em qualquer peça — e aqui é onde ele
  // mais importa: telefone, valor ou promessa inventada num relatório é o que
  // destrói a relação de uma vez.
  const piso = conferirPisoDeVerdade(corpo, input.verdade);
  if (!piso.aprovado) {
    console.warn(`[mes] relatório reprovado no piso de verdade: ${resumirViolacoes(piso.violacoes)}`);
    return null;
  }

  return { titulo, corpo };
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
  const numerosAnteriores = anterior
    ? (() => {
        try {
          const m = JSON.parse(anterior.resultsJson) as MedicaoDoMes;
          return numerosComparaveis(m);
        } catch { return null; }
      })()
    : null;

  const nome = projeto.client?.name ?? "o cliente";
  const relatorio = await escreverRelatorio({
    workspaceId: projeto.workspaceId,
    nomeDoNegocio: nome,
    referencia: ciclo.referencia,
    medicao,
    planoDoMes: ciclo.itens.map((i) => i.titulo),
    mesAnterior: numerosAnteriores,
    referenciaAnterior: anterior?.reference ?? null,
    verdade: {
      businessName: nome,
      telefones: [projeto.client?.phone].filter((v): v is string => !!v),
      emails: [projeto.client?.email].filter((v): v is string => !!v),
      servicos: [],
      valores: [],
    },
  }).catch(() => null);

  if (relatorio) {
    await prisma.deliverable.create({
      data: {
        projectId, name: relatorio.titulo, type: "report", status: "in_review",
        content: relatorio.corpo, ownerAgentId: "relatorio-mensal", cycleId: ciclo.id,
        revisionStatus: "quality_ok",
      },
    }).catch(() => null);
    saida.relatorioEntregue = true;
  }

  // ── ALERTA DE QUEDA ───────────────────────────────────────────────────────
  // O time precisa saber ANTES do cliente. Uma queda que só aparece quando ele
  // reclama já custou a relação.
  const evolucao = lerEvolucao(numerosComparaveis(medicao), numerosAnteriores);
  if (evolucao.pioraram.length > 0) {
    await prisma.activityEvent.create({
      data: {
        workspaceId: projeto.workspaceId, clientId: projeto.clientId, projectId,
        type: "queda_no_ciclo",
        message: `${nome} — ${ciclo.referencia} piorou em: ${evolucao.pioraram.join("; ")}. O relatório vai dizer isso ao cliente.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort */ });
  }

  const resumo = relatorio?.corpo.slice(0, 400)
    ?? `Ciclo fechado sem relatório escrito. ${medicao.postsPublicados} post(s) publicado(s).`;

  const { proximo } = await fecharCiclo({
    projectId,
    cycleId: ciclo.id,
    resultados: { ...medicao },
    resumo,
  });
  saida.proximaReferencia = proximo?.referencia ?? null;

  if (relatorio) {
    await falarComOCliente(
      projeto,
      `Fechamos ${ciclo.referencia}. 📊\n\n${relatorio.corpo.slice(0, 900)}\n\nO plano do mês novo já está sendo montado — te mostro assim que estiver pronto.`,
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
