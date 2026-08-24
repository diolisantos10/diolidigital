// AS 7 APROVAÇÕES "SEM DONO" — o número estava certo, a pergunta estava errada.
//
// ── O que foi levantado em 15/08/2026 ───────────────────────────────────────
// A coleta de produção mostrou `approvalRequest.count({status:"pending"})` = 7,
// **todas com `clientVisible: true`** — e o censo por cliente
// (`lib/raio-x/por-cliente.ts`) devolvia **ZERO nos 5 clientes**. Sete cartões
// de decisão marcados como visíveis ao cliente e nenhum cliente conhecido.
//
// Isso tem a forma exata do defeito mais caro desta casa (escopo de posse — a
// mesma família do chat do portal servindo a conversa do cliente errado), e por
// isso foi tratado como possível P0.
//
// ── O VEREDITO: NÃO É VAZAMENTO. É CENSO CEGO. ──────────────────────────────
// `ApprovalRequest` tem posse por **DUAS** chaves, declarado no schema desde o
// lançamento da Foocci: `clientRequestId` (fluxo do briefing) **OU** `clientId`
// (cliente criado direto, que sem isso não conseguia aprovar nada). O portal
// honra as duas — `posse-da-aprovacao.ts` é a função pura que decide, e o
// gate de isolamento já a prova. **O censo perguntava só a segunda.**
//
// Card do primeiro tipo é invisível para ele por construção da consulta, não
// por falta de dono. `createApprovalRequest` LANÇA sem nenhuma das duas chaves,
// então o caminho vivo não escreve card órfão.
//
// ── O QUE ESTE ARQUIVO TRANCA ───────────────────────────────────────────────
// 1. o censo por cliente passa a somar as DUAS chaves (⛔ acha os 7);
// 2. ele não passa a contar card ALHEIO de carona (✅ o isolamento continua);
// 3. o raio-x ganha o balde do órfão DE VERDADE — `ApprovalRequest.clientId`
//    **não tem `@relation`** no schema, então apagar um `Client` deixa o card
//    apontando para o nada, sem cascata e sem erro.

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Card { id: string; status: string; clientRequestId: string | null; clientId: string | null; clientRequestClientId: string | null }
interface Cli { id: string; name: string }

const estado = vi.hoisted(() => ({ cards: [] as Card[], clientes: [] as Cli[] }));

