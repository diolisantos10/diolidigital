// A FICHA DE MARCA ÚNICA — de ponta a ponta, contra BANCO REAL (04/10/2026).
//
// O pedido do CEO: "preencher todos os campos, salvar, recarregar, conferir
// que tudo voltou, e conferir que a geração de legenda e de arte recebe os
// valores novos". É exatamente o que este arquivo faz, na mesma ordem:
//
//   1. cadastro: descrição e status do Novo Cliente CHEGAM ao banco;
//   2. PUT da ficha com TODOS os campos → GET devolve todos, iguais;
//   3. a rota antiga do Brand Hub (13 campos) não descarta mais nenhum;
//   4. a LEGENDA (contrato de marca) recebe slogan, produtos, paleta…;
//   5. a ARTE (prompt da imagem) recebe estilo de foto, paleta, logo;
//   6. as duas metades: campo ausente do corpo NÃO apaga o que existia;
//      notas internas NÃO vazam para a produção; sem sessão = 401.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/ficha-unica-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

type Sessao = { userId: string; email: string; name: string; role: string; workspaceId: string } | null;
const sessao = vi.hoisted(() => ({ atual: null as Sessao }));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async (): Promise<Sessao> => sessao.atual),
}));

import { prisma } from "@/lib/db/client";
import { GET as getFicha, PUT as putFicha } from "@/app/api/agency/clients/[id]/ficha-unica/route";
import { PUT as putBrandHub } from "@/app/api/clients/[id]/brand-brain/route";
import { POST as postCliente } from "@/app/api/clients/route";
import { CAMPOS_DA_FICHA_UNICA, lerPaleta, lerProdutos } from "@/lib/agency/esteira/ficha-unica";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { lerMarca, montarPrompt } from "@/lib/agency/execution/artes";

let workspaceId = "";
let clientId = "";

/** Um valor diferente e reconhecível para CADA campo da ficha. */
const FICHA_CHEIA: Record<string, string> = {
  tagline: "Sabor que chega rápido",
  resumo: "Delivery de sushi artesanal na zona sul",
  manifesto: "Nascemos numa cozinha de casa em 2019",
  proposta: "Sushi de restaurante pelo preço de delivery",
  publico: "Jovens adultos de 25 a 40 que pedem à noite",
  tom: "próximo e bem-humorado",
  produtos: "Temaki — salmão fresco — R$ 29,90\nCombo Casal — 30 peças",
  concorrentes: "Sushi Leblon, Temakeria Z",
  objetivos: "Dobrar pedidos pelo Instagram até março",
  canais: "Instagram\nWhatsApp",
  paleta: "Vermelho #C8102E fundo; Preto #111111 texto, Creme #F5EBDD · Dourado sem código",
  tipografia: "Montserrat Bold (títulos), Inter (texto)",
  regrasDoLogo: "Nunca sobre fundo vermelho; área de proteção de 1 letra",
  estiloDeFoto: "Luz natural lateral, mesa de madeira escura, close no peixe",
  regras: "Nunca prometer entrega em 15 minutos\nSempre mostrar o produto real",
  evitar: "Palavra barato; emojis de fogo",
  notasInternas: "Dono prefere falar por áudio — SEGREDO-INTERNO-123",
};

function req(url: string, metodo: string, corpo?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `ficha-unica-${Date.now()}` } });
  workspaceId = ws.id;
  sessao.atual = { userId: "u1", email: "m@x", name: "Master", role: "master", workspaceId };
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("1. o cadastro do Novo Cliente guarda descrição e status", () => {
  it("POST /api/clients grava os dois no banco", async () => {
    const r = await postCliente(req("/api/clients", "POST", {
      name: "Sushi Teste", industry: "Restaurante",
      description: "Cliente de teste da ficha única", status: "onboarding",
    }));
    expect(r.status).toBe(201);
    const criado = (await r.json()) as { id: string };
    clientId = criado.id;
    const doBanco = await prisma.client.findUnique({ where: { id: clientId } });
    expect(doBanco?.descricao).toBe("Cliente de teste da ficha única");
    expect(doBanco?.status).toBe("onboarding");
  });
});

