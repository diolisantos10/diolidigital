// A fila de exceção que se cobra.
//
// A trava central: **motivo temporário reenvia; motivo permanente NÃO.**
// Tratar os dois do mesmo jeito é o que produz centenas de tentativas por dia
// contra um número que não existe — e faz o painel ensinar a ser ignorado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientNotice: { findMany: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const avisos = vi.hoisted(() => ({ avisarCliente: vi.fn() }));
vi.mock("@/lib/agency/esteira/avisos", () => avisos);

import { cobrarAFila, MAX_REENVIOS, HORAS_ATE_COBRAR } from "@/lib/agency/esteira/fila-que-se-cobra";

const AGORA = new Date("2026-08-09T12:00:00Z");

function aviso(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "av1", workspaceId: "ws1", clientId: "cli1", projectId: null,
    kind: "material", body: "Precisamos do seu logo.", status: "pendente",
    // ⚠️ ERA "o WhatsApp recusou o envio" até 15/08/2026 — e esse motivo mudou
    //    de classe. Ver o bloco "A PLATAFORMA DISSE NÃO" no fim deste arquivo:
    //    recusa da plataforma é REGRA, não instabilidade, e o fixture do
    //    temporário precisa ser algo que de fato volta sozinho.
    channel: "nenhum", failReason: "o canal ficou indisponível",
    retryCount: 0, createdAt: new Date("2026-08-01T12:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // ── O FREIO DE SAÍDA (15/08/2026) ─────────────────────────────────────────
  // `WHATSAPP_SAIDA` nasce FECHADO: em produção, sem esta linha, esta perna não
  // reenvia coisa nenhuma. Os testes abaixo descrevem a fila com a torneira
  // ABERTA; as duas metades do freio moram em
  // `__tests__/agency/freio-do-whatsapp.test.ts`.
  process.env.WHATSAPP_SAIDA = "liberada";
  db.clientNotice.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João" });
  avisos.avisarCliente.mockResolvedValue({ registrado: true, enviadoAutomaticamente: true, canal: "whatsapp" });
});

describe("motivo TEMPORÁRIO é reenviado", () => {
  it("canal que recusou volta a ser tentado", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso()]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.reenviados).toEqual(["av1"]);
    expect(avisos.avisarCliente).toHaveBeenCalled();
  });

  it("o contador sobe a cada tentativa — sem ele o reenvio vira rajada", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ retryCount: 1 })]);
    await cobrarAFila("ws1", AGORA);
    const dados = db.clientNotice.update.mock.calls[0]![0].data;
    expect(dados.retryCount).toBe(2);
  });

  it("depois do teto, PARA de tentar e declara — não abandona em silêncio", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ retryCount: MAX_REENVIOS })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.desistidos).toEqual(["av1"]);
    expect(avisos.avisarCliente, "insistiu depois do teto").not.toHaveBeenCalled();
    expect(db.clientNotice.update.mock.calls[0]![0].data.failReason).toMatch(/precisa de gente/);
  });
});

describe("motivo PERMANENTE não é reenviado — é gritado", () => {
  it("cliente sem telefone vira pedido de CADASTRO, não nova tentativa", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "cliente sem telefone cadastrado" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(avisos.avisarCliente, "insistiu contra um telefone que não existe").not.toHaveBeenCalled();
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/telefone/);
    expect(r.precisamDeCadastro[0]!.cliente).toBe("Padaria do João");
  });

  it("sem conexão de WhatsApp também é cadastro, e o alerta diz o conserto", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "nenhuma conexão de WhatsApp no workspace" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/WhatsApp conectado/);
  });

  it("motivo DESCONHECIDO não é reenviado — default-deny", async () => {
    // Insistir contra um defeito que a casa não reconhece é como se descobre,
    // tarde, que ele era permanente.
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "erro estranho que ninguém mapeou" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(avisos.avisarCliente).not.toHaveBeenCalled();
    expect(r.precisamDeCadastro.length).toBe(1);
  });

  it("motivo VAZIO também não reenvia, e a falta do motivo é dita", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: null })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.precisamDeCadastro[0]!.oQueFalta).toMatch(/não foi registrado/);
  });
});

