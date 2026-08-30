// O MATERIAL DO DRIVE CHEGA NA PEÇA — a prova de que existe CHAMADOR.
//
// ── POR QUE ESTE ARQUIVO, SE a regra já tem teste próprio ──────────────────
//
// Porque o defeito de 07/08/2026 NÃO era a regra: era a AUSÊNCIA DE CHAMADOR.
// `fotosReaisDoCliente` e `logoDoCliente` existiam, funcionavam, tinham teste —
// e nenhum código de produção as chamava. `montarArteComFotoDoCliente` só era
// invocada por teste. A ponte estava construída dos dois lados e faltava o meio,
// então o cliente conectava o Drive e a peça saía idêntica.
//
// `__tests__/design/foto-real-na-peca.test.ts` prova a REGRA (pura). Este prova
// o CAMINHO: que `produzirArtesPendentes` — a função que o despertador roda a
// cada 5 minutos — de fato busca o material e o usa.
//
// As duas metades:
//   ✅ COM foto adequada, os BYTES da peça derivam do ARQUIVO DO CLIENTE, e o
//      gerador pago NÃO é chamado.
//   ⛔ SEM foto adequada, o gerador é chamado (a peça sai), e a peça DECLARA
//      o que havia e por que nada entrou. Nada é inventado.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PECA_COMPOSTA_REAL } from "../_helpers/peca-composta";

const generateDesign = vi.fn();
const guardarArquivo = vi.fn();
const lerArquivo = vi.fn();
const montarPeca = vi.fn();
const atualizarPost = vi.fn();
const fotosReaisDoCliente = vi.fn();
const logoDoCliente = vi.fn();

const POST = {
  id: "sp-1", workspaceId: "ws-1", clientId: "cli-1", clientRequestId: null,
  format: "feed", caption: "o panetone artesanal já está em pré-venda",
  pillar: "oferta", mediaUrl: null, status: "scheduled", lastError: null,
};

vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
// ── O PORTÃO DE PIXEL (15/08/2026) ──────────────────────────────────────────
// `conferirFundoDaPeca` entrou no caminho vivo de `artes.ts` e mede PIXEL. As
// fixtures deste arquivo são imagens mínimas, feitas para exercitar a FIAÇÃO —
// e um PNG de poucos pixels é, corretamente, reprovado por um portão que exige
// riqueza de fotografia. A régua dele roda contra ARQUIVO DE VERDADE (as peças
// que o CEO reprovou e as fotos que entraram nas refeitas), e o caminho vivo é
// provado, em `__tests__/design/portao-do-fundo.test.ts`. Mockar aqui separa
// fiação de régua; não afrouxa nenhuma das duas.
vi.mock("@/lib/agency/design/portao-do-fundo", () => ({
  conferirFundoDaPeca: async () => ({ ok: true }),
  motivoDoFundoEmUmaLinha: () => "",
}));
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({ fotosReaisDoCliente, logoDoCliente }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({
  estiloVisualPersistido: vi.fn().mockResolvedValue(""),
  estiloVistoPersistido: vi.fn().mockResolvedValue(""),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    // O portão de pagamento deriva o pedido pelo projeto do cliente quando a
    // peça vem sem `clientRequestId` (cliente DIRETO).
    project: { findFirst: vi.fn(async () => ({ clientRequestId: "cr-pago", id: "proj-pago", clientId: "cli-1" })), },
    // O PORTÃO DE PAGAMENTO roda antes de qualquer produção. Este teste é sobre
    // o que acontece DEPOIS de o cliente pagar, então a testemunha diz "pago".
    pagamentoConfirmado: {
      findUnique: vi.fn(async () => ({
        valorCentavos: 7900, origem: "mercadopago",
        confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
      })),
    },
    socialPost: { findMany: vi.fn(async () => [POST]), update: atualizarPost },
    // O PORTÃO DE PAGAMENTO, com peça de cliente DIRETO (sem `clientRequestId`),
    // procura o pedido do cliente e, não achando, cai na anistia pela IDADE do
    // cadastro — daí o `findFirst` e o `createdAt`.
    clientRequestDb: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
    client: {
      findUnique: vi.fn(async () => ({
        id: "cli-1", name: "Padaria Aurora", industry: "padaria",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        brandBrain: { primaryColor: "#8B2F1F", secondaryColor: "#E8C39E", typography: "Playfair", tone: "acolhedor" },
      })),
    },
    mediaAsset: {
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => ({ storagePath: "/vol/media/panetone.jpg", workspaceId: "ws-1" })),
    },
  },
}));

