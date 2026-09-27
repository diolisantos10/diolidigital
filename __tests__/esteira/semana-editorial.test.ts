// semana-editorial.test.ts — a rotina semanal: fuso, finalização e o modo de
// aprovação.
//
// Mocks TIPADOS (regra do CLAUDE.md: `vi.hoisted(() => vi.fn())` sem
// assinatura quebra `tsc --noEmit` mesmo com o teste verde — todo
// `.mockImplementation`/retorno abaixo é anotado).
//
// Módulos com efeito colateral (banco, IA de verdade, escrita de
// `ApprovalRequest`) são mockados por INTEIRO com implementações PRÓPRIAS —
// nunca `importOriginal` — para este arquivo não depender da árvore de
// imports de `modo-de-aprovacao.ts`/`cards-de-aprovacao.ts` (que puxam
// `publicacao.ts`, `aprovacao-da-peca.ts` etc.). A lógica de `modoEmVigor`
// reproduzida aqui é a mesma (2 linhas) que `lib/agency/esteira/modo-de-aprovacao.ts`
// documenta — quem quiser provar AQUELE arquivo tem teste próprio.

import { describe, it, expect, vi, beforeEach } from "vitest";

interface LinhaDePost {
  id: string;
  workspaceId: string;
  clientId: string | null;
  caption: string;
  /** Decide a trava de PROMOÇÃO SÓ EM STORIES (27/09/2026). */
  format: string;
  pillar: string | null;
  artDirection: string | null;
  scheduledFor: Date | null;
  scriptJson: string | null;
  status: string;
}

interface ClienteFixture {
  workspaceId: string;
  modoAprovacao: string;
  modoPendente: string | null;
  modoPendenteVigenteEm: Date | null;
}

let posts: LinhaDePost[] = [];
let clientes: Record<string, ClienteFixture> = {};

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn(), findMany: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
const produzirArtesPendentes = vi.hoisted(() => vi.fn());
const cardsQueJaDecidem = vi.hoisted(() => vi.fn());
const createApprovalRequest = vi.hoisted(() => vi.fn());
const registrarAprovacaoPorRegra = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
// Só para satisfazer a cadeia de import de `calendario-editorial.ts` (de onde
// vem `ehFasePauta`) — nenhuma destas funções é chamada neste arquivo, EXCETO
// `normalizarFormato`: `promocao-so-em-stories.ts` (27/09/2026) importa ela de
// verdade, na cadeia real de `finalizarUmPost` → `conferirPromocaoNoFormato`.
// A MESMA régua de 4 linhas de `publicacao.ts`, reproduzida (não
// `importOriginal` — a mesma razão do resto deste arquivo).
vi.mock("@/lib/agency/esteira/publicacao", () => ({
  proximaDataLivre: vi.fn(), HORA_PADRAO: 10, agendarPecasAprovadas: vi.fn(),
  normalizarFormato: (f: string): "feed" | "reel" | "story" | "carousel" => {
    if (f === "reel" || f === "video") return "reel";
    if (f === "story") return "story";
    if (f === "carousel" || f === "carrossel") return "carousel";
    return "feed";
  },
}));
vi.mock("@/lib/agency/esteira/posse-do-cliente", () => ({ clienteOuNulo: vi.fn() }));
vi.mock("@/lib/agency/execution/artes", () => ({ produzirArtesPendentes }));
vi.mock("@/lib/agency/esteira/cards-de-aprovacao", () => ({
  corpoDoCard: (pecas: Array<{ id: string }>) => ({
    titulo: `Peças da semana — ${pecas.length}`,
    reviewNote: "nota do card",
    ordenados: pecas,
  }),
  cardsQueJaDecidem,
  DEPARTAMENTO: "social-media",
}));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest }));
vi.mock("@/lib/agency/esteira/modo-de-aprovacao", () => ({
  // A MESMA régua de 2 linhas de `modo-de-aprovacao.ts` — não a fonte, uma
  // reprodução fiel e pequena o bastante para não divergir por acidente.
  modoEmVigor: (
    c: { modoAprovacao: string; modoPendente: string | null; modoPendenteVigenteEm: Date | null },
    em: Date,
  ): string => {
    if (c.modoPendente && c.modoPendenteVigenteEm && em.getTime() >= c.modoPendenteVigenteEm.getTime()) {
      return c.modoPendente;
    }
    return c.modoAprovacao;
  },
  carimboDoModo: (modo: string, data: Date): string => `regra-da-marca:piloto_automatico@${data.toISOString().slice(0, 10)}`,
  carimboDoSilencio: (data: Date): string => `regra-da-marca:silencio_publica@${data.toISOString().slice(0, 10)}`,
  registrarAprovacaoPorRegra,
}));

