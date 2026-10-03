// PRONTOS PARA POSTAR e pastas criadas à mão (CEO, 03/10/2026).
//   • a pasta "Prontos para postar" é vigiada junto com a Entrada; o arquivo
//     dela vira UM story com a mídia como veio, mesmo se a IA não responder;
//   • a pasta é achada por SEMELHANÇA ("Pronto para postar", "Entrada de Material");
//   • o nome do prato: legível entra, nome de câmera fica vazio.
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
  socialPost: {
    findUnique: vi.fn(async (): Promise<{ scriptJson: string | null } | null> => ({ scriptJson: '{"fase":"pauta"}' })),
    update: vi.fn(async (_args: { where: { id: string }; data: { scriptJson: string } }): Promise<{ id: string }> => ({ id: "sp1" })),
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

const PRONTOS_ID = "SUBPRONTOS";

function fetchComPastas(raiz: Array<{ id: string; name: string }>, porPasta: Record<string, Array<{ id: string; name: string; mimeType: string; size?: string }>>) {
  return vi.fn(async (input: string | URL): Promise<Response> => {
    const u = String(input);
    if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    if (u.includes("alt=media")) return new Response("AAAA", { status: 200, headers: { "content-length": "4" } });
    for (const [id, itens] of Object.entries(porPasta)) {
      if (u.includes(`'${id}'`) || u.includes(encodeURIComponent(`'${id}'`)) || u.includes(id)) {
        return new Response(JSON.stringify({ files: itens }), { status: 200 });
      }
    }
    if (u.includes(PASTA_ID)) {
      return new Response(JSON.stringify({ files: raiz.map((r) => ({ ...r, mimeType: "application/vnd.google-apps.folder" })) }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

describe("Prontos para postar", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findMany.mockResolvedValue([
      { id: "c1", workspaceId: "w1", pastaDriveUrl: `https://drive.google.com/drive/folders/${PASTA_ID}`, autorizacaoDriveEm: new Date(), entradaDriveVistaEm: null },
    ]);
  });

  it("pasta criada à mão ('Pronto para postar', singular) é achada; o arquivo vira UM story, mesmo com a IA fora", async () => {
    vi.stubGlobal("fetch", fetchComPastas(
      [{ id: PRONTOS_ID, name: "Pronto para postar" }],
      { [PRONTOS_ID]: [{ id: "f9", name: "IMG_4412.jpg", mimeType: "image/jpeg", size: "4" }] },
    ));
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-10-03T12:00:00Z") });

    // A IA falhou (dublê padrão) e mesmo assim encaixou.
    expect(encaixarNoCalendario).toHaveBeenCalledTimes(1);
    const gravada = db.entradaDeMaterial.update.mock.calls
      .map((c) => c[0].data)
      .find((d) => typeof d.interpretacaoJson === "string");
    expect(gravada).toBeDefined();
    const interp = JSON.parse(String(gravada!.interpretacaoJson));
    expect(interp.formatos).toEqual(["stories"]);
    expect(interp.quantidade).toBe(1);
    // A peça é marcada "pronta" — a arte é do cliente e não se redesenha.
    expect(JSON.parse(db.socialPost.update.mock.calls[0]![0].data.scriptJson)).toMatchObject({ storyPronto: true, fase: "pauta" });
  });

  it("na Entrada de material (grafia diferente, à mão), a peça NÃO é marcada como pronta", async () => {
    interpretarFrase.mockResolvedValue({
      ok: true,
      interpretacao: { intencao: "lancamento", resumo: "lançamento", dataAlvo: null, horarioAlvo: null, dataAmbigua: false, motivoDaAmbiguidade: null, formatos: ["feed_imagem"], quantidade: 1 },
    });
    vi.stubGlobal("fetch", fetchComPastas(
      [{ id: SUB_ID, name: "ENTRADA  de Material" }],
      { [SUB_ID]: [{ id: "f1", name: "lancamento.jpg", mimeType: "image/jpeg", size: "4" }] },
    ));
    const { vigiarEntradaDeMaterial } = await import("@/lib/integrations/google/vigia-da-entrada");
    await vigiarEntradaDeMaterial({ agora: new Date("2026-10-03T12:00:00Z") });

    expect(encaixarNoCalendario).toHaveBeenCalledTimes(1);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });
});

describe("pasta por semelhança e nome do prato", () => {
  it("variações de nome achadas como a pasta padrão", async () => {
    const { chaveDePasta } = await import("@/lib/integrations/google/drive-conta-de-servico");
    for (const [manual, padrao] of [
      ["Fotos de Produtos", "Fotos de produto"],
      ["fotos produto", "Fotos de produto"],
      ["Referencias", "Referências"],
      ["Pronto para postar", "Prontos para postar"],
      ["Brand Book", "Brand book"],
      ["Entrada de Material", "Entrada de material"],
      ["fotos_de_ambiente", "Fotos de ambiente"],
    ] as const) {
      expect(chaveDePasta(manual), manual).toBe(chaveDePasta(padrao));
    }
    expect(chaveDePasta("Fotos de produto")).not.toBe(chaveDePasta("Fotos de ambiente"));
  });

  it("nome legível vira nome do prato; nome de câmera fica vazio", async () => {
    const { nomeLegivel } = await import("@/lib/integrations/google/drive-conta-de-servico");
    expect(nomeLegivel("prato-temaki-salmao.jpg", "prato-temaki-salmao.jpg")).toBe("temaki salmao");
    expect(nomeLegivel("Uramaki Philadelphia.jpeg", "Uramaki Philadelphia.jpeg")).toBe("uramaki philadelphia");
    expect(nomeLegivel("IMG_4412.HEIC", "IMG_4412.HEIC")).toBe("");
    expect(nomeLegivel("PXL_20260930_101010.jpg", "PXL_20260930_101010.jpg")).toBe("");
    expect(nomeLegivel("WhatsApp Image 2026-10-01 at 12.00.jpeg", "WhatsApp Image 2026-10-01 at 12.00.jpeg")).toBe("");
    // Descrição escrita pelo cliente vence e fica como ele escreveu.
    expect(nomeLegivel("Combo Casal", "IMG_1.jpg")).toBe("Combo Casal");
  });

  it("cada pasta declara o papel; Fotos de ambiente é ambiente, nunca prato", async () => {
    const { PAPEL_DA_SUBPASTA, SUBPASTAS_DA_MARCA } = await import("@/lib/integrations/google/drive-conta-de-servico");
    expect(PAPEL_DA_SUBPASTA["Fotos de ambiente"]).toBe("foto_local");
    expect(PAPEL_DA_SUBPASTA["Fotos de produto"]).toBe("foto_produto");
    expect(PAPEL_DA_SUBPASTA.Logos).toBe("logo");
    expect([...SUBPASTAS_DA_MARCA]).toEqual([
      "Brand book", "Logos", "Fotos de produto", "Fotos de ambiente", "Referências", "Entrada de material", "Prontos para postar",
    ]);
  });
});
