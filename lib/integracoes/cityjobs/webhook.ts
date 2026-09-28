// webhook.ts — O AVISO DE VOLTA AO CITY JOBS. SERVER-ONLY.
//
// Contrato §8: agendado, publicado (permalink, externalPostId), falhou
// (motivo), em_conferencia ("não reenviar"). Assinado com o MESMO esquema
// HMAC do §1 — mesmos cabeçalhos, mesma string assinada.
//
// ── POR QUE A ENTREGA É SEMPRE ASSÍNCRONA, NUNCA NO MESMO REQUEST ───────────
//
// `registrarEventoDeWebhook` só GRAVA a fila (`EventoDeWebhook`, `tentativas:
// 0`, `proximaTentativaEm: agora`) — nunca tenta enviar dentro do request que
// está processando o post do City Jobs. Enviar ali dependeria da rede do
// City Jobs para a Dioli terminar de responder ao próprio City Jobs, e uma
// origem lenta ou fora do ar viraria latência (ou timeout) no endpoint
// PRINCIPAL. Quem entrega de verdade é `reentregarWebhooksPendentes`, chamada
// pelo despertador (`lib/agency/despertador.ts`) a cada tique — o mesmo
// desenho de toda fila desta casa (RefacaoDaPeca, EntradaDeMaterial, etc.).
// Custo: a primeira tentativa pode esperar até um tique do despertador (hoje,
// no máximo `DESPERTADOR_INTERVALO_MS`) em vez de ser instantânea — aceito,
// porque o contrato pede "reentrega exponencial pelo despertador", não
// "entrega síncrona".
//
// Idempotência do lado do City Jobs (contrato §8): cada evento carrega
// `idEvento` único — aqui, o PRÓPRIO `id` da linha `EventoDeWebhook`.

import { prisma } from "@/lib/db/client";
import { cabecalhoDaAssinatura, segredosVigentes } from "@/lib/integracoes/cityjobs/assinatura";

/** 1 min, 5 min, 30 min, 2h, 12h — contrato §8 ("proposta da Dioli"). Índice
 *  = quantas tentativas JÁ foram feitas quando o backoff é consultado. */
export const BACKOFF_MS = [1, 5, 30, 120, 720].map((min) => min * 60_000);
export const MAX_TENTATIVAS_WEBHOOK = BACKOFF_MS.length;

/** Quantos eventos o despertador processa por tique — nunca uma enxurrada,
 *  mesma régua de `MAX_POR_RODADA` no resto da casa. */
export const MAX_WEBHOOKS_POR_RODADA = 10;

export type EventoDoWebhook = "agendado" | "publicado" | "falhou" | "em_conferencia";

export interface DadosDoEvento {
  idExterno: string;
  evento: EventoDoWebhook;
  ocorridoEm: Date;
  permalink?: string | null;
  externalPostId?: string | null;
  motivo?: string | null;
  /** Eco do que veio na criação — nunca alterado (contrato §8). */
  metadados?: unknown;
}

/** Quando a PRÓXIMA tentativa deve acontecer, dado quantas JÁ foram feitas.
 *  `null` = teto esgotado, desistiu — "fica registrada para consulta manual
 *  via GET /posts/{idExterno}" (contrato §8). Função PURA: testável sem
 *  banco nem relógio do sistema. */
export function proximaTentativaEm(tentativasJaFeitas: number, agora: Date): Date | null {
  if (tentativasJaFeitas < 0 || tentativasJaFeitas >= MAX_TENTATIVAS_WEBHOOK) return null;
  return new Date(agora.getTime() + BACKOFF_MS[tentativasJaFeitas]!);
}

