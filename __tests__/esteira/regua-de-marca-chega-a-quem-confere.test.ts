// A RÉGUA DE MARCA CHEGA A QUEM CONFERE A PEÇA.
//
// Ordem do CEO (15/08/2026): *"as proibições e as referências do cliente já
// chegam a QUEM PRODUZ. Falta chegarem também a QUEM CONFERE. Conferente sem
// régua não confere — aprova."*
//
// ── QUEM É "QUEM CONFERE" NESTE CÓDIGO ─────────────────────────────────────
//
// `auditDeliverable` (`lib/agency/execution/quality-auditor.ts:166`). Ela tem um
// parâmetro chamado `brandContext`, e é literalmente o que o árbitro lê antes de
// aprovar ou reprovar. Quem a chama, e o que cada um passava, medido em 15/08:
//
//   • `run-execution.ts:737`      → `ctxBlock`, que ABRE com `contratoDeMarca` ✅
//   • `producao-de-pedido.ts:356` → `ctxBlock` idem                            ✅
//   • `pacote-travado.ts:250`     → negócio, segmento, serviços, objetivos.
//                                   **Zero proibição. Zero voz. Zero
//                                   referência.**                             ❌
//   • `mes.ts:529`                → relatório mensal, contexto próprio         ❌
//
// ── POR QUE O BURACO DO `pacote-travado` ERA O PIOR DOS DOIS ───────────────
//
// Ele é o caminho da peça que a Qualidade JÁ REPROVOU uma vez. O especialista
// refazia COM as proibições na mão (`verdade.proibicoes`) e o árbitro julgava a
// peça refeita SEM elas. Ou seja: a peça podia voltar violando exatamente o que
// o cliente proibiu e ser aprovada na segunda passada — com aparência de peça
// auditada DUAS vezes, que é pior do que uma peça nunca auditada.
//
// ── O QUE ESTE TESTE PROVA, e por que não mocka `contratoDeMarca` ──────────
//
// Dublar `contratoDeMarca` provaria o dublê. Aqui são dubladas as FONTES (ficha,
// proibições, material) e o contrato de verdade roda — então o que se mede é a
// proibição REAL do cliente aparecendo no texto que o árbitro recebe.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  deliverable: { findMany: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
  client: { findUnique: vi.fn() },
  brainArtifact: {
    findFirst: vi.fn<(...a: unknown[]) => Promise<unknown>>(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({})),
  },
}));
const generate = vi.hoisted(() => vi.fn());
const auditDeliverable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/execution/quality-auditor", async (original) => ({
  ...(await original<typeof import("@/lib/agency/execution/quality-auditor")>()),
  auditDeliverable,
}));

/** As FONTES do contrato. O contrato em si roda de verdade. */
const ficha = vi.hoisted(() => ({ lerFichaDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/ficha-de-marca", () => ficha);
const material = vi.hoisted(() => ({ materiaisDeMarca: vi.fn() }));
vi.mock("@/lib/agency/esteira/material-do-drive", () => material);

import { destravarPacote } from "@/lib/agency/esteira/pacote-travado";

/** A proibição que o cliente disse em voz alta. Ela tem de aparecer no texto que
 *  o ÁRBITRO lê — é a prova inteira deste arquivo. */
const PROIBICAO = "nunca usar a palavra 'imperdível'";
/** A referência declarada pelo cliente, o outro item que o CEO nomeou. */
const REFERENCIA = "o post de aniversário de 2024, sóbrio e sem emoji";

const projeto = { id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1", presentedAt: null };
const reprovada = {
  id: "d1", name: "Plano de Medição", content: "conteúdo fraco", ownerAgentId: "a5",
  lastFeedback: "operacionalização fraca", version: 1,
};

function fichaComRegua() {
  return {
    clientId: "c1",
    campos: [
      { campo: "voz", rotulo: "Voz", estado: "definido", valor: "direta, sem superlativo", pergunta: null, metadesQueFaltam: [] },
      { campo: "referencias", rotulo: "Referências", estado: "definido", valor: REFERENCIA, pergunta: null, metadesQueFaltam: [] },
    ],
    definidos: 2,
    lacunas: [],
    naoConstituida: false,
    oQueFaltaParaPublicar: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findUnique.mockResolvedValue({ ...projeto });
  db.project.update.mockResolvedValue({});
  db.deliverable.findMany.mockResolvedValue([{ ...reprovada }]);
  db.deliverable.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "Cliente De Teste" });
  db.client.findUnique.mockResolvedValue({ phone: null, email: null });
  db.activityEvent.create.mockResolvedValue({});
  // A gaveta de proibições é lida por `lerProibicoes`, que fala com
  // `brainArtifact`. Devolvemos o artefato real que ela sabe ler.
  db.brainArtifact.findFirst.mockResolvedValue({
    canvasJson: JSON.stringify({ itens: [{ frase: PROIBICAO, termos: ["imperdível"] }] }),
  });
  ficha.lerFichaDeMarca.mockResolvedValue(fichaComRegua());
  material.materiaisDeMarca.mockResolvedValue([]);
  generate.mockResolvedValue({
    ok: true,
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

/** O que o árbitro leu de verdade. */
function contextoDoArbitro(): string {
  const chamada = auditDeliverable.mock.calls[0]?.[0];
  expect(chamada, "o árbitro nem foi chamado — o teste mediria o vazio").toBeTruthy();
  return chamada.brandContext as string;
}

describe("o árbitro da peça REFEITA recebe a régua de marca", () => {
  it("✅ as PROIBIÇÕES do cliente chegam a quem confere", async () => {
    await destravarPacote("p1");
    expect(
      contextoDoArbitro(),
      "o conferente julgou a peça refeita sem saber o que o cliente proibiu",
    ).toContain(PROIBICAO);
  });

  it("✅ as REFERÊNCIAS do cliente chegam a quem confere", async () => {
    await destravarPacote("p1");
    expect(contextoDoArbitro()).toContain(REFERENCIA);
  });

  it("a régua vem PRIMEIRO — a ordem é a mensagem, como em ctxBlock", async () => {
    await destravarPacote("p1");
    const ctx = contextoDoArbitro();
    expect(ctx.indexOf(PROIBICAO)).toBeLessThan(ctx.indexOf("Negócio:"));
  });

  it("é o MESMO emissor que serve quem produz — não um segundo caminho", async () => {
    // Se alguém reescrever a régua à mão aqui, ela diverge da que o produtor
    // recebe e os dois passam a trabalhar certo discordando. O bloco `NUNCA` é
    // formato de `contratoDeMarca`, e só dele.
    await destravarPacote("p1");
    expect(contextoDoArbitro()).toContain("NUNCA");
  });

  it("o contexto de sempre NÃO se perdeu — a régua foi somada, não trocada", async () => {
    await destravarPacote("p1");
    expect(contextoDoArbitro()).toContain("Negócio: Cliente De Teste");
  });
});

describe("a régua é INSUMO do juiz, não portão — falha nela não trava o destravamento", () => {
  it("⚠️ ficha ilegível: o pacote continua sendo destravado, sem régua e sem crash", async () => {
    ficha.lerFichaDeMarca.mockRejectedValue(new Error("banco fora do ar"));

    const r = await destravarPacote("p1");

    // Fail-SAFE aqui, e é deliberado: o portão que barra a entrega é outro
    // (`escadaFiltraEntregas`). Travar o destravamento de um pacote JÁ parado
    // por não conseguir ler a régua trocaria um problema por outro maior.
    expect(r.corrigidas).toHaveLength(1);
    expect(contextoDoArbitro()).toContain("Negócio: Cliente De Teste");
  });
});
