// PUBLICAR AGORA — adiantar o relógio não é furar a fila.
//
// A rodada de publicação ganhou UM parâmetro (`apenasPostId`) para que o
// Planner possa soltar uma peça específica na hora — necessário para operar em
// tempo integral e para o vídeo do App Review, que precisa MOSTRAR a
// publicação acontecendo.
//
// O risco desse tipo de atalho é sempre o mesmo: virar uma segunda porta, sem
// as travas da primeira. Este teste existe para provar que não virou.
//
// As duas metades:
//   • o filtro FILTRA (só a peça pedida entra na consulta da rodada);
//   • e não afrouxa NADA — continua exigindo `status: "scheduled"` e hora
//     vencida, que são as duas condições da rodada normal.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    socialPost: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

import { publicarAgendados } from "@/lib/agency/esteira/publicacao";

describe("publicarAgendados — o filtro de uma peça só", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]); // rodada vazia: o teste olha a CONSULTA
  });

  it("sem opção, a consulta é a de sempre — agendada e vencida, sem filtro de id", async () => {
    await publicarAgendados();
    const where = findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("scheduled");
    expect(where.scheduledFor).toHaveProperty("lte");
    expect(where).not.toHaveProperty("id");
  });

  it("com apenasPostId, a consulta ganha o id — e NÃO perde nenhuma condição", async () => {
    await publicarAgendados({ apenasPostId: "post-123" });
    const where = findMany.mock.calls[0]![0].where;
    expect(where.id).toBe("post-123");
    // O ponto do teste: o atalho não vira porta larga.
    expect(where.status, "peça em rascunho não sai por atalho").toBe("scheduled");
    expect(where.scheduledFor, "hora não vencida não sai por atalho").toHaveProperty("lte");
  });

  it("o id vazio não vira filtro vazio que solta a casa inteira", async () => {
    await publicarAgendados({ apenasPostId: "" });
    const where = findMany.mock.calls[0]![0].where;
    // String vazia é falsy: o filtro simplesmente não entra, e a rodada segue
    // sendo a normal — nunca `id: ""`, que não casaria com nada, nem `id:
    // undefined`, que o Prisma trataria como "qualquer um".
    expect(where).not.toHaveProperty("id");
    expect(where.status).toBe("scheduled");
  });

  it("a rodada continua limitada — atalho não desliga o teto por rodada", async () => {
    await publicarAgendados({ apenasPostId: "post-123" });
    expect(findMany.mock.calls[0]![0].take).toBeGreaterThan(0);
    expect(findMany.mock.calls[0]![0].orderBy).toEqual({ scheduledFor: "asc" });
  });
});
