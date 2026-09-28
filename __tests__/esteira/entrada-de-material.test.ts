// entrada-de-material.test.ts — 1D-D1: por marca, upload + UMA FRASE vira
// peça no calendário, com prioridade.
//
// Módulos com efeito colateral pesado (`calendario-editorial.ts` de verdade,
// que puxa `contrato-de-marca`, `dna-da-marca`, `publicacao.ts`) são mockados
// exatamente como `calendario-editorial.test.ts` já faz — a mesma receita,
// para este arquivo não inventar uma segunda. `semana-editorial.ts` é
// mockado por INTEIRO com uma reprodução FIEL de `civilBrasilia`/
// `semanaTravada` (a mesma régua de `limite-de-refacoes-rota.test.ts`) — pegar
// o módulo de verdade puxaria `execution/artes.ts`, `modo-de-aprovacao.ts` e
// `cards-de-aprovacao.ts`, árvore pesada demais para este teste precisar.
//
// Mocks TIPADOS (regra do CLAUDE.md): `vi.hoisted(() => vi.fn())` sem
// assinatura quebra `tsc --noEmit` mesmo com o teste verde — todo
// `.mockImplementation`/`.mockResolvedValue` abaixo anota o retorno.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";

// ─── Fixtures em memória ─────────────────────────────────────────────────────

interface LinhaDeEntrada {
  id: string;
  workspaceId: string;
  clientId: string;
  frase: string;
  interpretacaoJson: string | null;
  mediaAssetIdsJson: string;
  socialPostIdsJson: string;
  status: string;
  motivo: string | null;
}

interface LinhaDePost {
  id: string;
  clientId: string;
  status: string;
  scheduledFor: Date | null;
  scriptJson: string | null;
  format: string;
  caption: string;
}

let entradas: Record<string, LinhaDeEntrada> = {};
let posts: LinhaDePost[] = [];
let contadorDePost = 0;
let clientePacoteJson: string | null = null;
/** Capturado em vez de lido de `mock.calls[i][0]` — indexar `.mock.calls`
 *  num `vi.fn()` sem assinatura própria infere `never`/tupla vazia nesta
 *  casa (regra do CLAUDE.md: mock sem forma quebra `tsc --noEmit` mesmo com
 *  o teste verde). Capturar no próprio `mockImplementation`, já tipado,
 *  evita o problema pela raiz. */
let refacoesRegistradas: Array<{ socialPostId: string; motivo: string; contaNoLimite: boolean }> = [];

