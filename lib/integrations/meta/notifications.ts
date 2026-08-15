// Consumes ActivityEvent(type="whatsapp_notify") and sends the client a
// WhatsApp when their proposal is ready. SERVER-ONLY.
//
// Idempotent: every event handled is recorded in WhatsAppOutbox (unique on
// activityEventId), so re-runs never double-send. Called by the cron endpoint
// app/api/meta/dispatch/route.ts and by the house clock (`despertador.ts`).
//
// ─── 15/08/2026 — O FREIO, E OS DOIS DEFEITOS QUE ELE DESTAPOU ──────────────
//
// 1. **O FREIO (`WHATSAPP_SAIDA`), FECHADO POR PADRÃO.** Esta é uma das duas
//    pernas que disparam para cliente real na mesma batida do relógio (a outra é
//    `esteira/fila-que-se-cobra.ts`): 50 aqui + 50 lá = 100 mensagens no mesmo
//    minuto depois de dias de silêncio. O parecer do especialista `meta` deu
//    **NÃO PODE** para o disparo como ele está — a política exige opt-in
//    explícito e esta casa não tem onde registrá-lo. Ver o cabeçalho de
//    `lib/agency/freios-de-saida.ts`.
//
//    Fechado NÃO consome: nada é enviado, nada é marcado, nada é escrito. O que
//    o freio produz é uma CONTAGEM, que sobe ao pulso.
//
// 2. 🔴 **A FILA REPRESADA NUNCA DRENAVA.** A varredura era
//    `orderBy: { timestamp: "desc" }, take: 50` **sem excluir o que já está no
//    outbox**. Depois da primeira rodada, as 50 mais NOVAS já estão no outbox e
//    são puladas uma a uma — e as mais antigas nunca entram na janela dos 50.
//    Backlog acima de 50 ficava preso PARA SEMPRE, em silêncio, com a rodada
//    reportando "0 enviados" e nenhum erro. (É o mesmo defeito do `slice` das
//    avaliações, com outra roupa.) Agora a fila é varrida do MAIS ANTIGO para o
//    mais novo, em páginas, excluindo o que o outbox já tratou.
//
// 3. 🔴 **NÃO HAVIA CORTE DE IDADE.** Um evento de dias atrás disparava hoje um
//    "sua proposta já está pronta" como se fosse de agora — e depois de uma
//    parada longa isso vira uma enxurrada de mensagens fora de contexto para
//    gente de verdade. Agora o que passou do corte NÃO é enviado; é carimbado
//    `expirado` no outbox **com o motivo escrito** e contado na volta. Não é
//    descarte silencioso: o aviso continua na fila de gente, e quem quiser
//    mandar manda à mão, sabendo que está mandando algo velho.

import { prisma } from "@/lib/db/client";
import { sendWhatsAppMessage, sendWhatsAppDirect } from "./client";
import { resolveWhatsAppEnv } from "./config";
import { PROPOSAL_SENT_TEMPLATE } from "./templates";
import { whatsappLiberado, freioDoWhatsapp, type FreioPuxado } from "@/lib/agency/freios-de-saida";

/** Depois de quanto tempo um aviso deixa de poder sair sozinho.
 *
 *  48 h: mais que isso e a frase deixa de ser verdade ("sua proposta JÁ está
 *  pronta" mandado três dias depois é a agência avisando que esqueceu). O
 *  número é constante exportada porque é o teste que afirma sobre ele. */
export const IDADE_MAXIMA_DO_AVISO_MS = 48 * 3_600_000;

/** Tamanho da página da varredura da fila. */
const PAGINA = 200;
/** Teto de páginas por rodada. Bounded work: 2.000 eventos por batida é muito
 *  mais do que esta casa produz num dia, e o teto impede que uma tabela grande
 *  transforme a batida do relógio numa varredura de tabela inteira. */
const MAX_PAGINAS = 10;
/** Teto de carimbos de expiração por rodada. Expirar é barato (não sai da
 *  máquina), mas 5.000 inserts numa batida ainda são 5.000 inserts. */
