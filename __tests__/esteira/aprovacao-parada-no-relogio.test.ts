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
import { auditarChamadas, escritasNoBanco, recorteDeLinhas } from "../_ajuda/detector-de-escrita";

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
  agencyWorkspace: { findMany: vi.fn() },
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

/** Põe a fila no banco de mentira: contagem e lista, que são consultas
 *  diferentes desde 16/08 (a lista tem teto e a contagem não). */
function naFila(cards: ReturnType<typeof card>[], total = cards.length) {
  db.approvalRequest.findMany.mockResolvedValue(cards);
  // `count` é chamado duas vezes por rodada: a fila do inquilino e os órfãos do
  // banco inteiro. O órfão é a chamada SEM `clientRequestId: null`.
  db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
    args?.where?.clientRequestId === null ? 0 : total,
  );
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
  // A CASA, e não um card eleito: desde 16/08 a perna enumera os inquilinos.
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws1" }]);
  db.approvalRequest.findFirst.mockResolvedValue({ clientId: "c1", clientRequest: null });
  naFila([]);
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
    naFila([
      card({ id: "a", createdAt: new Date(Date.now() - 9 * DIA) }),
      card({ id: "b", createdAt: new Date(Date.now() - 4 * DIA) }),
    ]);

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(2);
    expect(ditos.find((l) => l.includes("esperando a decisão do cliente"))).toContain("9 dia(s)");
  });

  it("🔴 A BOLA NOSSA SOBE SEPARADA — e vem ANTES da cobrança do cliente", async () => {
    // Somar "o cliente não respondeu" com "o cliente perguntou e NÓS não
    // respondemos" produz um alarme que cobra o cliente pelo atraso da casa.
    naFila([
      card({ id: "a", createdAt: new Date(Date.now() - 6 * DIA) }),
      card({ id: "b", createdAt: new Date(Date.now() - 5 * DIA), questionOpenedAt: new Date() }),
      card({ id: "c", createdAt: new Date(Date.now() - 4 * DIA), questionOpenedAt: new Date() }),
    ]);

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(3);

    const nossa = ditos.findIndex((l) => l.includes("a bola é NOSSA"));
    const dele = ditos.findIndex((l) => l.includes("esperando a decisão do cliente"));
    expect(nossa).toBeGreaterThan(-1);
    expect(ditos[nossa]).toContain("2 cliente(s) PERGUNTARAM");
    // Ler a cobrança do cliente antes da própria é ler na ordem errada.
    expect(nossa).toBeLessThan(dele);
    // E a linha diz que o relógio do cliente está pausado — senão o alarme
    // vira pressão sobre quem já fez a parte dele.
    expect(ditos[nossa]).toContain("prazo");

    // ⛔ E O NÚMERO DA LINHA "DELE" É 1, NÃO 3. `paradas` inclui a dívida
    // nossa; imprimi-lo aqui cobra o cliente pelo atraso da própria casa —
    // que é o defeito que a faixa da tela tinha, na mesma frente.
    expect(ditos[dele]).toContain("1 aprovação(ões)");
    expect(ditos[dele]).not.toContain("3 aprovação(ões)");
    // E o relógio da espera dele é o do card DELE (6 dias), não o do card
    // nosso, cujo prazo o schema declara pausado.
    expect(ditos[dele]).toContain("6 dia(s)");
  });

  it("a dívida NOSSA é nomeada primeiro na lista, e o mais antigo em cima dentro de cada grupo", async () => {
    naFila([
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
    naFila(
      Array.from({ length: 11 }, (_, i) =>
        card({ id: `x${i}`, createdAt: new Date(Date.now() - (10 + i) * DIA) }),
      ),
    );

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(11);
    expect(ditos.filter((l) => l.includes("aprovação parada — ")).length).toBe(5);
  });

  it("ausência de prazo NÃO é prazo vencido — mas 3 dias sem decisão já é abandono", async () => {
    naFila([
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
    expect(ditos.some((l) => l.includes("esperando a decisão do cliente"))).toBe(false);
    expect(ditos.some((l) => l.includes("a bola é NOSSA"))).toBe(false);
  });

  it("sem inquilino nenhum, a perna nem consulta a fila", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([]);
    await baterORelogio();
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  // ── ⛔ O TETO CORTAVA A CONTAGEM, E A TELA AFIRMAVA O CONTRÁRIO ──────────
  it("⛔ com a fila maior que o teto, a contagem é a de verdade e o log avisa", async () => {
    naFila(Array.from({ length: 200 }, (_, i) => card({ id: `y${i}` })), 250);
    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(250);
    const aviso = ditos.find((l) => l.includes("são PISO"));
    expect(aviso, "a fila foi amostrada e ninguém foi avisado").toBeTruthy();
    expect(aviso).toContain("250");
  });
});

// ── ⛔ A ÂNCORA ELEGIA UM INQUILINO PARA SEMPRE ─────────────────────────────
//
// A versão anterior tirava o workspace do card `pending` mais antigo. Como esta
// perna NÃO tira card de pending, o mesmo card continuava sendo o mais antigo
// na rodada seguinte — e o mesmo inquilino era eleito para sempre. Fome
// determinística, não sorteio.

describe("⛔ a varredura é da CASA, não de um inquilino eleito", () => {
  it("dois inquilinos, os dois contados e os dois nomeados", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "wsA" }, { id: "wsB" }]);
    db.client.findMany.mockImplementation(async (args: { where?: { workspaceId?: string } }) =>
      args?.where?.workspaceId === "wsA" ? [{ id: "cA" }] : [{ id: "cB" }],
    );
    db.approvalRequest.findMany.mockImplementation(async (args: { where?: { OR?: Array<{ clientRequest?: { workspaceId?: string } }> } }) =>
      args?.where?.OR?.[0]?.clientRequest?.workspaceId === "wsA"
        ? [card({ id: "cardA", createdAt: new Date(Date.now() - 40 * DIA) })]
        : [card({ id: "cardB", createdAt: new Date(Date.now() - 12 * DIA) })],
    );
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args?.where?.clientRequestId === null) return 0;
      const or = args?.where?.OR as Array<{ clientRequest?: { workspaceId?: string } }> | undefined;
      return or?.[0]?.clientRequest?.workspaceId === "wsA" ? 40 : 12;
    });

    const r = await baterORelogio();
    expect(r.paradasNaAprovacao).toBe(52);
    // Antes, um dos dois era mudo para sempre.
    expect(ditos.some((l) => l.includes("cardA"))).toBe(true);
    expect(ditos.some((l) => l.includes("cardB"))).toBe(true);
  });

  it("a posse continua sendo resolvida pelos DOIS caminhos, por inquilino", async () => {
    // `ApprovalRequest` não tem `workspaceId`: a posse é `clientRequestId` OU
    // `clientId`. Enumerar a casa não pode ter afrouxado isso.
    await baterORelogio();
    const where = db.approvalRequest.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("pending");
    expect(where.OR).toContainEqual({ clientRequest: { workspaceId: "ws1" } });
    expect(where.OR).toContainEqual({ clientId: { in: ["c1"] } });
  });

  it("card pendente SEM dono nenhum é NOMEADO como invisível, e dito do BANCO INTEIRO", async () => {
    // Ele fica fora da fila por workspace — corretamente, porque varrer órfão
    // de outro inquilino é vazamento. Mas "fora da conta" não é "não existe".
    db.approvalRequest.count.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where?.clientRequestId === null ? 3 : 0,
    );
    await baterORelogio();
    const linha = ditos.find((l) => l.includes("SEM dono"));
    expect(linha).toContain("3 card(s)");
    // Órfão não tem inquilino por definição: dizê-lo dentro do laço o faria
    // parecer de um inquilino específico, contado uma vez por inquilino.
    expect(linha).toContain("banco inteiro");
  });
});

