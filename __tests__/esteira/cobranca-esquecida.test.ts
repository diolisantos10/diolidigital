// A VARREDURA DOS PEDIDOS ESQUECIDOS — as duas metades.
//
// O caso real, medido na produção em 08/08/2026: 1 pedido de material pendente
// há +24h com `askedClientAt` vazio. O agente travou por falta de material e a
// pergunta NUNCA chegou ao cliente — e o repositório inteiro não tinha caminho
// para perguntar depois. Fila morta por construção.
//
// Metade 1: a varredura cobra o pedido vencido, uma vez, com uma voz só.
// Metade 2: ela NÃO cobra o que já foi perguntado, nem o que ainda está dentro
//           da carência — cliente que recebe a mesma pergunta duas vezes para
//           de ler o portal, que é o defeito que `pedidos.ts` existe para evitar.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  materialRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  project: { findUnique: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  cobrarPedidosEsquecidos,
  CARENCIA_DA_COBRANCA_MS,
} from "@/lib/agency/esteira/pedidos";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGORA = new Date("2026-08-08T14:00:00.000Z");
const VENCIDO = new Date(AGORA.getTime() - CARENCIA_DA_COBRANCA_MS - 60_000);

const PEDIDO_ABERTO = {
  id: "mr1",
  type: "foto",
  description: "As fotos do time no escritório",
  requestedByLabel: "Design",
  askedClientAt: null as Date | null,
};

/**
 * Duas consultas diferentes caem no MESMO mock: a varredura por tempo (filtra
 * por `status`/`requestedAt`) e `pedidosAbertos` (filtra por `projectId`).
 * Encadear `mockResolvedValueOnce` amarraria o teste à ORDEM das chamadas — e
 * um teste que quebra quando o código chama a mesma função mais uma vez mede
 * implementação, não comportamento. Aqui cada consulta é atendida pelo que ela
 * pergunta.
 */
function comBanco(vencidos: Array<{ projectId: string | null }>, abertos: unknown[]) {
  db.materialRequest.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve("projectId" in args.where && !("status" in args.where && "requestedAt" in args.where)
      ? abertos
      : vencidos),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({
    clientRequestId: "cr1",
    client: { name: "CityJobs" },
  });
  db.portalMessage.create.mockResolvedValue({ id: "pm1" });
  db.materialRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("cobra o pedido que ninguém levou ao cliente", () => {
  it("escreve no portal e marca como cobrado", async () => {
    comBanco([{ projectId: "p1" }], [PEDIDO_ABERTO]);

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(r.pedidosCobrados).toBe(1);
    expect(r.projetosCobrados).toBe(1);
    expect(r.semDestino).toEqual([]);

    // A mensagem existe, é da equipe, e cita o que falta nas palavras do pedido.
    const msg = db.portalMessage.create.mock.calls[0]![0].data;
    expect(msg.clientRequestId).toBe("cr1");
    expect(msg.authorRole).toBe("team");
    expect(msg.body).toContain("As fotos do time no escritório");
    expect(msg.body).toContain("CityJobs");

    // E o pedido fica marcado — a rodada seguinte não repete.
    expect(db.materialRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["mr1"] } } }),
    );
  });

  it("vários pedidos do mesmo projeto viram UMA mensagem só", async () => {
    comBanco(
      [{ projectId: "p1" }, { projectId: "p1" }, { projectId: "p1" }],
      [PEDIDO_ABERTO, { ...PEDIDO_ABERTO, id: "mr2", description: "O logo em vetor" }],
    );

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(r.pedidosCobrados).toBe(2);
  });

  it("a varredura só olha pendente + nunca perguntado + fora da carência", async () => {
    comBanco([], []);
    await cobrarPedidosEsquecidos(AGORA);

    const where = db.materialRequest.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("pending");
    expect(where.askedClientAt).toBe(null);
    expect(where.requestedAt.lt.getTime()).toBe(AGORA.getTime() - CARENCIA_DA_COBRANCA_MS);
  });
});

describe("NÃO inventa cobrança onde não há problema", () => {
  it("nada vencido ⇒ nada escrito no portal", async () => {
    comBanco([], []);

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(r.pedidosCobrados).toBe(0);
    expect(r.projetosCobrados).toBe(0);
    expect(r.semDestino).toEqual([]);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("pedido JÁ perguntado não é cobrado de novo — nem uma linha no portal", async () => {
    comBanco([{ projectId: "p1" }], [{ ...PEDIDO_ABERTO, askedClientAt: VENCIDO }]);

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(r.pedidosCobrados).toBe(0);
    // E isso NÃO é "sem destino": silêncio é a resposta certa quando o cliente
    // já foi perguntado e ainda não respondeu.
    expect(r.semDestino).toEqual([]);
  });
});

describe("o que não pode ser cobrado fica ESCRITO, nunca em silêncio", () => {
  it("projeto sem conversa de portal vira `semDestino` com motivo", async () => {
    comBanco([{ projectId: "p1" }], [PEDIDO_ABERTO]);
    db.project.findUnique.mockResolvedValue({ clientRequestId: null, client: { name: "X" } });

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(r.pedidosCobrados).toBe(0);
    expect(r.semDestino).toHaveLength(1);
    expect(r.semDestino[0]!.motivo).toMatch(/solicitação de portal/i);
    // Nada foi inventado como destino.
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("banco fora do ar não derruba a rodada e não finge que cobrou", async () => {
    db.materialRequest.findMany.mockRejectedValue(new Error("sem conexão"));

    const r = await cobrarPedidosEsquecidos(AGORA);

    expect(r.pedidosCobrados).toBe(0);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });
});

describe("a varredura está no CAMINHO VIVO", () => {
  // Sem isto, a função seria mais um `renderizadorDisponivel()`: existente,
  // testada e sem um único chamador — o defeito de 07/08.
  it("o despertador chama `cobrarPedidosEsquecidos`", () => {
    const fonte = readFileSync(join(__dirname, "..", "..", "lib/agency/despertador.ts"), "utf8");
    expect(fonte).toContain('from "@/lib/agency/esteira/pedidos"');
    expect(fonte).toContain("await cobrarPedidosEsquecidos()");
  });

  it("o que ficou sem destino sobe como falha da rodada, não como log", () => {
    const fonte = readFileSync(join(__dirname, "..", "..", "lib/agency/despertador.ts"), "utf8");
    expect(fonte).toMatch(/quebrou\("cobranca-esquecida"/);
  });
});
