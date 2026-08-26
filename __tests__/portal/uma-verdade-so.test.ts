// AS DUAS ROTAS DO PORTAL NÃO PODEM DISCORDAR SOBRE O MESMO PROJETO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A TERCEIRA CONTRADIÇÃO (cliente oculto, 26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido em produção, mesmo projeto, mesmo minuto:
//   • `/api/portal/esteira`  → "Ainda estamos produzindo"
//   • `/api/portal/projetos` → "Esperando a sua aprovação", com 2 cartões
//     pedindo decisão.
//
// É a TERCEIRA vez que o cliente oculto encontra as superfícies do portal
// contando coisas opostas, e as três tiveram a mesma causa: dois escritores da
// mesma verdade. Verdade escrita em dois lugares já está errada em um deles.
//
// As duas primeiras foram consertadas alinhando as redações. Não durou — e não
// dura: alinhar dois escritores é combinar que os dois vão mentir igual até o
// próximo conserto de um deles. Desta vez o segundo escritor (`etapaLegivel`,
// que morava em `/api/portal/projetos`) foi APAGADO.
//
// ── O QUE ESTE ARQUIVO É ────────────────────────────────────────────────────
//
// A trava que impede o segundo escritor de renascer. Ele NÃO confere textos:
// confere que as duas rotas chegam à etapa pelo MESMO caminho, com o MESMO
// argumento, e devolvem a MESMA string — inclusive no ramo exato que produziu
// a contradição (apresentado, sem nada para decidir).
//
// ── A MUTAÇÃO QUE ELE PEGA ──────────────────────────────────────────────────
// Reponha em `/api/portal/projetos` qualquer derivação local da etapa — um
// `if (p.presentedAt) return "Esperando a sua aprovação"` — e o primeiro teste
// quebra apontando as duas frases lado a lado.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), findFirst: vi.fn() },
  socialPost: { findMany: vi.fn() },
  pagamentoConfirmado: { findMany: vi.fn() },
  portalAccess: { findUnique: vi.fn() },
  clientRequestDb: { findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());
const validatePortalAccess = vi.hoisted(() => vi.fn());
const statusPelaSolicitacao = vi.hoisted(() => vi.fn());
const statusDoProjeto = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  resolvePortalClient, validatePortalAccess,
  // 6ª rodada: as rotas de leitura passaram a usar `donoDoPortal`, que separa
  // "token inválido" de "ainda não há ficha de cliente". O dublê DERIVA do
  // mesmo `resolvePortalClient` deste arquivo — nenhuma expectativa mudou.
  donoDoPortal: async (t: string) => (await resolvePortalClient(t)) ?? "invalido",
}));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null) => q,
}));
vi.mock("@/lib/agency/esteira/retrato", () => ({ statusDoProjeto, statusPelaSolicitacao }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ aprovarDirecao: vi.fn(), aprovarPacote: vi.fn() }));

import { GET as GET_PROJETOS } from "@/app/api/portal/projetos/route";
import { GET as GET_ESTEIRA } from "@/app/api/portal/esteira/route";
import { lerFase } from "@/lib/agency/esteira/fases";

const PROJETO = {
  id: "p1", name: "Reativação — CANTINA DO PORTO TESTE", goal: "encher o salão",
  createdAt: new Date("2026-08-26T01:29:00Z"),
  presentedAt: new Date("2026-08-26T02:00:00Z"),
  clientApprovedAt: null, directionApprovedAt: new Date("2026-08-26T01:40:00Z"),
  clientRequestId: "cr1",
};

/** O RETRATO REAL do projeto que produziu a contradição: apresentado, e sem
 *  NENHUMA entrega com corpo para o cliente assinar. */
function retratoDaContradicao() {
  const leitura = lerFase({
    propostaAceita: true,
    pagamentoConfirmado: true,
    direcaoAprovadaEm: PROJETO.directionApprovedAt,
    apresentadoEm: PROJETO.presentedAt,
    decisoesDisponiveis: 0,
    tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
    entregaveis: { total: 4, emRevisao: 0, comRessalva: 0, aprovados: 0 },
    pedidosAbertos: 0, pedidosCobrados: 0, cicloAberto: false,
    redesConectadas: true, postsPublicados: 0, postsAgendados: 0,
  });
  return {
    projectId: "p1", nome: PROJETO.name, cliente: "CANTINA DO PORTO TESTE",
    leitura, responsavelLegivel: "a agência", trilha: [],
    pendencias: [], ciclo: null,
    pacote: { medido: true, pedeAprovacao: false, prontas: [], emProducao: [] },
    numeros: {} as never,
  };
}

