// IDEMPOTÊNCIA DA PUBLICAÇÃO NO INSTAGRAM (27/09/2026) — ficha B.
//
// O FURO: `publicarAgendados` lia `SocialPost` "scheduled", passava pelas
// travas, chamava `publishPost` e SÓ DEPOIS marcava "published". Duas rodadas
// concorrentes (o despertador de 5 em 5 min + o botão "Publicar agora", ou
// dois processos) podiam ler o MESMO post "scheduled" e publicar DUAS VEZES
// no perfil do cliente. E uma exceção depois do `media_publish` deixava o
// post "scheduled" — o relógio republicaria em 5 min.
//
// O CONSERTO, provado aqui:
//   1. Reserva atômica (`updateMany` com `where: status="scheduled"`)
//      IMEDIATAMENTE antes de `publishPost` — só uma corrida ganha.
//   2. Falha CLARA (antes de qualquer `media_publish`) volta para "scheduled".
//   3. Falha AMBÍGUA (exceção pura, ou `talvezPublicado: true`) para em
//      "publish_unknown" — NUNCA reagendada sozinha.
//   4. Sucesso grava "published", como sempre.
//
// Arquivo PRÓPRIO, de propósito: `__tests__/esteira/publicacao.test.ts` já é
// grande e testa o resto da esteira (travas de pilar, marca, formato...);
// aqui o fixture é mínimo e o foco é só a corrida.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // O FREIO DE RAJADA (`publicarAgendados`, "O FREIO DE RAJADA, ANTES DE
  // QUALQUER TRABALHO") mede a última publicação do perfil com
  // `socialPost.findFirst` — ausente aqui, os 7 casos que chegam até essa
  // trava quebravam com "findFirst is not a function". Mesmo padrão do
  // arquivo irmão (`publicacao.test.ts:12`).
  socialPost: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
}));

const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
// W9 (27/09/2026): "promoção só em stories" (W8) virou porta obrigatória no
// mesmo laço — sem este mock, TODA publicação desta suíte quebraria ao
// resolver o import, mesmo o foco aqui sendo a corrida, não a promoção.
const conferirPromocaoNoFormato = vi.hoisted(() => vi.fn(() => ({ passa: true as const })));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
vi.mock("@/lib/agency/esteira/promocao-so-em-stories", () => ({ conferirPromocaoNoFormato }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
}));

import { publicarAgendados, recuperarPublicacoesPresas } from "@/lib/agency/esteira/publicacao";

/** Toda mídia pedida existe e é JPEG — o caso limpo, igual ao arquivo irmão. */
const midiaTodaJpeg = async (args?: { where?: { id?: { in?: string[] } } }) =>
  (args?.where?.id?.in ?? []).map((id) => ({ id, mimeType: "image/jpeg" }));

const AGENDADO = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", caption: "Saiu do forno agora.",
  format: "feed", mediaUrl: "/api/media/m1", status: "scheduled",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  contratoDeMarca.mockResolvedValue({
    texto: "QUEM É\nMarca: Cliente", marcaVersao: "mv_teste0001",
    lacunas: [], cortado: [], naoConstituida: false,
  });
  conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });
  db.mediaAsset.findMany.mockImplementation(midiaTodaJpeg);
  db.socialPost.findMany.mockResolvedValue([{ ...AGENDADO }]);
  db.socialPost.updateMany.mockResolvedValue({ count: 1 });
  db.socialPost.update.mockResolvedValue({});
  // O caso limpo: este perfil nunca publicou antes — o freio de rajada não
  // adia nada, igual ao arquivo irmão (`publicacao.test.ts`).
  db.socialPost.findFirst.mockResolvedValue(null);
  db.activityEvent.create.mockResolvedValue({});
  publishPost.mockResolvedValue({ ok: true, externalPostId: "ig_1", permalink: "https://insta/p/1" });
});

describe("reserva atômica — duas rodadas não publicam o mesmo post duas vezes", () => {
  it("(i) duas rodadas concorrentes sobre o MESMO post: publishPost é chamado UMA vez só", async () => {
    // A primeira `updateMany` (reserva) que chegar encontra "scheduled" e
    // ganha (`count: 1`); a que chegar depois já não encontra a condição
    // (`count: 0`) — é exatamente o que o `WHERE status = 'scheduled'` do
    // SQLite garante, por linha, sem precisar de lock explícito.
    db.socialPost.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });

    const [a, b] = await Promise.all([publicarAgendados(), publicarAgendados()]);

    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(a.publicados + b.publicados).toBe(1);
    const adiados = [...a.adiados, ...b.adiados];
    expect(adiados).toHaveLength(1);
    expect(adiados[0]!.motivo).toBe("já sendo publicada por outra rodada");
  });

  it("a rodada que perdeu a reserva não fala com a Meta nem grava falha", async () => {
    db.socialPost.updateMany.mockResolvedValue({ count: 0 });
    const r = await publicarAgendados();
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.falhas).toHaveLength(0);
    expect(r.adiados[0]!.motivo).toBe("já sendo publicada por outra rodada");
  });
});

