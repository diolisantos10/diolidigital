// O CLIENTE DUPLICADO — a prova de que "City Jobs" e "city jobs" são um só.
//
// 15/08/2026: a rota do piloto assistido buscava cliente por nome EXATO
// (`findFirst({ workspaceId, name })`) e criava em silêncio quando não achava.
// O City Jobs virou dois. E `Client.name` não tinha unicidade nenhuma no banco,
// então nem a corrida entre duas chamadas simultâneas era impedida.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  chaveUnicaDoNome,
  chaveDeReconhecimento,
  mesmoCliente,
} from "@/lib/agency/clients/chave-do-nome";

describe("as duas chaves de nome de cliente", () => {
  it("a chave que TRAVA aparra ponta, colapsa espaço e baixa caixa", () => {
    expect(chaveUnicaDoNome("City Jobs")).toBe("city jobs");
    expect(chaveUnicaDoNome("  City Jobs ")).toBe("city jobs");
    expect(chaveUnicaDoNome("City  Jobs")).toBe("city jobs");
    expect(chaveUnicaDoNome("CITY JOBS")).toBe("city jobs");
  });

  it("a chave que TRAVA é reproduzível em SQL — logo NÃO dobra acento", () => {
    // A migration faz o backfill em SQL puro, e SQLite não dobra acento sem
    // ICU. Chave que o código calcula diferente do banco erra o alvo do upsert
    // e volta a duplicar — pior que chave nenhuma.
    expect(chaveUnicaDoNome("Café Central")).toBe("café central");
  });

  it("a chave que RECONHECE pega o que a do banco não pega", () => {
    expect(chaveDeReconhecimento("CityJobs")).toBe("cityjobs");
    expect(chaveDeReconhecimento("City Jobs")).toBe("cityjobs");
    expect(chaveDeReconhecimento("Café Central")).toBe("cafecentral");
    expect(mesmoCliente("City Jobs", "CityJobs")).toBe(true);
    expect(mesmoCliente("City Jobs", "City Jobs Brasil")).toBe(false);
  });

  it("nome vazio não reconhece ninguém — senão dois vazios viram o mesmo cliente", () => {
    expect(mesmoCliente("", "")).toBe(false);
    expect(mesmoCliente("   ", "!!!")).toBe(false);
  });
});

describe("a trava está no BANCO, não só no if", () => {
  // Guarda em código perde a corrida por construção: duas chamadas simultâneas
  // leem "não existe" e as duas criam. O que impede é a restrição.
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../../prisma/migrations/20260815220000_cliente_unico_por_nome/migration.sql", import.meta.url),
    "utf8",
  );

  it("o schema declara a unicidade por workspace", () => {
    expect(schema).toMatch(/@@unique\(\[workspaceId, nameKey\]\)/);
  });

  it("a migration cria o índice único de verdade", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX "Client_workspaceId_nameKey_key"/);
  });

  it("a migration NÃO apaga cliente — duplicata existente é decisão do dono", () => {
    expect(migration).not.toMatch(/\bDELETE\b|\bDROP TABLE\b/i);
  });

  it("a fórmula do backfill é a mesma da chave do código", () => {
    // Se divergirem, o upsert erra o alvo e a duplicata volta pela porta que
    // esta correção fechou.
    expect(migration).toMatch(/lower\(/);
    expect(migration).toMatch(/trim\("name"\)/);
    expect(migration).toMatch(/replace\(replace\(replace\(/);
  });
});

const db = {
  client: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const { garantirClientePorNome } = await import("@/lib/agency/clients/garantir-cliente");

function linha(over: Record<string, unknown> = {}) {
  return { id: "cli-1", name: "City Jobs", workspaceId: "ws-1", nameKey: "city jobs", ...over };
}

describe("garantir cliente sem criar o segundo City Jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.client.findMany.mockResolvedValue([]);
    db.client.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "cli-novo",
      name: create.name,
      workspaceId: create.workspaceId,
    }));
    db.client.update.mockResolvedValue({});
  });

  it.each(["City Jobs", "city jobs", "  City Jobs  ", "City  Jobs", "CityJobs", "CITYJOBS"])(
    "reusa o cliente existente quando o operador escreve %j",
    async (grafia) => {
      db.client.findMany.mockResolvedValue([linha()]);
      const r = await garantirClientePorNome({ workspaceId: "ws-1", nome: grafia });
      expect(r.criado).toBe(false);
      expect(r.cliente.id).toBe("cli-1");
      expect(db.client.upsert).not.toHaveBeenCalled();
    },
  );

  it("cria pela chave única — o upsert é o que ganha da corrida", async () => {
    const r = await garantirClientePorNome({ workspaceId: "ws-1", nome: "  City   Jobs  " });
    expect(r.criado).toBe(true);
    const chamada = db.client.upsert.mock.calls[0]![0];
    expect(chamada.where).toEqual({ workspaceId_nameKey: { workspaceId: "ws-1", nameKey: "city jobs" } });
    // O nome gravado é o limpo, não o que veio com espaço sobrando.
    expect(chamada.create.name).toBe("City Jobs");
    expect(chamada.create.nameKey).toBe("city jobs");
  });

  it("quando o único barra (corrida perdida), devolve o vencedor em vez de estourar", async () => {
    db.client.upsert.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    db.client.findFirst.mockResolvedValue(linha({ id: "cli-vencedor" }));
    const r = await garantirClientePorNome({ workspaceId: "ws-1", nome: "City Jobs" });
    expect(r.cliente.id).toBe("cli-vencedor");
    expect(r.criado).toBe(false);
  });

  it("converge sempre para a linha MAIS ANTIGA quando a duplicata já existe", async () => {
    // As duplicatas que já estão no banco não somem por conta própria (fusão é
    // decisão do dono). O que o caminho novo garante é não escolher uma hoje e
    // outra amanhã — o trabalho pendurado ficaria espalhado nas duas.
    db.client.findMany.mockResolvedValue([
      linha({ id: "cli-antigo", name: "City Jobs" }),
      linha({ id: "cli-novo", name: "city jobs" }),
    ]);
    const r = await garantirClientePorNome({ workspaceId: "ws-1", nome: "CityJobs" });
    expect(r.cliente.id).toBe("cli-antigo");
    expect(r.reusadoDe).toBe("City Jobs");
  });

  it("nome vazio não vira cliente", async () => {
    await expect(garantirClientePorNome({ workspaceId: "ws-1", nome: "   " })).rejects.toThrow();
  });
});
