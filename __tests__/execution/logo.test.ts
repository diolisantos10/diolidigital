import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  mediaAsset: { findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo }));

import {
  produzirKitDeMarca, montarWordmark, promptDoSimbolo, montarManual,
  escolherFamilia, corValida, FAMILIAS,
} from "@/lib/agency/execution/logo";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

beforeEach(() => {
  vi.clearAllMocks();
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.client.findUnique.mockResolvedValue({
    name: "Pet Feliz", industry: "Pet shop", workspaceId: "ws1",
    brandBrain: { primaryColor: "#2E7D5B", secondaryColor: "#E8D9C0", typography: "Poppins", tagline: "cuidar é o que fazemos", positioning: "carinho de verdade" },
  });
  generateDesign.mockResolvedValue({ ok: true, url: PNG });
  let n = 0;
  guardarArquivo.mockImplementation(async (i: { fileName: string }) => ({
    ok: true, arquivo: { id: `m${++n}`, fileName: i.fileName, sizeBytes: 10, url: `/api/media/m${n}` },
  }));
});

describe("o logo sai em ARQUIVO — era meio serviço cobrado inteiro", () => {
  it("entrega símbolo + versão clara + versão escura", async () => {
    const kit = await produzirKitDeMarca("p1", "c1", "ws1");
    expect(kit.arquivos).toHaveLength(3);
    expect(kit.arquivos.map((a) => a.nome)).toEqual([
      "logo-simbolo-pet-feliz.png",
      "logo-claro-pet-feliz.svg",
      "logo-escuro-pet-feliz.svg",
    ]);
  });

  it("o wordmark é VETOR — PNG de logo é rascunho, não vai para fachada", async () => {
    await produzirKitDeMarca("p1", "c1", "ws1");
    const svgs = guardarArquivo.mock.calls.filter((c) => c[0].mimeType === "image/svg+xml");
    expect(svgs).toHaveLength(2);
  });

  it("o símbolo falhar NÃO cancela o kit — wordmark bem composto já é logo usável", async () => {
    generateDesign.mockResolvedValue({ ok: false, error: "sem chave" });
    const kit = await produzirKitDeMarca("p1", "c1", "ws1");
    expect(kit.arquivos).toHaveLength(2);
    expect(kit.erro).toMatch(/sem chave/);
  });

  it("cliente que já tem logo não ganha outro — dois logos em dois meses é confusão, não marca", async () => {
    db.mediaAsset.findFirst.mockResolvedValue({ id: "m0" });
    const kit = await produzirKitDeMarca("p1", "c1", "ws1");
    expect(kit.arquivos).toHaveLength(0);
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("sem nome do cliente não há logo — não há o que escrever", async () => {
    db.client.findUnique.mockResolvedValue({ name: "", industry: "x", brandBrain: null });
    const kit = await produzirKitDeMarca("p1", "c1", "ws1");
    expect(kit.arquivos).toHaveLength(0);
    expect(kit.erro).toMatch(/sem nome/);
  });
});

describe("o nome da marca é composto por NÓS, não pelo modelo", () => {
  // Modelo de imagem erra letra. Sempre. Um logo com o nome do cliente escrito
  // errado é o erro mais visível possível, no ativo mais permanente que ele tem.
  it("o prompt do símbolo proíbe texto três vezes — modelo insere letra sem pedir", () => {
    const p = promptDoSimbolo({ negocio: "Pet Feliz", segmento: "Pet shop", cor: "#2E7D5B", posicionamento: "" });
    expect(p).toMatch(/NENHUMA letra/);
    expect(p).toMatch(/Não escreva o nome/);
    expect(p).toMatch(/zero texto/i);
  });

  it("o nome aparece no SVG exatamente como o cliente escreveu", () => {
    const svg = montarWordmark({ nome: "Pet Feliz", tagline: null, familia: FAMILIAS.neutra!, fundo: "#fff", tinta: "#000", apoio: "#888" });
    expect(svg).toContain(">Pet Feliz<");
  });

  it('"Bar & Cia" não corrompe o arquivo do cliente', () => {
    // Um `&` cru quebra o XML e entrega um SVG inválido com o nome dele dentro.
    const svg = montarWordmark({ nome: "Bar & Cia", tagline: null, familia: FAMILIAS.neutra!, fundo: "#fff", tinta: "#000", apoio: "#888" });
    expect(svg).toContain("Bar &amp; Cia");
    expect(svg).not.toMatch(/Bar & Cia/);
  });

  it("toda família tem fallback genérico — o SVG abre na máquina do CLIENTE", () => {
    // Sem fallback, o logo dele abriria em Times New Roman.
    for (const [nome, familia] of Object.entries(FAMILIAS)) {
      expect(familia, nome).toMatch(/serif|sans-serif|cursive/);
    }
  });

  it("a tagline entra como linha de apoio, não compete com o nome", () => {
    const svg = montarWordmark({ nome: "Pet Feliz", tagline: "cuidar é o que fazemos", familia: FAMILIAS.neutra!, fundo: "#fff", tinta: "#000", apoio: "#888" });
    expect(svg).toContain("CUIDAR É O QUE FAZEMOS");
    expect(svg).toMatch(/font-size="20"/);
  });
});

describe("a cor e a fonte saem da marca, sem palpite", () => {
  it("só hex de verdade vira cor — 'azul petróleo' num fill não pinta nada", () => {
    expect(corValida("#2E7D5B")).toBe("#2E7D5B");
    expect(corValida("azul petróleo")).toBeNull();
    expect(corValida(null)).toBeNull();
  });

  it("a tipografia descrita escolhe a família", () => {
    expect(escolherFamilia("Playfair Display para títulos", "")).toBe("serifada");
    expect(escolherFamilia("Oswald", "")).toBe("condensada");
  });

  it("sem tipografia definida, o segmento decide — nunca o acaso", () => {
    expect(escolherFamilia("", "Padaria artesanal")).toBe("serifada");
    expect(escolherFamilia("", "Salão de beleza")).toBe("manuscrita");
    expect(escolherFamilia("", "Academia")).toBe("condensada");
  });
});

describe("o manual só descreve o que EXISTE", () => {
  it("lista os arquivos entregues, com o uso de cada um", () => {
    const m = montarManual({
      negocio: "Pet Feliz", primaria: "#2E7D5B", secundaria: "#E8D9C0",
      tipografia: "Poppins", tagline: null,
      arquivos: [{ nome: "logo-claro.svg", para: "fundo claro" }],
    });
    expect(m).toContain("logo-claro.svg: fundo claro");
    expect(m).toContain("#2E7D5B");
  });

  it("marca sem assinatura não ganha seção de assinatura", () => {
    const m = montarManual({
      negocio: "X", primaria: "#000", secundaria: "#fff", tipografia: "Inter",
      tagline: null, arquivos: [],
    });
    expect(m).not.toMatch(/A assinatura/);
  });
});