function gerarIdDeEvento(): string {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** O corpo EXATO do evento (contrato §8) — montado UMA vez, na criação, e
 *  gravado; reentrega nunca remonta com dado que já mudou. */
export function montarCorpoDoEvento(idEvento: string, d: DadosDoEvento): Record<string, unknown> {
  return {
    idEvento,
    idExterno: d.idExterno,
    evento: d.evento,
    ocorridoEm: d.ocorridoEm.toISOString(),
    permalink: d.permalink ?? null,
    externalPostId: d.externalPostId ?? null,
    motivo: d.motivo ?? null,
    metadados: d.metadados ?? null,
  };
}

/**
 * ENFILEIRA o evento. Nunca lança — best-effort: um webhook que não pôde ser
 * gravado não pode derrubar o fluxo principal (a criação/atualização do
 * `PostExterno`, que já aconteceu antes desta chamada).
 */
export async function registrarEventoDeWebhook(
  postExternoId: string,
  dados: DadosDoEvento,
  agora: Date = new Date(),
): Promise<{ ok: boolean; idEvento?: string }> {
  const idEvento = gerarIdDeEvento();
  const corpo = montarCorpoDoEvento(idEvento, dados);
  try {
    await prisma.eventoDeWebhook.create({
      data: {
        id: idEvento,
        postExternoId,
        tipo: dados.evento,
        corpoJson: JSON.stringify(corpo),
        tentativas: 0,
        proximaTentativaEm: agora,
      },
    });
    return { ok: true, idEvento };
  } catch {
    return { ok: false };
  }
}

/** Nenhuma entrega de webhook pode travar o despertador indefinidamente — ele
 *  processa até `MAX_WEBHOOKS_POR_RODADA` eventos SEQUENCIALMENTE por tique
 *  (ver `reentregarWebhooksPendentes`), então uma origem que nunca responde
 *  paralisaria a fila inteira sem isto. */
const TIMEOUT_DO_WEBHOOK_MS = 15_000;

/** Envia UM corpo já montado, assinado, para `CITYJOBS_WEBHOOK_URL`. Nunca
 *  lança.
 *
 *  ⚠️ `redirect: "manual"` — mesma trava de SSRF do resto da casa
 *  (`lib/security/url-externa-segura.ts`, `midia.ts`, `acervo.ts`,
 *  `midia-de-story.ts`): a URL em si é só do AMBIENTE, nunca do corpo de uma
 *  requisição — mas o DESTINO de um redirect é decidido por quem responde
 *  NAQUELE momento, não por quem configurou `CITYJOBS_WEBHOOK_URL`. Sem esta
 *  trava, uma origem comprometida (ou sequestrada por DNS/hostname) poderia
 *  responder 3xx apontando para um endereço interno da própria rede da Dioli
 *  e o `fetch` seguiria automaticamente, entregando o corpo assinado (com
 *  dado real do cliente) para dentro da própria infraestrutura. Uma resposta
 *  3xx aqui é tratada como FALHA da entrega (cai no backoff normal), nunca
 *  como redirecionamento seguido. */
async function enviarAgora(
  url: string,
  corpoBruto: string,
  agora: Date,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const [segredo] = segredosVigentes();
  if (!segredo) return { ok: false, motivo: "CITYJOBS_HMAC_SEGREDO não configurado — não posso assinar o webhook" };

  const timestamp = String(Math.floor(agora.getTime() / 1000));
  const assinatura = cabecalhoDaAssinatura(timestamp, corpoBruto, segredo);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dioli-Timestamp": timestamp,
        "X-Dioli-Assinatura": assinatura,
      },
      body: corpoBruto,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_DO_WEBHOOK_MS),
    });
    if (!res.ok) {
      return { ok: false, motivo: `o City Jobs respondeu ${res.status} ao webhook` };
    }
    return { ok: true };
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError"
      ? `sem resposta em ${TIMEOUT_DO_WEBHOOK_MS / 1000}s — timeout`
      : e instanceof Error ? e.message : "erro de rede ao entregar o webhook";
    return { ok: false, motivo };
  }
}

export interface ResultadoDaReentrega {
  entregues: number;
  /** Merece ALARME: configuração ausente, ou desistência definitiva depois de
   *  esgotar as `MAX_TENTATIVAS_WEBHOOK`. */
  falhas: string[];
  /** Falhou mas AINDA tem nova tentativa agendada — não é alarme, é a fila
   *  fazendo o trabalho dela (mesma distinção de `adiados` em
   *  `esteira/publicacao.ts`: nada quebrou, ninguém precisa agir agora). */
  emReintento: string[];
  desistidos: number;
}

/**
 * REENTREGA EXPONENCIAL — chamada pelo despertador a cada tique.
 *
 * Sem `CITYJOBS_WEBHOOK_URL` configurada: "não envia e registra 1 vez"
 * (contrato §8) — aqui isso é ESTADO, não falha repetida: devolve o motivo
 * uma vez para quem chama decidir como anunciar (o despertador já tem a régua
 * de "só a MUDANÇA vira linha de log").
 */
export async function reentregarWebhooksPendentes(
  agora: Date = new Date(),
): Promise<ResultadoDaReentrega> {
  const saida: ResultadoDaReentrega = { entregues: 0, falhas: [], emReintento: [], desistidos: 0 };
  const url = (process.env.CITYJOBS_WEBHOOK_URL ?? "").trim();
  if (!url) {
    saida.falhas.push("CITYJOBS_WEBHOOK_URL não configurada — a fila de webhooks não é entregue");
    return saida;
  }

  const pendentes = await prisma.eventoDeWebhook.findMany({
    where: {
      entregueEm: null,
      tentativas: { lt: MAX_TENTATIVAS_WEBHOOK },
      OR: [{ proximaTentativaEm: null }, { proximaTentativaEm: { lte: agora } }],
    },
    orderBy: { criadoEm: "asc" },
    take: MAX_WEBHOOKS_POR_RODADA,
  });

  for (const evento of pendentes) {
    const resultado = await enviarAgora(url, evento.corpoJson, agora);
    if (resultado.ok) {
      await prisma.eventoDeWebhook
        .update({ where: { id: evento.id }, data: { entregueEm: agora, ultimoErro: null } })
        .catch(() => {});
      saida.entregues++;
      continue;
    }

    const tentativas = evento.tentativas + 1;
    const proxima = proximaTentativaEm(tentativas, agora);
    await prisma.eventoDeWebhook
      .update({
        where: { id: evento.id },
        data: { tentativas, proximaTentativaEm: proxima, ultimoErro: resultado.motivo },
      })
      .catch(() => {});
    if (proxima === null) {
      saida.desistidos++;
      saida.falhas.push(`evento ${evento.id} (post ${evento.postExternoId}) desistiu após ${tentativas} tentativas: ${resultado.motivo}`);
    } else {
      saida.emReintento.push(`evento ${evento.id}: ${resultado.motivo} — nova tentativa em ${proxima.toISOString()}`);
    }
  }

  return saida;
}
