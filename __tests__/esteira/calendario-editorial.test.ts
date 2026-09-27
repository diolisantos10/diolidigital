// calendario-editorial.test.ts — o CEO pede o mês, a IA propõe, o cliente aprova.
// Desde 27/09/2026: SÓ TEXTO, obedecendo ao PACOTE DA MARCA.
//
// As provas deste arquivo:
//   (i)    limpo grava N rascunhos datados, dias distintos, dentro do mês,
//          status draft, networks instagram, fase "pauta" (sem arte ainda);
//   (ii)   marca não constituída (sem DNA) → recusa "preciso confirmar a
//          ficha de marca", IA nunca chamada;
//   (iii)  segunda chamada não duplica (idempotência por clientId+mês);
//   (iv)   legenda com o dia errado é BARRADA e não gravada — as outras seguem;
//   (v)    sem pacote → recusa "preciso do pacote da marca", ANTES da IA;
//   (vi)   DNA prevalece sobre a ficha — sem ficha + com DNA → gera, e a ficha
//          nunca é consultada;
//   (vii)  Reels sem vídeo bruto do cliente → PENDENTE "preciso de vídeo do
//          cliente", nenhum SocialPost nasce, e a IA nunca é chamada para ele.
//
// Mocks TIPADOS: `vi.hoisted(() => vi.fn())`, sem assinatura, mas todo
// `.mockImplementation`/`.mockResolvedValueOnce` abaixo anota o retorno —
// regra do CLAUDE.md (mock sem forma quebra o `tsc --noEmit`, mesmo com o
// teste verde). `lerPacote` é a implementação REAL (zod, sem banco) — mais
// fiel que reproduzir a validação numa segunda régua.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NOME_DO_DIA, type DiaDaSemana } from "@/lib/agency/esteira/calendario-do-cliente";
import type { PacoteDaMarca, StoriesDoPacote } from "@/lib/agency/esteira/pacote-da-marca";

interface LinhaDePost {
  id: string;
  workspaceId: string;
  clientId: string;
  scheduledFor: Date | null;
  scriptJson: string | null;
}

let posts: LinhaDePost[] = [];
let contadorDeId = 0;

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  socialPost: { findMany: vi.fn(), create: vi.fn() },
  activityEvent: { create: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const contratoDeMarca = vi.hoisted(() => vi.fn());
const proximaDataLivre = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca }));
// `normalizarFormato` de verdade (reproduzida, não `importOriginal`): desde
// 27/09/2026 `promocao-so-em-stories.ts` a importa de `publicacao.ts` para
// decidir a trava de PROMOÇÃO SÓ EM STORIES em `conferirPeca` — mock sem ela
// quebraria a cadeia real de `gerarCalendarioEditorial` com "not a function".
vi.mock("@/lib/agency/esteira/publicacao", () => ({
  proximaDataLivre,
  HORA_PADRAO: 10,
  normalizarFormato: (f: string): "feed" | "reel" | "story" | "carousel" => {
    if (f === "reel" || f === "video") return "reel";
    if (f === "story") return "story";
    if (f === "carousel" || f === "carrossel") return "carousel";
    return "feed";
  },
}));

import {
  gerarCalendarioEditorial,
  MARCADOR_DE_ORIGEM,
  horaBrasiliaParaUtc,
  gerarSlotsDeStoriesDoPacote,
  diaCivilBrasilia,
} from "@/lib/agency/esteira/calendario-editorial";

const WORKSPACE_ID = "ws1";
const CLIENT_ID = "cli-padaria";
const MES = "2026-09";
const HORARIO = "10:00";

/** O pacote PADRÃO destes testes: 1 post por semana (só segunda-feira), um
 *  único pilar — o suficiente para reproduzir exatamente o caso que os testes
 *  antigos (com `postsPorSemana: 1`) exercitavam. */
