// entrada-de-material-rotas.test.ts — as portas de
// `/api/agency/clients/[id]/entrada` e `/api/agency/clients/[id]/entrada/[entradaId]/confirmar`
// (1D-D1, 27/09/2026).
//
// Guarda igual a `pacote/route.ts`/`refacoes/route.ts`: sessão obrigatória,
// portal nunca entra, papel restrito (master/project_manager/social_staff),
// CSRF na mutação, rate limit, posse do cliente por `clienteOuNulo` (404,
// nunca 403).
//
// `@/lib/agency/esteira/entrada-de-material` é mockado por INTEIRO — a lógica
// de `interpretarFrase`/`encaixarNoCalendario` já tem teste próprio
// (`entrada-de-material.test.ts`); aqui só se prova a FIAÇÃO da rota (quem
// pode entrar, o que ela valida antes de chamar, o que devolve). O
// `InterpretacaoSchema` é reproduzido fielmente (zod puro, sem banco) — a
// mesma razão de `civilBrasilia` ser reproduzida noutros testes desta casa.
//
// Mocks TIPADOS (regra do CLAUDE.md).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requireSession = vi.hoisted(() => vi.fn());
const clienteOuNulo = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const deveBloquearMutacaoCrossSite = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const interpretarFrase = vi.hoisted(() => vi.fn());
const encaixarNoCalendario = vi.hoisted(() => vi.fn());
const entradaExistenteParaMedia = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/esteira/posse-do-cliente", () => ({ clienteOuNulo }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/security/navegacao-cross-site", () => ({ deveBloquearMutacaoCrossSite }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo,
  MAX_BYTES_POR_ARQUIVO: 120 * 1024 * 1024,
}));
vi.mock("@/lib/agency/media/video", () => ({
  duracaoDe: async (): Promise<number | null> => null,
}));

// A MESMA forma de `InterpretacaoSchema` — reproduzida, zod puro, sem puxar a
// árvore pesada do arquivo real (contrato-de-marca, dna-da-marca, publicacao...).
//
// ⚠️ NÃO envolva este `z.object(...)` em `vi.hoisted(...)` — foi tentado e
// QUEBROU A SUÍTE INTEIRA (D6, 29/09/2026): "ReferenceError: Cannot access
// '__vi_import_1__' before initialization". A causa é a mecânica de hoisting
// do Vitest (`@vitest/mocker/dist/chunk-hoistMocks.js`): `vi.hoisted(fn)`
// executa `fn()` NA HORA, na posição para onde o bloco inteiro foi movido —
// antes de QUALQUER import real deste arquivo, inclusive `import { z } from
// "zod"` (que vira `const __vi_import_N__ = await import("zod")`, colocado
// FISICAMENTE depois do bloco de `vi.hoisted`/`vi.mock`, não antes). Um
// `z.object(...)` dentro de `vi.hoisted` lê `__vi_import_N__.z` antes de
// `__vi_import_N__` existir — TDZ do import, não da variável local.
//
// A factory de `vi.mock(...)`, ao contrário, é LAZY: só roda quando o módulo
// mockado é de fato importado — aqui, quando `import { GET, POST } from
// ".../route"` (mais abaixo neste arquivo) dispara, dentro da rota, a
// resolução de `@/lib/agency/esteira/entrada-de-material`. Essa resolução
// acontece DEPOIS de `__vi_import_N__ = await import("zod")` já ter sido
// assinado, porque os imports reais são hoistados preservando a ORDEM
// relativa em que aparecem no arquivo, e `import { z } from "zod"` vem antes
// do import da rota.
//
// Por isso o schema é construído por uma FUNÇÃO (`schemaDeInterpretacao`,
// não `const`): função só executa quando CHAMADA — não importa em que posição
// do arquivo o hoisting a deixou, nenhuma chamada acontece antes de "zod" já
// resolvido. Chamada uma vez dentro da factory do `vi.mock` (abaixo) e de
// novo onde os `it()` precisam de `.parse()` para montar fixture.
function schemaDeInterpretacao() {
  return z.object({
    intencao: z.enum(["lancamento", "promocao", "evento", "produto", "bastidor", "outro"]),
    resumo: z.string().min(1).max(200),
    dataAlvo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    horarioAlvo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    dataAmbigua: z.boolean(),
    motivoDaAmbiguidade: z.string().nullable(),
    formatos: z.array(z.enum(["feed_imagem", "carrossel", "reels", "stories"])).min(1),
    quantidade: z.number().int().min(1).max(5),
  });
}
// Usada pelos `it()` (mesma forma que o mock devolve — ver a factory abaixo).
// `const` comum, sem `vi.hoisted`: não é referenciada de dentro de nenhum nó
// hoisted, então não sofre TDZ nenhuma — só precisa existir antes dos `it()`
// rodarem, e roda muito antes disso.
const InterpretacaoSchema = schemaDeInterpretacao();