const db = vi.hoisted(() => {
  const vazio = { count: async () => 0, findMany: async () => [], findFirst: async () => null };

  /** Honra as duas chaves de posse E o `OR` — um mock que ignorasse o `where`
   *  faria todo teste abaixo passar com o código defeituoso. */
  const bate = (c: Card, where: Record<string, unknown>): boolean => {
    if (where.status && c.status !== where.status) return false;
    if ("clientRequestId" in where) {
      const cond = where.clientRequestId;
      if (cond === null && c.clientRequestId !== null) return false;
      if (cond && typeof cond === "object" && "not" in (cond as Record<string, unknown>)
          && (cond as Record<string, unknown>).not === null && c.clientRequestId === null) return false;
    }
    if ("clientId" in where) {
      const cond = where.clientId;
      if (cond === null && c.clientId !== null) return false;
      if (typeof cond === "string" && c.clientId !== cond) return false;
      if (cond && typeof cond === "object") {
        const o = cond as Record<string, unknown>;
        if ("not" in o && o.not === null && c.clientId === null) return false;
        if ("in" in o && !(o.in as string[]).includes(c.clientId ?? "\0")) return false;
      }
    }
    if (Array.isArray(where.OR)) {
      const ok = (where.OR as Record<string, unknown>[]).some((r) => {
        if (r.clientRequest) return c.clientRequestClientId === (r.clientRequest as { clientId: string }).clientId;
        if (r.clientId) return c.clientId === r.clientId;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  };

  return new Proxy({} as Record<string, unknown>, {
    get(_a, nome: string) {
      if (nome === "approvalRequest") {
        return {
          count: async (a?: { where?: Record<string, unknown> }) =>
            estado.cards.filter((c) => bate(c, a?.where ?? {})).length,
          findMany: async (a?: { where?: Record<string, unknown>; distinct?: string[] }) => {
            const linhas = estado.cards.filter((c) => bate(c, a?.where ?? {}));
            if (a?.distinct?.includes("clientId")) {
              const vistos = new Set<string>();
              return linhas.filter((c) => {
                const k = c.clientId ?? "\0";
                if (vistos.has(k)) return false;
                vistos.add(k);
                return true;
              });
            }
            return linhas;
          },
          findFirst: async () => null,
        };
      }
      if (nome === "client") {
        return {
          count: async () => estado.clientes.length,
          findMany: async (a?: { where?: { id?: { in?: string[] } } }) => {
            const ids = a?.where?.id?.in;
            return ids ? estado.clientes.filter((c) => ids.includes(c.id)) : estado.clientes;
          },
          findFirst: async () => null,
        };
      }
      return vazio;
    },
  });
});

vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { varrerDadosPresos } from "@/lib/raio-x/dados";
import { varrerPorCliente } from "@/lib/raio-x/por-cliente";

const AGORA = new Date("2026-08-15T12:00:00.000Z");

/** A produção de 15/08, reproduzida: 5 clientes, 7 cards pendentes visíveis,
 *  todos pendurados na SOLICITAÇÃO — não no cliente direto. */
function producaoDe15Agosto() {
  estado.clientes = ["foocci", "cityjobs", "dioli", "camila_a", "camila_b"].map((id) => ({ id, name: id }));
  estado.cards = Array.from({ length: 7 }, (_, i) => ({
    id: `ap_${i}`,
    status: "pending",
    clientRequestId: `req_${i % 5}`,
    clientId: null,
    clientRequestClientId: ["foocci", "cityjobs", "dioli", "camila_a", "camila_b"][i % 5],
  }));
}

beforeEach(() => {
  estado.cards = [];
  estado.clientes = [];
});

describe("⛔ o censo por cliente ENXERGA os 7 (antes respondia zero)", () => {
  it("soma as duas chaves de posse e distribui os 7 entre os 5 clientes", async () => {
    producaoDe15Agosto();

    const r = await varrerPorCliente(AGORA);
    const total = r.clientes.reduce(
      (s, c) => s + (c.aprovacoesPendentes.estado === "medido" ? c.aprovacoesPendentes.valor : 0),
      0,
    );

    // Era exatamente isto que dava ZERO: 7 no agregado, 0 no censo.
    expect(total).toBe(7);
    expect(r.clientes.every((c) => c.aprovacoesPendentes.estado === "medido")).toBe(true);
  });

  it("também enxerga o card do CLIENTE DIRETO (a outra chave) — as duas, não uma", async () => {
    estado.clientes = [{ id: "foocci", name: "Foocci" }];
    estado.cards = [
      { id: "ap_direto", status: "pending", clientRequestId: null, clientId: "foocci", clientRequestClientId: null },
      { id: "ap_briefing", status: "pending", clientRequestId: "req_1", clientId: null, clientRequestClientId: "foocci" },
    ];

    const r = await varrerPorCliente(AGORA);
    expect(r.clientes[0].aprovacoesPendentes).toEqual({ estado: "medido", valor: 2 });
  });
});

describe("✅ o censo NÃO passou a contar card alheio de carona", () => {
  it("card de OUTRO cliente não aparece no retrato deste", async () => {
    estado.clientes = [{ id: "foocci", name: "Foocci" }, { id: "cityjobs", name: "CityJobs" }];
    estado.cards = [
      { id: "ap_1", status: "pending", clientRequestId: "req_c", clientId: null, clientRequestClientId: "cityjobs" },
    ];

    const r = await varrerPorCliente(AGORA);
    const porNome = Object.fromEntries(
      r.clientes.map((c) => [c.nome, c.aprovacoesPendentes.estado === "medido" ? c.aprovacoesPendentes.valor : -1]),
    );
    expect(porNome.CityJobs).toBe(1);
    expect(porNome.Foocci).toBe(0); // o isolamento continua de pé
  });

  it("card já decidido não conta — só 'pending' é decisão aberta", async () => {
    estado.clientes = [{ id: "foocci", name: "Foocci" }];
    estado.cards = [
      { id: "ap_ok", status: "approved", clientRequestId: null, clientId: "foocci", clientRequestClientId: null },
    ];

    const r = await varrerPorCliente(AGORA);
    expect(r.clientes[0].aprovacoesPendentes).toEqual({ estado: "medido", valor: 0 });
  });
});

describe("o raio-x agora RECONCILIA — a divergência tem nome", () => {
  it("⛔ os 7 aparecem como posse por SOLICITAÇÃO, e nada sobra como sem-dono", async () => {
    producaoDe15Agosto();

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.aprovacoesPendentes).toBe(7);
    expect(r.medidas.aprovacoesPendentesPorSolicitacao).toBe(7);
    expect(r.medidas.aprovacoesPendentesPorClienteDireto).toBe(0);
    // A soma FECHA dentro do próprio raio-x: nada de órfão.
    expect(r.medidas.aprovacoesPendentesSemChaveDePosse).toBe(0);
    expect(r.medidas.aprovacoesPendentesComClienteApagado).toBe(0);
    expect(r.achados.find((a) => a.chave === "aprovacao-sem-dono")).toBeUndefined();
    expect(r.achados.find((a) => a.chave === "aprovacao-com-cliente-apagado")).toBeUndefined();
  });

  it("⛔ card SEM NENHUMA das duas chaves é achado alto — ninguém consegue decidi-lo", async () => {
    estado.clientes = [{ id: "foocci", name: "Foocci" }];
    estado.cards = [
      { id: "ap_orfao", status: "pending", clientRequestId: null, clientId: null, clientRequestClientId: null },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.aprovacoesPendentesSemChaveDePosse).toBe(1);
    const a = r.achados.find((x) => x.chave === "aprovacao-sem-dono")!;
    expect(a.gravidade).toBe("alto");
  });

  it("⛔ o ÓRFÃO DE VERDADE: clientId apontando para Client apagado (não há FK)", async () => {
    // `ApprovalRequest.clientId` não tem `@relation` no schema — só
    // `clientRequest` tem, com onDelete: Cascade. Apagar o Client não cascateia
    // e não dá erro: o card fica apontando para o nada, pendente para sempre.
    estado.clientes = [{ id: "foocci", name: "Foocci" }];
    estado.cards = [
      { id: "ap_vivo", status: "pending", clientRequestId: null, clientId: "foocci", clientRequestClientId: null },
      { id: "ap_morto", status: "pending", clientRequestId: null, clientId: "cliente_apagado", clientRequestClientId: null },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.aprovacoesPendentesComClienteApagado).toBe(1);
    const a = r.achados.find((x) => x.chave === "aprovacao-com-cliente-apagado")!;
    expect(a.gravidade).toBe("alto");
    expect(a.evidencia).toMatch(/sem @relation|não tem @relation/);
  });

  it("✅ casa limpa: nenhum dos dois achados aparece", async () => {
    estado.clientes = [{ id: "foocci", name: "Foocci" }];
    estado.cards = [
      { id: "ap_1", status: "pending", clientRequestId: null, clientId: "foocci", clientRequestClientId: null },
    ];

    const r = await varrerDadosPresos(AGORA);

    expect(r.medidas.aprovacoesPendentesSemChaveDePosse).toBe(0);
    expect(r.medidas.aprovacoesPendentesComClienteApagado).toBe(0);
    expect(r.achados.filter((a) => a.chave.startsWith("aprovacao-"))
      .map((a) => a.chave)).not.toContain("aprovacao-com-cliente-apagado");
  });
});
