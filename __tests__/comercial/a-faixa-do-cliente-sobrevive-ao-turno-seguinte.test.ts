// A FAIXA QUE O CLIENTE DISSE SOBREVIVE AO TURNO SEGUINTE (Fase 2, 27/08/2026).
//
// ═══ MEDIDO EM PRODUÇÃO, COM O MODELO DE VERDADE ════════════════════════════
//
// Travessia paga desta rodada, contra `https://www.diolidigital.com.br`, seis
// turnos. No 4º o cliente disse, palavra por palavra:
//
//     "Meu orçamento é uns R$ 790 por mês."
//
// e o turno saiu CERTO: `faixaDoTexto` leu 790 e a rota gravou
// "entre R$ 500 e R$ 1.500". Dois turnos depois — falando de CONTATO e de
// FOTOS, sem um número à vista — o escopo final devolvido pela rota veio com:
//
//     "budgetRange": "entre R$ 150 e R$ 500"      ← o degrau de BAIXO
//
// O modelo reemitiu o rótulo de baixo numa fala que não tinha número nenhum;
// `faixaDoTexto` devolveu `null` (correto — não havia número ali), o rótulo
// passou pela allowlist (é um rótulo válido) e **reescreveu a verba do cliente
// para baixo, em silêncio.**
//
// ═══ POR QUE ISTO CUSTA DINHEIRO DO CLIENTE ═════════════════════════════════
//
// `tetoDaFaixa("entre R$ 150 e R$ 500")` = 500. O confronto de verba passa a
// comparar a proposta contra um teto que o cliente nunca deu, e a casa esconde
// dele o **Conteúdo (R$ 790)** — que é exatamente o plano do número que ele
// disse — para oferecer os dois degraus de baixo. E **não há alarme**:
// `divergenciaDeVerba` só acorda em uma ordem de grandeza (`FATOR_DE_DIVERGENCIA`
// = 10) e 790/500 é 1,6. Silencioso, portanto armadilha.
//
// É o mesmo estrago da 6ª volta, que a trava do número existe para fechar, só
// que deslocado no tempo: a regra "quando o cliente disse um número, o número
// manda" estava certa e faltava dizer POR QUANTO TEMPO ela manda.
//
// O modelo é DUBLÊ aqui — nenhuma chamada paga, custo US$ 0,00 — e ele é
// dublado para dizer justamente a coisa errada que disse em produção, que é o
// único jeito de ver a trava trabalhar. Verde por ausência não é verde.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  rateLimitBucket: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const chaveDeRotaPublica = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  workspaceDaRotaPublica: async () => "ws-de-teste",
  primeiraChaveDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? { provider: "claude", chave } : null;
  },
  chavesDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? [{ provider: "claude", chave }] : [];
  },
}));

import { POST } from "@/app/api/sdr/chat/route";
import { tetoDaFaixa } from "@/lib/agency/comercial/negociacao";
import { divergenciaDeVerba } from "@/lib/agency/comercial/verba-declarada";

function respostaDaApi(text: string, stop_reason = "end_turn") {
  return { ok: true, json: async () => ({ content: [{ type: "text", text }], stop_reason }) };
}

function chamar(corpo: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/sdr/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }));
}

/** O que o modelo devolveu, dublado: a fala inocente e o rótulo de BAIXO. */
function pacoteDoModelo(reply: string, budgetRange: string) {
  return JSON.stringify({ reply, needsClarification: false, scope: { budgetRange } });
}

// As falas REAIS da travessia. Nada aqui é inventado para o teste.
const FALA_COM_NUMERO = "Meu orçamento é uns R$ 790 por mês.";
const FALA_SEM_NUMERO = "Tenho sim algumas fotos do salão, mas nada profissional.";
const FAIXA_DO_CLIENTE = "entre R$ 500 e R$ 1.500";
const FAIXA_DE_BAIXO = "entre R$ 150 e R$ 500";

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

