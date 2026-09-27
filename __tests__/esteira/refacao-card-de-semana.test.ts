// refacao-card-de-semana.test.ts — o AJUSTE num card de semana (1C-C2, 28/09/2026).
//
// Prova o achado da ficha (o que existia ANTES: ou escalava sem regenerar
// nada — sem Project — ou regenerava o LOTE inteiro do departamento — com
// Project) e o comportamento NOVO: regenera SÓ a peça apontada, respeita a
// TRAVA DA SEMANA e o LIMITE MENSAL.
//
// Mocks: os dois de `refacao.test.ts` (db, generate) MAIS os de
// `semana-editorial.test.ts` (a árvore que `refazerPecaDaSemana` atravessa) —
// as duas cadeias reais que este caminho novo cruza. Nenhum `importOriginal`.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface PostFixture {
  id: string;
  workspaceId: string;
  clientId: string | null;
  caption: string;
  format: string;
  pillar: string | null;
  artDirection: string | null;
  scheduledFor: Date | null;
  scriptJson: string | null;
  deliverableId: string | null;
  mediaUrl: string | null;
  status: string;
}

interface RefacaoFixture {
  workspaceId: string; clientId: string; socialPostId: string; motivo: string;
  origem: string; contaNoLimite: boolean; mesReferencia: string;
}

let posts: PostFixture[] = [];
let refacoes: RefacaoFixture[] = [];

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
  project: { findFirst: vi.fn(async () => null) },
  socialPost: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  refacaoDaPeca: { count: vi.fn(), create: vi.fn() },
  activityEvent: { create: vi.fn(async () => ({})) },
  portalMessage: { create: vi.fn(async () => ({})) },
  pagamentoConfirmado: { findUnique: vi.fn(async () => null) },
  brainArtifact: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
  contentRequest: { findFirst: vi.fn(async () => null) },
}));
const generate = vi.hoisted(() => vi.fn());
const produzirArtesPendentes = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
// A MESMA reprodução de `semana-editorial.test.ts` — `finalizarUmPost` chama
// `conferirPromocaoNoFormato`, que importa `normalizarFormato` DE VERDADE
// daqui, mesmo neste teste sendo sobre `refacao.ts`.
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
  corpoDoCard: (pecas: Array<{ id: string }>) => ({ titulo: "Peças da semana", reviewNote: "nota", ordenados: pecas }),
  cardsQueJaDecidem: vi.fn(async () => ({ emCardPendente: new Set<string>(), aprovadaPeloCliente: new Set<string>() })),
  DEPARTAMENTO: "social-media",
}));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest: vi.fn() }));
vi.mock("@/lib/agency/esteira/modo-de-aprovacao", () => ({
  modoEmVigor: (): string => "APROVACAO_CEO",
  carimboDoModo: (): string => "regra-da-marca:piloto_automatico",
  carimboDoSilencio: (): string => "regra-da-marca:silencio_publica",
  registrarAprovacaoPorRegra: vi.fn(),
}));

import { refazerPorPedidoDoCliente } from "@/lib/agency/esteira/refacao";
import { FRASE_LIMITE_ESTOURADO_AO_CLIENTE } from "@/lib/agency/esteira/limite-de-refacoes";

const WS = "ws1";
const CLIENTE = "c1";

function pautaJson(): string {
  return JSON.stringify({ origemGerador: "calendario-editorial-v1", mes: "2026-10", fase: "final" });
}

async function gerarLegenda(nova: string): Promise<{ ok: true; data: { legenda: string; hashtags: string[] }; model: string; provider: "claude" }> {
  return { ok: true, data: { legenda: nova, hashtags: ["padaria"] }, model: "mock", provider: "claude" };
}

