// A APROVAÇÃO PARADA ENTROU NO RELÓGIO — 16/08/2026.
//
// ── O DEFEITO QUE ESTE ARQUIVO TRANCA ─────────────────────────────────────
//
// `lib/agency/esteira/aprovacao-parada.ts` estava escrito, completo e testado —
// e o único importador do repositório inteiro era o próprio teste. **Peça
// verde, junta rompida:** o teste passa porque exercita a função, e a função
// nunca roda. É o segundo caso confirmado no mesmo dia, depois de
// `quem-bateu-na-porta.ts`.
//
// A fila que ficava invisível é a mais cara que esta casa tem: a peça já foi
// produzida, a IA já foi paga, e ela morre esperando um clique. Do lado de fora
// parece que a agência não entregou.
//
// ── AS TRÊS METADES QUE IMPORTAM AQUI ─────────────────────────────────────
//
//   • a passada CONTA certo, e conta os dois baldes SEPARADOS;
//   • a passada que explode NÃO derruba a rodada das irmãs;
//   • e a que vale mais que as duas: ela **não decide nada**. Não aprova, não
//     reprova, não expira card e não manda mensagem. Aprovar no lugar do
//     cliente é falsificar o consentimento dele — o único erro desta lista que
//     não tem desfazer. Expirar por robô é reprovar com outro nome.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvalRequest: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  client: { findFirst: vi.fn(), findMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  project: { findMany: vi.fn(), update: vi.fn() },
}));
const runProjectExecution = vi.hoisted(() => vi.fn());
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());
const pacotesTravados = vi.hoisted(() => vi.fn());
const destravarPacote = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));
vi.mock("@/lib/agency/esteira/pacote-travado", () => ({ destravarPacote, pacotesTravados }));

import { baterORelogio } from "@/lib/agency/despertador";

const DIA = 86_400_000;

/** Um card de aprovação pendente. `dias` = há quanto tempo ninguém decide. */
function card(over: Record<string, unknown> = {}) {
  return {
    id: "ap1",
    department: "design",
    createdAt: new Date(Date.now() - 5 * DIA),
    expiresAt: null,
    questionOpenedAt: null,
    clientId: "c1",
    clientRequestId: null,
    ...over,
  };
}

let ditos: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  ditos = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { ditos.push(a.join(" ")); });
  db.project.findMany.mockResolvedValue([]);
  db.project.update.mockResolvedValue({});
  db.clientRequestDb.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.clientRequestDb.count.mockResolvedValue(0);
  // A âncora: um card pendente cujo dono é um cliente do workspace.
  db.approvalRequest.findFirst.mockResolvedValue({ clientId: "c1", clientRequest: null });
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.approvalRequest.count.mockResolvedValue(0);
  db.client.findFirst.mockResolvedValue({ workspaceId: "ws1" });
  db.client.findMany.mockResolvedValue([{ id: "c1" }]);
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: [], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
  pacotesTravados.mockResolvedValue([]);
  destravarPacote.mockResolvedValue({ projectId: "p1", corrigidas: [], persistentes: [], escalado: false });
});

afterEach(() => vi.restoreAllMocks());