describe("2. preencher TODOS os campos, salvar, recarregar: tudo volta", () => {
  it("a lista de campos cobre o escopo do CEO (17 campos)", () => {
    const chaves = CAMPOS_DA_FICHA_UNICA.map((c) => c.chave);
    expect(chaves).toEqual(Object.keys(FICHA_CHEIA));
  });

  it("PUT grava e o GET seguinte devolve cada campo IGUAL ao enviado", async () => {
    const put = await putFicha(req(`/x`, "PUT", { ficha: FICHA_CHEIA }), params(clientId));
    expect(put.status).toBe(200);

    const get = await getFicha(req(`/x`, "GET"), params(clientId));
    const j = (await get.json()) as { ficha: Record<string, string> };
    for (const [chave, valor] of Object.entries(FICHA_CHEIA)) {
      expect(j.ficha[chave], `o campo "${chave}" não voltou igual`).toBe(valor);
    }
  });

  it("a paleta alimenta as duas colunas de cor que a arte já lia", async () => {
    const b = await prisma.brandBrain.findUnique({ where: { clientId } });
    expect(b?.primaryColor).toBe("#C8102E");
    expect(b?.secondaryColor).toBe("#111111");
  });

  it("campo AUSENTE do corpo fica como estava — salvar um não apaga os outros", async () => {
    await putFicha(req(`/x`, "PUT", { ficha: { tagline: "Novo slogan" } }), params(clientId));
    const get = await getFicha(req(`/x`, "GET"), params(clientId));
    const j = (await get.json()) as { ficha: Record<string, string> };
    expect(j.ficha.tagline).toBe("Novo slogan");
    expect(j.ficha.manifesto).toBe(FICHA_CHEIA.manifesto);
    expect(j.ficha.estiloDeFoto).toBe(FICHA_CHEIA.estiloDeFoto);
    await putFicha(req(`/x`, "PUT", { ficha: { tagline: FICHA_CHEIA.tagline } }), params(clientId));
  });

  it("valor que não é texto é recusado com o nome do campo", async () => {
    const r = await putFicha(req(`/x`, "PUT", { ficha: { paleta: 123 } }), params(clientId));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("Paleta");
  });

  it("sem sessão: 401, e nada é lido", async () => {
    const antes = sessao.atual;
    sessao.atual = null;
    try {
      expect((await getFicha(req(`/x`, "GET"), params(clientId))).status).toBe(401);
      expect((await putFicha(req(`/x`, "PUT", { ficha: {} }), params(clientId))).status).toBe(401);
    } finally {
      sessao.atual = antes;
    }
  });
});

describe("3. a rota antiga do Brand Hub não descarta mais campo nenhum", () => {
  it("os 13 campos do Brand Hub chegam à ficha única", async () => {
    const outro = await prisma.client.create({ data: { workspaceId, name: "Cliente do Brand Hub" } });
    const r = await putBrandHub(req("/x", "PUT", {
      businessSummary: "R", positioning: "P", targetAudience: "A", toneOfVoice: "T",
      visualStyle: "V", colors: "Azul #0000FF, Branco #FFFFFF", fonts: "F", references: "Ref",
      brandRules: "Regra 1", productsToHighlight: "Prod", thingsToAvoid: "Ev",
      preferredChannels: "Can", strategicNotes: "Notas",
    }), params(outro.id));
    expect(r.status).toBe(200);
    const get = await getFicha(req(`/x`, "GET"), params(outro.id));
    const { ficha } = (await get.json()) as { ficha: Record<string, string> };
    expect(ficha).toMatchObject({
      resumo: "R", proposta: "P", publico: "A", tom: "T", estiloDeFoto: "V",
      paleta: "Azul #0000FF, Branco #FFFFFF", tipografia: "F", concorrentes: "Ref",
      regras: "Regra 1", produtos: "Prod", evitar: "Ev", canais: "Can", notasInternas: "Notas",
    });
    // Separada por VÍRGULA (antes só "·" funcionava): as duas cores chegam.
    const b = await prisma.brandBrain.findUnique({ where: { clientId: outro.id } });
    expect([b?.primaryColor, b?.secondaryColor]).toEqual(["#0000FF", "#FFFFFF"]);
  });
});

describe("4. a LEGENDA recebe os valores novos", () => {
  it("o contrato de marca (que legenda, calendário e semana leem) traz a ficha", async () => {
    const c = await contratoDeMarca(clientId);
    for (const trecho of [
      "A MARCA, PELA FICHA",
      "Sabor que chega rápido",
      "Temaki — salmão fresco — R$ 29,90",
      "Vermelho #C8102E (fundo)",
      "Luz natural lateral",
      "Palavra barato",
      "Nunca prometer entrega em 15 minutos",
    ]) {
      expect(c.texto, `"${trecho}" não chegou ao contrato`).toContain(trecho);
    }
  });

  it("notas internas NUNCA chegam à produção", async () => {
    const c = await contratoDeMarca(clientId);
    expect(c.texto).not.toContain("SEGREDO-INTERNO-123");
  });

  it("ficha gigante não estoura o teto: corta por linha inteira e declara o corte", async () => {
    const gigante = await prisma.client.create({ data: { workspaceId, name: "Gigante" } });
    await putFicha(req(`/x`, "PUT", { ficha: { ...FICHA_CHEIA, manifesto: "m".repeat(3000) } }), params(gigante.id));
    const c = await contratoDeMarca(gigante.id);
    expect(c.texto.length).toBeLessThanOrEqual(1800);
    expect(c.texto).toContain("Palavra barato"); // o que proíbe vem primeiro e fica
    expect(c.cortado).toContain("Ficha: Manifesto");
  });
});

