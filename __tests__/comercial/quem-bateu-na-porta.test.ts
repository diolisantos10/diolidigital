// Quem bateu na porta e não foi atendido.
//
// A trava que mais importa: **este arquivo NÃO fala com ninguém.** Ele conta.
// Abordagem automática em quem demonstrou interesse queima marca e número — e o
// CEO ordenou, em 10/08/2026, nenhuma demanda de cliente até a agência ficar
// pronta. Uma varredura que dispara mensagem violaria a ordem no dia em que
// fosse ligada, sem ninguém decidir isso.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({ clientRequestDb: { findMany: vi.fn(), count: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  quemBateuNaPorta, resumoDaPorta, lerAPorta,
  AINDA_NA_PORTA, JA_FOI_ATENDIDO, TETO_DA_LISTA, DIAS_ATE_VIRAR_DESLEIXO,
} from "@/lib/agency/comercial/quem-bateu-na-porta";

const AGORA = new Date("2026-08-11T12:00:00Z");

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "r1", businessName: "Sushi Cazza", status: "new", rawContext: "",
    briefingJson: JSON.stringify({ contato: { email: "dono@sushicazza.com.br" } }),
    sdrHandoffJson: null,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    ...over,
  };
}

/**
 * Põe a fila no banco de mentira.
 *
 * A CONTAGEM é consulta própria desde 16/08 (a lista tem teto e ela não), então
 * o fixture precisa dizer as duas coisas. Por padrão elas concordam; quem mede
 * o teto passa `total` diferente de propósito.
 */
function naFila(linhas: ReturnType<typeof pedido>[], total = linhas.length) {
  db.clientRequestDb.findMany.mockResolvedValue(linhas);
  db.clientRequestDb.count.mockResolvedValue(total);
}

beforeEach(() => {
  vi.clearAllMocks();
  naFila([]);
});