const { produzirArtesPendentes } = await import("@/lib/agency/execution/artes");

/** Os bytes REAIS do arquivo que o cliente mandou. É por eles que a prova passa. */
const BYTES_DO_CLIENTE = Buffer.from("JPEG-DO-PANETONE-QUE-O-CLIENTE-FOTOGRAFOU");
const BYTES_GERADOS = Buffer.from("PNG-INVENTADO-PELO-MODELO");
// A PEÇA FINAL É UM ARQUIVO REAL desde 26/08/2026: `regua-da-peca-final.ts`
// mede a peça antes de gravá-la, e string não decodifica. Ver
// `__tests__/_helpers/peca-composta.ts`.
const PECA_FINAL = PECA_COMPOSTA_REAL;

beforeEach(() => {
  vi.clearAllMocks();
  logoDoCliente.mockResolvedValue(null);
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "arq-1" } });
  montarPeca.mockResolvedValue({
    ok: true, bytes: PECA_FINAL, largura: 1080, altura: 1350,
    textosPintados: ["o panetone artesanal já está em pré-venda", "Padaria Aurora"],
    textoRecusado: [], encolheu: false,
    origemDoMolde: "marca", lacunasDoMolde: [],
  });
  generateDesign.mockResolvedValue({ ok: true, url: "https://modelo/img.png" });
  globalThis.fetch = vi.fn(async () => new Response(BYTES_GERADOS, { status: 200 })) as typeof fetch;
});

describe("✅ METADE 2 — com material adequado, o material do cliente ENTRA", () => {
  beforeEach(() => {
    fotosReaisDoCliente.mockResolvedValue([
      { mediaAssetId: "ma-panetone", papel: "foto_produto", url: "/api/media/ma-panetone", nome: "foto-produto-panetone.jpg", mimeType: "image/jpeg" },
    ]);
    lerArquivo.mockResolvedValue(BYTES_DO_CLIENTE);
  });

  it("a peça é composta sobre os BYTES DO ARQUIVO DO CLIENTE", async () => {
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);

    // O CORAÇÃO DA PROVA — comparação de bytes, não olhômetro.
    const pedido = montarPeca.mock.calls[0]![0] as { fundoBytes: Buffer; fundoMime: string };
    expect(pedido.fundoBytes.equals(BYTES_DO_CLIENTE)).toBe(true);
    expect(pedido.fundoBytes.equals(BYTES_GERADOS)).toBe(false);
    // E o MIME real viaja junto: declarar png para um jpeg faz o navegador
    // desenhar nada, e a peça sairia com fundo chapado sem ninguém entender.
    expect(pedido.fundoMime).toBe("image/jpeg");
  });

  it("o gerador PAGO não é chamado — foto real não custa imagem", async () => {
    await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("a peça registra QUAL foto entrou e POR QUÊ", async () => {
    await produzirArtesPendentes();
    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null; mediaUrl: string } };
    expect(escrita.data.mediaUrl).toBe("/api/media/arq-1");
    expect(escrita.data.lastError).toContain("[foto do cliente]");
    expect(escrita.data.lastError).toContain("panetone");
  });
});

