// A RÉGUA DA PEÇA FINAL ESTÁ LIGADA — e é isso que este arquivo prova.
//
// A pergunta obrigatória desta casa antes de aceitar qualquer conserto é
// *"o teste alcança o código que responde ao cliente?"*. `regua-da-peca-final`
// tem o teste dela em `regua-da-peca-final.test.ts`, com mutação e arquivo
// real. Aquilo prova que a RÉGUA mede. Não prova que a PRODUÇÃO passa por ela —
// e foi exatamente essa distância que deixou `trava-de-fundo.ts` sete dias
// verde e desligado, em 2026.
//
// Aqui a régua NÃO é dublê. O que é dublê é tudo em volta.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn(async () => ({ clientRequestId: "cr-pago", id: "proj", clientId: "c1" })) },
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900, origem: "mercadopago", confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const montarPeca = vi.hoisted(() => vi.fn());
const conferirFundoDaPeca = vi.hoisted(() => vi.fn());
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo: vi.fn() }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel: vi.fn() }));
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
vi.mock("@/lib/agency/design/portao-do-fundo", () => ({
  conferirFundoDaPeca, motivoDoFundoEmUmaLinha: () => "fundo reprovado",
}));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));

// ⚠️ `regua-da-peca-final` e `medir-peca-final` NÃO são mockados. É o ponto.
import { produzirArtesPendentes } from "@/lib/agency/execution/artes";

const PASTA = join(process.cwd(), "docs/entregas/peca-final-26-08");
const BOA = readFileSync(join(PASTA, "boa-med_1f79e9f3_mt8xj2gu.jpg"));
const FOTO_NAO_ENTROU = readFileSync(join(PASTA, "mutante-foto-nao-entrou.jpg"));
const ARQUIVO_RASO = readFileSync(join(PASTA, "mutante-arquivo-raso.jpg"));

const POST = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  caption: "O ambiente cheio que faz você querer estar aqui também.",
  artDirection: null, pillar: "Bastidor", format: "feed", mediaUrl: null, lastError: null,
};
const TITULO = "O ambiente cheio que faz você querer estar aqui também";
const MARCA = "Trattoria da Ana TESTE";

/** O que o post recebeu de escrita, achatado — é onde `mediaUrl` apareceria. */
const escritas = () =>
  db.socialPost.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);

function compondo(bytes: Buffer, textosPintados: string[]) {
  montarPeca.mockResolvedValue({
    ok: true, bytes, largura: 1080, altura: 1350,
    textosPintados, textoRecusado: [], encolheu: false, origemDoMolde: "marca", lacunasDoMolde: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
  db.socialPost.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    name: MARCA, industry: "restaurante",
    brandBrain: { primaryColor: "#1A1816", secondaryColor: "#C8A24A", tone: "acolhedor" },
  });
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.jpg", sizeBytes: 1, url: "/api/media/m1" } });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.count.mockResolvedValue(0);
  estiloVisualPersistido.mockResolvedValue("");
  estiloVistoPersistido.mockResolvedValue("");
  conferirFundoDaPeca.mockResolvedValue({ ok: true });
  generateDesign.mockResolvedValue({
    ok: true, url: `data:image/jpeg;base64,${BOA.toString("base64")}`, model: "gpt-image-1",
  });
});

describe("a produção passa pela régua da peça final", () => {
  it("PEÇA BOA: vira arte e recebe mediaUrl", async () => {
    compondo(BOA, [TITULO, MARCA]);
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(escritas().some((d) => d.mediaUrl === "/api/media/m1")).toBe(true);
  });

  it("A FOTO NÃO ENTROU: nada é guardado, nada recebe mediaUrl, e o motivo é legível", async () => {
    compondo(FOTO_NAO_ENTROU, [TITULO, MARCA]);
    const r = await produzirArtesPendentes();

    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toContain("foto_nao_entrou");
    // O ARQUIVO NEM CHEGA A EXISTIR — a régua fica ANTES de `guardarArquivo`.
    // Sem arquivo não há `mediaUrl`; sem `mediaUrl` a peça não aparece no
    // portal, que é o que o carimbo `compartilhado` mostraria.
    const guardados = guardarArquivo.mock.calls.map((c: unknown[]) => (c[0] as { fileName: string }).fileName);
    expect(guardados.some((n: string) => n.startsWith("arte-"))).toBe(false);
    expect(escritas().every((d) => !("mediaUrl" in d))).toBe(true);
  });

  it("ARQUIVO RASO (o caso de 19.207 bytes): também não passa", async () => {
    compondo(ARQUIVO_RASO, [TITULO, MARCA]);
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(escritas().every((d) => !("mediaUrl" in d))).toBe(true);
  });

  it("PEÇA SEM ASSINATURA: não sai em nome de ninguém", async () => {
    compondo(BOA, [TITULO]);
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toContain("sem_assinatura_pintada");
  });

  it("CAIXA DE TÍTULO VAZIA: a peça foi rasterizada e o título não entrou", async () => {
    compondo(BOA, [MARCA]);
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toContain("sem_titulo_pintado");
  });

  it("SEM MEDIDA É REPROVADO: bytes que não decodificam não viram peça", async () => {
    compondo(Buffer.from("isto não é uma imagem"), [TITULO, MARCA]);
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toContain("nao_foi_possivel_medir");
  });

  it("a régua fica ANTES de guardar o arquivo — a ordem no fonte é o conserto", () => {
    const fonte = readFileSync(join(process.cwd(), "lib/agency/execution/artes.ts"), "utf8");
    const regua = fonte.indexOf("const medidaDaPeca = await medirPecaFinal(composta.bytes)");
    const guarda = fonte.indexOf("const guardado = await guardarArquivo({");
    expect(regua).toBeGreaterThan(0);
    expect(regua).toBeLessThan(guarda);
  });
});