describe("conta quem entrou e ninguém respondeu", () => {
  it("os dias são CALCULADOS, nunca digitados", async () => {
    naFila([
      pedido({ createdAt: new Date("2026-06-21T12:00:00Z") }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.diasEsperando).toBe(51); // o caso real do Sushi Cazza
    expect(r[0]!.desleixo).toBe(true);
  });

  it("a metade oposta: quem entrou ontem ainda não é desleixo", async () => {
    naFila([pedido()]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.diasEsperando).toBe(1);
    expect(r[0]!.desleixo).toBe(false);
    expect(DIAS_ATE_VIRAR_DESLEIXO).toBeGreaterThan(1);
  });

  it("pedido que já virou projeto saiu da porta e não é mais fila", async () => {
    naFila([]);
    await quemBateuNaPorta("ws1", AGORA);
    const where = db.clientRequestDb.findMany.mock.calls[0]![0].where;
    expect(where.status.in).not.toContain("completed");
    expect(where.workspaceId).toBe("ws1");
  });
});

describe('"ninguém respondeu" e "não temos como responder" são problemas OPOSTOS', () => {
  it("quem deixou contato conta como esperando resposta — é cobrança da casa", async () => {
    naFila([pedido()]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.esperandoResposta).toBe(1);
    expect(r.semCaminho).toBe(0);
  });

  it("quem NÃO deixou contato é contado separado, e nunca vira desleixo", async () => {
    // Cobrar alguém por não ter ligado para quem não deixou telefone é cobrar o
    // impossível — e alarme impossível de atender é alarme que se aprende a ignorar.
    naFila([
      pedido({ briefingJson: "{}", createdAt: new Date("2026-06-21T12:00:00Z") }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.temComoFalar).toBe(false);
    expect(r[0]!.desleixo).toBe(false);
    expect(r[0]!.porQueNaoDaParaFalar).toBeTruthy();

    const resumo = await resumoDaPorta("ws1", AGORA);
    expect(resumo.semCaminho).toBe(1);
    expect(resumo.esperandoResposta).toBe(0);
  });

  it("nome sozinho NÃO é contato", async () => {
    naFila([
      pedido({ briefingJson: JSON.stringify({ contato: { nome: "Camila Pereira" } }) }),
    ]);
    expect((await quemBateuNaPorta("ws1", AGORA))[0]!.temComoFalar).toBe(false);
  });

  it("pista de Instagram aparece como PISTA e não conta como contato", async () => {
    // O Sushi Cazza tem @sushicazzaoficial no texto. É caminho real para uma
    // PESSOA tentar — não é declaração de contato, e não pode virar uma.
    naFila([
      pedido({ briefingJson: "{}", rawContext: "nosso perfil é @sushicazzaoficial" }),
    ]);
    const r = await quemBateuNaPorta("ws1", AGORA);
    expect(r[0]!.temComoFalar).toBe(false);
    expect(r[0]!.pistas.some((p) => p.tipo === "instagram")).toBe(true);
  });
});

describe("o resumo não mente sobre fila vazia", () => {
  it("sem ninguém alcançável, o mais antigo é NULO — nunca zero", async () => {
    naFila([]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.naPorta).toBe(0);
    expect(r.maisAntigoEmDias).toBeNull();
  });

  // ⚠️ ESTE TESTE FOI INVERTIDO EM 16/08/2026, e o motivo importa mais que ele.
  //
  // Ele dizia "banco fora do ar não derruba quem consulta" e exigia
  // `naPorta === 0`. Ou seja: trancava como CONTRATO que uma falha de leitura
  // vira a afirmação "não há ninguém esperando na porta". Enquanto esta função
  // não tinha chamador, era teoria. No dia em que ganhou tela, virou 200 ·
  // `medido: true` · `fila: []` e a frase *"Isto é boa notícia: todo briefing
  // que chegou já foi atendido"* impressa em cima de um banco que piscou — com
  // o `catch` da rota, que existe justamente para dizer o contrário,
  // **inalcançável**.
  //
  // Mesmo padrão, mesma data, mesmo conserto da irmã `aprovacao-parada.ts`.
  it("⛔ banco fora do ar GRITA — nunca vira fila zero", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    await expect(resumoDaPorta("ws1", AGORA)).rejects.toThrow("db down");
    await expect(quemBateuNaPorta("ws1", AGORA)).rejects.toThrow("db down");
  });

  it("⛔ e a CONTAGEM falhando também grita — senão a fila voltaria zerada em silêncio", async () => {
    db.clientRequestDb.count.mockRejectedValue(new Error("count down"));
    await expect(resumoDaPorta("ws1", AGORA)).rejects.toThrow("count down");
  });

  it("os três casos reais de 08/08, juntos", async () => {
    naFila([
      pedido({ id: "a", businessName: "Sushi Cazza", briefingJson: "{}", createdAt: new Date("2026-06-21T12:00:00Z") }),
      pedido({ id: "b", businessName: "Camila Pereira", createdAt: new Date("2026-07-13T12:00:00Z") }),
      pedido({ id: "c", businessName: "Beatriz Gimenes", briefingJson: "{}", createdAt: new Date("2026-07-14T12:00:00Z") }),
    ]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.naPorta).toBe(3);
    expect(r.semCaminho).toBe(2);
    expect(r.esperandoResposta).toBe(1);
    expect(r.maisAntigoEmDias).toBe(29);
  });
});

// ── 🔴 A FILA NÃO CONTINHA AS PESSOAS QUE ELA EXISTE PARA MOSTRAR ──────────
//
// `AINDA_NA_PORTA` era `["new", "triaged", "qualifying"]`. Os dois últimos
// **não existem** no vocabulário do banco. Sobrava `new`, que dura segundos.

describe("⛔ o conjunto de status: sai da fila quem foi ATENDIDO, não quem a máquina terminou", () => {
  /** O vocabulário do banco, copiado de `ClientRequestDbStatus`. É a lista que
   *  a casa escreve de verdade — e a trava abaixo compara contra ELA, não
   *  contra uma segunda lista escrita à mão neste teste. */
  const VOCABULARIO = [
    "new", "lead_incompleto", "scope_ready", "needs_revision",
    "waiting_strategy", "waiting_social", "waiting_design", "waiting_traffic",
    "waiting_analytics", "waiting_quality", "in_progress", "completed", "cancelled",
  ];

  it("todo status inventado morreu: os que a fila procura EXISTEM no banco", () => {
    // `triaged` e `qualifying` nunca existiram. Uma fila que procura por
    // status inexistente é uma fila estruturalmente vazia com cara de fila.
    for (const s of AINDA_NA_PORTA) {
      expect(VOCABULARIO, `"${s}" não existe em ClientRequestDbStatus`).toContain(s);
    }
    expect([...AINDA_NA_PORTA]).not.toContain("triaged");
    expect([...AINDA_NA_PORTA]).not.toContain("qualifying");
  });

  it("nenhum status do vocabulário fica sem lado — status novo REPROVA até alguém decidir", () => {
    // A trava que impede o defeito de voltar por omissão: acrescentar um status
    // ao vocabulário sem dizer se ele está na porta ou não deixa isto vermelho.
    const declarados = new Set<string>([...AINDA_NA_PORTA, ...JA_FOI_ATENDIDO]);
    const semLado = VOCABULARIO.filter((s) => !declarados.has(s));
    expect(semLado, "status sem lado declarado — diga se ele está na porta ou não").toEqual([]);
    // E ninguém pode estar dos dois lados.
    expect(declarados.size).toBe(VOCABULARIO.length);
  });

  it("⛔ `scope_ready` FICA na fila — a máquina terminar não é alguém ter atendido", async () => {
    // O briefing com contato nasce `new` e `runAutoScope` grava `scope_ready`
    // em segundos. Com a lista antiga, o lead com escopo pronto que ninguém
    // procurou saía da fila e sumia. É o caso exato de "bateu na porta e não
    // foi atendido".
    expect([...AINDA_NA_PORTA]).toContain("scope_ready");
    naFila([]);
    await quemBateuNaPorta("ws1", AGORA);
    expect(db.clientRequestDb.findMany.mock.calls[0]![0].where.status.in).toContain("scope_ready");
  });

  it("⛔ `lead_incompleto` FICA na fila — era por isso que `semCaminho` era zero em produção", async () => {
    // Sem contato, a rota pública grava `lead_incompleto`. Fora da lista, esse
    // lead nunca esteve na fila: `semCaminho` era estruturalmente 0 enquanto a
    // tela mostrava cartões "sem como falar". Duas verdades na mesma tela.
    naFila([pedido({ status: "lead_incompleto", briefingJson: "{}" })]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.semCaminho).toBe(1);
    expect(r.naPorta).toBe(1);
    expect(r.esperandoResposta).toBe(0);
  });

  it("a METADE OPOSTA: quem alguém já atendeu SAI da fila", async () => {
    // A lista não pode virar "tudo entra". `in_progress` é gravado quando uma
    // PESSOA aceita a proposta e abre o projeto — aí a porta acabou.
    naFila([]);
    await quemBateuNaPorta("ws1", AGORA);
    const procurados: string[] = db.clientRequestDb.findMany.mock.calls[0]![0].where.status.in;
    for (const atendido of JA_FOI_ATENDIDO) {
      expect(procurados, `"${atendido}" voltou para a fila da porta`).not.toContain(atendido);
    }
  });
});

// ── 🔴 O TETO CORTAVA A CONTAGEM ──────────────────────────────────────────

describe("⛔ a lista tem teto e a contagem NÃO", () => {
  it("com 250 na fila e 200 lidos, o total é 250 e a tela é avisada", async () => {
    naFila(Array.from({ length: TETO_DA_LISTA }, (_, i) => pedido({ id: `p${i}` })), 250);
    const r = await resumoDaPorta("ws1", AGORA);
    // `naPorta = fila.length` afirmava 200 sobre uma fila de 250, sem marcador.
    expect(r.naPorta).toBe(250);
    expect(r.listados).toBe(200);
    expect(r.amostrada).toBe(true);
    // E o teto é REAL na consulta: sem `take`, 250 linhas viriam para a memória
    // só para serem cortadas depois.
    expect(db.clientRequestDb.findMany.mock.calls[0]![0].take).toBe(TETO_DA_LISTA);
  });

  it("a metade oposta: fila que cabe não é chamada de amostra", async () => {
    naFila([pedido()]);
    const r = await resumoDaPorta("ws1", AGORA);
    expect(r.amostrada).toBe(false);
    expect(r.naPorta).toBe(r.listados);
  });

  it("`lerAPorta` devolve resumo e fila da MESMA leitura — uma regra, não duas", async () => {
    naFila([pedido({ id: "x" })]);
    const { resumo, fila } = await lerAPorta("ws1", AGORA);
    expect(fila).toHaveLength(1);
    expect(resumo.naPorta).toBe(1);
    // Duas chamadas a `findMany` aqui seriam duas leituras do mesmo dado, com
    // chance de divergir entre elas.
    expect(db.clientRequestDb.findMany).toHaveBeenCalledTimes(1);
  });
});

// ── ESTE ARQUIVO CONTA. ELE NÃO FALA COM NINGUÉM. ───────────────────────────

describe("não aborda, não escreve, não decide por gente", () => {
  const BRUTO = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/comercial/quem-bateu-na-porta.ts"), "utf8",
  );
  const SRC = BRUTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("nenhum envio sai daqui", () => {
    for (const p of ["sendWhatsApp", "avisarCliente", "enviarEmail", "fetch(", "generate("]) {
      expect(SRC.includes(p), `passou a abordar lead (${p}) — isto era para CONTAR`).toBe(false);
    }
  });

  it("não escreve no banco", () => {
    for (const e of ["update(", "create(", "upsert(", "updateMany("]) {
      expect(SRC.includes(e), `passou a escrever (${e})`).toBe(false);
    }
  });
});