beforeEach(() => {
  posts = [];
  refacoes = [];
  vi.clearAllMocks();

  db.client.findUnique.mockResolvedValue({
    id: CLIENTE, name: "Padaria do João", workspaceId: WS,
    // Anistia do portão de pagamento (corte em 25/08/2026) — cliente antigo.
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    limiteRefacoesMes: null,
  });
  db.socialPost.findMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] } } }): Promise<Array<{ id: string; deliverableId: string | null; scriptJson: string | null; scheduledFor: Date | null }>> =>
      posts.filter((p) => where.id.in.includes(p.id))
        .map((p) => ({ id: p.id, deliverableId: p.deliverableId, scriptJson: p.scriptJson, scheduledFor: p.scheduledFor })),
  );
  db.socialPost.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }): Promise<PostFixture | null> => posts.find((p) => p.id === where.id) ?? null,
  );
  db.socialPost.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<PostFixture> }): Promise<PostFixture | null> => {
      const p = posts.find((x) => x.id === where.id) ?? null;
      if (p) Object.assign(p, data);
      return p;
    },
  );
  db.refacaoDaPeca.count.mockImplementation(
    async ({ where }: { where: { clientId: string; mesReferencia: string; contaNoLimite: boolean } }): Promise<number> =>
      refacoes.filter(
        (r) => r.clientId === where.clientId && r.mesReferencia === where.mesReferencia && r.contaNoLimite === where.contaNoLimite,
      ).length,
  );
  db.refacaoDaPeca.create.mockImplementation(async ({ data }: { data: RefacaoFixture }): Promise<RefacaoFixture> => {
    refacoes.push(data);
    return data;
  });

  contratoDeMarca.mockResolvedValue({ texto: "", marcaVersao: "mv1", lacunas: [], cortado: [], naoConstituida: true });
  produzirArtesPendentes.mockResolvedValue({ produzidas: 0, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [] });
});

function duasPecasDaSemana(scheduledFor: Date): void {
  posts.push({
    id: "sp1", workspaceId: WS, clientId: CLIENTE, caption: "Pão fresquinho toda manhã.",
    format: "feed", pillar: "bastidores", artDirection: null, scheduledFor,
    scriptJson: pautaJson(), deliverableId: null, mediaUrl: "https://x/1.png", status: "draft",
  });
  posts.push({
    id: "sp2", workspaceId: WS, clientId: CLIENTE, caption: "Bolo de fubá do fim de semana.",
    format: "feed", pillar: "bastidores", artDirection: null, scheduledFor,
    scriptJson: pautaJson(), deliverableId: null, mediaUrl: "https://x/2.png", status: "revision_requested",
  });
}

