// O FREIO DA SAÍDA DE WHATSAPP — as duas metades, nas DUAS pernas.
//
// ── O que este arquivo prende ───────────────────────────────────────────────
//
// Hoje religar o relógio da agência é uma decisão cara porque é tudo-ou-nada: a
// mesma batida que retoma produção também dispara WhatsApp para cliente real,
// por DUAS pernas independentes que somam 100 mensagens no mesmo minuto depois
// de dias de silêncio (`notifications.ts`, 50, + `fila-que-se-cobra.ts`, 50).
//
// O freio é `WHATSAPP_SAIDA`, FECHADO por padrão, e o parecer do especialista
// `meta` diz o que ele é de verdade: não é cautela, é cumprimento de política.
// A Meta exige opt-in explícito de quem recebe, e esta casa **não tem onde
// registrar opt-in** — sem coluna não há prova, sem prova não há autorização.
// (A própria casa já escreve isso em `esteira/recompra.ts`, e mesmo assim
// disparava 100 pela porta do lado.)
//
//   ⛔ METADE 1 — fechado SEGURA, e segura sem CONSUMIR: nada enviado, nada
//      gravado, nada marcado, nenhuma tentativa gasta. O que fica, fica inteiro.
//   ✅ METADE 2 — aberto DEIXA PASSAR. Freio que barra o caso legítimo é
//      desligado no primeiro dia, e aí não protege nada.
//   🔴 E os dois defeitos que o freio destapou: a fila represada que nunca
//      drenava, e a ausência de corte de idade.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  activityEvent: { findMany: vi.fn(), count: vi.fn() },
  whatsAppOutbox: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  metaConnection: { findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn() },
  portalAccess: { findFirst: vi.fn() },
  clientNotice: { findMany: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const sendWhatsAppMessage = vi.hoisted(() => vi.fn());
const sendWhatsAppDirect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ sendWhatsAppMessage, sendWhatsAppDirect }));
const avisos = vi.hoisted(() => ({ avisarCliente: vi.fn() }));
vi.mock("@/lib/agency/esteira/avisos", () => avisos);

import {
  dispatchWhatsAppNotifications, IDADE_MAXIMA_DO_AVISO_MS,
} from "@/lib/integrations/meta/notifications";
import { cobrarAFila } from "@/lib/agency/esteira/fila-que-se-cobra";
import {
  CHAVE_DO_WHATSAPP, VALOR_QUE_LIBERA, whatsappLiberado,
} from "@/lib/agency/freios-de-saida";

const AGORA = new Date("2026-08-15T12:00:00Z");

/** Um aviso de WhatsApp pronto para sair, com a idade que se quiser. */
function evento(id: string, horasAtras = 1) {
  return {
    id, workspaceId: "ws1", clientId: "c1",
    message: JSON.stringify({ kind: "proposal_sent", phone: "11999998888", name: "João" }),
    timestamp: new Date(AGORA.getTime() - horasAtras * 3_600_000),
  };
}

function avisoParado(over: Record<string, unknown> = {}) {
  return {
    id: "av1", workspaceId: "ws1", clientId: "cli1", projectId: null,
    kind: "material", body: "Precisamos do seu logo.", status: "pendente",
    channel: "nenhum", failReason: "o canal ficou indisponível",
    retryCount: 0, createdAt: new Date("2026-08-01T12:00:00Z"),
    ...over,
  };
}

const guardado = process.env[CHAVE_DO_WHATSAPP];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[CHAVE_DO_WHATSAPP];
  db.activityEvent.findMany.mockResolvedValue([evento("ev1")]);
  db.activityEvent.count.mockResolvedValue(7);
  db.whatsAppOutbox.findMany.mockResolvedValue([]);
  db.whatsAppOutbox.count.mockResolvedValue(2);
  db.whatsAppOutbox.create.mockResolvedValue({});
  db.metaConnection.findFirst.mockResolvedValue({ id: "wa1" });
  db.clientNotice.findMany.mockResolvedValue([avisoParado()]);
  db.clientNotice.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João" });
  sendWhatsAppMessage.mockResolvedValue({ ok: true, externalPostId: "wamid.1" });
  avisos.avisarCliente.mockResolvedValue({ registrado: true, enviadoAutomaticamente: true, canal: "whatsapp" });
});

