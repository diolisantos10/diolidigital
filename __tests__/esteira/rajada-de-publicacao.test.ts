// A RAJADA — seis peças no mesmo minuto, no perfil de um cliente.
//
// O cenário é o do CityJobs, medido: 6 peças em `scheduled` com data JÁ
// VENCIDA, `MAX_PUBLICACOES_POR_RODADA = 10`, e o relógio batendo de 5 em 5
// minutos. No instante em que o freio de plataforma for solto, as 6 sairiam
// juntas — e ninguém pediu isso.
//
// O que este arquivo prende:
//   ⛔ seis peças vencidas do MESMO perfil não saem na mesma rodada;
//   ✅ e as que ficaram aparecem em `adiados`, com motivo — fila parada tem
//      testemunha, e adiado NÃO vira `lastError` vermelho na ficha da peça;
//   ✅ perfis diferentes não se atrapalham (o freio é POR PERFIL);
//   ✅ a publicação manual, registrada à mão, também segura o relógio;
//   ⛔ não conseguir MEDIR a última publicação não vira permissão (fail-closed);
//   ⛔ nada aqui mexe no freio de plataforma (`PUBLICACAO_ORGANICA`).

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  // 27/09/2026 — IDEMPOTÊNCIA: `updateMany` é a reserva atômica logo antes de
  // `publishPost`. Sem este mock, a peça que o freio deixa passar quebraria a
  // suíte inteira com "updateMany is not a function".
  // W11 (27/09/2026): a RAMPA da primeira semana de story mede `count()`
  // (quantos stories já saíram hoje). Sem este mock, todo teste de story
  // quebraria com "count is not a function" — mesma lição do `updateMany`
  // acima. `findUnique` é o dublê da checagem de STORY DERIVADO (o pai da
  // peça) — nenhum teste deste arquivo declara `scriptJson`, então
  // `lerDependenciaDoStory` devolve `null` e este mock nunca é chamado aqui.
  socialPost: {
    findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
    update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
  },
  // W9 (27/09/2026): o freio de STORY lê `Client.pacoteJson` (intervalo
  // declarado pela marca). Sem este mock, qualquer post de formato "story"
  // quebraria a suíte com "findUnique is not a function".
  client: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
}));
const publishPost = vi.hoisted(() => vi.fn());
const conexaoDoCliente = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
// W9: a última porta ("promoção só em stories", W8) — aqui só se prova que
// `publicarAgendados` CHAMA a régua e RESPEITA o veredito; a régua em si
// (o que conta como promoção) tem suíte própria no arquivo do W8.
const conferirPromocaoNoFormato = vi.hoisted(() => vi.fn(
  (a: { formato: string; texto: string }): { passa: true } | { passa: false; motivo: string } => ({ passa: true }),
));
// W9: `lerPacote` real vive em `pacote-da-marca.ts` (W8 estende o schema com
// `stories.intervaloMinimoMin`); aqui se mocka para não depender da ordem de
// chegada dos dois despachos — só se prova a LEITURA que `publicacao.ts` faz.
const lerPacote = vi.hoisted(() => vi.fn(
  (pacoteJson: string | null | undefined):
    | { ok: true; pacote: { stories?: { intervaloMinimoMin: number } } }
    | { ok: false; motivo: string } => {
    if (!pacoteJson) return { ok: false, motivo: "preciso do pacote da marca — ausente" };
    try {
      return { ok: true, pacote: JSON.parse(pacoteJson) };
    } catch {
      return { ok: false, motivo: "preciso do pacote da marca — JSON inválido" };
    }
  },
));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
vi.mock("@/lib/agency/esteira/promocao-so-em-stories", () => ({ conferirPromocaoNoFormato }));
vi.mock("@/lib/agency/esteira/pacote-da-marca", () => ({ lerPacote }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}?exp=1&sig=abc`,
}));

import {
  publicarAgendados, faltaEsperar, intervaloDoFormato, INTERVALO_MINIMO_POR_PERFIL_MS,
} from "@/lib/agency/esteira/publicacao";

const ONTEM = new Date(Date.now() - 24 * 60 * 60_000);

/** As 6 do CityJobs: mesmo cliente, todas vencidas, todas prontas. */
function seisVencidasDoMesmoPerfil() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `sp${i + 1}`, workspaceId: "ws1", clientId: "cityjobs",
    caption: `Peça ${i + 1}`, format: "feed", pillar: null,
    mediaUrl: "/api/media/m1", mediaUrlsJson: "[]",
    scheduledFor: new Date(ONTEM.getTime() + i * 60_000), status: "scheduled", lastError: null,
  }));
}

/** Um story pendente, pronto para publicar — mesmo molde das 6 do CityJobs,
 *  formato "story" e perfil próprio (Sushi Cazza é o cliente medido). */
function storyPendente(overrides: Record<string, unknown> = {}) {
  return {
    id: "st1", workspaceId: "ws1", clientId: "sushicazza",
    caption: "Bastidor de hoje na cozinha.", format: "story", pillar: null,
    mediaUrl: "/api/media/m1", mediaUrlsJson: "[]",
    scheduledFor: new Date(Date.now() - 5 * 60_000), status: "scheduled", lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.dioli.studio";
  contratoDeMarca.mockResolvedValue({ texto: "x", marcaVersao: "mv1", lacunas: [], cortado: [], naoConstituida: false });
  conexaoDoCliente.mockResolvedValue({ id: "mc1", status: "connected" });
  db.mediaAsset.findMany.mockImplementation(async (args?: { where?: { id?: { in?: string[] } } }) =>
    (args?.where?.id?.in ?? []).map((id) => ({ id, mimeType: "image/jpeg" })));
  db.socialPost.findMany.mockResolvedValue(seisVencidasDoMesmoPerfil());
  // Nunca publicou antes: a primeira peça pode ir.
  db.socialPost.findFirst.mockResolvedValue(null);
  db.socialPost.update.mockResolvedValue({});
  db.socialPost.updateMany.mockResolvedValue({ count: 1 });
  db.activityEvent.create.mockResolvedValue({});
  // Sem pacote por padrão: quem quiser um pacote com regra de stories declara
  // por teste — o caso limpo é "marca não disse nada" (fail-closed → 30 min).
  db.client.findUnique.mockResolvedValue(null);
  // W11: nenhum story publicado hoje por padrão — a rampa da primeira semana
  // (teto 3/dia) nunca barra sozinha um teste que não é sobre ela.
  db.socialPost.count.mockResolvedValue(0);
  db.socialPost.findUnique.mockResolvedValue(null);
  publishPost.mockResolvedValue({ ok: true, externalPostId: "ig1", permalink: "https://i/p/1" });
});

describe("a régua do espaçamento", () => {
  it("perfil que nunca publicou não espera nada", () => {
    expect(faltaEsperar(null, new Date())).toBe(0);
  });

  it("publicou agora: espera quase o intervalo inteiro", () => {
    const agora = new Date("2026-08-15T12:00:00Z");
    expect(faltaEsperar(agora, agora)).toBe(INTERVALO_MINIMO_POR_PERFIL_MS);
  });

  it("passou o intervalo: libera", () => {
    const agora = new Date("2026-08-15T12:00:00Z");
    const antes = new Date(agora.getTime() - INTERVALO_MINIMO_POR_PERFIL_MS);
    expect(faltaEsperar(antes, agora)).toBe(0);
  });

  it("data de publicação NO FUTURO (relógio torto) erra para o lado seguro", () => {
    const agora = new Date("2026-08-15T12:00:00Z");
    const depois = new Date(agora.getTime() + 60 * 60_000);
    expect(faltaEsperar(depois, agora)).toBe(INTERVALO_MINIMO_POR_PERFIL_MS);
  });

  it("o intervalo é MENOR que as 24h que o calendário já garante — o freio não vira dono da agenda", () => {
    expect(INTERVALO_MINIMO_POR_PERFIL_MS).toBeLessThan(24 * 60 * 60_000);
    expect(INTERVALO_MINIMO_POR_PERFIL_MS).toBeGreaterThan(30 * 60_000);
  });
});

describe("a rodada", () => {
  it("as 6 vencidas do mesmo perfil NÃO saem juntas — uma sai, cinco esperam", async () => {
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(r.adiados).toHaveLength(5);
    expect(r.falhas).toHaveLength(0);
  });

  it("a que saiu é a MAIS ANTIGA — a fila não vira sorteio", async () => {
    await publicarAgendados();
    expect(db.socialPost.update.mock.calls[0]![0].where.id).toBe("sp1");
  });

  it("adiar NÃO pinta a ficha da peça de vermelho", async () => {
    const r = await publicarAgendados();
    // Nenhum `lastError` gravado, nenhum evento de falha: adiado não é falha.
    const escritas = db.socialPost.update.mock.calls.map((c) => c[0].data);
    expect(escritas.filter((d: Record<string, unknown>) => "lastError" in d && d.lastError)).toHaveLength(0);
    const eventos = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventos).not.toContain("publicacao_falhou");
    // Mas o motivo existe e é legível.
    expect(r.adiados[0]!.motivo).toMatch(/perfil|rajada/i);
  });

  it("perfis diferentes não se atrapalham — o freio é POR PERFIL", async () => {
    db.socialPost.findMany.mockResolvedValue([
      { ...seisVencidasDoMesmoPerfil()[0]!, id: "a1", clientId: "cliA" },
      { ...seisVencidasDoMesmoPerfil()[0]!, id: "b1", clientId: "cliB" },
      { ...seisVencidasDoMesmoPerfil()[0]!, id: "a2", clientId: "cliA" },
    ]);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(2);
    expect(r.adiados.map((a) => a.postId)).toEqual(["a2"]);
  });

  it("publicação de HOJE já no banco segura a próxima — inclusive a registrada à mão", async () => {
    // É o caso real do CityJobs: o CEO posta o carrossel com as próprias mãos,
    // registra, e o relógio não pode despejar a peça seguinte em cima.
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 10 * 60_000) });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados).toHaveLength(6);
    // E a medida é feita UMA vez por perfil, não seis.
    expect(db.socialPost.findFirst).toHaveBeenCalledTimes(1);
  });

  it("a medida procura publicação DE VERDADE, não peça agendada", async () => {
    await publicarAgendados();
    const where = db.socialPost.findFirst.mock.calls[0]![0].where;
    expect(where.clientId).toBe("cityjobs");
    expect(where.status).toBe("published");
  });

  it("não conseguir medir não vira permissão — fail-closed", async () => {
    db.socialPost.findFirst.mockRejectedValue(new Error("db down"));
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados[0]!.motivo).toContain("não consegui medir");
  });

  it("o freio corre ANTES de qualquer preparo — não gasta trabalho para jogar fora", async () => {
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date() });
    await publicarAgendados();
    expect(contratoDeMarca).not.toHaveBeenCalled();
    expect(conexaoDoCliente).not.toHaveBeenCalled();
    expect(db.mediaAsset.findMany).not.toHaveBeenCalled();
  });

  it("quem publica pelo relógio fica marcado como `esteira`", async () => {
    await publicarAgendados();
    expect(db.socialPost.update.mock.calls[0]![0].data.publishedBy).toBe("esteira");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W9 (27/09/2026) — O INTERVALO É POR FORMATO, NÃO SÓ POR PERFIL
// ─────────────────────────────────────────────────────────────────────────────
//
// A Sushi Cazza publica 6–8 stories por dia a partir das 18h. Com o freio de
// 2h medido só por perfil, o segundo story do dia sempre esperaria — a
// própria rotina do cliente estourando a régua que devia protegê-la de
// rajada, não de ritmo normal. `intervaloDoFormato` separa story do resto
// ("feed-família": feed, reel, carrossel) e story usa
// `pacote.stories.intervaloMinimoMin` (padrão 30 min quando o pacote não
// diz). Fail-closed: pacote ilegível também vira 30 min, nunca "sem freio".

describe("intervaloDoFormato — a régua pura", () => {
  it("feed, reel e carrossel usam sempre o intervalo fixo de perfil (2h), pacote ou não", () => {
    expect(intervaloDoFormato("feed", null)).toBe(INTERVALO_MINIMO_POR_PERFIL_MS);
    expect(intervaloDoFormato("reel", { stories: { intervaloMinimoMin: 5 } } as never)).toBe(INTERVALO_MINIMO_POR_PERFIL_MS);
    expect(intervaloDoFormato("carousel", null)).toBe(INTERVALO_MINIMO_POR_PERFIL_MS);
  });

  it("story sem pacote (ou pacote sem a regra) usa o padrão de 30 min", () => {
    expect(intervaloDoFormato("story", null)).toBe(30 * 60_000);
    expect(intervaloDoFormato("story", {} as never)).toBe(30 * 60_000);
  });

  it("story com pacote declarado usa O NÚMERO DA MARCA, não o padrão", () => {
    expect(intervaloDoFormato("story", { stories: { intervaloMinimoMin: 45 } } as never)).toBe(45 * 60_000);
  });
});

describe("a rodada respeita o intervalo por FAMÍLIA (feed vs. story)", () => {
  it("dois stories do mesmo perfil com 30 min de intervalo passam (padrão, sem pacote)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    // W11: `intervaloDoFormato` soma até 5 min de VARIAÇÃO determinística por
    // post ao mínimo — a margem aqui precisa cobrir o pior caso (30+5min),
    // não só o mínimo nominal, senão o teste fica refém do hash do postId.
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 40 * 60_000) });
    db.client.findUnique.mockResolvedValue(null); // sem pacote → padrão 30 min
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("com 10 min de intervalo, o segundo story espera (padrão de 30 min não bateu ainda)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 10 * 60_000) });
    db.client.findUnique.mockResolvedValue(null);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados[0]!.motivo).toMatch(/story/i);
  });

  it("story NÃO é freado por um feed publicado há 5 min — famílias não se atrapalham", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    // A busca da medida é por família: quando pergunta pela família STORY, não
    // existe nenhuma (perfil só publicou feed até agora); quando pergunta pela
    // família FEED, acha uma publicação recente. Simula as duas com o mesmo
    // mock, olhando o `where.format` que `publicacao.ts` monta.
    db.socialPost.findFirst.mockImplementation(async (args: { where: { format: unknown } }) =>
      args.where.format === "story" ? null : { publishedAt: new Date(Date.now() - 5 * 60_000) });
    db.client.findUnique.mockResolvedValue(null);
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  it("feed continua freado 2h por feed — mesmo com o pacote declarando story de 5 min", async () => {
    db.socialPost.findMany.mockResolvedValue(seisVencidasDoMesmoPerfil().slice(0, 1)); // format "feed"
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 10 * 60_000) });
    // Nem chega a ser consultado para feed, mas se fosse, não deveria mudar nada.
    db.client.findUnique.mockResolvedValue({ pacoteJson: JSON.stringify({ stories: { intervaloMinimoMin: 5 } }) });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
    expect(r.adiados[0]!.motivo).toMatch(/feed/i);
    // Feed nunca precisa olhar o pacote — só story paga essa leitura.
    expect(db.client.findUnique).not.toHaveBeenCalled();
  });

  it("pacote ilegível → 30 min para story (fail-closed, nunca 'sem freio')", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    // 20 min: passaria com um pacote de 5 min, mas NÃO passa com o padrão de
    // 30 — prova que o pacote quebrado caiu no padrão, e não em "sem limite".
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 20 * 60_000) });
    db.client.findUnique.mockResolvedValue({ pacoteJson: "{ isto não é json" });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("banco fora do ar ao ler o pacote também cai no padrão de 30 min (fail-closed)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 20 * 60_000) });
    db.client.findUnique.mockRejectedValue(new Error("db down"));
    const r = await publicarAgendados();
    expect(r.publicados).toBe(0);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("story respeita o número do pacote quando ele existe (não é sempre 30 min)", async () => {
    db.socialPost.findMany.mockResolvedValue([storyPendente()]);
    // Pacote diz 5 min; W11 soma até +5 min de variação determinística ao
    // mínimo — a margem cobre o pior caso (5+5min) para não depender do hash
    // do postId do dublê.
    db.socialPost.findFirst.mockResolvedValue({ publishedAt: new Date(Date.now() - 12 * 60_000) });
    db.client.findUnique.mockResolvedValue({ pacoteJson: JSON.stringify({ stories: { intervaloMinimoMin: 5 } }) });
    const r = await publicarAgendados();
    expect(r.publicados).toBe(1);
  });
});