describe("ajuste num card de semana — regenera SÓ a peça apontada", () => {
  it("mira a segunda peça: só sp2 é regenerada, sp1 fica intacta", async () => {
    // Semana bem à frente — geração ainda não chegou, não travada.
    const FUTURO = new Date("2026-12-08T13:00:00.000Z");
    duasPecasDaSemana(FUTURO);
    generate.mockImplementation(() => gerarLegenda("Bolo de fubá quentinho, saindo agora do forno."));

    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE,
      department: "social-media",
      comentario: "a segunda peça está sem graça, deixa mais apetitosa",
      postIds: ["sp1", "sp2"],
      agora: new Date("2026-09-27T12:00:00.000Z"),
    });

    expect(r.refeitas).toEqual(["sp2"]);
    expect(r.escalado).toBe(false);
    // `finalizarUmPost` (`semana-editorial.ts:legendaFinal`) sempre anexa as
    // hashtags devolvidas pela IA à legenda final — mesmo comportamento do
    // gerador do calendário (`calendario-editorial.ts:comHashtags`). O mock
    // `gerarLegenda` devolve `hashtags: ["padaria"]`, então o texto gravado
    // TEM de trazer "#padaria" no fim; o teste, não o código, esquecia disso.
    expect(posts.find((p) => p.id === "sp2")!.caption).toBe("Bolo de fubá quentinho, saindo agora do forno.\n\n#padaria");
    // A NÃO apontada não muda — nem o texto, nem o estado.
    expect(posts.find((p) => p.id === "sp1")!.caption).toBe("Pão fresquinho toda manhã.");
    // Volta a ser decidível.
    expect(posts.find((p) => p.id === "sp2")!.status).toBe("draft");
  });

  it("peça SEM deliverableId mas SEM o marcador do calendário NÃO é card de semana — nada aqui regenera", async () => {
    // Fronteira que evita a colisão com `o-ajuste-alcanca-a-arte.test.ts`: uma
    // peça de PROJETO cujo `deliverableId` só não foi gravado (dado
    // incompleto) não pode ser confundida com uma peça do calendário — o
    // sinal é POSITIVO (o carimbo), nunca a mera ausência do FK.
    const FUTURO = new Date("2026-12-08T13:00:00.000Z");
    posts.push({
      id: "sp-projeto", workspaceId: WS, clientId: CLIENTE, caption: "Texto de uma entrega qualquer",
      format: "feed", pillar: "bastidores", artDirection: null, scheduledFor: FUTURO,
      scriptJson: null, deliverableId: null, mediaUrl: null, status: "revision_requested",
    });
    generate.mockImplementation(() => gerarLegenda("NUNCA deveria sair por este caminho."));

    await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "ajusta o texto",
      postIds: ["sp-projeto"], agora: new Date("2026-09-27T12:00:00.000Z"),
    });

    // Nem regenerado por este caminho novo, nem `RefacaoDaPeca` nenhuma.
    expect(posts.find((p) => p.id === "sp-projeto")!.caption).toBe("Texto de uma entrega qualquer");
    expect(refacoes).toEqual([]);
  });

  // ── ACHADO 2, Q4-QUALIDADE (27/09/2026) ───────────────────────────────────
  // Antes: sem mira caía no fallback herdado do `Deliverable` e regenerava as
  // DUAS peças — o "lote inteiro" que a ordem do CEO (item d) proíbe. Aqui a
  // unidade é o POST individual, caro e publicado: sem mira clara, a máquina
  // PERGUNTA, nunca regenera.
  it("sem mira (nem ordinal, nem dia/data) — NÃO regenera nada, pergunta ao cliente e escala para a equipe", async () => {
    const FUTURO = new Date("2026-12-08T13:00:00.000Z");
    duasPecasDaSemana(FUTURO);
    generate.mockImplementation(() => gerarLegenda("NUNCA deveria sair — sem mira."));

    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "está tudo meio sem graça",
      postIds: ["sp1", "sp2"], agora: new Date("2026-09-27T12:00:00.000Z"),
    });

    expect(r.refeitas).toEqual([]);
    expect(r.escalado).toBe(true);
    expect(r.motivo).toContain("sem mira clara");
    expect(generate).not.toHaveBeenCalled();
    expect(produzirArtesPendentes).not.toHaveBeenCalled();
    // Nenhuma peça tocada.
    expect(posts.find((p) => p.id === "sp1")!.caption).toBe("Pão fresquinho toda manhã.");
    expect(posts.find((p) => p.id === "sp2")!.caption).toBe("Bolo de fubá do fim de semana.");
    // A equipe foi avisada, e o cliente recebeu a pergunta no portal.
    expect(db.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "refacao_escalada" }) }),
    );
    expect(db.portalMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: expect.stringContaining("Qual peça") }) }),
    );
  });

  // ── A MIRA POR DIA DA SEMANA — a outra metade do achado 2: sem ordinal,
  // mas com um dia claro, ainda regenera SÓ a peça certa. ───────────────────
  it('mira por dia da semana ("a de sexta") — regenera só a peça daquele dia', async () => {
    // 11/12/2026 é sexta-feira (13:00 UTC = 10:00 Brasília, mesmo dia civil).
    const SEXTA = new Date("2026-12-11T13:00:00.000Z");
    const SABADO = new Date("2026-12-12T13:00:00.000Z");
    posts.push({
      id: "sp1", workspaceId: WS, clientId: CLIENTE, caption: "Pão fresquinho toda manhã.",
      format: "feed", pillar: "bastidores", artDirection: null, scheduledFor: SEXTA,
      scriptJson: pautaJson(), deliverableId: null, mediaUrl: "https://x/1.png", status: "draft",
    });
    posts.push({
      id: "sp2", workspaceId: WS, clientId: CLIENTE, caption: "Bolo de fubá do fim de semana.",
      format: "feed", pillar: "bastidores", artDirection: null, scheduledFor: SABADO,
      scriptJson: pautaJson(), deliverableId: null, mediaUrl: "https://x/2.png", status: "revision_requested",
    });
    generate.mockImplementation(() => gerarLegenda("Pão quentinho, saindo do forno agora."));

    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "muda a legenda da peça de sexta",
      postIds: ["sp1", "sp2"], agora: new Date("2026-09-27T12:00:00.000Z"),
    });

    expect(r.refeitas).toEqual(["sp1"]);
    expect(posts.find((p) => p.id === "sp2")!.caption).toBe("Bolo de fubá do fim de semana.");
  });
});

