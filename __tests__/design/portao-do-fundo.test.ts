// O PORTÃO DE PIXEL ESTÁ LIGADO — e é isso que este arquivo prova.
//
// ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
//
// `trava-de-fundo.ts` nasceu em 08/08/2026 com teste verde, cabeçalho de
// cinquenta linhas e números medidos contra as peças que o CEO reprovou. E com
// **zero chamadores em `lib/`** — os únicos eram um script de entrega
// (`scripts/cityjobs-pecas-de-feed.mts`) e o próprio teste. Ficou assim SETE
// DIAS, aberto em `docs/pendencias.md` com a frase certa: *"enquanto não estiver
// no caminho de produção, ele protege uma entrega, não a casa."*
//
// Testar a régua de novo não provaria nada. O que se prova aqui é que a
// PRODUÇÃO passa por ela — é a lição de 08/08 no 99Freelas (113 testes verdes
// sobre código que o app nunca executava).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  // O portão de pagamento deriva o pedido pelo projeto do cliente quando a
  // peça vem sem `clientRequestId` (cliente DIRETO).
  project: { findFirst: vi.fn(async () => ({ clientRequestId: "cr-pago", id: "proj-pago", clientId: "cli-1" })), },
  // O PORTÃO DE PAGAMENTO (lib/agency/financeiro/portao-de-pagamento.ts) roda
  // antes de qualquer produção. Estes testes são sobre o que acontece DEPOIS de
  // o cliente pagar, então a testemunha diz "pago". Quem testa a trava em si é
  // __tests__/financeiro/portao-de-pagamento.test.ts.
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900,
      origem: "mercadopago",
      confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const montarPeca = vi.hoisted(() => vi.fn());
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo: vi.fn() }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel: vi.fn() }));
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));

// ⚠️ `portao-do-fundo` NÃO é mockado aqui. É o ponto do arquivo.
import { conferirFundoDaPeca } from "@/lib/agency/design/portao-do-fundo";
import { produzirArtesPendentes } from "@/lib/agency/execution/artes";

const ENTREGA = join(process.cwd(), "docs/entregas/cityjobs-08-08");
const ler = (p: string) => readFileSync(join(ENTREGA, p));

/** As DUAS peças que o CEO reprovou em 08/08 — prédio-retângulo e sol-círculo,
 *  desenhados em código e rasterizados em PNG. */
const CLIPART_REPROVADO = "reprovadas/reprovada-post-1-bastidor-da-regiao.png";
/** A fotografia real que entrou na peça refeita (estação de Mogi). */
const FOTO_DE_VERDADE = "fotos/p1-recorte.jpg";

// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA, JUNTA — as duas perguntas num veredito só
// ─────────────────────────────────────────────────────────────────────────────

describe("conferirFundoDaPeca decide as duas perguntas de uma vez", () => {
  it("REPROVA o clipart que o CEO reprovou, medindo o pixel", async () => {
    const v = await conferirFundoDaPeca({ bytes: ler(CLIPART_REPROVADO), mime: "image/png" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("pobre_demais_para_ser_foto");
  });

  it("NÃO reprova a fotografia real — trava que só sabe dizer não é desligada", async () => {
    const v = await conferirFundoDaPeca({ bytes: ler(FOTO_DE_VERDADE), mime: "image/jpeg" });
    expect(v.ok).toBe(true);
  });

  it("REPROVA o SVG mesmo quando o MIME mente — o cabeçalho é lido", async () => {
    // Rasterizar o SVG e chamá-lo de PNG é o contorno que a pergunta 1 sozinha
    // não pegaria. O cabeçalho dos primeiros bytes fecha o caminho.
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    const v = await conferirFundoDaPeca({ bytes: svg, mime: "image/png" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("vetor_desenhado_em_codigo");
  });

  it("fundo ausente reprova, e com o motivo próprio", async () => {
    for (const nada of [null, undefined, Buffer.alloc(0)]) {
      const v = await conferirFundoDaPeca({ bytes: nada, mime: "image/png" });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.motivo).toBe("sem_fundo");
    }
  });

  it("FAIL-CLOSED: o que não decodifica NÃO vira aprovado", async () => {
    const v = await conferirFundoDaPeca({ bytes: Buffer.from("isto não é uma imagem"), mime: "image/png" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.motivo).toBe("nao_foi_possivel_medir");
      // O alerta carrega a evidência: quem lê precisa saber o que consertar.
      expect(v.detalhe).toContain("sharp");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CAMINHO VIVO — a produção passa por ele
// ─────────────────────────────────────────────────────────────────────────────

describe("produzirArtesPendentes não deixa clipart virar peça de cliente", () => {
  const POST = {
    id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    caption: "A vaga que você procura pode ser aqui do lado.",
    artDirection: null, pillar: "Bastidor da região",
    format: "feed", mediaUrl: null, lastError: null,
  };

  /** O gerador devolvendo BYTES DE VERDADE — o data URL que `baixarImagem` lê. */
  const devolvendo = (arquivo: string, mime: string) => {
    generateDesign.mockResolvedValue({
      ok: true,
      url: `data:${mime};base64,${ler(arquivo).toString("base64")}`,
      model: "gpt-image-1",
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
    db.socialPost.update.mockResolvedValue({});
    db.client.findUnique.mockResolvedValue({
      name: "CityJobs", industry: "plataforma de vagas",
      brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "prático" },
    });
    guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "a.png", sizeBytes: 1, url: "/api/media/m1" } });
    db.mediaAsset.findFirst.mockResolvedValue(null);
    db.mediaAsset.count.mockResolvedValue(0);
    estiloVisualPersistido.mockResolvedValue("");
    estiloVistoPersistido.mockResolvedValue("");
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("peca"), largura: 1080, altura: 1350,
      textosPintados: [], textoRecusado: [], encolheu: false, origemDoMolde: "marca", lacunasDoMolde: [],
    });
  });

  it("gerador devolveu CLIPART: a peça não é gravada, e o motivo é legível", async () => {
    devolvendo(CLIPART_REPROVADO, "image/png");
    const r = await produzirArtesPendentes();

    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toContain("fundo reprovado");
    // Nada foi composto e nada foi guardado — o portão fica ANTES dos dois.
    expect(montarPeca).not.toHaveBeenCalled();
    expect(guardarArquivo).not.toHaveBeenCalled();
    // E a peça não saiu com `mediaUrl`: o cliente não recebe clipart.
    const gravou = db.socialPost.update.mock.calls.map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data);
    expect(gravou.every((d) => !("mediaUrl" in d))).toBe(true);
  });

  it("gerador devolveu FOTOGRAFIA: a peça segue e vira arte", async () => {
    devolvendo(FOTO_DE_VERDADE, "image/jpeg");
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(montarPeca).toHaveBeenCalledTimes(1);
  });

  it("o portão fica ANTES de compor — o lugar é medido, não é gosto", () => {
    // No fundo CRU a separação entre foto e clipart é de ordem de grandeza; na
    // peça já composta (painel sólido, tipografia e assinatura por cima) ela
    // desaba, e o portão vira roleta. Por isso a ordem no fonte importa.
    const fonte = readFileSync(join(process.cwd(), "lib/agency/execution/artes.ts"), "utf8");
    const portao = fonte.indexOf("conferirFundoDaPeca({ bytes, mime");
    const compoe = fonte.indexOf("const composta = await comporComMolde");
    expect(portao).toBeGreaterThan(0);
    expect(portao).toBeLessThan(compoe);
  });
});
