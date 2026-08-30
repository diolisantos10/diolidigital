// OS TRÊS EMPURRÕES À MÃO — o teste que prova que a esteira anda sem eles.
//
// Case Farol 27, produção, 24/08/2026: a cadeia andou do pedido à entrega, mas
// só porque uma pessoa empurrou três vezes.
//
//   1. o projeto nasce `idle` e nenhum relógio o liga;
//   2. o botão "aprovar direção" não existe na tela (dependia de a etapa CONTER
//      a frase "confirme o caminho");
//   3. cinco pedidos de material nunca foram enviados — e a esteira cobrava a
//      resposta deles; um deles pedia captura de tela de app A UMA PADARIA.
//
// Cada bloco abaixo primeiro RECRIA o estado exato em que o empurrão foi
// preciso, e depois exige o comportamento novo.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..", "..");
const fonte = (p: string) => readFileSync(join(raiz, p), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// EMPURRÃO 1 — o projeto nasce `idle` e ninguém o liga
// ═══════════════════════════════════════════════════════════════════════════

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  activityEvent: { create: vi.fn(), findFirst: vi.fn() },
  materialRequest: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const portao = vi.hoisted(() => ({ conferirPagamento: vi.fn() }));
vi.mock("@/lib/agency/financeiro/portao-de-pagamento", () => portao);

const marcos = vi.hoisted(() => ({ pedirDirecao: vi.fn() }));
vi.mock("@/lib/agency/esteira/marcos", () => marcos);

import { ligarProjetosParados } from "@/lib/agency/esteira/ligar-projeto";
import { lerFase, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";
import {
  lerSinaisDoCliente,
  materiaisAPedir,
  coletarMaterialDeProduto,
} from "@/lib/agency/esteira/material-de-produto";

/** O projeto do case: aceito pelo cliente, nascido `idle`. */
const PARADO = {
  id: "p1",
  workspaceId: "w1",
  clientId: "c1",
  clientRequestId: "cr1",
  directionApprovedAt: null as Date | null,
  name: "Reposicionamento Farol 27",
};

const LIBERADO = { liberado: true, motivo: "pagamento_confirmado", detalhe: "R$ 3.100" };
const SEM_PAGAMENTO = {
  liberado: false,
  motivo: "sem_registro_de_pagamento",
  detalhe: "nenhuma linha em PagamentoConfirmado",
  mensagemAoCliente: "Este projeto está aguardando o pagamento. A produção começa assim que o pagamento for confirmado.",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([PARADO]);
  db.project.updateMany.mockResolvedValue({ count: 1 });
  db.project.findUnique.mockResolvedValue({ client: { name: "Farol 27 — Padaria & Café" } });
  db.portalMessage.create.mockResolvedValue({ id: "pm1" });
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.activityEvent.create.mockResolvedValue({ id: "ae1" });
  db.activityEvent.findFirst.mockResolvedValue(null);
  db.materialRequest.findFirst.mockResolvedValue(null);
  db.materialRequest.create.mockImplementation(() => Promise.resolve({ id: `mr${Math.random()}` }));
  db.materialRequest.findMany.mockResolvedValue([]);
  db.materialRequest.updateMany.mockResolvedValue({ count: 1 });
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  marcos.pedirDirecao.mockResolvedValue({ ok: true, avisouCliente: true });
  portao.conferirPagamento.mockResolvedValue(LIBERADO);
});

describe("empurrão 1 — o projeto sai de `idle` sozinho", () => {
  it("pago e com a direção avalizada: entra na fila de produção sem ninguém apertar", async () => {
    db.project.findMany.mockResolvedValue([{ ...PARADO, directionApprovedAt: new Date("2026-08-24T22:14:00Z") }]);

    const r = await ligarProjetosParados(new Date("2026-08-25T10:00:00Z"));

    expect(r.ligados).toBe(1);
    expect(r.desfechos[0]).toEqual({ projectId: "p1", desfecho: "ligado" });

    const escrita = db.project.updateMany.mock.calls[0]![0];
    expect(escrita.data.executionStatus).toBe("pending");
    // O estado esperado vai no WHERE: quem já tirou o projeto de `idle` ganha.
    expect(escrita.where.executionStatus).toBe("idle");
    // Tentativas gastas esperando pagamento/aval não são defeito do projeto.
    expect(escrita.data.executionAttempts).toBe(0);
  });

  it("a varredura procura EXATAMENTE o estado que ninguém olhava: `idle`", async () => {
    await ligarProjetosParados();
    expect(db.project.findMany.mock.calls[0]![0].where.executionStatus).toBe("idle");
  });

  // ── A TRAVA DE PAGAMENTO (D-0A7), QUE É O QUE EVITA O DESASTRE ────────────
  it("SEM pagamento confirmado NÃO entra em produção — nada é enfileirado", async () => {
    portao.conferirPagamento.mockResolvedValue(SEM_PAGAMENTO);

    const r = await ligarProjetosParados();

    expect(r.ligados).toBe(0);
    expect(r.aguardandoPagamento).toBe(1);
    // A prova dura: nenhuma escrita de estado de execução aconteceu.
    expect(db.project.updateMany).not.toHaveBeenCalled();
  });

  it("e não fica MUDO: a mensagem diz que está aguardando pagamento, com o que fazer", async () => {
    portao.conferirPagamento.mockResolvedValue(SEM_PAGAMENTO);

    const r = await ligarProjetosParados();

    expect(r.desfechos[0]).toMatchObject({ desfecho: "aguardando_pagamento", avisou: true });
    const msg = db.portalMessage.create.mock.calls[0]![0].data;
    expect(msg.clientRequestId).toBe("cr1");
    expect(msg.body).toContain("aguardando o pagamento");
  });

  it("o aviso de pagamento não vira rajada: já registrado, não repete", async () => {
    portao.conferirPagamento.mockResolvedValue(SEM_PAGAMENTO);
    db.activityEvent.findFirst.mockResolvedValue({ id: "ja-avisamos" });

    await ligarProjetosParados();

    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("o portão é conferido ANTES de qualquer escrita, não depois", async () => {
    portao.conferirPagamento.mockResolvedValue(SEM_PAGAMENTO);
    await ligarProjetosParados();
    expect(portao.conferirPagamento).toHaveBeenCalledWith("cr1");
    expect(db.project.updateMany).not.toHaveBeenCalled();
  });

  it("pago mas sem o aval da direção: NÃO produz — e reenvia o pedido de aval que nunca chegou", async () => {
    const r = await ligarProjetosParados();

    expect(r.ligados).toBe(0);
    expect(r.aguardandoDirecao).toBe(1);
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(marcos.pedirDirecao).toHaveBeenCalledWith("p1");
  });

  it("mas se o pedido de aval JÁ está no portal, não pergunta de novo", async () => {
    db.portalMessage.findFirst.mockResolvedValue({ id: "ja-pedimos" });
    await ligarProjetosParados();
    expect(marcos.pedirDirecao).not.toHaveBeenCalled();
  });

  it("NÃO é um relógio novo: quem chama é o despertador que já roda", () => {
    const f = fonte("lib/agency/despertador.ts");
    expect(f).toContain("ligarProjetosParados");
    // E antes da retomada, para ligar e produzir na mesma rodada.
    expect(f.indexOf("ligarProjetosParados")).toBeLessThan(f.indexOf("retomados = await retomarProducao()"));
  });

  it("a segunda trava continua de pé: quem produz confere o portão outra vez", () => {
    expect(fonte("lib/agency/execution/run-execution.ts")).toContain("conferirPagamento(project.clientRequestId)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPURRÃO 2 — o botão de aprovar a direção
// ═══════════════════════════════════════════════════════════════════════════

const BASE: RetratoDoProjeto = {
  propostaAceita: true,
  direcaoAprovadaEm: null,
  tarefas: { total: 6, entregues: 0, produzindo: 0, bloqueadas: 0 },
  entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
  pedidosAbertos: 0,
  pedidosCobrados: 0,
};

describe("empurrão 2 — a porta de aprovar a direção existe sempre que a etapa exige", () => {
  it("o caso do Farol 27: com material pendente a etapa MUDA — e a porta continua lá", () => {
    // Exatamente o estado que apagou o botão: pedido de material cobrado, então
    // a etapa vira "Precisamos de uma coisa sua" e some a frase mágica.
    const f = lerFase({ ...BASE, pedidosAbertos: 5, pedidosCobrados: 5 });

    expect(f.paraCliente.titulo).not.toMatch(/confirme o caminho/i);
    // A porta é do ESTADO, não da prosa.
    expect(f.precisaAprovarDirecao).toBe(true);
  });

  it("aprovada a direção, a porta fecha — em qualquer etapa", () => {
    for (const over of [
      {},
      { pedidosAbertos: 5, pedidosCobrados: 5 },
      { execucao: "running" },
      { apresentadoEm: new Date() },
    ] as Partial<RetratoDoProjeto>[]) {
      const f = lerFase({ ...BASE, ...over, direcaoAprovadaEm: new Date() });
      expect(f.precisaAprovarDirecao, JSON.stringify(over)).toBe(false);
    }
  });

  it("sem desenho não há direção para avalizar — não se pede aval sobre nada", () => {
    expect(lerFase({ ...BASE, tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 } }).precisaAprovarDirecao).toBe(false);
    expect(lerFase({ ...BASE, propostaAceita: false }).precisaAprovarDirecao).toBe(false);
  });

  it("a rota pública do cliente SERVE o estado, não a frase", () => {
    const f = fonte("app/api/portal/esteira/route.ts");
    expect(f).toContain("direcao: { pedeAprovacao: status.leitura.precisaAprovarDirecao }");
  });

  // ── AS DUAS TELAS QUE O CLIENTE VÊ ────────────────────────────────────────
  // "Verdade escrita em dois lugares já está errada em um deles": o portal do
  // cliente derivava este botão em DOIS componentes, os dois pela mesma frase.
  it("nenhuma das duas telas do cliente casa mais o botão com a prosa da etapa", () => {
    for (const p of [
      "app/portal/access/[token]/page.tsx",
      "components/agency/portal/EsteiraDoCliente.tsx",
    ]) {
      const f = fonte(p);
      expect(f.toLowerCase(), p).not.toContain('includes("confirme o caminho")');
      expect(f, p).toContain("direcao?.pedeAprovacao");
      // Fail closed: campo ausente NUNCA vira botão.
      expect(f, p).toContain("?? false");
    }
  });

  it("a fechadura continua onde sempre esteve: a rota aceita `aprovar_direcao`", () => {
    expect(fonte("app/api/portal/esteira/route.ts")).toContain('body.decisao === "aprovar_direcao"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPURRÃO 3 — pedir antes de cobrar
// ═══════════════════════════════════════════════════════════════════════════

describe("empurrão 3a — não se cobra o que nunca foi pedido", () => {
  it("o caso do Farol 27: 5 pedidos abertos e ZERO enviados — o cliente não é cobrado", () => {
    const f = lerFase({ ...BASE, direcaoAprovadaEm: new Date(), pedidosAbertos: 5, pedidosCobrados: 0 });

    expect(f.paraCliente.oQueEsperamosDeVoce).toBe("");
    expect(f.paraCliente.agora).not.toMatch(/te mandamos/i);
    // A bola é da AGÊNCIA: quem tem de agir é quem esqueceu de perguntar.
    expect(f.responsavel).toBe("pm");
    expect(f.paraEquipe.titulo).toMatch(/nunca foi pedido/i);
  });

  it("o pedido que SAIU continua cobrando normalmente — a rede não afrouxou", () => {
    const f = lerFase({ ...BASE, direcaoAprovadaEm: new Date(), pedidosAbertos: 5, pedidosCobrados: 5 });
    expect(f.responsavel).toBe("cliente");
    expect(f.paraCliente.oQueEsperamosDeVoce).toContain("5 pedidos");
  });

  it("mistura: 5 abertos, 2 enviados → cobra 2, nunca 5", () => {
    const f = lerFase({ ...BASE, direcaoAprovadaEm: new Date(), pedidosAbertos: 5, pedidosCobrados: 2 });
    expect(f.paraCliente.oQueEsperamosDeVoce).toContain("2 pedidos");
    expect(f.paraCliente.oQueEsperamosDeVoce).not.toContain("5 pedidos");
  });

  it("quem ainda não mede continua lendo a etapa antiga — `undefined` não vira zero", () => {
    const f = lerFase({ ...BASE, direcaoAprovadaEm: new Date(), pedidosAbertos: 3, pedidosCobrados: undefined });
    expect(f.responsavel).toBe("cliente");
  });

  it("o portal e a etapa passam a usar a MESMA conta (`askedClientAt`)", () => {
    expect(fonte("lib/agency/esteira/retrato.ts")).toContain("pedidosCobrados: pendencias.filter((p) => p.jaFoiPedido).length");
    expect(fonte("app/api/portal/esteira/route.ts")).toContain("status.pendencias.filter((p) => p.jaFoiPedido)");
  });
});

describe("empurrão 3b — o pedido SAI na mesma passada em que nasce", () => {
  it("abriu 5 pedidos de onboarding → a mensagem vai ao cliente e eles ficam marcados como cobrados", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({
      businessName: "Farol 27 — Padaria & Café",
      segment: "padaria e café",
      services: '["branding","social-media"]',
      rawContext: "Padaria & café na Grande São Paulo, 3 lojas.",
      briefingJson: "{}",
    });
    // `pedidosAbertos` lê o que foi criado: todos sem `askedClientAt`.
    db.materialRequest.findMany.mockResolvedValue([
      { id: "m1", type: "produto_em_uso", description: "3 a 5 fotos do seu produto sendo usado", requestedByLabel: "Onboarding", askedClientAt: null },
    ]);

    const r = await coletarMaterialDeProduto({ projectId: "p1", clientRequestId: "cr1" });

    expect(r.abertos.length).toBeGreaterThan(0);
    expect(r.cobrados).toBe(1);
    expect(r.naoCobrouPorque).toBeUndefined();
    // A mensagem existe, é da equipe, e cita o que se está pedindo.
    const msg = db.portalMessage.create.mock.calls[0]![0].data;
    expect(msg.authorRole).toBe("team");
    expect(msg.body).toContain("fotos do seu produto sendo usado");
    // E os pedidos ficam marcados: a etapa passa a poder cobrar a resposta.
    expect(db.materialRequest.updateMany).toHaveBeenCalled();
    expect(db.materialRequest.updateMany.mock.calls[0]![0].data.askedClientAt).toBeInstanceOf(Date);
  });

  it("sem conversa onde perguntar, NÃO se marca como cobrado — falha fechada", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const r = await coletarMaterialDeProduto({ projectId: "p1", clientRequestId: null });

    expect(r.cobrados).toBe(0);
    expect(r.naoCobrouPorque).toMatch(/não há conversa/i);
    expect(db.materialRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("empurrão 3c — não se pede o que não faz sentido para o negócio", () => {
  // O texto REAL do briefing do Farol 27, em produção. É ele que derrotava a
  // régua antiga — o teste anterior usava "Padaria da Esquina", uma frase curta
  // e limpa que nenhum cliente escreve.
  const FAROL_27 = `Farol 27 — Padaria & Café [TESTE]
Alimentação · padaria e café · varejo e delivery
Padaria & café na Grande São Paulo, 3 lojas + cozinha central, 6 anos.
Site antigo sem tracking confiável; informações divergentes nas páginas das lojas; sem dashboard.
Ana — dona, decisora final, pouca familiaridade com tecnologia (Portal em Modo Básico).
Reposicionamento de marca + lançamento do Clube Farol 27 (assinatura de café da manhã, R$ 149/mês).`;

  it("a padaria NÃO recebe pedido de captura de tela de app", () => {
    const tipos = materiaisAPedir(lerSinaisDoCliente(FAROL_27)).map((m) => m.tipo);
    expect(tipos).not.toContain("produto_captura");
    // Recebe o que faz sentido para ela.
    expect(tipos).toEqual(expect.arrayContaining(["produto_embalagem", "produto_em_uso", "marca_arquivo"]));
  });

  it('"sem dashboard" é uma LACUNA declarada, não a prova de que existe dashboard', () => {
    expect(lerSinaisDoCliente("sem dashboard").temProdutoDigital).toBe(false);
    expect(lerSinaisDoCliente("não temos app").temProdutoDigital).toBe(false);
    expect(lerSinaisDoCliente("nenhum sistema próprio").temProdutoDigital).toBe(false);
  });

  it('"familiaridade com tecnologia" fala da DONA, não do produto dela', () => {
    expect(lerSinaisDoCliente("pouca familiaridade com tecnologia").temProdutoDigital).toBe(false);
  });

  it("e quem TEM produto digital continua sendo pedido — a régua não afrouxou", () => {
    for (const t of [
      "Foocci — plataforma de automação de pedidos e cardápio digital para restaurantes",
      "temos um aplicativo próprio",
      "site com área logada",
      "loja virtual / ecommerce de moda",
      "sistema de agendamento",
      "meu painel de gestão",
      "temos um app e não temos tempo de cuidar dele",
    ]) {
      expect(materiaisAPedir(lerSinaisDoCliente(t)).map((m) => m.tipo), t).toContain("produto_captura");
    }
  });

  it("sem sinal nenhum a casa PERGUNTA, não conclui que não tem", () => {
    const tipos = materiaisAPedir(lerSinaisDoCliente(FAROL_27)).map((m) => m.tipo);
    expect(tipos).toContain("produto_existe_digital");
  });
});
