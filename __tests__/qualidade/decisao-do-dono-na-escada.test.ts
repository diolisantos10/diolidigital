// A DECISÃO DO DONO NA ESCADA — as duas metades, e a terceira que quase ninguém
// escreve.
//
// Metade 1: a decisão SOLTA de verdade — o departamento sobe e a peça, que
//           estava retida, passa a chegar ao cliente.
// Metade 2: ela NÃO inventa problema nem privilégio no caso limpo — não desce
//           ninguém, não leva a `wide`, não solta cliente que não é do escopo, e
//           não escreve nada na segunda passada.
// Metade 3: sem PROCEDÊNCIA (data, quem, e a fala literal) a decisão é recusada
//           e NADA é escrito. É esta que impede a lista de virar campo de texto.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  departmentLadder: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  departmentLadderRecord: { findMany: vi.fn(), create: vi.fn() },
  client: { findMany: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  aplicarDecisoesDoDono, aplicarDecisoesDoDonoNaCasa, recusarDecisao,
  DECISOES_DO_DONO, MINIMO_DA_FALA, type DecisaoDoDono,
} from "@/lib/agency/escada/decisoes-do-dono";
import { decidirEntrega, degrauDeclarado } from "@/lib/agency/escada/degraus";

const W = "ws1";
const CITYJOBS = "cli_cityjobs";

/** Uma decisão de teste, válida em tudo. Cada caso estraga UMA coisa. */
function decisao(over: Partial<DecisaoDoDono> = {}): DecisaoDoDono {
  return {
    id: "teste-1",
    em: "2026-08-08",
    quem: "Dioli (CEO)",
    fala: "Solta, óbvio, tem que soltar tudo, tem que dar autonomia pra essa agência funcionar.",
    departamentos: ["social-media"],
    escopo: { tipo: "clientes_com_projeto" },
    ...over,
  };
}

/** O estado que prendeu as duas peças: allowlist SEM o CityJobs. */
function linhaAllowlistSemCityJobs() {
  return { degrau: "allowlist", clientesLiberados: JSON.stringify(["cli_outro"]) };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.departmentLadder.update.mockResolvedValue({});
  db.departmentLadder.create.mockResolvedValue({});
  db.client.findMany.mockResolvedValue([{ id: CITYJOBS }, { id: "cli_outro" }]);
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: W }]);
});

// ── METADE 1 — a decisão SOLTA ───────────────────────────────────────────────

describe("metade 1 — a decisão do dono solta o que estava preso", () => {
  it("o CityJobs entra na allowlist de social-media, e a peça passa a chegar", async () => {
    db.departmentLadder.findUnique.mockResolvedValue(linhaAllowlistSemCityJobs());

    // ANTES: é este o veredito que marcou as duas peças como `interno`.
    expect(decidirEntrega(
      { departmentId: "social-media", degrau: "allowlist", clientesLiberados: ["cli_outro"] },
      CITYJOBS,
    ).chega).toBe(false);

    const r = await aplicarDecisoesDoDono(W, [decisao()]);

    expect(r.aplicadas).toBe(1);
    expect(r.mudancas).toHaveLength(1);
    expect(r.recusadas).toEqual([]);

    const escrita = db.departmentLadder.update.mock.calls[0][0];
    const lista = JSON.parse(escrita.data.clientesLiberados);
    expect(lista).toContain(CITYJOBS);

    // DEPOIS: com o estado que foi gravado, a mesma peça chega.
    expect(decidirEntrega(
      { departmentId: "social-media", degrau: degrauDeclarado(escrita.data.degrau), clientesLiberados: lista },
      CITYJOBS,
    ).chega).toBe(true);
  });

  it("a PROCEDÊNCIA fica gravada na linha do banco — data, quem e a fala literal", async () => {
    db.departmentLadder.findUnique.mockResolvedValue(linhaAllowlistSemCityJobs());
    await aplicarDecisoesDoDono(W, [decisao()]);

    const escrita = db.departmentLadder.update.mock.calls[0][0];
    const prova = JSON.parse(escrita.data.provaJson);
    expect(prova.origem).toBe("decisao-do-dono");
    expect(prova.decididaEm).toBe("2026-08-08");
    expect(prova.quem).toBe("Dioli (CEO)");
    // A fala INTEIRA, não um resumo: quem auditar o banco daqui a um ano lê a
    // frase que soltou o departamento sem precisar do repositório.
    expect(prova.fala).toContain("tem que soltar tudo");
    expect(escrita.data.decididoPor).toBe("decisao-do-dono:teste-1");
    // O motivo diz que NÃO foi evidência. Confundir os dois faria a casa achar
    // que o departamento provou algo.
    expect(escrita.data.motivo).toMatch(/DECIS/i);
  });

  it("departamento SEM linha na escada ganha a linha — não é ignorado em silêncio", async () => {
    db.departmentLadder.findUnique.mockResolvedValue(null);
    const r = await aplicarDecisoesDoDono(W, [decisao()]);
    expect(db.departmentLadder.create).toHaveBeenCalledTimes(1);
    expect(r.mudancas).toHaveLength(1);
  });
});