function pacotePadrao(overrides: Partial<PacoteDaMarca> = {}): PacoteDaMarca {
  return {
    postsPorDia: 1,
    postsPorSemana: 1,
    formatos: ["feed_imagem"],
    dias: [1],
    horarios: [HORARIO],
    pilares: [{ nome: "bastidores", peso: 1 }],
    ...overrides,
  };
}

function perfilComPacote(pacote: PacoteDaMarca | null): {
  name: string; industry: string; pacoteJson: string | null;
} {
  return { name: "Padaria do João", industry: "alimentação", pacoteJson: pacote ? JSON.stringify(pacote) : null };
}

/** Ficha de marca CONSTITUÍDA — o caso limpo destes testes. */
function fichaConstituida(): Promise<{
  texto: string; marcaVersao: string; lacunas: string[]; cortado: string[]; naoConstituida: boolean;
}> {
  return Promise.resolve({
    texto: "QUEM É\nPromessa: pão de fermentação natural, feito todo dia.",
    marcaVersao: "mv_teste0001",
    lacunas: [],
    cortado: [],
    naoConstituida: false,
  });
}

/** Uma peça válida e genérica — nunca cita dia da semana, então
 *  `conferirDataDaPeca` sempre a aprova (`nao_medido`, que passa). */
function pecaValida(indice: number): {
  pilar: string; tema: string; legenda: string; hashtags: string[]; direcaoDeArte: string;
} {
  return {
    pilar: "bastidores",
    tema: `bastidor ${indice}`,
    legenda:
      `Todo dia às 5 da manhã a massa já está descansando (parte ${indice}). ` +
      "É esse tempo que dá o sabor — passa aqui pra ver de perto.",
    hashtags: ["padaria", "bastidores", "feitoamao"],
    direcaoDeArte: "foto do forno aceso ao amanhecer",
  };
}

/** A primeira segunda-feira do mês, achada por busca. */
function primeiraSegundaFeiraDoMes(ano: number, mesIndex: number): Date {
  for (let dia = 1; dia <= 31; dia++) {
    const d = new Date(ano, mesIndex, dia, 10, 0, 0, 0);
    if (d.getMonth() !== mesIndex) break;
    if (d.getDay() === 1) return d;
  }
  throw new Error("nenhuma segunda-feira encontrada neste mês — impossível");
}

function quantidadePedida(opcoes: { esquema?: Record<string, unknown> }): number {
  const esquema = opcoes.esquema as { properties?: { posts?: { minItems?: number } } } | undefined;
  return esquema?.properties?.posts?.minItems ?? 1;
}

async function loteValido(opcoes: { esquema?: Record<string, unknown> }): Promise<{
  ok: true; data: { posts: unknown[] }; model: string; provider: "claude";
}> {
  const n = quantidadePedida(opcoes);
  return {
    ok: true,
    data: { posts: Array.from({ length: n }, (_, i) => pecaValida(i)) },
    model: "mock-claude",
    provider: "claude",
  };
}

beforeEach(() => {
  posts = [];
  contadorDeId = 0;
  vi.clearAllMocks();

  db.client.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId: string } }) =>
      where.id === CLIENT_ID && where.workspaceId === WORKSPACE_ID ? { id: CLIENT_ID } : null,
  );
  db.client.findUnique.mockResolvedValue(perfilComPacote(pacotePadrao()));

  db.socialPost.findMany.mockImplementation(
    async ({ where }: { where: { workspaceId: string; clientId: string; scheduledFor?: { gte: Date; lte: Date } } }) => {
      let r = posts.filter((p) => p.workspaceId === where.workspaceId && p.clientId === where.clientId);
      if (where.scheduledFor) {
        const { gte, lte } = where.scheduledFor;
        r = r.filter((p) => p.scheduledFor && p.scheduledFor >= gte && p.scheduledFor <= lte);
      }
      return r.map((p) => ({ id: p.id, scheduledFor: p.scheduledFor, scriptJson: p.scriptJson }));
    },
  );
  db.socialPost.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => {
      contadorDeId++;
      const linha: LinhaDePost = {
        id: `sp-${contadorDeId}`,
        workspaceId: data.workspaceId as string,
        clientId: data.clientId as string,
        scheduledFor: data.scheduledFor as Date,
        scriptJson: data.scriptJson as string,
      };
      posts.push(linha);
      return { id: linha.id, scheduledFor: linha.scheduledFor };
    },
  );
  db.activityEvent.create.mockResolvedValue({});
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.findMany.mockResolvedValue([]);

  // mockReset, não só clearAllMocks: o caso do DNA enfileira um `Once` que
  // nunca é consumido (com DNA a ficha não é lida) e vazaria para o teste seguinte.
  contratoDeMarca.mockReset();
  contratoDeMarca.mockImplementation(fichaConstituida);
  // Bem no passado: nada neste mês é filtrado por "antes de proximaDataLivre".
  proximaDataLivre.mockResolvedValue(new Date(2000, 0, 1));
  generate.mockImplementation(loteValido);
});