import {
  ehQuinta10hBrasilia,
  semanaSeguinte,
  prazoDeAprovacao,
  finalizarSemana,
  finalizarPecasNaJanela,
  aplicarSilencioSemanal,
} from "@/lib/agency/esteira/semana-editorial";

const WS = "ws1";

function pautaJson(): string {
  return JSON.stringify({ origemGerador: "calendario-editorial-v1", mes: "2026-10", fase: "pauta" });
}
function finalJson(): string {
  return JSON.stringify({ origemGerador: "calendario-editorial-v1", mes: "2026-10", fase: "final" });
}
/** O combo (W12b, 27/09/2026) no `scriptJson` de uma peça "pauta". */
function pautaJsonComCombo(preco: string): string {
  return JSON.stringify({
    origemGerador: "calendario-editorial-v1", mes: "2026-10", fase: "pauta", tipo: "combo",
    combo: { nome: "Combo Salmão", preco },
  });
}
/** O story-filho de "capa_do_post_do_dia" (W12b) — nasce em "pauta"
 *  PERMANENTEMENTE, nunca finalizado por esta rotina. */
function capaDerivadaJson(dependeDe: string): string {
  return JSON.stringify({
    origemGerador: "calendario-editorial-v1", mes: "2026-10", fase: "pauta", tipo: "capa_derivada", dependeDe,
  });
}

async function gerarFinalOk(): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> {
  return {
    ok: true,
    data: { legenda: "A massa descansa desde as 5 da manhã, e o cheirinho já invade a rua.", hashtags: ["padaria", "bastidores"] },
    model: "mock-claude",
    provider: "claude",
  };
}

beforeEach(() => {
  posts = [];
  clientes = {};
  vi.clearAllMocks();

  db.socialPost.findMany.mockImplementation(
    async ({ where }: {
      where: {
        workspaceId?: string; clientId?: string; status?: string;
        scheduledFor?: { gte: Date; lte: Date }; id?: { in: string[] };
      };
    }): Promise<LinhaDePost[]> => {
      return posts.filter((p) => {
        if (where.id && !where.id.in.includes(p.id)) return false;
        if (where.workspaceId && p.workspaceId !== where.workspaceId) return false;
        if (where.clientId && p.clientId !== where.clientId) return false;
        if (where.status && p.status !== where.status) return false;
        if (where.scheduledFor) {
          const { gte, lte } = where.scheduledFor;
          if (!p.scheduledFor || p.scheduledFor < gte || p.scheduledFor > lte) return false;
        }
        return true;
      });
    },
  );
  db.socialPost.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<LinhaDePost> }): Promise<LinhaDePost | null> => {
      const p = posts.find((x) => x.id === where.id) ?? null;
      if (p) Object.assign(p, data);
      return p;
    },
  );
  db.client.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }): Promise<ClienteFixture | null> => clientes[where.id] ?? null,
  );
  // Usado por `finalizarPecasNaJanela` (`excluirMensal`) para ler o modo de
  // cada cliente ANTES de finalizar — a mesma régua de `db.client.findUnique`
  // acima, só que em lote (`findMany`).
  db.client.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }): Promise<Array<{ id: string } & ClienteFixture>> =>
      where.id.in
        .filter((id) => clientes[id])
        .map((id) => ({ id, ...clientes[id]! })),
  );
  db.activityEvent.create.mockResolvedValue({});

  contratoDeMarca.mockResolvedValue({
    texto: "QUEM É\nPromessa: pão de fermentação natural.",
    marcaVersao: "mv1", lacunas: [], cortado: [], naoConstituida: false,
  });
  produzirArtesPendentes.mockResolvedValue({ produzidas: 0, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [] });
  cardsQueJaDecidem.mockResolvedValue({ emCardPendente: new Set<string>(), aprovadaPeloCliente: new Set<string>() });
  createApprovalRequest.mockResolvedValue({ id: "ar-semana-1" });
  registrarAprovacaoPorRegra.mockImplementation(
    async (a: { clientId: string; postIds: string[] }): Promise<{ ok: true; approvalRequestId: string; agendados: number }> => ({
      ok: true, approvalRequestId: `ar-regra-${a.clientId}`, agendados: a.postIds.length,
    }),
  );
});