describe("5. a ARTE recebe os valores novos", () => {
  it("o prompt da imagem traz estilo de foto, paleta, tipografia, logo e o que evitar", async () => {
    const marca = await lerMarca(clientId);
    const prompt = montarPrompt({
      legenda: "Promoção de temaki",
      pilar: null,
      negocio: marca.nome,
      segmento: marca.segmento,
      cores: marca.cores,
      tom: marca.tom,
      fichaDaImagem: marca.fichaDaImagem,
    });
    for (const trecho of [
      "Luz natural lateral",
      "#C8102E",
      "Montserrat Bold",
      "Nunca sobre fundo vermelho",
      "emojis de fogo",
    ]) {
      expect(prompt, `"${trecho}" não chegou ao prompt da arte`).toContain(trecho);
    }
    expect(prompt).not.toContain("SEGREDO-INTERNO-123");
  });
});

describe("leitores de texto livre", () => {
  it("a paleta aceita vírgula, ponto e vírgula, linha e · — e não descarta cor sem código", () => {
    const cores = lerPaleta("Vermelho #C8102E fundo; Preto #111 texto\nCreme #F5EBDD, Dourado · Azul #00F");
    expect(cores.map((c) => c.hex)).toEqual(["#C8102E", "#111", "#F5EBDD", null, "#00F"]);
    expect(cores[0]).toEqual({ nome: "Vermelho", hex: "#C8102E", uso: "fundo" });
    expect(cores[3]).toEqual({ nome: "Dourado", hex: null, uso: "" });
  });

  it("produtos: nome — descrição — preço, com preço opcional", () => {
    expect(lerProdutos("Temaki — salmão — R$ 29,90\nCombo — 30 peças")).toEqual([
      { nome: "Temaki", descricao: "salmão", preco: "R$ 29,90" },
      { nome: "Combo", descricao: "30 peças", preco: null },
    ]);
  });
});

describe("a rota não engole corpo em formato errado (04/10/2026)", () => {
  it("chaves SOLTAS no corpo também gravam", async () => {
    const r = await putFicha(req(`/x`, "PUT", { objetivos: "Objetivo solto" }), params(clientId));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { gravados: string[]; ficha: Record<string, string> };
    expect(j.gravados).toEqual(["objetivos"]);
    expect(j.ficha.objetivos).toBe("Objetivo solto");
    await putFicha(req(`/x`, "PUT", { ficha: { objetivos: FICHA_CHEIA.objetivos } }), params(clientId));
  });

  it("nenhuma chave reconhecida → 400 com a lista do que foi ignorado, e nada muda", async () => {
    const r = await putFicha(req(`/x`, "PUT", { slogan: "x", estilo: "y" }), params(clientId));
    expect(r.status).toBe(400);
    const j = (await r.json()) as { error: string; ignorados: string[] };
    expect(j.ignorados).toEqual(["slogan", "estilo"]);
    expect(j.error).toContain("tagline");
  });

  it("chave desconhecida junto de conhecidas: grava as conhecidas e devolve as ignoradas", async () => {
    const r = await putFicha(req(`/x`, "PUT", { ficha: { canais: FICHA_CHEIA.canais, slogan: "x" } }), params(clientId));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ignorados: string[] }).ignorados).toEqual(["slogan"]);
  });
});

describe("conferência em produção: o que a produção lê", () => {
  it("devolve o contrato da legenda e a linha da arte com os valores da ficha, sem notas internas", async () => {
    const { GET: oQueLe } = await import("@/app/api/agency/clients/[id]/marca/o-que-a-producao-le/route");
    const r = await oQueLe(req(`/x`, "GET"), params(clientId));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { legenda: { texto: string; recebeAFicha: boolean }; arte: { fichaDaImagem: string; cores: string[] } };
    expect(j.legenda.recebeAFicha).toBe(true);
    expect(j.legenda.texto).toContain("Sabor que chega rápido");
    expect(j.arte.fichaDaImagem).toContain("Luz natural lateral");
    expect(j.arte.cores).toEqual(["#C8102E", "#111111"]);
    expect(JSON.stringify(j)).not.toContain("SEGREDO-INTERNO-123");
  });
});