describe("o caso limpo", () => {
  it("(i) grava rascunhos datados, um por dia distinto, dentro do mês pedido, status draft, Instagram, fase pauta", async () => {
    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criados).toBeGreaterThan(0);
    expect(r.criados).toBe(r.posts.length);
    expect(r.jaExistiam).toBe(0);
    expect(r.barradas).toEqual([]);
    expect(r.pendentes).toEqual([]);

    // Dias distintos, dentro do mês pedido (setembro de 2026).
    const chaves = r.posts.map((p) => p.scheduledFor.toDateString());
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const p of r.posts) {
      expect(p.scheduledFor.getUTCFullYear()).toBe(2026);
      expect(p.scheduledFor.getUTCMonth()).toBe(8); // setembro, 0-indexado
    }

    // O que foi gravado de fato no banco.
    expect(db.socialPost.create).toHaveBeenCalledTimes(r.criados);
    for (const chamada of db.socialPost.create.mock.calls) {
      const dados = chamada[0].data as Record<string, unknown>;
      expect(dados.status).toBe("draft");
      expect(dados.networks).toBe(JSON.stringify(["instagram"]));
      expect(dados.format).toBe("feed");
      expect(dados.pillar).toBe("bastidores");
      expect(dados.visibility).toBe("compartilhado");
      expect(dados.workspaceId).toBe(WORKSPACE_ID);
      expect(dados.clientId).toBe(CLIENT_ID);
      expect(String(dados.scriptJson)).toContain(MARCADOR_DE_ORIGEM);
      // A FASE "pauta" — sem ela `execution/artes.ts` pegaria a peça na
      // rodada global antes da rotina semanal existir.
      expect(String(dados.scriptJson)).toContain('"fase":"pauta"');
      // Hashtags no FIM da legenda, nunca em campo à parte.
      expect(String(dados.caption)).toMatch(/#padaria/);
    }
  });
});

describe("sem pacote, a função recusa ANTES de chamar a IA", () => {
  it("(v) Client.pacoteJson nulo → recusa nomeando o pacote, e a IA nunca é chamada", async () => {
    db.client.findUnique.mockResolvedValue(perfilComPacote(null));

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("sem_pacote");
    expect(r.motivo).toContain("preciso do pacote da marca");
    expect(generate).not.toHaveBeenCalled();
    expect(db.socialPost.create).not.toHaveBeenCalled();
    // Nem a ficha de marca é consultada — o pacote é checado primeiro.
    expect(contratoDeMarca).not.toHaveBeenCalled();
  });
});

describe("a ficha de marca vem antes da IA (quando não há DNA)", () => {
  it("(ii) marca não constituída, sem DNA → recusa nomeando a ficha, e a IA nunca é chamada", async () => {
    contratoDeMarca.mockResolvedValueOnce({
      texto: "",
      marcaVersao: "mv_vazia",
      lacunas: ["propósito e promessa", "voz"],
      cortado: [],
      naoConstituida: true,
    });

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe("sem_ficha_de_marca");
    expect(r.motivo).toContain("preciso confirmar a ficha de marca");
    expect(generate).not.toHaveBeenCalled();
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });
});