describe("as funções puras de fuso", () => {
  it("ehQuinta10hBrasilia: quinta 13:00Z é 10h Brasília", () => {
    expect(ehQuinta10hBrasilia(new Date("2026-10-01T13:00:00.000Z"))).toBe(true);
  });
  it("ehQuinta10hBrasilia: quinta 10:00Z é 7h Brasília — false", () => {
    expect(ehQuinta10hBrasilia(new Date("2026-10-01T10:00:00.000Z"))).toBe(false);
  });
  it("ehQuinta10hBrasilia: quarta 13:00Z — false, dia errado", () => {
    expect(ehQuinta10hBrasilia(new Date("2026-09-30T13:00:00.000Z"))).toBe(false);
  });
  it("ehQuinta10hBrasilia: vale a HORA INTEIRA (10:00 a 10:59 Brasília)", () => {
    expect(ehQuinta10hBrasilia(new Date("2026-10-01T13:59:00.000Z"))).toBe(true);
    expect(ehQuinta10hBrasilia(new Date("2026-10-01T14:00:00.000Z"))).toBe(false);
  });

  it("semanaSeguinte: quinta 01/10/2026 → segunda 05/10 00:00 BRT a domingo 11/10 23:59:59.999 BRT", () => {
    const { de, ate } = semanaSeguinte(new Date("2026-10-01T13:00:00.000Z"));
    // 05/10 00:00 BRT = 05/10 03:00 UTC.
    expect(de.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    // 11/10 23:59:59.999 BRT = 12/10 02:59:59.999 UTC.
    expect(ate.toISOString()).toBe("2026-10-12T02:59:59.999Z");
  });

  it("prazoDeAprovacao: sexta 18:00 Brasília ANTERIOR à semana = 21:00 UTC", () => {
    const semana = semanaSeguinte(new Date("2026-10-01T13:00:00.000Z"));
    const prazo = prazoDeAprovacao(semana);
    expect(prazo.toISOString()).toBe("2026-10-02T21:00:00.000Z");
  });
});

describe("finalizarSemana", () => {
  const DE = new Date("2026-10-05T03:00:00.000Z");
  const ATE = new Date("2026-10-12T02:59:59.999Z");
  const DATA_DO_POST = new Date("2026-10-06T13:00:00.000Z"); // terça, dentro da janela

  it("finaliza a legenda, chama a arte pelo recorte nomeado, e é IDEMPOTENTE", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho do calendário", format: "feed",
      pillar: "bastidores", artDirection: "foto do forno", scheduledFor: DATA_DO_POST,
      scriptJson: pautaJson(), status: "draft",
    });

    const r1 = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarFinalOk });
    expect(r1.postsFinalizados).toBe(1);
    expect(r1.falhas).toEqual([]);
    expect(posts[0]!.scriptJson).toContain('"fase":"final"');
    expect(produzirArtesPendentes).toHaveBeenCalledTimes(1);
    expect(produzirArtesPendentes).toHaveBeenCalledWith({ refazer: ["sp1"] });

    const gerarSegunda = vi.fn(gerarFinalOk);
    const r2 = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarSegunda });
    expect(r2.postsFinalizados).toBe(0);
    expect(gerarSegunda).not.toHaveBeenCalled();
    expect(produzirArtesPendentes).toHaveBeenCalledTimes(1); // continua 1, não 2
  });

  // ── STORIES DERIVADOS (W12b, 27/09/2026) — "capa_derivada" NUNCA finaliza ──
  it('"capa_derivada" (story-filho, sem legenda própria) NUNCA é finalizado — fica em "pauta", IA não é chamada para ele', async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp-pai", workspaceId: WS, clientId: "c1", caption: "rascunho do calendário", format: "feed",
      pillar: "bastidores", artDirection: "foto do forno", scheduledFor: DATA_DO_POST,
      scriptJson: pautaJson(), status: "draft",
    });
    posts.push({
      id: "sp-filho", workspaceId: WS, clientId: "c1", caption: "", format: "story",
      pillar: null, artDirection: null,
      scheduledFor: new Date(DATA_DO_POST.getTime() + 30 * 60_000),
      scriptJson: capaDerivadaJson("sp-pai"), status: "draft",
    });

    const gerar = vi.fn(gerarFinalOk);
    const r = await finalizarSemana({ de: DE, ate: ATE, gerar });

    expect(r.postsFinalizados).toBe(1); // só o pai
    expect(gerar).toHaveBeenCalledTimes(1);
    expect(produzirArtesPendentes).toHaveBeenCalledWith({ refazer: ["sp-pai"] });
    // O filho continua em "pauta" — nunca regravado, nunca mandado para arte.
    expect(posts.find((p) => p.id === "sp-filho")!.scriptJson).toContain('"fase":"pauta"');
  });

  // ── COMBO: O PREÇO NUNCA SAI DA LEGENDA, NEM NA FINALIZAÇÃO (W12b) ────────
  it("combo com preço preservado na legenda final: finaliza normalmente", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho do combo", format: "story",
      pillar: "combo", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: pautaJsonComCombo("R$ 39,90"), status: "draft",
    });

    const gerarComPreco = vi.fn(
      async (): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> => ({
        ok: true,
        data: { legenda: "Combo Salmão de hoje sai por R$ 39,90 — só até acabar o estoque.", hashtags: ["combo"] },
        model: "mock-claude",
        provider: "claude",
      }),
    );

    const r = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarComPreco });
    expect(r.postsFinalizados).toBe(1);
    expect(r.falhas).toEqual([]);
    expect(posts[0]!.caption).toContain("R$ 39,90");
  });

  it("combo cujo preço SOME na legenda final: NÃO finaliza — falha nomeando o preço, post fica em pauta", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho do combo", format: "story",
      pillar: "combo", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: pautaJsonComCombo("R$ 39,90"), status: "draft",
    });

    const gerarSemPreco = vi.fn(
      async (): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> => ({
        ok: true,
        data: { legenda: "Combo Salmão de hoje com um preço especial — só até acabar o estoque.", hashtags: ["combo"] },
        model: "mock-claude",
        provider: "claude",
      }),
    );

    const r = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarSemPreco });
    expect(r.postsFinalizados).toBe(0);
    expect(r.falhas).toEqual([{ postId: "sp1", motivo: expect.stringContaining("preço do combo") }]);
    expect(posts[0]!.scriptJson).toContain('"fase":"pauta"');
  });

  it("um caso por modo: piloto carimba, semanal abre card, CEO não faz nada, MENSAL nem é tocado (achado 1, Q4-qualidade)", async () => {
    clientes["c-piloto"] = { workspaceId: WS, modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null };
    clientes["c-semanal"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    clientes["c-ceo"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    clientes["c-mensal"] = { workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null };

    for (const clientId of ["c-piloto", "c-semanal", "c-ceo", "c-mensal"]) {
      posts.push({
        id: `sp-${clientId}`, workspaceId: WS, clientId, caption: "rascunho", format: "feed",
        pillar: "bastidores", artDirection: "foto", scheduledFor: DATA_DO_POST,
        scriptJson: pautaJson(), status: "draft",
      });
    }

    const r = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarFinalOk });
    // "sp-c-mensal" NÃO entra: MENSAL não escapa por aqui (achado 1,
    // Q4-qualidade, 27/09/2026) — quem finaliza é `finalizarMes`, dia 25.
    expect(r.postsFinalizados).toBe(3);
    expect(r.clientesProcessados).toBe(3);

    const porCliente = new Map(r.aprovacoes.map((a) => [a.clientId, a]));

    expect(porCliente.get("c-piloto")!.modo).toBe("PILOTO_AUTOMATICO");
    expect(registrarAprovacaoPorRegra).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-piloto", postIds: ["sp-c-piloto"] }),
    );
    expect(porCliente.get("c-piloto")!.resultado).toContain("aprovado automaticamente");

    expect(porCliente.get("c-semanal")!.modo).toBe("SEMANAL");
    expect(createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-semanal", sourcePostIds: ["sp-c-semanal"] }),
    );

    expect(porCliente.get("c-ceo")!.modo).toBe("APROVACAO_CEO");
    expect(porCliente.get("c-ceo")!.resultado).toBe("espera o master");
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-ceo" }),
    );

    // MENSAL: nem aparece em `aprovacoes` — a peça NUNCA foi finalizada nem
    // gastou arte por esta rotina, e continua em fase "pauta", disponível
    // para `finalizarMes` (dia 25) achar e processar. Nenhum ActivityEvent,
    // nenhum card — nem sequer a linha de telemetria (antes, esta rotina
    // finalizava, pagava arte, e a peça ficava órfã para sempre).
    expect(porCliente.has("c-mensal")).toBe(false);
    expect(posts.find((p) => p.id === "sp-c-mensal")!.scriptJson).toContain('"fase":"pauta"');
    expect(produzirArtesPendentes).not.toHaveBeenCalledWith(
      expect.objectContaining({ refazer: expect.arrayContaining(["sp-c-mensal"]) }),
    );
    expect(db.activityEvent.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c-mensal" }) }),
    );
  });

  // ── `excluirMensal` NO NÚCLEO — as DUAS metades (achado 1, Q4-qualidade) ──
  describe("finalizarPecasNaJanela: excluirMensal", () => {
    it("excluirMensal:true — pula o cliente MENSAL, sem chamar IA nem arte para ele; o não-mensal segue normal", async () => {
      clientes["c-mensal"] = { workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null };
      clientes["c-semanal"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
      posts.push({
        id: "sp-mensal", workspaceId: WS, clientId: "c-mensal", caption: "rascunho", format: "feed",
        pillar: "bastidores", artDirection: "foto", scheduledFor: DATA_DO_POST,
        scriptJson: pautaJson(), status: "draft",
      });
      posts.push({
        id: "sp-semanal", workspaceId: WS, clientId: "c-semanal", caption: "rascunho", format: "feed",
        pillar: "bastidores", artDirection: "foto", scheduledFor: DATA_DO_POST,
        scriptJson: pautaJson(), status: "draft",
      });

      const gerar = vi.fn(gerarFinalOk);
      const r = await finalizarPecasNaJanela({ de: DE, ate: ATE, gerar, excluirMensal: true });

      expect(r.postsFinalizados).toBe(1);
      expect(r.finalizadosPorCliente.has("c-mensal")).toBe(false);
      expect(r.finalizadosPorCliente.get("c-semanal")).toEqual(["sp-semanal"]);
      expect(gerar).toHaveBeenCalledTimes(1); // só o não-mensal gastou IA
      expect(produzirArtesPendentes).toHaveBeenCalledTimes(1);
      expect(produzirArtesPendentes).toHaveBeenCalledWith({ refazer: ["sp-semanal"] });
      expect(posts.find((p) => p.id === "sp-mensal")!.scriptJson).toContain('"fase":"pauta"');
    });

    it("sem excluirMensal (o caso de `finalizarMes`) — o cliente MENSAL É finalizado normalmente", async () => {
      clientes["c-mensal"] = { workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null };
      posts.push({
        id: "sp-mensal", workspaceId: WS, clientId: "c-mensal", caption: "rascunho", format: "feed",
        pillar: "bastidores", artDirection: "foto", scheduledFor: DATA_DO_POST,
        scriptJson: pautaJson(), status: "draft",
      });

      const r = await finalizarPecasNaJanela({ de: DE, ate: ATE, gerar: gerarFinalOk });

      expect(r.postsFinalizados).toBe(1);
      expect(r.finalizadosPorCliente.get("c-mensal")).toEqual(["sp-mensal"]);
      expect(produzirArtesPendentes).toHaveBeenCalledWith({ refazer: ["sp-mensal"] });
      expect(posts.find((p) => p.id === "sp-mensal")!.scriptJson).toContain('"fase":"final"');
    });
  });

  // ── PROMOÇÃO SÓ EM STORIES (CEO, 27/09/2026) — a MESMA trava do gerador,
  // agora na FINALIZAÇÃO. ──────────────────────────────────────────────────
  it('formato "feed" com legenda final de promoção NÃO finaliza — falha nomeando o motivo, post fica em "pauta"', async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho do calendário", format: "feed",
      pillar: "bastidores", artDirection: "foto do balcão", scheduledFor: DATA_DO_POST,
      scriptJson: pautaJson(), status: "draft",
    });

    const gerarComPromocao = vi.fn(
      async (): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> => ({
        ok: true,
        data: { legenda: "corre que é só hoje: 20% OFF em tudo, promoção imperdível", hashtags: ["padaria"] },
        model: "mock-claude",
        provider: "claude",
      }),
    );

    const r = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarComPromocao });
    expect(r.postsFinalizados).toBe(0);
    expect(r.falhas).toEqual([{ postId: "sp1", motivo: expect.stringContaining("promoção só em stories") }]);
    // Falhou: o post NÃO regrava, continua em fase "pauta" — a próxima rodada tenta de novo.
    expect(posts[0]!.scriptJson).toContain('"fase":"pauta"');
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it('o MESMO texto de promoção, formato "story", finaliza normalmente — é o lugar dela', async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho do calendário", format: "story",
      pillar: "bastidores", artDirection: "foto do balcão", scheduledFor: DATA_DO_POST,
      scriptJson: pautaJson(), status: "draft",
    });

    const gerarComPromocao = vi.fn(
      async (): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> => ({
        ok: true,
        data: { legenda: "corre que é só hoje: 20% OFF em tudo, promoção imperdível", hashtags: ["padaria"] },
        model: "mock-claude",
        provider: "claude",
      }),
    );

    const r = await finalizarSemana({ de: DE, ate: ATE, gerar: gerarComPromocao });
    expect(r.postsFinalizados).toBe(1);
    expect(r.falhas).toEqual([]);
    expect(posts[0]!.scriptJson).toContain('"fase":"final"');
  });
});

