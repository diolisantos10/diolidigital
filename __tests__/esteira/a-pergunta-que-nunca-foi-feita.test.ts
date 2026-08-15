// A PERGUNTA QUE NUNCA FOI FEITA — "o que a marca nunca deve fazer".
//
// ── O segundo cadeado da porta, independente do primeiro ────────────────────
//
// O gatilho do dia zero exige TRÊS proibições vigentes
// (`ficha-de-marca.ts:216`), e `proibicoes` é 1 dos 4 campos do `MODO_MINIMO`
// (`:51`) — ou seja, é das primeiras coisas que a entrevista deveria perguntar.
//
// Mas a lista de perguntas do portal era filtrada pelo mapa `COLUNA`
// (`portal/marca/route.ts:66`), e `proibicoes` não está nesse mapa **de
// propósito**: ela mora em `BrainArtifact`, não numa coluna de `BrandBrain`.
// O filtro certo (não duplicar a coluna) virou o filtro errado (não fazer a
// pergunta). O cliente nunca era perguntado justamente por aquilo de que a
// porta mais precisava — e mesmo com as referências consertadas, a marca não
// se constituiria.
//
// ── A pergunta já existia, no outro lado da casa ───────────────────────────
//
// `IntakeEngine.tsx:339` pergunta isto desde sempre, em língua de cliente:
// "tem algo que você definitivamente não quer — uma palavra, uma cor, um
// concorrente que nunca deve ser citado?". A resposta ia para `updateClient` →
// `PUT /api/clients/[id]`, que lê do corpo só name/industry/email/phone/website
// e descarta o resto em silêncio. Pergunta feita sem escritor.
//
// Por isso a redação foi REUSADA, não reescrita: três redações para a mesma
// pergunta é como nascem duas verdades sobre a mesma regra.

import { escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

/** A gaveta das proibições, em memória. É `BrainArtifact` de mentira, mas
 *  guarda o que recebe — mock que devolve constante nunca pegaria o defeito,
 *  porque o defeito é o que o escritor GRAVA (ou deixa de gravar). */
const gaveta = vi.hoisted(() => ({ versoes: [] as { canvasJson: string; version: number }[] }));
const db = vi.hoisted(() => ({
  brandBrain: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
  brainArtifact: {
    findFirst: vi.fn(async () => gaveta.versoes[gaveta.versoes.length - 1] ?? null),
    create: vi.fn(async ({ data }: { data: { canvasJson: string; version: number } }) => {
      gaveta.versoes.push({ canvasJson: data.canvasJson, version: data.version });
      return data;
    }),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const portal = vi.hoisted(() => ({ validatePortalAccess: vi.fn(), escopoDoToken: vi.fn() }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => portal);
// `escopoDoToken` (rodada 3) imita o real — ver `__tests__/_stubs/escopo-do-token.ts`.
portal.escopoDoToken.mockImplementation(escopoFalso(portal.validatePortalAccess, db));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({ tokenDoPortal: () => "tok" }));

import { GET as perguntar, POST as responder } from "@/app/api/portal/marca/route";
import { lerProibicoes, registrarProibicoesDeclaradas, MAX_PROIBICOES_POR_RESPOSTA } from "@/lib/agency/esteira/proibicoes";
import { PERGUNTA } from "@/lib/agency/esteira/ficha-de-marca";

const CLIENTE = "cli-cityjobs";

beforeEach(() => {
  vi.clearAllMocks();
  gaveta.versoes = [];
  portal.validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: CLIENTE } });
});

async function clienteResponde(corpo: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/portal/marca", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "Content-Type": "application/json" },
  });
  const res = await responder(req);
  return { status: res.status, corpo: (await res.json()) as Record<string, unknown> };
}

describe("⭐ a entrevista PERGUNTA o que a marca nunca deve fazer", () => {
  it("a pergunta aparece na primeira rodada — é do modo mínimo", async () => {
    const corpo = (await (await perguntar(new NextRequest("http://localhost/api/portal/marca"))).json()) as {
      perguntas: { campo: string; pergunta: string }[];
    };
    const p = corpo.perguntas.find((x) => x.campo === "proibicoes");
    expect(p, "a pergunta das proibições continua filtrada para fora da entrevista").toBeTruthy();
    expect(p!.pergunta).toMatch(/nunca deve/i);
  });

  it("a redação é a que a casa JÁ usava no painel — não uma terceira", () => {
    const intake = fs.readFileSync(
      path.join(process.cwd(), "components/agency/intake/IntakeEngine.tsx"), "utf8",
    );
    // O núcleo da pergunta do `IntakeEngine`, palavra por palavra.
    for (const pedaco of ["uma palavra, uma cor", "nunca deve ser citado"]) {
      expect(intake.includes(pedaco), `o painel deixou de perguntar "${pedaco}"`).toBe(true);
      expect(PERGUNTA.proibicoes.includes(pedaco), `a ficha reescreveu a pergunta em vez de reusar: "${pedaco}"`).toBe(true);
    }
  });
});

