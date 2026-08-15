// BACKFILL — idempotente por natureza: a segunda rodada é zero escrita.

import { describe, it, expect } from "vitest";
import { backfillDeEntidade, type ArmazemDeBackfill, type EntidadeParaBackfill } from "@/lib/agency/estados-v2/backfill";
import { derivarDeSocialPost } from "@/lib/agency/estados-v2/derivar";

function armazemDeMemoria(entidades: EntidadeParaBackfill[]) {
  const escritas: Array<{ id: string; estado: string }> = [];
  const armazem: ArmazemDeBackfill = {
    async listar(_tipo, lote, cursor) {
      const inicio = cursor ? entidades.findIndex((e) => e.id === cursor) + 1 : 0;
      return entidades.slice(inicio, inicio + lote);
    },
    async gravarEstado(_tipo, id, estado) {
      escritas.push({ id, estado });
      const e = entidades.find((x) => x.id === id)!;
      e.estadoCanonico = estado;
    },
  };
  return { armazem, escritas };
}

const derivador = (legado: Record<string, unknown>) => derivarDeSocialPost(legado as { status: string });

describe("backfillDeEntidade", () => {
  it("deriva e grava; contagem fecha com o total", async () => {
    const { armazem, escritas } = armazemDeMemoria([
      { id: "a", estadoCanonico: null, legado: { status: "draft" } },
      { id: "b", estadoCanonico: null, legado: { status: "scheduled" } },
      { id: "c", estadoCanonico: "measurement", legado: { status: "published" } }, // já correto
    ]);
    const r = await backfillDeEntidade("SocialPost", derivador, armazem);
    expect(r).toMatchObject({ total: 3, atualizados: 2, jaCorretos: 1, semDerivacao: 0 });
    expect(escritas).toEqual([
      { id: "a", estado: "production" },
      { id: "b", estado: "implementation" },
    ]);
  });

  it("a SEGUNDA rodada não escreve nada — idempotência verificável no resultado", async () => {
    const { armazem, escritas } = armazemDeMemoria([
      { id: "a", estadoCanonico: null, legado: { status: "draft" } },
      { id: "b", estadoCanonico: null, legado: { status: "published" } },
    ]);
    await backfillDeEntidade("SocialPost", derivador, armazem);
    const segunda = await backfillDeEntidade("SocialPost", derivador, armazem);
    expect(segunda).toMatchObject({ total: 2, atualizados: 0, jaCorretos: 2 });
    expect(escritas).toHaveLength(2); // só as da primeira rodada
  });

  it("status sem mapa NÃO vira escrita — vira contagem e id no relatório", async () => {
    const { armazem, escritas } = armazemDeMemoria([
      { id: "x", estadoCanonico: null, legado: { status: "widee" } },
    ]);
    const r = await backfillDeEntidade("SocialPost", derivador, armazem);
    expect(r.semDerivacao).toBe(1);
    expect(r.idsSemDerivacao).toEqual(["x"]);
    expect(escritas).toHaveLength(0);
  });

  it("pagina por cursor sem perder nem repetir ninguém", async () => {
    const muitos: EntidadeParaBackfill[] = Array.from({ length: 450 }, (_, i) => ({
      id: `p${String(i).padStart(3, "0")}`,
      estadoCanonico: null,
      legado: { status: "draft" },
    }));
    const { armazem, escritas } = armazemDeMemoria(muitos);
    const r = await backfillDeEntidade("SocialPost", derivador, armazem, 100);
    expect(r.total).toBe(450);
    expect(r.atualizados).toBe(450);
    expect(new Set(escritas.map((e) => e.id)).size).toBe(450);
  });
});