describe("aplicarSilencioSemanal", () => {
  const AGORA_ANTES_DO_PRAZO = new Date("2026-10-01T13:00:00.000Z"); // quinta, bem antes de sexta 18h
  const AGORA_NO_PRAZO = new Date("2026-10-02T21:00:00.000Z"); // sexta 18:00 BRT exatas
  const DATA_DO_POST = new Date("2026-10-06T13:00:00.000Z"); // terça da semana-alvo

  it("antes do prazo (sexta 18h Brasília) não silencia nada", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "legenda final", format: "feed",
      pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: finalJson(), status: "draft",
    });

    const r = await aplicarSilencioSemanal(AGORA_ANTES_DO_PRAZO);
    expect(r.postsSilenciados).toBe(0);
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
  });

  it("depois do prazo, modo SEMANAL, sem decisão do cliente → aprova por regra (carimbo de silêncio)", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "legenda final", format: "feed",
      pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: finalJson(), status: "draft",
    });

    const r = await aplicarSilencioSemanal(AGORA_NO_PRAZO);
    expect(r.postsSilenciados).toBe(1);
    expect(registrarAprovacaoPorRegra).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "c1", postIds: ["sp1"],
        carimbo: expect.stringContaining("regra-da-marca:silencio_publica"),
      }),
    );
  });

  it("NUNCA em APROVACAO_CEO", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "legenda final", format: "feed",
      pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: finalJson(), status: "draft",
    });

    const r = await aplicarSilencioSemanal(AGORA_NO_PRAZO);
    expect(r.postsSilenciados).toBe(0);
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
  });

  it("peça com AJUSTE PEDIDO (revision_requested) nunca é silenciada — nem aparece na consulta", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "legenda final", format: "feed",
      pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: finalJson(), status: "revision_requested",
    });

    const r = await aplicarSilencioSemanal(AGORA_NO_PRAZO);
    expect(r.postsSilenciados).toBe(0);
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
  });

  // C10 (27/09/2026, achado da `qualidade`, Q5): o ajuste sem mira reconhecível
  // no card de SEMANA não promove o `SocialPost` (Achado 2, Q4 — de propósito,
  // para não travar peças que o cliente não apontou) e o `ApprovalRequest`
  // volta a "pending" para o cliente decidir de novo (`devolveADecisao`,
  // route.ts). Por `status`, isso é IDÊNTICO a um card recém-aberto e nunca
  // tocado — a única diferença real é o `ApprovalComment` que o cliente já
  // deixou. `cardsQueJaDecidem` agora expõe isso em `pedidoDeAjustePendente`.
  it("card de semana com ajuste SEM mira: a peça objetada NUNCA é publicada por silêncio; a peça sem NENHUMA resposta segue publicando (cruza os dois mundos)", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push(
      {
        // sp1: cliente já escreveu "está tudo meio sem graça" (sem mira). O
        // card voltou a "pending"; o post continua "draft" — exatamente como
        // se ninguém tivesse falado nada, SE não fosse `pedidoDeAjustePendente`.
        id: "sp1", workspaceId: WS, clientId: "c1", caption: "legenda final 1", format: "feed",
        pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
        scriptJson: finalJson(), status: "draft",
      },
      {
        // sp2: nenhum card, nenhuma palavra do cliente — silêncio de verdade.
        id: "sp2", workspaceId: WS, clientId: "c1", caption: "legenda final 2", format: "feed",
        pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
        scriptJson: finalJson(), status: "draft",
      },
    );
    cardsQueJaDecidem.mockResolvedValue({
      emCardPendente: new Set<string>(["sp1"]),
      aprovadaPeloCliente: new Set<string>(),
      pedidoDeAjustePendente: new Set<string>(["sp1"]),
    });

    const r = await aplicarSilencioSemanal(AGORA_NO_PRAZO);

    expect(r.postsSilenciados, "só sp2 (a peça sem resposta) pode ser silenciada").toBe(1);
    expect(registrarAprovacaoPorRegra).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", postIds: ["sp2"] }),
    );
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalledWith(
      expect.objectContaining({ postIds: expect.arrayContaining(["sp1"]) }),
    );
  });

  it("peça em fase PAUTA (nunca finalizada) não é silenciada — silêncio só aprova o que já é legenda final", async () => {
    clientes["c1"] = { workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null };
    posts.push({
      id: "sp1", workspaceId: WS, clientId: "c1", caption: "rascunho", format: "feed",
      pillar: "bastidores", artDirection: null, scheduledFor: DATA_DO_POST,
      scriptJson: pautaJson(), status: "draft",
    });

    const r = await aplicarSilencioSemanal(AGORA_NO_PRAZO);
    expect(r.postsSilenciados).toBe(0);
    expect(registrarAprovacaoPorRegra).not.toHaveBeenCalled();
  });
});
