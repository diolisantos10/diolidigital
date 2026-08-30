// run-execution.ts — o NÚCLEO da produção autônoma, extraído da rota HTTP para
// que TANTO o botão (rota) QUANTO o cron de recuperação chamem a MESMA lógica.
//
// Confiabilidade (a razão de existir): antes, o motor era disparado do navegador
// e a entrega sumia se a aba fechasse. Agora o progresso é marcado no BANCO
// (executionStatus/attempts/error) e um cron recupera projetos travados. É
// IDEMPOTENTE — um departamento que já produziu é pulado, então re-rodar nunca
// duplica. Nunca inventa: sem chave de IA, pula; faltando material, pergunta ao
// cliente pelo portal.

import { prisma } from "@/lib/db/client";
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
import { generate } from "@/lib/ai/generate";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { planProduction, type ProductionPlan } from "@/lib/agency/execution/pm-conductor";
import {
  auditDeliverable, revisionStatusDoVeredito, camposDaQualidade,
  foiReprovadaPelaQualidade, ficouSemArbitro,
  type VereditoDaQualidade,
} from "@/lib/agency/execution/quality-auditor";
import { getActiveInsights, buildInsightBlock } from "@/lib/agency/radar/library";
import { moverTarefasDoAgente, marcarEntregue } from "@/lib/agency/esteira/tarefas";
import { abrirPedido, cobrarCliente } from "@/lib/agency/esteira/pedidos";
import {
  DEPARTAMENTOS, ctxBlock, ctxBlockParaJuiz, conferirContrato, ESQUEMA_DO_PACOTE,
  type Ctx, type Departamento, type Especialista,
} from "@/lib/agency/execution/especialistas";
import {
  conferirPisoDeVerdade, resumirViolacoes, separarValoresInformados,
  verdadeEmLinhas, classesSemInformacaoLegiveis,
  type VerdadeDoCliente,
} from "@/lib/agency/execution/piso-de-verdade";
import { sinteseDoFeedDoCliente } from "@/lib/agency/execution/leitura-do-cliente";
// O contrato de SAÍDA passa a derivar do contrato de ENTRADA. Ver
// `escopo-do-cliente.ts` para por que os números fixos eram o defeito.
import {
  lerEscopoDeConteudo, exigenciaDeConteudo, avisoDeCobertura, levaDevidaEm,
} from "@/lib/agency/execution/escopo-do-cliente";
import { lerProibicoes, sincronizarDoBriefing } from "@/lib/agency/esteira/proibicoes";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { renderizarEntrega } from "@/lib/agency/esteira/renderizar-entrega";
import {
  VERSAO_DA_MEDICAO, versaoDaMedicao,
  type MedicaoDoMes,
} from "@/lib/agency/esteira/mes";
import { registrarProducao, degrauAtual } from "@/lib/agency/escada/registro";
import { conferirPagamento } from "@/lib/agency/financeiro/portao-de-pagamento";
import type { Degrau, ResultadoDaPeca } from "@/lib/agency/escada/degraus";
import { nomeDoNegocio, tituloSemConfissao } from "@/lib/agency/comercial/negocio-do-lead";

/** Conteúdo mínimo aceitável de uma entrega (gate de saída: nada vazio/lixo vai ao cliente). */
const MIN_DELIVERABLE_CHARS = 40;
/** Máximo de revisões que a Qualidade pede antes de publicar (bounded — sem loop infinito). */
const MAX_QUALITY_REVISIONS = 1;
/** Tentativas de corrigir dado inventado antes de barrar a peça de vez. Uma é
 *  suficiente: se o modelo repetiu a invenção com o TEXTO ANTERIOR e o parecer
 *  na mão, insistir só gasta tokens — e a peça não pode ir ao cliente de
 *  qualquer forma.
 *
 *  Este comentário só passou a ser verdade em 05/08/2026: até então a refação
 *  remontava `esp.prompt(context)` inteiro e NÃO mandava o corpo anterior. O
 *  modelo recebia um parecer sobre um texto que não estava na frente dele —
 *  pagava-se uma geração completa por uma correção às cegas, que
 *  estatisticamente repetia a mesma violação. Ver `pedidoDeRefacao`. */
const MAX_CORRECOES_DE_PISO = 1;

/** Uma correção de contrato — o mesmo raciocínio do piso: a checagem é de
 *  código (contagem e formato), o parecer é literal, e quem não cumpre com o
 *  número na frente não cumpre com mais uma chamada. */
const MAX_CORRECOES_DE_CONTRATO = 1;

/** Depois disto, "running" quer dizer "o processo morreu no meio". É o mesmo
 *  valor que o cron e o despertador usam para considerar a execução travada. */
const TRAVA_DE_EXECUCAO_MS = 10 * 60_000;

/**
 * O prefixo que marca uma passada encerrada só por RECUSA (piso ou contrato).
 *
 * Mora no `executionError` porque é o único estado durável que temos sem coluna
 * nova — e precisa ser durável: é ele que faz a segunda recusa seguida virar
 * `blocked` em vez de queimar as cinco tentativas do cron para chegar sempre ao
 * mesmo lugar.
 */
const MARCA_DE_RECUSA = "[recusa]";

/** O markdown que o cliente lê. A implementação mora em
 *  `esteira/renderizar-entrega.ts` — fonte ÚNICA para os três motores. Este
 *  arquivo tinha a versão CERTA e as outras duas eram cópias sem a linha
 *  `["cenas","Cenas"]`, o que rebaixava carrossel refeito para feed. */
const deliverableMarkdown = renderizarEntrega;

/**
 * O pedido de REFAÇÃO — com o texto anterior na frente do modelo.
 *
 * Existe porque a "correção" desta casa era um re-roll cego: remontava
 * `esp.prompt(context)` inteiro e mandava junto um parecer sobre um texto que o
 * modelo NÃO estava vendo. Ele recebia o mesmo pedido de antes mais uma
 * reclamação sobre algo invisível — e reescrevia do zero, reproduzindo a
 * violação com boa probabilidade. Pagava-se uma geração completa por uma
 * correção que estatisticamente não corrigia, e o comentário de
 * `MAX_CORRECOES_DE_PISO` se justificava dizendo "se repetiu com o parecer na
 * mão", quando o parecer nunca esteve na mão junto do texto.
 *
 * A versão anterior vai como JSON: é o formato que ele tem de devolver, então
 * corrigir vira edição — mais barata e mais fiel do que reescrever.
 */
function pedidoDeRefacao(p: {
  prompt: string;
  anterior: string;
  parecer: string;
  instrucao: string;
}): string {
  return [
    p.prompt,
    "",
    "── A SUA VERSÃO ANTERIOR (é ESTE texto que precisa ser corrigido) ──",
    p.anterior.slice(0, 6000),
    "",
    `── O PARECER ──\n${p.parecer}`,
    "",
    p.instrucao,
  ].join("\n");
}

export interface ExecutionResult {
  ok: boolean;
  status: "done" | "failed" | "skipped_running";
  produced: string[];
  askedClient: string[];
  skipped: string[];
  /** Como o PM regeu esta produção (ordem dos departamentos, objetivo). */
  pmPlan?: { orderedDepartments: string[]; goal: string; pmMode: string };
  /** Parecer da Qualidade por entrega. TRÊS estados — `nao_auditado` não é
   *  aprovação, é ausência de árbitro (ver `quality-auditor.ts`). */
  qualityAudit?: Array<{ department: string; verdict: VereditoDaQualidade; issues: string[] }>;
  /** Peças que a Qualidade REPROVOU e que sobreviveram às revisões. Não são
   *  apresentadas ao cliente: `apresentar`/`apresentarCiclo` recusam enquanto
   *  existir `quality_flag`, e `pacote-travado.ts` refaz até escalar. */
  reprovadosPelaQualidade?: ReprovadoPelaQualidade[];
  /** Peças que foram ao cliente SEM árbitro (IA da Qualidade fora do ar, timeout
   *  ou resposta ilegível). Não bloqueiam — mas nunca contam como aprovadas. */
  naoAuditados?: NaoAuditado[];
  /** Quantos pedidos de material o PM cobrou do cliente nesta passada. */
  pedidosCobrados?: number;
  /** O PM tentou apresentar o pacote ao cliente sozinho? Ausente = nem tentou
   *  (pacote incompleto). `ok: false` = tentou e foi BARRADO — quase sempre
   *  pela Qualidade, e é exatamente para isso que o freio existe. */
  apresentado?: ApresentacaoAutomatica;
  /** Peças que afirmaram dado que a agência não sustenta e NÃO foram publicadas.
   *  Diferente do parecer da Qualidade: isto é fato objetivo, e bloqueia. */
  barradosNoPiso?: BarradoNoPiso[];
  error?: string;
}

export interface BarradoNoPiso {
  especialista: string;
  violacoes: string[];
  parecer: string;
}

export interface ReprovadoPelaQualidade {
  especialista: string;
  deliverableId: string;
  issues: string[];
  parecer: string;
}

export interface NaoAuditado {
  especialista: string;
  deliverableId: string;
  /** Por que ninguém olhou: `ia_indisponivel` | `timeout` | `erro` | `resposta_invalida`. */
  motivo: string;
}

export interface ApresentacaoAutomatica {
  ok: boolean;
  motivo?: string;
}

/**
 * O cliente já tem foto/vídeo próprio para a agência usar?
 *
 * É função com nome, e não leitura solta no meio do contexto, porque a resposta
 * mora em TRÊS campos que o briefing escreve com nomes diferentes — e nenhum
 * deles se chama "material próprio". Um `scope.hasRawMaterial` solto parece
 * certo, compila, roda, e está sempre falso.
 *
 * A ordem importa: `needsVideoProduction === true` é resposta EXPLÍCITA do
 * cliente ("a Dioli produz o vídeo") e ganha de qualquer outro sinal.
 */
