import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn() },
  brandBrain: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { semearMarcaDoBriefing } from "@/lib/agency/execution/semear-marca";

function briefing(obj: unknown) {
  return {
    businessName: "Sushi Cazza",
    briefingJson: JSON.stringify(obj),
    rawContext: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.brandBrain.findUnique.mockResolvedValue(null);
  db.brandBrain.create.mockResolvedValue({});
  db.brandBrain.update.mockResolvedValue({});
});

describe("o briefing do cliente vira o cérebro de marca", () => {
  it("grava tom, público e posicionamento que o cliente contou", async () => {
    // O buraco que isto fecha: em produção havia clientes, projetos e entregas
    // e ZERO BrandBrain. Os especialistas produziam sem saber de quem era a marca.
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({
      scope: {
        toneOfVoice: "Sofisticado e acolhedor",
        targetAudience: "Famílias e casais de alta renda",
        positioning: "Japonês premium acessível",
      },
    }));

    const r = await semearMarcaDoBriefing("c1", "cr1");
    expect(r.criou).toBe(true);
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.tone).toBe("Sofisticado e acolhedor");
    expect(dados.targetAudience).toBe("Famílias e casais de alta renda");
    expect(dados.positioning).toBe("Japonês premium acessível");
  });

  it("entende os apelidos em português — briefing antigo continua valendo", async () => {
    // O formulário já mudou de nome de campo mais de uma vez. Procurar por um
    // nome só é perder dado que está lá.
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({
      tomDeVoz: "Direto",
      publicoAlvo: "Jovens de 18 a 25",
      tipografia: "Inter",
    }));

    await semearMarcaDoBriefing("c1", "cr1");
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.tone).toBe("Direto");
    expect(dados.targetAudience).toBe("Jovens de 18 a 25");
    expect(dados.typography).toBe("Inter");
  });

  it("separa a paleta em cor primária e secundária", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({ colors: "#1A1A1A · #C0392B · #F5F5F5" }));
    await semearMarcaDoBriefing("c1", "cr1");
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.primaryColor).toBe("#1A1A1A");
    expect(dados.secondaryColor).toBe("#C0392B");
  });

  it("entende cor escrita por extenso, não só código", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({ cores: "preto, vermelho e branco" }));
    await semearMarcaDoBriefing("c1", "cr1");
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.primaryColor).toBe("preto");
    expect(dados.secondaryColor).toBe("vermelho");
  });

  it("o nome do negócio serve de nome de marca quando ele não deu outro", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({}));
    await semearMarcaDoBriefing("c1", "cr1");
    expect(db.brandBrain.create.mock.calls[0]![0].data.brandName).toBe("Sushi Cazza");
  });
});

describe("o que o semeador NUNCA faz", () => {
  it("não inventa o que o cliente não contou — campo vazio segue vazio", async () => {
    // Vazio aqui não é falha: é o que faz o especialista PEDIR o material em vez
    // de preencher por inferência. Inventar seria a falha.
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({ toneOfVoice: "Direto" }));
    const r = await semearMarcaDoBriefing("c1", "cr1");
    const dados = db.brandBrain.create.mock.calls[0]![0].data;
    expect(dados.primaryColor).toBeUndefined();
    expect(dados.typography).toBeUndefined();
    expect(r.camposVazios).toContain("primaryColor");
  });

  it("não sobrescreve o que já existe — ajuste manual vale mais que o briefing", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({ toneOfVoice: "Do briefing", colors: "#000000" }));
    db.brandBrain.findUnique.mockResolvedValue({ clientId: "c1", tone: "Ajustado à mão", primaryColor: null });

    await semearMarcaDoBriefing("c1", "cr1");
    const dados = db.brandBrain.update.mock.calls[0]![0].data;
    expect(dados.tone).toBeUndefined();          // preservou o ajuste manual
    expect(dados.primaryColor).toBe("#000000");  // preencheu só o que faltava
  });

  it("marca já completa → não escreve nada", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(briefing({ toneOfVoice: "X" }));
    // Tudo que o briefing traria já está preenchido — inclusive o nome da marca,
    // que o semeador deriva do nome do negócio quando falta.
    db.brandBrain.findUnique.mockResolvedValue({ clientId: "c1", tone: "Já tinha", brandName: "Já tinha" });
    await semearMarcaDoBriefing("c1", "cr1");
    expect(db.brandBrain.update).not.toHaveBeenCalled();
    expect(db.brandBrain.create).not.toHaveBeenCalled();
  });

  it("briefing corrompido não derruba a criação do projeto", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ businessName: "X", briefingJson: "{isso não é json", rawContext: "" });
    const r = await semearMarcaDoBriefing("c1", "cr1");
    expect(r.criou).toBe(true);
  });

  it("solicitação inexistente → sai limpo, sem escrever", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const r = await semearMarcaDoBriefing("c1", "cr1");
    expect(r.criou).toBe(false);
    expect(db.brandBrain.create).not.toHaveBeenCalled();
  });
});