const MAX_EXPIRADOS_POR_RODADA = 200;

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://dioli-agency-os-1-production.up.railway.app";

interface NotifyPayload {
  kind?: string;
  businessName?: string;
  portalPath?: string;
  clientRequestId?: string; // preferred — makes the phone lookup deterministic
  phone?: string;           // optional — if the producer includes it directly
  name?: string;
}

// WhatsApp expects digits only, with country code, no "+"/spaces/dashes.
// Assumes Brazilian numbers when no country code is present.
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11 && !d.startsWith("55")) d = `55${d}`; // add BR country code
  return d.length >= 10 ? d : null;
}

// Resolve { phone, name } for an event, preferring clientRequestId, then the
// event's clientId, then a businessName match.
async function resolveRecipient(
  workspaceId: string,
  eventClientId: string | null,
  payload: NotifyPayload,
): Promise<{ phone: string; name: string } | null> {
  // 0. Producer supplied the phone directly.
  if (payload.phone) {
    const p = normalizePhone(payload.phone);
    if (p) return { phone: p, name: payload.name || payload.businessName || "" };
  }

  // 1. Deterministic: clientRequestId → briefingJson.prospectPhone.
  let req = payload.clientRequestId
    ? await prisma.clientRequestDb.findUnique({ where: { id: payload.clientRequestId } })
    : null;

  // 1b. Deterministic without a producer change: the portalPath carries the
  //     PortalAccess token (/portal/access/<token>), and that row links to the
  //     clientRequestId. This is how the current producer's events resolve.
  if (!req && payload.portalPath) {
    const token = payload.portalPath.split("/").filter(Boolean).pop();
    if (token) {
      const access = await prisma.portalAccess.findFirst({ where: { token } });
      if (access?.clientRequestId) {
        req = await prisma.clientRequestDb.findUnique({ where: { id: access.clientRequestId } });
      }
    }
  }

  // 2. Fallback: match by clientId, then by businessName (least reliable).
  if (!req && eventClientId) {
    req = await prisma.clientRequestDb.findFirst({
      where: { workspaceId, clientId: eventClientId },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!req && payload.businessName) {
    req = await prisma.clientRequestDb.findFirst({
      where: { workspaceId, businessName: payload.businessName },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!req?.briefingJson) return null;

  let briefing: Record<string, unknown> = {};
  try { briefing = JSON.parse(req.briefingJson) as Record<string, unknown>; } catch { return null; }

  const rawPhone =
    (briefing.prospectPhone as string) ||
    (briefing.phone as string) ||
    (briefing.whatsapp as string) ||
    "";
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!phone) return null;

  const name =
    (briefing.prospectName as string) ||
    (briefing.businessName as string) ||
    req.businessName ||
    "";
  return { phone, name };
}

export interface DispatchResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Ficaram na fila porque o freio está fechado. NÃO foram consumidos: nada
   *  gravado, nada marcado, e eles saem quando a torneira abrir. */
  retidos: number;
  /** Passaram do corte de idade: carimbados `expirado` no outbox, com motivo,
   *  e NÃO enviados. */
  expirados: number;
  /** O freio que segurou esta rodada, ou `null` quando ele está solto. */
  freio: FreioPuxado | null;
  /** A varredura bateu no teto de páginas e há fila além do que ela enxergou.
   *  Notícia, nunca silêncio — foi o silêncio que prendeu a fila por semanas. */
  filaAlemDoTeto: boolean;
  details: Array<{ eventId: string; status: string; reason?: string }>;
}

/** Quantos avisos estão esperando, sem tocar em nada.
 *
 *  Duas contagens em vez de varredura: todo evento tratado ganha EXATAMENTE uma
 *  linha no outbox (a chave é única), então a diferença é a fila. É exato e é
 *  barato — e é o que o freio precisa para dizer quanto está segurando sem
 *  consumir uma linha sequer. */
async function quantosEsperam(workspaceId?: string): Promise<number> {
  const escopo = workspaceId ? { workspaceId } : {};
  const [eventos, tratados] = await Promise.all([
    prisma.activityEvent.count({ where: { type: "whatsapp_notify", ...escopo } }).catch(() => 0),
    prisma.whatsAppOutbox.count({ where: escopo }).catch(() => 0),
  ]);
  return Math.max(0, eventos - tratados);
}

/**
 * A fila de verdade: os eventos que o outbox AINDA NÃO tratou, do mais antigo
 * para o mais novo.
 *
 * Varre em páginas e exclui os tratados página a página. É isto que conserta o
 * represamento: `desc take 50` olhava sempre a mesma janela das 50 mais novas,
 * e quem estava embaixo nunca subia.
 */
async function filaPendente(
  workspaceId: string | undefined,
  precisamos: number,
): Promise<{ pendentes: Array<{ id: string; workspaceId: string; clientId: string | null; message: string; timestamp: Date }>; alemDoTeto: boolean }> {
  const pendentes: Array<{ id: string; workspaceId: string; clientId: string | null; message: string; timestamp: Date }> = [];
  let cursor: string | undefined;

  for (let p = 0; p < MAX_PAGINAS; p++) {
    const pagina = await prisma.activityEvent.findMany({
      where: { type: "whatsapp_notify", ...(workspaceId ? { workspaceId } : {}) },
      // O MAIS ANTIGO PRIMEIRO. Fila é fila: quem esperou mais sai antes, e é
      // isso que faz o represamento drenar em vez de crescer por baixo.
      orderBy: { timestamp: "asc" },
      take: PAGINA,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, workspaceId: true, clientId: true, message: true, timestamp: true },
    }).catch(() => []);
    if (pagina.length === 0) return { pendentes, alemDoTeto: false };

    const tratados = await prisma.whatsAppOutbox.findMany({
      where: { activityEventId: { in: pagina.map((e) => e.id) } },
      select: { activityEventId: true },
    }).catch(() => []);
    const jaTratado = new Set(tratados.map((t) => t.activityEventId));
    for (const e of pagina) if (!jaTratado.has(e.id)) pendentes.push(e);

    cursor = pagina[pagina.length - 1]!.id;
    // Fim da tabela: não há mais nada atrás.
    if (pagina.length < PAGINA) return { pendentes, alemDoTeto: false };
    // Já há trabalho suficiente para esta rodada. Pode haver mais fila, e isso
    // não é notícia ruim: a próxima batida continua de onde esta parou.
    if (pendentes.length >= precisamos) return { pendentes, alemDoTeto: false };
  }
  // Bateu no teto de páginas AINDA procurando. Isso é notícia.
  return { pendentes, alemDoTeto: true };
}

export async function dispatchWhatsAppNotifications(
  workspaceId?: string,
  { limit = 50, agora = new Date() }: { limit?: number; agora?: Date } = {},
): Promise<DispatchResult> {
  const result: DispatchResult = {
    scanned: 0, sent: 0, failed: 0, skipped: 0,
    retidos: 0, expirados: 0, freio: null, filaAlemDoTeto: false, details: [],
  };

  // ── O FREIO, ANTES DE TUDO ────────────────────────────────────────────────
  // Primeira coisa da função, não do chamador: os dois chamadores vivos (o
  // relógio e `POST /api/meta/dispatch`) passam por aqui, e o terceiro, escrito
  // amanhã por alguém que nunca leu este arquivo, também vai passar.
  //
  // Fechado NÃO consome: só conta. Nenhuma linha de outbox, nenhum envio,
  // nenhum evento marcado — a fila fica exatamente como estava.
  if (!whatsappLiberado()) {
    result.retidos = await quantosEsperam(workspaceId);
    result.freio = freioDoWhatsapp(result.retidos);
    return result;
  }

  const { pendentes, alemDoTeto } = await filaPendente(workspaceId, limit);
  result.filaAlemDoTeto = alemDoTeto;

  const corte = agora.getTime() - IDADE_MAXIMA_DO_AVISO_MS;

  for (const ev of pendentes) {
    if (result.sent + result.failed + result.skipped >= limit) break;
    result.scanned++;

    let payload: NotifyPayload = {};
    try { payload = JSON.parse(ev.message) as NotifyPayload; } catch { /* keep empty */ }

    const record = async (status: string, extra: { toPhone?: string; externalMessageId?: string; error?: string }) => {
      await prisma.whatsAppOutbox.create({
        data: {
          workspaceId: ev.workspaceId,
          activityEventId: ev.id,
          kind: payload.kind ?? "proposal_sent",
          toPhone: extra.toPhone ?? null,
          status,
          externalMessageId: extra.externalMessageId ?? null,
          error: extra.error ?? null,
        },
      });
    };

    // ── O CORTE DE IDADE ────────────────────────────────────────────────────
    // Antes de qualquer coisa que custe: aviso velho não vira mensagem. Sai da
    // fila carimbado, com o motivo por escrito — nunca em silêncio, porque
    // "não mandei" e "mandei e falhou" são fatos opostos para quem for
    // investigar depois.
    if (ev.timestamp.getTime() < corte) {
      if (result.expirados >= MAX_EXPIRADOS_POR_RODADA) break;
      const dias = Math.floor((agora.getTime() - ev.timestamp.getTime()) / 86_400_000);
      result.expirados++;
      result.details.push({ eventId: ev.id, status: "expirado", reason: `parado há ${dias} dia(s)` });
      await record("expirado", {
        error:
          `NÃO enviado: este aviso é de ${dias} dia(s) atrás e passou do corte de ` +
          `${Math.round(IDADE_MAXIMA_DO_AVISO_MS / 3_600_000)}h. Mandar agora seria avisar ` +
          "o cliente de algo que ele já devia ter recebido, como se fosse novidade. " +
          "Se ainda faz sentido, alguém manda à mão — sabendo que está mandando algo velho.",
      }).catch(() => { /* best-effort: carimbar não pode derrubar a rodada */ });
      continue;
    }

    // Need a WhatsApp sender: a stored connection (wins) or env-var creds.
    const waConn = await prisma.metaConnection.findFirst({
      where: { workspaceId: ev.workspaceId, platform: "whatsapp", status: "connected" },
    });
    const waEnv = waConn ? null : resolveWhatsAppEnv();
    if (!waConn && !waEnv) {
      result.skipped++;
      result.details.push({ eventId: ev.id, status: "skipped", reason: "no_whatsapp_connection" });
      await record("skipped", { error: "no_whatsapp_connection" });
      continue;
    }

    const recipient = await resolveRecipient(ev.workspaceId, ev.clientId, payload);
    if (!recipient) {
      result.skipped++;
      result.details.push({ eventId: ev.id, status: "skipped", reason: "no_phone" });
      await record("skipped", { error: "no_phone" });
      continue;
    }

    const link = payload.portalPath
      ? `${BASE_URL}${payload.portalPath.startsWith("/") ? "" : "/"}${payload.portalPath}`
      : BASE_URL;

    // Send via the approved template (business-initiated, outside 24h window).
    const messageInput = {
      connectionId: waConn?.id ?? "",
      to: recipient.phone,
      templateName: PROPOSAL_SENT_TEMPLATE.name,
      templateLanguage: PROPOSAL_SENT_TEMPLATE.language,
      templateComponents: [
        {
          type: "body",
          parameters: [
            { type: "text", text: recipient.name || "tudo bem?" },
            { type: "text", text: link },
          ],
        },
      ],
    };
    const send = waConn
      ? await sendWhatsAppMessage(ev.workspaceId, messageInput)
      : await sendWhatsAppDirect(waEnv!.phoneNumberId, waEnv!.token, messageInput);

    if (send.ok) {
      result.sent++;
      result.details.push({ eventId: ev.id, status: "sent" });
      await record("sent", { toPhone: recipient.phone, externalMessageId: send.externalPostId });
    } else {
      result.failed++;
      result.details.push({ eventId: ev.id, status: "failed", reason: send.error });
      await record("failed", { toPhone: recipient.phone, error: send.error });
    }
  }

  return result;
}
