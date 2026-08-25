// O PRÉ-PORTÃO DA DIREÇÃO — barra antes de pagar, e não vira carimbo.
//
// Duas metades, e as duas são obrigatórias:
//   1. ele BARRA o conceito abstrato — que é o que gera desenho vetorial;
//   2. ele DEIXA PASSAR a direção fotografável — porque detector que aperta
//      demais para de produzir peça legítima, e aí o remédio vira a doença.
//
// A terceira metade, que é a mais fácil de esquecer: ele NUNCA reprova imagem
// já gerada. Essa é a jurisdição do portão do pixel.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conferirDirecaoFotografavel } from "@/lib/agency/design/direcao-fotografavel";

const RAIZ = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — O CONCEITO ABSTRATO NÃO VIRA IMAGEM PAGA
// ─────────────────────────────────────────────────────────────────────────────

describe("barra a direção que não descreve uma foto", () => {
  it("o conceito abstrato é barrado, e o motivo diz o que faltou", () => {
    const v = conferirDirecaoFotografavel("A confiança de quem encontra uma vaga validada");
    expect(v.fotografavel).toBe(false);
    expect(v.faltou).toContain("luz");
    expect(v.motivo).toMatch(/não descreve uma foto/i);
    // O motivo tem de ensinar a consertar, não só reprovar.
    expect(v.motivo).toMatch(/QUEM aparece, ONDE e sob QUE LUZ/);
    // E tem de dizer que não custou nada — senão vira alarme sem ação.
    expect(v.motivo).toMatch(/NÃO foi gerada e nada foi gasto/);
  });

  it("adjetivo de agência não é cena: 'estilo moderno, cores vibrantes'", () => {
    const v = conferirDirecaoFotografavel(
      "Estilo moderno e minimalista, cores vibrantes, transmitindo profissionalismo e inovação",
    );
    expect(v.fotografavel).toBe(false);
    expect(v.faltou).toEqual(expect.arrayContaining(["lugar", "luz"]));
  });

  it("direção vazia, nula ou só de espaço não passa por acidente", () => {
    for (const d of ["", "   \n ", null, undefined]) {
      expect(conferirDirecaoFotografavel(d).fotografavel).toBe(false);
    }
  });

  it("duas das três não bastam — a régua são as três", () => {
    // Sujeito e lugar, sem luz nenhuma.
    const v = conferirDirecaoFotografavel("Operador dentro do galpão");
    expect(v.fotografavel).toBe(false);
    expect(v.faltou).toEqual(["luz"]);
    expect(v.achou).toEqual(expect.arrayContaining(["sujeito", "lugar"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// METADE 2 — A DIREÇÃO LEGÍTIMA PASSA
// ─────────────────────────────────────────────────────────────────────────────

describe("deixa passar a direção que descreve uma foto", () => {
  it("o exemplo de referência passa inteiro", () => {
    const v = conferirDirecaoFotografavel(
      "galpão em Suzano no fim da tarde, operador conferindo caixas",
    );
    expect(v.fotografavel).toBe(true);
    expect(v.faltou).toEqual([]);
    expect(v.achou).toEqual(expect.arrayContaining(["sujeito", "lugar", "luz"]));
    expect(v.motivo).toBe("");
  });

  it("a direção das peças que o CEO APROVOU continua passando", () => {
    // As duas peças aprovadas de 08/08 são institucionais e usam foto da
    // região. Um detector que as barrasse estaria consertando o que funciona.
    const v = conferirDirecaoFotografavel(
      "Plataforma da estação da CPTM em Mogi das Cruzes no fim da tarde, com passageiros " +
        "descendo do trem, luz baixa e a fachada da estação ao fundo. Fotografia real, sem letreiro legível.",
    );
    expect(v.fotografavel).toBe(true);
  });

  it("passa por caminhos diferentes: gerúndio vale como sujeito, nome próprio vale como lugar", () => {
    // Nenhum substantivo de pessoa e nenhum substantivo da lista de lugares:
    // só "servindo" (gerúndio) e "em Poá" (nome próprio depois de preposição).
    const v = conferirDirecaoFotografavel("Em Poá, servindo o pão ainda quente sob luz de janela");
    expect(v.fotografavel).toBe(true);
  });

  it("cozinha, obra e balcão — a variedade de ofício que a casa atende", () => {
    for (const d of [
      "cozinha de restaurante no meio-dia, cozinheira montando o prato na bancada",
      "canteiro de obra ao amanhecer, pedreiro assentando bloco",
      "balcão de padaria em Ferraz de Vasconcelos de manhã, atendente entregando o pão",
      "cabine do caminhão à noite, motorista conferindo a rota sob a luz do painel",
    ]) {
      expect(conferirDirecaoFotografavel(d).fotografavel).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A JURISDIÇÃO — ele barra ANTES de pagar, nunca depois
// ─────────────────────────────────────────────────────────────────────────────

describe("o pré-portão não invade o portão do pixel", () => {
  const FONTE = readFileSync(join(RAIZ, "lib/agency/design/direcao-fotografavel.ts"), "utf8");

  it("não lê pixel, não abre imagem, não chama nada de fora", () => {
    // Sem import nenhum: é leitura de string pura. É o que o torna barato o
    // bastante para rodar antes de TODA geração.
    expect(FONTE).not.toMatch(/^import /m);
    expect(FONTE).not.toMatch(/sharp|Buffer|fetch\(|generateDesign/);
  });

  it("no motor, ele roda ANTES de generateDesign — não depois", async () => {
    const artes = readFileSync(join(RAIZ, "lib/agency/execution/artes.ts"), "utf8");
    const corpo = artes.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const posPortao = corpo.indexOf("conferirDirecaoFotografavel(direcaoEscrita)");
    const posGerador = corpo.indexOf("await generateDesign({");
    expect(posPortao).toBeGreaterThan(-1);
    expect(posGerador).toBeGreaterThan(-1);
    expect(posPortao).toBeLessThan(posGerador);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FIAÇÃO VIVA — a peça abstrata não gasta um centavo
// ─────────────────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
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
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
  project: {
    findFirst: vi.fn(async () => ({ clientRequestId: "cr-pago", id: "proj-pago", clientId: "cli-1" })), findUnique: vi.fn() },
  deliverable: { findMany: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const montarPeca = vi.hoisted(() => vi.fn());
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());
const conferirFundoDaPeca = vi.hoisted(() => vi.fn());
// O caminho de VOLTA da direção reprovada (25/08/2026) chama o especialista de
// texto. Ele é testemunha aqui: o que este arquivo mede é o dinheiro de IMAGEM.
const generate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo: vi.fn(), caminhoPublicoAssinado: vi.fn() }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel: vi.fn() }));
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
vi.mock("@/lib/agency/design/portao-do-fundo", () => ({
  conferirFundoDaPeca,
  motivoDoFundoEmUmaLinha: () => "",
}));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente: vi.fn() }));
vi.mock("@/lib/ai/generate", () => ({ generate }));

const { produzirArtesPendentes } = await import("@/lib/agency/execution/artes");

describe("produzirArtesPendentes não paga por direção abstrata", () => {
  const POST = {
    id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    caption: "A vaga que você procura pode ser aqui do lado.",
    artDirection: "A confiança de quem encontra uma vaga validada — segurança e profissionalismo",
    pillar: "Institucional", format: "feed", mediaUrl: null, lastError: null,
  };

  it("a peça não é tentada, nenhuma imagem é gerada e nenhuma tentativa é gasta", async () => {
    vi.clearAllMocks();
    db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
    db.socialPost.update.mockResolvedValue({});
    db.mediaAsset.count.mockResolvedValue(0);
    db.mediaAsset.findFirst.mockResolvedValue(null);
    db.client.findUnique.mockResolvedValue({
      name: "CityJobs", industry: "plataforma de vagas",
      brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "prático" },
    });
    estiloVisualPersistido.mockResolvedValue("");
    estiloVistoPersistido.mockResolvedValue("");

    // O especialista insiste no conceito: a reescrita automática também reprova.
    generate.mockResolvedValue({ ok: true, data: { direction: "a confiança de quem encontra uma vaga, visual premium" } });

    const r = await produzirArtesPendentes();

    // Nada foi pedido ao modelo de imagem: é o ponto inteiro deste portão.
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.produzidas).toBe(0);
    expect(r.desistiram).toContain("sp1");
    // `desistiram`, não `falhas`: nenhuma tentativa a mais conserta isto.
    expect(r.falhas).toEqual([]);
    // E o motivo chega escrito na peça — agora com o desfecho DECLARADO, porque
    // desde 25/08 a direção reprovada tem caminho de volta e ele foi até o fim.
    const erroGravado = db.socialPost.update.mock.calls.at(-1)![0].data.lastError as string;
    expect(erroGravado).toMatch(/Dono:/);
    expect(erroGravado).toMatch(/Próxima ação:/);
  });

  it("a direção fotografável passa e a imagem é pedida normalmente", async () => {
    vi.clearAllMocks();
    db.socialPost.findMany.mockResolvedValue([
      { ...POST, artDirection: "galpão em Suzano no fim da tarde, operador conferindo caixas" },
    ]);
    db.socialPost.update.mockResolvedValue({});
    db.mediaAsset.count.mockResolvedValue(0);
    db.mediaAsset.findFirst.mockResolvedValue(null);
    db.client.findUnique.mockResolvedValue({
      name: "CityJobs", industry: "plataforma de vagas",
      brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "prático" },
    });
    estiloVisualPersistido.mockResolvedValue("");
    estiloVistoPersistido.mockResolvedValue("");
    generateDesign.mockResolvedValue({
      ok: true,
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      model: "gpt-image-1",
    });
    guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.png", sizeBytes: 100, url: "/api/media/m1" } });
    conferirFundoDaPeca.mockResolvedValue({ ok: true });
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("peca"), largura: 1080, altura: 1350,
      textosPintados: [], textoRecusado: [], encolheu: false, origemDoMolde: "marca", lacunasDoMolde: [],
    });

    const r = await produzirArtesPendentes();
    expect(generateDesign).toHaveBeenCalledTimes(1);
    expect(r.desistiram).not.toContain("sp1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CAMINHO QUE PRODUZ DE VERDADE — a peça reprovada VIRA IMAGEM (25/08/2026)
//
// Este é o teste que o defeito exigia. Sete auditorias homologaram a corrente do
// Story sem que nada saísse, porque mediam o portão (que estava certo) e não o
// MOTOR (que parava nele). Aqui a peça entra em `produzirArtesPendentes` — a
// mesma função que o despertador chama em produção — com a direção que reprovou
// em produção, e o que se mede é se sai imagem do outro lado.
// ─────────────────────────────────────────────────────────────────────────────

describe("a direção reprovada é reescrita DENTRO do motor, e a peça sai", () => {
  const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const BOA = "macro do disco de freio desgastado sobre a bancada, fundo desfocado cinza escuro, luz fria de fluorescente da oficina";

  function cenarioDaOficina(direcao: string) {
    vi.clearAllMocks();
    db.socialPost.findMany.mockResolvedValue([{
      id: "story-farol-1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
      caption: "Freio que range não é manha: é aviso.",
      artDirection: direcao, pillar: "educativo — manutenção",
      format: "story", mediaUrl: null, lastError: null,
    }]);
    db.socialPost.update.mockResolvedValue({});
    db.mediaAsset.count.mockResolvedValue(0);
    db.mediaAsset.findFirst.mockResolvedValue(null);
    db.client.findUnique.mockResolvedValue({
      name: "OFICINA FAROL TESTE", industry: "oficina mecânica",
      brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#E11D48", tone: "direto" },
    });
    estiloVisualPersistido.mockResolvedValue("");
    estiloVistoPersistido.mockResolvedValue("");
    generateDesign.mockResolvedValue({ ok: true, url: PIXEL, model: "gpt-image-1" });
    guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m9", fileName: "story.jpg", sizeBytes: 100, url: "/api/media/m9" } });
    conferirFundoDaPeca.mockResolvedValue({ ok: true });
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("peca"), largura: 1080, altura: 1920,
      textosPintados: [], textoRecusado: [], encolheu: false, origemDoMolde: "marca", lacunasDoMolde: [],
    });
  }

  it("A PEÇA QUE MORREU EM PRODUÇÃO AGORA SAI: reescreve, aprova e gera a imagem", async () => {
    // Exatamente a direção que o especialista escreveu e que reprovou 4 de 4.
    cenarioDaOficina("disco de freio desgastado, fundo desfocado cinza escuro");
    generate.mockResolvedValue({ ok: true, data: { direction: BOA } });

    const r = await produzirArtesPendentes();

    // 1. O especialista foi chamado — a proibição passou a dizer o que fazer.
    expect(generate).toHaveBeenCalledTimes(1);
    // 2. A imagem FOI pedida: a fila deixou de ser morta.
    expect(generateDesign).toHaveBeenCalledTimes(1);
    // 3. E o gerador recebeu a direção REESCRITA, não a que a régua recusou.
    const promptDaImagem = generateDesign.mock.calls[0]![0].prompt as string;
    expect(promptDaImagem).toContain("macro do disco de freio desgastado");
    expect(promptDaImagem).not.toContain("disco de freio desgastado, fundo desfocado cinza escuro");
    // 4. A peça saiu produzida e não desistiu.
    expect(r.produzidas).toBe(1);
    expect(r.desistiram).not.toContain("story-farol-1");
    // 5. A direção reescrita foi GRAVADA — a rodada seguinte não paga de novo.
    const gravou = db.socialPost.update.mock.calls
      .map((c) => c[0].data as { artDirection?: string })
      .find((d) => typeof d.artDirection === "string");
    expect(gravou?.artDirection).toBe(BOA);
  });

  it("o close-up JÁ COMPLETO não gasta reescrita nenhuma — a régua entende a família", async () => {
    cenarioDaOficina(BOA);
    const r = await produzirArtesPendentes();
    expect(generate).not.toHaveBeenCalled();
    expect(generateDesign).toHaveBeenCalledTimes(1);
    expect(r.produzidas).toBe(1);
  });

  it("reescrita que não conserta NÃO vira imagem — o portão não virou porta dos fundos", async () => {
    cenarioDaOficina("disco de freio desgastado, fundo desfocado cinza escuro");
    generate.mockResolvedValue({ ok: true, data: { direction: "visual premium e moderno do produto" } });

    const r = await produzirArtesPendentes();

    expect(generate).toHaveBeenCalledTimes(2);          // o teto, e só o teto
    expect(generateDesign).not.toHaveBeenCalled();      // nenhum dólar de imagem
    expect(r.desistiram).toContain("story-farol-1");
    const erro = db.socialPost.update.mock.calls.at(-1)![0].data.lastError as string;
    expect(erro).toMatch(/Dono: o especialista/);
    expect(erro).toMatch(/Próxima ação:/);
  });

  it("O TETO ATRAVESSA RODADAS: peça que já esgotou não chama o especialista de novo", async () => {
    // A rodada anterior gravou a parada declarada. O despertador traz a peça de
    // volta (ela continua sem `mediaUrl`), e ela NÃO pode gastar texto de novo.
    cenarioDaOficina("disco de freio desgastado, fundo desfocado cinza escuro");
    db.socialPost.findMany.mockResolvedValue([{
      id: "story-farol-1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
      caption: "Freio que range não é manha: é aviso.",
      artDirection: "disco de freio desgastado, fundo desfocado cinza escuro",
      pillar: "educativo — manutenção", format: "story", mediaUrl: null,
      lastError: "[direcao 2/2] a direção de arte foi recusada e 2 reescrita(s) automática(s) não a consertaram",
    }]);

    const r = await produzirArtesPendentes();

    expect(generate).not.toHaveBeenCalled();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.desistiram).toContain("story-farol-1");
  });
});