const db = vi.hoisted(() => ({
  entradaDeMaterial: { findFirst: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
  socialPost: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
  refacaoDaPeca: { create: vi.fn() },
}));

interface RespostaDaIaCrua {
  intencao: string;
  resumo: string;
  horarioAlvo: string | null;
  formatos: string[];
  quantidade: number;
  /** Só nos testes de "a IA nunca decide a data" — campo que o contrato nem
   *  pede, para provar que ele é ignorado mesmo se algum provedor o mandar. */
  dataAlvo?: string;
  dataAmbigua?: boolean;
}

const generate = vi.hoisted(() =>
  vi.fn(
    async (): Promise<
      | { ok: true; data: RespostaDaIaCrua; model: string; provider: "claude" }
      | { ok: false; error: string }
    > => ({ ok: false, error: "generate não configurado neste teste" }),
  ),
);
const contratoDeMarca = vi.hoisted(() => vi.fn());
const dnaVigente = vi.hoisted(() => vi.fn(async (): Promise<{ versao: number; conteudo: unknown } | null> => null));
const proximaDataLivre = vi.hoisted(() => vi.fn());
const finalizarPecasNaJanela = vi.hoisted(() => vi.fn());
const abrirCardDoPeriodo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
vi.mock("@/lib/agency/esteira/dna-da-marca", () => ({ dnaVigente }));
// `normalizarFormato` reproduzida — a MESMA razão de `calendario-editorial.test.ts`:
// `promocao-so-em-stories.ts` a importa daqui para decidir a trava de
// PROMOÇÃO SÓ EM STORIES; mock sem ela quebraria a cadeia real com
// "not a function".
vi.mock("@/lib/agency/esteira/publicacao", () => {
  const normalizarFormato = (f: string): "feed" | "reel" | "story" | "carousel" => {
    if (f === "reel" || f === "video") return "reel";
    if (f === "story") return "story";
    if (f === "carousel" || f === "carrossel") return "carousel";
    return "feed";
  };
  // `intervaloDoFormato` reproduzida fielmente (a mesma razão de
  // `normalizarFormato`, logo acima): a régua de MÚLTIPLAS PEÇAS
  // (`entrada-de-material.ts:706`) usa esta função de verdade para nunca
  // empilhar duas peças no mesmo horário, e os testes de "quantidade N"
  // conferem a distância real entre os slots — um `vi.fn()` sem forma devolveria
  // sempre o mesmo intervalo (ou `undefined`), e os horários colidiriam.
  const intervaloDoFormato = (
    formato: string,
    pacote: PacoteDaMarca | null,
    postId?: string,
  ): number => {
    const DUAS_HORAS_MS = 2 * 60 * 60_000;
    if (normalizarFormato(formato) !== "story") return DUAS_HORAS_MS;
    const declarado = pacote?.stories?.intervaloMinimoMin;
    const minutos =
      typeof declarado === "number" && Number.isFinite(declarado) && declarado > 0
        ? declarado
        : 30;
    let variacao = 0;
    if (postId) {
      let h = 0;
      for (let i = 0; i < postId.length; i++) h = (h * 31 + postId.charCodeAt(i)) >>> 0;
      variacao = h % 6;
    }
    return (minutos + variacao) * 60_000;
  };
  return {
    proximaDataLivre,
    HORA_PADRAO: 10,
    normalizarFormato,
    intervaloDoFormato,
  };
});
// `semana-editorial.ts` MOCKADO POR INTEIRO — `civilBrasilia`/`semanaTravada`
// reproduzidos fielmente (a mesma lógica do arquivo real), para os testes de
// "semana travada" continuarem provando a régua de verdade sem puxar
// `execution/artes.ts`/`modo-de-aprovacao.ts`/`cards-de-aprovacao.ts`.
vi.mock("@/lib/agency/esteira/semana-editorial", () => {
  const HORA_MS = 60 * 60_000;
  const DIA_MS = 24 * HORA_MS;
  const OFFSET_BRASILIA_MS = 3 * HORA_MS;
  function civilBrasilia(agora: Date): { ano: number; mesIndex: number; dia: number; diaDaSemana: number; hora: number } {
    const brt = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
    return {
      ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate(),
      diaDaSemana: brt.getUTCDay(), hora: brt.getUTCHours(),
    };
  }
  function semanaTravada(post: { scheduledFor: Date | null }, agora: Date): boolean {
    if (!post.scheduledFor) return false;
    const c = civilBrasilia(post.scheduledFor);
    const diasDesdeSegunda = (c.diaDaSemana + 6) % 7;
    const segundaDaSemanaUtc = Date.UTC(c.ano, c.mesIndex, c.dia - diasDesdeSegunda, 3, 0, 0, 0);
    const geracaoQuinta10hUtc = segundaDaSemanaUtc - 4 * DIA_MS + 10 * HORA_MS;
    return agora.getTime() >= geracaoQuinta10hUtc;
  }
  return { civilBrasilia, semanaTravada, finalizarPecasNaJanela, abrirCardDoPeriodo };
});

import {
  InterpretacaoSchema,
  dataDaFraseDeterministica,
  interpretarFrase,
  encaixarNoCalendario,
  entradaExistenteParaMedia,
  type Interpretacao,
  type MidiaDaEntrada,
} from "@/lib/agency/esteira/entrada-de-material";

const WORKSPACE_ID = "ws1";
const CLIENT_ID = "cli1";

function pacotePadrao(overrides: Partial<PacoteDaMarca> = {}): PacoteDaMarca {
  return {
    postsPorDia: 1,
    postsPorSemana: 3,
    formatos: ["feed_imagem"],
    dias: [1, 3, 5],
    horarios: ["10:00"],
    pilares: [{ nome: "lancamento", peso: 1 }],
    ...overrides,
  };
}

function fixturaInterpretacao(overrides: Partial<Interpretacao> = {}): Interpretacao {
  return InterpretacaoSchema.parse({
    intencao: "lancamento",
    resumo: "Lançamento da nova coleção.",
    dataAlvo: "2026-10-15",
    horarioAlvo: null,
    dataAmbigua: false,
    motivoDaAmbiguidade: null,
    formatos: ["feed_imagem"],
    quantidade: 1,
    ...overrides,
  });
}

function novaEntrada(overrides: Partial<LinhaDeEntrada> = {}): LinhaDeEntrada {
  return {
    id: "ent1",
    workspaceId: WORKSPACE_ID,
    clientId: CLIENT_ID,
    frase: "Lançamento da coleção nova, postar dia 15/10.",
    interpretacaoJson: JSON.stringify(fixturaInterpretacao()),
    mediaAssetIdsJson: JSON.stringify(["med_1"]),
    socialPostIdsJson: "[]",
    status: "interpretada",
    motivo: null,
    ...overrides,
  };
}

beforeEach(() => {
  entradas = {};
  posts = [];
  contadorDePost = 0;
  clientePacoteJson = JSON.stringify(pacotePadrao());
  refacoesRegistradas = [];
  vi.clearAllMocks();

  db.entradaDeMaterial.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId: string; clientId: string } }): Promise<LinhaDeEntrada | null> =>
      entradas[where.id] && entradas[where.id]!.workspaceId === where.workspaceId && entradas[where.id]!.clientId === where.clientId
        ? entradas[where.id]!
        : null,
  );
  db.entradaDeMaterial.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<LinhaDeEntrada> }): Promise<LinhaDeEntrada> => {
      const atual = entradas[where.id]!;
      const atualizada = { ...atual, ...data };
      entradas[where.id] = atualizada;
      return atualizada;
    },
  );
  db.client.findUnique.mockImplementation(
    async (): Promise<{ pacoteJson: string | null }> => ({ pacoteJson: clientePacoteJson }),
  );
  db.socialPost.findFirst.mockImplementation(
    async ({ where }: { where: { clientId: string; scheduledFor: Date } }): Promise<LinhaDePost | null> =>
      posts.find((p) => p.clientId === where.clientId && p.scheduledFor?.getTime() === where.scheduledFor.getTime()) ?? null,
  );
  db.socialPost.create.mockImplementation(
    async ({ data }: { data: Partial<LinhaDePost> }): Promise<LinhaDePost> => {
      contadorDePost += 1;
      const novo: LinhaDePost = {
        id: `sp${contadorDePost}`,
        clientId: data.clientId as string,
        status: (data.status as string) ?? "draft",
        scheduledFor: (data.scheduledFor as Date) ?? null,
        scriptJson: (data.scriptJson as string) ?? null,
        format: (data.format as string) ?? "feed",
        caption: (data.caption as string) ?? "",
      };
      posts.push(novo);
      return novo;
    },
  );
  db.socialPost.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<LinhaDePost> }): Promise<LinhaDePost> => {
      const i = posts.findIndex((p) => p.id === where.id);
      posts[i] = { ...posts[i]!, ...data };
      return posts[i]!;
    },
  );
  db.activityEvent.create.mockResolvedValue({});
  db.refacaoDaPeca.create.mockImplementation(
    async ({ data }: { data: { socialPostId: string; motivo: string; contaNoLimite: boolean } }): Promise<Record<string, never>> => {
      refacoesRegistradas.push(data);
      return {};
    },
  );
  proximaDataLivre.mockResolvedValue(new Date("2026-11-02T13:00:00.000Z"));
  finalizarPecasNaJanela.mockResolvedValue({
    clientesProcessados: 1, postsFinalizados: 1, falhas: [], finalizadosPorCliente: new Map(),
  });
  abrirCardDoPeriodo.mockResolvedValue("card aberto");
});

