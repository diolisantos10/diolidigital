// O CARTÃO DO PROJETO NÃO PODE DIZER "EM PRODUÇÃO" DE UM PROJETO PARADO.
//
// ── O que o cliente oculto encontrou em produção (26/08/2026) ──────────────
//
// Projeto cmt9f1f7w001y0xo781zi2jt4 (CANTINA DO PORTO TESTE). Ao mesmo tempo:
//
//   • despertador: "1 projeto(s) parados por falta de pagamento confirmado";
//   • `/api/portal/messages`: "Este projeto está aguardando o pagamento";
//   • `/api/portal/projetos`: etapa **"Em produção"**.
//
// Duas superfícies do MESMO portal contando coisas opostas — e a que o cliente
// vê primeiro (o cartão) era a que mentia, do jeito mais caro: dizendo que o
// trabalho anda quando ele está parado esperando uma ação DELE.
//
// A causa era um `else`: a função tinha três ramos, e o último devolvia
// "Em produção" para tudo o que não tinha sido apresentado. `directionApprovedAt`
// chegava até ela e não era lido por ninguém.
//
// ═══════════════════════════════════════════════════════════════════════════
// A 6ª RODADA: A FUNÇÃO CERTA ERA O PROBLEMA (26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O conserto acima deixou `etapaLegivel` CORRETA — e o cliente oculto voltou e
// encontrou a TERCEIRA contradição do portal, com a função corrigida no lugar:
// `/api/portal/esteira` dizia "Ainda estamos produzindo" e esta rota dizia
// "Esperando a sua aprovação", no mesmo projeto, no mesmo minuto.
//
// Porque o defeito nunca foi o conteúdo dos ramos: era haver DOIS ESCRITORES
// da mesma verdade. `etapaLegivel` contava carimbos; `lerFase` contava também
// os entregáveis com corpo — e com `presentedAt` carimbado e nenhuma decisão
// disponível, as duas respondiam coisas opostas, cada uma certa dentro do que
// enxergava.
//
// `etapaLegivel` foi APAGADA. As asserções de comportamento deste arquivo
// mudaram de endereço, não de exigência: elas agora perguntam ao leitor único
// (`lerFase`), que é quem passou a responder — e o pagamento, que só esta rota
// sabia ler, subiu junto para lá. O que a ROTA ainda deve provar é uma coisa
// só, e ela está no último bloco: que ela repassa o leitor único sem inventar
// palavra nenhuma no caminho.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  pagamentoConfirmado: { findMany: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());
const statusDoProjeto = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient,
  // 6ª rodada: as rotas de leitura passaram a usar `donoDoPortal`, que separa
  // "token inválido" de "ainda não há ficha de cliente". O dublê DERIVA do
  // mesmo `resolvePortalClient` deste arquivo — nenhuma expectativa mudou.
  donoDoPortal: async (t: string) => (await resolvePortalClient(t)) ?? "invalido",
}));
vi.mock("@/lib/agency/esteira/retrato", () => ({ statusDoProjeto }));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null) => q,
}));

import { GET } from "@/app/api/portal/projetos/route";
import { lerFase } from "@/lib/agency/esteira/fases";

const PROJETO = {
  id: "p1", name: "Reativação — CANTINA DO PORTO TESTE", goal: "encher o salão",
  createdAt: new Date("2026-08-26T01:29:00Z"),
  presentedAt: null, clientApprovedAt: null, directionApprovedAt: null,
  clientRequestId: "cr1",
};

async function etapa(): Promise<string> {
  const r = await GET(new NextRequest("http://localhost/api/portal/projetos?token=t"));
  const j = await r.json() as { projetos: { etapa: string }[] };
  return j.projetos[0]!.etapa;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "c1", workspaceId: "ws1" });
  db.project.findMany.mockResolvedValue([{ ...PROJETO }]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.pagamentoConfirmado.findMany.mockResolvedValue([]);
  statusDoProjeto.mockResolvedValue({
    leitura: { paraCliente: { titulo: "Aguardando o pagamento para começar" } },
  });
});

