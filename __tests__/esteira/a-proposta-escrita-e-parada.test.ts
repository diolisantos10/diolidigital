// A PROPOSTA ESCRITA E PARADA — o único empurrão por defeito da 8ª volta.
//
// 26/08/2026: a solicitação do cliente oculto ficou **27 minutos** em
// `proposal_pending` com a proposta pronta (6 artefatos) e produziu zero cards
// e zero eventos. O portal dele dizia "Conhecendo o seu negócio · 0%". Foi
// preciso empurrar à mão (`action:"send-proposal"`).
//
// A casa tem perna para o "pronto e parado" um degrau adiante (o pacote de
// entregas). Uma etapa antes, no funil comercial, NENHUMA consulta procurava
// por isto — a solicitação não estava falhando, estava quieta num estado
// válido. Nada pronto pode ficar parado sem dono e sem próxima ação.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn() },
  portalMessage: { groupBy: vi.fn() },
  portalAccess: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  propostasParadas, apenasNaoEntregues, fraseDaParada, MINUTOS_DE_PACIENCIA,
} from "@/lib/agency/esteira/proposta-parada";

const AGORA = new Date("2026-08-26T09:15:00Z");
// 27 minutos parada — a duração exata do caso medido.
const HA_27_MIN = new Date("2026-08-26T08:48:00Z");

const COM_NUMERO = JSON.stringify({ estimate: { totalMin: 790, totalMax: 1490, confidence: "high", items: [{ label: "x" }] } });

function solicitacao(over: Record<string, unknown> = {}) {
  return {
    id: "req1", businessName: "GRAO DO BECO NOME TESTE", status: "proposal_pending",
    updatedAt: HA_27_MIN, briefingJson: COM_NUMERO, ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.portalMessage.groupBy.mockResolvedValue([]);
  db.portalAccess.findMany.mockResolvedValue([]);
});

describe("o olho que faltava", () => {
  it("ACHA o caso medido: proposta pronta, 27 min, nada chegou ao cliente", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao()]);
    const paradas = await propostasParadas(AGORA);
    expect(paradas).toHaveLength(1);
    expect(paradas[0].paradaHaMinutos).toBe(27);
    expect(paradas[0].temEstimativa).toBe(true);
    expect(paradas[0].temPortaDeAceite).toBe(false);
    // Dono e próxima ação, sempre — parada sem dono é a parada que ninguém resolve.
    expect(paradas[0].dono).toBe("sdr");
    expect(paradas[0].proximaAcao).toContain("ENTREGAR");
    expect(paradas[0].proximaAcao).toContain("GRAO DO BECO NOME TESTE");
  });

  it("a janela do banco só pede o que já passou da paciência", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await propostasParadas(AGORA);
    const where = db.clientRequestDb.findMany.mock.calls[0][0].where;
    expect(where.status.in).toContain("proposal_pending");
    const corte = where.updatedAt.lt as Date;
    expect(AGORA.getTime() - corte.getTime()).toBe(MINUTOS_DE_PACIENCIA * 60_000);
  });

  it("a paciência é MENOR que o dano medido — senão a leitura nova perderia o próprio caso", () => {
    expect(MINUTOS_DE_PACIENCIA).toBeLessThan(27);
  });
});

describe("dois baldes: defeito da casa e espera legítima", () => {
  it("entregue e sem resposta é do CLIENTE — não é defeito, e mesmo assim é nomeada", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao()]);
    db.portalMessage.groupBy.mockResolvedValue([{ clientRequestId: "req1", _count: { _all: 1 } }]);
    db.portalAccess.findMany.mockResolvedValue([{ clientRequestId: "req1" }]);
    const paradas = await propostasParadas(AGORA);
    expect(paradas[0].dono).toBe("cliente");
    expect(paradas[0].proximaAcao).toContain("follow-up");
    expect(apenasNaoEntregues(paradas)).toHaveLength(0);
  });

  it("MENSAGEM SEM PORTA ainda é defeito da casa — ele não tem botão para responder", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao()]);
    db.portalMessage.groupBy.mockResolvedValue([{ clientRequestId: "req1", _count: { _all: 1 } }]);
    db.portalAccess.findMany.mockResolvedValue([]);
    const paradas = await propostasParadas(AGORA);
    expect(paradas[0].dono).toBe("sdr");
    expect(paradas[0].proximaAcao).toContain("não existe porta de aceite");
  });

  it("apenasNaoEntregues separa os dois baldes", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao(), solicitacao({ id: "req2", businessName: "OUTRO" })]);
    db.portalMessage.groupBy.mockResolvedValue([{ clientRequestId: "req2", _count: { _all: 3 } }]);
    db.portalAccess.findMany.mockResolvedValue([{ clientRequestId: "req2" }]);
    const paradas = await propostasParadas(AGORA);
    expect(apenasNaoEntregues(paradas).map((p) => p.clientRequestId)).toEqual(["req1"]);
  });
});

describe("a leitura não derruba a rodada das outras pernas", () => {
  it("banco fora do ar vira lista vazia, nunca exceção", async () => {
    db.clientRequestDb.findMany.mockRejectedValue(new Error("db down"));
    await expect(propostasParadas(AGORA)).resolves.toEqual([]);
  });

  it("uma leitura acessória que falha não apaga a parada — ela vira o lado seguro", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao()]);
    db.portalAccess.findMany.mockRejectedValue(new Error("db down"));
    const paradas = await propostasParadas(AGORA);
    // Sem porta comprovada, a bola é da casa: o erro nunca vira "o cliente já
    // recebeu", que seria a leitura que esconde o defeito.
    expect(paradas[0].dono).toBe("sdr");
  });
});

describe("a frase que vai para o alarme", () => {
  it("nomeia o negócio, o tempo, o número, o dono e a próxima ação", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([solicitacao()]);
    const frase = fraseDaParada((await propostasParadas(AGORA))[0]);
    expect(frase).toContain("GRAO DO BECO NOME TESTE");
    expect(frase).toContain("27 min");
    expect(frase).toContain("COM número calculado");
    expect(frase).toContain("porta de aceite AUSENTE");
    expect(frase).toContain("Dono: Atendimento");
    expect(frase).toContain("Próxima ação:");
  });
});
