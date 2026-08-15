// PRODUZIR AS PEÇAS — com a conta na frente, e sem afrouxar nada.
//
// Ordem do CEO, 15/08/2026: *"produz as peças"* e, em seguida, *"deixe produzir
// mais peças"*. Ao medir o caminho, a parte PAGA da produção
// (`produzirArtesPendentes`) não tinha nenhuma porta de entrada fora do relógio
// interno do app — nem rota, nem workflow, nem script.
//
// O que estes testes travam, e por que cada um existe:
//
//   1. A rota nasce FECHADA: sem CRON_SECRET → 503; segredo errado → 401.
//      Rota que se abre sozinha quando a variável some é rota sem trava, e esta
//      GASTA DINHEIRO.
//   2. O padrão é LEITURA PURA: sem ?aplicar=1 nenhuma imagem é paga, nenhuma
//      peça é criada, e o relatório traz o NÚMERO e o CUSTO antes de qualquer
//      escrita.
//   3. ⭐ A conta bate, peça por peça: carrossel custa uma imagem POR TELA e
//      `story` custa mais que feed. Um número que subestima é pior que nenhum.
//   4. ⭐ O TETO é o menor entre o desta passada e o que sobra do dia — e é
//      fail-CLOSED: contador ilegível vira teto ZERO, nunca teto cheio.
//   5. O teto do dia NÃO foi afrouxado: `MAX_IMAGENS_POR_CLIENTE_POR_DIA`
//      continua 40 e este módulo o usa como piso do seu próprio teto padrão.
//   6. Nenhuma trava é pulada: pilar bloqueado, peça que desistiu, vídeo e
//      carrossel fora do formato NÃO recebem imagem — e cada um aparece com o
//      motivo, nunca em silêncio.
//   7. Sem navegador, a passada para ANTES de pagar a primeira imagem.
//   8. Sem autor ou sem motivo, `aplicar` não lê e não grava.
//   9. Nome ambíguo RECUSA — produzir para o cliente errado gasta o dinheiro
//      dele.
//  10. O portão de DIREÇÃO é lido e mostrado, e o botão não o pula.
//  11. A rodada de arte é RECORTADA no cliente: sem recorte, "produz as peças
//      da CityJobs" pagaria imagem de Foocci e Camila.
//  12. NÃO PUBLICA — e é o FONTE que prova, não um mock.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  project: { findMany: vi.fn(), findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  mediaAsset: { count: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const arte = vi.hoisted(() => ({ produzirArtesPendentes: vi.fn() }));
const renderizador = vi.hoisted(() => ({ renderizadorDisponivel: vi.fn() }));
const motor = vi.hoisted(() => ({ runProjectExecution: vi.fn() }));
const agendador = vi.hoisted(() => ({ agendarPostsDaEntrega: vi.fn() }));

vi.mock("@/lib/agency/execution/artes", async (original) => {
  const real = await original<typeof import("@/lib/agency/execution/artes")>();
  return { ...real, produzirArtesPendentes: arte.produzirArtesPendentes };
});
vi.mock("@/lib/agency/design/renderizar", async (original) => {
  const real = await original<typeof import("@/lib/agency/design/renderizar")>();
  return { ...real, renderizadorDisponivel: renderizador.renderizadorDisponivel };
});
vi.mock("@/lib/agency/execution/run-execution", () => ({
  runProjectExecution: motor.runProjectExecution,
}));
vi.mock("@/lib/agency/esteira/publicacao", async (original) => {
  const real = await original<typeof import("@/lib/agency/esteira/publicacao")>();
  return { ...real, agendarPostsDaEntrega: agendador.agendarPostsDaEntrega };
});

import { POST as produzirPelaRota } from "@/app/api/admin/produzir-pecas/route";
import {
  produzirAgora,
  motivoParaNaoReceberArte,
  portaoQueBarraAProducao,
  PRECO_DE_TABELA_USD,
  TETO_PADRAO_DA_PASSADA,
  TETO_MAXIMO_DA_PASSADA,
} from "@/lib/agency/execution/produzir-agora";
import { MAX_IMAGENS_POR_CLIENTE_POR_DIA } from "@/lib/agency/execution/artes";

const SEGREDO = "segredo-de-cron-para-teste";
const PEDIDO = { cliente: "CityJobs", autor: "Dioli (CEO)", motivo: "ordem do CEO: produzir as peças" };

