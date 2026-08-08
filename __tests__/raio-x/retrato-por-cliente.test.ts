// O CENSO POR CLIENTE — o que ele promete, e o que ele se recusa a afirmar.
//
// Em 08/08/2026 o CEO cobrou "todos os posts dos clientes" e a agência só sabia
// responder no agregado (12 posts, 5 clientes). Agregado responde outra
// pergunta: ele esconde exatamente o cliente que recebeu ZERO hoje.
//
// As duas metades aqui:
//   1. o censo CONTA por cliente e separa o dia de hoje do resto;
//   2. ele NÃO transforma falha de leitura em zero, e NÃO inventa o ritmo
//      contratado — que é o dado que não existe no banco.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  project: { count: vi.fn() },
  socialPost: { count: vi.fn() },
  approvalRequest: { count: vi.fn() },
  materialRequest: { count: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { varrerPorCliente } from "@/lib/raio-x/por-cliente";

// 08/08/2026, 14h UTC = 11h em São Paulo. O dia de referência tem que ser 08,
// e a janela tem que começar em 08/08 00:00 -03:00 (= 03:00 UTC).
const AGORA = new Date("2026-08-08T14:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findMany.mockResolvedValue([
    { id: "c1", name: "CityJobs" },
    { id: "c2", name: "Foocci" },
  ]);
  db.project.count.mockResolvedValue(1);
  db.socialPost.count.mockResolvedValue(2);
  db.approvalRequest.count.mockResolvedValue(3);
  db.materialRequest.count.mockResolvedValue(0);
});

describe("conta cliente por cliente", () => {
  it("devolve uma linha por cliente, com nome", async () => {
    const r = await varrerPorCliente(AGORA);
    expect(r.clientes.map((c) => c.nome)).toEqual(["CityJobs", "Foocci"]);
    expect(r.cego).toBeUndefined();
  });

  it('"hoje" é o dia de SÃO PAULO, não o de UTC', async () => {
    const r = await varrerPorCliente(AGORA);
    expect(r.diaDeReferencia).toBe("2026-08-08");

    const janela = db.socialPost.count.mock.calls
      .map((c: unknown[]) => (c[0] as { where: { scheduledFor?: { gte?: Date } } }).where.scheduledFor)
      .find((s) => s?.gte);
    // 00:00 de 08/08 em São Paulo é 03:00 UTC. Contar em UTC diria "nada saiu
    // hoje" durante as três primeiras horas do dia do cliente.
    expect(janela!.gte!.toISOString()).toBe("2026-08-08T03:00:00.000Z");
  });

  it("os atrasados NÃO são filtrados por hoje — atraso velho não some do retrato", async () => {
    await varrerPorCliente(AGORA);
    const atrasados = db.socialPost.count.mock.calls
      .map((c: unknown[]) => (c[0] as { where: Record<string, unknown> }).where)
      // A consulta dos ATRASADOS é a que tem `lt` e NÃO tem `gte`: ela olha o
      // passado inteiro. A de "agendadas hoje" tem as duas pontas.
      .filter((w) => {
        const s = w.scheduledFor as { lt?: Date; gte?: Date } | undefined;
        return w.status === "scheduled" && !!s?.lt && !s.gte;
      });
    expect(atrasados.length).toBeGreaterThan(0);
    expect((atrasados[0]!.scheduledFor as { lt: Date }).lt.getTime()).toBe(AGORA.getTime());
  });
});

describe("zero e 'não sei' nunca dividem o mesmo pixel", () => {
  it("falha de leitura vira `nao_medido` COM motivo, nunca 0", async () => {
    db.socialPost.count.mockRejectedValue(new Error("conexão recusada"));

    const r = await varrerPorCliente(AGORA);
    const cj = r.clientes[0]!;

    expect(cj.pecasDeHoje.estado).toBe("nao_medido");
    expect(cj.pecasDeHoje).toMatchObject({ motivo: "conexão recusada" });
    // E o que deu para ler continua lido: uma consulta quebrada não cega as
    // outras.
    expect(cj.aprovacoesPendentes).toEqual({ estado: "medido", valor: 3 });
  });

  it("zero de verdade é `medido: 0` — e é isso que denuncia o cliente parado", async () => {
    db.socialPost.count.mockResolvedValue(0);
    const r = await varrerPorCliente(AGORA);
    expect(r.clientes[0]!.pecasDeHoje).toEqual({ estado: "medido", valor: 0 });
  });

  it("banco fora do ar NÃO devolve 'a agência não tem cliente'", async () => {
    db.client.findMany.mockRejectedValue(new Error("sem banco"));
    const r = await varrerPorCliente(AGORA);
    expect(r.clientes).toEqual([]);
    expect(r.cego).toBe("sem banco");
  });
});

describe("o que o censo se recusa a afirmar", () => {
  it("o ritmo contratado fica NULO — não existe coluna, e inferir seria inventar", async () => {
    const r = await varrerPorCliente(AGORA);
    for (const c of r.clientes) expect(c.ritmoContratado).toBeNull();
  });

  it("não deduz ritmo do volume produzido", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(process.cwd(), "lib/raio-x/por-cliente.ts"), "utf8");
    const corpo = fonte.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    // Nenhuma divisão, média ou multiplicação: o dia em que alguém derivar
    // "2/dia" de "12 posts em 6 dias", o resultado vira a meta e a peça que
    // faltou passa a provar que não era devida.
    const atribuicoes = corpo.match(/ritmoContratado\s*:[^,;]*/g) ?? [];
    expect(atribuicoes.length).toBeGreaterThan(0);
    for (const a of atribuicoes) expect(a).toMatch(/:\s*null\s*$/);
  });
});
