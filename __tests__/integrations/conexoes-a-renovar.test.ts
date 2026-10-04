// BLOCO D — O QUE ACONTECE QUANDO O ACESSO EXPIRA (CEO, 04/10/2026).
// Antes: só o portal do cliente dizia "reconecte", e só na próxima visita
// dele. Agora o Início da agência mostra o que caiu e o que vence em 7 dias.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const banco = vi.hoisted(() => ({
  meta: [] as Array<{ clientId: string | null; platform: string; status: string; tokenExpiresAt: Date | null }>,
  drive: [] as Array<{ clientId: string }>,
  gmb: [] as Array<{ clientId: string | null }>,
  ondeMeta: null as unknown,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    metaConnection: { findMany: vi.fn(async (a: { where: unknown }) => { banco.ondeMeta = a.where; return banco.meta; }) },
    googleDriveConnection: { findMany: vi.fn(async () => banco.drive) },
    googleConnection: { findMany: vi.fn(async () => banco.gmb) },
    client: { findMany: vi.fn(async () => [{ id: "s", name: "Sushi Cazza" }, { id: "t", name: "Santioh" }]) },
  },
}));

const { conexoesARenovar, DIAS_DE_ANTECEDENCIA } = await import("@/lib/integrations/conexoes-a-renovar");
const agora = new Date("2026-10-04T12:00:00Z");
const emDias = (d: number) => new Date(agora.getTime() + d * 86_400_000);

describe("conexões para renovar", () => {
  beforeEach(() => { banco.meta = []; banco.drive = []; banco.gmb = []; });

  it("nada caiu e nada vence → lista vazia (o card não aparece)", async () => {
    expect(await conexoesARenovar("ws", agora)).toEqual([]);
  });

  it("pede ao banco o que caiu OU vence em até 7 dias", async () => {
    await conexoesARenovar("ws", agora);
    const onde = JSON.stringify(banco.ondeMeta);
    expect(onde).toContain("expired");
    expect(onde).toContain("revoked");
    expect(onde).toContain(emDias(DIAS_DE_ANTECEDENCIA).toISOString());
  });

  it("o que caiu vem primeiro; o que vence diz em quantos dias; nome do cliente, nunca id", async () => {
    banco.meta = [
      { clientId: "t", platform: "instagram", status: "connected", tokenExpiresAt: emDias(5) },
      { clientId: "s", platform: "instagram", status: "expired", tokenExpiresAt: null },
    ];
    banco.drive = [{ clientId: "t" }];
    const r = await conexoesARenovar("ws", agora);
    expect(r.map((c) => `${c.cliente}|${c.rede}|${c.estado}`)).toEqual([
      "Sushi Cazza|Instagram|caiu",
      "Santioh|Google Drive|caiu",
      "Santioh|Instagram|vence",
    ]);
    expect(r[2]!.frase).toContain("5 dias");
    for (const c of r) expect(c.frase).toContain("portal");
  });

  it("token com data vencida e status ainda 'connected' conta como caiu", async () => {
    banco.meta = [{ clientId: "s", platform: "facebook", status: "connected", tokenExpiresAt: emDias(-1) }];
    expect((await conexoesARenovar("ws", agora))[0]!.estado).toBe("caiu");
  });

  it("uma linha por cliente e rede", async () => {
    banco.meta = [
      { clientId: "s", platform: "instagram", status: "expired", tokenExpiresAt: null },
      { clientId: "s", platform: "instagram", status: "revoked", tokenExpiresAt: null },
    ];
    expect(await conexoesARenovar("ws", agora)).toHaveLength(1);
  });
});

describe("login nativo: nada de colar token na tela", () => {
  const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("Integrações não mostra mais o campo de colar token da Meta", () => {
    expect(ler("components/agency/MetaConnectManager.tsx")).not.toMatch(/<TokenPasteRow\b/);
  });

  it("o Início mostra as conexões para renovar", () => {
    expect(ler("app/agency/dashboard/page.tsx")).toContain("<ConexoesARenovar");
    expect(ler("components/agency/central/CentralDeTrabalho.tsx")).toContain("{aviso}");
  });
});