describe("⭐ a resposta VIRA proibição — e não uma coluna nova", () => {
  it("o cliente responde e a proibição fica registrada, legível pela régua", async () => {
    const { corpo } = await clienteResponde({
      campo: "proibicoes",
      resposta: "citar a Catho\nfoto de banco de imagem\nfalar de salário exato",
    });
    expect(corpo.gravado, `a resposta não virou proibição: ${String(corpo.motivo ?? "")}`).toBe(true);

    const lidas = await lerProibicoes(CLIENTE);
    expect(lidas.lidas).toBe(true);
    expect(lidas.itens.length, "o gatilho do dia zero exige três; a resposta trouxe três").toBe(3);
    expect(lidas.itens.flatMap((i) => i.termos)).toContain("catho");
  });

  it("NENHUMA coluna de BrandBrain foi tocada — as proibições têm dono", async () => {
    await clienteResponde({ campo: "proibicoes", resposta: "citar a Catho" });
    expect(db.brandBrain.upsert, "a proibição foi copiada para uma coluna, criando a segunda verdade").not.toHaveBeenCalled();
  });

  it("a resposta sem negação explícita TAMBÉM vira regra — a negação está na pergunta", async () => {
    // Este é o ponto do módulo. `extrairProibicoes` procura "não use" / "nunca
    // cite" no texto; quem responde "fotos de banco de imagem" à pergunta "o
    // que a gente nunca deve fazer" não escreve negação nenhuma — e antes
    // ficava sem nenhuma proibição registrada.
    await clienteResponde({ campo: "proibicoes", resposta: "fotos de banco de imagem" });
    const lidas = await lerProibicoes(CLIENTE);
    expect(lidas.itens.length).toBe(1);
    expect(lidas.itens[0]!.termos).toContain("banco");
  });

  it("a metade oposta: resposta que não vira regra conferível é DECLARADA, não engolida", async () => {
    // Só palavras vazias: nada aproveitável. O silêncio aqui seria pior que a
    // recusa — a agência acharia que existe uma regra valendo.
    const { corpo } = await clienteResponde({ campo: "proibicoes", resposta: "de o a" });
    expect(corpo.gravado).toBe(false);
    expect(String(corpo.motivo)).toMatch(/reescrever|conferir/i);
  });
});

describe("a régua de derivação de termos NÃO foi afrouxada", () => {
  it("uma resposta não vira vinte proibições", async () => {
    const dez = Array.from({ length: 10 }, (_, i) => `proibicao numero ${i}`).join("\n");
    await registrarProibicoesDeclaradas(CLIENTE, dez, "marca");
    const lidas = await lerProibicoes(CLIENTE);
    expect(lidas.itens.length).toBeLessThanOrEqual(MAX_PROIBICOES_POR_RESPOSTA);
  });

  it("vírgula NÃO quebra a frase: 'não cite Catho, Indeed nem Vagas' é UMA regra", async () => {
    await registrarProibicoesDeclaradas(CLIENTE, "não cite Catho, Indeed nem Vagas", "marca");
    const lidas = await lerProibicoes(CLIENTE);
    expect(lidas.itens.length).toBe(1);
    expect(lidas.itens[0]!.termos).toEqual(expect.arrayContaining(["catho", "indeed"]));
  });

  it("palavra de menos de 4 letras continua sem virar termo — bloquear 'ia' barraria 'família'", async () => {
    await registrarProibicoesDeclaradas(CLIENTE, "ia", "marca");
    expect((await lerProibicoes(CLIENTE)).itens.length).toBe(0);
  });

  it("a negação explícita continua mandando — o objeto sai sem o verbo", async () => {
    await registrarProibicoesDeclaradas(CLIENTE, "nunca use a palavra 'imperdível'", "marca");
    const lidas = await lerProibicoes(CLIENTE);
    expect(lidas.itens[0]!.termos, "o verbo entrou no termo — 'use' viraria palavra bloqueada").toEqual(["imperdivel"]);
  });
});

describe("de quem veio a resposta fica registrado", () => {
  it("o portal grava origem `marca` (o dono falou), não `equipe`", async () => {
    await clienteResponde({ campo: "proibicoes", resposta: "citar a Catho" });
    const itens = (JSON.parse(gaveta.versoes[0]!.canvasJson) as { itens: { origem: string }[] }).itens;
    expect(itens[0]!.origem).toBe("marca");
  });

  it("a porta do painel grava origem `equipe` — quem preencheu foi a agência", () => {
    const painel = fs.readFileSync(
      path.join(process.cwd(), "app/api/agency/clients/[id]/marca/route.ts"), "utf8",
    );
    expect(painel).toContain('origem: "equipe"');
  });

  it("a entrevista do painel manda `restrictions` para o dono das proibições", () => {
    // A pergunta existia e a resposta ia para o lixo: `updateClient` →
    // `PUT /api/clients/[id]`, que lê do corpo só name/industry/email/phone/
    // website. Este é o fio que faltava.
    const intake = fs.readFileSync(
      path.join(process.cwd(), "components/agency/intake/IntakeEngine.tsx"), "utf8",
    );
    const i = intake.indexOf('currentAnswers["restrictions"]');
    expect(i).toBeGreaterThan(-1);
    expect(intake.slice(i)).toContain("/marca");
    expect(intake.slice(i)).toContain("proibicoes:");
  });
});
