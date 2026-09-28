// A VIGIA DA PASTA "/Entrada de material" DO DRIVE — 1D-D2, 27/09/2026.
//
// Oito coisas provadas aqui — os seis originais (item 6 da ficha de
// despacho) mais os dois achados da `qualidade` (D5, 28/09/2026):
//   1. Sem GOOGLE_SA_JSON, nada bate na rede e o banco de clientes nem é lido.
//   2. Escalonamento: no máximo N clientes por tique, o mais antigo primeiro
//      (nunca visto vem antes de qualquer data real).
//   3. A query ao Drive carrega `modifiedTime > <cursor>` quando o cliente já
//      tem `entradaDriveVistaEm`.
//   4. A FRASE: descrição do arquivo > `.txt` companheiro > nome do arquivo.
//   5. Idempotência por `driveFileId` — o mesmo arquivo nunca vira uma segunda
//      `EntradaDeMaterial`.
//   6. O cursor só avança DEPOIS de processar — inclusive quando o cliente
//      falha no meio (o cliente não fica preso pra sempre, mas também não é
//      retentado a cada 5 minutos).
//   7. (D5) A duração do vídeo é MEDIDA antes de interpretar — e quando a
//      medição falha (não "nunca medimos"), a IA não pode virar reels às
//      cegas.
//   8. (D5) A mesma mídia (por sha256/`MediaAsset`) já entrada por OUTRO
//      caminho (upload manual) não vira uma segunda `EntradaDeMaterial`.
//
// ⚠️ Este arquivo é escrito CONTRA O CONTRATO do bloco 1D-D1
// (`lib/agency/esteira/entrada-de-material.ts`: `interpretarFrase`,
// `encaixarNoCalendario`) e do schema dele (`EntradaDeMaterial`,
// `Client.entradaDriveVistaEm`) — ambos declarados na ficha de despacho e
// mockados abaixo via `vi.mock`. Os dois foram despachados em paralelo, em
// worktrees isolados; esta suíte só roda de verdade depois que o PM integra
// D1 e D2 na mesma árvore.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── O BANCO DUBLÊ ────────────────────────────────────────────────────────────

interface ClienteFake {
  id: string; workspaceId: string; pastaDriveUrl: string | null;
  autorizacaoDriveEm: Date | null; entradaDriveVistaEm: Date | null;
}

const db = vi.hoisted(() => ({
  client: {
    findMany: vi.fn(async (): Promise<ClienteFake[]> => []),
    // Assinatura ANOTADA (regra do CLAUDE.md): sem ela, `vi.fn` infere `[]`
    // (tupla de zero elementos) para os argumentos, e `mock.calls[i][0]`
    // (usado no teste de escalonamento, abaixo) quebra `tsc --noEmit` com
    // "Tuple type '[]' of length '0' has no element at index '0'" mesmo com
    // o teste verde — `vitest` não confere tipo.
    update: vi.fn(
      async (_args: { where: { id: string }; data: { entradaDriveVistaEm: Date } }): Promise<{ id: string }> => ({ id: "c1" }),
    ),
  },
  entradaDeMaterial: {
    findFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
    // Assinatura ANOTADA (mesma regra do `client.update` acima) — os testes
    // de duração/dedupe (achados nº1/nº2, D5, 28/09/2026) leem `mock.calls`
    // destas duas para conferir o que foi GRAVADO, não só o que foi PASSADO
    // para `interpretarFrase`.
    create: vi.fn(async (_args: { data: Record<string, unknown> }): Promise<{ id: string }> => ({ id: "ent1" })),
    update: vi.fn(
      async (_args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }> => ({ id: "ent1" }),
    ),
  },
  mediaAsset: {
    findFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
    findMany: vi.fn(async (): Promise<Array<{ id: string }>> => []),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const guardarArquivo = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; arquivo: { id: string; fileName: string; mimeType: string; sizeBytes: number; url: string } }> => ({
    ok: true,
    arquivo: { id: "med_novo", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 4, url: "/api/media/med_novo" },
  })),
);
const apagarArquivo = vi.hoisted(() => vi.fn(async (): Promise<boolean> => true));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo,
  apagarArquivo,
  MAX_BYTES_POR_ARQUIVO: 120 * 1024 * 1024,
}));