describe("o relógio passou a olhar a aprovação que ninguém decidiu", () => {
  it("conta a fila parada e nomeia a mais antiga", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "a", createdAt: new Date(Date.now() - 9 * DIA) }),
      card({ id: "b", createdAt: new Date(Date.now() - 4 * DIA) }),
    ]);

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(2);
    expect(ditos.find((l) => l.includes("aprovação(ões) sem decisão"))).toContain("9 dia(s)");
  });

  it("🔴 A BOLA NOSSA SOBE SEPARADA — e vem ANTES da cobrança do cliente", async () => {
    // Somar "o cliente não respondeu" com "o cliente perguntou e NÓS não
    // respondemos" produz um alarme que cobra o cliente pelo atraso da casa.
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "a", createdAt: new Date(Date.now() - 6 * DIA) }),
      card({ id: "b", createdAt: new Date(Date.now() - 5 * DIA), questionOpenedAt: new Date() }),
      card({ id: "c", createdAt: new Date(Date.now() - 4 * DIA), questionOpenedAt: new Date() }),
    ]);

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(3);

    const nossa = ditos.findIndex((l) => l.includes("a bola é NOSSA"));
    const total = ditos.findIndex((l) => l.includes("aprovação(ões) sem decisão"));
    expect(nossa).toBeGreaterThan(-1);
    expect(ditos[nossa]).toContain("2 cliente(s) PERGUNTARAM");
    // Ler a cobrança do cliente antes da própria é ler na ordem errada.
    expect(nossa).toBeLessThan(total);
    // E a linha diz que o relógio do cliente está pausado — senão o alarme
    // vira pressão sobre quem já fez a parte dele.
    expect(ditos[nossa]).toContain("prazo");
  });

  it("a dívida NOSSA é nomeada primeiro na lista, e o mais antigo em cima dentro de cada grupo", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "velho-deles", department: "social", createdAt: new Date(Date.now() - 30 * DIA) }),
      card({ id: "novo-nosso", department: "design", createdAt: new Date(Date.now() - 4 * DIA), questionOpenedAt: new Date() }),
    ]);

    await baterORelogio();
    const nomeadas = ditos.filter((l) => l.includes("aprovação parada — "));
    expect(nomeadas[0]).toContain("novo-nosso");
    expect(nomeadas[0]).toContain("a vez é da agência");
    expect(nomeadas[1]).toContain("velho-deles");
  });

  it("o teto por rodada vale para os NOMES, nunca para a contagem", async () => {
    // Truncar a contagem mentiria sobre o tamanho da fila; truncar a lista de
    // nomes é só não transformar o log em enxurrada.
    db.approvalRequest.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) =>
        card({ id: `x${i}`, createdAt: new Date(Date.now() - (10 + i) * DIA) }),
      ),
    );

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(11);
    expect(ditos.filter((l) => l.includes("aprovação parada — ")).length).toBe(5);
  });

  it("ausência de prazo NÃO é prazo vencido — mas 3 dias sem decisão já é abandono", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "sem-prazo", createdAt: new Date(Date.now() - 1 * DIA) }),  // novo: não conta
      card({ id: "velho", createdAt: new Date(Date.now() - 4 * DIA) }),      // 4 dias: conta
    ]);
    await baterORelogio();
    expect(ditos.find((l) => l.includes("passaram do prazo"))).toContain("1 aprovação(ões)");
  });

  it("fila vazia não inventa alarme", async () => {
    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(0);
    expect(ditos.some((l) => l.includes("aprovação parada — "))).toBe(false);
    expect(ditos.some((l) => l.includes("sem decisão"))).toBe(false);
    expect(ditos.some((l) => l.includes("a bola é NOSSA"))).toBe(false);
  });

  it("sem card pendente nenhum, a perna nem consulta a fila", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(null);
    await baterORelogio();
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("a âncora do workspace sai do PRÓPRIO card, não de uma linha qualquer", () => {
  it("card preso a uma solicitação usa o workspace DELA", async () => {
    db.approvalRequest.findFirst.mockResolvedValue({
      clientId: null, clientRequest: { workspaceId: "ws-da-solicitacao" },
    });
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    await baterORelogio();
    // Sem `clientId`, não há por que ir buscar dono de cliente nenhum.
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-da-solicitacao" } }),
    );
  });

  it("card de cliente DIRETO (sem solicitação) resolve o workspace pelo cliente", async () => {
    // A posse é `clientRequestId` OU `clientId` desde 03/08/2026 — cliente
    // criado direto não tem solicitação, e ignorá-lo esconderia a fila dele.
    db.approvalRequest.findFirst.mockResolvedValue({ clientId: "c1", clientRequest: null });
    db.client.findFirst.mockResolvedValue({ workspaceId: "ws-do-cliente" });
    db.approvalRequest.findMany.mockResolvedValue([card()]);
    await baterORelogio();
    expect(db.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-do-cliente" } }),
    );
  });

  it("a âncora pede o card PENDENTE — card já decidido não define a fila a varrer", async () => {
    await baterORelogio();
    expect(db.approvalRequest.findFirst.mock.calls[0]![0].where).toEqual({ status: "pending" });
  });

  it("card pendente SEM dono nenhum é NOMEADO como invisível, nunca engolido", async () => {
    // Ele fica fora da fila por workspace — corretamente, porque varrer órfão
    // de outro inquilino é vazamento. Mas "fora da conta" não é "não existe":
    // é peça pronta esperando decisão que nenhuma tela mostra.
    db.approvalRequest.count.mockResolvedValue(3);
    await baterORelogio();
    expect(ditos.some((l) => l.includes("3 card(s) pendentes SEM dono"))).toBe(true);
  });
});