// ── METADE 2 — o que ela NÃO faz ─────────────────────────────────────────────

describe("metade 2 — a decisão não vira porta dos fundos", () => {
  it("NUNCA grava `wide` — nem quando a decisão pede o mundo", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    await aplicarDecisoesDoDono(W, [decisao()]);
    for (const [arg] of db.departmentLadder.update.mock.calls) expect(arg.data.degrau).toBe("allowlist");
    for (const [arg] of db.departmentLadder.create.mock.calls) expect(arg.data.degrau).toBe("allowlist");
  });

  it("departamento em WIDE não é tocado — a decisão não desce ninguém", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "wide", clientesLiberados: "[]" });
    const r = await aplicarDecisoesDoDono(W, [decisao()]);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(r.mudancas).toEqual([]);
  });

  it("IDEMPOTENTE: com o cliente já na lista e o degrau já certo, nada é escrito", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({
      degrau: "allowlist",
      clientesLiberados: JSON.stringify([CITYJOBS, "cli_outro"]),
    });
    const r = await aplicarDecisoesDoDono(W, [decisao()]);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(db.departmentLadder.create).not.toHaveBeenCalled();
    expect(r.mudancas).toEqual([]);
    // Mas ela RODOU: "não mudou nada" é diferente de "não aconteceu".
    expect(r.aplicadas).toBe(1);
  });

  it("só entra quem tem PROJETO — cliente sem projeto não é solto de carona", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    await aplicarDecisoesDoDono(W, [decisao()]);
    const consulta = db.client.findMany.mock.calls[0][0];
    // A régua está na CONSULTA, não num filtro depois: sem isto, um lead que
    // nunca contratou receberia peça.
    expect(consulta.where.projects).toEqual({ some: {} });
    expect(consulta.where.workspaceId).toBe(W);
  });

  it("nome de cliente AMBÍGUO (duas fichas) não é resolvido por palpite", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    db.client.findMany.mockResolvedValue([
      { id: "c1", name: "Camila Pereira" },
      { id: "c2", name: "Camila Pereira" },
    ]);
    const r = await aplicarDecisoesDoDono(W, [
      decisao({ escopo: { tipo: "nomes", nomes: ["Camila Pereira"] } }),
    ]);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(r.avisos.join(" ")).toMatch(/2 fichas/);
  });

  it("nome exato resolve — acento e caixa não podem barrar o legítimo", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    db.client.findMany.mockResolvedValue([{ id: "c1", name: "Estúdio Céu" }]);
    const r = await aplicarDecisoesDoDono(W, [
      decisao({ escopo: { tipo: "nomes", nomes: ["  estudio ceu "] } }),
    ]);
    expect(r.mudancas).toHaveLength(1);
  });

  // ── AS DUAS METADES DO RUÍDO DE 16/08/2026 ────────────────────────────────
  // A agência zerada gritava `decisao-do-dono falhou` a cada 5 minutos porque
  // "não há cliente com projeto" saía no MESMO canal de "a decisão está errada".
  // Separar os canais só vale se o canal do erro continuar gritando.

  it("ZERO cliente por escopo DINÂMICO não é falha — sai em semAlvo, fora dos avisos", async () => {
    db.client.findMany.mockResolvedValue([]);
    const r = await aplicarDecisoesDoDono(W, [decisao()]);
    expect(r.aplicadas).toBe(0);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    // Continua NOMEADO — ninguém apagou o fato, ele só mudou de canal.
    expect(r.semAlvo.join(" ")).toMatch(/nenhum cliente/i);
    expect(r.avisos).toEqual([]);
  });

  it("ZERO cliente por NOME que não existe CONTINUA sendo aviso — é erro de quem escreveu", async () => {
    db.client.findMany.mockResolvedValue([]);
    const r = await aplicarDecisoesDoDono(W, [
      decisao({ escopo: { tipo: "nomes", nomes: ["Cliente Que Não Existe"] } }),
    ]);
    expect(r.aplicadas).toBe(0);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(r.avisos.join(" ")).toMatch(/nenhum cliente/i);
    expect(r.semAlvo).toEqual([]);
  });

  it("banco fora do ar NÃO lança e NÃO solta nada — o relógio não pode morrer aqui", async () => {
    db.client.findMany.mockRejectedValue(new Error("db down"));
    const r = await aplicarDecisoesDoDono(W, [decisao()]);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(r.recusadas[0].motivo).toMatch(/db down/);
  });
});

// ── METADE 3 — sem procedência, não existe decisão ───────────────────────────