describe("o DNA da marca prevalece sobre a ficha", () => {
  it("(vi) marca SEM ficha (naoConstituida) + COM dna → gera normalmente, e a ficha nunca é lida", async () => {
    contratoDeMarca.mockResolvedValueOnce({
      texto: "", marcaVersao: "mv_vazia", lacunas: ["tudo"], cortado: [], naoConstituida: true,
    });

    const r = await gerarCalendarioEditorial({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES,
      dna: { tomDeVoz: "caseiro e direto", pilares: ["bastidores"], observacoes: "sempre citar o forno a lenha" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criados).toBeGreaterThan(0);
    expect(contratoDeMarca).not.toHaveBeenCalled();
  });
});

describe("idempotência por cliente e mês", () => {
  it("(iii) a segunda chamada não duplica — devolve os existentes, criados=0", async () => {
    const primeira = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;
    const criadosNaPrimeira = primeira.criados;
    expect(criadosNaPrimeira).toBeGreaterThan(0);

    vi.clearAllMocks();
    // Os mocks de leitura precisam continuar respondendo depois do
    // `clearAllMocks` — só o HISTÓRICO de chamadas foi limpo, os posts JÁ
    // GRAVADOS continuam no array `posts` (estado do "banco").
    db.socialPost.findMany.mockImplementation(
      async ({ where }: { where: { workspaceId: string; clientId: string; scheduledFor?: { gte: Date; lte: Date } } }) => {
        let r = posts.filter((p) => p.workspaceId === where.workspaceId && p.clientId === where.clientId);
        if (where.scheduledFor) {
          const { gte, lte } = where.scheduledFor;
          r = r.filter((p) => p.scheduledFor && p.scheduledFor >= gte && p.scheduledFor <= lte);
        }
        return r.map((p) => ({ id: p.id, scheduledFor: p.scheduledFor, scriptJson: p.scriptJson }));
      },
    );

    const segunda = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.criados).toBe(0);
    expect(segunda.jaExistiam).toBe(criadosNaPrimeira);
    expect(segunda.posts.length).toBe(criadosNaPrimeira);
    // Nem o pacote, nem a ficha de marca, nem a IA são consultados de novo —
    // a idempotência decide ANTES de tudo isso.
    expect(db.client.findUnique).not.toHaveBeenCalled();
    expect(contratoDeMarca).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });
});

describe("a trava de coerência de data barra a peça errada, sozinha", () => {
  it('(iv) legenda com o dia errado (ex.: "Sexta é dia de..." num post de outro dia) é barrada e não gravada', async () => {
    // O PRIMEIRO candidato do mês: com o pacote padrão (só segunda-feira) é a
    // PRIMEIRA segunda-feira de setembro/2026 — achada por busca.
    const primeiroDoMes = primeiraSegundaFeiraDoMes(2026, 8);
    const diaCorreto = primeiroDoMes.getDay() as DiaDaSemana;
    const diaErrado = ((diaCorreto + 3) % 7) as DiaDaSemana; // sempre diferente
    const nomeErrado = NOME_DO_DIA[diaErrado];
    const capitalizado = nomeErrado.charAt(0).toUpperCase() + nomeErrado.slice(1);

    const pecaComDiaErrado = {
      pilar: "bastidores",
      tema: "dia errado",
      legenda: `${capitalizado} é dia de aproveitar o cafezinho quentinho com a gente por aqui.`,
      hashtags: ["padaria"],
      direcaoDeArte: "foto do balcão",
    };

    generate.mockImplementationOnce(async (opcoes: { esquema?: Record<string, unknown> }) => {
      const n = quantidadePedida(opcoes);
      const pecas = Array.from({ length: n }, (_, i) => (i === 0 ? pecaComDiaErrado : pecaValida(i)));
      return { ok: true, data: { posts: pecas }, model: "mock-claude", provider: "claude" as const };
    });
    // A regeneração única (schema de 1 item) — persiste o mesmo erro, então a
    // peça fica barrada de vez, em vez de entrar no calendário.
    generate.mockImplementationOnce(async () => ({
      ok: true, data: { posts: [pecaComDiaErrado] }, model: "mock-claude", provider: "claude" as const,
    }));

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.barradas.length).toBe(1);
    expect(r.barradas[0].motivo).toContain("convida o público");
    // Nada com a data do primeiro candidato foi gravado — a peça errada NÃO
    // vira post, mas as outras seguem.
    expect(r.posts.some((p) => p.scheduledFor.toDateString() === primeiroDoMes.toDateString())).toBe(false);
    expect(r.criados).toBe(r.posts.length);
    expect(generate).toHaveBeenCalledTimes(2); // lote + UMA regeneração, nunca mais
  });
});

