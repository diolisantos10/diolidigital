// despertador.ts — O RELÓGIO DA AGÊNCIA. É o que a faz trabalhar às 3 da manhã.
//
// O problema que ele resolve: a esteira inteira estava construída e correta, mas
// só andava quando alguém cutucava. Cliente aprovava a direção no domingo à
// noite e a produção esperava segunda; uma falha momentânea da IA derrubava uma
// entrega e nada nunca re-tentava; o aviso de WhatsApp ficava na fila para
// sempre. Uma agência que só trabalha quando tem gente olhando não é automática.
//
// POR QUE DENTRO DO APP, e não um cron externo:
// Um agendador externo (Railway cron, GitHub Action, cron-job.org) é mais uma
// peça para configurar à mão, mais um segredo para vazar e mais um lugar onde
// "está no ar?" tem resposta diferente da do app. Aqui o relógio SOBE JUNTO com
// o deploy: se a agência está no ar, o relógio está rodando. Não há estado
// intermediário onde o sistema parece vivo e não é.
//
// O QUE O TORNA SEGURO RODAR SOZINHO:
//   • O motor de produção é idempotente — quem já entregou é pulado.
//   • Há trava anti-concorrência de 10 min no próprio projeto.
//   • Cada passada é limitada (MAX_POR_RODADA) — nunca vira enxurrada.
//   • Erro numa tarefa não derruba as outras nem o servidor.
//
// Desligar: DESPERTADOR=off nas variáveis de ambiente.

import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { dispatchWhatsAppNotifications } from "@/lib/integrations/meta/notifications";
import { destravarPacote, pacotesTravados } from "@/lib/agency/esteira/pacote-travado";
import { publicarAgendados } from "@/lib/agency/esteira/publicacao";
import { virarOsMesesVencidos } from "@/lib/agency/esteira/mes";
import { produzirArtesPendentes } from "@/lib/agency/execution/artes";
import { guardarAVerba } from "@/lib/agency/esteira/trafego";
import { cuidarDasAvaliacoes } from "@/lib/agency/esteira/avaliacoes";
import { cobrarPedidosEsquecidos } from "@/lib/agency/esteira/pedidos";
import { fazerBackup, estadoDoBackup } from "@/lib/agency/backup";
import { registrarBatida, type FalhaDaRodada } from "@/lib/agency/pulso";
import { vigiarAMadrugada } from "@/lib/agency/vigia-da-madrugada";

/** De quanto em quanto tempo a agência olha se tem trabalho parado. */
const INTERVALO_MS = Number(process.env.DESPERTADOR_INTERVALO_MS ?? 5 * 60_000);
/** Espera antes da primeira batida — deixa o servidor terminar de subir. */
const ATRASO_INICIAL_MS = 30_000;
/** Teto por rodada: recuperar 5 projetos de cada vez é recuperação; recuperar
 *  200 é uma enxurrada de chamadas de IA que ninguém pediu. */
const MAX_POR_RODADA = 5;
/** Depois de tantas tentativas, o projeto para de ser re-tentado sozinho — algo
 *  ali precisa de gente, e insistir para sempre só queima dinheiro de IA. */
const MAX_TENTATIVAS = 5;
/** "running" por mais que isto = o processo morreu no meio. */
const TRAVADO_MS = 10 * 60_000;

let ligado = false;

function log(msg: string): void {
  console.log(`[despertador] ${msg}`);
}

/**
 * Retoma a produção que parou sozinha:
 *   • travada em "running" há mais de 10 min (o processo caiu no meio);
 *   • "failed" com tentativas sobrando (falha momentânea de IA);
 *   • "pending" — a direção foi aprovada e o disparo não chegou a acontecer.
 */
async function retomarProducao(): Promise<number> {
  const travadoAntesDe = new Date(Date.now() - TRAVADO_MS);
  const candidatos = await prisma.project.findMany({
    where: {
      clientRequestId: { not: null },
      directionApprovedAt: { not: null },
      executionAttempts: { lt: MAX_TENTATIVAS },
      OR: [
        { executionStatus: "running", executionStartedAt: { lt: travadoAntesDe } },
        { executionStatus: "failed" },
        { executionStatus: "pending" },
      ],
    },
    orderBy: { executionRequestedAt: "asc" },
    take: MAX_POR_RODADA,
    select: { id: true },
  });

  let retomados = 0;
  for (const p of candidatos) {
    try {
      const r = await runProjectExecution(p.id);
      if (r.produced.length > 0 || r.status === "done") retomados++;
    } catch (err) {
      // Um projeto problemático não pode derrubar a rodada dos outros.
      log(`projeto ${p.id} falhou na retomada: ${err instanceof Error ? err.message : "erro"}`);
    }
  }
  return retomados;
}