describe("a perna que quebra não derruba a rodada", () => {
  it("banco fora na aprovação: as irmãs continuam trabalhando, e a falha tem NOME", async () => {
    db.agencyWorkspace.findMany.mockRejectedValue(new Error("database is locked"));
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
    naFila([
      card({ id: "a", expiresAt: new Date(Date.now() - 40 * DIA) }),   // prazo estourado
      card({ id: "b", questionOpenedAt: new Date() }),                  // dúvida aberta
    ]);
    await baterORelogio();
    // Card vencido é a tentação exata: "já passou do prazo, expira". Expirar
    // por robô é reprovar com outro nome, e reprovar no lugar do cliente é o
    // único erro desta lista que não tem desfazer.
    //
    // ⚠️ A conferência olha TODOS os modelos, e não só `approvalRequest`: o
    // guarda antigo olhava um por vez, e uma perna que passasse a escrever em
    // `client` ou `project` passava verde pelo teste que existe para barrar
    // escrita.
    expect(escritasNoBanco(db)).toEqual([]);
  });

  // ── O DETECTOR VIROU ALLOWLIST EM 16/08/2026 ──────────────────────────
  //
  // A lista de palavras proibidas errava dos dois lados: deixava passar
  // `await import(...)` (o idioma da própria função, 7 ocorrências no
  // arquivo), `$transaction`, `updateMany (` com espaço e escrita por função
  // de terceiro módulo — e REPROVAVA o legítimo, porque `"decidir"` estava na
  // lista e a perna precisa dizer a palavra "decisão" no log. Detector que
  // reprova o certo ensina o time a editar a lista, e lista editável é
  // carimbo, não trava.
  //
  // A pergunta agora é: **o que esta perna chama que ninguém declarou?**
  // Ver `__tests__/_ajuda/detector-de-escrita.ts`.
  it("a passada só chama o que foi DECLARADO — chamada nova reprova até alguém declarar", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const bruto = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

    // As DUAS âncoras são desta perna — o título e o `quebrou()` do catch dela.
    const i = bruto.indexOf("A APROVAÇÃO QUE NINGUÉM DECIDIU");
    const f = bruto.indexOf('quebrou("aprovacao-parada", err)');
    expect(i, "a perna da aprovação sumiu do despertador").toBeGreaterThan(0);
    expect(f, "o catch da perna sumiu — o recorte ficaria vazio e o teste, cego").toBeGreaterThan(i);

    const PERMITIDAS = [
      // ler e contar — as únicas idas ao banco
      "todosOsInquilinos", "resumoDasAprovacoes", "aprovacoesParadas",
      "prisma.approvalRequest.count",
      // dizer o que se achou
      "log",
      // ordenar e cortar a lista de nomes, que não tocam em nada. Os nomes
      // vêm inteiros de propósito: `slice` solto permitiria QUALQUER
      // `x.slice`, e o ponto da allowlist é que alguém olhe o objeto também.
      "fila.filter", "sort", "urgentes.slice", "Number", "Date",
    ];
    const laudo = auditarChamadas(recorteDeLinhas(bruto, i, f), PERMITIDAS);

    expect(laudo.codigo.length, "o recorte encolheu — confira as âncoras antes de confiar no verde").toBeGreaterThan(400);
    expect(
      laudo.naoDeclaradas,
      "a perna da aprovação passou a chamar algo que ninguém declarou. Se não decide, não escreve e não envia, declare em PERMITIDAS — é o momento de pensar nisso.",
    ).toEqual([]);
    expect(
      laudo.portasDeFuga,
      "a perna ganhou uma porta de fuga (import dinâmico, transação ou SQL cru) — nenhuma tem uso legítimo em quem só conta",
    ).toEqual([]);
  });

  it("nenhum verbo de DECISÃO no bloco — expirar por robô é reprovar com outro nome", async () => {
    // Esta continua sendo busca por nome, e de propósito: a allowlist barra
    // CHAMADA nova, e "decidir" pode entrar como identificador de algo já
    // permitido. A diferença para a lista antiga é que agora ela roda sobre o
    // código com as STRINGS esvaziadas — a palavra num `log` não reprova mais.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const bruto = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");
    const i = bruto.indexOf("A APROVAÇÃO QUE NINGUÉM DECIDIU");
    const f = bruto.indexOf('quebrou("aprovacao-parada", err)');
    const { codigo } = auditarChamadas(recorteDeLinhas(bruto, i, f), []);
    for (const p of ["aprovar", "reprovar", "expirar", "approved", "rejected", "expired"]) {
      expect(codigo.includes(p), `a passada da aprovação passou a ${p} — ela era para CONTAR`).toBe(false);
    }
  });

  it("o detector absolve o log legítimo que a lista antiga reprovava", () => {
    // Este é o caso real: a perna diz "esperando a decisão do cliente".
    const legitimo = 'log(`${n} aprovação(ões) esperando a decisão do cliente`);';
    const laudo = auditarChamadas(legitimo, ["log"]);
    expect(laudo.naoDeclaradas).toEqual([]);
    expect(laudo.portasDeFuga).toEqual([]);
  });
});
