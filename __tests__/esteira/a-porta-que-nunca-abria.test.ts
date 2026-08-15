// A PORTA QUE NUNCA ABRIA — o teste que a suíte verde não tinha.
//
// ── O defeito, e por que 3.770 testes verdes não o pegaram ──────────────────
//
// `publicacao.ts:699` recusa todo post de cliente com `marca.naoConstituida`.
// `ficha-de-marca.ts` só sai de não-constituída com uma referência APROVADA e
// uma REPROVADA. E os dois únicos escritores de produção da ficha — o portal e
// o painel — gravavam, cada um na sua cópia da mesma função:
//
//     if (coluna === "referencesJson") return JSON.stringify({ aprovadas: [t], reprovadas: [] });
//
// `reprovadas: []` FIXO. Nenhum cliente conseguia constituir a marca, logo
// nenhum post saía — nunca, desde sempre, por mais que o cliente respondesse
// tudo. Não era a Meta, não era token: era esta linha.
//
// **A suíte era verde porque nenhum teste passava pelo escritor.**
// `ficha-de-marca.test.ts:25` monta `{aprovadas:["post-1"], reprovadas:["post-9"]}`
// à mão — uma forma que escritor nenhum desta casa produzia — e
// `publicacao.test.ts:60` mocka `contratoDeMarca` inteiro. Cada peça passava no
// seu teste; a corrente é que estava arrebentada, na junta entre quem escreve e
// quem lê.
//
// ── Por isso este arquivo tem UMA regra de forma ────────────────────────────
//
// **Nada de JSON escrito à mão.** Tudo aqui entra pela ROTA de produção
// (`POST /api/portal/marca`), grava num banco de mentira que guarda o que
// recebe, e é lido por `lerFichaDeMarca` — a mesma função que o portão de
// publicação consulta. Se um dia alguém puser `reprovadas: []` de volta em
// qualquer um dos escritores, é aqui que fica vermelho.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── O banco de mentira que GUARDA ──────────────────────────────────────────
// Não é conveniência: um mock que devolve constante nunca teria pego este
// defeito, porque o defeito é exatamente o que o escritor GRAVA.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const db = vi.hoisted(() => ({
  brandBrain: {
    findUnique: vi.fn(async ({ where }: { where: { clientId: string } }) =>
      store.get(where.clientId) ?? null),
    upsert: vi.fn(async ({ where, update, create }: {
      where: { clientId: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => {
      const atual = store.get(where.clientId);
      const novo = atual ? { ...atual, ...update } : { ...create };
      store.set(where.clientId, novo);
      return novo;
    }),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const proib = vi.hoisted(() => ({
  lerProibicoes: vi.fn(),
  registrarProibicoesDeclaradas: vi.fn(),
  DEPARTAMENTO_DAS_PROIBICOES: "proibicoes-do-cliente",
}));
vi.mock("@/lib/agency/esteira/proibicoes", () => proib);

const portal = vi.hoisted(() => ({ validatePortalAccess: vi.fn() }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => portal);
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({ tokenDoPortal: () => "tok" }));

import { GET as perguntar, POST as responder } from "@/app/api/portal/marca/route";
import { lerFichaDeMarca } from "@/lib/agency/esteira/ficha-de-marca";

const CLIENTE = "cli-cityjobs";

/** As três proibições que o gatilho do dia zero exige. Elas moram em outro
 *  dono (`BrainArtifact`) e não são o assunto deste arquivo — aqui elas são
 *  cenário, para o único fator em teste ser a referência. */
const TRES_PROIBICOES = {
  lidas: true,
  itens: [
    { frase: "nunca escreva o nome em letra gigante", termos: ["gigante"] },
    { frase: "não cite concorrente", termos: ["concorrente"] },
    { frase: "não fale de salário exato", termos: ["salario"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  portal.validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: CLIENTE } });
  proib.lerProibicoes.mockResolvedValue(TRES_PROIBICOES);
});

/** UMA resposta do cliente, pela rota de produção. */
async function clienteResponde(corpo: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/portal/marca", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "Content-Type": "application/json" },
  });
  const res = await responder(req);
  return { status: res.status, corpo: (await res.json()) as Record<string, unknown> };
}

/** Os quatro campos de resposta única que o gatilho exige. */
async function responderOsSimples() {
  await clienteResponde({ campo: "proposito_e_promessa", resposta: "conecta quem procura trabalho a vagas do próprio bairro" });
  await clienteResponde({ campo: "publico_e_relacao", resposta: "falamos como vizinho, não como consultoria" });
  await clienteResponde({ campo: "lexico", resposta: "CityJobs, sempre junto e com J maiúsculo" });
  await clienteResponde({ campo: "hierarquia_e_dono", resposta: "Marcos aprova, pelo portal, em até 48h" });
}

describe("⭐ a marca se constitui pelo CAMINHO DE PRODUÇÃO", () => {
  it("o cliente responde tudo pela rota e a marca SAI de não-constituída", async () => {
    await responderOsSimples();
    await clienteResponde({
      campo: "voz",
      metades: { dizemos: "vaga perto de você", naoDizemos: "oportunidade de carreira transformadora" },
    });
    await clienteResponde({
      campo: "referencias",
      metades: { aprovada: "o post da padaria do Jardim", reprovada: "aquele com foto de banco de imagem" },
    });

    const ficha = await lerFichaDeMarca(CLIENTE);
    expect(
      ficha.naoConstituida,
      "a marca continua não-constituída depois de o cliente responder TUDO pela rota — a porta não abre",
    ).toBe(false);
  });

  it("o que ficou GRAVADO tem as duas metades — não `reprovadas: []`", async () => {
    await clienteResponde({
      campo: "referencias",
      metades: { aprovada: "o post da padaria", reprovada: "o do banco de imagem" },
    });
    const gravado = JSON.parse(String(store.get(CLIENTE)!.referencesJson)) as {
      aprovadas: string[]; reprovadas: string[];
    };
    expect(gravado.aprovadas).toEqual(["o post da padaria"]);
    expect(gravado.reprovadas, "a metade que permite REPROVAR nasceu vazia de novo").toEqual(["o do banco de imagem"]);
  });

  it("o par de voz grava as duas metades — `naoDizemos` não nasce vazio", async () => {
    await clienteResponde({
      campo: "voz",
      metades: { dizemos: "vaga perto de você", naoDizemos: "oportunidade de carreira" },
    });
    const pares = JSON.parse(String(store.get(CLIENTE)!.voicePairsJson)) as { dizemos: string; naoDizemos: string }[];
    expect(pares[0]!.dizemos).toBe("vaga perto de você");
    expect(pares[0]!.naoDizemos, "`naoDizemos` é o único campo que permite reprovar, e nasceu vazio").toBe("oportunidade de carreira");
  });
});

describe("as duas metades podem chegar em visitas diferentes", () => {
  it("ele responde a aprovada hoje e a reprovada depois — e a marca se constitui", async () => {
    await responderOsSimples();
    await clienteResponde({ campo: "voz", metades: { dizemos: "a", naoDizemos: "b" } });

    await clienteResponde({ campo: "referencias", metades: { aprovada: "o post da padaria" } });
    const meio = await lerFichaDeMarca(CLIENTE);
    expect(meio.naoConstituida, "meia resposta não pode constituir marca — a régua exige o contraexemplo").toBe(true);

    await clienteResponde({ campo: "referencias", metades: { reprovada: "o do banco de imagem" } });
    const fim = await lerFichaDeMarca(CLIENTE);
    expect(fim.naoConstituida).toBe(false);

    // A segunda visita SOMA; se sobrescrevesse, o campo nunca ficaria completo
    // e a porta nunca abriria — o mesmo desfecho por outro caminho.
    const r = JSON.parse(String(store.get(CLIENTE)!.referencesJson)) as { aprovadas: string[] };
    expect(r.aprovadas, "a resposta anterior do cliente foi apagada pela seguinte").toEqual(["o post da padaria"]);
  });

  it("a rodada seguinte pergunta só a metade que FALTA", async () => {
    await clienteResponde({ campo: "referencias", metades: { aprovada: "o post da padaria" } });
    const ficha = await lerFichaDeMarca(CLIENTE);
    const faltam = ficha.campos.find((c) => c.campo === "referencias")!.metadesQueFaltam;
    expect(faltam.map((m) => m.chave)).toEqual(["reprovada"]);
  });
});

describe("a régua NÃO foi afrouxada", () => {
  it("sem contraexemplo, a marca continua não-constituída", async () => {
    await responderOsSimples();
    await clienteResponde({ campo: "voz", metades: { dizemos: "a", naoDizemos: "b" } });
    await clienteResponde({ campo: "referencias", metades: { aprovada: "só a que eu gosto" } });
    expect((await lerFichaDeMarca(CLIENTE)).naoConstituida).toBe(true);
  });

  it("duas proibições continuam não bastando — o gatilho pede três", async () => {
    proib.lerProibicoes.mockResolvedValue({ lidas: true, itens: TRES_PROIBICOES.itens.slice(0, 2) });
    await responderOsSimples();
    await clienteResponde({ campo: "voz", metades: { dizemos: "a", naoDizemos: "b" } });
    await clienteResponde({ campo: "referencias", metades: { aprovada: "x", reprovada: "y" } });
    expect((await lerFichaDeMarca(CLIENTE)).naoConstituida).toBe(true);
  });

  it("texto puro num campo de par vai para a PRIMEIRA metade e NÃO fecha o campo", async () => {
    // É o caminho antigo (uma caixa de texto só). Ele não perde a resposta e
    // também não finge campo respondido — que era exatamente o defeito.
    await clienteResponde({ campo: "referencias", resposta: "o post da padaria" });
    const r = JSON.parse(String(store.get(CLIENTE)!.referencesJson)) as { aprovadas: string[]; reprovadas: string[] };
    expect(r.aprovadas).toEqual(["o post da padaria"]);
    expect(r.reprovadas).toEqual([]);
    expect((await lerFichaDeMarca(CLIENTE)).naoConstituida).toBe(true);
  });
});

describe("a tela recebe as duas metades para poder desenhar as duas caixas", () => {
  it("a pergunta de referências chega com as duas metades nomeadas", async () => {
    // Cinco por rodada, o modo mínimo primeiro: `referencias` só entra depois
    // que os quatro do mínimo saem da frente.
    await responderOsSimples();
    const req = new NextRequest("http://localhost/api/portal/marca");
    const corpo = (await (await perguntar(req)).json()) as {
      perguntas: { campo: string; metades: { chave: string }[] }[];
    };
    const ref = corpo.perguntas.find((p) => p.campo === "referencias");
    expect(ref, "a pergunta de referências sumiu da rodada").toBeTruthy();
    expect(ref!.metades.map((m) => m.chave)).toEqual(["aprovada", "reprovada"]);
  });

  it('"não sei" continua sendo resposta válida e não grava nada', async () => {
    const { corpo } = await clienteResponde({ campo: "referencias", resposta: "" });
    expect(corpo.gravado).toBe(false);
    expect(db.brandBrain.upsert).not.toHaveBeenCalled();
  });
});