describe("o turno do número continua certo — a trava da 6ª volta, intacta", () => {
  it("R$ 790 na fala vira o degrau de CIMA, mesmo o modelo dizendo o de baixo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaDaApi(pacoteDoModelo("Perfeito, anotei sua faixa de investimento.", FAIXA_DE_BAIXO))));

    const res = await chamar({
      messages: [], currentMessage: FALA_COM_NUMERO, sessionId: "s1", scope: {},
    });
    const json = await res.json();
    expect(json.scope?.budgetRange).toBe(FAIXA_DO_CLIENTE);
  });
});

describe("🔴 O DEFEITO MEDIDO — o turno SEGUINTE não pode desfazer o anterior", () => {
  it("fala sem número + rótulo de baixo do modelo → a faixa do CLIENTE fica de pé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaDaApi(pacoteDoModelo(
        "Deixa eu tentar de outro jeito: você consegue me dizer quem é o cliente típico de vocês?",
        FAIXA_DE_BAIXO,
      ))));

    const res = await chamar({
      messages: [
        { role: "user", content: FALA_COM_NUMERO },
        { role: "assistant", content: "Perfeito, anotei sua faixa de investimento." },
      ],
      currentMessage: FALA_SEM_NUMERO,
      sessionId: "s2",
      // O escopo ACUMULADO, como a sala manda: a faixa já estabelecida.
      scope: { budgetRange: FAIXA_DO_CLIENTE },
    });
    const json = await res.json();

    // ANTES DO CONSERTO esta linha voltava "entre R$ 150 e R$ 500".
    expect(json.scope?.budgetRange).toBe(FAIXA_DO_CLIENTE);
  });

  it("o cliente PODE mudar de ideia — número novo manda, para cima ou para baixo", async () => {
    // A trava protege o cliente do modelo, nunca o cliente dele mesmo. Sem esta
    // régua o conserto viraria um campo congelado no primeiro número dito.
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaDaApi(pacoteDoModelo("Anotei.", FAIXA_DO_CLIENTE))));

    const res = await chamar({
      messages: [], currentMessage: "Pensando melhor, meu teto é R$ 300 por mês.",
      sessionId: "s3", scope: { budgetRange: FAIXA_DO_CLIENTE },
    });
    const json = await res.json();
    expect(json.scope?.budgetRange).toBe(FAIXA_DE_BAIXO);
  });

  it("sem faixa estabelecida, o rótulo do modelo continua valendo", async () => {
    // O rótulo do modelo não foi banido: ele PREENCHE o que não existe. Sem
    // esta régua o conserto teria matado o caminho normal da terceira pergunta.
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaDaApi(pacoteDoModelo("Anotei sua faixa.", FAIXA_DE_BAIXO))));

    const res = await chamar({
      messages: [], currentMessage: "Ainda não sei bem, algo modesto.",
      sessionId: "s4", scope: {},
    });
    const json = await res.json();
    expect(json.scope?.budgetRange).toBe(FAIXA_DE_BAIXO);
  });
});

describe("MUTAÇÃO — por que este defeito custa dinheiro e não acorda ninguém", () => {
  it("o teto muda de 1.500 para 500 — e o Conteúdo (R$ 790) some do que cabe", () => {
    expect(tetoDaFaixa(FAIXA_DO_CLIENTE)).toBe(1500);
    expect(tetoDaFaixa(FAIXA_DE_BAIXO)).toBe(500);
    // O plano que o número dele paga fica ACIMA do teto reescrito.
    expect(790).toBeGreaterThan(tetoDaFaixa(FAIXA_DE_BAIXO)!);
    expect(790).toBeLessThanOrEqual(tetoDaFaixa(FAIXA_DO_CLIENTE)!);
  });

  it("nenhum alarme dispara: 790 contra 500 não é uma ordem de grandeza", () => {
    // É por isso que o defeito é ARMADILHA e não dívida: ele não se anuncia.
    expect(divergenciaDeVerba(FAIXA_DE_BAIXO, 790)).toBeNull();
  });
});