describe("reels sem vídeo bruto do cliente", () => {
  it('(vii) formato Reels sem vídeo bruto → PENDENTE "preciso de vídeo do cliente", sem post e sem IA', async () => {
    db.client.findUnique.mockResolvedValue(
      perfilComPacote(pacotePadrao({ formatos: ["reels"] })),
    );
    db.mediaAsset.findFirst.mockResolvedValue(null); // sem vídeo bruto

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criados).toBe(0);
    expect(r.posts).toEqual([]);
    expect(r.pendentes.length).toBeGreaterThan(0);
    expect(r.pendentes[0]!.motivo).toContain("vídeo do cliente");
    expect(generate).not.toHaveBeenCalled();
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("com vídeo bruto disponível, Reels entra na fila normalmente", async () => {
    db.client.findUnique.mockResolvedValue(
      perfilComPacote(pacotePadrao({ formatos: ["reels"] })),
    );
    db.mediaAsset.findFirst.mockResolvedValue({ id: "asset-video-1" }); // tem vídeo bruto

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pendentes).toEqual([]);
    expect(r.criados).toBeGreaterThan(0);
    for (const chamada of db.socialPost.create.mock.calls) {
      expect((chamada[0].data as Record<string, unknown>).format).toBe("reel");
    }
  });
});

describe("horaBrasiliaParaUtc — a virada de mês/dia (unitário, sem banco)", () => {
  it('22:00 Brasília no último dia de janeiro/2026 vira 2026-02-01T01:00Z', () => {
    const d = horaBrasiliaParaUtc("22:00", 2026, 0, 31);
    expect(d.toISOString()).toBe("2026-02-01T01:00:00.000Z");
  });

  it('00:30 Brasília em 01/02/2026 vira 2026-02-01T03:30Z', () => {
    const d = horaBrasiliaParaUtc("00:30", 2026, 1, 1);
    expect(d.toISOString()).toBe("2026-02-01T03:30:00.000Z");
  });
});

describe("virada de mês em Brasília — a janela do mês não pode confundir a idempotência", () => {
  it("um slot de 22h Brasília no último dia de janeiro (UTC = 1/fev, 01h) NÃO impede fevereiro de gerar", async () => {
    // Pacote pensado para produzir, de propósito, o caso do defeito: todos os
    // dias da semana ligados (o último dia do mês sempre entra) e horário
    // 22:00 — que em Brasília sempre vira madrugada do dia seguinte em UTC.
    const pacoteDaVirada = pacotePadrao({
      dias: [0, 1, 2, 3, 4, 5, 6],
      postsPorSemana: 7,
      horarios: ["22:00"],
    });
    db.client.findUnique.mockResolvedValue(perfilComPacote(pacoteDaVirada));

    const janeiro = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: "2026-01" });
    expect(janeiro.ok).toBe(true);
    if (!janeiro.ok) return;
    expect(janeiro.criados).toBeGreaterThan(0);

    // A peça do dia 31 de janeiro, 22h Brasília, é 2026-02-01T01:00Z — cai no
    // calendário UTC de fevereiro, mas o marcador continua dizendo janeiro.
    const criadaDoUltimoDia = db.socialPost.create.mock.calls
      .map((chamada) => chamada[0].data as Record<string, unknown>)
      .find((d) => (d.scheduledFor as Date).toISOString() === "2026-02-01T01:00:00.000Z");
    expect(criadaDoUltimoDia).toBeDefined();
    expect(String(criadaDoUltimoDia!.scriptJson)).toContain('"mes":"2026-01"');

    // O BUG (27/09/2026): a idempotência de fevereiro, olhando a JANELA de
    // datas, encontrava essa peça (que cai dentro do intervalo UTC de
    // fevereiro) e devolvia ok:true com criados=0 — o mês inteiro sumia.
    const fevereiro = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: "2026-02" });
    expect(fevereiro.ok).toBe(true);
    if (!fevereiro.ok) return;
    expect(fevereiro.jaExistiam).toBe(0);
    expect(fevereiro.criados).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// O PACOTE DE STORIES (CEO, 27/09/2026) — combo, reciclado, repost
