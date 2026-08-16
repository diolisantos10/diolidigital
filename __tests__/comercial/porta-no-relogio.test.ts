// A PORTA DA FRENTE ENTROU NO RELÓGIO — 16/08/2026.
//
// O defeito que este teste tranca: `quem-bateu-na-porta.ts` existia completo e
// testado desde 08/08 e **nenhuma linha de produção o chamava**. Alarme
// construído, fio nenhum ligando ao relógio. O briefing do CityJobs, entregue
// pelo próprio CEO, ficou parado sem ninguém saber — não por descuido de
// pessoa, mas porque não havia nada olhando.
//
// As duas metades que importam aqui:
//   • a passada CONTA certo (e conta os dois baldes SEPARADOS);
//   • a passada que explode NÃO derruba a rodada das irmãs.
//
// E a trava que vale mais que as duas: ela **não fala com ninguém e não escreve
// nada**. Ordem do CEO de 10/08/2026 — nenhuma demanda de cliente até a agência
// estar pronta. Uma varredura que dispara mensagem violaria a ordem no dia em
// que fosse ligada, sem ninguém decidir isso.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { auditarChamadas, escritasNoBanco, recorteDeLinhas } from "../_ajuda/detector-de-escrita";

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  agencyWorkspace: { findMany: vi.fn() },
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

/** Os três casos reais medidos em produção em 08/08/2026. */
function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    businessName: "Sushi Cazza",
    status: "new",
    rawContext: "",
    briefingJson: JSON.stringify({ contato: { email: "dono@sushicazza.com.br" } }),
    sdrHandoffJson: null,
    createdAt: new Date(Date.now() - 51 * 86_400_000),
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
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws1" }]);
  db.clientRequestDb.findFirst.mockResolvedValue({ workspaceId: "ws1" });
  db.clientRequestDb.findMany.mockResolvedValue([]);
  db.clientRequestDb.count.mockResolvedValue(0);
  runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: [], askedClient: [], skipped: [] });
  dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 0, sent: 0, failed: 0, skipped: 0, details: [] });
  pacotesTravados.mockResolvedValue([]);
  destravarPacote.mockResolvedValue({ projectId: "p1", corrigidas: [], persistentes: [], escalado: false });
});

afterEach(() => vi.restoreAllMocks());

