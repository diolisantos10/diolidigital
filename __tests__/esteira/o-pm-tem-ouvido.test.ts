// O PM AUTOMÁTICO NUNCA RESPONDEU UMA MENSAGEM — e ninguém sabia.
//
// ═══════════════════════════════════════════════════════════════════════════
// MEDIDO NA PRODUÇÃO EM 25/08/2026
// ═══════════════════════════════════════════════════════════════════════════
//
//   [despertador] pm-responde falhou: 5 mensagem(ns) sem resposta automática
//                 — aguardando gente
//
// A cada 5 minutos, para sempre. O relato do cliente oculto atribuiu isso ao
// departamento `client-service-sdr` estar em SOMBRA. **Não era.** A escada
// (`escadaFiltraEntregas`) não toca `pm-responde` em lugar nenhum do
// repositório — ela filtra ENTREGA, não mensagem de portal.
//
// A causa é mais simples e pior: `pm-responde.ts` pedia ao modelo
// *"responda APENAS com o texto da mensagem"* e lia a resposta assim:
//
//     const texto = r.ok && typeof r.data === "string" ? r.data.trim() : "";
//
// Mas `lib/ai/generate.ts` nunca devolve string no caminho do Claude: ele força
// `tool_choice` na ferramenta `responder` e devolve o INPUT dela — um OBJETO.
// `typeof {} === "string"` é falso, sempre. `texto` era "" em 100% das
// chamadas, e toda mensagem caía em `sem-ia`.
//
// E o disfarce era perfeito: "sem resposta automática — aguardando gente" se lê
// como "a IA está fora". No mesmo minuto do log acima, a MESMA camada de IA
// produzia arte com sucesso (`[arte] peça … recebeu arte … US$ 0.167`).
//
// Um humano releva e liga. Um agente de IA representando uma marca só sabe usar
// a porta — e a porta tinha alguém do outro lado que era estruturalmente
// incapaz de falar.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  portalMessage: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
  contentRequest: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const ia = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/ai/generate", () => ia);

import { responderMensagensDeClientes, textoDaResposta } from "@/lib/agency/esteira/pm-responde";

const PENDENTE = {
  id: "m1", clientId: "c1", clientRequestId: "cr1",
  body: "pode ser o pacote de 4",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.portalMessage.findMany.mockImplementation((args: { where: Record<string, unknown> }) =>
    Promise.resolve("readByTeam" in args.where ? [PENDENTE] : []));
  db.client.findUnique.mockResolvedValue({ id: "c1", name: "ANA TESTE", workspaceId: "ws1" });
  db.contentRequest.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("o leitor entende as três formas que a camada de IA devolve", () => {
  // ── A FORMA REAL DA PRODUÇÃO ────────────────────────────────────────────
  it("objeto da ferramenta `responder` — o caminho do Claude", () => {
    expect(textoDaResposta({ mensagem: "Fechado, o pacote de 4 está com a equipe." }))
      .toBe("Fechado, o pacote de 4 está com a equipe.");
  });

  it("string pura — os provedores que respondem texto", () => {
    expect(textoDaResposta("  Oi! Já anotei.  ")).toBe("Oi! Já anotei.");
  });

  it("outras chaves que provedores usam", () => {
    expect(textoDaResposta({ resposta: "a" })).toBe("a");
    expect(textoDaResposta({ reply: "b" })).toBe("b");
  });

  // NÃO INVENTA. Sem nada legível a mensagem fica na fila, para gente — que é
  // o comportamento correto e o único que já funcionava.
  it("nada legível NÃO vira resposta inventada", () => {
    expect(textoDaResposta(null)).toBe("");
    expect(textoDaResposta({ foo: 1 })).toBe("");
    expect(textoDaResposta({ mensagem: "   " })).toBe("");
  });
});

describe("o PM responde de verdade", () => {
  // MUTAÇÃO CONFERIDA: voltar `typeof r.data === "string" ? … : ""` deixa este
  // teste vermelho — e ele é o único que reproduz o defeito de produção.
  it("resposta em objeto vira mensagem no portal, e a do cliente vira lida", async () => {
    ia.generate.mockResolvedValue({ ok: true, data: { mensagem: "Anotado! O pacote de 4 já está com a equipe." } });

    const r = await responderMensagensDeClientes();

    expect(r.respondidas).toBe(1);
    expect(r.semIA).toBe(0);
    const escritas = db.$transaction.mock.calls[0]![0] as unknown[];
    expect(escritas).toHaveLength(2);
    expect(db.portalMessage.create.mock.calls[0]![0].data.body).toContain("pacote de 4");
    expect(db.portalMessage.create.mock.calls[0]![0].data.authorRole).toBe("team");
    // Marcar como lida é o que impede responder duas vezes.
    expect(db.portalMessage.update.mock.calls[0]![0].data.readByTeam).toBe(true);
  });

  it("o texto cru de uma resposta fora da ferramenta é resgatado, não jogado fora", async () => {
    // `generate` devolve ok:false COM `textoCru` quando o modelo escreveu prosa.
    // É uma resposta pronta; descartá-la é o mesmo defeito por outra porta.
    ia.generate.mockResolvedValue({ ok: false, error: "JSON inválido (Claude)", textoCru: "Oi! Recebi, já te falo." });

    const r = await responderMensagensDeClientes();
    expect(r.respondidas).toBe(1);
    expect(db.portalMessage.create.mock.calls[0]![0].data.body).toBe("Oi! Recebi, já te falo.");
  });

  it("IA de fato fora: a mensagem FICA na fila, não lida — nunca um 'recebemos!' falso", async () => {
    ia.generate.mockResolvedValue({ ok: false, error: "timeout" });

    const r = await responderMensagensDeClientes();
    expect(r.respondidas).toBe(0);
    expect(r.semIA).toBe(1);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("o prompt pede o objeto que a camada de IA de fato devolve", async () => {
    ia.generate.mockResolvedValue({ ok: true, data: { mensagem: "ok" } });
    await responderMensagensDeClientes();
    const sistema = ia.generate.mock.calls[0]![0].system as string;
    // A trava contra a regressão: prompt e leitor têm de falar do MESMO formato.
    expect(sistema).toContain('"mensagem"');
    expect(sistema).toContain("responder");
  });
});