describe("a perna que quebra não derruba a rodada", () => {
  it("banco fora na aprovação: as irmãs continuam trabalhando, e a falha tem NOME", async () => {
    db.approvalRequest.findFirst.mockRejectedValue(new Error("database is locked"));
    db.project.findMany.mockResolvedValue([{ id: "p1" }]);
    runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: ["X"], askedClient: [], skipped: [] });
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 1, sent: 1, failed: 0, skipped: 0, details: [] });

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(0);
    expect(r.retomados).toBe(1);
    expect(r.avisos).toBe(1);
    expect(ditos.some((l) => l.includes("aprovacao-parada falhou"))).toBe(true);
  });

  it("a contagem de órfãos explodindo não mata a rodada nem some em silêncio", async () => {
    db.approvalRequest.count.mockRejectedValue(new Error("db down"));
    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(0);
    expect(ditos.some((l) => l.includes("aprovacao-parada falhou"))).toBe(true);
  });
});

describe("a perna CONTA. ela NÃO decide no lugar de ninguém", () => {
  it("nenhuma escrita em ApprovalRequest sai desta passada", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card({ id: "a", expiresAt: new Date(Date.now() - 40 * DIA) }),   // prazo estourado
      card({ id: "b", questionOpenedAt: new Date() }),                  // dúvida aberta
    ]);
    await baterORelogio();
    // Card vencido é a tentação exata: "já passou do prazo, expira". Expirar
    // por robô é reprovar com outro nome, e reprovar no lugar do cliente é o
    // único erro desta lista que não tem desfazer.
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
    expect(db.approvalRequest.delete).not.toHaveBeenCalled();
    expect(db.approvalRequest.deleteMany).not.toHaveBeenCalled();
  });

  it("o código da passada não importa nenhum caminho de decisão ou de envio", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const bruto = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

    // As DUAS âncoras são desta perna — o título e o `quebrou()` do catch dela.
    // Recortar entre esta perna e a perna do VIZINHO foi o furo que a trava
    // irmã (`porta-no-relogio`) tinha: mover o bloco fazia o recorte virar
    // string vazia, e todas as asserções passavam sem olhar uma linha.
    const i = bruto.indexOf("A APROVAÇÃO QUE NINGUÉM DECIDIU");
    const f = bruto.indexOf('quebrou("aprovacao-parada", err)');
    expect(i, "a perna da aprovação sumiu do despertador").toBeGreaterThan(0);
    expect(f, "o catch da perna sumiu — o recorte ficaria vazio e o teste, cego").toBeGreaterThan(i);

    const bloco = bruto.slice(i, f).replace(/^\s*\/\/.*$/gm, "");
    expect(bloco.length, "o recorte encolheu — confira as âncoras antes de confiar no verde").toBeGreaterThan(400);

    const PROIBIDOS = [
      // decidir no lugar do cliente
      "aprovar", "reprovar", "expirar", "decidir", '"approved"', '"rejected"', '"expired"',
      // escrever
      "update(", "updateMany(", "create(", "createMany(", "upsert(",
      "delete(", "deleteMany(", "$executeRaw", "$queryRaw",
      // falar com alguém
      "sendWhatsApp", "avisarCliente", "enviarEmail", "notif", "dispatch", "fetch(", "generate(",
    ];
    for (const p of PROIBIDOS) {
      expect(bloco.includes(p), `a passada da aprovação passou a ${p} — ela era para CONTAR`).toBe(false);
    }
  });
});
