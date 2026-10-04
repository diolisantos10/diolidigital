// RAIO-X DE 03/10, APLICADO EM 04/10/2026 (ordem do CEO): tipo de cliente,
// faixa de preço, responsável e meta; serviço avulso; oportunidade ganha
// vira cliente.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const banco = vi.hoisted(() => ({
  oportunidade: null as null | { titulo: string; descricao: string | null; clienteId: string | null; plataforma: string },
  clienteExiste: false,
  criados: [] as Array<Record<string, unknown>>,
  vinculos: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    oportunidade: {
      findFirst: vi.fn(async () => banco.oportunidade),
      updateMany: vi.fn(async (a: { data: Record<string, unknown> }) => { banco.vinculos.push(a.data); return { count: 1 }; }),
    },
    client: {
      findFirst: vi.fn(async (): Promise<{ id: string } | null> => (banco.clienteExiste ? { id: "c-antigo" } : null)),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { banco.criados.push(a.data); return { id: "c-novo" }; }),
    },
  },
}));

const { camposDoCadastro } = await import("@/lib/agency/clients/cadastro");
const { transicao, centavosDe } = await import("@/lib/agency/servico-avulso");
const { clienteDaOportunidadeGanha } = await import("@/lib/agency/comercial/oportunidade-ganha");
const { STATUS_VALIDOS } = await import("@/lib/agency/comercial/oportunidade");

describe("cadastro: tipo, responsável e meta", () => {
  it("aceita os dois tipos e recusa o resto", () => {
    expect(camposDoCadastro({ tipo: "projeto_interno" })).toEqual({ ok: true, dados: { tipo: "projeto_interno" } });
    expect(camposDoCadastro({ tipo: "parceiro" }).ok).toBe(false);
  });
  it("ausente não mexe; vazio limpa", () => {
    expect(camposDoCadastro({})).toEqual({ ok: true, dados: {} });
    expect(camposDoCadastro({ meta: "  ", responsavelUserId: "" })).toEqual({ ok: true, dados: { meta: null, responsavelUserId: null } });
  });
  it("a faixa de preço NÃO é coluna: vem da parceria vigente (uma verdade só)", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const client = schema.slice(schema.indexOf("model Client {"), schema.indexOf("\n}", schema.indexOf("model Client {")));
    expect(client).not.toMatch(/^\s+faixaDePreco\s/m);
    const rota = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/route.ts"), "utf8");
    expect(rota).toContain('(await parceriaDoCliente(client.id)) ? "parceiro" : "normal"');
  });
  it("o responsável tem de ser da equipe do workspace", () => {
    const rota = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/route.ts"), "utf8");
    expect(rota).toContain("workspaceId: session.workspaceId, clientId: null");
  });
  it("a migration é versionada e cria só o que o schema declara", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261004220000_cadastro_e_servico_avulso/migration.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "tipo"');
    expect(sql).toContain('CREATE TABLE "ServicoAvulso"');
    expect(sql).not.toContain("faixaDePreco");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM/i);
  });
});

describe("serviço avulso: pedido → entregue → cobrado → fechado", () => {
  it("só anda um passo, na ordem", () => {
    expect(transicao("pedido", "entregar")).toEqual({ ok: true, para: "entregue" });
    expect(transicao("entregue", "cobrar")).toEqual({ ok: true, para: "cobrado" });
    expect(transicao("cobrado", "fechar")).toEqual({ ok: true, para: "fechado" });
    expect(transicao("pedido", "fechar").ok).toBe(false);
    expect(transicao("fechado", "entregar").ok).toBe(false);
  });
  it("valor: zero não é preço", () => {
    expect(centavosDe("R$ 350,00")).toBe(35000);
    expect(centavosDe("1.200")).toBe(120000);
    expect(centavosDe("0")).toBeNull();
    expect(centavosDe("abc")).toBeNull();
  });
});

describe("oportunidade ganha vira cliente", () => {
  beforeEach(() => { banco.criados = []; banco.vinculos = []; banco.clienteExiste = false; });

  it("'ganha' é um estado do catálogo fechado", () => {
    expect(STATUS_VALIDOS).toContain("ganha");
  });

  it("cria o cliente com o título, sem inventar contato, e grava o vínculo", async () => {
    banco.oportunidade = { titulo: "Identidade visual para hamburgueria", descricao: "Logo e cardápio", clienteId: null, plataforma: "99freelas" };
    const r = await clienteDaOportunidadeGanha("ws", "op1");
    expect(r).toEqual({ ok: true, clienteId: "c-novo", criado: true });
    expect(banco.criados[0]).toMatchObject({ workspaceId: "ws", name: "Identidade visual para hamburgueria", tipo: "cliente" });
    expect(banco.criados[0]).not.toHaveProperty("email");
    expect(banco.criados[0]).not.toHaveProperty("phone");
    expect(banco.vinculos[0]).toEqual({ clienteId: "c-novo" });
  });

  it("idempotente: ganhar de novo não cria segundo cliente", async () => {
    banco.oportunidade = { titulo: "x", descricao: null, clienteId: "c-antigo", plataforma: "workana" };
    banco.clienteExiste = true;
    const r = await clienteDaOportunidadeGanha("ws", "op1");
    expect(r).toEqual({ ok: true, clienteId: "c-antigo", criado: false });
    expect(banco.criados).toHaveLength(0);
  });
});
