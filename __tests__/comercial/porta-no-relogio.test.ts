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

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
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

  it("nomeia quem já virou desleixo — número solto não faz ninguém agir", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ businessName: "CityJobs" })]);
    await baterORelogio();
    const linha = ditos.find((l) => l.includes("porta da frente — CityJobs"));
    expect(linha).toBeTruthy();
    expect(linha).toContain("51 dia(s)");
  });

  it("o teto por rodada vale para os NOMES, nunca para a contagem", async () => {
    // Truncar a contagem mentiria sobre o tamanho da fila. Truncar a lista de
    // nomes é só não transformar o log em enxurrada.
    db.clientRequestDb.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => pedido({ id: `x${i}`, businessName: `Negócio ${i}` })),
    );
    const r = await baterORelogio();
    expect(r.naPorta).toBe(9);
    expect(ditos.filter((l) => l.includes("porta da frente — ")).length).toBe(5);
  });

  it("fila vazia não inventa alarme — e isso é boa notícia, não silêncio quebrado", async () => {
    const r = await baterORelogio();
    expect(r.naPorta).toBe(0);
    expect(ditos.some((l) => l.includes("porta da frente — "))).toBe(false);
    expect(ditos.some((l) => l.includes("ninguém falou"))).toBe(false);
  });

  it("sem solicitação nenhuma no banco, a perna nem consulta a fila", async () => {
    db.clientRequestDb.findFirst.mockResolvedValue(null);
    await baterORelogio();
    expect(db.clientRequestDb.findMany).not.toHaveBeenCalled();
  });

  it("a âncora do workspace ignora a linha SEM workspace — senão leria fila vazia achando que leu tudo", async () => {
    // `ClientRequestDb.workspaceId` é NULO no schema. Pegar a primeira linha
    // qualquer devolveria `null`, e a varredura contaria zero com o banco cheio.
    await baterORelogio();
    expect(db.clientRequestDb.findFirst.mock.calls[0]![0].where).toEqual({ workspaceId: { not: null } });
  });

  it("solicitação órfã de workspace é NOMEADA como invisível, nunca engolida", async () => {
    // Ela não aparece nesta fila nem na tela: as duas leem POR workspace. É a
    // mesma invisibilidade desta cicatriz, uma camada abaixo.
    db.clientRequestDb.count.mockResolvedValue(2);
    await baterORelogio();
    expect(ditos.some((l) => l.includes("2 solicitação(ões) SEM workspace"))).toBe(true);
  });
});

describe("a perna que quebra não derruba a rodada", () => {
  it("banco fora na porta da frente: as irmãs continuam trabalhando", async () => {
    db.clientRequestDb.findFirst.mockRejectedValue(new Error("database is locked"));
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

  it("a leitura da fila explodindo é engolida com nome — nunca em silêncio", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    const r = await baterORelogio();
    // `quemBateuNaPorta` promete nunca lançar: a fila vira vazia, e o relógio
    // segue. O que NÃO pode acontecer é a rodada morrer aqui.
    expect(r.naPorta).toBe(0);
  });
});

describe("a perna CONTA. ela não fala com ninguém e não escreve nada", () => {
  it("nenhuma escrita em ClientRequestDb sai desta passada", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await baterORelogio();
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
    expect(db.clientRequestDb.updateMany).not.toHaveBeenCalled();
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
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

  it("o código da passada não importa nenhum caminho de envio", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const bruto = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");
    // Só o bloco da porta da frente — o resto do relógio envia, e deve enviar.
    const i = bruto.indexOf("QUEM BATEU NA PORTA E NINGUÉM ATENDEU");
    const f = bruto.indexOf("A PERGUNTA QUE NUNCA CHEGOU AO CLIENTE");
    const bloco = bruto.slice(i, f).replace(/^\s*\/\/.*$/gm, "");
    expect(i).toBeGreaterThan(0);
    for (const p of ["sendWhatsApp", "avisarCliente", "enviarEmail", "notif", "generate(", "update(", "create("]) {
      expect(bloco.includes(p), `a passada da porta passou a ${p} — ela era para CONTAR`).toBe(false);
    }
  });
});