function temMaterialProprio(scope: Record<string, unknown>): boolean {
  const social = (scope.social ?? {}) as Record<string, unknown>;
  if (social.needsVideoProduction === true) return false;
  return (
    social.hasPhotos === true ||
    social.hasVideomaker === true ||
    social.creativesReady === true ||
    // Compatibilidade com briefing preenchido por outra via.
    scope.hasRawMaterial === true ||
    scope.materialBruto === true
  );
}

/**
 * Roda a produção de um projeto de ponta a ponta, com estado durável no banco.
 * Sem sessão — a rota HTTP já autentica; o cron chama direto. Idempotente.
 */
export async function runProjectExecution(projectId: string): Promise<ExecutionResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto não encontrado" };
  if (!project.clientRequestId) {
    await prisma.project.update({ where: { id: projectId }, data: { executionStatus: "failed", executionError: "Projeto sem solicitação vinculada" } });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: "Projeto sem solicitação vinculada" };
  }

  // ── O PORTÃO DE PAGAMENTO ──────────────────────────────────────────────────
  // "Eu vou pedir pra fazer um bolo, e só pago o bolo quando o bolo está feito?
  //  Não — eu preciso do dinheiro pra comprar os insumos. Então a trava é o
  //  pagamento." (CEO, 24/08/2026)
  //
  // Vem ANTES de tudo — antes do portão de direção e antes da trava de
  // concorrência — porque é o portão mais barato e o mais duro: sem dinheiro
  // não se gasta NADA, nem uma tentativa de execução, nem um token. Marcar
  // "running" para logo desmarcar queimaria orçamento de retomada de um projeto
  // que não pode nem começar.
  //
  // Ele guarda os NOVE chamadores de produção de uma vez, e é por isso que não
  // foi espalhado por eles: um portão por chamador é um portão que o décimo
  // chamador esquece. Quem garante que não nasce um décimo caminho por fora é
  // `__tests__/financeiro/portao-de-pagamento.test.ts`.
  //
  // `skipped_running` (e não `failed`) de propósito: aguardar pagamento não é
  // defeito do projeto, não gasta tentativa e não precisa que o cron "recupere"
  // nada. O projeto volta a `idle` e espera — assim que o pagamento for
  // registrado, a próxima rodada do despertador o pega sem intervenção.
  const pagamento = await conferirPagamento(project.clientRequestId);
  if (!pagamento.liberado) {
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "idle", executionError: null },
    }).catch(() => { /* best-effort */ });
    return {
      ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [],
      // A INSTRUÇÃO GÊMEA sobe junto com a recusa: quem lê isto na tela ou no
      // log fica sabendo o que fazer, não só que está barrado.
      error: pagamento.mensagemAoCliente,
    };
  }

  // ── O PORTÃO DE DIREÇÃO ────────────────────────────────────────────────────
  // A produção inteira só roda depois que o cliente avaliza o caminho. Aprovar
  // uma direção custa uma conversa; refazer um mês de produção custa o mês.
  // Sem este portão, a agência descobre que errou o rumo depois de gastar tudo.
  //
  // Vem ANTES da trava de propósito: sem o aval não há execução, e marcar
  // "running" (gastando uma tentativa) para logo desmarcar seria queimar o
  // orçamento de retomada de um projeto que nem começou.
  if (!project.directionApprovedAt) {
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "idle", executionError: null },
    }).catch(() => { /* best-effort */ });
    return {
      ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [],
      error: "aguardando o cliente aprovar a direção — a produção não começa antes disso",
    };
  }

  // ── A TRAVA ANTI-CONCORRÊNCIA É ATÔMICA ──────────────────────────────────
  // Era ler (findUnique), decidir (if) e escrever (update) — três passos, com
  // CINCO chamadores, um deles disparado sem espera (`portal/approvals`). O
  // cliente aprovar no mesmo minuto do cron abria duas execuções do mesmo ciclo,
  // e como não existe unique em (projectId, cycleId, ownerAgentId), o cliente
  // recebia duas "Pauta do Mês" do mesmo mês.
  //
  // Agora quem trava é o BANCO: o estado esperado vai no WHERE e quem ganha é
  // quem viu `count === 1`. O perdedor não roda — e isso é o certo, não um erro.
  const travadoAntesDe = new Date(Date.now() - TRAVA_DE_EXECUCAO_MS);
  const errosAnteriores = project.executionError ?? "";
  const tomouATrava = await prisma.project.updateMany({
    where: {
      id: projectId,
      OR: [
        { executionStatus: { not: "running" } },
        { executionStartedAt: null },
        { executionStartedAt: { lt: travadoAntesDe } },
      ],
    },
    data: {
      executionStatus: "running",
      executionStartedAt: new Date(),
      executionRequestedAt: project.executionRequestedAt ?? new Date(),
      executionAttempts: { increment: 1 },
      executionError: null,
    },
  });
  if (tomouATrava.count === 0) {
    return { ok: true, status: "skipped_running", produced: [], askedClient: [], skipped: [], error: "já em execução" };
  }

  const clientRequestId = project.clientRequestId;
  try {
    // Qual ciclo está aberto agora. NULO no pacote inicial — o projeto ainda não
    // virou rotina, e as entregas dele nascem sem ciclo (é o que `aprovarPacote`
    // depois carimba como sendo do ciclo 1).
    //
    // ── FALHA AO LER O CICLO É BLOQUEIO, NUNCA `null` ────────────────────────
    // Havia um `.catch(() => null)` aqui, e ele era catastrófico porque `null`
    // não quer dizer "sem ciclo": `null` é TAMBÉM a chave da produção do pacote
    // inicial. Com o banco tossindo no mês 5, o motor consultava as entregas do
    // ciclo `null` (as do mês 1), via todos os especialistas já produzidos,
    // montava `toRun` vazio, concluía `allHandled: true` e gravava
    // `executionStatus: "done"`. O MÊS INTEIRO era pulado e carimbado como
    // concluído — e o cron não recupera "done".
    //
    // Agora lança: o catch externo marca `failed`, e o mês é retentado.
    //
    // E a leitura é FEITA AQUI, direto, em vez de por `ciclos.cicloAberto()`:
    // aquela função tem um `catch { return null }` dentro dela
    // (`lib/agency/esteira/ciclos.ts:118`), então tirar o catch daqui não
    // resolveria nada — o `null` já teria nascido lá dentro, com a mesma cara de
    // "este projeto não tem ciclo". Para quem lê um ciclo para MOSTRAR, engolir
    // o erro é aceitável; para quem o usa como CHAVE DE IDEMPOTÊNCIA, é o mês
    // inteiro pulado. A consulta é a mesma; o tratamento do erro é o oposto.
    const cicloAberto = await prisma.cycle
      .findFirst({
        where: { projectId, status: { in: ["aberto", "entregue"] } },
        orderBy: { reference: "desc" },
        select: { id: true, startsOn: true },
      })
      .then((c) => c ?? null)
      .catch((e) => {
        throw new Error(`não consegui ler o ciclo aberto do projeto (${e instanceof Error ? e.message : "erro"}) — a produção PARA aqui: seguir com ciclo nulo pularia o mês inteiro e o marcaria como concluído`);
      });
    const cicloId = cicloAberto?.id ?? null;

    // ── QUAL LEVA DO MÊS ESTA PASSADA ESCREVE (25/08/2026) ────────────────────
    //
    // O mês deixou de sair numa passada só. `levaDevidaEm` conta do começo do
    // ciclo: leva 1 nos primeiros dez dias, 2 nos dez seguintes, 3 daí em
    // diante. Ver o porquê do número e do ritmo em `escopo-do-cliente.ts`.
    //
    // Sem ciclo aberto (o pacote inicial) é sempre a leva 1 — aquele pacote
    // nasce antes de o projeto virar rotina e não tem calendário de mês.
    //
    // ⚠️ FALHA PARA A LEVA 1, e é o lado seguro: data ilegível produz de novo o
    // lote que já existe e o motor pula por idempotência, em vez de abrir uma
    // leva que ninguém comprou.
    const levaDaPassada = (() => {
      const inicio = cicloAberto?.startsOn ? new Date(`${cicloAberto.startsOn}T00:00:00Z`) : null;
      if (!inicio || Number.isNaN(inicio.getTime())) return 1;
      return levaDevidaEm(inicio, new Date());
    })();

    const [req, client, artifacts, existing, materiaisResolvidos, feedDoCliente] = await Promise.all([
      prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } }),
      prisma.client.findFirst({ where: { id: project.clientId }, include: { brandBrain: true } }),
      prisma.brainArtifact.findMany({ where: { clientRequestId, status: "approved" }, select: { department: true, canvasJson: true } }),
      // ── A FOLHA EM BRANCO DO MÊS ─────────────────────────────────────────
      // A idempotência é por especialista DENTRO DO CICLO. Era por projeto, e
      // valia para sempre: o cliente vitalício recebia uma entrega na vida —
      // no mês 2 o motor via "todos já produziram" e não fazia nada. Nenhum
      // teste pegava, porque cada peça estava certa; a operação contínua é que
      // não existia.
      prisma.deliverable.findMany({
        where: { projectId, cycleId: cicloId },
        select: { ownerAgentId: true, leva: true },
      }),
      // O que o cliente já entregou. Sem isto, quem depende de material seria
      // cobrado para sempre — inclusive depois de o cliente ter respondido.
      prisma.materialRequest.findMany({
        where: { projectId, status: { not: "pending" } },
        select: { type: true },
      }),
      // ── A LEITURA MINUCIOSA DO CLIENTE (pedido do CEO, 04/08/2026) ───────
      // Uma vez por execução, ANTES de qualquer especialista produzir: o feed
      // real do Instagram vira síntese e entra no contexto de TODOS. Nunca
      // lança e nunca trava — sem conexão, devolve a degradação declarada
      // ("feed não lido: <motivo>") que proíbe inferir estilo do nada.
      sinteseDoFeedDoCliente(project.workspaceId, project.clientId, clientRequestId),
    ]);
    if (!req) throw new Error("Solicitação não encontrada");

    const scope = (() => { try { return JSON.parse(req.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; } })() as Record<string, unknown>;
    const services = (() => { try { return JSON.parse(req.services ?? "[]"); } catch { return []; } })() as string[];
    const objectives = (() => { try { return JSON.parse(req.objectives ?? "[]"); } catch { return []; } })() as string[];
    const strategyArtifact = artifacts.find((a) => a.department === "strategy");
    const strategyHeadline = (() => {
      if (!strategyArtifact) return "";
      try { const c = JSON.parse(strategyArtifact.canvasJson); return (c.positioning ?? c.mainObjective ?? c.summary ?? "") as string; } catch { return ""; }
    })();
    const brand = client?.brandBrain ?? null;

    // ── O TETO DE TOKENS TEM DE CABER O QUE FOI PEDIDO (24/08/2026) ─────────
    //
    // Era `maxTokens: 1800`, fixo, igual para todo especialista — e ficou fixo
    // enquanto o contrato de saída passou a ser DERIVADO do cliente (15/08).
    // O piloto mediu a consequência: cliente com 12 peças compradas, cada uma
    // com legenda, direção de arte e storyboard de até 6 telas. A resposta era
    // cortada no meio, o reparo do JSON truncado descartava o item incompleto,
    // e o contrato recebia `items: []` — "entregou 0 peças de conteúdo".
    //
    // Zero não é preguiça do modelo: é a resposta dele amputada. E o laço de
    // refação relia o mesmo teto, então nunca saía do lugar.
    //
    // A conta é por peça, com piso no teto histórico (nada encolhe para quem já
    // funcionava) e um limite superior para um contrato absurdo não virar uma
    // chamada de custo aberto.
    const TETO_HISTORICO = 1800;
    const TOKENS_POR_PECA = 420;
    const TETO_MAXIMO = 8000;
    const exigenciaDoCliente = exigenciaDeConteudo(
      lerEscopoDeConteudo({
        servicos: services,
        escopo: JSON.stringify(scope),
        contextoBruto: req.rawContext ?? "",
      }),
      levaDaPassada,
    );
    const tetoDeTokens = Math.min(
      TETO_MAXIMO,
      Math.max(TETO_HISTORICO, exigenciaDoCliente.max * TOKENS_POR_PECA),
    );

    // ── A VERDADE OPERACIONAL, LIDA UMA VEZ SÓ ──────────────────────────────
    // Ela alimenta DUAS coisas: o prompt do especialista (o que ele pode
    // afirmar) e o piso de verdade (o que será conferido). Ler duas vezes
    // abriria a porta para as duas divergirem — e divergindo, a régua cobra um
    // fato que o prompt nunca entregou, que é exatamente o defeito que o piloto
    // mediu em 24/08/2026.
    const operacaoDoCliente = (await buildVerdadeOperacional(clientRequestId)) ?? undefined;

    const context: Ctx = {
      // Qual leva do mês está sendo escrita AGORA. É ela que dá o tamanho do
      // lote ao especialista e à régua que o confere — as duas leem daqui.
      leva: levaDaPassada,
      // A régua da marca, montada ANTES da produção e entregue no prompt de
      // todo especialista. Best-effort de propósito: contrato que falha não
      // pode derrubar a esteira — e a falta dele não fica muda, porque o próprio
      // texto do contrato declara "marca não constituída" quando é o caso.
      contratoDeMarca: (await contratoDeMarca(project.clientId).catch(() => null))?.texto,
      // O NOME OLHA AS TRÊS MEMÓRIAS, não só a coluna. Medido na 8ª volta: uma
      // entrega de Estratégia nasceu com "PRECISO CONFIRMAR: nome do negócio"
      // no título, e o nome estava no escopo desde o primeiro turno — a coluna
      // é `String` não-nulo e grava `""` quando a porta não soube o nome.
      // Ver `nomeDoNegocio`, em `comercial/negocio-do-lead.ts`.
      businessName:
        nomeDoNegocio({ businessName: req.businessName, briefingJson: req.briefingJson, clientName: client?.name })
        ?? "o cliente",
      segment: req.segment || (typeof scope.segment === "string" ? scope.segment : "") || client?.industry || "",
      targetAudience: typeof scope.targetAudience === "string" ? scope.targetAudience : (brand?.targetAudience ?? ""),
      tone: brand?.tone ?? "",
      services, objectives, strategyHeadline,
      hasBrandAssets: !!(brand && (brand.primaryColor || brand.typography || brand.tagline)),
      // Contratou identidade visual? Então não há marca para pedir — há marca
      // para criar. Lê tanto o bloco do briefing quanto o serviço contratado,
      // porque um cliente pode pedir "identidade visual" sem o SDR ter chegado
      // à pergunta do bloco.
      criandoIdentidade: (() => {
        const b = (scope.branding ?? {}) as Record<string, unknown>;
        if (b.fromScratch === true) return true;
        if (b.requested === true && b.hasBrandBook !== true) return true;
        return services.some((s) => /identidade|logo|marca|branding/i.test(s));
      })(),
      materiaisEntregues: [...new Set(materiaisResolvidos.map((m) => m.type))],
      // O que aconteceu no mês passado, para o especialista de otimização
      // decidir o que muda. Vazio no primeiro ciclo — e o prompt dele proíbe
      // inventar desempenho passado quando isto está vazio.
      resultadoDoCicloAnterior: await resultadoDoCicloAnterior(projectId, cicloId),
      // O que o cliente REALMENTE publica — síntese ou degradação declarada.
      feedRealDoCliente: feedDoCliente.texto,
      // O cliente tem material próprio (foto/vídeo) para a agência usar?
      //
      // ESTA LINHA JÁ ESTEVE ERRADA e o erro era invisível: lia
      // `scope.hasRawMaterial`, um campo que **nenhum código deste repositório
      // escreve**. O briefing guarda a mesma informação com outro nome, dentro
      // de `social`. O `?? false` transformava "não sei" em "não tem" — sem
      // erro, sem log e sem teste vermelho — e o especialista de vídeo mandava
      // a dona do salão GRAVAR os vídeos que ela já tinha, e que ela já tinha
      // dito que tinha. Cada peça passava no seu teste; a junta arrebentava.
      hasRawMaterial: temMaterialProprio(scope),
      // ── O QUE O CLIENTE COMPROU (15/08/2026) ─────────────────────────────
      //
      // Lido do que ELE escreveu — serviços contratados, bloco de escopo do
      // briefing, contexto bruto — com padrões determinísticos e sem IA. O que
      // o leitor não acha vira lacuna NOMEADA, nunca número inventado.
      //
      // Até hoje o contrato de saída do especialista de copy exigia de todo
      // cliente "6 a 8 peças, 1-2 carrossel, 2-3 story". O CityJobs EXCLUI
      // carrossel, story e vídeo e compra 60 posts simples por mês: a trava
      // mais cara da casa cobrava exatamente o que ele não comprou.
      escopoContratado: lerEscopoDeConteudo({
        servicos: services,
        escopo: JSON.stringify(scope),
        contextoBruto: req.rawContext ?? "",
      }),
      // ── A VERDADE QUE O PISO COBRA, ENTREGUE A QUEM PRODUZ (24/08/2026) ──
      //
      // O piloto barrou "Pesquisa de concorrência" com `area_nao_informada`: a
      // peça afirmou área de atendimento que o cliente nunca informou. O piso
      // estava certo; o defeito era o especialista NUNCA ter recebido a verdade
      // que o piso confere. Ele escrevia às cegas e era pego depois de pronto.
      //
      // Mesmo remédio do `contratoDeMarca` (09/08), agora para os fatos
      // operacionais: avisar ANTES em vez de barrar DEPOIS. As duas listas
      // saem da mesma estrutura que a conferência lê, então não há como uma
      // acompanhar a outra pela metade.
      //
      // `undefined` quando não há verdade montada — e o bloco cala, em vez de
      // afirmar "o cliente não atestou nada", que seria falso.
      ...(operacaoDoCliente
        ? {
            verdadeAtestada: {
              linhas: verdadeEmLinhas(operacaoDoCliente),
              semInformacao: classesSemInformacaoLegiveis(operacaoDoCliente),
            },
          }
        : {}),
    };

    // ── A ENTREGA COBRE O MÊS QUE ELE PAGOU? ────────────────────────────────
    //
    // O aviso não é parecer para o especialista — ele não resolve isto sozinho.
    // É registro para gente. Sem ele, o cliente compra 60 peças, recebe 8, e
    // NADA no sistema sabe dizer que faltou: foi assim até hoje.
    const cobertura = avisoDeCobertura(
      exigenciaDeConteudo(context.escopoContratado!),
      context.businessName,
    );
    if (cobertura) {
      await prisma.activityEvent.create({
        data: {
          workspaceId: project.workspaceId,
          projectId,
          clientId: project.clientId,
          type: "entrega_nao_cobre_o_contrato",
          message: cobertura.slice(0, 900),
        },
      }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
    }
    // As lacunas do contrato do cliente: o que NINGUÉM declarou e por isso caiu
    // na régua histórica da casa. Sobe como pergunta, não como número inventado.
    if ((context.escopoContratado?.lacunas.length ?? 0) > 0) {
      await prisma.activityEvent.create({
        data: {
          workspaceId: project.workspaceId,
          projectId,
          clientId: project.clientId,
          type: "escopo_do_cliente_com_lacuna",
          message:
            `O contrato deste cliente não diz: ${context.escopoContratado!.lacunas.join(" | ")}. ` +
            "A produção seguiu com a régua padrão da casa (6 a 8 peças, com mistura de formatos) — " +
            "que pode não ser o que ele comprou. Isto é pergunta para o cliente, não palpite nosso.",
        },
      }).catch(() => { /* best-effort */ });
    }

    // ── A VERDADE ANCORADA DO CLIENTE ────────────────────────────────────────
    // O que a agência SABE. Tudo que a peça afirmar além disto é invenção, e é
    // o piso determinístico que reprova — sem depender de IA nenhuma.
    const verdade: VerdadeDoCliente = {
      businessName: context.businessName,
      telefones: [client?.phone, (scope as Record<string, unknown>).prospectPhone, (scope as Record<string, unknown>).phone]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
      emails: [client?.email, (scope as Record<string, unknown>).prospectEmail, (scope as Record<string, unknown>).email]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
      servicos: services,
      // PREÇO e VERBA são números diferentes e não podem morar no mesmo campo.
      // `monthlyBudget`/`adsBudget` é o que o cliente paga À AGÊNCIA; preço é o
      // que ele cobra dos clientes DELE. Enquanto os dois eram um só, "Pacote
      // noiva por R$ 1.000" passava porque R$ 1.000 era a verba de mídia — a
      // peça de vitrine imprimia um preço que ninguém informou.
      ...(() => {
        const { precos, verbas } = separarValoresInformados(scope as Record<string, unknown>, req?.rawContext ?? "");
        return { valores: precos, verbas };
      })(),
      // A verdade OPERACIONAL — horário, área de entrega, pagamento, oferta,
      // canal e prazo — o servidor lê do que o cliente escreveu, não de quem
      // chama. Sem ela, o piso trata TODA classe como "não informada" e (por
      // ser fail-closed, de propósito) barraria qualquer peça com CTA de canal
      // ou horário. Não é opcional: é a fiação que faz o piso ser piso.
      // A MESMA leitura que alimentou o prompt do especialista (acima). Uma
      // verdade, dois usos: avisar quem produz e conferir o que foi produzido.
      operacao: operacaoDoCliente,
      // A METADE NEGATIVA da verdade ancorada: o que o cliente PROIBIU. Lida do
      // banco pelo servidor, nunca montada por quem chama, e fail-closed —
      // leitura que falha reprova a peça em vez de liberá-la. Ver
      // `lib/agency/esteira/proibicoes.ts`.
      // ⚠️ A SINCRONIZAÇÃO VEM ANTES DA LEITURA, e por isso está nesta ordem.
      // `sincronizarDoBriefing` nasceu em 06/08/2026 sem um único chamador: a
      // proibição que o cliente escreveu no briefing existia no texto, o
      // extrator determinístico sabia lê-la, e ela nunca chegava ao piso. O
      // chamador definitivo é a criação do projeto
      // (`create-project-from-request.ts`); ESTE aqui é o auto-conserto dos
      // clientes que já existiam antes daquele chamador — sem ele, todo cliente
      // criado até 07/08/2026 continuaria produzindo sem as próprias
      // proibições, para sempre e em silêncio.
      // Idempotente (dedup por conjunto de termos) e best-effort: falhar aqui
      // não pode derrubar a produção, mas o piso ainda é fail-closed na leitura.
      proibicoes: await (async () => {
        if (project.clientId) {
          await sincronizarDoBriefing(project.clientId)
            .catch((e) => console.warn("[execucao] proibições do briefing não sincronizaram:", e));
        }
        return lerProibicoes(project.clientId);
      })(),
    };

    const agents = (() => { try { return JSON.parse(project.agents ?? "[]"); } catch { return []; } })() as string[];
    // ── A IDEMPOTÊNCIA GANHOU UMA DIMENSÃO: A LEVA (25/08/2026) ──────────────
    //
    // Era por especialista DENTRO DO CICLO, e valia o mês inteiro: depois da
    // primeira passada, o especialista de conteúdo era pulado até o mês virar.
    // É exatamente por isso que o teto real da casa era 12 peças/mês — não por
    // custo (cada peça sai por ~R$ 1,30), por construção.
    //
    // Agora quem produz PEÇA é idempotente por (ciclo, LEVA, especialista);
    // todo o resto continua idempotente por (ciclo, especialista). A distinção
    // é deliberada e é onde mora o dinheiro: pauta do mês, base de marca,
    // estratégia e relatório são UM por ciclo — repeti-los a cada leva
    // triplicaria a conta de IA para entregar três vezes o mesmo documento.
    //
    // `leva: null` é entrega anterior a esta mudança e conta como leva 1.
    const produzemPeca = new Set(["social-copy"]);
    const producedAgents = new Set(
      existing
        .filter((d) => !produzemPeca.has(d.ownerAgentId ?? "") || (d.leva ?? 1) >= levaDaPassada)
        .map((d) => d.ownerAgentId)
        .filter(Boolean),
    );

    // ── O DIRETOR REGE OS DEPARTAMENTOS; O DEPARTAMENTO REGE OS SEUS ───────────
    // Duas camadas, e é o ponto da estrutura: o plano do PM ordena as CASAS
    // (estratégia antes de social, social antes de design); dentro de cada casa,
    // os especialistas produzem na ordem em que estão declarados. Um especialista
    // que já entregou é pulado — a idempotência agora é por ESPECIALISTA, não por
    // departamento, senão o primeiro a produzir calaria os colegas dele.
    const plan: ProductionPlan = await planProduction(clientRequestId, DEPARTAMENTOS.map((d) => d.id));
    const byId = new Map(DEPARTAMENTOS.map((d) => [d.id, d]));
    const orderedDepts: Departamento[] = [];
    const added = new Set<string>();
    // 1) na ordem que o PM definiu;
    for (const deptId of plan.orderedDepartments) {
      const cfg = byId.get(deptId);
      if (cfg && !added.has(cfg.id)) { orderedDepts.push(cfg); added.add(cfg.id); }
    }
    // 2) robustez: departamentos atribuídos ao projeto ou por serviço que o PM não listou.
    //    "Atribuído" vale se QUALQUER especialista da casa foi escalado.
    for (const d of DEPARTAMENTOS) {
      if (added.has(d.id)) continue;
      const escalado = d.especialistas.some((e) => agents.includes(e.id));
      if (escalado || services.some((s) => d.keywords.test(s))) { orderedDepts.push(d); added.add(d.id); }
    }

    // A fila achatada: cada item é UM especialista, já sabendo de que casa veio.
    const toRun: Array<{ dept: Departamento; esp: Especialista }> = orderedDepts.flatMap((dept) =>
      dept.especialistas
        .filter((esp) => !producedAgents.has(esp.id))
        // Fora do escopo do cliente nem é escalado — não abre pedido, não gasta
        // token, não vira entrega que ninguém comprou. Ver `soQuando`.
        .filter((esp) => !esp.soQuando || esp.soQuando(context))
        .map((esp) => ({ dept, esp })),
    );

    const produced: string[] = [];
    const askedClient: string[] = [];
    // ── DUAS NATUREZAS DE PENDÊNCIA, DUAS LISTAS ─────────────────────────────
    // `skipped` misturava "a IA caiu" (vale retentar: o mundo muda) com
    // "reprovado no piso" (a peça foi produzida e RECUSADA — o cron retentava 5
    // vezes, queimando 2 chamadas por especialista por passada, para chegar
    // sempre ao mesmo lugar). Agora são listas separadas, e é a lista transitória
    // que decide se a passada foi "failed" e volta para a fila do cron.
    const skipped: string[] = [];
    /** Recusas: a peça existiu e foi barrada. Retentar é re-rolar o dado — caro,
     *  e sem nada no mundo tendo mudado. */
    const recusados: string[] = [];
    const qualityAudit: Array<{ department: string; verdict: VereditoDaQualidade; issues: string[] }> = [];
    const barradosNoPiso: BarradoNoPiso[] = [];
    const reprovadosPelaQualidade: ReprovadoPelaQualidade[] = [];
    const naoAuditados: NaoAuditado[] = [];

    // ── O CONTADOR DA ESCADA ─────────────────────────────────────────────────
    // Cada peça produzida vira UM registro — inclusive as barradas. É o
    // denominador da evidência que autoriza um departamento a subir de degrau.
    //
    // Contar só o que virou `Deliverable` mentiria a favor do departamento:
    // peça reprovada no piso de verdade ou no contrato de saída nunca chega a
    // existir como entrega, então o departamento que inventa dado o tempo todo
    // apareceria com histórico impecável e subiria para wide.
    //
    // `provedor` entrou junto (06/08/2026) para NÃO existir uma segunda escada.
    // Provedor novo é exposição nova, e a casa já sabe medir exposição: peças
    // aprovadas e reprovadas numa janela. Com o provedor carimbado aqui, "o
    // gratuito aguenta o tráfego pago deste cliente?" é uma consulta sobre a
    // MESMA evidência que decide se a peça chega ao cliente.
    const degrauDaCasa = new Map<string, Degrau>();
    const anotarNaEscada = async (deptId: string, resultado: ResultadoDaPeca, detalhe: string, deliverableId?: string, provedor?: string | null) => {
      let degrau = degrauDaCasa.get(deptId);
      if (!degrau) { degrau = await degrauAtual(project.workspaceId, deptId); degrauDaCasa.set(deptId, degrau); }
      await registrarProducao({
        workspaceId: project.workspaceId, departmentId: deptId, projectId,
        clientId: project.clientId, deliverableId: deliverableId ?? null,
        degrauNaEpoca: degrau, resultado, detalhe, provedor: provedor ?? null,
      });
    };

    for (const { dept, esp } of toRun) {
      // Como este trabalho se chama no relatório e no portal: casa · especialista.
      const nome = `${dept.label} · ${esp.label}`;
      if (esp.precisaDe && !esp.precisaDe.tem(context)) {
        // UMA VOZ: o agente ABRE o pedido, não fala com o cliente. O gerente de
        // projeto junta tudo numa mensagem só no fim desta passada.
        await abrirPedido({
          projectId, tipo: dept.id, descricao: esp.precisaDe.pedido,
          agentId: esp.id, agenteLabel: nome,
        });
        await moverTarefasDoAgente(projectId, esp.id, "blocked");
        askedClient.push(nome);
        continue;
      }

      // A tarefa passa a contar a verdade no MESMO instante do trabalho.
      await moverTarefasDoAgente(projectId, esp.id, "in_progress");

      // Radar Dioli: as diretrizes ATUAIS de mercado do domínio viram insumo.
      const insights = await getActiveInsights(project.workspaceId, dept.insightDomain);
      const insightBlock = buildInsightBlock(insights);

      // Cada especialista chama a IA que faz MELHOR o trabalho dele. Redação
      // criativa, número e pesquisa não são a mesma competência.
      const result = await generate({
        system: `Você é o especialista de ${esp.label} do departamento de ${dept.label} de uma agência de marketing brasileira. Produza conteúdo real, específico e pronto para o cliente. Responda SOMENTE com JSON válido.`,
        user: esp.prompt(context) + (insightBlock ? `\n\n${insightBlock}` : ""),
        maxTokens: tetoDeTokens,
        // ── A FORMA, TRAVADA EM CÓDIGO QUANDO HÁ CONTRATO ──────────────────
        // Especialista com contrato de saída tem a contagem conferida em
        // `data.items`. Objeto sem `items` vira "entregou 0" — e foi o que o
        // piloto mediu na pauta, de forma intermitente. Com o esquema
        // declarado o modelo não CONSEGUE devolver outra forma.
        ...(esp.contrato ? { esquema: ESQUEMA_DO_PACOTE } : {}),
        workspaceId: project.workspaceId,
        preferredProvider: esp.provedor ?? "claude",
        // DE QUEM é a chamada. Duas coisas dependem disto e nenhuma é opcional:
        // a fixação de provedor DESTE cliente (que vence o `preferredProvider`
        // acima) e a conta — sem `clientId`, "quanto custou este cliente este
        // mês" volta a não ter resposta.
        clientId: project.clientId,
        departmentId: dept.id,
        agentId: esp.id,
        projectId,
      });

      if (!result.ok) {
        skipped.push(`${nome} (IA: ${result.error})`);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        continue;
      }
      let data = result.data as Record<string, unknown>;

      // ── O CONTRATO DE SAÍDA, CONFERIDO NO JSON ───────────────────────────
      // Aqui e não depois do markdown: "6 a 8 peças", "1-2 carrossel", "cenas:
      // 3 a 6 telas" são campos estruturados, e depois de virarem texto a
      // contagem já não é conferível. É a checagem mais barata da casa — não
      // custa uma chamada de IA — e fecha o buraco em que o cliente contratava
      // 8 posts e recebia 3, todos feed, sem ninguém saber.
      let contrato = conferirContrato(esp, data, context);
      let correcoesDeContrato = 0;
      while (!contrato.cumpriu && correcoesDeContrato < MAX_CORRECOES_DE_CONTRATO) {
        const refeito = await generate({
          system: "Você é um agente sênior de uma agência de marketing brasileira. Sua entrega NÃO cumpriu o contrato de formato e quantidade que o cliente comprou. Reentregue COMPLETA, no mesmo formato JSON. Não corte conteúdo bom da versão anterior — complete o que falta.",
          user: pedidoDeRefacao({
            prompt: esp.prompt(context),
            anterior: JSON.stringify(data),
            parecer: `O CONTRATO DE SAÍDA NÃO FOI CUMPRIDO:\n- ${contrato.violacoes.join("\n- ")}`,
            instrucao: "Reentregue o JSON inteiro cumprindo exatamente essas contagens e formatos.",
          }),
          maxTokens: tetoDeTokens, ...(esp.contrato ? { esquema: ESQUEMA_DO_PACOTE } : {}),
          workspaceId: project.workspaceId, preferredProvider: esp.provedor ?? "claude",
          clientId: project.clientId, departmentId: dept.id, agentId: esp.id, projectId,
        });
        correcoesDeContrato++;
        if (!refeito.ok) break;
        const novo = refeito.data as Record<string, unknown>;
        const conferido = conferirContrato(esp, novo, context);
        // Só troca se MELHOROU: uma segunda resposta pior que a primeira não
        // pode ser promovida só por ser a mais recente.
        if (conferido.violacoes.length <= contrato.violacoes.length) {
          data = novo;
          contrato = conferido;
        }
      }
      if (!contrato.cumpriu) {
        // NÃO PUBLICA. Entregar 3 posts de 8 é quebra de contrato que o cliente
        // percebe — e, ao contrário de um dado inventado, esta é conferível em
        // código, então não há desculpa para ela chegar lá.
        const parecer = contrato.violacoes.join("; ");
        recusados.push(`${nome} (contrato de saída não cumprido: ${parecer})`);
        barradosNoPiso.push({ especialista: nome, violacoes: ["contrato_de_saida"], parecer });
        await anotarNaEscada(dept.id, "barrada_contrato", parecer, undefined, result.provider);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "contrato_de_saida_barrou",
            message: `${nome} para ${context.businessName}: ${parecer}`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
        continue;
      }

      // ── E O TÍTULO NÃO PERGUNTA O QUE A CASA JÁ SABE ────────────────────
      // Trava, não conserto de dado: quando o nome é conhecido e o especialista
      // ainda assim confessa a lacuna NO RÓTULO, o rótulo vira o padrão
      // determinístico. A confissão continua valendo no corpo, onde ela é uma
      // pergunta com contexto — no título ela é a etiqueta do trabalho.
      const tituloPadrao = `${nome} — ${context.businessName}`;
      let title = tituloSemConfissao(
        typeof data.title === "string" ? data.title : tituloPadrao,
        tituloPadrao,
        nomeDoNegocio({ businessName: req.businessName, briefingJson: req.briefingJson, clientName: client?.name }),
      );
      let body = deliverableMarkdown(data);
      // Gate de saída: nada vazio/curto demais chega ao cliente.
      if (!body || body.length < MIN_DELIVERABLE_CHARS) {
        skipped.push(`${nome} (resposta insuficiente)`);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        continue;
      }

      // Produziu: sai de "produzindo" e entra em revisão — é onde a Qualidade age.
      await moverTarefasDoAgente(projectId, esp.id, "review");

      // ── O PISO DE VERDADE — o freio que NÃO depende de IA ────────────────
      // Roda ANTES do juiz de IA e é bloqueante. Um LLM julgando outro LLM tem
      // o mesmo ponto cego dos dois: telefone inventado plausível parece
      // plausível para o juiz também. Este confere contra a verdade conhecida
      // do cliente, em código, sem rede — e por isso nunca fica "indisponível".
      //
      // Não julga qualidade nem gosto: responde só se a peça afirma FATO que a
      // agência não tem como sustentar. Reprovou, o especialista refaz com o
      // parecer na mão; reprovou de novo, a peça NÃO é publicada.
      //
      // ── O TÍTULO TAMBÉM É A ENTREGA ──────────────────────────────────────
      // Até 05/08/2026 o piso conferia só o `body`, e `deliverableMarkdown` NÃO
      // inclui o título. Só que o título vira o `name` do `Deliverable` — o
      // PRIMEIRO campo que o cliente lê no portal. "Pacote Noiva R$ 1.000 —
      // entrega em 24h" passava inteiro, com preço e prazo inventados, e o piso
      // dizia aprovado. O que vai ao cliente é título + corpo; é isso que o
      // piso confere.
      const conferirPeca = (t: string, b: string) => conferirPisoDeVerdade(`${t}\n\n${b}`, verdade);
      let piso = conferirPeca(title, body);
      let correcoesDePiso = 0;
      while (!piso.aprovado && correcoesDePiso < MAX_CORRECOES_DE_PISO) {
        const parecer = resumirViolacoes(piso.violacoes);
        const refeito = await generate({
          system: "Você é um agente sênior de uma agência de marketing brasileira. Sua entrega afirmou dados que a agência NÃO tem como sustentar. Corrija removendo ou substituindo por \"PRECISO CONFIRMAR: <o quê>\". NUNCA troque um dado inventado por outro inventado. Responda SOMENTE JSON válido no mesmo formato.",
          user: pedidoDeRefacao({
            prompt: esp.prompt(context),
            anterior: JSON.stringify(data),
            parecer: `A VERIFICAÇÃO DE VERDADE REPROVOU a versão anterior: ${parecer}`,
            instrucao: 'Refaça sem esses dados — inclusive no campo "title". Onde faltar informação do cliente, escreva "PRECISO CONFIRMAR: <o quê>".',
          }),
          maxTokens: tetoDeTokens, ...(esp.contrato ? { esquema: ESQUEMA_DO_PACOTE } : {}),
          workspaceId: project.workspaceId, preferredProvider: esp.provedor ?? "claude",
          clientId: project.clientId, departmentId: dept.id, agentId: esp.id, projectId,
        });
        correcoesDePiso++;
        if (!refeito.ok) break;
        const novo = refeito.data as Record<string, unknown>;
        const corrigido = deliverableMarkdown(novo);
        if (!corrigido || corrigido.length < MIN_DELIVERABLE_CHARS) break;
        // A correção do piso não pode DESFAZER o contrato de saída: cortar duas
        // peças para remover um preço inventado resolve uma coisa e quebra
        // outra. Se a versão corrigida deixou de cumprir o contrato, ela não
        // entra — a peça é barrada com o parecer que já está na mão.
        if (!conferirContrato(esp, novo, context).cumpriu) break;
        data = novo;
        body = corrigido;
        const t = novo.title;
        if (typeof t === "string" && t.trim()) title = t;
        piso = conferirPeca(title, body);
      }

      if (!piso.aprovado) {
        // NÃO PUBLICA. Este é o ponto em que a casa deixa de ser 100% "sai de
        // qualquer jeito": dado inventado que sobreviveu à correção não vira
        // entrega. Fica registrado para a equipe, e o cliente não vê.
        const parecer = resumirViolacoes(piso.violacoes);
        recusados.push(`${nome} (reprovado no piso de verdade: ${piso.violacoes.map((v) => v.id).join(", ")})`);
        barradosNoPiso.push({ especialista: nome, violacoes: piso.violacoes.map((v) => v.id), parecer });
        await anotarNaEscada(dept.id, "barrada_piso", parecer, undefined, result.provider);
        await moverTarefasDoAgente(projectId, esp.id, "pending");
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "piso_de_verdade_barrou",
            message: `${nome} para ${context.businessName}: ${parecer}`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
        continue;
      }

      // QUALIDADE ATIVA — o loop de correção (garante boa entrega ANTES do cliente):
      // audita → se reprovar, o agente REVISA com o parecer → reentrega melhorada.
      // O cliente sempre DECIDE; nós garantimos que o que chega já está bom.
      let audit = await auditDeliverable({
        deptLabel: nome, title, content: body, brandContext: ctxBlockParaJuiz(context),
        marketGuidelines: insightBlock, workspaceId: project.workspaceId,
        // O estado da leitura vai como DADO, não como substring para o auditor
        // farejar no contexto — ver o comentário dos três estados lá.
        feed: { lida: feedDoCliente.lida, posts: feedDoCliente.posts },
        // QUEM ESCREVEU. O juiz é escolhido para não ser ele — sem isto, em 11
        // das 14 entregas o autor se auditava (ver `escolherArbitro`).
        provedorDoAutor: esp.provedor ?? "claude",
        // O tipo decide se a régua determinística de texto se aplica: peça que
        // fala com o mercado sim, documento de análise não. Ver
        // `regua-do-texto.ts` (`TIPOS_DE_DOCUMENTO_INTERNO`).
        tipoDaEntrega: esp.deliverableType,
        clientId: project.clientId, projectId,
      });
      let revisions = 0;
      // Só REPROVAÇÃO manda refazer. `nao_auditado` não é parecer — pedir ao
      // especialista que "corrija" o que ninguém apontou é queimar IA para
      // reescrever uma peça possivelmente boa às cegas.
      while (foiReprovadaPelaQualidade(audit.verdict) && revisions < MAX_QUALITY_REVISIONS) {
        const fix = await generate({
          system: "Você é um agente sênior de uma agência de marketing brasileira. A Qualidade apontou problemas na sua entrega — CORRIJA-OS e reentregue melhor. Responda SOMENTE com JSON válido no mesmo formato.",
          user: pedidoDeRefacao({
            prompt: `${esp.prompt(context)}${insightBlock ? `\n\n${insightBlock}` : ""}`,
            anterior: JSON.stringify(data),
            parecer: `A Qualidade REPROVOU a versão anterior por: ${audit.issues.join("; ") || audit.note}`,
            instrucao: "Refaça corrigindo exatamente esses pontos, mantendo o que já estava bom.",
          }),
          maxTokens: tetoDeTokens, ...(esp.contrato ? { esquema: ESQUEMA_DO_PACOTE } : {}),
          workspaceId: project.workspaceId, preferredProvider: esp.provedor ?? "claude",
          clientId: project.clientId, departmentId: dept.id, agentId: esp.id, projectId,
        });
        revisions++;
        if (!fix.ok) break;
        const corrigido = fix.data as Record<string, unknown>;
        const fixedBody = deliverableMarkdown(corrigido);
        if (!fixedBody || fixedBody.length < MIN_DELIVERABLE_CHARS) break;
        // Nem a Qualidade pode fazer a entrega encolher abaixo do contratado, e
        // nem pode reintroduzir dado que a agência não sustenta. As duas travas
        // que já rodaram continuam valendo depois da revisão.
        if (!conferirContrato(esp, corrigido, context).cumpriu) break;
        const fixedTitle = typeof corrigido.title === "string" && corrigido.title.trim() ? corrigido.title : title;
        if (!conferirPeca(fixedTitle, fixedBody).aprovado) break;
        data = corrigido;
        body = fixedBody;
        title = fixedTitle;
        audit = await auditDeliverable({
          deptLabel: nome, title, content: body, brandContext: ctxBlockParaJuiz(context),
          marketGuidelines: insightBlock, workspaceId: project.workspaceId,
          feed: { lida: feedDoCliente.lida, posts: feedDoCliente.posts },
          provedorDoAutor: esp.provedor ?? "claude",
          tipoDaEntrega: esp.deliverableType,
          clientId: project.clientId, projectId,
        });
      }

      // Grava a MELHOR versão, com o veredito REAL da Qualidade — três estados,
      // nunca um "ok" que quer dizer "não consegui olhar".
      //
      // Reprovada continua sendo GRAVADA de propósito: é o registro em
      // `quality_flag` que faz `pacote-travado.ts` encontrá-la, refazer até 2
      // tentativas e escalar. O que a reprovação bloqueia é a APRESENTAÇÃO —
      // `marcos.apresentar` e `mes.apresentarCiclo` recusam enquanto houver uma
      // peça em `quality_flag`, e o bloqueio vira `ActivityEvent` no fim desta
      // passada. Apagar a peça aqui mataria o caminho de conserto.
      const entregavel = await prisma.deliverable.create({
        data: {
          projectId, name: title, type: esp.deliverableType, status: "in_review", content: body,
          ownerAgentId: esp.id, cycleId: cicloId, leva: levaDaPassada,
          // O veredito E QUEM JULGOU, juntos e por um ponto só. Antes daqui o
          // `audit.arbitro` era calculado e jogado fora — a casa sabia quem
          // tinha julgado e não gravava, e por isso a tela não podia distinguir
          // árbitro independente de auto-julgamento. Ver `camposDaQualidade`.
          ...camposDaQualidade(audit),
          // ── O PARECER INTEIRO, NÃO SÓ A FRASE DE RESUMO (24/08/2026) ────────
          // Era `audit.note`, e o juiz às vezes devolve `note` vazia com os
          // problemas em `issues`. Medido no piloto: duas peças reprovadas com
          // "(a Qualidade não gravou o parecer — só o veredito)". Recusa sem
          // motivo não é acionável: quem produz não sabe o que corrigir, e quem
          // lê o portal não sabe por que a peça parou.
          lastFeedback: [audit.note, ...audit.issues].filter(Boolean).join(" · ") || null,
          version: revisions + 1,
        },
        select: { id: true },
      });

      if (foiReprovadaPelaQualidade(audit.verdict)) {
        const parecer = audit.issues.join("; ") || audit.note || "qualidade insuficiente";
        reprovadosPelaQualidade.push({ especialista: nome, deliverableId: entregavel.id, issues: audit.issues, parecer });
        await anotarNaEscada(dept.id, "reprovada_qualidade", parecer, entregavel.id, result.provider);
        // O bloqueio precisa ser VISÍVEL, não um campo que ninguém abre. Sem
        // este registro, "a Qualidade reprovou" só existiria dentro de um
        // retorno de função que nenhum humano lê.
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "qualidade_reprovou",
            message: `${nome} para ${context.businessName}: REPROVADA pela Qualidade após ${revisions} revisão(ões) — ${parecer}. NÃO será apresentada ao cliente.`.slice(0, 900),
          },
        }).catch(() => { /* best-effort: o registro não pode derrubar a produção */ });
      } else if (ficouSemArbitro(audit.verdict)) {
        // NÃO bloqueia — a operação não pode parar porque um provedor caiu. Mas
        // fica declarado com todas as letras, para ser possível responder depois
        // "quantas peças foram ao cliente sem árbitro?".
        naoAuditados.push({ especialista: nome, deliverableId: entregavel.id, motivo: audit.motivo ?? "erro" });
        // `sem_arbitro` NÃO conta como aprovada na escada. Verde não é prova, e
        // "ninguém olhou" muito menos: um provedor fora do ar por uma semana
        // promoveria o departamento a wide sem uma única auditoria.
        await anotarNaEscada(dept.id, "sem_arbitro", audit.motivo ?? "erro", entregavel.id, result.provider);
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "qualidade_nao_auditou",
            message: `${nome} para ${context.businessName}: SEM AUDITORIA (${audit.motivo ?? "erro"}) — a peça segue para o cliente sem parecer da Qualidade. Isto NÃO é uma aprovação.`.slice(0, 900),
          },
        }).catch(() => { /* best-effort */ });
      } else {
        // Passou por TODOS os portões que hoje barram alguma coisa. É esta — e
        // só esta — que conta como evidência de subida.
        await anotarNaEscada(dept.id, "aprovada", "aprovada pela auditoria", entregavel.id, result.provider);
      }
      // A tarefa fecha ligada ao entregável que a cumpriu — no quadro dá para
      // clicar e ver o que foi feito, em vez de um "concluído" sem lastro.
      await marcarEntregue(projectId, esp.id, entregavel.id);

      // A aprovação é registrada, mas NÃO é mostrada ao cliente peça por peça:
      // quem apresenta é o gerente de projeto, de uma vez, quando tudo estiver
      // pronto. Cinco entregas pingando no portal é o que faz o cliente sentir
      // que a agência é desorganizada mesmo entregando bem.
      //
      // ── POR QUE ISTO TEM CATCH PRÓPRIO ────────────────────────────────────
      // Estava solto, depois do `create` do entregável. Se lançasse, o
      // `Deliverable` JÁ existia — então a retentativa pulava o especialista
      // (idempotência) e a aprovação daquele departamento NUNCA era criada. O
      // trabalho ficava pronto e sem porta de aprovação, para sempre. A falha
      // agora é uma pendência transitória: a peça já é do cliente, e a próxima
      // passada tenta de novo criar o que falta.
      try {
        await createApprovalRequest({ clientRequestId, department: dept.id, requestedBy: `Especialista de ${esp.label} (${dept.label})`, clientVisible: false });
      } catch (err) {
        skipped.push(`${nome} (entrega gravada, mas a aprovação do departamento não foi criada: ${err instanceof Error ? err.message : "erro"})`);
        await prisma.activityEvent.create({
          data: {
            workspaceId: project.workspaceId, projectId, clientId: project.clientId,
            type: "aprovacao_nao_criada",
            message: `${nome} para ${context.businessName}: a entrega foi gravada mas o pedido de aprovação do departamento ${dept.id} NÃO foi criado.`.slice(0, 900),
          },
        }).catch(() => { /* best-effort */ });
      }
      produced.push(nome);
      qualityAudit.push({ department: nome, verdict: audit.verdict, issues: audit.issues });
    }

    // ── A MARCA CRIADA VIRA A MARCA USADA ────────────────────────────────────
    // Sem isto, a agência definia a paleta do cliente num entregável e no mês
    // seguinte lia a marca, encontrava nulo, escrevia genérico e propunha uma
    // identidade DIFERENTE. Criava a marca e esquecia dela.
    // ── A BASE DE MARCA CRIADA VIRA A MARCA USADA ───────────────────────────
    // Antes da identidade visual, e a ordem importa: a base é a constituição
    // (quem a marca é, como fala, o que nunca diz) e a identidade é a cara. Se
    // a base chegar depois, o campo já foi preenchido pela cara e a
    // constituição não entra — os dois colhedores são conservadores e só
    // escrevem em coluna vazia.
    try {
      const { colherBaseDeMarca } = await import("@/lib/agency/execution/colher-marca");
      await colherBaseDeMarca(projectId, project.clientId);
    } catch { /* best-effort: colher a marca não pode derrubar a produção */ }

    let colheuIdentidade = false;
    try {
      const { colherIdentidadeDaEntrega } = await import("@/lib/agency/execution/colher-identidade");
      colheuIdentidade = (await colherIdentidadeDaEntrega(projectId, project.clientId)).encontrouEntrega;
    } catch { /* best-effort: colher a marca não pode derrubar a produção */ }

    // ── O LOGO EM ARQUIVO — E O CLIENTE ENCONTRANDO O LOGO ───────────────────
    // Só depois de colher: o kit usa a paleta e a tipografia que o especialista
    // definiu. Gerar antes produziria um logo preto e branco ignorando a marca
    // que a própria casa acabou de criar.
    //
    // ESTE BLOCO SAIU DO `try {} catch {}` DE PROPÓSITO. O serviço mais caro da
    // casa estava inteiro dentro de um best-effort, e `entregarKit` terminava em
    // `.catch(() => {})`: o cliente pagava, o logo era gerado, o arquivo ia para
    // o armazenamento — e o `Deliverable`, que é a ÚNICA coisa que o torna
    // visível no portal, falhava em silêncio. Ele nunca encontrava o que
    // comprou. Pior: `produzirKitDeMarca` é idempotente e devolve lista vazia
    // quando o logo já existe, então a retentativa não reentregava nada.
    //
    // Por isso a entrega é conferida SEPARADAMENTE da produção: "o arquivo já
    // existe" nunca quis dizer "o cliente já encontra o arquivo".
    if (context.criandoIdentidade) {
      const { produzirKitDeMarca } = await import("@/lib/agency/execution/logo");
      const kit = colheuIdentidade
        ? await produzirKitDeMarca(projectId, project.clientId, project.workspaceId).catch(() => ({ arquivos: [] as Array<{ id: string; nome: string; para: string }> }))
        : { arquivos: [] as Array<{ id: string; nome: string; para: string }> };
      const arquivos = kit.arquivos.length > 0 ? kit.arquivos : await arquivosDoKitJaGerados(project.clientId);
      if (arquivos.length > 0) {
        const entrega = await entregarKit(projectId, cicloId, context.businessName, project.clientId, arquivos);
        if (!entrega.ok) {
          // Pendência TRANSITÓRIA: os arquivos existem, falta a entrega que os
          // mostra. A próxima passada tenta de novo — e agora tem como.
          skipped.push(`Design · Kit de marca (arquivos prontos, entrega não registrada: ${entrega.erro})`);
          await prisma.activityEvent.create({
            data: {
              workspaceId: project.workspaceId, projectId, clientId: project.clientId,
              type: "kit_de_marca_invisivel",
              message: `${context.businessName}: o kit de marca foi produzido (${arquivos.length} arquivo(s)) mas NÃO virou entrega no portal — o cliente não encontra o que comprou. Motivo: ${entrega.erro}`.slice(0, 900),
            },
          }).catch(() => { /* best-effort */ });
        }
      }
    }

    // ── UMA VOZ: o PM junta tudo que travou e cobra numa mensagem só ─────────
    let pedidosCobrados = 0;
    if (askedClient.length > 0) {
      pedidosCobrados = await cobrarCliente({ projectId, clientRequestId, nomeDoNegocio: context.businessName });
    }

    // ── O ESTADO FINAL: TRÊS SAÍDAS, NÃO DUAS ───────────────────────────────
    //
    // `allHandled` responde "o pacote está inteiro?" e por isso só olha as
    // pendências TRANSITÓRIAS. Recusa (piso ou contrato) não é pendência que o
    // tempo resolve: a peça foi produzida e barrada.
    //
    //   • sem nada pendente               → "done";
    //   • pendência transitória           → "failed" (o cron retenta);
    //   • só recusas, duas passadas segui-
    //     das                             → "blocked" — o cron NÃO pega, e a
    //     escalação já está no `ActivityEvent`. Sem isto, o projeto queimava as
    //     cinco tentativas re-rolando o dado a 2 chamadas de IA por
    //     especialista por passada.
    const allHandled = skipped.length === 0 && recusados.length === 0;
    const soRecusas = skipped.length === 0 && recusados.length > 0;
    const recusouDeNovo = soRecusas && errosAnteriores.startsWith(MARCA_DE_RECUSA);
    const pendencias = [...skipped, ...recusados];
    const statusFinal = allHandled ? "done" : recusouDeNovo ? "blocked" : "failed";
    await prisma.project.update({
      where: { id: projectId },
      data: {
        executionStatus: statusFinal,
        executionFinishedAt: new Date(),
        executionError: allHandled
          ? null
          : `${soRecusas ? `${MARCA_DE_RECUSA} ` : ""}pendências: ${pendencias.join("; ")}`,
        // ── O CONTADOR É DE FALHAS SEGUIDAS, NÃO DE VIDA ────────────────────
        // `executionAttempts` só subia, nunca zerava numa passada bem-sucedida,
        // e o cron filtra `lt: 5`. O cliente vitalício gastava as cinco
        // tentativas nos dois primeiros meses e, do mês 3 em diante, QUALQUER
        // falha deixava de ser recuperável — para sempre, sem sinal nenhum.
        // Zerar no sucesso faz o número dizer o que o cron pergunta: "há quantas
        // passadas seguidas este projeto não consegue fechar?".
        ...(allHandled ? { executionAttempts: 0 } : {}),
      },
    });

    // ── O PM APRESENTA SOZINHO ────────────────────────────────────────────────
    // O elo que faltava. A produção terminava e o pacote ficava parado DENTRO da
    // agência esperando uma pessoa clicar "apresentar" — trabalho pronto, cliente
    // sem saber. Numa agência que roda sem gente olhando, isso é o mesmo que não
    // ter produzido.
    //
    // Só apresenta quando o pacote está INTEIRO: nada pulado por falha de IA e
    // nada travado esperando material do cliente. Apresentar metade é pior que
    // esperar — quebra a promessa de "eu te mostro tudo de uma vez".
    //
    // A própria `apresentar` recusa se a Qualidade deixou ressalva. Isso é
    // deliberado e é o freio que faltava: peça marcada como torta NÃO chega ao
    // cliente sozinha. Ela para aqui e vira um alerta para a equipe.
    //
    // O import é dinâmico de propósito: `marcos.ts` já importa este arquivo
    // (para disparar a produção quando a direção é aprovada). Um import estático
    // aqui fecharia o ciclo entre os dois módulos.
    // A condição é "o pacote está INTEIRO", não "algo foi produzido agora".
    // A diferença apareceu em produção: depois que o destravamento refez as
    // entregas reprovadas, a passada seguinte não produziu nada — todas já
    // existiam — e o pacote pronto não era apresentado. Exigir produção nova
    // fazia a apresentação depender de coincidência.
    const jaEntregues = produced.length > 0
      ? produced.length
      : await prisma.deliverable.count({ where: { projectId, cycleId: cicloId } });

    let apresentado: ApresentacaoAutomatica | undefined;
    if (allHandled && askedClient.length === 0 && jaEntregues > 0) {
      try {
        const { apresentar } = await import("@/lib/agency/esteira/marcos");
        // Dentro de um ciclo, quem apresenta é o ciclo: o carimbo do projeto já
        // foi usado no pacote inicial e recusaria a entrega de todo mês 2 em
        // diante com "já apresentado".
        const r = cicloId
          ? await (await import("@/lib/agency/esteira/mes")).apresentarCiclo(projectId, cicloId)
          : await apresentar(projectId);
        apresentado = { ok: r.ok, motivo: r.erro };
        if (!r.ok) {
          // Nenhum humano vai ler um retorno de função. O bloqueio precisa
          // existir no banco para aparecer no painel e no relatório do Diretor.
          await prisma.activityEvent.create({
            data: {
              workspaceId: project.workspaceId,
              projectId,
              clientId: project.clientId,
              type: "apresentacao_bloqueada",
              message: `O pacote de ${context.businessName} ficou pronto mas NÃO foi apresentado: ${r.erro ?? "motivo não informado"}`,
            },
          }).catch(() => { /* best-effort: o bloqueio não pode derrubar a produção */ });
        }
      } catch {
        apresentado = { ok: false, motivo: "falha ao apresentar" };
      }
    }

    return {
      ok: true, status: allHandled ? "done" : "failed", produced, askedClient,
      // O relatório continua vendo UMA lista de pendências — a separação é
      // interna, para decidir o que vale retentar.
      skipped: pendencias,
      qualityAudit,
      pedidosCobrados, apresentado, barradosNoPiso, reprovadosPelaQualidade, naoAuditados,
      pmPlan: { orderedDepartments: plan.orderedDepartments, goal: plan.goal, pmMode: plan.pmMode },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "erro na execução";
    await prisma.project.update({
      where: { id: projectId },
      data: { executionStatus: "failed", executionFinishedAt: new Date(), executionError: msg },
    }).catch(() => { /* best-effort */ });
    return { ok: false, status: "failed", produced: [], askedClient: [], skipped: [], error: msg };
  }
}