function projeto(over: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    name: "CityJobs — social",
    workspaceId: "ws-1",
    clientRequestId: "req-1",
    directionApprovedAt: new Date("2026-08-01T10:00:00Z"),
    presentedAt: new Date("2026-08-02T10:00:00Z"),
    executionStatus: "done",
    executionAttempts: 0,
    agents: JSON.stringify(["social-media-strategist"]),
    ...over,
  };
}

function post(over: Record<string, unknown> = {}) {
  return {
    caption: "Trabalhar perto de casa é ganhar tempo de volta. Veja as vagas do Alto Tietê.",
    format: "feed",
    pillar: "Alto Tietê · Dica para candidato",
    lastError: null,
    scenesJson: null,
    ...over,
  };
}

/** O cenário-base: um cliente, um projeto com direção aprovada e ciclo escrito. */
function cenarioBase(): void {
  db.client.findMany.mockResolvedValue([{ id: "cli-1", name: "CityJobs" }]);
  db.project.findMany.mockResolvedValue([projeto()]);
  db.cycle.findFirst.mockResolvedValue({ id: "cyc-1", reference: "2026-08" });
  db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "social-media-strategist" }]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.mediaAsset.count.mockResolvedValue(0);
  db.activityEvent.create.mockResolvedValue({});
  renderizador.renderizadorDisponivel.mockResolvedValue({ disponivel: true, caminho: "/usr/bin/chromium" });
  arte.produzirArtesPendentes.mockResolvedValue({ produzidas: 0, falhas: [], desistiram: [], semOrcamento: [] });
  agendador.agendarPostsDaEntrega.mockResolvedValue({
    projectId: "proj-1", criados: 0, jaAgendadas: 0, naoInterpretadas: [], bloqueadasPorPilar: [], retidas: [],
  });
  motor.runProjectExecution.mockResolvedValue({ ok: true, status: "done", produced: [], askedClient: [], skipped: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  cenarioBase();
});

function chamar(query: string, token: string | null = SEGREDO): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return produzirPelaRota(
    new NextRequest(`https://x.test/api/admin/produzir-pecas?${query}`, { method: "POST", headers }),
  ) as unknown as Promise<Response>;
}

// ── 1. A ROTA NASCE FECHADA ─────────────────────────────────────────────────

describe("a porta", () => {
  it("sem CRON_SECRET no ambiente responde 503 — porta FECHADA, nunca aberta", async () => {
    delete process.env.CRON_SECRET;
    const r = await chamar("cliente=CityJobs");
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: expect.stringMatching(/não configurada|CRON_SECRET/i) });
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("com segredo errado responde 401 e não toca no banco", async () => {
    const r = await chamar("cliente=CityJobs", "segredo-errado");
    expect(r.status).toBe(401);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it("sem ?cliente recusa com 400 — a passada é de UM cliente por vez", async () => {
    const r = await chamar("");
    expect(r.status).toBe(400);
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
  });
});

// ── 2. LEITURA PURA É O PADRÃO ──────────────────────────────────────────────

describe("mostra antes de gastar", () => {
  it("sem ?aplicar=1 não paga imagem, não cria peça e não roda o motor", async () => {
    db.socialPost.findMany.mockResolvedValue([post(), post({ format: "story" })]);
    const r = await produzirAgora({ cliente: "CityJobs" });

    expect(r.situacao).toBe("so_medi");
    expect(r.feito).toBeUndefined();
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
    expect(agendador.agendarPostsDaEntrega).not.toHaveBeenCalled();
    expect(motor.runProjectExecution).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
    expect(r.veredito).toMatch(/NADA foi gravado/i);
  });

  it("a leitura pura já traz o NÚMERO de imagens e o CUSTO estimado", async () => {
    db.socialPost.findMany.mockResolvedValue([post(), post()]);
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.imagensPedidas).toBe(2);
    expect(r.custo.estimadoUsd).toBeCloseTo(2 * PRECO_DE_TABELA_USD.quadrada, 2);
    // O rótulo de estimativa acompanha o número em todo lugar. Chamar tabela de
    // fatura é como se inventa dado.
    expect(r.custo.fonte).toMatch(/estimativa/i);
    expect(r.custo.fonte).toMatch(/NÃO é fatura/i);
  });
});

// ── 3. A CONTA BATE, PEÇA POR PEÇA ──────────────────────────────────────────

describe("a conta", () => {
  it("carrossel custa UMA imagem POR TELA", async () => {
    db.socialPost.findMany.mockResolvedValue([
      post({ format: "carousel", scenesJson: JSON.stringify(["a", "b", "c", "d"]) }),
    ]);
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.imagensPedidas).toBe(4);
    expect(r.pecasSemArte[0]!.imagens).toBe(4);
    expect(r.pecasSemArte[0]!.custoUsd).toBeCloseTo(4 * PRECO_DE_TABELA_USD.quadrada, 2);
  });

  it("story sai em retrato e custa mais que feed — o preço segue o formato real", async () => {
    db.socialPost.findMany.mockResolvedValue([post({ format: "story" })]);
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.pecasSemArte[0]!.proporcao).toBe("retrato");
    expect(PRECO_DE_TABELA_USD.retrato).toBeGreaterThan(PRECO_DE_TABELA_USD.quadrada);
    expect(r.pecasSemArte[0]!.custoUsd).toBeCloseTo(PRECO_DE_TABELA_USD.retrato, 2);
  });

  it("`seTudoSaisseUsd` nunca é menor que o estimado — o pior caso é o teto de cima", async () => {
    db.socialPost.findMany.mockResolvedValue(Array.from({ length: 12 }, () => post()));
    const r = await produzirAgora({ cliente: "CityJobs", teto: 3 });
    expect(r.custo.seTudoSaisseUsd).toBeGreaterThanOrEqual(r.custo.estimadoUsd);
    // O estimado é o que CABE no teto, não a soma da fila.
    expect(r.custo.estimadoUsd).toBeCloseTo(3 * PRECO_DE_TABELA_USD.quadrada, 2);
  });
});

