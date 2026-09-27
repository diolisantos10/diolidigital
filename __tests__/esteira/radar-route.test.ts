// radar-route.test.ts — POST /api/social-posts/radar (W12b, CEO 27/09/2026).
//
// As provas deste arquivo (ver a ficha):
//   • notícia sem URL é RECUSADA e listada — não entra no post;
//   • notícia fora da janela de 7 dias é RECUSADA e listada;
//   • menos de 8 (o mínimo) aprovadas → 422, NADA é gravado;
//   • 8 notícias válidas → post carrossel com 9 telas (capa + 8);
//   • só "master" cura a pauta; sessão de portal é 403;
//   • segunda submissão da MESMA edição ATUALIZA o post, não duplica.
//
// `lerPacote` e `conferirNoticia` são a implementação REAL (puras, zod/regex,
// sem banco) — mais fiel do que reproduzir a validação numa segunda régua.
// `calendario-editorial.ts` é mockado por INTEIRO (só `MARCADOR_DE_ORIGEM` e
// `horaBrasiliaParaUtc`, reproduzido em 2 linhas) para este arquivo não puxar
// toda a árvore de imports dela (prisma, IA, etc.) só por causa de duas
// funções puras.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

interface LinhaDePost {
  id: string;
  clientId: string;
  format: string;
  caption: string;
  scenesJson: string;
  scriptJson: string | null;
  scheduledFor: Date | null;
  pillar: string | null;
  status: string;
}

let posts: LinhaDePost[] = [];
let contadorDeId = 0;

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
// Real requests (sem cabeçalho `Sec-Fetch-Site`/`Origin`/`Referer`) contam
// como origem NÃO confiável por padrão (fail-closed) — mockado direto, como
// `porta-da-isencao.test.ts` já faz, em vez de forjar cabeçalho de navegador.
vi.mock("@/lib/security/navegacao-cross-site", () => ({
  deveBloquearMutacaoCrossSite: () => false,
}));
vi.mock("@/lib/agency/esteira/calendario-editorial", () => ({
  MARCADOR_DE_ORIGEM: "calendario-editorial-v1",
  horaBrasiliaParaUtc: (hhmm: string, ano: number, mesIndex: number, dia: number): Date => {
    const [hh, mm] = hhmm.split(":").map((n: string) => Number(n) || 0);
    return new Date(Date.UTC(ano, mesIndex, dia, (hh ?? 10) + 3, mm ?? 0, 0, 0));
  },
}));

import { POST as postarRadar } from "@/app/api/social-posts/radar/route";

const WORKSPACE_ID = "ws1";
const CLIENT_ID = "cli-dioli";

function corpoJson(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/social-posts/radar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessaoMaster(userId = "master-1"): { session: { userId: string; workspaceId: string; role: string; clientId?: string }; error: null } {
  return { session: { userId, workspaceId: WORKSPACE_ID, role: "master" }, error: null };
}

/** Uma notícia válida — dentro da janela (edição - N dias), com URL http(s). */
function noticiaValida(indice: number, edicao: string, diasAntes: number): {
  titulo: string; resumo: string; veiculo: string; url: string; dataPublicacao: string;
} {
  const [y, m, d] = edicao.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - diasAntes);
  const data = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  return {
    titulo: `Novidade ${indice} do mundo tech`,
    resumo: `Resumo da novidade ${indice}, em uma frase.`,
    veiculo: `Veículo ${indice}`,
    url: `https://exemplo.com/noticia-${indice}`,
    dataPublicacao: data,
  };
}

function oitoNoticiasValidas(edicao: string): ReturnType<typeof noticiaValida>[] {
  return Array.from({ length: 8 }, (_, i) => noticiaValida(i + 1, edicao, i));
}

const EDICAO = "2026-10-05"; // uma segunda-feira

beforeEach(() => {
  posts = [];
  contadorDeId = 0;
  vi.clearAllMocks();

  requireSession.mockResolvedValue(sessaoMaster());
  db.client.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId: string } }) =>
      where.id === CLIENT_ID && where.workspaceId === WORKSPACE_ID ? { id: CLIENT_ID } : null,
  );
  db.client.findUnique.mockResolvedValue({ pacoteJson: null }); // sem pacote — usa o piso padrão (8)
  db.socialPost.findMany.mockResolvedValue([]); // nenhum radar existente ainda
  db.socialPost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    contadorDeId++;
    const linha: LinhaDePost = {
      id: `sp-${contadorDeId}`,
      clientId: data.clientId as string,
      format: data.format as string,
      caption: data.caption as string,
      scenesJson: data.scenesJson as string,
      scriptJson: data.scriptJson as string | null,
      scheduledFor: data.scheduledFor as Date,
      pillar: (data.pillar as string | null) ?? null,
      status: data.status as string,
    };
    posts.push(linha);
    return { id: linha.id };
  });
  db.socialPost.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const linha = posts.find((p) => p.id === where.id);
    if (linha) Object.assign(linha, data);
    return { id: where.id };
  });
});

describe("guardas de entrada", () => {
  it("sessão de portal (clientId na sessão) é 403 — nunca cura pauta em nome da agência", async () => {
    requireSession.mockResolvedValue({
      session: { userId: "u1", workspaceId: WORKSPACE_ID, role: "master", clientId: "cli-x" },
      error: null,
    });
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: oitoNoticiasValidas(EDICAO) }));
    expect(res.status).toBe(403);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });

  it("clientId de outro workspace → 404, nunca 403 (não confirma que o id existe)", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-2"));
    const res = await postarRadar(corpoJson({ clientId: "cli-de-outro-workspace", edicao: EDICAO, noticias: oitoNoticiasValidas(EDICAO) }));
    expect(res.status).toBe(404);
  });

  it("sem edicao no formato AAAA-MM-DD → 400", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-3"));
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: "05/10/2026", noticias: oitoNoticiasValidas(EDICAO) }));
    expect(res.status).toBe(400);
  });

  it("sem noticias → 400", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-4"));
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: [] }));
    expect(res.status).toBe(400);
  });
});

