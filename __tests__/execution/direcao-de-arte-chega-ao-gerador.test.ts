// A DIREÇÃO DE ARTE ATRAVESSA A ESTEIRA — o fio que era escrito e descartado.
//
// ── O DEFEITO, MEDIDO EM 15/08/2026 ─────────────────────────────────────────
//
// A casa escrevia direção de arte e a jogava fora, em três pontos:
//
//   1. `especialistas.ts` pede ao especialista de copy o campo `visual` — "o que
//      aparece na imagem".
//   2. `run-execution.ts` (`deliverableMarkdown`) grava "- Visual: ..." no
//      markdown do entregável.
//   3. `publicacao.ts` (`extrairPecas`) capturava Legenda, Formato, Pilar e
//      Cenas — **e não Visual**. `SocialPost` não tinha coluna para guardá-la.
//
// Consequência: `artes.ts` mandava ao gerador de imagem
// `Cena a retratar: ${post.caption}` — a LEGENDA DO INSTAGRAM inteira, com CTA
// e hashtag —, mais quinze proibições, mais "sem nenhum texto, letra, número ou
// logotipo". **O desenho vetorial genérico era a saída coerente com esse
// pedido.** O modelo obedeceu.
//
// ── ESTE ARQUIVO QUEBRA NO CÓDIGO ANTERIOR ──────────────────────────────────
//
// Todo teste daqui falha contra o código de antes de 15/08: `artDirection` não
// existia, `extrairPecas` não lia `Visual`, e `montarPrompt` não tinha por onde
// receber a direção.
//
// ── E ELE TRAVA A METADE PERIGOSA ───────────────────────────────────────────
//
// A direção de arte **não passa pelo piso de verdade**: ela descreve uma cena,
// não afirma um fato. Se ela virasse letra na peça, a casa teria aberto um
// caminho de texto não auditado até o pixel — o oposto do que a trava de texto
// existe para impedir. O último bloco prova, por fonte E por comportamento, que
// isso não acontece.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const montarPeca = vi.hoisted(() => vi.fn());
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo, caminhoPublicoAssinado: vi.fn() }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel: vi.fn() }));
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente: vi.fn() }));

import { produzirArtesPendentes, montarPrompt } from "@/lib/agency/execution/artes";
import { extrairPecas, agendarPostsDaEntrega } from "@/lib/agency/esteira/publicacao";

const RAIZ = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA REAL — CityJobs, 08/08/2026
// ─────────────────────────────────────────────────────────────────────────────
//
// Texto verbatim de `scripts/cityjobs-pecas-de-feed.mts` (peça 1, "bastidor da
// região"). Não é fixture inventada: é a legenda que já foi ao molde, com o CTA
// e as oito hashtags que iam inteiros para o gerador de imagem como "cena".

const LEGENDA_CITYJOBS = [
  "A vaga que você procura pode ser aqui do lado.",
  "",
  "A gente publica o que é do Alto Tietê: Mogi das Cruzes, Suzano, Itaquaquecetuba, Poá, Ferraz de Vasconcelos e Arujá.",
  "",
  "Trabalhar perto de casa é ganhar tempo de volta — o tempo que hoje vai embora na estação.",
  "",
  "Vagas atualizadas no link da bio.",
  "",
  "#altotietê #mogidascruzes #suzano #itaquaquecetuba #poá #ferrazdevasconcelos #arujá #vagasdeemprego",
].join("\n");

/** A direção de arte da mesma peça — o que a IMAGEM tem de mostrar. Escrita na
 *  gramática do campo `porQueEstaFoto` daquele script. */
const DIRECAO_CITYJOBS =
  "Plataforma da estação da CPTM em Mogi das Cruzes no fim da tarde, com passageiros descendo do trem, " +
  "luz baixa e a fachada da estação ao fundo. Fotografia real, sem letreiro legível.";

// ─────────────────────────────────────────────────────────────────────────────
// 1. O LEITOR DO ENTREGÁVEL CAPTURA A DIREÇÃO
// ─────────────────────────────────────────────────────────────────────────────

