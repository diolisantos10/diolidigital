import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
  // O cliente e a gaveta das PROIBIÇÕES. Desde 15/08 este caminho tem PISO DE
  // VERDADE — era o único dos quatro motores que refazia peça sem conferir dado
  // inventado, justamente o caminho de CONSERTO. Gaveta vazia = "este cliente
  // não proibiu nada", que é o caso limpo; leitura que FALHA reprova a peça, e
  // isso é fail-closed de propósito.
  client: { findUnique: vi.fn() },
  brainArtifact: { findFirst: vi.fn(() => Promise.resolve(null)), create: vi.fn(() => Promise.resolve({})) },
}));
const generate = vi.hoisted(() => vi.fn());
const auditDeliverable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
// O árbitro é mockado, o TRADUTOR não: `revisionStatusDoVeredito` é o único
// ponto que converte veredito em estado de banco, e testar contra o real é o
// que impede o mapeamento de voltar a ser string escrita à mão.
vi.mock("@/lib/agency/execution/quality-auditor", async (original) => ({
  ...(await original<typeof import("@/lib/agency/execution/quality-auditor")>()),
  auditDeliverable,
}));

import { destravarPacote, pacotesTravados, MAX_TENTATIVAS_DE_REFAZER } from "@/lib/agency/esteira/pacote-travado";

const projeto = { id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1", presentedAt: null };
const reprovada = {
  id: "d1", name: "Plano de Medição", content: "conteúdo fraco", ownerAgentId: "a5",
  lastFeedback: "operacionalização fraca, nomenclatura imprecisa", version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({ ...projeto });
  db.project.update.mockResolvedValue({});
  db.deliverable.findMany.mockResolvedValue([{ ...reprovada }]);
  db.deliverable.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Dioli Digital Studio" });
  db.client.findUnique.mockResolvedValue({ phone: null, email: null });
  db.activityEvent.create.mockResolvedValue({});
  generate.mockResolvedValue({
    ok: true,
    // TRÊS indicadores: é o que o contrato de `a5` exige (3 a 8). O fixture
    // tinha UM e passava porque este caminho não conferia o contrato de saída —
    // a peça podia voltar do conserto com um terço do que tinha.
    data: {
      title: "Plano de Medição v2",
      summary: "Agora com fontes e cadência definidas.",
      items: [
        { headline: "Alcance", note: "medido no Instagram, semanal" },
        { headline: "Salvamentos", note: "medido no Instagram, semanal" },
        { headline: "Mensagens recebidas", note: "medido na caixa de entrada, semanal" },
      ],
    },
  });
  auditDeliverable.mockResolvedValue({ verdict: "aprovado", issues: [], note: "ficou boa" });
});

const statusGravado = () => db.deliverable.update.mock.calls[0]?.[0].data.revisionStatus;

describe("a agência refaz sozinha o que ela mesma reprovou", () => {
  it("refaz a entrega com a crítica da Qualidade na mão", async () => {
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(1);
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt, "o especialista precisa saber o que foi apontado").toContain("operacionalização fraca");
  });
});