/**
 * Registra o kit de marca como ENTREGA, não como arquivo solto no storage.
 *
 * A diferença importa: arquivo no armazenamento é invisível para o cliente. O
 * que ele vê no portal são entregas — e um logo que ninguém encontra é o mesmo
 * que um logo que não existe.
 */
async function entregarKit(
  projectId: string,
  cycleId: string | null,
  negocio: string,
  clientId: string | null,
  arquivos: Array<{ id: string; nome: string; para: string }>,
): Promise<{ ok: boolean; erro?: string }> {
  // Idempotente por PROJETO: o kit é uma vez na vida do cliente, e a
  // retentativa não pode gerar um segundo "Kit de marca" no portal.
  const jaEntregue = await prisma.deliverable.findFirst({
    where: { projectId, ownerAgentId: "design-kit-de-marca" },
    select: { id: true },
  }).catch(() => null);
  if (jaEntregue) return { ok: true };

  const cliente = clientId
    ? await prisma.client.findUnique({ where: { id: clientId }, select: { brandBrain: true, industry: true } }).catch(() => null)
    : null;
  const b = cliente?.brandBrain;

  const { montarManual, corValida } = await import("@/lib/agency/execution/logo");
  const manual = montarManual({
    negocio,
    primaria: corValida(b?.primaryColor) ?? b?.primaryColor ?? "não definida",
    secundaria: corValida(b?.secondaryColor) ?? b?.secondaryColor ?? "não definida",
    tipografia: b?.typography ?? "não definida",
    tagline: b?.tagline ?? null,
    arquivos: arquivos.map((a) => ({ nome: a.nome, para: a.para })),
  });

  const corpo = [
    manual,
    "",
    "**5. Baixe seus arquivos**",
    ...arquivos.map((a, i) => `- Arquivo ${i + 1}: ${a.nome} — /api/media/${a.id}`),
  ].join("\n");

  try {
    await prisma.deliverable.create({
    data: {
      projectId, name: `Kit de marca — ${negocio}`, type: "brand-kit",
      status: "in_review", content: corpo, ownerAgentId: "design-kit-de-marca",
      cycleId,
      // O kit NÃO passa pelo auditor (é arquivo montado em código, não texto de
      // IA). Marcá-lo `quality_ok` era declarar uma aprovação que nunca houve —
      // o mesmo bug do fail-open, com outra roupa. `quality_nao_auditado` diz a
      // verdade e, como não bloqueia, o kit continua chegando ao cliente.
      // Sem julgamento nenhum, e é isso que fica escrito nos três campos:
      // `sem_arbitro`, sem provedor. Nulo aqui seria "não medido"; a verdade é
      // que foi medido e o resultado é "ninguém olhou".
      revisionStatus: revisionStatusDoVeredito("nao_auditado"),
      qualityArbiter: null,
      qualityArbitragem: "sem_arbitro",
    },
    });
    return { ok: true };
  } catch (err) {
    // O `.catch(() => {})` que estava aqui era o fail-open mais caro da casa: o
    // cliente pagava pela identidade visual, o logo ia para o armazenamento e a
    // entrega que o torna visível sumia sem barulho.
    return { ok: false, erro: err instanceof Error ? err.message.slice(0, 200) : "erro ao gravar a entrega do kit" };
  }
}

