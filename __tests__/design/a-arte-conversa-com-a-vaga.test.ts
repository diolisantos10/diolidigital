// A ARTE TEM DE CONVERSAR COM O CONTEÚDO DA PEÇA.
//
// ── O PEDIDO (CEO, 13/08/2026), verbatim ────────────────────────────────────
//
// "A gente tem o CityJobs que está fazendo stories legais, ele mesmo produz os
// stories dele. Só precisa dar uma melhorada, porque AS VAGAS NÃO TÊM MUITO A
// VER COM A ARTE QUE ELE ESTÁ CRIANDO. Então só dá essa direção pra ele."
//
// Elogio + desalinhamento. Não é peça feia: é peça que não conversa com o que
// está escrito nela.
//
// ── AS DUAS METADES DESTE ARQUIVO ───────────────────────────────────────────
//
//   1. A REGRA EXISTE COMO DADO, no cérebro criativo do CityJobs — com
//      procedência, e sem revogar o que o CEO aprovou (a foto da região
//      continua sendo o extremo permitido do institucional).
//
//   2. A REGRA ATRAVESSA A PORTA. Esta é a metade que faltava e é a razão de o
//      arquivo existir: até 13/08 a amplitude declarada da marca só entrava no
//      prompt do CARROSSEL. O post simples e o STORY — que são o volume da
//      casa — recebiam seis constantes do cliente e nada do contrato criativo.
//      Regra escrita que não chega a quem produz é decoração, e esta casa já
//      nomeou essa doença duas vezes.

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  // O PORTÃO DE PAGAMENTO, chegando peça de cliente DIRETO (sem
  // `clientRequestId`), procura o pedido do cliente e, não achando, cai na
  // anistia pela IDADE do cadastro. Daí `findFirst` e o `createdAt` abaixo.
  clientRequestDb: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const editarParaReel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel }));
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));
const montarPeca = vi.hoisted(() => vi.fn());
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

import { produzirArtesPendentes } from "@/lib/agency/execution/artes";
import { cerebroDoCityJobs, cerebroDaFoocci } from "@/lib/agency/design/repertorio-registrado";
import { direcaoDeAmplitude } from "@/lib/agency/design/repertorio";

/** Um post do CityJobs. Pilar deliberadamente institucional: os pilares de
 *  salário, de vagas por setor e de candidatura estão BLOQUEADOS
 *  (`pilares-bloqueados.ts`) e nem chegam a pedir imagem. */
const POST_CITYJOBS = {
  id: "sp-cj", workspaceId: "ws1", clientId: "c-cj", clientRequestId: null,
  caption: "A vaga que você procura pode ser aqui do lado.",
  pillar: "Bastidor da região", format: "story", mediaUrl: null, lastError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([{ ...POST_CITYJOBS }]);
  db.socialPost.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({
    // ANTERIOR ao corte do portão de pagamento: nas peças de cliente DIRETO
    // (sem `clientRequestId`) é a anistia pela idade do cadastro que libera.
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    name: "CityJobs", industry: "Plataforma de vagas",
    brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "direto" },
  });
  generateDesign.mockResolvedValue({ ok: true, url: "data:image/png;base64,aGk=", model: "gpt-image-1" });
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.png", sizeBytes: 100, url: "/api/media/m1" } });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.count.mockResolvedValue(0);
  estiloVisualPersistido.mockResolvedValue("");
  estiloVistoPersistido.mockResolvedValue("");
  montarPeca.mockResolvedValue({
    ok: true, bytes: Buffer.from("peca"), largura: 1080, altura: 1920,
    textosPintados: ["A vaga que você procura pode ser aqui do lado"], textoRecusado: [],
    encolheu: false, origemDoMolde: "marca",
  });
});

// ─── 1. A REGRA COMO DADO ───────────────────────────────────────────────────

describe("a direção do CEO virou regra da marca, não conselho", () => {
  const eixo = () =>
    cerebroDoCityJobs().cerebro.amplitude.find((a) => /o que a imagem tem de provar/i.test(a.eixo));

  it("o CityJobs declara O QUE A IMAGEM TEM DE PROVAR, com procedência", () => {
    const a = eixo();
    expect(a, "o eixo precisa ter entrado no cérebro — entrada sem procedência é RECUSADA por montarCerebro").toBeTruthy();
    expect(a!.procedencia).toMatch(/13\/08\/2026/);
    // Os dois extremos: o cargo e a região. Um só não é amplitude, é molde.
    expect(a!.extremoA).toMatch(/vaga|trabalho acontece/i);
    expect(a!.extremoB).toMatch(/regi(ã|a)o|esta(ç|c)(ã|a)o/i);
  });

  it("nomeia o desalinhamento que o CEO apontou — cidade em peça de cargo", () => {
    const fora = (eixo()!.foraDaMarca ?? []).join(" | ").toLowerCase();
    expect(fora).toMatch(/cidade|skyline|esta(ç|c)(ã|a)o/);
    expect(fora).toMatch(/cargo espec[ií]fico/);
    // O clichê de contratação e o escritório genérico, que é o que o gerador
    // faz sozinho quando ninguém diz nada.
    expect(fora).toMatch(/coworking|escrit(ó|o)rio/);
    expect(fora).toMatch(/curr(í|i)culo|confete|aperto de m(ã|a)o/);
  });

  it("NÃO revoga a peça que o CEO aprovou: a foto da região continua permitida", () => {
    // As duas aprovadas de 08/08 são institucionais e usam foto da região.
    // Uma regra que as proibisse estaria consertando o que funciona.
    const texto = direcaoDeAmplitude(cerebroDoCityJobs().cerebro);
    expect(texto).toMatch(/os extremos s(ã|a)o PERMITIDOS/);
    expect(texto).toMatch(/a REGI(Ã|A)O/);
  });

  it("a regra é do CityJobs e não vaza para outra marca", () => {
    const foocci = direcaoDeAmplitude(cerebroDaFoocci().cerebro);
    expect(foocci).not.toMatch(/o que a imagem tem de provar/i);
  });
});

// ─── 2. A REGRA ATRAVESSA A PORTA ───────────────────────────────────────────

describe("a amplitude da marca chega ao prompt do STORY e do post simples", () => {
  it("story: o prompt carrega o que a imagem tem de provar e a lista NUNCA", async () => {
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    const prompt = generateDesign.mock.calls[0]![0].prompt as string;
    expect(prompt).toMatch(/Amplitude declarada desta marca/);
    expect(prompt).toMatch(/o que a imagem tem de provar/i);
    expect(prompt).toMatch(/NUNCA:/);
    expect(prompt).toMatch(/cargo espec[ií]fico/);
  });

  it("post simples de feed: mesma porta, mesmo contrato", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_CITYJOBS, format: "feed" }]);
    await produzirArtesPendentes();
    const prompt = generateDesign.mock.calls[0]![0].prompt as string;
    expect(prompt).toMatch(/Amplitude declarada desta marca/);
  });

  it("marca SEM amplitude registrada não ganha regra inventada — vazio é vazio", async () => {
    db.client.findUnique.mockResolvedValue({
    // ANTERIOR ao corte do portão de pagamento: nas peças de cliente DIRETO
    // (sem `clientRequestId`) é a anistia pela idade do cadastro que libera.
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
      name: "Cliente Novo Sem Cérebro", industry: "Serviços",
      brandBrain: { primaryColor: "#111111", secondaryColor: null, tone: "" },
    });
    await produzirArtesPendentes();
    const prompt = generateDesign.mock.calls[0]![0].prompt as string;
    expect(prompt).not.toMatch(/Amplitude declarada/);
  });
});