// `duracaoDe` — a medição real de vídeo (ffprobe) é SUBSTITUÍDA aqui: os
// testes de "duração do vídeo" (achado nº1, D5, 28/09/2026) controlam o
// retorno por teste; o padrão (`null`) representa "ffprobe não conseguiu
// ler" — o mesmo default que os arquivos irmãos desta casa usam
// (`entrada-de-material-rotas.test.ts`).
const duracaoDe = vi.hoisted(() => vi.fn(async (): Promise<number | null> => null));
vi.mock("@/lib/agency/media/video", () => ({ duracaoDe }));

// ── O CONTRATO DO D1, MOCADO ────────────────────────────────────────────────

interface InterpretacaoFake {
  intencao: "lancamento"; resumo: string; dataAlvo: string | null; horarioAlvo: string | null;
  dataAmbigua: boolean; motivoDaAmbiguidade: string | null; formatos: string[]; quantidade: number;
}

const interpretarFrase = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; interpretacao: InterpretacaoFake } | { ok: false; motivo: string }> => ({
    ok: false,
    motivo: "dublê parou aqui — só interessa o QUE FOI PASSADO para esta função",
  })),
);
const encaixarNoCalendario = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; socialPostIds: string[]; deslocados: never[] } | { ok: false; motivo: string }> => ({
    ok: true,
    socialPostIds: ["sp1"],
    deslocados: [],
  })),
);
// `entradaExistenteParaMedia` — o dedupe do achado nº2 (D5, 28/09/2026).
// Padrão `null` = caso limpo (nenhuma entrada anterior para esta mídia); os
// testes de dedupe sobrescrevem por cima.
const entradaExistenteParaMedia = vi.hoisted(() => vi.fn(async (): Promise<{ id: string } | null> => null));
vi.mock("@/lib/agency/esteira/entrada-de-material", () => ({
  interpretarFrase,
  encaixarNoCalendario,
  entradaExistenteParaMedia,
}));

import { generateKeyPairSync } from "node:crypto";