describe("a trava de fonte — conferirNoticia", () => {
  it("notícia sem URL de fonte é RECUSADA e listada — não entra no post", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-5"));
    const validas = oitoNoticiasValidas(EDICAO);
    // `diasAntes: 3` — dentro da janela de propósito: o ÚNICO defeito desta
    // notícia precisa ser a URL, senão o teste não prova qual trava reprovou.
    const semUrl = { ...noticiaValida(9, EDICAO, 3), url: "" };
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: [...validas, semUrl] }));

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { ok: boolean; telas: number; aprovadas: number; reprovadas: Array<{ titulo: string; motivo: string }> };
    expect(corpo.aprovadas).toBe(8);
    expect(corpo.reprovadas.length).toBe(1);
    expect(corpo.reprovadas[0]!.motivo).toContain("URL de fonte");
    expect(corpo.telas).toBe(9); // capa + 8 aprovadas
    expect(String(posts[0]!.scenesJson)).not.toContain(semUrl.titulo);
  });

  it("notícia fora da janela de 7 dias antes da edição é RECUSADA e listada", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-6"));
    const validas = oitoNoticiasValidas(EDICAO);
    const foraDaJanela = noticiaValida(9, EDICAO, 30); // 30 dias antes — bem fora da janela de 7
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: [...validas, foraDaJanela] }));

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { reprovadas: Array<{ titulo: string; motivo: string }> };
    expect(corpo.reprovadas.length).toBe(1);
    expect(corpo.reprovadas[0]!.motivo).toContain("fora da janela");
  });

  it("menos de 8 notícias aprovadas → 422, NADA é gravado", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-7"));
    const cinco = Array.from({ length: 5 }, (_, i) => noticiaValida(i + 1, EDICAO, i));
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: cinco }));

    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { aprovadas: number; minimo: number };
    expect(corpo.aprovadas).toBe(5);
    expect(corpo.minimo).toBe(8);
    expect(db.socialPost.create).not.toHaveBeenCalled();
  });
});

describe("o post carrossel da edição", () => {
  it("8 notícias válidas → post com 9 telas, status draft, tipo/layout radar, legenda lista as fontes", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-8"));
    const oito = oitoNoticiasValidas(EDICAO);
    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: oito }));

    expect(res.status).toBe(200);
    expect(db.socialPost.create).toHaveBeenCalledTimes(1);
    const linha = posts[0]!;
    expect(linha.format).toBe("carousel");
    expect(linha.status).toBe("draft");
    const cenas = JSON.parse(linha.scenesJson) as string[];
    expect(cenas.length).toBe(9); // capa + 8
    expect(String(linha.scriptJson)).toContain('"tipo":"radar"');
    expect(String(linha.scriptJson)).toContain('"layout":"radar"');
    expect(String(linha.scriptJson)).toContain(`"edicao":"${EDICAO}"`);
    for (const n of oito) {
      expect(linha.caption).toContain(n.veiculo);
    }
  });

  it("submeter a MESMA edição de novo ATUALIZA o post existente — não duplica", async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-9"));
    const oito = oitoNoticiasValidas(EDICAO);
    await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: oito }));
    expect(db.socialPost.create).toHaveBeenCalledTimes(1);

    // A segunda chamada precisa ENXERGAR o post já gravado — o mock de
    // `findMany` devolve o que `posts` já tem.
    db.socialPost.findMany.mockImplementation(async () =>
      posts.map((p) => ({ id: p.id, scriptJson: p.scriptJson })));

    const novaLista = [...oito.slice(0, 7), noticiaValida(99, EDICAO, 1)];
    const res2 = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: novaLista }));

    expect(res2.status).toBe(200);
    const corpo2 = (await res2.json()) as { atualizado: boolean; postId: string };
    expect(corpo2.atualizado).toBe(true);
    expect(corpo2.postId).toBe(posts[0]!.id);
    expect(db.socialPost.create).toHaveBeenCalledTimes(1); // continua 1, não 2
    expect(db.socialPost.update).toHaveBeenCalledTimes(1);
  });

  it('quando o pacote declara a série "radar" (exigeFonte), o cardsMin/horario/serieId DELA vencem o piso padrão', async () => {
    requireSession.mockResolvedValue(sessaoMaster("master-10"));
    db.client.findUnique.mockResolvedValue({
      pacoteJson: JSON.stringify({
        postsPorDia: 1, postsPorSemana: 1, formatos: ["feed_imagem"], dias: [1], horarios: ["10:00"],
        pilares: [{ nome: "radar", peso: 1 }],
        series: [
          { id: "radar-dioli-tech", nome: "Radar Dioli Tech", dias: [1], formato: "carrossel", cardsMin: 3, exigeFonte: true, horario: "08:00" },
        ],
      }),
    });
    // Só 3 notícias — bate o cardsMin DA SÉRIE (3), não o piso padrão (8).
    const tres = Array.from({ length: 3 }, (_, i) => noticiaValida(i + 1, EDICAO, i));

    const res = await postarRadar(corpoJson({ clientId: CLIENT_ID, edicao: EDICAO, noticias: tres }));

    expect(res.status).toBe(200);
    const linha = posts[0]!;
    expect(String(linha.scriptJson)).toContain('"serieId":"radar-dioli-tech"');
    expect(linha.pillar).toBe("radar");
    // 08:00 Brasília = 11:00 UTC.
    expect(linha.scheduledFor!.toISOString()).toMatch(/T11:00:00\.000Z$/);
  });
});