describe("o relógio passou a olhar a porta da frente", () => {
  it("conta quem está parado na porta — e conta os DOIS baldes separados", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ id: "a", businessName: "Sushi Cazza", briefingJson: "{}" }),
      pedido({ id: "b", businessName: "Camila Pereira", createdAt: new Date(Date.now() - 29 * 86_400_000) }),
      pedido({ id: "c", businessName: "Beatriz Gimenes", briefingJson: "{}", createdAt: new Date(Date.now() - 28 * 86_400_000) }),
    ]);
    db.clientRequestDb.count.mockResolvedValue(3);

    const r = await baterORelogio();
    expect(r.naPorta).toBe(3);

    // "dá para falar e ninguém falou" cobra a casa; "sem forma de contato" é
    // buraco de dado. Somados viram um alarme que ninguém sabe atender.
    const cobranca = ditos.find((l) => l.includes("ninguém falou"));
    const semDado = ditos.find((l) => l.includes("SEM forma de contato"));
    expect(cobranca).toContain("1 pessoa(s)");
    expect(cobranca).toContain("29 dia(s)");
    expect(semDado).toContain("2 briefing(s)");
  });

  // ── ⛔ O FURO PROVADO: O NOME DA PESSOA IA PARA O LOG ────────────────────
  //
  // A versão anterior logava `p.negocio`. Em 2 dos 3 casos reais medidos em
  // produção esse campo é NOME DE PESSOA FÍSICA — o negócio da pessoa é ela
  // mesma. A cada 5 minutos, para a retenção do Railway, sem prazo e sem dono.
  // Reverter o conserto (`p.id` → `p.negocio`) deixa este teste VERMELHO.
  it("⛔ o log NOMEIA o lead pelo id, NUNCA pelo nome do negócio", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ id: "lead-abc", businessName: "Camila Pereira" }),
    ]);
    db.clientRequestDb.count.mockResolvedValue(1);
    await baterORelogio();

    const linha = ditos.find((l) => l.includes("porta da frente — lead "));
    expect(linha, "a linha que nomeia o desleixo sumiu").toBeTruthy();
    expect(linha).toContain("lead-abc");
    expect(linha).toContain("51 dia(s)");
    // A trava vale para a rodada INTEIRA, não só para esta linha: nome de
    // pessoa não pode escapar por nenhuma das outras.
    expect(
      ditos.some((l) => l.includes("Camila Pereira")),
      "nome de pessoa física vazou para o log da rodada",
    ).toBe(false);
  });

  it("o teto por rodada vale para os NOMES, nunca para a contagem", async () => {
    // Truncar a contagem mentiria sobre o tamanho da fila. Truncar a lista de
    // nomes é só não transformar o log em enxurrada.
    db.clientRequestDb.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => pedido({ id: `x${i}`, businessName: `Negócio ${i}` })),
    );
    db.clientRequestDb.count.mockResolvedValue(9);
    const r = await baterORelogio();
    expect(r.naPorta).toBe(9);
    expect(ditos.filter((l) => l.includes("porta da frente — lead ")).length).toBe(5);
  });

  // ── ⛔ O TETO CORTAVA A CONTAGEM, E NADA DIZIA ───────────────────────────
  it("⛔ com a fila maior que o teto da lista, a CONTAGEM é a de verdade e o log avisa", async () => {
    // 250 na fila, 200 lidos: `naPorta` tem de ser 250. Derivar do tamanho da
    // lista — como fazia até 16/08 — afirmava 200 sem marcador nenhum.
    db.clientRequestDb.count.mockResolvedValue(250);
    db.clientRequestDb.findMany.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => pedido({ id: `y${i}`, briefingJson: "{}" })),
    );
    const r = await baterORelogio();
    expect(r.naPorta).toBe(250);
    const aviso = ditos.find((l) => l.includes("são PISO"));
    expect(aviso, "a fila foi amostrada e ninguém foi avisado").toBeTruthy();
    expect(aviso).toContain("250");
  });

  it("fila vazia não inventa alarme — e isso é boa notícia, não silêncio quebrado", async () => {
    const r = await baterORelogio();
    expect(r.naPorta).toBe(0);
    expect(ditos.some((l) => l.includes("porta da frente — lead "))).toBe(false);
    expect(ditos.some((l) => l.includes("ninguém falou"))).toBe(false);
  });

  // ── ⛔ A VARREDURA MEDIA UM INQUILINO E REPORTAVA COMO SE FOSSE A CASA ───
  //
  // `findFirst` elegia um workspace e só ele era varrido, enquanto `naPorta`
  // está declarado no tipo de retorno como a fila da casa. Medido: 40 numa
  // conta e 12 noutra → uma das duas não saía em log nenhum. Reverter para o
  // `findFirst` deixa este teste VERMELHO.
  it("⛔ varre TODOS os inquilinos, e a contagem é a da casa inteira", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "wsA" }, { id: "wsB" }]);
    db.clientRequestDb.count.mockImplementation(async (args: { where?: { workspaceId?: string } }) =>
      args?.where?.workspaceId === "wsA" ? 40 : args?.where?.workspaceId === "wsB" ? 12 : 0,
    );
    db.clientRequestDb.findMany.mockImplementation(async (args: { where?: { workspaceId?: string } }) =>
      args?.where?.workspaceId === "wsA"
        ? [pedido({ id: "a1" })]
        : [pedido({ id: "b1", createdAt: new Date(Date.now() - 7 * 86_400_000) })],
    );

    const r = await baterORelogio();
    expect(r.naPorta).toBe(52);
    // Os dois inquilinos falam. Antes, um deles era mudo para sempre.
    expect(ditos.some((l) => l.includes("lead a1"))).toBe(true);
    expect(ditos.some((l) => l.includes("lead b1"))).toBe(true);
  });

  it("sem inquilino nenhum a perna termina sem tocar na fila", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([]);
    await baterORelogio();
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
  });

  it("solicitação órfã de workspace é NOMEADA como invisível, nunca engolida", async () => {
    // Ela não aparece nesta fila nem na tela: as duas leem POR workspace. É a
    // mesma invisibilidade desta cicatriz, uma camada abaixo.
    db.clientRequestDb.count.mockImplementation(async (args: { where?: { workspaceId?: unknown } }) =>
      args?.where?.workspaceId === null ? 2 : 0,
    );
    await baterORelogio();
    const linha = ditos.find((l) => l.includes("SEM workspace"));
    expect(linha).toContain("2 solicitação(ões)");
    // Órfão não tem inquilino por definição. Dizer que é "da casa" sem dizer
    // que é do banco inteiro o faria parecer de um inquilino específico — e,
    // dentro do laço, seria contado uma vez por inquilino.
    expect(linha).toContain("banco inteiro");
  });
});