// ═════════════════════════════════════════════════════════════════════════
// dataDaFraseDeterministica — a DATA nunca vem da IA
// ═════════════════════════════════════════════════════════════════════════

describe("dataDaFraseDeterministica", () => {
  const hoje = new Date("2026-09-28T12:00:00.000Z"); // segunda-feira, 28/09/2026

  it("data explícita futura (DD/MM) vira confirmada", () => {
    const v = dataDaFraseDeterministica("Lançamento, postar dia 15/10.", hoje);
    expect(v).toEqual({ tipo: "confirmada", data: "2026-10-15" });
  });

  it("data explícita ISO futura vira confirmada", () => {
    const v = dataDaFraseDeterministica("Lançamento, postar em 2026-10-15.", hoje);
    expect(v).toEqual({ tipo: "confirmada", data: "2026-10-15" });
  });

  it('"sexta" (dia da semana relativo) é sempre ambígua', () => {
    const v = dataDaFraseDeterministica("Lançamento, postar sexta.", hoje);
    expect(v.tipo).toBe("ambigua");
    if (v.tipo === "ambigua") expect(v.motivo).toMatch(/sexta/);
  });

  it("data explícita no passado é ambígua", () => {
    const v = dataDaFraseDeterministica("Lançamento, postar dia 10/01.", hoje);
    expect(v.tipo).toBe("ambigua");
    if (v.tipo === "ambigua") expect(v.motivo).toMatch(/já passou/);
  });

  it("data que não existe no calendário (31/02) é ambígua", () => {
    const v = dataDaFraseDeterministica("Lançamento, postar dia 31/02.", hoje);
    expect(v.tipo).toBe("ambigua");
    if (v.tipo === "ambigua") expect(v.motivo).toMatch(/não existe/);
  });

  it("frase sem nenhuma referência de data é sem_data", () => {
    const v = dataDaFraseDeterministica("Lançamento da coleção nova.", hoje);
    expect(v).toEqual({ tipo: "sem_data" });
  });
});