describe("⛔ METADE 1 — sem material adequado, nada é inventado", () => {
  it("cliente SEM foto nenhuma: gera, e não finge que usou material", async () => {
    fotosReaisDoCliente.mockResolvedValue([]);

    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(generateDesign).toHaveBeenCalledTimes(1);

    const pedido = montarPeca.mock.calls[0]![0] as { fundoBytes: Buffer };
    expect(pedido.fundoBytes.equals(BYTES_GERADOS)).toBe(true);

    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null } };
    expect(escrita.data.lastError ?? "").not.toContain("[foto do cliente]");
  });

  it("cliente COM fotos que nada dizem sobre o texto: gera e DECLARA o que havia", async () => {
    fotosReaisDoCliente.mockResolvedValue([
      { mediaAssetId: "m1", papel: "foto_produto", url: "/x", nome: "foto-produto-IMG_2831.jpg", mimeType: "image/jpeg" },
      { mediaAssetId: "m2", papel: "foto_produto", url: "/x", nome: "foto-produto-IMG_2832.jpg", mimeType: "image/jpeg" },
    ]);

    await produzirArtesPendentes();

    // Gerou (a peça sai)…
    expect(generateDesign).toHaveBeenCalledTimes(1);
    // …e o silêncio foi quebrado: a peça diz que havia material e por que não
    // entrou. Era exatamente isto que faltava — o cliente subia os arquivos e
    // nada, em lugar nenhum, dizia que a peça saiu igual.
    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null } };
    expect(escrita.data.lastError).toContain("[material do cliente]");
    expect(escrita.data.lastError).toContain("IMG_2831");
  });

  it("arquivo escolhido que sumiu do disco NÃO vira 'usei a foto do cliente'", async () => {
    fotosReaisDoCliente.mockResolvedValue([
      { mediaAssetId: "ma-panetone", papel: "foto_produto", url: "/x", nome: "foto-produto-panetone.jpg", mimeType: "image/jpeg" },
    ]);
    lerArquivo.mockResolvedValue(null); // o volume perdeu o arquivo

    await produzirArtesPendentes();

    // Cai na imagem gerada — mas sem mentir sobre o que aconteceu.
    expect(generateDesign).toHaveBeenCalledTimes(1);
    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null } };
    expect(escrita.data.lastError ?? "").not.toContain("[foto do cliente]");
  });
});

describe("🖋️ o logo do cliente chega ao molde", () => {
  beforeEach(() => fotosReaisDoCliente.mockResolvedValue([]));

  it("COM logo no Drive, os bytes dele viajam no molde da peça", async () => {
    logoDoCliente.mockResolvedValue({
      mediaAssetId: "ma-logo", papel: "logo", url: "/api/media/ma-logo",
      nome: "logo-aurora.png", mimeType: "image/png",
    });
    lerArquivo.mockResolvedValue(Buffer.from("PNG-DO-LOGO-OFICIAL"));

    await produzirArtesPendentes();

    const pedido = montarPeca.mock.calls[0]![0] as { molde: { logo: { dataUrl: string } | null; lacunas: string[] } };
    expect(pedido.molde.logo).not.toBeNull();
    // Os BYTES do arquivo dele, em data URL — não um caminho, não uma URL.
    expect(pedido.molde.logo!.dataUrl).toBe(
      `data:image/png;base64,${Buffer.from("PNG-DO-LOGO-OFICIAL").toString("base64")}`,
    );
  });

  it("SEM logo no Drive, o molde declara a falta e NÃO desenha logo nenhum", async () => {
    logoDoCliente.mockResolvedValue(null);

    await produzirArtesPendentes();

    const pedido = montarPeca.mock.calls[0]![0] as { molde: { logo: unknown; lacunas: string[] } };
    expect(pedido.molde.logo).toBeNull();
    expect(pedido.molde.lacunas.join(" ")).toMatch(/logo do cliente em arquivo/i);

    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null } };
    expect(escrita.data.lastError).toContain("[sem logo]");
  });
});