// ── 4 e 5. O TETO ───────────────────────────────────────────────────────────

describe("o teto", () => {
  it("o efetivo é o MENOR entre o desta passada e o que sobra do dia", async () => {
    db.mediaAsset.count.mockResolvedValue(35); // já gastou 35 de 40 hoje
    const r = await produzirAgora({ cliente: "CityJobs", teto: 40 });
    expect(r.teto.restamHoje).toBe(5);
    expect(r.teto.efetivo).toBe(5);
  });

  it("contador do dia ilegível vira teto ZERO — fail-CLOSED, nunca teto cheio", async () => {
    db.mediaAsset.count.mockRejectedValue(new Error("banco tossiu"));
    const r = await produzirAgora({ cliente: "CityJobs", teto: 40 });
    expect(r.teto.restamHoje).toBe(0);
    expect(r.teto.efetivo).toBe(0);
  });

  it("teto pedido acima do máximo é aparado, não obedecido", async () => {
    const r = await produzirAgora({ cliente: "CityJobs", teto: 10_000 });
    expect(r.teto.daPassada).toBe(TETO_MAXIMO_DA_PASSADA);
  });

  it("o teto DIÁRIO de segurança da casa não foi afrouxado", () => {
    // Se alguém subir o 40 de `artes.ts` para "deixar produzir mais", este teste
    // fica vermelho e a conversa acontece antes da fatura.
    expect(MAX_IMAGENS_POR_CLIENTE_POR_DIA).toBe(40);
    // E o padrão desta passada nunca é mais estreito que ele: este botão não
    // pode ser o freio, senão "deixe produzir mais" viraria mentira.
    expect(TETO_PADRAO_DA_PASSADA).toBe(MAX_IMAGENS_POR_CLIENTE_POR_DIA);
  });

  it("o teto para o laço: com 3 de teto, o laço não passa de 3 imagens", async () => {
    db.socialPost.findMany.mockResolvedValue(Array.from({ length: 20 }, () => post()));
    arte.produzirArtesPendentes.mockResolvedValue({ produzidas: 2, falhas: [], desistiram: [], semOrcamento: [] });
    const r = await produzirAgora({ ...PEDIDO, teto: 3, aplicar: true });
    expect(r.feito!.imagensProduzidas).toBeLessThanOrEqual(4); // 2 rodadas de 2
    expect(arte.produzirArtesPendentes.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("rodada sem progresso PARA o laço — fila que não anda não vira laço infinito", async () => {
    db.socialPost.findMany.mockResolvedValue(Array.from({ length: 20 }, () => post()));
    arte.produzirArtesPendentes.mockResolvedValue({ produzidas: 0, falhas: [], desistiram: ["p1"], semOrcamento: [] });
    await produzirAgora({ ...PEDIDO, teto: 40, aplicar: true });
    expect(arte.produzirArtesPendentes).toHaveBeenCalledTimes(1);
  });
});

// ── 6. NENHUMA TRAVA É PULADA ───────────────────────────────────────────────

describe("as travas continuam de pé", () => {
  it("vídeo não gera imagem paga — a casa EDITA o material do cliente", () => {
    const motivo = motivoParaNaoReceberArte(post({ format: "reel" }));
    expect(motivo).toMatch(/vídeo/i);
  });

  it("peça que já desistiu não ganha mais uma tentativa paga", () => {
    const motivo = motivoParaNaoReceberArte(post({ lastError: "[arte 3/3] o gerador caiu" }));
    expect(motivo).toMatch(/desistiu/i);
  });

  it("carrossel acima do teto de telas é recusado ANTES de qualquer chamada", () => {
    const motivo = motivoParaNaoReceberArte(
      post({ format: "carousel", scenesJson: JSON.stringify(["a", "b", "c", "d", "e", "f", "g", "h"]) }),
    );
    expect(motivo).toMatch(/teto é 6/);
  });

  it("carrossel sem telas descritas não vira imagem", () => {
    const motivo = motivoParaNaoReceberArte(post({ format: "carousel", scenesJson: "[]" }));
    expect(motivo).toMatch(/sem telas/i);
  });

  it("peça barrada aparece na lista COM o motivo, nunca em silêncio", async () => {
    db.socialPost.findMany.mockResolvedValue([post({ format: "reel" }), post()]);
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.pecasSemArte).toHaveLength(1);
    expect(r.pecasParadas).toHaveLength(1);
    expect(r.pecasParadas[0]!.motivo).toBeTruthy();
    // E ela não entra na conta: prometer imagem que a produção recusa é o
    // número que mente.
    expect(r.imagensPedidas).toBe(1);
  });
});

// ── 7. SEM NAVEGADOR, ZERO GASTO ────────────────────────────────────────────

describe("o dinheiro não sai sem molde", () => {
  it("sem Chromium a passada para ANTES de pagar a primeira imagem", async () => {
    renderizador.renderizadorDisponivel.mockResolvedValue({ disponivel: false, caminho: null });
    db.socialPost.findMany.mockResolvedValue([post(), post()]);
    const r = await produzirAgora({ ...PEDIDO, aplicar: true });
    expect(r.situacao).toBe("sem_renderizador");
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
    expect(motor.runProjectExecution).not.toHaveBeenCalled();
    expect(agendador.agendarPostsDaEntrega).not.toHaveBeenCalled();
  });

  it("a leitura pura avisa do navegador ausente antes de alguém apertar", async () => {
    renderizador.renderizadorDisponivel.mockResolvedValue({ disponivel: false, caminho: null });
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.renderizador.disponivel).toBe(false);
    expect(r.veredito).toMatch(/SEM NAVEGADOR/i);
  });
});

// ── 8 e 9. AUTOR, MOTIVO E NOME ─────────────────────────────────────────────

describe("quem mandou, e para quem", () => {
  it("aplicar sem autor não lê nem grava", async () => {
    const r = await produzirAgora({ cliente: "CityJobs", motivo: "porque sim", aplicar: true });
    expect(r.situacao).toBe("sem_autor");
    expect(db.client.findMany).not.toHaveBeenCalled();
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("aplicar sem motivo não lê nem grava", async () => {
    const r = await produzirAgora({ cliente: "CityJobs", autor: "Dioli", aplicar: true });
    expect(r.situacao).toBe("sem_motivo");
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it("nome que casa com DOIS clientes recusa — não se gasta o dinheiro do errado", async () => {
    db.client.findMany.mockResolvedValue([
      { id: "a", name: "Camila Pereira" },
      { id: "b", name: "Camila Pereira Estética" },
    ]);
    const r = await produzirAgora({ ...PEDIDO, cliente: "Camila", aplicar: true });
    expect(r.situacao).toBe("nome_ambiguo");
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("cliente inexistente recusa sem gastar", async () => {
    db.client.findMany.mockResolvedValue([]);
    const r = await produzirAgora({ ...PEDIDO, cliente: "Fantasma", aplicar: true });
    expect(r.situacao).toBe("cliente_nao_existe");
    expect(arte.produzirArtesPendentes).not.toHaveBeenCalled();
  });

  it("aplicar deixa RASTRO: ActivityEvent com autor e motivo", async () => {
    await produzirAgora({ ...PEDIDO, aplicar: true });
    expect(db.activityEvent.create).toHaveBeenCalled();
    const msg = db.activityEvent.create.mock.calls[0]![0].data.message as string;
    expect(msg).toContain("Dioli (CEO)");
    expect(msg).toContain("ordem do CEO");
    expect(msg).toMatch(/Nada foi publicado/i);
  });
});

// ── 10. O PORTÃO DE DIREÇÃO ─────────────────────────────────────────────────

describe("o portão de direção", () => {
  it("projeto sem direção aprovada aparece com o portão nomeado", async () => {
    db.project.findMany.mockResolvedValue([projeto({ directionApprovedAt: null })]);
    const r = await produzirAgora({ cliente: "CityJobs" });
    expect(r.projetos[0]!.portao).toMatch(/direção/i);
  });

  it("e a passada NÃO chama o motor nesse projeto — o botão não pula o portão", async () => {
    db.project.findMany.mockResolvedValue([
      projeto({ directionApprovedAt: null, executionStatus: "pending", agents: JSON.stringify(["x"]) }),
    ]);
    db.deliverable.findMany.mockResolvedValue([]);
    await produzirAgora({ ...PEDIDO, aplicar: true });
    expect(motor.runProjectExecution).not.toHaveBeenCalled();
  });

  it("projeto sem solicitação vinculada também é barrado", () => {
    expect(portaoQueBarraAProducao({ clientRequestId: null, directionApprovedAt: new Date(), executionAttempts: 0 }))
      .toMatch(/sem solicitação/i);
  });

  it("com direção aprovada e especialista faltando, o motor É chamado", async () => {
    db.project.findMany.mockResolvedValue([projeto({ agents: JSON.stringify(["a", "b"]) })]);
    db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "a" }]);
    await produzirAgora({ ...PEDIDO, aplicar: true });
    expect(motor.runProjectExecution).toHaveBeenCalledWith("proj-1");
  });

  it("ciclo já escrito e nada pendente: o motor NÃO é chamado — leitura de contexto custa", async () => {
    db.project.findMany.mockResolvedValue([projeto({ agents: JSON.stringify(["a"]), executionStatus: "done" })]);
    db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "a" }]);
    await produzirAgora({ ...PEDIDO, aplicar: true });
    expect(motor.runProjectExecution).not.toHaveBeenCalled();
  });
});

// ── 11. O RECORTE POR CLIENTE ───────────────────────────────────────────────

describe("a rodada de arte é recortada NESTE cliente", () => {
  it("a chamada leva o clientId — sem isso, produzir a CityJobs pagaria imagem dos outros", async () => {
    db.socialPost.findMany.mockResolvedValue([post()]);
    arte.produzirArtesPendentes.mockResolvedValue({ produzidas: 1, falhas: [], desistiram: [], semOrcamento: [] });
    await produzirAgora({ ...PEDIDO, teto: 1, aplicar: true });
    expect(arte.produzirArtesPendentes).toHaveBeenCalledWith({ clientId: "cli-1" });
  });

  it("o recorte é OPCIONAL: sem ele a rodada continua sendo a de sempre", async () => {
    // Prova pelo FONTE: o `where` só ganha `clientId` quando o recorte existe.
    const fonte = readFileSync(join(process.cwd(), "lib/agency/execution/artes.ts"), "utf8");
    expect(fonte).toMatch(/recorte\.clientId \? \{ clientId: recorte\.clientId \} : \{\}/);
    // E o despertador continua chamando sem argumento — o comportamento de
    // sempre não mudou.
    const relogio = readFileSync(join(process.cwd(), "lib/agency/despertador.ts"), "utf8");
    expect(relogio).toMatch(/produzirArtesPendentes\(\)/);
  });
});

// ── 12. NÃO PUBLICA — PROVADO PELO FONTE ────────────────────────────────────

describe("nada publica", () => {
  const arquivos = [
    "lib/agency/execution/produzir-agora.ts",
    "app/api/admin/produzir-pecas/route.ts",
  ];

  it("nenhum dos arquivos novos importa ou nomeia caminho de publicação", () => {
    // Mock não prova ausência de caminho que nem foi importado. O FONTE prova.
    for (const caminho of arquivos) {
      const bruto = readFileSync(join(process.cwd(), caminho), "utf8");
      // Tira comentários: eles FALAM de publicação de propósito, para dizer que
      // não publicam.
      const codigo = bruto
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      for (const proibido of ["publishPost", "graph.facebook", "publicarAgendados", "trava-de-publicacao", "PUBLICACAO_ORGANICA", "aprovarPacote", "updateApprovalStatus"]) {
        expect(codigo, `${caminho} não pode conter ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("o workflow diz, no próprio texto, que a peça nasce em rascunho", () => {
    const yml = readFileSync(join(process.cwd(), ".github/workflows/produzir-pecas.yml"), "utf8");
    expect(yml).toMatch(/RASCUNHO/);
    expect(yml).toMatch(/nenhuma plataforma foi chamada/i);
    expect(yml).toMatch(/Meta, Google ou TikTok/i);
    // O teto aparece no botão, para poder subir.
    expect(yml).toMatch(/Teto de IMAGENS desta passada/);
  });
});