// `hojeIsoBrasilia` reproduzida fielmente (a mesma conta de fuso de
// `calendario-editorial.ts`/`semana-editorial.ts`, mockado do mesmo jeito
// nos arquivos irmãos desta suíte) — usada pelo achado nº3 (D5, 28/09/2026):
// o `confirmar/route.ts` troca `new Date().toISOString()` cru por esta
// função, para "já passou" ser contra o dia civil de BRASÍLIA, não UTC.
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function hojeIsoBrasilia(hoje: Date): string {
  const brt = new Date(hoje.getTime() - 3 * 60 * 60_000);
  return `${brt.getUTCFullYear()}-${pad2(brt.getUTCMonth() + 1)}-${pad2(brt.getUTCDate())}`;
}

vi.mock("@/lib/agency/esteira/entrada-de-material", () => ({
  InterpretacaoSchema: schemaDeInterpretacao(),
  interpretarFrase,
  encaixarNoCalendario,
  entradaExistenteParaMedia,
  hojeIsoBrasilia,
}));

interface LinhaDeEntrada {
  id: string;
  workspaceId: string;
  clientId: string;
  origem: string;
  frase: string;
  interpretacaoJson: string | null;
  mediaAssetIdsJson: string;
  socialPostIdsJson: string;
  status: string;
  motivo: string | null;
  criadaEm: Date;
  atualizadaEm: Date;
}

let entradas: Record<string, LinhaDeEntrada> = {};