describe("a etapa que o cliente lê — agora no leitor ÚNICO (`lerFase`)", () => {
  const base = {
    propostaAceita: true,
    tarefas: { total: 3, entregues: 0, produzindo: 0, bloqueadas: 0 },
    entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
    pedidosAbertos: 0,
    pedidosCobrados: 0,
    cicloAberto: false,
    redesConectadas: true,
    postsPublicados: 0,
    postsAgendados: 0,
  } as const;

  it("🔴 SEM pagamento, o material NÃO é cobrado antes — medido na 6ª rodada", () => {
    // Com o projeto não pago, a esteira dizia *"Precisamos de uma coisa sua —
    // a criação está em andamento"* e pedia CINCO materiais. Nada estava em
    // andamento: sem pagamento não se produz uma linha. A casa cobrava o
    // trabalho DELE antes de poder fazer o dela, e dizia que estava criando.
    const l = lerFase({
      ...base, pagamentoConfirmado: false,
      direcaoAprovadaEm: new Date("2026-08-20"),
      pedidosAbertos: 5, pedidosCobrados: 5,
      tarefas: { total: 5, entregues: 0, produzindo: 0, bloqueadas: 5 },
    });
    expect(l.paraCliente.titulo).toBe("Aguardando o pagamento para começar");
    expect(l.paraCliente.agora, "não se diz 'em andamento' sobre o que não começou")
      .not.toMatch(/em andamento/i);
    expect(l.paraCliente.oQueEsperamosDeVoce).not.toMatch(/pedidos que te mandamos/i);
  });

  it("PAGO e com material pendente: aí sim o material é a parada", () => {
    const l = lerFase({
      ...base, pagamentoConfirmado: true,
      direcaoAprovadaEm: new Date("2026-08-20"),
      pedidosAbertos: 5, pedidosCobrados: 5,
      tarefas: { total: 5, entregues: 0, produzindo: 0, bloqueadas: 5 },
    });
    expect(l.paraCliente.titulo).toBe("Precisamos de uma coisa sua");
  });

  it("SEM pagamento não é 'Em produção' — é o que falta, e é ação DELE", () => {
    const l = lerFase({ ...base, pagamentoConfirmado: false });
    expect(l.paraCliente.titulo).toBe("Aguardando o pagamento para começar");
    expect(l.responsavel, "a bola é do cliente").toBe("cliente");
  });

  it("PAGO mas sem aval da direção: espera o cliente, não 'produz'", () => {
    const l = lerFase({ ...base, pagamentoConfirmado: true });
    expect(l.paraCliente.titulo).toBe("Confirme o caminho");
    expect(l.fase).toBe("direcao");
  });

  it("pago e com o aval: aí sim, produzindo", () => {
    const l = lerFase({
      ...base, pagamentoConfirmado: true,
      direcaoAprovadaEm: new Date("2026-08-20"),
      tarefas: { total: 3, entregues: 1, produzindo: 2, bloqueadas: 0 },
    });
    expect(l.fase).toBe("producao");
  });

  it("⚠️ NÃO MEDIDO não é 'não pagou' — quem não passa o número mantém a leitura antiga", () => {
    // Ausência de informação não é informação. Um `false` de banco lento faria
    // a etapa dizer "aguardando pagamento" sobre um projeto pago.
    const l = lerFase({ ...base });
    expect(l.paraCliente.titulo).not.toBe("Aguardando o pagamento para começar");
  });

  it("o ramo que produzia a contradição: apresentado SEM nada para decidir", () => {
    // `presentedAt` carimbado e `decisoesDisponiveis === 0`. `etapaLegivel`
    // respondia "Esperando a sua aprovação" — pedindo assinatura sobre nada.
    const l = lerFase({
      ...base, pagamentoConfirmado: true,
      direcaoAprovadaEm: new Date("2026-08-20"),
      apresentadoEm: new Date("2026-08-25"),
      decisoesDisponiveis: 0,
    });
    expect(l.paraCliente.titulo).toBe("Ainda estamos produzindo");
    expect(l.responsavel, "sem corpo para assinar, a bola é da AGÊNCIA").not.toBe("cliente");
  });

  it("apresentado COM corpo: aí sim a bola é dele", () => {
    const l = lerFase({
      ...base, pagamentoConfirmado: true,
      direcaoAprovadaEm: new Date("2026-08-20"),
      apresentadoEm: new Date("2026-08-25"),
      decisoesDisponiveis: 2,
    });
    expect(l.paraCliente.titulo).toBe("Tudo pronto para você ver");
    expect(l.responsavel).toBe("cliente");
  });
});

describe("a rota repassa o leitor único, sem inventar palavra no caminho", () => {
  it("a etapa do cartão é LITERALMENTE `leitura.paraCliente.titulo`", async () => {
    statusDoProjeto.mockResolvedValue({
      leitura: { paraCliente: { titulo: "Aguardando o pagamento para começar" } },
    });
    expect(await etapa()).toBe("Aguardando o pagamento para começar");
  });

  it("leitor que não respondeu NÃO vira afirmação — foi um `else` afirmativo que mentiu antes", async () => {
    statusDoProjeto.mockResolvedValue(null);
    expect(await etapa()).toBe("Não consegui ler a etapa agora");
  });

  it("leitor que EXPLODIU também não vira afirmação", async () => {
    statusDoProjeto.mockRejectedValue(new Error("banco fora"));
    expect(await etapa()).toBe("Não consegui ler a etapa agora");
  });

  it("o id do PEDIDO não vaza para a resposta do cliente", async () => {
    const r = await GET(new NextRequest("http://localhost/api/portal/projetos?token=t"));
    const j = await r.json() as { projetos: Record<string, unknown>[] };
    expect(j.projetos[0]!).not.toHaveProperty("clientRequestId");
  });
});
