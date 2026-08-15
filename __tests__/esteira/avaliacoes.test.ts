import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  googleConnection: { findMany: vi.fn(), update: vi.fn() },
  googleReview: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  clientRequestDb: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const listarAvaliacoes = vi.hoisted(() => vi.fn());
const responderAvaliacao = vi.hoisted(() => vi.fn());
const buildVerdadeOperacional = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/integrations/google/client", () => ({ listarAvaliacoes, responderAvaliacao }));
vi.mock("@/lib/dioli-brain/client-snapshot", () => ({ buildVerdadeOperacional }));

import {
  cuidarDasAvaliacoes, escreverResposta, redigirResposta, ESTRELAS_PARA_RESPOSTA_AUTOMATICA,
} from "@/lib/agency/esteira/avaliacoes";
import { extrairVerdadeOperacional } from "@/lib/agency/execution/piso-de-verdade";

const CONEXAO = {
  id: "gc1", workspaceId: "ws1", clientId: "c1",
  title: "Padaria do João", locationName: "locations/1", accountName: "accounts/1",
  status: "connected",
  // A trava de consentimento (política da API do Google): sem esta data,
  // nem elogio sai sozinho. Os testes de resposta automática a preenchem.
  autoReplyConsentAt: new Date("2026-08-01"),
};

const ELOGIO = {
  externalId: "rev1", autor: "Maria", estrelas: 5,
  comentario: "O pão de fermentação natural é o melhor do bairro.",
  quando: new Date("2026-08-01"), jaRespondida: false,
};
const RECLAMACAO = { ...ELOGIO, externalId: "rev2", autor: "Carlos", estrelas: 2, comentario: "Esperei 40 minutos e o pão estava frio." };

const VERDADE = { businessName: "Padaria do João", telefones: [], emails: [], servicos: [], valores: [] };

beforeEach(() => {
  vi.clearAllMocks();
  // ── O FREIO DE SAÍDA (15/08/2026) ─────────────────────────────────────────
  // `AVALIACOES_GOOGLE` nasce FECHADO: em produção, sem esta linha, a perna
  // inteira devolve zero sem tocar em nada. Os testes abaixo descrevem o
  // comportamento com a torneira ABERTA — e as duas metades do próprio freio
  // moram em `__tests__/esteira/freio-das-avaliacoes.test.ts`.
  process.env.AVALIACOES_GOOGLE = "liberada";
  db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO }]);
  db.googleConnection.update.mockResolvedValue({});
  // A leitura em LOTE do que já foi tratado. Substituiu o `findUnique` por
  // avaliação: era ele que deixava as 5 fatias da rodada serem gastas com
  // `continue` enquanto a avaliação represada embaixo nunca era alcançada.
  db.googleReview.findMany.mockResolvedValue([]);
  db.googleReview.findUnique.mockResolvedValue(null);
  db.googleReview.create.mockResolvedValue({ id: "r1" });
  db.googleReview.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João", phone: null, email: null, brandBrain: { tone: "acolhedor" } });
  db.clientRequestDb.findFirst.mockResolvedValue({ id: "cr1" });
  db.activityEvent.create.mockResolvedValue({});
  buildVerdadeOperacional.mockResolvedValue(null);
  listarAvaliacoes.mockResolvedValue({ ok: true, dados: [ELOGIO] });
  responderAvaliacao.mockResolvedValue({ ok: true, dados: { respondida: true } });
  generate.mockResolvedValue({ ok: true, data: { resposta: "Que alegria ler isso, Maria! A fermentação natural leva 24h e é por isso mesmo. Te esperamos." } });
});

describe("elogio a agência responde sozinha", () => {
  it("responde e registra", async () => {
    const r = await cuidarDasAvaliacoes();
    expect(r.respondidas).toBe(1);
    expect(responderAvaliacao).toHaveBeenCalledWith("gc1", "rev1", expect.stringContaining("Maria"));
    expect(db.googleReview.update.mock.calls[0]![0].data.status).toBe("respondida");
  });

  it("avaliação já registrada não é processada de novo", async () => {
    db.googleReview.findMany.mockResolvedValue([{ externalId: "rev1" }]);
    const r = await cuidarDasAvaliacoes();
    expect(r.novas).toBe(0);
    expect(responderAvaliacao).not.toHaveBeenCalled();
  });

  it("não conseguir LER o que já foi tratado NÃO vira 'nada foi tratado'", async () => {
    // Fail-closed: sem esta guarda, uma falha de banco faria a casa responder
    // por cima do que o próprio dono do negócio já respondeu à mão.
    db.googleReview.findMany.mockRejectedValue(new Error("banco fora do ar"));
    const r = await cuidarDasAvaliacoes();
    expect(responderAvaliacao).not.toHaveBeenCalled();
    expect(db.googleReview.create).not.toHaveBeenCalled();
    expect(r.falhas[0]).toMatch(/não processo às cegas/);
  });

  it("resposta que o dono já deu à mão não é sobrescrita", async () => {
    listarAvaliacoes.mockResolvedValue({ ok: true, dados: [{ ...ELOGIO, jaRespondida: true }] });
    const r = await cuidarDasAvaliacoes();
    expect(responderAvaliacao).not.toHaveBeenCalled();
    expect(db.googleReview.create.mock.calls[0]![0].data.status).toBe("ignorada");
  });
});