/**
 * Destrava os pacotes que a própria Qualidade barrou.
 *
 * Sem isto o freio vira armadilha: a Qualidade reprova, o pacote não vai ao
 * cliente — correto — e ninguém nunca refaz a peça, porque o motor é
 * idempotente e pula quem já produziu. Foi o que aconteceu no primeiro projeto
 * real: 2 de 6 entregas reprovadas e o projeto parado, invisível.
 */
async function destravarPacotesBarrados(): Promise<number> {
  const travados = await pacotesTravados();
  let corrigidas = 0;
  // Poucos por rodada, e os mais antigos primeiro: refazer entrega é chamada de
  // IA cara, e um pacote travado não é urgência de segundos.
  for (const t of travados.filter((p) => !p.esperandoDecisao).slice(0, MAX_POR_RODADA)) {
    try {
      const r = await destravarPacote(t.projectId);
      corrigidas += r.corrigidas.length;
      // Voltou a ter peça boa? A produção é re-enfileirada para que o fluxo
      // normal (auditoria + apresentação automática) siga daqui.
      if (r.corrigidas.length > 0 && !r.escalado) {
        await prisma.project.update({
          where: { id: t.projectId },
          data: { executionStatus: "pending", executionRequestedAt: new Date(), executionAttempts: 0 },
        }).catch(() => { /* best-effort */ });
      }
    } catch (err) {
      log(`pacote ${t.projectId} falhou ao destravar: ${err instanceof Error ? err.message : "erro"}`);
    }
  }
  return corrigidas;
}

/**
 * A REDE DE SEGURANÇA DA PASSAGEM DO PEDIDO.
 *
 * A triagem e a produção rodam no ato do envio (`/api/portal/pedidos`), que é
 * onde o cliente sente a velocidade. Isto aqui existe para o que escapa: o
 * processo que morreu no meio, a IA que estava fora do ar naquele minuto, o
 * pedido criado por outro caminho. Sem esta varredura, um único erro de rede
 * recria exatamente o balde de onde a esteira acabou de sair.
 *
 * Três filas, todas com estado no BANCO e nenhuma dependendo de memória:
 *   • "novo"        — a triagem não chegou a acontecer;
 *   • "em_triagem"  — travado há mais de 10 min = processo morto;
 *   • "triado"      — classificado e não produzido (inclui o que ficou
 *                     esperando o aceite: quem não pode produzir devolve
 *                     "esperando", sem gastar IA).
 */
async function cuidarDosPedidos(): Promise<number> {
  const { triarPedido, TRAVA_MS } = await import("@/lib/agency/esteira/triagem");
  const { produzirPedido } = await import("@/lib/agency/esteira/producao-de-pedido");
  const travadoAntesDe = new Date(Date.now() - TRAVA_MS);
  let andaram = 0;

  const paraTriar = await prisma.contentRequest.findMany({
    where: { OR: [{ status: "novo" }, { status: "em_triagem", triagedAt: { lt: travadoAntesDe } }] },
    orderBy: { createdAt: "asc" },
    take: MAX_POR_RODADA,
    select: { id: true },
  });
  for (const p of paraTriar) {
    try {
      const r = await triarPedido(p.id);
      if (r.ok) {
        andaram++;
        // `r.triado` ausente = o pedido era uma OPERAÇÃO sobre trabalho já
        // existente (mudar data de calendário). Ela já se executou por inteiro
        // dentro da triagem: não há peça a produzir, e chamar o produtor aqui
        // criaria trabalho que ninguém pediu.
        if (r.triado?.podeProduzirAgora) await produzirPedido(p.id);
      } else if (r.parou) {
        // Parou com motivo é ANDAR: saiu do balde e virou decisão visível.
        andaram++;
        log(`pedido ${p.id} precisa de decisão: ${r.motivo}`);
      }
    } catch (err) {
      log(`pedido ${p.id} falhou na triagem: ${err instanceof Error ? err.message : "erro"}`);
    }
  }

  const { MAX_TENTATIVAS_DE_PRODUCAO } = await import("@/lib/agency/esteira/producao-de-pedido");
  const paraProduzir = await prisma.contentRequest.findMany({
    where: {
      deliverableId: null,
      // Depois do teto, o pedido já virou `precisa_decisao` — insistir aqui só
      // queimaria IA para chegar sempre ao mesmo lugar.
      productionAttempts: { lt: MAX_TENTATIVAS_DE_PRODUCAO },
      OR: [{ status: "triado" }, { status: "em_producao", updatedAt: { lt: travadoAntesDe } }],
    },
    orderBy: { createdAt: "asc" },
    take: MAX_POR_RODADA,
    select: { id: true },
  });
  for (const p of paraProduzir) {
    try {
      const r = await produzirPedido(p.id);
      if (r.ok) andaram++;
    } catch (err) {
      log(`pedido ${p.id} falhou na produção: ${err instanceof Error ? err.message : "erro"}`);
    }
  }

  return andaram;
}