const db = vi.hoisted(() => ({
  entradaDeMaterial: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { GET, POST } from "@/app/api/agency/clients/[id]/entrada/route";
import { POST as POST_CONFIRMAR } from "@/app/api/agency/clients/[id]/entrada/[entradaId]/confirmar/route";

function sessaoDe(opts: { role?: string; workspaceId?: string; clientId?: string } = {}) {
  return {
    userId: "u1", email: "quem@dioli.studio", name: "Quem",
    role: opts.role ?? "master", workspaceId: opts.workspaceId ?? "ws1", clientId: opts.clientId,
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxConfirmar = (id: string, entradaId: string) => ({ params: Promise.resolve({ id, entradaId }) });

function getReq(): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/entrada");
}

function postMultipart(frase: string | null, arquivos: File[]): NextRequest {
  const form = new FormData();
  if (frase !== null) form.set("frase", frase);
  for (const a of arquivos) form.append("arquivos", a);
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/entrada", {
    method: "POST",
    body: form,
  });
}

function postConfirmar(body: unknown): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/entrada/ent1/confirmar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function novaEntrada(overrides: Partial<LinhaDeEntrada> = {}): LinhaDeEntrada {
  return {
    id: "ent1", workspaceId: "ws1", clientId: "cli1", origem: "upload",
    frase: "Lançamento, postar dia 15/10.",
    interpretacaoJson: JSON.stringify(
      InterpretacaoSchema.parse({
        intencao: "lancamento", resumo: "Chegou!", dataAlvo: null, horarioAlvo: null,
        dataAmbigua: true, motivoDaAmbiguidade: "preciso da data", formatos: ["feed_imagem"], quantidade: 1,
      }),
    ),
    mediaAssetIdsJson: JSON.stringify(["med_1"]),
    socialPostIdsJson: "[]",
    status: "preciso_confirmar",
    motivo: "preciso da data",
    criadaEm: new Date("2026-09-28T12:00:00.000Z"),
    atualizadaEm: new Date("2026-09-28T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  entradas = {};
  vi.clearAllMocks();

  requireSession.mockResolvedValue({ session: sessaoDe(), error: null });
  clienteOuNulo.mockResolvedValue({ id: "cli1" });
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  deveBloquearMutacaoCrossSite.mockReturnValue(false);
  guardarArquivo.mockResolvedValue({
    ok: true,
    arquivo: { id: "med_novo", fileName: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 100, url: "/api/media/med_novo" },
  });
  // Caso limpo por padrão: nenhuma entrada anterior referencia esta mídia.
  // Os testes de dedupe (achado nº2) sobrescrevem por cima.
  entradaExistenteParaMedia.mockResolvedValue(null);
  interpretarFrase.mockResolvedValue({
    ok: true,
    interpretacao: InterpretacaoSchema.parse({
      intencao: "lancamento", resumo: "Chegou!", dataAlvo: "2026-10-15", horarioAlvo: null,
      dataAmbigua: false, motivoDaAmbiguidade: null, formatos: ["feed_imagem"], quantidade: 1,
    }),
  });
  // O mock IMITA o efeito colateral da função real (que grava "encaixada" +
  // `socialPostIdsJson` no banco) — senão a rota, que só RELÊ o registro
  // quando `encaixe.ok`, nunca veria a mudança (a lógica de gravação em si já
  // tem teste próprio em `entrada-de-material.test.ts`).
  encaixarNoCalendario.mockImplementation(
    async ({ entradaId }: { workspaceId: string; clientId: string; entradaId: string; agora: Date }): Promise<{
      ok: true; socialPostIds: string[]; deslocados: never[];
    }> => {
      const atual = entradas[entradaId];
      if (atual) entradas[entradaId] = { ...atual, status: "encaixada", socialPostIdsJson: JSON.stringify(["sp1"]) };
      return { ok: true, socialPostIds: ["sp1"], deslocados: [] };
    },
  );

  db.entradaDeMaterial.create.mockImplementation(
    async ({ data }: { data: Partial<LinhaDeEntrada> }): Promise<LinhaDeEntrada> => {
      const nova = novaEntrada({
        id: "ent1", status: "recebida", motivo: null, interpretacaoJson: null,
        socialPostIdsJson: "[]", ...data,
      } as Partial<LinhaDeEntrada>);
      entradas[nova.id] = nova;
      return nova;
    },
  );
  db.entradaDeMaterial.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<LinhaDeEntrada> }): Promise<LinhaDeEntrada> => {
      const atual = entradas[where.id]!;
      const atualizada = { ...atual, ...data };
      entradas[where.id] = atualizada;
      return atualizada;
    },
  );
  db.entradaDeMaterial.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; workspaceId: string; clientId: string } }): Promise<LinhaDeEntrada | null> =>
      entradas[where.id] && entradas[where.id]!.workspaceId === where.workspaceId && entradas[where.id]!.clientId === where.clientId
        ? entradas[where.id]!
        : null,
  );
  db.entradaDeMaterial.findMany.mockImplementation(async (): Promise<LinhaDeEntrada[]> => Object.values(entradas));
  db.entradaDeMaterial.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }): Promise<LinhaDeEntrada | null> => entradas[where.id] ?? null,
  );
});