describe("RECLAMAÇÃO NUNCA é respondida sozinha", () => {
  // Resposta automática a cliente irritado — ainda que educada — é lida como
  // deboche justamente por quem está com raiva, e vira print. É pública,
  // permanente, e notifica a pessoa na hora.
  beforeEach(() => {
    listarAvaliacoes.mockResolvedValue({ ok: true, dados: [RECLAMACAO] });
  });

  it("escala em vez de publicar", async () => {
    const r = await cuidarDasAvaliacoes();
    expect(r.escaladas).toBe(1);
    expect(r.respondidas).toBe(0);
    expect(responderAvaliacao).not.toHaveBeenCalled();
  });

  it("mas o RASCUNHO fica pronto — o trabalho é nosso, a decisão é de gente", async () => {
    await cuidarDasAvaliacoes();
    const d = db.googleReview.update.mock.calls[0]![0].data;
    expect(d.status).toBe("escalada");
    expect(d.reply).toBeTruthy();
  });

  it("o time é avisado — escalada invisível é o mesmo que escalada nenhuma", async () => {
    await cuidarDasAvaliacoes();
    const e = db.activityEvent.create.mock.calls[0]![0].data;
    expect(e.type).toBe("avaliacao_negativa");
    expect(e.message).toContain("Esperei 40 minutos");
  });

  it(`o corte é em ${ESTRELAS_PARA_RESPOSTA_AUTOMATICA} estrelas`, async () => {
    listarAvaliacoes.mockResolvedValue({
      ok: true,
      dados: [{ ...ELOGIO, externalId: "r4", estrelas: ESTRELAS_PARA_RESPOSTA_AUTOMATICA }],
    });
    expect((await cuidarDasAvaliacoes()).respondidas).toBe(1);
  });
});

describe("o texto da resposta — é público e não sai mais de lá", () => {
  it("proíbe prometer desconto, cupom ou reembolso", async () => {
    await escreverResposta({ workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 5, comentario: "ótimo", verdade: VERDADE });
    expect(generate.mock.calls[0]![0].system).toMatch(/PROIBIDO/);
    expect(generate.mock.calls[0]![0].system).toMatch(/desconto, cupom, brinde, reembolso/);
  });

  it("em nota ruim, manda reconhecer sem se justificar e sem prometer nada", async () => {
    await escreverResposta({ workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 1, comentario: "péssimo", verdade: VERDADE });
    const p = generate.mock.calls[0]![0].user as string;
    expect(p).toMatch(/sem discutir e sem se justificar/);
    expect(p).toMatch(/NÃO prometa nada concreto/);
  });

  it("nota sem comentário: proíbe inventar o motivo", async () => {
    await escreverResposta({ workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 5, comentario: "", verdade: VERDADE });
    expect(generate.mock.calls[0]![0].user).toMatch(/NÃO invente o motivo da nota/);
  });

  it("resposta que inventa telefone é barrada pelo piso — nem chega ao Google", async () => {
    generate.mockResolvedValue({ ok: true, data: { resposta: "Obrigado! Qualquer coisa liga no (11) 98888-7777 que a gente resolve." } });
    const t = await escreverResposta({ workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 5, comentario: "bom", verdade: VERDADE });
    expect(t).toBeNull();
  });

  it("IA fora do ar não vira resposta vazia no perfil do cliente", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    expect(await escreverResposta({ workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 5, comentario: "bom", verdade: VERDADE })).toBeNull();
  });
});