describe("a perna que quebra não derruba a rodada", () => {
  it("banco fora na porta da frente: as irmãs continuam trabalhando", async () => {
    db.agencyWorkspace.findMany.mockRejectedValue(new Error("database is locked"));
    db.project.findMany.mockResolvedValue([{ id: "p1" }]);
    runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: ["X"], askedClient: [], skipped: [] });
    dispatchWhatsAppNotifications.mockResolvedValue({ scanned: 1, sent: 1, failed: 0, skipped: 0, details: [] });

    const r = await baterORelogio();
    expect(r.naPorta).toBe(0);
    // As pernas de antes e de depois desta seguiram inteiras.
    expect(r.retomados).toBe(1);
    expect(r.avisos).toBe(1);
    expect(ditos.some((l) => l.includes("porta-da-frente falhou"))).toBe(true);
  });

  // ── ⛔ ESTE TESTE TRANCAVA O OPOSTO, E FOI INVERTIDO EM 16/08/2026 ───────
  //
  // O título prometia "nunca em silêncio" e o corpo assertava `naPorta === 0`
  // **sem olhar uma linha de log**. Ou seja: trancava como CONTRATO que a
  // leitura da fila explodindo vira a afirmação "não há ninguém na porta".
  // Enquanto `quemBateuNaPorta` fazia `.catch(() => [])`, o `catch` da rota que
  // diz "esta fila NÃO é zero, é desconhecida" era **inalcançável**, e o
  // relógio não passava por `quebrou()` nem entrava no pulso.
  //
  // É o mesmo padrão que esta casa já pagou quatro vezes: **o defeito virando
  // invariante**. Ele foi invertido, e não apagado, para que a lição fique
  // legível de dentro do arquivo.
  it("⛔ a leitura da fila explodindo GRITA — pelo nome da perna, no log da rodada", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    const r = await baterORelogio();
    expect(r.naPorta).toBe(0);
    expect(
      ditos.some((l) => l.includes("porta-da-frente falhou")),
      "a fila caiu e a rodada não registrou nada — é exatamente o silêncio que este arquivo existe para acabar",
    ).toBe(true);
    // E o motivo aparece: "falhou" sem o quê é um alarme que ninguém atende.
    expect(ditos.some((l) => l.includes("db down"))).toBe(true);
  });

  it("⛔ a CONTAGEM explodindo também grita — não vira fila zero em silêncio", async () => {
    db.clientRequestDb.count.mockRejectedValue(new Error("count falhou"));
    await baterORelogio();
    expect(ditos.some((l) => l.includes("porta-da-frente falhou"))).toBe(true);
  });
});