// ── A PLATAFORMA DISSE NÃO ≠ A REDE CAIU (15/08/2026) ───────────────────────
//
// Achado do parecer formal do especialista `meta`. A régua do "temporário"
// casava `janela|24h` — ou seja, a casa tratava uma REGRA DE POLÍTICA como
// instabilidade e re-tentava até 3× contra ela. Nenhuma tentativa número 3 abre
// uma janela que a política fechou; o que ela faz é somar tentativa contra a
// reputação do app, que é o que restringiu a conta desta casa em 03/08/2026.
//
// (E o defeito de fundo continua aberto, declarado como proposta no PR: o
// reenvio manda TEXTO LIVRE, e fora da janela de 24h só sai template aprovado.)
describe("recusa por POLÍTICA não é falha temporária", () => {
  const porPolitica = [
    "fora da janela de 24h",
    "o WhatsApp recusou o envio",
    "template não aprovado para este idioma",
    "usuário não deu opt-in",
  ];

  for (const motivo of porPolitica) {
    it(`"${motivo}" NÃO é re-tentado`, async () => {
      db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: motivo })]);
      const r = await cobrarAFila("ws1", AGORA);
      expect(avisos.avisarCliente, "re-tentou contra uma regra da plataforma").not.toHaveBeenCalled();
      expect(r.reenviados).toEqual([]);
      expect(r.barradosPorPolitica[0]!.avisoId).toBe("av1");
    });
  }

  it("e o alerta carrega o CONSERTO, não o sintoma", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "fora da janela de 24h" })]);
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.barradosPorPolitica[0]!.oQueFazer).toMatch(/template aprovado/);
    expect(r.barradosPorPolitica[0]!.oQueFazer).toMatch(/à mão/);
  });

  it("não gasta uma das três tentativas do aviso — regra não consome retry", async () => {
    db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: "fora da janela de 24h" })]);
    await cobrarAFila("ws1", AGORA);
    expect(db.clientNotice.update, "carimbou o registro por um fato que não mudou").not.toHaveBeenCalled();
  });

  it("METADE 2 — o que é MESMO temporário continua voltando sozinho", async () => {
    // A régua nova não pode ter matado o reenvio legítimo: trava que barra tudo
    // é tão inútil quanto trava que não barra nada.
    for (const motivo of ["o canal ficou indisponível", "timeout de rede", "rate limit do provedor"]) {
      vi.clearAllMocks();
      avisos.avisarCliente.mockResolvedValue({ registrado: true, enviadoAutomaticamente: true, canal: "whatsapp" });
      db.clientNotice.update.mockResolvedValue({});
      db.clientNotice.findMany.mockResolvedValue([aviso({ failReason: motivo })]);
      const r = await cobrarAFila("ws1", AGORA);
      expect(r.reenviados, `"${motivo}" deixou de ser re-tentado`).toEqual(["av1"]);
    }
  });
});

describe("só cobra o que já esperou tempo demais", () => {
  it("a janela de espera entra na consulta", async () => {
    db.clientNotice.findMany.mockResolvedValue([]);
    await cobrarAFila("ws1", AGORA);
    const where = db.clientNotice.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("pendente");
    const limite = where.createdAt.lte as Date;
    const horas = (AGORA.getTime() - limite.getTime()) / 3_600_000;
    expect(horas).toBe(HORAS_ATE_COBRAR);
  });
});

describe("uma rodada que falha não derruba o relógio", () => {
  it("banco fora do ar devolve rodada vazia em vez de lançar", async () => {
    db.clientNotice.findMany.mockRejectedValue(new Error("db down"));
    const r = await cobrarAFila("ws1", AGORA);
    expect(r.reenviados).toEqual([]);
    expect(r.precisamDeCadastro).toEqual([]);
  });
});

// ── A METADE QUE FAZ ISTO EXISTIR DE VERDADE ────────────────────────────────
//
// Uma fila que se cobra e que ninguém chama é a mesma fila parada de antes, só
// que com mais código. O relógio precisa chamá-la.

import fs from "node:fs";
import path from "node:path";

const DESPERTADOR = fs.readFileSync(path.join(process.cwd(), "lib/agency/despertador.ts"), "utf8");

describe("o relógio chama a fila", () => {
  it("a cobrança é uma perna da rodada", () => {
    expect(DESPERTADOR.includes("cobrarAFila("), "a fila voltou a depender de alguém abrir o painel").toBe(true);
  });

  it("falhar na cobrança NÃO derruba as outras pernas", () => {
    const i = DESPERTADOR.indexOf("cobrarAFila(");
    // A janela cresceu de 700 para 1400 em 15/08/2026: a perna ganhou o relato
    // do freio e o dos avisos barrados por política, e o `catch` continua ali —
    // era a régua que ficou curta, não a proteção que sumiu.
    const trecho = DESPERTADOR.slice(Math.max(0, i - 400), i + 1400);
    expect(trecho).toContain("quebrou(\"fila-que-se-cobra\"");
  });

  it("o que precisa de cadastro aparece com NOME e com o conserto", () => {
    const i = DESPERTADOR.indexOf("precisamDeCadastro");
    expect(i).toBeGreaterThan(-1);
    expect(DESPERTADOR.slice(i, i + 200)).toContain("oQueFalta");
  });
});