// ── O 4º CALL SITE DA VERDADE (achado da 5ª auditoria, 04/08/2026) ──────────
//
// Este arquivo montava `VerdadeDoCliente` à mão e ESQUECIA `operacao`. Sem ela
// o piso é fail-closed sobre o vazio: toda classe operacional conta como "não
// informada", e a resposta é barrada por repetir o que o próprio cliente
// contou. Fail-closed é o default certo; não ligar a fiação vira falso
// positivo — e falso positivo aqui é elogio de 5 estrelas sem resposta.
describe("a verdade OPERACIONAL do cliente chega ao piso", () => {
  it("lê a verdade do BANCO — não a monta com o que estava por perto", async () => {
    await cuidarDasAvaliacoes();
    expect(db.clientRequestDb.findFirst).toHaveBeenCalled();
    expect(buildVerdadeOperacional).toHaveBeenCalledWith("cr1");
  });

  it("METADE 1 — SEM a operação ligada, o horário que o cliente informou é barrado", async () => {
    // O caso medido pela auditoria, com o piso REAL (não mock).
    const texto = "Que bom que gostou! Estamos abertos de segunda a sábado das 9h às 19h, te esperamos.";
    expect(
      await escreverRespostaComOperacao(texto, undefined),
      "é o falso positivo: o cliente disse isso, e a resposta some",
    ).toBeNull();
  });

  it("METADE 2 — COM a operação lida do banco, a mesma resposta passa", async () => {
    const contadoPeloCliente = extrairVerdadeOperacional(
      "Atendemos de segunda a sábado, das 9h às 19h. Chama no WhatsApp que a gente agenda.",
      "Padaria do João",
    );
    expect(
      await escreverRespostaComOperacao("Que bom que gostou! Estamos abertos de segunda a sábado das 9h às 19h, te esperamos.", contadoPeloCliente),
    ).toBeTruthy();
  });

  it("METADE 2b — o CTA de WhatsApp também sobrevive quando o cliente já o informou", async () => {
    const contadoPeloCliente = extrairVerdadeOperacional(
      "Atendemos de segunda a sábado, das 9h às 19h. Chama no WhatsApp que a gente agenda.",
      "Padaria do João",
    );
    expect(
      await escreverRespostaComOperacao("Obrigado, Maria! Chama no WhatsApp que a gente agenda seu próximo pedido.", contadoPeloCliente),
    ).toBeTruthy();
  });

  it("e o piso continua barrando o que o cliente NUNCA contou", async () => {
    const contadoPeloCliente = extrairVerdadeOperacional("Atendemos de segunda a sábado, das 9h às 19h.", "Padaria do João");
    expect(
      await escreverRespostaComOperacao("Obrigado! Entregamos em toda a zona sul em até 30 minutos.", contadoPeloCliente),
      "ligar a fiação não pode virar porta aberta",
    ).toBeNull();
  });
});

async function escreverRespostaComOperacao(texto: string, operacao: unknown) {
  generate.mockResolvedValue({ ok: true, data: { resposta: texto } });
  return escreverResposta({
    workspaceId: "ws1", negocio: "Padaria do João", tom: "", autor: "Maria", estrelas: 5,
    comentario: "o pão é ótimo",
    verdade: { ...VERDADE, operacao } as never,
  });
}

// ── DESCARTE NÃO É SILÊNCIO ─────────────────────────────────────────────────
//
// Antes, a resposta que não saía virava uma linha em `falhas` e nada mais. A
// avaliação ficava `pendente` no banco PARA SEMPRE: a guarda de idempotência
// impede que ela seja processada de novo, então não havia segunda chance nem
// gente avisada.
describe("resposta que não sai VIRA ESCALAÇÃO, não silêncio", () => {
  it("barrada pelo piso → escalada, com o motivo em português", async () => {
    generate.mockResolvedValue({ ok: true, data: { resposta: "Obrigado! Liga no (11) 98888-7777 que a gente resolve." } });
    const r = await cuidarDasAvaliacoes();

    expect(r.escaladas, "ninguém fica esperando para sempre").toBe(1);
    expect(r.respondidas).toBe(0);
    const d = db.googleReview.update.mock.calls[0]![0].data;
    expect(d.status).toBe("escalada");
    expect(d.escalatedReason).toMatch(/não informou|precisa ser escrita por gente/);
  });

  it("o rascunho que INVENTOU dado não é guardado — ninguém publica isso com um clique", async () => {
    generate.mockResolvedValue({ ok: true, data: { resposta: "Obrigado! Liga no (11) 98888-7777 que a gente resolve." } });
    await cuidarDasAvaliacoes();
    expect(db.googleReview.update.mock.calls[0]![0].data.reply).toBeUndefined();
  });

  it("IA fora do ar → também escala; a avaliação não morre em `pendente`", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    const r = await cuidarDasAvaliacoes();
    expect(r.escaladas).toBe(1);
    expect(db.googleReview.update.mock.calls[0]![0].data.status).toBe("escalada");
  });

  it("o time é chamado com todas as letras", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    await cuidarDasAvaliacoes();
    const e = db.activityEvent.create.mock.calls[0]![0].data;
    expect(e.type).toBe("avaliacao_sem_resposta");
    expect(e.message).toMatch(/NÃO conseguiu escrever/);
  });

  it("`redigirResposta` diz POR QUE não saiu — motivo mudo não vira escalada legível", async () => {
    generate.mockResolvedValue({ ok: false, error: "sem provedor" });
    const r = await redigirResposta({
      workspaceId: "ws1", negocio: "X", tom: "", autor: "A", estrelas: 5, comentario: "bom", verdade: VERDADE,
    });
    expect(r.texto).toBeNull();
    expect(r.motivo).toMatch(/indisponível/);
  });
});

