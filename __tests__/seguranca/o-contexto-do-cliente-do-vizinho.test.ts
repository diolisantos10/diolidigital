// O CONTEXTO DO CLIENTE DO VIZINHO — furo achado na varredura de posse,
// rodada 2, lote B (29/08/2026).
//
// `loadClientContext` (lib/agency/social-posts/contexto-do-cliente.ts,
// chamada por app/api/social-posts/generate/route.ts) buscava a
// `clientRequestDb` (o briefing: nome do negócio, segmento, serviços
// contratados, objetivos, público-alvo) SÓ por `clientId` — sem
// `workspaceId` — enquanto a busca do `Client` já conferia o workspace
// corretamente. Resultado: um `clientId` de OUTRO inquilino fazia `client`
// voltar `null` (barrado, certo) mas `request` vinha preenchido com o
// briefing ALHEIO, e `!client && !request` deixava passar porque `request`
// sozinho já bastava. Esse contexto virava prompt da IA e voltava, para
// quem pediu, na legenda/ideia/roteiro gerado — leitura entre inquilinos
// sem erro nenhum na tela.
//
// ⚠️ ESTE TESTE EXERCITA A RECUSA. Uma trava só existe se ela recusa.

import { describe, it, expect, beforeEach, vi } from "vitest";

// O ARGUMENTO também é anotado, não só o retorno — `vi.fn(async () => ...)`
// sem parâmetro faz o TypeScript inferir `[]` para `mock.calls`, e
// `mock.calls[0]?.[0]` vira TS2493 no `tsc --noEmit` do CI mesmo com o
// vitest verde (ver `.fichas/rodada2-B.md`, a armadilha já mordeu esta casa).
type ConsultaClient = { where?: Record<string, unknown>; include?: Record<string, unknown> };
type ConsultaClientRequest = { where?: Record<string, unknown>; orderBy?: unknown };

interface LinhaClient {
  id: string;
  name: string | null;
  industry: string | null;
  brandBrain: { tone: string | null; targetAudience: string | null } | null;
}
interface LinhaClientRequest {
  businessName: string | null;
  segment: string | null;
  briefingJson: string | null;
  services: string | null;
  objectives: string | null;
}

const db = vi.hoisted(() => ({
  client: {
    findFirst: vi.fn(async (_args: ConsultaClient): Promise<LinhaClient | null> => null),
  },
  clientRequestDb: {
    findFirst: vi.fn(async (_args: ConsultaClientRequest): Promise<LinhaClientRequest | null> => null),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { loadClientContext } from "@/lib/agency/social-posts/contexto-do-cliente";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("o contexto do cliente de outro inquilino", () => {
  it("🔒 clientId de outro workspace não traz o briefing alheio — nem quando ele existe no banco", async () => {
    // O Client não é deste workspace: a busca corretamente não acha nada.
    db.client.findFirst.mockResolvedValue(null);
    // Mas o briefing (`clientRequestDb`) EXISTE, e é da agência B — é o que a
    // consulta antiga usava para vazar, porque procurava só por `clientId`.
    db.clientRequestDb.findFirst.mockResolvedValue({
      businessName: "Padaria da Agência B",
      segment: "alimentação",
      briefingJson: JSON.stringify({ scope: { targetAudience: "famílias do bairro" } }),
      services: JSON.stringify(["social media", "tráfego pago"]),
      objectives: JSON.stringify(["aumentar vendas do salão"]),
    });

    const ctx = await loadClientContext("cliente-da-agencia-B", "ws-agencia-A");

    expect(ctx, "a agência A recebeu o briefing da agência B").toBeNull();
    // ⛔ A segunda consulta nem deveria rodar — sem o `client` confirmado
    // deste workspace, não há prova nenhuma de que aquele `clientId` é seu.
    expect(
      db.clientRequestDb.findFirst,
      "buscou o briefing por clientId sem ter confirmado que o cliente é deste workspace",
    ).not.toHaveBeenCalled();
  });

  it("⛔ a busca do Client leva o workspace no WHERE", async () => {
    db.client.findFirst.mockResolvedValue(null);
    await loadClientContext("c1", "ws-A");

    const chamada: ConsultaClient | undefined = db.client.findFirst.mock.calls[0]?.[0];
    expect(chamada?.where, "a busca do cliente não levou o workspace de quem pergunta").toMatchObject({
      id: "c1",
      workspaceId: "ws-A",
    });
  });

  it("✅ o dono legítimo recebe o próprio contexto normalmente — a trava não vira parede", async () => {
    db.client.findFirst.mockResolvedValue({
      id: "c1",
      name: "Padaria da Agência A",
      industry: "alimentação",
      brandBrain: { tone: "caloroso", targetAudience: "famílias do bairro" },
    });
    db.clientRequestDb.findFirst.mockResolvedValue({
      businessName: "Padaria da Agência A",
      segment: "alimentação",
      briefingJson: JSON.stringify({ scope: {} }),
      services: JSON.stringify(["social media"]),
      objectives: JSON.stringify(["aumentar vendas"]),
    });

    const ctx = await loadClientContext("c1", "ws-A");

    expect(ctx).not.toBeNull();
    expect(ctx?.businessName).toBe("Padaria da Agência A");
    expect(ctx?.services).toEqual(["social media"]);
    expect(ctx?.objectives).toEqual(["aumentar vendas"]);
  });
});