/**
 * Os arquivos de logo que JÁ existem para este cliente.
 *
 * Existe porque `produzirKitDeMarca` é idempotente: com o logo já no
 * armazenamento, ele devolve lista vazia — e a lista vazia fazia a entrega
 * nunca ser retentada. "O arquivo existe" e "o cliente encontra o arquivo" são
 * duas perguntas diferentes.
 */
async function arquivosDoKitJaGerados(
  clientId: string | null,
): Promise<Array<{ id: string; nome: string; para: string }>> {
  if (!clientId) return [];
  const assets = await prisma.mediaAsset.findMany({
    where: { clientId, kind: "deliverable", fileName: { startsWith: "logo-" } },
    select: { id: true, fileName: true },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  return assets.map((a) => ({
    id: a.id,
    nome: a.fileName,
    para: a.fileName.includes("-simbolo-")
      ? "o símbolo isolado — perfil, favicon, selo"
      : a.fileName.includes("-escuro-")
        ? "uso sobre fundo escuro — fachada, camiseta, story"
        : "uso sobre fundo claro — papel, cardápio, site",
  }));
}

/**
 * Os números do último ciclo FECHADO, em texto pronto para o prompt.
 *
 * Devolve string vazia quando não há ciclo anterior. Vazio é o sinal que faz o
 * especialista de otimização dizer "a otimização começa quando houver o
 * primeiro mês medido" em vez de inventar um desempenho que nunca existiu.
 */
async function resultadoDoCicloAnterior(projectId: string, cicloAtualId: string | null): Promise<string> {
  const anterior = await prisma.cycle.findFirst({
    where: { projectId, status: "fechado", ...(cicloAtualId ? { id: { not: cicloAtualId } } : {}) },
    orderBy: { reference: "desc" },
    select: { reference: true, resultsJson: true },
  }).catch(() => null);
  if (!anterior) return "";

  try {
    const r = JSON.parse(anterior.resultsJson) as Record<string, unknown>;
    const pago = r.pago as Record<string, number> | null;
    // ── RESÍDUO DE OUTRA BASE DE MEDIÇÃO ─────────────────────────────────────
    // `alcance` e `engajamento` mudaram de SIGNIFICADO em 04/08/2026 (mes.ts:
    // VERSAO_DA_MEDICAO). Na v1, `alcance` era o reach de UM DIA. Injetar
    // "- Alcance: 340" sob o rótulo "números reais, medidos — use SOMENTE
    // estes", com o prompt mandando citar o número, faria a peça de otimização
    // do mês 2 dizer ao cliente "no mês passado alcançamos 340 pessoas" — um
    // mês inteiro subestimado ~30x — e ancoraria TODAS as recomendações nisso.
    // Base velha: o número não entra, e a ausência é declarada (vazio é vazio).
    const versaoAnterior = versaoDaMedicao(r as unknown as MedicaoDoMes);
    const baseComparavel = versaoAnterior >= VERSAO_DA_MEDICAO;
    const tinhaNumerosDeBase = r.alcance != null || r.engajamento != null;
    const linhas = [
      `Competência: ${anterior.reference}`,
      `- Posts publicados: ${r.postsPublicados ?? 0}`,
      baseComparavel && r.alcance != null ? `- Alcance: ${r.alcance}` : null,
      r.seguidores != null ? `- Seguidores: ${r.seguidores}` : null,
      baseComparavel && r.engajamento != null ? `- Engajamento: ${r.engajamento}` : null,
      !baseComparavel && tinhaNumerosDeBase
        ? `- ATENÇÃO: alcance e engajamento do ciclo anterior foram OMITIDOS porque foram medidos noutra base (v${versaoAnterior}, hoje v${VERSAO_DA_MEDICAO}) e significam outra coisa. NÃO cite, NÃO compare e NÃO estime alcance ou engajamento do período anterior — diga que a comparação começa no primeiro mês medido na base atual.`
        : null,
      pago ? `- Anúncios: R$ ${pago.gastoBRL} investidos, ${pago.cliques} cliques, CPC R$ ${pago.cpcBRL ?? "não medido"}` : null,
      r.porQueNaoMediu ? `- ATENÇÃO: as métricas não foram medidas neste ciclo (${r.porQueNaoMediu})` : null,
    ].filter(Boolean);
    return linhas.join("\n");
  } catch {
    return "";
  }
}