describe("quando o Google recusa", () => {
  it("o rascunho não se perde — alguém pode publicar à mão", async () => {
    responderAvaliacao.mockResolvedValue({ ok: false, erro: "o Google ainda não liberou o acesso" });
    const r = await cuidarDasAvaliacoes();
    expect(r.respondidas).toBe(0);
    const d = db.googleReview.update.mock.calls[0]![0].data;
    expect(d.reply).toBeTruthy();
    expect(d.status).toBe("escalada");
  });

  it("falha ao LER não derruba a rodada, e o motivo fica legível", async () => {
    listarAvaliacoes.mockResolvedValue({ ok: false, erro: "o Google ainda não liberou o acesso à API" });
    const r = await cuidarDasAvaliacoes();
    expect(r.novas).toBe(0);
    expect(r.falhas[0]).toMatch(/não liberou o acesso/);
  });
});

describe("A TRAVA DE CONSENTIMENTO — política da API do Google", () => {
  // A política do Business Profile proíbe automatizar resposta a avaliação
  // "sem o consentimento prévio e específico do usuário". Achado da auditoria
  // de 03/08/2026: sem esta trava, a única proteção era o 403 do Google.
  //
  // ⚠️ ESTE CONTRATO MUDOU EM 15/08/2026, por parecer formal do especialista
  //    `google`, e o que estava escrito aqui era o DEFEITO virando invariante.
  //
  //    A versão anterior afirmava: "sem consentimento, vira rascunho escalado,
  //    com `reply` preenchido — o trabalho não se perde". Só que produzir esse
  //    rascunho custava (a) uma chamada de IA paga e (b) a gravação, no banco
  //    desta casa, do NOME e do TEXTO de quem escreveu a avaliação — gente que
  //    nunca falou com a Dioli, num perfil que ninguém autorizou a automatizar.
  //    A trava era conferida DEPOIS das duas coisas: ela protegia o envio e
  //    chegava tarde para tudo o mais.
  //
  //    Agora ela é a PRIMEIRA pergunta do laço, antes até de listar no Google.
  //    O que se perde está declarado: perfil sem consentimento deixa de receber
  //    o rascunho. O que NÃO se perde: nada é registrado, então a primeira
  //    rodada depois do consentimento enxerga a fila inteira e a trata.
  it("sem consentimento: NADA é lido, NADA é gravado, NADA é gasto", async () => {
    db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO, autoReplyConsentAt: null }]);
    const r = await cuidarDasAvaliacoes();

    expect(listarAvaliacoes, "leu o perfil sem autorização").not.toHaveBeenCalled();
    expect(generate, "gastou IA sem autorização").not.toHaveBeenCalled();
    expect(db.googleReview.create, "guardou dado de avaliador sem autorização").not.toHaveBeenCalled();
    expect(responderAvaliacao).not.toHaveBeenCalled();
    expect(r.respondidas).toBe(0);
    expect(r.escaladas).toBe(0);
  });

  it("e o perfil pulado é DITO, com nome — trava silenciosa vira fila morta invisível", async () => {
    db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO, autoReplyConsentAt: null }]);
    expect((await cuidarDasAvaliacoes()).semConsentimento).toEqual(["Padaria do João"]);
  });

  it("com consentimento registrado, o elogio volta a sair sozinho", async () => {
    const r = await cuidarDasAvaliacoes();
    expect(r.respondidas).toBe(1);
  });
});