// ── A PORTA DOS FUNDOS DO ÁRBITRO (achado da 5ª auditoria, 04/08/2026) ───────
//
// Este arquivo gravava `quality_ok` à mão na peça refeita, confiando numa
// "próxima auditoria" que NÃO EXISTE neste caminho — `auditDeliverable` só roda
// dentro de `run-execution`, e o motor é idempotente. Resultado: peça reprovada
// pela Qualidade voltava a "aprovada" sem juiz, e `apresentar` (que só barra
// `quality_flag`) a mandava ao cliente.
describe("a peça refeita PASSA POR ÁRBITRO antes de voltar a ser 'boa'", () => {
  it("reauditar não é opcional: o árbitro é chamado com o texto NOVO", async () => {
    await destravarPacote("p1");
    expect(auditDeliverable).toHaveBeenCalledTimes(1);
    const pedido = auditDeliverable.mock.calls[0]![0];
    expect(pedido.content, "auditar o texto velho seria auditoria de fachada").toContain("fontes e cadência");
    expect(pedido.title).toBe("Plano de Medição v2");
  });

  it("METADE 1 — árbitro APROVOU → aí sim vira `quality_ok` e conta como corrigida", async () => {
    const r = await destravarPacote("p1");
    expect(statusGravado()).toBe("quality_ok");
    expect(r.corrigidas).toHaveLength(1);
    expect(r.reprovadasDeNovo).toHaveLength(0);
  });

  it("METADE 2 — árbitro REPROVOU de novo → NÃO sai como aprovada, segue barrada", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "reprovado", issues: ["ainda promete resultado"], note: "" });
    const r = await destravarPacote("p1");
    expect(statusGravado(), "aprovação sem juiz é a porta dos fundos").not.toBe("quality_ok");
    expect(statusGravado()).toBe("quality_flag");
    expect(r.corrigidas, "nada 'corrigido' sem árbitro dizendo que sim").toHaveLength(0);
    expect(r.reprovadasDeNovo).toEqual(["Plano de Medição"]);
  });

  it("METADE 3 — árbitro INDISPONÍVEL não absolve: a reprovação anterior continua valendo", async () => {
    // A regra "indisponibilidade não bloqueia" vale para peça que nunca teve
    // juiz. Aqui a única opinião que existiu diz REPROVADA — e ausência de
    // parecer novo não derruba parecer velho.
    auditDeliverable.mockResolvedValue({ verdict: "nao_auditado", issues: [], note: "NÃO AUDITADA: a IA caiu.", motivo: "ia_indisponivel" });
    const r = await destravarPacote("p1");
    expect(statusGravado()).toBe("quality_flag");
    expect(r.corrigidas).toHaveLength(0);
    expect(r.semArbitro).toEqual(["Plano de Medição"]);
  });

  it("a peça segue barrada e por isso continua VISÍVEL como travada — nada some", async () => {
    // `pacotesTravados` procura `quality_flag`. Se a reprovada refeita virasse
    // `quality_ok` ou `quality_nao_auditado`, ela sairia da lista do Diretor
    // sem ninguém ter decidido nada.
    auditDeliverable.mockResolvedValue({ verdict: "reprovado", issues: ["x"], note: "" });
    await destravarPacote("p1");
    expect(db.deliverable.update.mock.calls[0]![0].data.version).toEqual({ increment: 1 });
    expect(statusGravado(), "continua no radar do teto de tentativas").toBe("quality_flag");
  });

  it("o parecer do árbitro fica escrito na peça — 'por que barrou' precisa ser respondível", async () => {
    auditDeliverable.mockResolvedValue({ verdict: "reprovado", issues: ["número sem fonte"], note: "" });
    await destravarPacote("p1");
    expect(db.deliverable.update.mock.calls[0]![0].data.lastFeedback).toContain("número sem fonte");
  });

  it("o especialista refeito é proibido de inventar para preencher", async () => {
    await destravarPacote("p1");
    expect(generate.mock.calls[0]![0].user as string).toContain("PRECISO CONFIRMAR");
  });
});

describe("quando refazer não resolve, vira decisão do Diretor", () => {
  it("esgotou as tentativas → escala e registra no banco", async () => {
    db.deliverable.findMany.mockResolvedValue([{ ...reprovada, version: MAX_TENTATIVAS_DE_REFAZER + 1 }]);
    const r = await destravarPacote("p1");
    expect(r.escalado).toBe(true);
    expect(generate, "não gasta IA depois do teto").not.toHaveBeenCalled();
    expect(db.activityEvent.create.mock.calls[0]![0].data.type).toBe("pacote_travado_escalado");
  });

  it("IA fora do ar NÃO gasta tentativa — o problema não é da peça", async () => {
    generate.mockResolvedValue({ ok: false, error: "timeout" });
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(0);
    expect(db.deliverable.update, "a peça fica como está para a próxima passada").not.toHaveBeenCalled();
  });
});

describe("o que o destravamento nunca toca", () => {
  it("pacote já apresentado ao cliente → não mexe", async () => {
    db.project.findUnique.mockResolvedValue({ ...projeto, presentedAt: new Date() });
    const r = await destravarPacote("p1");
    expect(r.corrigidas).toHaveLength(0);
    expect(db.deliverable.findMany).not.toHaveBeenCalled();
  });

  it("nenhuma entrega reprovada → sai limpo", async () => {
    db.deliverable.findMany.mockResolvedValue([]);
    const r = await destravarPacote("p1");
    expect(r.escalado).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("o painel do Diretor sabe quem espera por ele", () => {
  it("separa o que a máquina ainda resolve do que precisa de gente", async () => {
    db.project.findMany.mockResolvedValue([
      { id: "p1", name: "A", clientId: "c1", updatedAt: new Date(), deliverables: [{ id: "d1", name: "X", lastFeedback: "", version: 1 }] },
      { id: "p2", name: "B", clientId: "c2", updatedAt: new Date(), deliverables: [{ id: "d2", name: "Y", lastFeedback: "", version: MAX_TENTATIVAS_DE_REFAZER + 1 }] },
    ]);
    const r = await pacotesTravados("ws1");
    expect(r.find((p) => p.projectId === "p1")!.esperandoDecisao).toBe(false);
    expect(r.find((p) => p.projectId === "p2")!.esperandoDecisao).toBe(true);
  });
});
