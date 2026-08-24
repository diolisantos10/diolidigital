// A PROVA DE QUE A TRAVA MORDE — a rota de pedido recusando, de verdade.
//
// Trava que ninguém viu recusar não está provada. Este arquivo chama o handler
// REAL de `POST /api/self-serve/order` (nada de mock da régua) com o corpo de um
// comprador legítimo pedindo um item sem caminho de produção, e exige três
// coisas: 409, nenhuma linha no banco e nenhuma cobrança criada.
//
// Por que aqui e não com `curl` em produção: enquanto a trava não estiver no ar,
// um POST de verdade CRIA um pedido de verdade — sujar o banco do cliente para
// provar um ponto é o oposto do que este trabalho é. E depois de no ar, o teste
// continua valendo a cada commit; o curl vale uma vez.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  clientRequestDb: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
}));
const consumirVaga = vi.hoisted(() => vi.fn());
const resolverWorkspacePublico = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/security/limite-no-banco", async (original) => {
  const real = await original<typeof import("@/lib/security/limite-no-banco")>();
  return { ...real, consumirVaga };
});
vi.mock("@/lib/agency/persistence/client-request-service", () => ({ resolverWorkspacePublico }));

import { POST as pedir } from "@/app/api/self-serve/order/route";
import { CATALOGO_SUSPENSO, CATALOGO_VENDAVEL } from "@/lib/agency/self-serve-catalog";

const COMPRADOR = {
  name: "Maria da Padaria",
  email: "maria@padaria.com.br",
  phone: "+55 11 99999-9999",
};

function pedido(serviceId: string, ip = "200.1.1.1"): NextRequest {
  return new NextRequest("http://localhost/api/self-serve/order", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ serviceId, ...COMPRADOR }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  consumirVaga.mockResolvedValue({ liberado: true, esperarSegundos: 0, motivo: "ok" });
  resolverWorkspacePublico.mockResolvedValue("ws-A");
  db.clientRequestDb.findFirst.mockResolvedValue(null);
  db.clientRequestDb.create.mockResolvedValue({ id: "cr-novo" });
  // O gateway LIGADO é o caso que importa: é assim que a vitrine cobrava.
  process.env.MERCADOPAGO_ACCESS_TOKEN = "token-de-teste";
  vi.stubGlobal("fetch", vi.fn());
});

describe("a rota recusa item sem caminho de produção", () => {
  it.each(CATALOGO_SUSPENSO.map((s) => [s.item.id] as [string]))(
    "%s: 409, nada gravado, nada cobrado",
    async (id) => {
      const res = await pedir(pedido(id));

      expect(res.status).toBe(409);
      const corpo = await res.json();
      expect(corpo.ok).toBe(false);
      expect(corpo.indisponivel).toBe(true);
      expect(corpo.error).toMatch(/saiu de venda/);

      // As duas metades que fazem disto uma trava e não um aviso:
      expect(db.clientRequestDb.create, "gravou pedido").not.toHaveBeenCalled();
      expect(globalThis.fetch, "criou cobrança").not.toHaveBeenCalled();
    },
  );

  it("a recusa explica o que falta, em português, e oferece o WhatsApp", async () => {
    const res = await pedir(pedido("identidade-basica"));
    const corpo = await res.json();
    expect(corpo.error).toContain("logotipo");
    expect(corpo.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
  });

  it("quem tem o id antigo (link, print, curl) bate na MESMA recusa", async () => {
    // A vitrine é o aviso; esta rota é a trava. Sumir da tela não protege
    // quem já tem o identificador do item.
    const res = await pedir(pedido("1-reel"));
    expect(res.status).toBe(409);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("o item que a casa PRODUZ continua passando — a trava não fechou a loja", async () => {
    const vendavel = CATALOGO_VENDAVEL.find((s) => !s.id.startsWith("balcao-"))!;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ init_point: "https://mp.exemplo/checkout" }),
    });
    const res = await pedir(pedido(vendavel.id));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect(db.clientRequestDb.create).toHaveBeenCalled();
  });
});