// ═════════════════════════════════════════════════════════════════════════

/** O bloco `stories` do pacote do Sushi Cazza, exatamente como o CEO decidiu
 *  (27/09/2026): 6 a 8 por dia, a partir das 18:00 Brasília, intervalo mínimo
 *  de 30min, pelo menos 1 combo por dia, mistura combo/reciclado/repost. */
const STORIES_SUSHI_CAZZA: StoriesDoPacote = {
  porDiaMin: 6,
  porDiaMax: 8,
  aPartirDe: "18:00",
  intervaloMinimoMin: 30,
  combosMinPorDia: 1,
  mistura: ["combo", "reciclado", "repost"],
};

describe("gerarSlotsDeStoriesDoPacote — pura, sem banco (pacote Sushi Cazza)", () => {
  it("gera de 6 a 8 stories por dia, a partir das 18:00 Brasília (21:00Z), intervalo >= 30min, >= 1 combo/dia", () => {
    const r = gerarSlotsDeStoriesDoPacote({
      ano: 2026,
      mesIndex: 8, // setembro
      stories: STORIES_SUSHI_CAZZA,
      diasValidos: [0, 1, 2, 3, 4, 5, 6],
      minimoDia: new Date(2000, 0, 1),
    });

    expect(r.reduzidas).toEqual([]);
    expect(r.slots.length).toBeGreaterThan(0);

    const porDiaBrasilia = new Map<string, typeof r.slots>();
    for (const s of r.slots) {
      const c = diaCivilBrasilia(s.data);
      const chave = `${c.ano}-${c.mesIndex}-${c.dia}`;
      porDiaBrasilia.set(chave, [...(porDiaBrasilia.get(chave) ?? []), s]);
    }

    for (const doDia of porDiaBrasilia.values()) {
      expect(doDia.length).toBeGreaterThanOrEqual(6);
      expect(doDia.length).toBeLessThanOrEqual(8);
      expect(doDia.filter((s) => s.tipoStory === "combo").length).toBeGreaterThanOrEqual(1);

      const ordenados = [...doDia].sort((a, b) => a.data.getTime() - b.data.getTime());
      // 18:00 Brasília = 21:00Z.
      expect(ordenados[0]!.data.toISOString()).toMatch(/T21:00:00\.000Z$/);
      for (let i = 1; i < ordenados.length; i++) {
        const diffMin = (ordenados[i]!.data.getTime() - ordenados[i - 1]!.data.getTime()) / 60_000;
        expect(diffMin).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("quando a cota pedida não cabe antes de 23:59 Brasília, REDUZ e AVISA (nunca descarta em silêncio)", () => {
    const r = gerarSlotsDeStoriesDoPacote({
      ano: 2026,
      mesIndex: 8,
      stories: { porDiaMin: 10, porDiaMax: 10, aPartirDe: "23:00", intervaloMinimoMin: 60, combosMinPorDia: 1, mistura: ["combo"] },
      diasValidos: [0, 1, 2, 3, 4, 5, 6],
      minimoDia: new Date(2000, 0, 1),
    });

    expect(r.reduzidas.length).toBeGreaterThan(0);
    expect(r.reduzidas[0]!.motivo).toMatch(/reduzido/);
    // A partir das 23:00, com intervalo de 60min, só cabe 1 story antes de 23:59.
    const porDia = new Map<string, number>();
    for (const s of r.slots) {
      const c = diaCivilBrasilia(s.data);
      const chave = `${c.ano}-${c.mesIndex}-${c.dia}`;
      porDia.set(chave, (porDia.get(chave) ?? 0) + 1);
    }
    for (const qtd of porDia.values()) expect(qtd).toBe(1);
  });
});

describe("o pacote de stories, através de gerarCalendarioEditorial (integração)", () => {
  /** O pacote SÓ DE STORIES do Sushi Cazza, restrito a segunda-feira para o
   *  teste ficar rápido — os números da cota (6–8, 18:00, intervalo 30min,
   *  1 combo mínimo) são os mesmos do pacote real. */
  function pacoteDeStoriesDoCazza(): PacoteDaMarca {
    return {
      postsPorDia: 0,
      postsPorSemana: 0,
      formatos: ["stories"],
      dias: [1],
      horarios: [],
      pilares: [{ nome: "combo", peso: 1 }, { nome: "produto", peso: 1 }],
      stories: STORIES_SUSHI_CAZZA,
    };
  }

  it('"repost" NUNCA gera — vira pendente com "repost aguardando parecer do meta"', async () => {
    db.client.findUnique.mockResolvedValue(perfilComPacote(pacoteDeStoriesDoCazza()));
    db.mediaAsset.findMany.mockResolvedValue([]); // sem material — também testa reciclado abaixo

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pendentes.some((p) => p.motivo === "repost aguardando parecer do meta")).toBe(true);
    // Nenhum post nasce com tipo "repost" — o tipo nunca chega a criar SocialPost.
    expect(
      db.socialPost.create.mock.calls.every(
        (chamada) => !String((chamada[0].data as Record<string, unknown>).scriptJson).includes('"tipo":"repost"'),
      ),
    ).toBe(true);
  });

  it('"reciclado" SEM material do cliente vira pendente — "preciso de material do cliente para reciclar"', async () => {
    db.client.findUnique.mockResolvedValue(perfilComPacote(pacoteDeStoriesDoCazza()));
    db.mediaAsset.findMany.mockResolvedValue([]);

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pendentes.some((p) => p.motivo === "preciso de material do cliente para reciclar")).toBe(true);
  });

  it('"reciclado" COM material do cliente grava o post já com mediaUrl do asset e tipo "reciclado"', async () => {
    db.client.findUnique.mockResolvedValue(perfilComPacote(pacoteDeStoriesDoCazza()));
    db.mediaAsset.findMany.mockResolvedValue([{ id: "asset-foto-1" }]);

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doReciclado = db.socialPost.create.mock.calls.find((chamada) =>
      String((chamada[0].data as Record<string, unknown>).scriptJson).includes('"tipo":"reciclado"'),
    );
    expect(doReciclado).toBeDefined();
    expect((doReciclado![0].data as Record<string, unknown>).mediaUrl).toBe("/api/media/asset-foto-1");
  });

  it('pelo menos um "combo" por dia vira post de verdade, formato "story", tipo gravado em scriptJson', async () => {
    db.client.findUnique.mockResolvedValue(perfilComPacote(pacoteDeStoriesDoCazza()));

    const r = await gerarCalendarioEditorial({ workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, mes: MES });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.criados).toBeGreaterThan(0);
    const algumCombo = db.socialPost.create.mock.calls.some((chamada) =>
      String((chamada[0].data as Record<string, unknown>).scriptJson).includes('"tipo":"combo"'),
    );
    expect(algumCombo).toBe(true);
    for (const chamada of db.socialPost.create.mock.calls) {
      expect((chamada[0].data as Record<string, unknown>).format).toBe("story");
    }
  });
});
