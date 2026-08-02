import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  googleConnection: { findMany: vi.fn(), update: vi.fn() },
  googleReview: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const listarAvaliacoes = vi.hoisted(() => vi.fn());
const responderAvaliacao = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/integrations/google/client", () => ({ listarAvaliacoes, responderAvaliacao }));

import {
  cuidarDasAvaliacoes, escreverResposta, ESTRELAS_PARA_RESPOSTA_AUTOMATICA,
} from "@/lib/agency/esteira/avaliacoes";

const CONEXAO = {
  id: "gc1", workspaceId: "ws1", clientId: "c1",
  title: "Padaria do João", locationName: "locations/1", accountName: "accounts/1",
  status: "connected",
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
  db.googleConnection.findMany.mockResolvedValue([{ ...CONEXAO }]);
  db.googleConnection.update.mockResolvedValue({});
  db.googleReview.findUnique.mockResolvedValue(null);
  db.googleReview.create.mockResolvedValue({ id: "r1" });
  db.googleReview.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({ name: "Padaria do João", phone: null, email: null, brandBrain: { tone: "acolhedor" } });
  db.activityEvent.create.mockResolvedValue({});
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
    db.googleReview.findUnique.mockResolvedValue({ id: "r0" });
    const r = await cuidarDasAvaliacoes();
    expect(r.novas).toBe(0);
    expect(responderAvaliacao).not.toHaveBeenCalled();
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
