// `/api/self-serve/order` — a rota PÚBLICA que ESCREVE no banco.
//
// O furo (raio-x de 05/08/2026): sem sessão, sem assinatura, sem teto por IP.
// Um laço de `curl` criava `ClientRequestDb` sem limite — a MESMA tabela que
// alimenta a fila de triagem da agência. O volume do Railway é finito e o
// trabalho de verdade fica afogado no meio do lixo. E o comprador escolhia, de
// fato, em qual agência o pedido caía.
//
// Ela TEM que continuar pública (quem chega pela vitrine não tem login), então a
// defesa é composta: teto por IP no banco, teto global da rota, forma do pedido
// conferida, dedup por janela e dono derivado no servidor.
//
// AS DUAS METADES: o laço é barrado e NADA é gravado; o comprador de verdade
// compra sem atrito nenhum.

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
import { SELF_SERVE_CATALOG } from "@/lib/agency/self-serve-catalog";

const ITEM = SELF_SERVE_CATALOG.find((s) => !s.id.startsWith("balcao-"))!;

const COMPRA_VALIDA = {
  serviceId: ITEM.id,
  name: "Maria da Padaria",
  email: "maria@padaria.com.br",
  phone: "+55 11 99999-9999",
};

function pedido(corpo: unknown, ip = "200.1.1.1"): NextRequest {
  return new NextRequest("http://localhost/api/self-serve/order", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  consumirVaga.mockResolvedValue({ liberado: true, esperarSegundos: 0, motivo: "ok" });
  resolverWorkspacePublico.mockResolvedValue("ws-A");
  db.clientRequestDb.findFirst.mockResolvedValue(null);
  db.clientRequestDb.create.mockResolvedValue({ id: "cr-novo" });
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});

describe("teto por IP — o laço é barrado ANTES de qualquer escrita", () => {
  it("IP estourado: 429 e NENHUMA linha criada", async () => {
    consumirVaga.mockResolvedValue({ liberado: false, esperarSegundos: 120, motivo: "estourou" });
    const res = await pedir(pedido(COMPRA_VALIDA));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("o teto é cobrado ANTES de ler o corpo — corpo gigante não é nem parseado", async () => {
    consumirVaga.mockResolvedValue({ liberado: false, esperarSegundos: 60, motivo: "estourou" });
    const res = await pedir(pedido({ lixo: "x".repeat(10_000) }));
    expect(res.status).toBe(429);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("são DOIS baldes: o do IP e o da rota inteira (IP é barato de trocar)", async () => {
    await pedir(pedido(COMPRA_VALIDA));
    const chaves = consumirVaga.mock.calls.map((c) => c[0] as string);
    expect(chaves[0]).toBe("self-serve-order:200.1.1.1");
    expect(chaves[1]).toBe("self-serve-order:global");
  });

  it("o teto global barra o ataque distribuído mesmo com IP novo a cada requisição", async () => {
    consumirVaga.mockImplementation((chave: string) =>
      Promise.resolve(
        chave === "self-serve-order:global"
          ? { liberado: false, esperarSegundos: 900, motivo: "estourou" }
          : { liberado: true, esperarSegundos: 0, motivo: "ok" },
      ),
    );
    const res = await pedir(pedido(COMPRA_VALIDA, "45.45.45.45"));
    expect(res.status).toBe(429);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("contador indisponível: 503 e nada gravado (fail-closed)", async () => {
    consumirVaga.mockResolvedValue({ liberado: false, esperarSegundos: 60, motivo: "indisponivel" });
    const res = await pedir(pedido(COMPRA_VALIDA));
    expect(res.status).toBe(503);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });
});

describe("a forma do pedido — campo livre sem teto é o outro jeito de encher o volume", () => {
  it("e-mail sem cara de e-mail: 400 e nada gravado", async () => {
    const res = await pedir(pedido({ ...COMPRA_VALIDA, email: "não-é-email" }));
    expect(res.status).toBe(400);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("telefone sem dígitos: 400 e nada gravado", async () => {
    const res = await pedir(pedido({ ...COMPRA_VALIDA, phone: "me liga aí" }));
    expect(res.status).toBe(400);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("nome e observação gigantes são CORTADOS, não gravados inteiros", async () => {
    await pedir(
      pedido({ ...COMPRA_VALIDA, name: "N".repeat(5000), note: "O".repeat(50_000) }),
    );
    const data = db.clientRequestDb.create.mock.calls[0]![0].data;
    expect(data.businessName.length).toBeLessThanOrEqual(120);
    expect(String(data.rawContext).length).toBeLessThan(3000);
  });

  it("item que não está no catálogo NUNCA vira pedido — item desconhecido não é permissão", async () => {
    const res = await pedir(pedido({ ...COMPRA_VALIDA, serviceId: "serviço-inventado" }));
    expect(res.status).toBe(404);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });

  it("campo não-string (array, objeto) não passa por cima da validação", async () => {
    const res = await pedir(pedido({ ...COMPRA_VALIDA, name: { $ne: null } }));
    expect(res.status).toBe(400);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });
});

describe("dedup — duplo clique não vira dois pedidos", () => {
  it("mesmo e-mail, mesmo item, dentro da janela: devolve o pedido existente e NÃO cria outro", async () => {
    db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr-antigo" });
    const res = await pedir(pedido(COMPRA_VALIDA));
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo.orderId).toBe("cr-antigo");
    expect(corpo.duplicado).toBe(true);
    expect(db.clientRequestDb.create).not.toHaveBeenCalled();
  });
});

describe("o dono é derivado no SERVIDOR, não escolhido pelo comprador", () => {
  it("um workspaceId enviado no corpo é IGNORADO — vale o que o servidor resolveu", async () => {
    await pedir(pedido({ ...COMPRA_VALIDA, workspaceId: "ws-do-vizinho" }));
    expect(db.clientRequestDb.create.mock.calls[0]![0].data.workspaceId).toBe("ws-A");
  });

  it("com mais de uma agência na base, o pedido nasce ÓRFÃO — e órfã é julgada depois", async () => {
    resolverWorkspacePublico.mockResolvedValue(undefined);
    await pedir(pedido(COMPRA_VALIDA));
    expect(db.clientRequestDb.create.mock.calls[0]![0].data.workspaceId).toBeUndefined();
  });
});

describe("A OUTRA METADE — o comprador de verdade compra sem atrito", () => {
  it("compra legítima: 200, pedido criado e caminho de WhatsApp devolvido", async () => {
    const res = await pedir(pedido(COMPRA_VALIDA));
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.orderId).toBe("cr-novo");
    expect(corpo.whatsappUrl).toContain("wa.me");
    expect(db.clientRequestDb.create).toHaveBeenCalledOnce();
  });

  it("os dados do comprador chegam íntegros na linha — a guarda apara, não mutila", async () => {
    await pedir(pedido(COMPRA_VALIDA));
    const data = db.clientRequestDb.create.mock.calls[0]![0].data;
    expect(data.businessName).toBe("Maria da Padaria");
    expect(JSON.parse(data.briefingJson)).toMatchObject({
      serviceId: ITEM.id,
      prospectEmail: "maria@padaria.com.br",
      prospectPhone: "+55 11 99999-9999",
    });
  });

  it("dois compradores DIFERENTES no mesmo item passam os dois — a dedup é por e-mail", async () => {
    await pedir(pedido(COMPRA_VALIDA));
    await pedir(pedido({ ...COMPRA_VALIDA, email: "joao@outra.com" }, "200.2.2.2"));
    expect(db.clientRequestDb.create).toHaveBeenCalledTimes(2);
  });
});
