// 🔴 O LINK QUE O AVISO CARREGAVA NÃO ABRIA.
//
// `Client.portalToken` e `PortalAccess.token` são duas colunas de duas tabelas,
// geradas independentemente, e **toda porta do portal resolve pela segunda**
// (`validatePortalAccess` → `prisma.portalAccess.findUnique({ where: { token } })`).
// Enquanto o aviso montava o link com a primeira, o cliente clicava e recebia
// 403 — com "enviado" gravado do lado de dentro.
//
// As duas metades aqui:
//   ⛔ o link NUNCA sai do `Client.portalToken`;
//   ✅ o link sai do `PortalAccess` vivo, pelos DOIS caminhos de posse.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  portalAccess: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { linkVivoDoPortal, baseDoPortal } from "@/lib/agency/esteira/link-do-portal-do-cliente";
import { HOST_PADRAO } from "@/lib/agency/esteira/links-do-portal";

const AGORA = new Date("2026-08-15T12:00:00Z");

function acesso(over: Record<string, unknown> = {}) {
  return {
    id: "pa1", token: "TOKEN-VIVO", clientId: "c1", clientRequestId: null,
    grantedAt: new Date("2026-08-01T00:00:00Z"),
    expiresAt: null, revokedAt: null, accessCount: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clientRequestDb.findMany.mockResolvedValue([]);
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_URL;
});

describe("o link sai da tabela que o portal realmente consulta", () => {
  it("token vivo do PortalAccess vira link", async () => {
    db.portalAccess.findMany.mockResolvedValue([acesso()]);
    const r = await linkVivoDoPortal("c1", AGORA);
    expect(r.link).toBe(`${HOST_PADRAO}/portal/access/TOKEN-VIVO`);
    expect(r.token).toBe("TOKEN-VIVO");
  });

  it("procura pelos DOIS caminhos de posse — clientId E via solicitação", async () => {
    // Cliente nascido de uma solicitação tem o acesso preso à solicitação. Ler
    // só um dos dois deixaria metade dos clientes com cara de "nunca teve portal".
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "sol1" }]);
    db.portalAccess.findMany.mockResolvedValue([acesso({ clientId: null, clientRequestId: "sol1" })]);
    const r = await linkVivoDoPortal("c1", AGORA);
    const ramos = db.portalAccess.findMany.mock.calls[0]![0].where.OR;
    expect(ramos).toContainEqual({ clientId: "c1" });
    expect(ramos).toContainEqual({ clientRequestId: { in: ["sol1"] } });
    expect(r.link).toContain("TOKEN-VIVO");
  });

  it("sem solicitação, o ramo é OMITIDO — `in: []` não vira filtro que casa com nada útil", async () => {
    db.portalAccess.findMany.mockResolvedValue([]);
    await linkVivoDoPortal("c1", AGORA);
    expect(db.portalAccess.findMany.mock.calls[0]![0].where.OR).toHaveLength(1);
  });
});

describe("token que não serve NÃO vira link", () => {
  it("revogado é recusado, e o motivo é escrito", async () => {
    db.portalAccess.findMany.mockResolvedValue([acesso({ revokedAt: new Date("2026-08-02T00:00:00Z") })]);
    const r = await linkVivoDoPortal("c1", AGORA);
    expect(r.link).toBeNull();
    expect(r.motivo).toMatch(/revogados ou vencidos/);
  });

  it("vencido é recusado — a data é conferida contra o `agora` INJETADO", async () => {
    db.portalAccess.findMany.mockResolvedValue([acesso({ expiresAt: new Date("2026-08-10T00:00:00Z") })]);
    expect((await linkVivoDoPortal("c1", AGORA)).link).toBeNull();
  });

  it("cliente sem token nenhum diz que nunca teve — e NADA é emitido", async () => {
    db.portalAccess.findMany.mockResolvedValue([]);
    const r = await linkVivoDoPortal("c1", AGORA);
    expect(r.link).toBeNull();
    expect(r.motivo).toMatch(/nunca teve token/);
  });

  it("banco fora do ar NÃO vira 'não tem portal' — são fatos opostos", async () => {
    // Confundir os dois faria a fila mandar para o cadastro um cliente que tem
    // portal funcionando.
    db.portalAccess.findMany.mockRejectedValue(new Error("db down"));
    const r = await linkVivoDoPortal("c1", AGORA);
    expect(r.link).toBeNull();
    expect(r.motivo).toMatch(/não consegui ler/);
  });
});

describe("a base do link", () => {
  it("sem variável de ambiente, cai no host PRÓPRIO — nunca em caminho relativo", async () => {
    // O código antigo montava `${""}/portal/access/…` quando a variável faltava:
    // um caminho relativo dentro de uma mensagem de WhatsApp não é link nenhum.
    expect(baseDoPortal()).toBe(HOST_PADRAO);
    expect(baseDoPortal().startsWith("https://")).toBe(true);
  });

  it("o ambiente vence quando existe", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.exemplo.com/";
    expect(baseDoPortal()).toBe("https://staging.exemplo.com");
  });
});

// ── A METADE QUE IMPEDE A VOLTA DO DEFEITO ──────────────────────────────────

describe("o aviso não pode voltar a montar o link pela coluna errada", () => {
  const AVISOS = fs.readFileSync(path.join(process.cwd(), "lib/agency/esteira/avisos.ts"), "utf8");
  const SRC = AVISOS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("`avisos.ts` não lê mais `Client.portalToken`", () => {
    expect(SRC.includes("portalToken"), "voltou a montar link com a coluna que o portal não consulta").toBe(false);
  });

  it("`avisos.ts` usa o leitor único", () => {
    expect(SRC).toContain("linkVivoDoPortal");
  });

  it("o leitor único NÃO emite credencial por efeito colateral de consulta", () => {
    const LEITOR = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/esteira/link-do-portal-do-cliente.ts"), "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const e of ["create(", "update(", "upsert(", "randomBytes"]) {
      expect(LEITOR.includes(e), `montar um aviso passou a emitir credencial (${e})`).toBe(false);
    }
  });
});
