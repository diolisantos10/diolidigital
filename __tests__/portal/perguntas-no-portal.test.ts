// PERGUNTAS AO CLIENTE NO PORTAL (CEO, 04/10/2026) — o cliente responde o FATO
// que a agência não deduz, e a resposta cai na ficha única.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = { clientId: string; fichaExtraJson: string | null; values: string | null };

const banco = vi.hoisted(() => ({ linha: null as null | { clientId: string; fichaExtraJson: string | null; values: string | null } }));
const acesso = vi.hoisted(() => ({
  clientId: "cli-do-token" as string | null,
  upserts: [] as Array<{ where: { clientId: string } }>,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    brandBrain: {
      findUnique: vi.fn(async (): Promise<Linha | null> => banco.linha),
      upsert: vi.fn(async (args: { where: { clientId: string }; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<Linha> => {
        acesso.upserts.push({ where: args.where });
        const novo: Linha = {
          clientId: args.where.clientId,
          values: null,
          fichaExtraJson: String((banco.linha ? args.update : args.create).fichaExtraJson ?? "{}"),
        };
        banco.linha = novo;
        return novo;
      }),
    },
  },
}));

vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess: vi.fn(async (token: string): Promise<{ valid: boolean; record?: { clientId: string | null } }> =>
    token === "token-bom" && acesso.clientId ? { valid: true, record: { clientId: acesso.clientId } } : { valid: false },
  ),
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/portal/perguntas/route";

const url = (q = "") => `http://localhost/api/portal/perguntas${q}`;
const post = (corpo: unknown, token: string | null = "token-bom") =>
  POST(new NextRequest(url(token ? `?token=${token}` : ""), { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }));
const get = (token: string | null = "token-bom") => GET(new NextRequest(url(token ? `?token=${token}` : "")));
const extra = () => JSON.parse(banco.linha?.fichaExtraJson ?? "{}") as Record<string, string>;

beforeEach(() => {
  banco.linha = null;
  acesso.clientId = "cli-do-token";
  acesso.upserts.length = 0;
});

describe("autenticação", () => {
  it("sem token → 401 e nada gravado", async () => {
    const r = await post({ fato: "endereco", resposta: "Rua A, 1" }, null);
    expect(r.status).toBe(401);
    expect(acesso.upserts).toHaveLength(0);
    expect((await get(null)).status).toBe(401);
  });

  it("token inválido → 401 e nada gravado", async () => {
    const r = await post({ fato: "endereco", resposta: "Rua A, 1" }, "token-ruim");
    expect(r.status).toBe(401);
    expect(acesso.upserts).toHaveLength(0);
  });

  it("clientId no corpo é IGNORADO — vale o do token", async () => {
    const r = await post({ fato: "endereco", resposta: "Rua A, 1, Centro, Curitiba", clientId: "cli-de-outro" });
    expect(r.status).toBe(200);
    expect(acesso.upserts.map((u) => u.where.clientId)).toEqual(["cli-do-token"]);
  });
});

describe("gravação", () => {
  it("arroba ACRESCENTA em canais sem apagar a linha anterior", async () => {
    banco.linha = { clientId: "cli-do-token", values: null, fichaExtraJson: JSON.stringify({ canais: "Site: marca.com.br" }) };
    const r = await post({ fato: "arroba", resposta: "@sushicazza" });
    expect(r.status).toBe(200);
    expect(extra().canais).toBe("Site: marca.com.br\n@sushicazza");
  });

  it("cardápio acrescenta linhas em produtos sem apagar as que existiam", async () => {
    banco.linha = { clientId: "cli-do-token", values: null, fichaExtraJson: JSON.stringify({ produtos: "Temaki — R$ 32,00" }) };
    await post({ fato: "cardapio", resposta: "Combinado 20 peças — R$ 89,90\n\nUramaki" });
    expect(extra().produtos).toBe("Temaki — R$ 32,00\nCombinado 20 peças — R$ 89,90\nUramaki");
  });

  it("endereço e horário vão para os campos próprios; a resposta devolve quantas faltam", async () => {
    await post({ fato: "endereco", resposta: "Rua das Flores, 120, Centro, Curitiba" });
    const r = await post({ fato: "horario", resposta: "Ter a dom, 18h às 23h" });
    expect(extra().endereco).toBe("Rua das Flores, 120, Centro, Curitiba");
    expect(extra().horario).toBe("Ter a dom, 18h às 23h");
    expect(await r.json()).toEqual({ gravado: true, abertas: 3 });
  });
});

describe("validação", () => {
  it("fato fora dos cinco → 400, nada gravado", async () => {
    for (const fato of ["publico", "", undefined, 7]) {
      const r = await post({ fato, resposta: "qualquer" });
      expect(r.status).toBe(400);
    }
    expect(acesso.upserts).toHaveLength(0);
  });

  it("resposta vazia ou acima de 2000 caracteres → 400, nada gravado", async () => {
    expect((await post({ fato: "endereco", resposta: "   " })).status).toBe(400);
    expect((await post({ fato: "endereco" })).status).toBe(400);
    expect((await post({ fato: "endereco", resposta: "x".repeat(2001) })).status).toBe(400);
    expect(acesso.upserts).toHaveLength(0);
  });
});

describe("GET", () => {
  it("ficha vazia → as cinco abertas, com fato/rotulo/pergunta", async () => {
    const corpo = (await (await get()).json()) as { perguntas: Array<Record<string, unknown>>; abertas: number };
    expect(corpo.abertas).toBe(5);
    expect(corpo.perguntas.map((p) => p.fato)).toEqual(["cardapio", "precos", "endereco", "horario", "arroba"]);
    expect(Object.keys(corpo.perguntas[0]!).sort()).toEqual(["fato", "pergunta", "rotulo"]);
  });

  it("devolve SÓ as abertas", async () => {
    banco.linha = {
      clientId: "cli-do-token",
      values: null,
      fichaExtraJson: JSON.stringify({ endereco: "Rua das Flores, 120, Centro", horario: "Seg a sex, 9h às 18h", canais: "Instagram: @sushicazza" }),
    };
    const corpo = (await (await get()).json()) as { perguntas: Array<{ fato: string }>; abertas: number };
    expect(corpo.perguntas.map((p) => p.fato)).toEqual(["cardapio", "precos"]);
    expect(corpo.abertas).toBe(2);
  });
});