describe("card de semana + LIMITE — conta no limite depois da trava e não conta antes", () => {
  it("ANTES da trava: regenera, registra RefacaoDaPeca com contaNoLimite:false, nunca recusa", async () => {
    // 19/12/2026 é sábado — semana 14 a 20/12, gerada só na quinta 10/12 10h BRT.
    // `agora` (27/09) é MUITO antes disso: não travada.
    const scheduledFor = new Date("2026-12-19T13:00:00.000Z");
    duasPecasDaSemana(scheduledFor);
    generate.mockImplementation(() => gerarLegenda("Nova legenda, ainda dentro da janela colaborativa."));

    const agora = new Date("2026-09-27T12:00:00.000Z");
    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "a segunda peça precisa de outro texto",
      postIds: ["sp1", "sp2"], agora,
    });

    expect(r.refeitas).toEqual(["sp2"]);
    expect(refacoes).toHaveLength(1);
    expect(refacoes[0]!.contaNoLimite).toBe(false);
  });

  it("DEPOIS da trava, dentro do limite: regenera e registra contaNoLimite:true", async () => {
    // Semana de 06 a 12/10/2026, gerada na quinta 01/10 10h BRT (13:00Z).
    const scheduledFor = new Date("2026-10-06T13:00:00.000Z");
    duasPecasDaSemana(scheduledFor);
    generate.mockImplementation(() => gerarLegenda("Ajustado como pedido, depois da trava."));

    // Bem depois da geração — travada.
    const agora = new Date("2026-10-02T12:00:00.000Z");
    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "a segunda peça precisa de outro texto",
      postIds: ["sp1", "sp2"], agora,
    });

    expect(r.refeitas).toEqual(["sp2"]);
    expect(refacoes).toHaveLength(1);
    expect(refacoes[0]!.contaNoLimite).toBe(true);
    expect(refacoes[0]!.mesReferencia).toBe("2026-10");
  });

  it("DEPOIS da trava, limite ESTOURADO: NÃO regenera, avisa a frase exata, escala para a equipe", async () => {
    const scheduledFor = new Date("2026-10-06T13:00:00.000Z");
    duasPecasDaSemana(scheduledFor);
    db.client.findUnique.mockResolvedValue({
      id: CLIENTE, name: "Padaria do João", workspaceId: WS,
      createdAt: new Date("2026-01-01T00:00:00.000Z"), limiteRefacoesMes: 1,
    });
    // Já usou a única refação do mês.
    refacoes.push({
      workspaceId: WS, clientId: CLIENTE, socialPostId: "sp-outra", motivo: "x",
      origem: "cliente_portal", contaNoLimite: true, mesReferencia: "2026-10",
    });
    generate.mockImplementation(() => gerarLegenda("NUNCA deveria sair — limite estourado."));

    const agora = new Date("2026-10-02T12:00:00.000Z");
    const r = await refazerPorPedidoDoCliente({
      clientId: CLIENTE, department: "social-media", comentario: "a segunda peça precisa de outro texto",
      postIds: ["sp1", "sp2"], agora,
    });

    expect(r.refeitas).toEqual([]);
    expect(r.escalado).toBe(true);
    expect(r.motivo).toBe(FRASE_LIMITE_ESTOURADO_AO_CLIENTE);
    expect(r.parada?.causa).toBe("teto_de_refacoes");
    // A peça NÃO foi tocada.
    expect(posts.find((p) => p.id === "sp2")!.caption).toBe("Bolo de fubá do fim de semana.");
    // A equipe foi avisada.
    expect(db.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "limite_de_refacoes_estourado" }) }),
    );
    // Nada cobrado automaticamente — nenhum registro NOVO de refação.
    expect(refacoes).toHaveLength(1);
  });
});