describe("a perna CONTA. ela não fala com ninguém e não escreve nada", () => {
  it("nenhuma escrita sai desta passada — em NENHUM modelo", async () => {
    // O guarda antigo olhava um modelo (`clientRequestDb`) de cada vez. Uma
    // perna que passasse a escrever em `project` ou `client` passava verde pelo
    // teste que existe para barrar escrita.
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    db.clientRequestDb.count.mockResolvedValue(1);
    await baterORelogio();
    expect(escritasNoBanco(db)).toEqual([]);
  });

  it("a rota que alimenta a tela também só lê — nenhum verbo de escrita", async () => {
    // A tela mostra lead parado há semanas. Um botão de "responder" nascendo
    // aqui por conveniência seria abordagem automática pela porta dos fundos,
    // contra a ordem do CEO de 10/08/2026. Quem aborda é gente.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/agency/porta/route.ts"), "utf8");
    for (const verbo of ["export async function POST", "export async function PATCH", "export async function PUT", "export async function DELETE"]) {
      expect(src.includes(verbo), `a rota da porta ganhou ${verbo} — ela era para LER`).toBe(false);
    }
    expect(src.includes("export async function GET")).toBe(true);
  });

  // ── O DETECTOR VIROU ALLOWLIST EM 16/08/2026 ────────────────────────────
  //
  // A lista de palavras proibidas deixava passar `await import(...)` (o idioma
  // da própria função, 7 vezes no arquivo), `$transaction`, `updateMany (` com
  // espaço e escrita por função de terceiro módulo — e reprovava
  // `log("…precisa decidir…")` por causa de uma palavra dentro de uma string.
  // Detector que reprova o certo ensina o time a editar a lista.
  //
  // Agora a pergunta é outra: **o que esta perna chama que ninguém declarou?**
  // Ver `__tests__/_ajuda/detector-de-escrita.ts`.
  it("a passada só chama o que foi DECLARADO — chamada nova reprova até alguém declarar", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const bruto = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

    // As DUAS âncoras são desta perna: o título dela e o `quebrou()` do catch
    // dela. Ela pode mudar de lugar no arquivo que a trava continua de pé.
    const i = bruto.indexOf("QUEM BATEU NA PORTA E NINGUÉM ATENDEU");
    const f = bruto.indexOf('quebrou("porta-da-frente", err)');
    expect(i, "a perna da porta sumiu do despertador").toBeGreaterThan(0);
    expect(f, "o catch da perna da porta sumiu — o recorte ficaria vazio e o teste, cego").toBeGreaterThan(i);

    const PERMITIDAS = [
      // ler a fila e contar — as três únicas idas ao banco
      "todosOsInquilinos", "resumoDaPorta", "quemBateuNaPorta", "prisma.clientRequestDb.count",
      // dizer o que se achou
      "log",
      // aritmética e coleção, que não tocam em nada
      "fila.filter", "slice", "Date",
    ];
    const laudo = auditarChamadas(recorteDeLinhas(bruto, i, f), PERMITIDAS);

    // Recorte minúsculo é recorte errado, e recorte errado passa em tudo.
    expect(laudo.codigo.length, "o recorte encolheu — verifique as âncoras antes de confiar no verde").toBeGreaterThan(400);
    expect(
      laudo.naoDeclaradas,
      "a perna da porta passou a chamar algo que ninguém declarou. Se não escreve e não envia, declare em PERMITIDAS — é o momento de pensar nisso.",
    ).toEqual([]);
    expect(
      laudo.portasDeFuga,
      "a perna ganhou uma porta de fuga (import dinâmico, transação ou SQL cru) — nenhuma tem uso legítimo em quem só conta",
    ).toEqual([]);
  });

  // A METADE QUE PROVA QUE O DETECTOR DETECTA. Sem ela, um detector quebrado
  // fica verde para sempre e ninguém sabe.
  it("o detector pega o que a lista de palavras deixava passar — e absolve o que ela reprovava", () => {
    const escondido = `
      const { publicarTudo } = await import("@/lib/agency/esteira/publicacao");
      await prisma.$transaction([]);
      await prisma.clientRequestDb.updateMany ({ where: {}, data: {} });
    `;
    const laudo = auditarChamadas(escondido, ["log"]);
    expect(laudo.portasDeFuga).toContain("import(");
    expect(laudo.portasDeFuga).toContain("$transaction");
    expect(laudo.naoDeclaradas).toContain("prisma.clientRequestDb.updateMany");

    // E o falso vermelho que ensinava o time a editar a lista: a palavra
    // "decidir" dentro de um log é texto, não código.
    const legitimo = `log("o cliente precisa decidir, e ninguém vai decidir por ele");`;
    const limpo = auditarChamadas(legitimo, ["log"]);
    expect(limpo.naoDeclaradas).toEqual([]);
    expect(limpo.portasDeFuga).toEqual([]);
  });
});