afterEach(() => {
  if (guardado === undefined) delete process.env[CHAVE_DO_WHATSAPP];
  else process.env[CHAVE_DO_WHATSAPP] = guardado;
});

// ─── A CHAVE ────────────────────────────────────────────────────────────────

describe("a chave nasce FECHADA e só abre no valor exato", () => {
  it("ausente = fechado", () => {
    delete process.env[CHAVE_DO_WHATSAPP];
    expect(whatsappLiberado()).toBe(false);
  });

  it("vazio, `off`, `true`, `1` e o masculino `liberado` NÃO abrem", () => {
    for (const v of ["", "off", "true", "1", "sim", "liberado", "LIBERADA "]) {
      process.env[CHAVE_DO_WHATSAPP] = v;
      // "LIBERADA " com espaço abre (trim + minúsculas, como o molde da
      // publicação); o resto, não. O caso que importa é `liberado`: quem digita
      // no masculino tem a torneira FECHADA, que é o lado seguro do engano.
      expect(whatsappLiberado(), `"${v}"`).toBe(v.trim().toLowerCase() === VALOR_QUE_LIBERA);
    }
  });

  it("lido na HORA, não no boot — o freio precisa valer quando alguém o solta", () => {
    delete process.env[CHAVE_DO_WHATSAPP];
    expect(whatsappLiberado()).toBe(false);
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
    expect(whatsappLiberado()).toBe(true);
  });
});

// ─── PERNA 1: O DISPARO DA FILA DE AVISOS ───────────────────────────────────

describe("PERNA 1 — `dispatchWhatsAppNotifications`", () => {
  it("⛔ METADE 1: fechado, NÃO manda", async () => {
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(sendWhatsAppDirect).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("⛔ METADE 1: fechado, NÃO consome — nada marcado como enviado, nada gravado", async () => {
    await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(db.whatsAppOutbox.create, "consumiu a fila com o freio puxado").not.toHaveBeenCalled();
  });

  it("⛔ METADE 1: fechado CONTA o que ficou, e diz por quê", async () => {
    // 7 eventos, 2 já tratados = 5 esperando. Fila morta invisível é a cicatriz
    // que esta casa já tem: freio sem testemunha não vale.
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(r.retidos).toBe(5);
    expect(r.freio?.nome).toBe(CHAVE_DO_WHATSAPP);
    expect(r.freio?.retidos).toBe(5);
    expect(r.freio?.motivo).toMatch(/opt-in/);
    expect(r.freio?.motivo).toMatch(/WHATSAPP_SAIDA=liberada/);
  });

  it("✅ METADE 2: aberto, a mensagem legítima SAI", async () => {
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(r.sent).toBe(1);
    expect(db.whatsAppOutbox.create.mock.calls[0]![0].data.status).toBe("sent");
  });
});

// ─── PERNA 2: A FILA QUE SE COBRA ───────────────────────────────────────────
//
// A segunda porta. Um freio que cobrisse só a primeira seria o desenho que
// deixou PUBLICAR de fora da trava de ativos em 06/08/2026.

describe("PERNA 2 — `cobrarAFila`", () => {
  it("⛔ METADE 1: fechado, NÃO reenvia", async () => {
    const r = await cobrarAFila("ws1", AGORA);
    expect(avisos.avisarCliente).not.toHaveBeenCalled();
    expect(r.reenviados).toEqual([]);
  });

  it("⛔ METADE 1: fechado NÃO gasta uma das três tentativas do aviso", async () => {
    // A tentativa que não aconteceu não pode contar contra o teto de reenvio.
    // Sem isto, três rodadas com o freio puxado esgotariam o aviso sem que uma
    // única mensagem tivesse sido tentada.
    await cobrarAFila("ws1", AGORA);
    expect(db.clientNotice.update, "consumiu retryCount com o freio puxado").not.toHaveBeenCalled();
  });

  it("⛔ METADE 1: fechado conta o que ficou e nomeia a chave", async () => {
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.retidos).toBe(1);
    expect(r.freio?.nome).toBe(CHAVE_DO_WHATSAPP);
  });

  it("✅ METADE 2: aberto, o aviso temporário volta a ser reenviado", async () => {
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.reenviados).toEqual(["av1"]);
    expect(r.freio).toBeNull();
  });
});