describe("metade 3 — procedência obrigatória", () => {
  const casos: Array<[string, Partial<DecisaoDoDono>, RegExp]> = [
    ["fala curta demais", { fala: "ok" }, /fala literal/],
    ["sem fala", { fala: "" }, /fala literal/],
    ["sem quem", { quem: "" }, /quem decidiu/],
    ["data inválida", { em: "sexta passada" }, /data inválida/],
    ["data no futuro", { em: "2099-01-01" }, /futuro/],
    ["sem id", { id: "" }, /sem id/],
    ["sem departamento", { departamentos: [] }, /sem departamento/],
    ["departamento com typo", { departamentos: ["social_media"] }, /desconhecido/],
  ];

  for (const [nome, quebra, esperado] of casos) {
    it(`recusa: ${nome} — e NADA é escrito`, async () => {
      db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
      const d = decisao(quebra);
      expect(recusarDecisao(d)).toMatch(esperado);
      const r = await aplicarDecisoesDoDono(W, [d]);
      expect(db.departmentLadder.update).not.toHaveBeenCalled();
      expect(db.departmentLadder.create).not.toHaveBeenCalled();
      expect(r.recusadas).toHaveLength(1);
      expect(r.aplicadas).toBe(0);
    });
  }

  it("um departamento com typo derruba a decisão INTEIRA, não só ele", async () => {
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    const r = await aplicarDecisoesDoDono(W, [decisao({ departamentos: ["social-media", "desing"] })]);
    // Aplicar "a parte boa" é a pior saída: parece que funcionou.
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
    expect(r.recusadas).toHaveLength(1);
  });

  it(`o mínimo da fala é ${MINIMO_DA_FALA} caracteres, e ele é mecanismo, não recomendação`, () => {
    expect(recusarDecisao(decisao({ fala: "a".repeat(MINIMO_DA_FALA - 1) }))).toMatch(/fala literal/);
    expect(recusarDecisao(decisao({ fala: "a".repeat(MINIMO_DA_FALA) }))).toBeNull();
  });
});

// ── AS DECISÕES REAIS DESTA CASA ─────────────────────────────────────────────

describe("a lista declarada", () => {
  it("toda decisão da casa é válida — uma inválida ficaria só num aviso de log", () => {
    for (const d of DECISOES_DO_DONO) expect([d.id, recusarDecisao(d)]).toEqual([d.id, null]);
  });

  it("ids únicos", () => {
    const ids = DECISOES_DO_DONO.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("NENHUMA decisão solta `paid-traffic` nem `prospeccao`", () => {
    // Não é gosto: `paid-traffic` ESCREVE em Meta/Google e depende do parecer do
    // especialista da plataforma (a trava de 03/08), e `prospeccao` sai em nome
    // da agência para terceiros — nada disso é "peça para cliente".
    for (const d of DECISOES_DO_DONO) {
      expect(d.departamentos).not.toContain("paid-traffic");
      expect(d.departamentos).not.toContain("prospeccao");
    }
  });

  it("a decisão de 08/08 solta social-media E design — uma peça precisa das duas", () => {
    const d = DECISOES_DO_DONO.find((x) => x.id === "2026-08-08-solta-a-producao-de-peca");
    expect(d).toBeDefined();
    expect(d!.departamentos).toEqual(expect.arrayContaining(["social-media", "design"]));
  });
});

// ── O ARQUIVO NÃO PODE GANHAR ESCAPATÓRIA ────────────────────────────────────

describe("o arquivo em si", () => {
  const fonte = readFileSync(
    join(process.cwd(), "lib/agency/escada/decisoes-do-dono.ts"),
    "utf8",
  );
  // Fora dos comentários: é neles que as escapatórias estão NOMEADAS como
  // recusadas, e uma busca crua acusaria a própria documentação.
  const codigo = fonte
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*"))
    .join("\n");

  it("sem `process.env` — decisão do dono não se liga por variável de ambiente", () => {
    expect(codigo).not.toMatch(/process\.env/);
  });

  it("sem `forcar`", () => {
    expect(codigo).not.toMatch(/forcar/i);
  });

  it('a string "wide" não aparece no código — o alvo é sempre allowlist', () => {
    expect(codigo).not.toMatch(/"wide"/);
  });

  it("não toca em publicação: não importa nada de publicação nem de Meta/Google", () => {
    // Soltar a escada leva a peça ao CARD DE APROVAÇÃO. Publicar é outro ato, e
    // é do CEO. Se este arquivo um dia importar a publicação, o teste cai.
    expect(fonte).not.toMatch(/from "@\/lib\/agency\/esteira\/publicacao"/);
    expect(fonte).not.toMatch(/integrations\/(meta|google|tiktok)/);
  });
});

// ── A CASA INTEIRA, NÃO SÓ O WORKSPACE DE QUEM CLICOU ────────────────────────

describe("aplicarDecisoesDoDonoNaCasa", () => {
  it("varre todos os workspaces", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "w1" }, { id: "w2" }]);
    db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra", clientesLiberados: "[]" });
    await aplicarDecisoesDoDonoNaCasa();
    const workspaces = db.client.findMany.mock.calls.map((c) => c[0].where.workspaceId);
    expect(new Set(workspaces)).toEqual(new Set(["w1", "w2"]));
  });

  it("falha ao listar workspaces vira aviso, não exceção", async () => {
    db.agencyWorkspace.findMany.mockRejectedValue(new Error("sem banco"));
    const r = await aplicarDecisoesDoDonoNaCasa();
    expect(r.avisos.join(" ")).toMatch(/sem banco/);
    expect(r.mudancas).toEqual([]);
  });
});