async function etapaDoCartao(): Promise<string> {
  const r = await GET_PROJETOS(new NextRequest("http://localhost/api/portal/projetos?token=t"));
  const j = await r.json() as { projetos: { etapa: string }[] };
  return j.projetos[0]!.etapa;
}

async function etapaDaEsteira(): Promise<{ etapa: string; aBolaEstaComVoce: boolean; pedeAprovacao: boolean }> {
  const r = await GET_ESTEIRA(new NextRequest("http://localhost/api/portal/esteira?token=t"));
  const j = await r.json() as { etapa: string; aBolaEstaComVoce: boolean; pacote: { pedeAprovacao: boolean } };
  return { etapa: j.etapa, aBolaEstaComVoce: j.aBolaEstaComVoce, pedeAprovacao: j.pacote.pedeAprovacao };
}

beforeEach(() => {
  vi.clearAllMocks();
  const retrato = retratoDaContradicao();
  resolvePortalClient.mockResolvedValue({ clientId: "c1", workspaceId: "ws1" });
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "c1" } });
  db.project.findMany.mockResolvedValue([{ ...PROJETO }]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.pagamentoConfirmado.findMany.mockResolvedValue([{ clientRequestId: "cr1" }]);
  statusDoProjeto.mockResolvedValue(retrato);
  statusPelaSolicitacao.mockResolvedValue(retrato);
});

describe("uma verdade só", () => {
  it("🔴 O RAMO DA CONTRADIÇÃO: apresentado e sem nada para decidir — as duas rotas dizem a MESMA coisa", async () => {
    const cartao = await etapaDoCartao();
    const esteira = await etapaDaEsteira();

    expect(
      cartao,
      `o cartão diz "${cartao}" e a esteira diz "${esteira.etapa}" — ` +
      "duas superfícies do MESMO portal contando coisas opostas sobre o MESMO projeto. " +
      "É a terceira vez. Não alinhe as frases: mate o segundo escritor.",
    ).toBe(esteira.etapa);

    expect(cartao).toBe("Ainda estamos produzindo");
  });

  it("e nesse estado o portal NÃO pede decisão — não se pede assinatura sobre nada", async () => {
    const esteira = await etapaDaEsteira();
    expect(esteira.aBolaEstaComVoce).toBe(false);
    expect(esteira.pedeAprovacao).toBe(false);
  });

  it("as duas rotas chamam o MESMO leitor — não uma cópia com o mesmo nome", async () => {
    await etapaDoCartao();
    await etapaDaEsteira();
    // `statusPelaSolicitacao` é só o `statusDoProjeto` alcançado pela chave que
    // o cliente tem na mão. Os dois moram em `esteira/retrato.ts`, e este mock
    // substitui o módulo inteiro: se qualquer uma das rotas derivasse a etapa
    // por conta própria, ela não apareceria aqui.
    expect(statusDoProjeto).toHaveBeenCalledWith("p1");
    expect(statusPelaSolicitacao).toHaveBeenCalledWith("cr1");
  });

  it("quando a bola É do cliente, as duas concordam nisso também", async () => {
    const comCorpo = retratoDaContradicao();
    const leitura = lerFase({
      propostaAceita: true, pagamentoConfirmado: true,
      direcaoAprovadaEm: PROJETO.directionApprovedAt,
      apresentadoEm: PROJETO.presentedAt,
      decisoesDisponiveis: 2,
      tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 4, emRevisao: 0, comRessalva: 0, aprovados: 0 },
      pedidosAbertos: 0, pedidosCobrados: 0, cicloAberto: false,
      redesConectadas: true, postsPublicados: 0, postsAgendados: 0,
    });
    const retrato = { ...comCorpo, leitura, pacote: { medido: true, pedeAprovacao: true, prontas: [{ titulo: "Peça 1" }, { titulo: "Peça 2" }], emProducao: [] } };
    statusDoProjeto.mockResolvedValue(retrato);
    statusPelaSolicitacao.mockResolvedValue(retrato);

    const cartao = await etapaDoCartao();
    const esteira = await etapaDaEsteira();
    expect(cartao).toBe(esteira.etapa);
    expect(esteira.aBolaEstaComVoce).toBe(true);
  });
});