function arquivoDeImagem(nome = "foto.jpg", mime = "image/jpeg", tamanho = 100): File {
  return new File([new Uint8Array(tamanho)], nome, { type: mime });
}

// ═════════════════════════════════════════════════════════════════════════
// GET /entrada
// ═════════════════════════════════════════════════════════════════════════

describe("GET /entrada — guarda", () => {
  it("sessão de portal (clientId) devolve 403 e não toca o banco", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe({ clientId: "cli1" }), error: null });
    const res = await GET(getReq(), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(clienteOuNulo).not.toHaveBeenCalled();
  });

  it("cliente de outro workspace devolve 404", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await GET(getReq(), ctx("cli-de-outro-workspace"));
    expect(res.status).toBe(404);
  });

  it("lista as entradas do cliente", async () => {
    entradas["ent1"] = novaEntrada();
    const res = await GET(getReq(), ctx("cli1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entradas).toHaveLength(1);
    expect(body.entradas[0].status).toBe("preciso_confirmar");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// POST /entrada
// ═════════════════════════════════════════════════════════════════════════

describe("POST /entrada — guarda", () => {
  it("papel fora da lista devolve 403 e não grava", async () => {
    requireSession.mockResolvedValue({
      session: null,
      error: NextResponse.json({ error: "Forbidden — requires role: master | project_manager | social_staff" }, { status: 403 }),
    });
    const res = await POST(postMultipart("frase", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(db.entradaDeMaterial.create).not.toHaveBeenCalled();
  });

  it("origem cross-site é bloqueada", async () => {
    deveBloquearMutacaoCrossSite.mockReturnValue(true);
    const res = await POST(postMultipart("frase", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(db.entradaDeMaterial.create).not.toHaveBeenCalled();
  });

  it("rate limit estourado devolve 429", async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfter: 30 });
    const res = await POST(postMultipart("frase", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(429);
  });

  it("cliente de outro workspace devolve 404", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await POST(postMultipart("frase", [arquivoDeImagem()]), ctx("cli-de-outro-workspace"));
    expect(res.status).toBe(404);
    expect(db.entradaDeMaterial.create).not.toHaveBeenCalled();
  });

  it("sem frase é 400", async () => {
    const res = await POST(postMultipart(null, [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(400);
  });

  it("sem arquivo é 400", async () => {
    const res = await POST(postMultipart("frase", []), ctx("cli1"));
    expect(res.status).toBe(400);
  });

  it("MIME que não é imagem/vídeo é 400", async () => {
    const res = await POST(postMultipart("frase", [arquivoDeImagem("logo.pdf", "application/pdf")]), ctx("cli1"));
    expect(res.status).toBe(400);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });
});

describe("POST /entrada — caminho feliz", () => {
  it("interpretação não ambígua encaixa na hora", async () => {
    const res = await POST(postMultipart("Lançamento, postar dia 15/10.", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(201);
    expect(guardarArquivo).toHaveBeenCalledTimes(1);
    expect(interpretarFrase).toHaveBeenCalledTimes(1);
    expect(encaixarNoCalendario).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.entrada.status).toBe("encaixada");
  });

  it('interpretação ambígua fica em "preciso_confirmar" e NÃO chama encaixarNoCalendario', async () => {
    interpretarFrase.mockResolvedValue({
      ok: true,
      interpretacao: InterpretacaoSchema.parse({
        intencao: "lancamento", resumo: "Chegou!", dataAlvo: null, horarioAlvo: null,
        dataAmbigua: true, motivoDaAmbiguidade: "preciso da data", formatos: ["feed_imagem"], quantidade: 1,
      }),
    });
    const res = await POST(postMultipart("Lançamento, postar sexta.", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(201);
    expect(encaixarNoCalendario).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.entrada.status).toBe("preciso_confirmar");
    expect(body.entrada.motivo).toBe("preciso da data");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// POST /entrada — dedupe (achado nº2 da `qualidade`, D5, 28/09/2026): a
// mesma foto já entrada por outro caminho (ex.: a vigia do Drive) não pode
// virar um SEGUNDO post.
// ═════════════════════════════════════════════════════════════════════════

describe("POST /entrada — a mesma mídia já entrou por outro caminho (Drive→upload)", () => {
  it("mídia já referenciada por uma entrada existente: recusa sem interpretar nem encaixar", async () => {
    entradaExistenteParaMedia.mockResolvedValue({ id: "ent-do-drive" });
    const res = await POST(postMultipart("Lançamento, postar dia 15/10.", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(201);
    expect(interpretarFrase).not.toHaveBeenCalled();
    expect(encaixarNoCalendario).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.entrada.status).toBe("recusada");
    expect(body.entrada.motivo).toMatch(/ent-do-drive/);
  });

  it("caso limpo: foto diferente (nenhuma entrada anterior para esta mídia) segue o fluxo normal", async () => {
    entradaExistenteParaMedia.mockResolvedValue(null);
    const res = await POST(postMultipart("Lançamento, postar dia 15/10.", [arquivoDeImagem()]), ctx("cli1"));
    expect(res.status).toBe(201);
    expect(interpretarFrase).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.entrada.status).toBe("encaixada");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// POST /entrada/[entradaId]/confirmar
// ═════════════════════════════════════════════════════════════════════════

describe("POST /entrada/[entradaId]/confirmar — guarda", () => {
  it("sessão de portal devolve 403", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe({ clientId: "cli1" }), error: null });
    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-10-15" }), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(403);
  });

  it("cliente de outro workspace devolve 404", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-10-15" }), ctxConfirmar("cli-de-outro-workspace", "ent1"));
    expect(res.status).toBe(404);
  });

  it("entrada inexistente devolve 404", async () => {
    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-10-15" }), ctxConfirmar("cli1", "ent-que-nao-existe"));
    expect(res.status).toBe(404);
  });

  it('entrada que não está "preciso_confirmar" devolve 409', async () => {
    entradas["ent1"] = novaEntrada({ status: "encaixada" });
    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-10-15" }), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(409);
    expect(encaixarNoCalendario).not.toHaveBeenCalled();
  });

  it("corpo sem dataAlvo é 400", async () => {
    entradas["ent1"] = novaEntrada();
    const res = await POST_CONFIRMAR(postConfirmar({}), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(400);
  });

  it("caminho feliz — confirma a data e encaixa", async () => {
    entradas["ent1"] = novaEntrada();

    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-10-15" }), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entrada.status).toBe("encaixada");
    expect(body.entrada.socialPostIds).toEqual(["sp1"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// POST /entrada/[entradaId]/confirmar — achado nº3 (`qualidade`, D5,
// 28/09/2026): "já passou" tem que ser contra o dia civil de BRASÍLIA, nunca
// contra `new Date().toISOString()` cru — o mesmo erro simétrico ("sexta
// perto da virada de fuso") que a casa já cobra corrigir noutros lugares.
// ═════════════════════════════════════════════════════════════════════════

describe("POST /entrada/[entradaId]/confirmar — fuso de Brasília, não UTC cru", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('22h30 em Brasília (já "amanhã" em UTC) confirmando a data de HOJE em Brasília: passa', async () => {
    // 28/09/2026 22:30 BRT = 29/09/2026 01:30 UTC — o dia UTC já virou.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T01:30:00.000Z"));
    entradas["ent1"] = novaEntrada();

    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-09-28" }), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(200);
  });

  it("no mesmo instante, confirmar a data de ONTEM (em Brasília) continua recusando", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T01:30:00.000Z")); // 28/09 22:30 BRT
    entradas["ent1"] = novaEntrada();

    const res = await POST_CONFIRMAR(postConfirmar({ dataAlvo: "2026-09-27" }), ctxConfirmar("cli1", "ent1"));
    expect(res.status).toBe(400);
  });
});