const SA_JSON_VALIDO = JSON.stringify({
  client_email: "conta-dioli@projeto.iam.gserviceaccount.com",
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

const PASTA_ID = "PASTA1XXXXX";
const SUB_ID = "SUBENTRADA";

function pastaComSubpasta() {
  return { files: [{ id: SUB_ID, name: "Entrada de material", mimeType: "application/vnd.google-apps.folder" }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // `clearAllMocks` limpa histórico de chamada, NUNCA a implementação — um
  // `mockResolvedValue` de um teste anterior vazaria para o próximo sem isto.
  // Cada teste que precisa de outro comportamento sobrescreve por cima.
  db.client.findMany.mockResolvedValue([]);
  db.client.update.mockResolvedValue({ id: "c1" });
  db.entradaDeMaterial.findFirst.mockResolvedValue(null);
  db.entradaDeMaterial.create.mockResolvedValue({ id: "ent1" });
  db.entradaDeMaterial.update.mockResolvedValue({ id: "ent1" });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.findMany.mockResolvedValue([]);
  guardarArquivo.mockResolvedValue({
    ok: true,
    arquivo: { id: "med_novo", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 4, url: "/api/media/med_novo" },
  });
  apagarArquivo.mockResolvedValue(true);
  interpretarFrase.mockResolvedValue({ ok: false, motivo: "dublê parou aqui — só interessa o QUE FOI PASSADO para esta função" });
  encaixarNoCalendario.mockResolvedValue({ ok: true, socialPostIds: ["sp1"], deslocados: [] });
  duracaoDe.mockResolvedValue(null);
  entradaExistenteParaMedia.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEM CREDENCIAL — nada bate na rede, nem o banco de clientes é lido.
// ═══════════════════════════════════════════════════════════════════════════

describe("sem GOOGLE_SA_JSON", () => {
  it("recusa antes de qualquer rede e antes de consultar clientes", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({});

    expect(r.credencialAusente).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ESCALONAMENTO — no máximo N clientes por tique, o mais antigo primeiro.
// ═══════════════════════════════════════════════════════════════════════════

describe("escalonamento", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
  });

  it("processa só `limiteDeClientes`, o mais antigo (e o nunca visto) primeiro", async () => {
    db.client.findMany.mockResolvedValue([
      { id: "recente", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: new Date("2026-09-28T10:00:00Z") },
      { id: "nunca-visto", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
      { id: "mais-antigo", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: new Date("2026-09-28T05:00:00Z") },
    ]);
    // Nenhum tem a subpasta — a rodada termina em falha "não encontrada" para
    // quem foi processado, o que basta para provar QUEM foi tocado e em que
    // ordem, sem precisar simular download nenhum.
    const fetchDuble = vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchDuble);

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ limiteDeClientes: 2, agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.clientesVarridos).toBe(2);
    const ordem = db.client.update.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(ordem).toEqual(["nunca-visto", "mais-antigo"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. O CURSOR VAI NA QUERY — `modifiedTime > <cursor>`.
// ═══════════════════════════════════════════════════════════════════════════

/** O parâmetro `q` (a sintaxe de busca do Drive), e só ele — nunca a URL
 *  inteira. `fields=files(...,modifiedTime,...)` LEGITIMAMENTE contém a
 *  substring "modifiedTime" (é o campo que a API devolve), então checar a URL
 *  inteira dá falso positivo/negativo conforme o que `fields` pedir. Só `q` é
 *  o filtro de fato. */
function valorDoQ(url: string): string {
  return new URL(url).searchParams.get("q") ?? "";
}

describe("cursor incremental", () => {
  it("a query da subpasta carrega modifiedTime > o cursor do cliente", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    const cursor = new Date("2026-09-20T10:00:00.000Z");
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: cursor },
    ]);

    const urlsChamadas: string[] = [];
    const fetchDuble = vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      urlsChamadas.push(u);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchDuble);

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    const comFiltro = urlsChamadas.find((u) => u.includes(SUB_ID) && valorDoQ(u).includes("modifiedTime"));
    expect(comFiltro).toBeDefined();
    expect(valorDoQ(comFiltro!)).toContain(cursor.toISOString());
  });

  it("cliente NUNCA vistado consulta sem filtro de modifiedTime — não perde o que já estava lá", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
    const urlsChamadas: string[] = [];
    const fetchDuble = vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      urlsChamadas.push(u);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchDuble);

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    const daSubpasta = urlsChamadas.filter((u) => u.includes(SUB_ID));
    expect(daSubpasta.length).toBeGreaterThan(0);
    // Só o parâmetro `q` importa aqui — `fields` sempre pede `modifiedTime`
    // (é assim que o item 4, "a frase", lê a data de modificação de cada
    // arquivo), e isso NÃO é o filtro incremental que este teste prova.
    for (const u of daSubpasta) expect(valorDoQ(u)).not.toContain("modifiedTime");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. A FRASE — descrição > .txt companheiro > nome do arquivo.
// ═══════════════════════════════════════════════════════════════════════════

describe("a frase", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
  });

  function fetchComItens(itens: Array<{ id: string; name: string; mimeType: string; size?: string; description?: string }>, conteudoDoTxt: Record<string, string>) {
    return vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID) && !u.includes(SUB_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      if (u.includes(SUB_ID)) return new Response(JSON.stringify({ files: itens }), { status: 200 });
      if (u.includes("alt=media")) {
        const idMatch = u.match(/files\/([^?]+)\?/);
        const id = idMatch ? idMatch[1] : "";
        const conteudo = conteudoDoTxt[id] ?? "AAAA";
        return new Response(conteudo, { status: 200, headers: { "content-length": String(conteudo.length) } });
      }
      return new Response("{}", { status: 404 });
    });
  }

  it("usa a DESCRIÇÃO do arquivo quando ela existe", async () => {
    vi.stubGlobal("fetch", fetchComItens(
      [{ id: "f1", name: "foto.jpg", mimeType: "image/jpeg", size: "4", description: "lançamento X, postar dia 10" }],
      {},
    ));
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(interpretarFrase).toHaveBeenCalledWith(expect.objectContaining({ frase: "lançamento X, postar dia 10" }));
  });

  it("sem descrição, usa o .txt companheiro (mesmo nome-base)", async () => {
    vi.stubGlobal("fetch", fetchComItens(
      [
        { id: "f1", name: "foto.jpg", mimeType: "image/jpeg", size: "4" },
        { id: "t1", name: "foto.txt", mimeType: "text/plain", size: "20" },
      ],
      { t1: "promoção Y, postar sexta" },
    ));
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(interpretarFrase).toHaveBeenCalledWith(expect.objectContaining({ frase: "promoção Y, postar sexta" }));
  });

  it("sem descrição e sem .txt, usa o nome do arquivo", async () => {
    vi.stubGlobal("fetch", fetchComItens(
      [{ id: "f1", name: "IMG_001.jpg", mimeType: "image/jpeg", size: "4" }],
      {},
    ));
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(interpretarFrase).toHaveBeenCalledWith(expect.objectContaining({ frase: "IMG_001.jpg" }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. IDEMPOTÊNCIA POR driveFileId.
// ═══════════════════════════════════════════════════════════════════════════

describe("idempotência por driveFileId", () => {
  it("arquivo já registrado como EntradaDeMaterial não baixa de novo nem cria outra linha", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
    db.entradaDeMaterial.findFirst.mockResolvedValue({ id: "ent-ja-existe" });

    const fetchDuble = vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID) && !u.includes(SUB_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      if (u.includes(SUB_ID)) return new Response(JSON.stringify({ files: [{ id: "f1", name: "foto.jpg", mimeType: "image/jpeg", size: "4" }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchDuble);

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.entradasCriadas).toBe(0);
    expect(db.entradaDeMaterial.create).not.toHaveBeenCalled();
    expect(guardarArquivo).not.toHaveBeenCalled();
    // Nenhuma chamada de download do binário (`alt=media`) — idempotência
    // barra ANTES do baixarBytes, não depois.
    const chamouDownload = fetchDuble.mock.calls.some((c) => String(c[0]).includes("alt=media"));
    expect(chamouDownload).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. O CURSOR SÓ AVANÇA DEPOIS — inclusive quando o cliente falha no meio.
// ═══════════════════════════════════════════════════════════════════════════

describe("o cursor só avança depois de processar", () => {
  it("avança para `agora`, mesmo quando o processamento do cliente lança", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
    db.entradaDeMaterial.findFirst.mockRejectedValue(new Error("banco fora do ar neste instante"));

    const fetchDuble = vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID) && !u.includes(SUB_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      if (u.includes(SUB_ID)) return new Response(JSON.stringify({ files: [{ id: "f1", name: "foto.jpg", mimeType: "image/jpeg", size: "4" }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchDuble);

    const agora = new Date("2026-09-28T12:00:00Z");
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora });

    expect(r.falhas.length).toBeGreaterThan(0);
    expect(db.client.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { entradaDriveVistaEm: agora } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. DURAÇÃO DO VÍDEO — achado nº1 da `qualidade` (D5, 28/09/2026): vídeo do
//    Drive ia para `interpretarFrase` sem NUNCA conferir duração.
// ═══════════════════════════════════════════════════════════════════════════

describe("duração do vídeo (achado nº1, D5, 28/09/2026)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
  });

  function fetchComVideo() {
    return vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID) && !u.includes(SUB_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      if (u.includes(SUB_ID)) return new Response(JSON.stringify({ files: [{ id: "v1", name: "video.mp4", mimeType: "video/mp4", size: "4000" }] }), { status: 200 });
      if (u.includes("alt=media")) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-length": "4" } });
      return new Response("{}", { status: 404 });
    });
  }

  it("mede a duração dos bytes JÁ BAIXADOS e passa `duracaoS` para `interpretarFrase` (a mesma função do upload manual)", async () => {
    duracaoDe.mockResolvedValue(42);
    vi.stubGlobal("fetch", fetchComVideo());

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(duracaoDe).toHaveBeenCalled();
    expect(interpretarFrase).toHaveBeenCalledWith(
      expect.objectContaining({ midias: [{ mime: "video/mp4", duracaoS: 42 }] }),
    );
  });

  it('METADE 1 — a IA pede "reels" e a MEDIÇÃO FALHA (ffprobe não leu, mesmo com os bytes em mãos): força "preciso_confirmar", nunca vira reels às cegas', async () => {
    duracaoDe.mockResolvedValue(null); // medição tentada e falhou — não é "nunca medimos"
    interpretarFrase.mockResolvedValue({
      ok: true,
      interpretacao: {
        intencao: "lancamento", resumo: "Chegou!", dataAlvo: "2026-10-15", horarioAlvo: null,
        dataAmbigua: false, motivoDaAmbiguidade: null, formatos: ["reels"], quantidade: 1,
      },
    });
    vi.stubGlobal("fetch", fetchComVideo());

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.ambiguas).toBe(1);
    expect(encaixarNoCalendario).not.toHaveBeenCalled();
    // `data` é `Record<string, unknown>` (assinatura genérica do dublê de
    // `prisma.entradaDeMaterial.update`) — o `as unknown as` é o mesmo desvio
    // que o resto da casa usa para estreitar um `Record` num formato
    // específico só para leitura de teste (nunca assignável direto: `unknown`
    // não é `string`).
    const gravada = db.entradaDeMaterial.update.mock.calls.find(
      (c) => (c[0].data as unknown as { status?: string }).status === "preciso_confirmar",
    );
    expect(gravada).toBeDefined();
    expect(String((gravada![0].data as unknown as { motivo?: string }).motivo)).toMatch(/medir a duração/);
  });

  it("METADE 2 — vídeo CURTO com duração conhecida (medição bem-sucedida) vira reels de verdade, sem forçar ambiguidade", async () => {
    duracaoDe.mockResolvedValue(20);
    interpretarFrase.mockResolvedValue({
      ok: true,
      interpretacao: {
        intencao: "lancamento", resumo: "Chegou!", dataAlvo: "2026-10-15", horarioAlvo: null,
        dataAmbigua: false, motivoDaAmbiguidade: null, formatos: ["reels"], quantidade: 1,
      },
    });
    vi.stubGlobal("fetch", fetchComVideo());

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.ambiguas).toBe(0);
    expect(r.encaixadas).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. DEDUPE — achado nº2 da `qualidade` (D5, 28/09/2026): a mesma foto por
//    upload manual + Drive não pode virar DOIS posts.
// ═══════════════════════════════════════════════════════════════════════════

describe("dedupe — a mesma mídia não vira duas entradas (achado nº2, D5, 28/09/2026)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
  });

  function fetchComFoto() {
    return vi.fn(async (input: string | URL): Promise<Response> => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      if (u.includes(PASTA_ID) && !u.includes(SUB_ID)) return new Response(JSON.stringify(pastaComSubpasta()), { status: 200 });
      if (u.includes(SUB_ID)) return new Response(JSON.stringify({ files: [{ id: "f1", name: "foto.jpg", mimeType: "image/jpeg", size: "4" }] }), { status: 200 });
      if (u.includes("alt=media")) return new Response(new Uint8Array([9, 9, 9, 9]), { status: 200, headers: { "content-length": "4" } });
      return new Response("{}", { status: 404 });
    });
  }

  it("METADE 1 (upload→Drive) — a mesma mídia já entrou pelo upload manual: recusa sem interpretar nem encaixar, e registra qual entrada já existia", async () => {
    entradaExistenteParaMedia.mockResolvedValue({ id: "ent-do-upload" });
    vi.stubGlobal("fetch", fetchComFoto());

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.duplicadas).toBe(1);
    expect(r.entradasCriadas).toBe(1);
    expect(interpretarFrase).not.toHaveBeenCalled();
    expect(encaixarNoCalendario).not.toHaveBeenCalled();

    const criada = db.entradaDeMaterial.create.mock.calls[0]?.[0]?.data as unknown as
      | { status?: string; motivo?: string }
      | undefined;
    expect(criada?.status).toBe("recusada");
    expect(String(criada?.motivo)).toMatch(/ent-do-upload/);
  });

  it("METADE 2 (caso limpo) — foto diferente, nenhuma entrada anterior: segue o fluxo normal", async () => {
    entradaExistenteParaMedia.mockResolvedValue(null);
    vi.stubGlobal("fetch", fetchComFoto());

    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await vigiarEntradaDeMaterial({ agora: new Date("2026-09-28T12:00:00Z") });

    expect(r.duplicadas).toBe(0);
    expect(interpretarFrase).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A LIMPEZA DE FIM DE CONTRATO.
// ═══════════════════════════════════════════════════════════════════════════

describe("apagarMaterialDoDriveAoEncerrarContrato", () => {
  it("apaga só os MediaAsset com uploadedBy = 'Drive do cliente' DAQUELE cliente", async () => {
    db.mediaAsset.findMany.mockResolvedValue([{ id: "med1" }, { id: "med2" }]);
    apagarArquivo.mockResolvedValue(true);

    const { apagarMaterialDoDriveAoEncerrarContrato } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await apagarMaterialDoDriveAoEncerrarContrato("cliente-x");

    expect(db.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "cliente-x", uploadedBy: "Drive do cliente" } }),
    );
    expect(apagarArquivo).toHaveBeenCalledTimes(2);
    expect(r.apagados).toBe(2);
  });

  it("nenhum arquivo do Drive para o cliente: zero apagados, sem lançar", async () => {
    db.mediaAsset.findMany.mockResolvedValue([]);
    const { apagarMaterialDoDriveAoEncerrarContrato } = await import("@/lib/integrations/google/vigia-da-entrada");
    const r = await apagarMaterialDoDriveAoEncerrarContrato("cliente-sem-drive");
    expect(r.apagados).toBe(0);
    expect(apagarArquivo).not.toHaveBeenCalled();
  });
});