describe("falha CLARA vs AMBÍGUA — o que decide é a fase, nunca a impressão", () => {
  it("(iii) falha clara (erro antes de qualquer media_publish) volta para \"scheduled\" com lastError", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "token do Instagram inválido" });
    const r = await publicarAgendados();

    expect(r.publicados).toBe(0);
    expect(r.incertos).toHaveLength(0);
    expect(r.falhas[0]!.erro).toBe("token do Instagram inválido");
    const escrita = db.socialPost.update.mock.calls.at(-1)![0];
    expect(escrita.data.status).toBe("scheduled");
    expect(escrita.data.lastError).toBe("token do Instagram inválido");
  });

  it("(ii) exceção pura (sem talvezPublicado) é ambígua por padrão — fail-safe", async () => {
    publishPost.mockRejectedValue(new Error("fetch failed"));
    const r = await publicarAgendados();

    expect(r.publicados).toBe(0);
    expect(r.falhas).toHaveLength(0);
    expect(r.incertos[0]!.motivo).toBe("fetch failed");
    const escrita = db.socialPost.update.mock.calls.at(-1)![0];
    expect(escrita.data.status).toBe("publish_unknown");
    expect(escrita.data.lastError).toBe("fetch failed");
    expect(db.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "publicacao_incerta" }) }),
    );
  });

  it("talvezPublicado:true também é ambígua, mesmo sem exceção (erro depois do media_publish)", async () => {
    publishPost.mockResolvedValue({ ok: false, error: "timeout esperando a Meta", talvezPublicado: true });
    const r = await publicarAgendados();

    expect(r.incertos[0]!.motivo).toBe("timeout esperando a Meta");
    expect(db.socialPost.update.mock.calls.at(-1)![0].data.status).toBe("publish_unknown");
  });

  it("(ii continuação) uma peça em \"publish_unknown\" NÃO é lida pela rodada seguinte — publishPost não é chamado de novo", async () => {
    publishPost.mockRejectedValue(new Error("fetch failed"));
    await publicarAgendados(); // primeira rodada: fica publish_unknown
    publishPost.mockClear();

    // A fila só lê "scheduled" — o mock devolve exatamente o que a consulta
    // pediria de verdade: nada, porque a peça não está mais "scheduled".
    db.socialPost.findMany.mockResolvedValue([]);
    const r2 = await publicarAgendados();

    expect(publishPost).not.toHaveBeenCalled();
    expect(r2.publicados).toBe(0);
  });

  it("(iv) sucesso grava \"published\", externalPostId e permalink", async () => {
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    const escrita = db.socialPost.update.mock.calls.at(-1)![0];
    expect(escrita.data.status).toBe("published");
    expect(escrita.data.externalPostId).toBe("ig_1");
    expect(escrita.data.permalink).toBe("https://insta/p/1");
    expect(escrita.data.lastError).toBeNull();
  });
});

describe("recuperarPublicacoesPresas — processo que morreu no meio da chamada", () => {
  const AGORA = new Date("2026-09-27T12:00:00Z");
  const HA_20_MIN = new Date(AGORA.getTime() - 20 * 60_000);

  it("post \"publishing\" há mais de 15 min vira \"publish_unknown\", com ActivityEvent", async () => {
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp-preso", workspaceId: "ws1", clientId: "c1" },
    ]);
    const r = await recuperarPublicacoesPresas(AGORA);

    expect(r).toHaveLength(1);
    expect(r[0]!.postId).toBe("sp-preso");
    expect(db.socialPost.update).toHaveBeenCalledWith({
      where: { id: "sp-preso" },
      data: { status: "publish_unknown", lastError: expect.stringContaining("Confira no perfil do Instagram") },
    });
    expect(db.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "publicacao_incerta", workspaceId: "ws1", clientId: "c1" }) }),
    );
    void HA_20_MIN; // documenta o limite testado pela própria query — sem acesso ao SQL aqui.
  });

  it("fila vazia não escreve nada", async () => {
    db.socialPost.findMany.mockResolvedValue([]);
    const r = await recuperarPublicacoesPresas(AGORA);
    expect(r).toHaveLength(0);
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });

  it("nunca reenvia sozinha — não chama publishPost", async () => {
    db.socialPost.findMany.mockResolvedValue([{ id: "sp-preso", workspaceId: "ws1", clientId: "c1" }]);
    await recuperarPublicacoesPresas(AGORA);
    expect(publishPost).not.toHaveBeenCalled();
  });
});