/** Uma batida do relógio. Nunca lança — o relógio não pode morrer. */
export async function baterORelogio(): Promise<{
  retomados: number;
  avisos: number;
  destravadas: number;
  publicados: number;
  mesesVirados: number;
  artes: number;
  campanhasFreadas: number;
  avaliacoes: number;
  /** Pedidos do cliente que saíram do lugar nesta rodada. */
  pedidos: number;
  /** Pedidos de MATERIAL que estavam presos e finalmente foram ao cliente. */
  cobrancasEsquecidas: number;
  /** Oportunidades NOVAS que entraram pela caixa de e-mail da agência. */
  oportunidadesDaCaixa: number;
  backup: boolean;
}> {
  let retomados = 0;
  let pedidos = 0;
  let avisos = 0;
  let destravadas = 0;
  let publicados = 0;
  let mesesVirados = 0;
  let artes = 0;
  let campanhasFreadas = 0;
  let avaliacoes = 0;
  let cobrancasEsquecidas = 0;
  let oportunidadesDaCaixa = 0;
  let backup = false;

  // ── A TESTEMUNHA DA RODADA (06/08/2026) ───────────────────────────────────
  // Cada perna abaixo engole o próprio erro para não derrubar as outras — isso
  // é certo, e era também o motivo de a madrugada quebrar sem ninguém saber:
  // `console.log` no container é rotativo, some no deploy seguinte e ninguém o
  // lê às 7 da manhã. Agora todo erro engolido também é ANOTADO, e a anotação
  // sai em `/api/health` → `relogio.falhas`.
  const comeco = Date.now();
  const falhas: FalhaDaRodada[] = [];
  const quebrou = (perna: string, err: unknown): void => {
    const erro = err instanceof Error ? err.message : String(err ?? "erro");
    falhas.push({ perna, erro });
    log(`${perna} falhou: ${erro}`);
  };

  // A virada vem ANTES da retomada de propósito: ela é quem abre o mês novo e
  // marca o projeto como "pending". Assim o mês nasce e já é produzido na mesma
  // rodada, em vez de esperar mais cinco minutos.
  try {
    const viradas = await virarOsMesesVencidos();
    mesesVirados = viradas.length;
    for (const v of viradas) {
      log(`${v.projectId}: ciclo ${v.referenciaFechada} fechado${v.relatorioEntregue ? " com relatório" : " SEM relatório"}${v.proximaReferencia ? ` → ${v.proximaReferencia}` : ""}`);
    }
  } catch (err) {
    quebrou("virada-do-mes", err);
  }

  // O PEDIDO DO CLIENTE VEM CEDO NA RODADA. É o balde mais perto do dinheiro —
  // e foi o único que ninguém media até 06/08/2026.
  try {
    pedidos = await cuidarDosPedidos();
  } catch (err) {
    quebrou("pedidos-do-cliente", err);
  }

  try {
    retomados = await retomarProducao();
  } catch (err) {
    quebrou("retomada-de-producao", err);
  }

  try {
    destravadas = await destravarPacotesBarrados();
  } catch (err) {
    quebrou("destravamento-de-pacote", err);
  }

  // A arte vem ANTES da publicação, e por um motivo prático: o Instagram exige
  // mídia em todo formato. Post sem imagem não vai ao ar — produzir depois
  // significaria perder a data agendada e só publicar na rodada seguinte.
  try {
    const r = await produzirArtesPendentes();
    artes = r.produzidas;
    for (const f of r.falhas) quebrou("arte", f.erro);
    // A rodada que nem começou é NOTÍCIA, nunca silêncio. Sem esta linha, a
    // casa sem Chromium produziria zero peça por dia e o pulso registraria
    // "0 falhas" — que é exatamente como o molde ficou desligado em produção
    // por dias sem ninguém saber, com a única testemunha dentro do `lastError`
    // de cada post. Fila parada conta como entrega não feita.
    if (r.semRenderizador) quebrou("arte", r.semRenderizador);
  } catch (err) {
    quebrou("arte", err);
  }

  // O que o cliente aprovou e chegou a hora vai ao ar. É a última perna da
  // esteira: sem ela a agência produz, apresenta e nunca publica.
  try {
    const r = await publicarAgendados();
    publicados = r.publicados;
    for (const f of r.falhas) quebrou("publicacao", f.erro);
  } catch (err) {
    quebrou("publicacao", err);
  }

  // O GUARDIÃO DE VERBA. Freia sozinho a campanha que gasta sem entregar —
  // antes de a fatura contar a história. É o que separa gestão de tráfego de
  // "criei e esqueci".
  try {
    const r = await guardarAVerba();
    campanhasFreadas = r.pausadas.length;
    for (const p of r.pausadas) log(`campanha ${p.campanhaId} freada: ${p.motivo}`);
  } catch (err) {
    quebrou("guardiao-de-verba", err);
  }

  // As avaliações do Google. Responder em 24h vale muito mais que responder
  // bonito em duas semanas — e é o serviço de maior retorno para negócio local.
  try {
    const r = await cuidarDasAvaliacoes();
    avaliacoes = r.respondidas + r.escaladas;
    if (r.escaladas > 0) log(`${r.escaladas} avaliação(ões) negativa(s) esperando decisão`);
    for (const f of r.falhas) quebrou("avaliacoes", f);
  } catch (err) {
    quebrou("avaliacoes", err);
  }

  // ── A PERGUNTA QUE NUNCA CHEGOU AO CLIENTE ────────────────────────────────
  // Medido na produção em 08/08/2026: um pedido de material aberto há mais de
  // um dia com `askedClientAt` vazio. O agente travou esperando algo que o
  // cliente NUNCA foi perguntado — e não existia caminho no repositório capaz
  // de perguntar depois (o único chamador de `cobrarCliente` só dispara na
  // mesma passada que abre o pedido). Do lado de fora, a agência parecia ter
  // parado. Fila morta conta como entrega não feita.
  try {
    const r = await cobrarPedidosEsquecidos();
    cobrancasEsquecidas = r.pedidosCobrados;
    if (r.pedidosCobrados > 0) {
      log(`${r.pedidosCobrados} pedido(s) de material presos há +24h foram finalmente ao cliente`);
    }
    // Pedido vencido que continua sem destino é notícia: ele seguirá preso e o
    // raio-x seguirá acusando. Silenciar aqui recriaria o buraco original.
    for (const s of r.semDestino) quebrou("cobranca-esquecida", `${s.projectId}: ${s.motivo}`);
  } catch (err) {
    quebrou("cobranca-esquecida", err);
  }

  // ── A CAIXA DE ENTRADA DA AGÊNCIA ─────────────────────────────────────────
  // A terceira porta do Radar: em vez de esperar alguém colar o projeto ou
  // configurar um encaminhador, a casa LÊ a caixa da agência e ingere sozinha.
  // Só leitura — não apaga, não move, não responde. Passa pela MESMA função de
  // qualificação da porta de colar, então a oportunidade nasce com nota.
  //
  // Sem credencial ela não roda e NÃO é falha: é porta fechada, e o motivo
  // aparece na tela de configuração. O que vira falha da rodada é a caixa
  // configurada que não abriu — essa é notícia, e silenciá-la deixaria a porta
  // parecendo ligada por semanas sem ter lido um e-mail.
  try {
    const { varrerTodasAsCaixas } = await import("@/lib/agency/comercial/caixa-de-entrada/varredura");
    const { resultados, impedidos } = await varrerTodasAsCaixas();
    for (const r of resultados) {
      if (r.rodou) {
        oportunidadesDaCaixa += r.novas;
        if (r.novas > 0) log(`caixa de ${r.workspaceId}: ${r.novas} oportunidade(s) nova(s) — ${r.motivo}`);
        if (r.falhas > 0) quebrou("caixa-de-entrada", `${r.workspaceId}: ${r.falhas} mensagem(ns) falharam`);
      } else {
        quebrou("caixa-de-entrada", `${r.workspaceId}: ${r.motivo}`);
      }
    }
    // Credencial de ambiente sem alvo resolvido: configurada e lendo NADA.
    for (const i of impedidos) quebrou("caixa-de-entrada", i);
  } catch (err) {
    quebrou("caixa-de-entrada", err);
  }

  // ── O BACKUP ──────────────────────────────────────────────────────────────
  // Uma vez por dia. Não é o relógio que decide a frequência: ele bate a cada
  // 5 min, e é o estado no disco que diz se já passou 24h. Assim um restart do
  // servidor não dispara backup a mais, e um servidor parado por horas faz o
  // backup atrasado assim que volta.
  try {
    const e = await estadoDoBackup();
    if (e.horasDesdeOUltimo === null || e.horasDesdeOUltimo >= 24) {
      const r = await fazerBackup();
      backup = r.ok;
      if (r.ok) log(`backup ok — ${Math.round((r.bytes ?? 0) / 1024)} KB, ${JSON.stringify(r.conferencia)}`);
      // Backup que falha em silêncio é pior que backup nenhum: dá a sensação
      // de estar protegido.
      else quebrou("backup", r.erro ?? "motivo não informado");
    }
  } catch (err) {
    quebrou("backup", err);
  }

  try {
    const r = await dispatchWhatsAppNotifications();
    avisos = typeof r?.sent === "number" ? r.sent : 0;
  } catch (err) {
    quebrou("avisos", err);
  }

  // ── O VIGIA DA MADRUGADA ──────────────────────────────────────────────────
  // Vem por ÚLTIMO de propósito: ele conta a noite, e a noite inclui esta
  // rodada. Roda uma vez por dia, às 03h de São Paulo, e é ele que transforma
  // "quebrou de madrugada" em linha no painel que o CEO abre de manhã. Mora
  // aqui, e não no GitHub Actions, porque o Actions estava em pane declarada na
  // noite em que isto foi escrito — alarme que depende do provedor caído é
  // alarme que falta justamente no dia em que faria falta.
  try {
    await vigiarAMadrugada(falhas);
  } catch (err) {
    quebrou("vigia-da-madrugada", err);
  }

  if (retomados > 0 || avisos > 0 || destravadas > 0 || publicados > 0 || mesesVirados > 0 || artes > 0 || campanhasFreadas > 0 || avaliacoes > 0 || pedidos > 0 || cobrancasEsquecidas > 0 || oportunidadesDaCaixa > 0) {
    log(`rodada: ${pedidos} pedido(s) do cliente movido(s), ${mesesVirados} mês(es) virado(s), ${retomados} produção(ões) retomada(s), ${destravadas} entrega(s) refeita(s), ${artes} arte(s) produzida(s), ${publicados} post(s) publicado(s), ${campanhasFreadas} campanha(s) freada(s), ${avaliacoes} avaliação(ões) tratada(s), ${cobrancasEsquecidas} cobrança(s) esquecida(s) enviada(s), ${oportunidadesDaCaixa} oportunidade(s) lida(s) da caixa, ${avisos} aviso(s) enviado(s)`);
  }

  // A BATIDA É GRAVADA SEMPRE — inclusive (e principalmente) a rodada em que
  // nada aconteceu. É a rodada silenciosa que prova que o relógio está vivo, e
  // era exatamente ela que não deixava rastro nenhum.
  await registrarBatida({
    em: new Date().toISOString(),
    ms: Date.now() - comeco,
    moveu: { pedidos, mesesVirados, retomados, destravadas, artes, publicados, campanhasFreadas, avaliacoes, cobrancasEsquecidas, oportunidadesDaCaixa, avisos },
    falhas,
  });

  return { retomados, avisos, destravadas, publicados, mesesVirados, artes, campanhasFreadas, avaliacoes, pedidos, cobrancasEsquecidas, oportunidadesDaCaixa, backup };
}

/**
 * Liga o relógio. Chamado uma vez por instância do servidor, pelo
 * `instrumentation.ts`. Chamar duas vezes é inofensivo — o segundo é ignorado.
 */
export function ligarDespertador(): void {
  if (ligado) return;
  if ((process.env.DESPERTADOR ?? "").trim().toLowerCase() === "off") {
    log("desligado por DESPERTADOR=off");
    return;
  }
  ligado = true;

  const minutos = Math.round(INTERVALO_MS / 60_000);
  log(`ligado — a agência vai olhar se há trabalho parado a cada ${minutos} min`);

  const tick = () => { void baterORelogio(); };
  setTimeout(() => {
    tick();
    const t = setInterval(tick, INTERVALO_MS);
    // Não segura o processo vivo só por causa do relógio: se o servidor está
    // encerrando, ele encerra.
    if (typeof t.unref === "function") t.unref();
  }, ATRASO_INICIAL_MS).unref?.();
}