// ═════════════════════════════════════════════════════════════════════════
// interpretarFrase
// ═════════════════════════════════════════════════════════════════════════

describe("interpretarFrase", () => {
  const hoje = new Date("2026-09-28T12:00:00.000Z");
  const midias: MidiaDaEntrada[] = [{ mime: "image/jpeg" }];

  it("frase com data clara → dataAlvo preenchido, não ambígua", async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["feed_imagem"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje, midias,
      frase: "Lançamento da coleção nova, postar dia 15/10.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAlvo).toBe("2026-10-15");
      expect(r.interpretacao.dataAmbigua).toBe(false);
    }
  });

  it('"sexta" ambígua → dataAmbigua true, dataAlvo nulo', async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["feed_imagem"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje, midias,
      frase: "Lançamento da coleção nova, postar sexta.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAmbigua).toBe(true);
      expect(r.interpretacao.dataAlvo).toBeNull();
      expect(r.interpretacao.motivoDaAmbiguidade).toMatch(/sexta/);
    }
  });

  it("data no passado → dataAmbigua true", async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["feed_imagem"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje, midias,
      frase: "Lançamento da coleção nova, postar dia 10/01.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAmbigua).toBe(true);
      expect(r.interpretacao.dataAlvo).toBeNull();
      expect(r.interpretacao.motivoDaAmbiguidade).toMatch(/já passou/);
    }
  });

  it('a IA devolvendo "dataAlvo" (campo que ela nem deveria ter) é ignorado — a data final é sempre a determinística', async () => {
    // Simula um provedor "malcriado" que devolve um campo extra de data,
    // fora do que `PecaBrutaSchema` pede — o código nunca lê `dados.dataAlvo`.
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: {
        intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null,
        formatos: ["feed_imagem"], quantidade: 1, dataAlvo: "2099-01-01", dataAmbigua: false, // ← devia ser ignorado
      },
    });
    const r1 = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje, midias,
      frase: "Lançamento da coleção nova, postar dia 15/10.",
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.interpretacao.dataAlvo).toBe("2026-10-15");

    // E quando a frase NÃO tem data reconhecível ("sexta" é ambígua), a
    // opinião da IA sobre uma data específica é RECUSADA — a entrada some,
    // nunca vira a data que a IA chutou.
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: {
        intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null,
        formatos: ["feed_imagem"], quantidade: 1, dataAlvo: "2099-01-01", dataAmbigua: false,
      },
    });
    const r2 = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje, midias,
      frase: "Lançamento da coleção nova, postar sexta.",
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.interpretacao.dataAlvo).toBeNull();
      expect(r2.interpretacao.dataAmbigua).toBe(true);
    }
  });

  it('"reels" sem vídeo vira ambígua (problema de formato)', async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["reels"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje,
      midias: [{ mime: "image/jpeg" }],
      frase: "Lançamento da coleção nova, postar dia 15/10.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAmbigua).toBe(true);
      expect(r.interpretacao.motivoDaAmbiguidade).toMatch(/vídeo/);
    }
  });

  // As DUAS metades do achado da `qualidade` (D5, 28/09/2026): vídeo do Drive
  // vira "reels" sem NUNCA conferir duração (`vigia-da-entrada.ts` não media
  // os bytes já baixados). O conserto mede a duração e passa `duracaoS` aqui
  // — estes dois testes provam que, DADA a duração, esta função (usada por
  // upload E por Drive) decide certo nas duas metades.
  it('"reels" com vídeo LONGO (duração conhecida) vira ambígua — não vira reels sem checar', async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["reels"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje,
      midias: [{ mime: "video/mp4", duracaoS: 600 }],
      frase: "Lançamento da coleção nova, postar dia 15/10.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAmbigua).toBe(true);
      expect(r.interpretacao.motivoDaAmbiguidade).toMatch(/segundos/);
    }
  });

  it('"reels" com vídeo CURTO, dentro do intervalo (duração conhecida) vira reels de verdade', async () => {
    generate.mockResolvedValueOnce({
      ok: true, model: "m", provider: "claude",
      data: { intencao: "lancamento", resumo: "Chegou a coleção nova!", horarioAlvo: null, formatos: ["reels"], quantidade: 1 },
    });
    const r = await interpretarFrase({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, hoje,
      midias: [{ mime: "video/mp4", duracaoS: 20 }],
      frase: "Lançamento da coleção nova, postar dia 15/10.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.interpretacao.dataAmbigua).toBe(false);
      expect(r.interpretacao.formatos).toEqual(["reels"]);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// entradaExistenteParaMedia — a mesma mídia não vira duas entradas
// ═════════════════════════════════════════════════════════════════════════

describe("entradaExistenteParaMedia", () => {
  it("encontra a entrada existente pelo MESMO MediaAsset (substring com aspas, não o id cru)", async () => {
    db.entradaDeMaterial.findFirst.mockResolvedValue({ id: "ent-ja-existe" } as unknown as LinhaDeEntrada);
    const r = await entradaExistenteParaMedia({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mediaAssetId: "med_1" });
    expect(r).toEqual({ id: "ent-ja-existe" });
    expect(db.entradaDeMaterial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: WORKSPACE_ID, clientId: CLIENT_ID,
          mediaAssetIdsJson: { contains: '"med_1"' },
        }),
      }),
    );
  });

  it("mídia nova (caso limpo): nenhuma entrada encontrada", async () => {
    db.entradaDeMaterial.findFirst.mockResolvedValue(null);
    const r = await entradaExistenteParaMedia({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mediaAssetId: "med_novo" });
    expect(r).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// encaixarNoCalendario
// ═════════════════════════════════════════════════════════════════════════

describe("encaixarNoCalendario", () => {
  const AGORA = new Date("2026-09-28T13:00:00.000Z"); // segunda-feira

  it("entrada ambígua não encaixa", async () => {
    entradas["ent1"] = novaEntrada({
      interpretacaoJson: JSON.stringify(fixturaInterpretacao({ dataAmbigua: true, motivoDaAmbiguidade: "preciso da data" })),
    });
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });
    expect(r.ok).toBe(false);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("sem pacote da marca não encaixa", async () => {
    clientePacoteJson = null;
    entradas["ent1"] = novaEntrada();
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/preciso do pacote da marca/);
  });

  it("slot livre — cria a peça no dia pedido", async () => {
    entradas["ent1"] = novaEntrada();
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.socialPostIds).toHaveLength(1);
      expect(r.deslocados).toEqual([]);
    }
    expect(posts).toHaveLength(1);
    expect(posts[0]!.scheduledFor?.toISOString()).toBe("2026-10-15T13:00:00.000Z");
    expect(posts[0]!.scriptJson).toContain("entrada-de-material");
    expect(entradas["ent1"]!.status).toBe("encaixada");
  });

  it("pauta deslocada — peça de calendário ainda não decidida cede o lugar", async () => {
    const alvo = new Date("2026-10-15T13:00:00.000Z");
    posts.push({
      id: "sp-pauta", clientId: CLIENT_ID, status: "draft", scheduledFor: alvo,
      scriptJson: '{"origemGerador":"calendario-editorial-v1","mes":"2026-10","fase":"pauta"}',
      format: "feed", caption: "rascunho antigo",
    });
    proximaDataLivre.mockResolvedValue(new Date("2026-11-02T13:00:00.000Z"));

    entradas["ent1"] = novaEntrada();
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.deslocados).toHaveLength(1);
      expect(r.deslocados[0]!.socialPostId).toBe("sp-pauta");
      expect(r.deslocados[0]!.novaData?.toISOString()).toBe("2026-11-02T13:00:00.000Z");
    }
    // a peça antiga foi REALMENTE movida, e a nova ocupa o slot pedido.
    const antiga = posts.find((p) => p.id === "sp-pauta")!;
    expect(antiga.scheduledFor?.toISOString()).toBe("2026-11-02T13:00:00.000Z");
    const nova = posts.find((p) => p.id !== "sp-pauta")!;
    expect(nova.scheduledFor?.toISOString()).toBe("2026-10-15T13:00:00.000Z");
  });

  it("peça aprovada não é deslocada — a entrada vai para o slot livre mais próximo", async () => {
    const alvo = new Date("2026-10-15T13:00:00.000Z");
    posts.push({
      id: "sp-aprovada", clientId: CLIENT_ID, status: "scheduled", scheduledFor: alvo,
      scriptJson: '{"origemGerador":"calendario-editorial-v1","mes":"2026-10","fase":"final"}',
      format: "feed", caption: "peça já decidida",
    });
    proximaDataLivre.mockResolvedValue(new Date("2026-11-02T13:00:00.000Z"));

    entradas["ent1"] = novaEntrada();
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deslocados).toEqual([]);
    // a peça aprovada NÃO mudou de data.
    const aprovada = posts.find((p) => p.id === "sp-aprovada")!;
    expect(aprovada.scheduledFor?.toISOString()).toBe(alvo.toISOString());
    // a peça NOVA foi para o slot livre, não para o slot pedido.
    const nova = posts.find((p) => p.id !== "sp-aprovada")!;
    expect(nova.scheduledFor?.toISOString()).toBe("2026-11-02T13:00:00.000Z");
    expect(db.activityEvent.create).toHaveBeenCalled();
  });

  it("semana travada — encaixa, finaliza na hora, conta refação e abre card", async () => {
    // 01/10/2026 é uma quinta-feira; 13h UTC = 10h Brasília — o EXATO instante
    // em que `semanaTravada` passa a valer "true" para a semana que contém
    // esta própria peça (a peça está marcada para ESTA quinta às 10h). Chamar
    // `encaixarNoCalendario` 1h depois desse instante garante a trava.
    const alvoNaSemanaJaTravada = new Date("2026-10-01T13:00:00.000Z"); // quinta, 01/10, 10h Brasília
    const agoraDepoisDaTrava = new Date("2026-10-01T14:00:00.000Z"); // 1h depois

    entradas["ent1"] = novaEntrada({
      interpretacaoJson: JSON.stringify(fixturaInterpretacao({ dataAlvo: "2026-10-01" })),
    });

    const r = await encaixarNoCalendario({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: agoraDepoisDaTrava,
    });

    expect(r.ok).toBe(true);
    expect(posts[0]!.scheduledFor?.toISOString()).toBe(alvoNaSemanaJaTravada.toISOString());
    expect(finalizarPecasNaJanela).toHaveBeenCalledTimes(1);
    expect(abrirCardDoPeriodo).toHaveBeenCalledTimes(1);
    expect(refacoesRegistradas).toHaveLength(1);
    expect(refacoesRegistradas[0]!.contaNoLimite).toBe(true);
  });

  it("semana NÃO travada — não finaliza, não conta refação e não abre card", async () => {
    entradas["ent1"] = novaEntrada(); // dataAlvo 2026-10-15, bem no futuro de AGORA
    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });
    expect(r.ok).toBe(true);
    expect(finalizarPecasNaJanela).not.toHaveBeenCalled();
    expect(abrirCardDoPeriodo).not.toHaveBeenCalled();
    expect(refacoesRegistradas).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MÚLTIPLAS PEÇAS — `quantidade` × `formatos` (D4, 28/09/2026)
  // ═══════════════════════════════════════════════════════════════════════

  it("quantidade 2 com [feed_imagem, stories] → 2 peças, formatos certos, slots distintos", async () => {
    entradas["ent1"] = novaEntrada({
      interpretacaoJson: JSON.stringify(
        fixturaInterpretacao({ formatos: ["feed_imagem", "stories"], quantidade: 2 }),
      ),
    });

    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.socialPostIds).toHaveLength(2);
    expect(posts).toHaveLength(2);

    // formatos certos, na ordem pedida.
    expect(posts.map((p) => p.format)).toEqual(["feed", "story"]);

    // slots distintos — a 2ª peça nunca empilha no horário da 1ª, e vem DEPOIS.
    const [p1, p2] = posts;
    expect(p1!.scheduledFor).not.toBeNull();
    expect(p2!.scheduledFor).not.toBeNull();
    expect(p2!.scheduledFor!.getTime()).toBeGreaterThan(p1!.scheduledFor!.getTime());

    // a mesma mídia da entrada em toda peça — carrossel/telas reusam a MESMA lista.
    expect(posts.every((p) => p.caption === "Lançamento da nova coleção.")).toBe(true);

    expect(entradas["ent1"]!.status).toBe("encaixada");
    const idsGravados = JSON.parse(entradas["ent1"]!.socialPostIdsJson) as string[];
    expect(idsGravados).toEqual([p1!.id, p2!.id]);
  });

  it("quantidade 3 com um único formato → 3 peças no mesmo formato, cicladas", async () => {
    entradas["ent1"] = novaEntrada({
      interpretacaoJson: JSON.stringify(
        fixturaInterpretacao({ formatos: ["feed_imagem"], quantidade: 3 }),
      ),
    });

    const r = await encaixarNoCalendario({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, entradaId: "ent1", agora: AGORA });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.socialPostIds).toHaveLength(3);
    expect(posts).toHaveLength(3);
    expect(posts.map((p) => p.format)).toEqual(["feed", "feed", "feed"]);

    const horarios = posts.map((p) => p.scheduledFor!.getTime());
    expect(new Set(horarios).size).toBe(3); // três horários distintos, nenhum empilhado
    expect(horarios[0]!).toBeLessThan(horarios[1]!);
    expect(horarios[1]!).toBeLessThan(horarios[2]!);
  });
});