// ─── 🔴 O REPRESAMENTO QUE NUNCA DRENAVA ────────────────────────────────────
//
// `orderBy: { timestamp: "desc" }, take: 50` SEM excluir o que o outbox já
// tratou: depois da primeira rodada, as 50 mais novas já estão no outbox e são
// puladas uma a uma — e as mais antigas nunca entram na janela dos 50. Backlog
// acima de 50 ficava preso PARA SEMPRE, com a rodada reportando "0 enviados" e
// nenhum erro.

describe("🔴 a fila represada DRENA", () => {
  beforeEach(() => {
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
  });

  it("varre do MAIS ANTIGO para o mais novo — fila é fila", async () => {
    await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(db.activityEvent.findMany.mock.calls[0]![0].orderBy).toEqual({ timestamp: "asc" });
  });

  it("o que o outbox já tratou é EXCLUÍDO antes do corte, não pulado dentro dele", async () => {
    // 3 eventos, os 2 mais antigos já tratados: o terceiro TEM de sair. No
    // desenho antigo ele nunca sairia — as vagas eram gastas com `continue`.
    db.activityEvent.findMany.mockResolvedValueOnce([evento("velho1", 5), evento("velho2", 4), evento("novo", 1)]);
    db.whatsAppOutbox.findMany.mockResolvedValueOnce([
      { activityEventId: "velho1" }, { activityEventId: "velho2" },
    ]);
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(r.sent).toBe(1);
    expect(db.whatsAppOutbox.create.mock.calls[0]![0].data.activityEventId).toBe("novo");
  });

  it("uma fila maior do que a rodada alcança é NOTÍCIA, não silêncio", async () => {
    // 10 páginas cheias, nenhuma tratada, e o chamador pedindo pouco: a
    // varredura tem de dizer que há mais fila do que ela enxergou.
    db.activityEvent.findMany.mockImplementation(async () =>
      Array.from({ length: 200 }, (_, i) => evento(`ev${Math.random()}${i}`)),
    );
    const r = await dispatchWhatsAppNotifications(undefined, { limit: 100000, agora: AGORA });
    expect(r.filaAlemDoTeto).toBe(true);
  });
});

// ─── 🔴 O CORTE DE IDADE ────────────────────────────────────────────────────
//
// Um evento de dias atrás disparava hoje um "sua proposta já está pronta" como
// se fosse de agora. Depois de uma parada longa isso é uma enxurrada de
// mensagens fora de contexto para gente de verdade.

describe("🔴 aviso velho NÃO vira mensagem — e não some em silêncio", () => {
  beforeEach(() => {
    process.env[CHAVE_DO_WHATSAPP] = VALOR_QUE_LIBERA;
  });

  const horasDoCorte = IDADE_MAXIMA_DO_AVISO_MS / 3_600_000;

  it(`⛔ mais velho que ${horasDoCorte}h não é enviado`, async () => {
    db.activityEvent.findMany.mockResolvedValueOnce([evento("antigo", horasDoCorte + 1)]);
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(r.expirados).toBe(1);
    expect(r.sent).toBe(0);
  });

  it("⛔ e sai da fila CARIMBADO, com o motivo por escrito", async () => {
    db.activityEvent.findMany.mockResolvedValueOnce([evento("antigo", horasDoCorte + 24)]);
    await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    const linha = db.whatsAppOutbox.create.mock.calls[0]![0].data;
    expect(linha.status).toBe("expirado");
    expect(linha.error).toMatch(/NÃO enviado/);
    expect(linha.error).toMatch(/passou do corte/);
    expect(linha.error, "não diz o que fazer com ele").toMatch(/à mão/);
  });

  it("✅ METADE 2: o que está DENTRO do corte continua saindo", async () => {
    db.activityEvent.findMany.mockResolvedValueOnce([evento("recente", horasDoCorte - 1)]);
    const r = await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(r.sent).toBe(1);
    expect(r.expirados).toBe(0);
  });

  it("⛔ com o freio FECHADO, nem o expirado é carimbado — fechado não consome nada", async () => {
    delete process.env[CHAVE_DO_WHATSAPP];
    db.activityEvent.findMany.mockResolvedValueOnce([evento("antigo", horasDoCorte + 100)]);
    await dispatchWhatsAppNotifications(undefined, { agora: AGORA });
    expect(db.whatsAppOutbox.create).not.toHaveBeenCalled();
  });
});