describe("extrairPecas lê a direção de arte que o motor grava", () => {
  const blocoCom = (linhas: string[]) =>
    ["**1. A vaga pode ser aqui do lado**", ...linhas].join("\n");

  it('captura "- Visual:" — o campo que o especialista de copy preenche', () => {
    const pecas = extrairPecas(
      blocoCom([
        "- Formato: feed",
        `- Legenda: ${LEGENDA_CITYJOBS.replace(/\n/g, " ")}`,
        `- Visual: ${DIRECAO_CITYJOBS}`,
      ]),
      "social",
    );
    expect(pecas).toHaveLength(1);
    expect(pecas[0]!.direcaoDeArte).toBe(DIRECAO_CITYJOBS);
  });

  it('captura "- Direção:" — o mesmo campo com o rótulo que as peças de design usam', () => {
    const pecas = extrairPecas(
      blocoCom([
        "- Formato: feed",
        `- Legenda: ${LEGENDA_CITYJOBS.replace(/\n/g, " ")}`,
        `- Direção: ${DIRECAO_CITYJOBS}`,
      ]),
      "social",
    );
    expect(pecas[0]!.direcaoDeArte).toBe(DIRECAO_CITYJOBS);
  });

  it("sem direção declarada, é null — e null é null, nunca a legenda disfarçada", () => {
    const pecas = extrairPecas(
      blocoCom(["- Formato: feed", `- Legenda: ${LEGENDA_CITYJOBS.replace(/\n/g, " ")}`]),
      "social",
    );
    expect(pecas[0]!.direcaoDeArte).toBeNull();
  });

  it('direção que confessa falta de dado NÃO vira pedido de imagem', () => {
    // "PRECISO CONFIRMAR" é honestidade para a agência ler. Mandá-la ao gerador
    // faria o modelo DESENHAR a confissão. A peça continua válida: ela cai no
    // fallback da legenda, que é o comportamento de sempre.
    const pecas = extrairPecas(
      blocoCom([
        "- Formato: feed",
        `- Legenda: ${LEGENDA_CITYJOBS.replace(/\n/g, " ")}`,
        "- Visual: PRECISO CONFIRMAR: qual estação o cliente quer mostrar",
      ]),
      "social",
    );
    expect(pecas).toHaveLength(1);
    expect(pecas[0]!.direcaoDeArte).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A DIREÇÃO CHEGA AO BANCO
// ─────────────────────────────────────────────────────────────────────────────

describe("o calendário grava a direção de arte no post", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findUnique.mockResolvedValue({
      id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
      presentedAt: new Date("2026-08-07"),
    });
    db.socialPost.findMany.mockResolvedValue([]);
    db.socialPost.findFirst.mockResolvedValue(null);
    db.socialPost.create.mockResolvedValue({ id: "post-novo" });
    db.activityEvent.create.mockResolvedValue({});
  });

  it("artDirection sai do markdown e entra no SocialPost", async () => {
    db.deliverable.findMany.mockResolvedValue([{
      id: "d1", name: "Social — semana 1", type: "social",
      visibility: "compartilhado", revisionStatus: "quality_ok",
      content: [
        "**1. A vaga pode ser aqui do lado**",
        "- Pilar: bastidor da região",
        "- Formato: feed",
        `- Legenda: ${LEGENDA_CITYJOBS.replace(/\n/g, " ")}`,
        `- Visual: ${DIRECAO_CITYJOBS}`,
      ].join("\n"),
    }]);

    await agendarPostsDaEntrega("p1");

    expect(db.socialPost.create).toHaveBeenCalledTimes(1);
    const dados = db.socialPost.create.mock.calls[0]![0].data as {
      artDirection: string | null; caption: string;
    };
    expect(dados.artDirection).toBe(DIRECAO_CITYJOBS);
    // E a legenda continua sendo a legenda. Os dois campos são diferentes de
    // propósito: um é lido por gente, o outro é desenhado por máquina.
    expect(dados.caption).toContain("#altotietê");
    expect(dados.artDirection).not.toContain("#altotietê");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. O GERADOR RECEBE A DIREÇÃO, NÃO A LEGENDA — é a tarefa inteira
// ─────────────────────────────────────────────────────────────────────────────

describe("o prompt da imagem", () => {
  it("a direção vira a Cena a retratar; a legenda some do lugar dela", () => {
    const p = montarPrompt({
      legenda: LEGENDA_CITYJOBS,
      direcaoDeArte: DIRECAO_CITYJOBS,
      pilar: "Bastidor da região",
      negocio: "CityJobs",
      segmento: "plataforma de vagas",
      cores: ["#0D2B4D"],
      tom: "prático",
    });
    expect(p).toContain(`Cena a retratar: ${DIRECAO_CITYJOBS}`);
    // O CTA e a hashtag da legenda NÃO podem estar no pedido de imagem: eram
    // eles que faziam o modelo receber texto-para-ler como descrição-de-cena.
    expect(p).not.toContain("link da bio");
    expect(p).not.toContain("#altotietê");
  });

  it("sem direção, cai na legenda — o fallback é o que torna a mudança reversível", () => {
    const p = montarPrompt({
      legenda: LEGENDA_CITYJOBS,
      direcaoDeArte: null,
      pilar: "Bastidor da região",
      negocio: "CityJobs",
      segmento: "plataforma de vagas",
      cores: [],
      tom: "",
    });
    expect(p).toContain("Cena a retratar: A vaga que você procura pode ser aqui do lado.");
  });

  it("direção só de espaço é ausência de direção, não direção vazia", () => {
    const p = montarPrompt({
      legenda: LEGENDA_CITYJOBS,
      direcaoDeArte: "   \n  ",
      pilar: null, negocio: "CityJobs", segmento: "", cores: [], tom: "",
    });
    expect(p).toContain("Cena a retratar: A vaga que você procura");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. A FIAÇÃO VIVA — o motor de arte, de ponta a ponta
// ─────────────────────────────────────────────────────────────────────────────
//
// Os testes acima provam cada peça. Este prova a CORRENTE, que é onde as três
// quebras do piloto de 07/08 apareceram: cada peça passava no teste dela.

describe("produzirArtesPendentes usa a direção gravada no post", () => {
  const POST_CITYJOBS = {
    id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    caption: LEGENDA_CITYJOBS,
    artDirection: DIRECAO_CITYJOBS,
    pillar: "Bastidor da região",
    format: "feed", mediaUrl: null, lastError: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.socialPost.findMany.mockResolvedValue([{ ...POST_CITYJOBS }]);
    db.socialPost.update.mockResolvedValue({});
    db.client.findUnique.mockResolvedValue({
      name: "CityJobs", industry: "plataforma de vagas",
      brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "prático" },
    });
    generateDesign.mockResolvedValue({
      ok: true,
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      model: "gpt-image-1",
    });
    guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.png", sizeBytes: 100, url: "/api/media/m1" } });
    db.mediaAsset.findFirst.mockResolvedValue(null);
    db.mediaAsset.count.mockResolvedValue(0);
    estiloVisualPersistido.mockResolvedValue("");
    estiloVistoPersistido.mockResolvedValue("");
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("peca"), largura: 1080, altura: 1350,
      textosPintados: [], textoRecusado: [], encolheu: false, origemDoMolde: "marca", lacunasDoMolde: [],
    });
  });

  it("o pedido de imagem contém a direção e NÃO contém a legenda", async () => {
    await produzirArtesPendentes();
    expect(generateDesign).toHaveBeenCalledTimes(1);
    const prompt = generateDesign.mock.calls[0]![0].prompt as string;
    expect(prompt).toContain(DIRECAO_CITYJOBS.slice(0, 60));
    expect(prompt).not.toContain("Vagas atualizadas no link da bio");
    expect(prompt).not.toContain("#altotietê");
  });

  it("post sem direção (peça anterior a 15/08) continua saindo pela legenda", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_CITYJOBS, artDirection: null }]);
    await produzirArtesPendentes();
    const prompt = generateDesign.mock.calls[0]![0].prompt as string;
    expect(prompt).toContain("Cena a retratar: A vaga que você procura pode ser aqui do lado.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. A METADE PERIGOSA — a direção NUNCA vira letra na peça
// ─────────────────────────────────────────────────────────────────────────────

describe("a direção de arte não atravessa para o pixel", () => {
  const FONTE_ARTES = readFileSync(join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");

  /** O fonte sem comentários — o que a máquina executa, não o que ela explica. */
  const corpo = FONTE_ARTES
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");

  it("`artDirection` nunca é passado como fonteAuditada, titulo, apoio ou selo", () => {
    for (const papel of ["fonteAuditada", "titulo", "apoio", "selo", "assinatura"]) {
      expect(corpo).not.toMatch(new RegExp(`${papel}\\s*:\\s*[^,\\n]*artDirection`));
    }
  });

  it("`artDirection` só é lido no ponto que monta o PROMPT", () => {
    const ocorrencias = corpo.match(/artDirection/g) ?? [];
    expect(ocorrencias.length).toBe(1);
    expect(corpo).toMatch(/direcaoDeArte:\s*post\.artDirection/);
  });

  it("a fonte auditada da peça continua sendo a legenda, e só ela", () => {
    expect(corpo).toMatch(/fonteAuditada:\s*post\.caption/);
  });

  it("mesmo se alguém tentasse, a trava de texto barraria: a direção não tem lastro na legenda", async () => {
    // A prova de comportamento, e não só de fonte. `travaDeTextoNaArte` exige
    // trecho LITERAL da fonte auditada. A direção de arte descreve uma cena; ela
    // não é trecho da legenda, e por construção nunca vira pixel de texto.
    const { travaDeTextoNaArte } = await import("@/lib/agency/design/trava-de-texto");
    const v = travaDeTextoNaArte(DIRECAO_CITYJOBS, LEGENDA_CITYJOBS);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toBe("sem_lastro_no_conteudo_auditado");
  });
});
