// O QUE O CLIENTE PROÍBE — as duas metades da prova.
//
// O buraco que estes testes fecham estava ESCRITO no repositório, em
// `lib/dioli-brain/client-snapshot.ts:157`: "thingsToAvoid (…) have no DB column
// on BrandBrain — left undefined". A casa sabia o que o cliente É e não sabia o
// que ele NÃO QUER. O que ele proibia sobrevivia só dentro do pedido daquela
// vez.
//
// As duas metades:
//   1. a peça LEGÍTIMA atravessa sem atrito — proibição registrada não vira
//      mordaça em cima de palavra parecida;
//   2. a peça que VIOLA uma proibição registrada é barrada, por CÓDIGO, na
//      saída, com o motivo citando a frase do próprio cliente.
// Mais a terceira que a casa exige: se a conferência não puder rodar, a peça
// NÃO sai como aprovada.

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Artefato { clientId: string; department: string; canvasJson: string; version: number }
let artefatos: Artefato[] = [];
let quebrarLeitura = false;

const db = {
  brainArtifact: {
    findFirst: vi.fn(({ where }: { where: { clientId: string; department: string } }) => {
      if (quebrarLeitura) return Promise.reject(new Error("banco fora do ar"));
      const r = artefatos
        .filter((a) => a.clientId === where.clientId && a.department === where.department)
        .sort((a, b) => b.version - a.version)[0];
      return Promise.resolve(r ?? null);
    }),
    create: vi.fn(({ data }: { data: Artefato }) => {
      artefatos.push(data);
      return Promise.resolve(data);
    }),
  },
  clientRequestDb: { findFirst: vi.fn(() => Promise.resolve(null)) },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const {
  extrairProibicoes, registrarProibicoes, lerProibicoes, DEPARTAMENTO_DAS_PROIBICOES,
} = await import("@/lib/agency/esteira/proibicoes");
const { conferirPisoDeVerdade } = await import("@/lib/agency/execution/piso-de-verdade");

/** A verdade mínima de um cliente, para o piso só julgar as proibições. */
function verdadeCom(proibicoes: Awaited<ReturnType<typeof lerProibicoes>>) {
  return {
    businessName: "Foocci",
    telefones: [], emails: [], servicos: [], valores: [],
    proibicoes,
  };
}

beforeEach(() => {
  artefatos = [];
  quebrarLeitura = false;
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a EXTRAÇÃO — proibição declarada, nunca inferida", () => {
  it("reconhece os jeitos que um cliente brasileiro escreve uma proibição", () => {
    const casos: Array<[string, string]> = [
      ["Nunca use a palavra 'imperdível' nas legendas", "imperdivel"],
      ["Não fale de preço nas peças do lançamento", "preco"],
      ["Evitem mencionar concorrente nos posts", "concorrente"],
      ["Nada de emoji nos carrosséis institucionais", "emoji"],
      ["Jamais cite desconto no feed", "desconto"],
      ["Sem falar de prazo de entrega", "prazo"],
    ];
    for (const [texto, esperado] of casos) {
      const p = extrairProibicoes(texto, "pedido");
      expect(p.length, texto).toBeGreaterThan(0);
      expect(p.flatMap((x) => x.termos).join(" "), texto).toContain(esperado);
    }
  });

  it("METADE 1 — texto SEM proibição não vira proibição inventada", () => {
    for (const texto of [
      "Quero três carrosséis sobre o cardápio digital",
      "Preciso do roteiro com as falas para eu gravar os vídeos",
      "Adiantem o calendário em um dia, por favor",
      "Gostei muito da última peça, o tom ficou ótimo",
    ]) {
      expect(extrairProibicoes(texto, "pedido"), texto).toEqual([]);
    }
  });

  it("proibição sem termo aproveitável é DESCARTADA, não gravada vazia", () => {
    // "não use isso" não diz o quê. Gravar viraria regra que nunca dispara e
    // que o especialista lê como se estivesse valendo.
    expect(extrairProibicoes("Não use isso, por favor", "pedido")).toEqual([]);
  });

  it("o que ele destacou entre aspas vale INTEIRO", () => {
    const p = extrairProibicoes('Nunca use "a melhor do Brasil" em nenhuma peça', "pedido");
    expect(p[0]!.termos).toContain("a melhor do brasil");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a CASA da proibição — acumula e não esquece", () => {
  it("grava na gaveta certa e ACUMULA entre pedidos", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível'", "pedido");
    expect(db.brainArtifact.create).toHaveBeenCalledOnce();
    expect(artefatos[0]!.department).toBe(DEPARTAMENTO_DAS_PROIBICOES);

    await registrarProibicoes("cli-1", "Evitem mencionar concorrente", "ajuste");
    const lidas = await lerProibicoes("cli-1");
    expect(lidas.lidas).toBe(true);
    expect(lidas.itens).toHaveLength(2);
    // O cliente que proibiu em março não precisa repetir em agosto.
    expect(lidas.itens.flatMap((i) => i.termos)).toContain("imperdivel");
    expect(lidas.itens.flatMap((i) => i.termos)).toContain("concorrente");
  });

  it("a mesma proibição repetida não vira linha nova", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível'", "pedido");
    const r = await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível'", "pedido");
    expect(r.novas).toEqual([]);
    expect(db.brainArtifact.create).toHaveBeenCalledOnce();
  });

  it("a proibição de um cliente não vaza para outro", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível'", "pedido");
    expect((await lerProibicoes("cli-2")).itens).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A TRAVA — conferida na SAÍDA, por código", () => {
  it("METADE 2 — a peça que viola é BARRADA, citando a frase do cliente", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível' nas legendas", "pedido");
    const proibicoes = await lerProibicoes("cli-1");

    const v = conferirPisoDeVerdade(
      "Promoção imperdível na Foocci! Peça já o seu cardápio digital.",
      verdadeCom(proibicoes),
    );
    expect(v.aprovado).toBe(false);
    const proibida = v.violacoes.find((x) => x.id === "proibicao_do_cliente");
    expect(proibida, "a violação tem de ser NOMEADA como proibição do cliente").toBeTruthy();
    expect(proibida!.motivo).toContain("imperdível");
    expect(proibida!.motivo).toMatch(/PROIBIU/);
  });

  it("METADE 1 — a peça legítima PASSA: proibição não vira mordaça", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível' nas legendas", "pedido");
    const proibicoes = await lerProibicoes("cli-1");

    const v = conferirPisoDeVerdade(
      "O cardápio digital da Foocci deixa o seu pedido pronto em segundos.",
      verdadeCom(proibicoes),
    );
    expect(v.violacoes.filter((x) => x.id === "proibicao_do_cliente")).toEqual([]);
  });

  it("a comparação é por PALAVRA INTEIRA — 'caro' não barra 'carrossel'", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'caro' nas peças", "pedido");
    const proibicoes = await lerProibicoes("cli-1");

    const legitima = conferirPisoDeVerdade(
      "Este carrossel mostra o cardápio inteiro em cinco telas.",
      verdadeCom(proibicoes),
    );
    expect(legitima.violacoes.filter((x) => x.id === "proibicao_do_cliente")).toEqual([]);

    const viola = conferirPisoDeVerdade("Não é caro: é investimento.", verdadeCom(proibicoes));
    expect(viola.violacoes.some((x) => x.id === "proibicao_do_cliente")).toBe(true);
  });

  it("acento não é escapatória: 'imperdivel' é a mesma proibição", async () => {
    await registrarProibicoes("cli-1", "Nunca use a palavra 'imperdível'", "pedido");
    const proibicoes = await lerProibicoes("cli-1");
    const v = conferirPisoDeVerdade("Oferta imperdivel!", verdadeCom(proibicoes));
    expect(v.violacoes.some((x) => x.id === "proibicao_do_cliente")).toBe(true);
  });

  it("FAIL-CLOSED — leitura que não roda REPROVA a peça, nunca a libera", async () => {
    quebrarLeitura = true;
    const proibicoes = await lerProibicoes("cli-1");
    expect(proibicoes.lidas).toBe(false);

    const v = conferirPisoDeVerdade(
      "O cardápio digital da Foocci deixa o seu pedido pronto em segundos.",
      verdadeCom(proibicoes),
    );
    expect(v.aprovado, "peça não conferida NÃO sai como aprovada").toBe(false);
    expect(v.violacoes.some((x) => x.id === "proibicoes_nao_conferidas")).toBe(true);
  });

  it("verdade SEM o campo `proibicoes` não é reprovada por isso", () => {
    // A distinção que importa: "não se aplica a este caminho" é diferente de
    // "a trava caiu". Confundir as duas barraria todo caminho antigo.
    const v = conferirPisoDeVerdade("Texto qualquer sobre o cardápio.", {
      businessName: "Foocci", telefones: [], emails: [], servicos: [], valores: [],
    });
    expect(v.violacoes.some((x) => x.id.startsWith("proibic"))).toBe(false);
  });
});
