// Phase B tests — ClientKnowledgeSnapshot built from DB truth.
// Prisma is mocked: we assert the mapping (null→undefined, missingFields, no PII)
// without a live database.

import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueRequest = vi.fn();
const findUniqueBrand = vi.fn();
const findUniqueClient = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    clientRequestDb: { findUnique: (...a: unknown[]) => findUniqueRequest(...a) },
    brandBrain: { findUnique: (...a: unknown[]) => findUniqueBrand(...a) },
    client: { findUnique: (...a: unknown[]) => findUniqueClient(...a) },
  },
}));

import { buildClientSnapshot, buildVerdadeDoCliente } from "@/lib/dioli-brain/client-snapshot";
import { conferirPisoDeVerdade } from "@/lib/agency/execution/piso-de-verdade";

beforeEach(() => {
  findUniqueRequest.mockReset();
  findUniqueBrand.mockReset();
  findUniqueClient.mockReset();
  findUniqueClient.mockResolvedValue(null);
});

describe("buildClientSnapshot", () => {
  it("known id with full BrandBrain → snapshot with mapped fields", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req1",
      clientId: "cli1",
      businessName: "Padaria Aurora",
      segment: "Alimentação",
      services: JSON.stringify(["Social Media", "Tráfego Pago"]),
      objectives: JSON.stringify(["Vender mais"]),
      rawContext: "Padaria de bairro.",
    });
    findUniqueBrand.mockResolvedValue({
      clientId: "cli1",
      tone: "Acolhedor e artesanal",
      positioning: "Padaria artesanal premium do bairro",
      targetAudience: "Moradores locais 25-55",
      typography: "Serifada elegante",
      primaryColor: "#3B2F2F",
      secondaryColor: "#F5E6D3",
    });

    const snap = await buildClientSnapshot("req1");
    expect(snap).not.toBeNull();
    expect(snap!.businessName).toBe("Padaria Aurora");
    expect(snap!.services).toEqual(["Social Media", "Tráfego Pago"]);
    expect(snap!.brandVoice).toBe("Acolhedor e artesanal");
    expect(snap!.positioning).toContain("artesanal");
    expect(snap!.fonts).toBe("Serifada elegante");
    expect(snap!.colors).toBe("#3B2F2F, #F5E6D3");
    // Fields with no DB column are reported missing, never invented.
    expect(snap!.preferredChannels).toBeUndefined();
    expect(snap!.missingFields).toContain("preferredChannels");
    expect(snap!.missingFields).toContain("visualStyle");
    expect(snap!.brandBrainComplete).toBe(false);
  });

  it("missing id → null", async () => {
    findUniqueRequest.mockResolvedValue(null);
    const snap = await buildClientSnapshot("nope");
    expect(snap).toBeNull();
  });

  it("request with no linked client → all brand fields missing, never invented", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req2",
      clientId: null,
      businessName: "Studio X",
      segment: "Design",
      services: "[]",
      objectives: "[]",
      rawContext: "",
    });
    const snap = await buildClientSnapshot("req2");
    expect(snap).not.toBeNull();
    expect(findUniqueBrand).not.toHaveBeenCalled();
    expect(snap!.positioning).toBeUndefined();
    expect(snap!.targetAudience).toBeUndefined();
    expect(snap!.missingFields.length).toBeGreaterThan(0);
    expect(snap!.brandBrainComplete).toBe(false);
  });

  it("empty BrandBrain string fields → undefined + listed in missingFields", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req3",
      clientId: "cli3",
      businessName: "Café Lua",
      segment: "Alimentação",
      services: "[]",
      objectives: "[]",
      rawContext: "",
    });
    findUniqueBrand.mockResolvedValue({
      clientId: "cli3",
      tone: "   ",
      positioning: "",
      targetAudience: null,
      typography: null,
      primaryColor: null,
      secondaryColor: null,
    });
    const snap = await buildClientSnapshot("req3");
    expect(snap!.brandVoice).toBeUndefined();
    expect(snap!.positioning).toBeUndefined();
    expect(snap!.colors).toBeUndefined();
    expect(snap!.missingFields).toContain("brandVoice");
    expect(snap!.missingFields).toContain("positioning");
  });
});

// ─── A VERDADE OPERACIONAL LIDA PELO SERVIDOR ───────────────────────────────
//
// O buraco que estes testes fecham: até aqui, quem chamava o piso determinístico
// montava a verdade do cliente à mão, com o que tivesse em mãos. Ancoragem que
// depende de quem chama não é ancoragem. Aqui o servidor lê o banco por conta
// própria — e o que o cliente não contou fica VAZIO, nunca preenchido.

const BRIEFING_DA_PADARIA = [
  "Padaria Aurora, no bairro Santana.",
  "Abrimos de segunda a sábado, das 6h às 20h.",
  "Fazemos entrega em Santana e no Tucuruvi, raio de 3 km.",
  "Aceitamos Pix e cartão de débito.",
  "Pedidos pelo WhatsApp (11) 98940-0692 ou pelo e-mail contato@aurora.com.br.",
  "Vendemos pão de fermentação natural, bolo e salgados.",
].join("\n");

describe("buildVerdadeDoCliente — o servidor lê a verdade, ninguém a entrega", () => {
  it("o que o cliente escreveu vira fato conferível", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req9", clientId: "cli9", businessName: "Padaria Aurora", segment: "Alimentação",
      services: JSON.stringify(["Social Media"]), objectives: "[]",
      rawContext: BRIEFING_DA_PADARIA,
      briefingJson: JSON.stringify({ budgetRange: "R$ 1.500", deadline: "30 dias" }),
    });
    findUniqueBrand.mockResolvedValue(null);
    findUniqueClient.mockResolvedValue({ id: "cli9", name: "Padaria Aurora", phone: "(11) 98940-0692", email: "contato@aurora.com.br", website: "https://aurora.com.br" });

    const v = await buildVerdadeDoCliente("req9");
    expect(v).not.toBeNull();
    expect(v!.operacao!.horarios).toEqual(expect.arrayContaining(["06:00", "20:00"]));
    expect(v!.operacao!.dias).toEqual(expect.arrayContaining(["seg", "sab"]));
    expect(v!.operacao!.areas).toEqual(expect.arrayContaining(["santana", "tucuruvi"]));
    expect(v!.operacao!.raioEntregaKm).toBe(3);
    expect(v!.operacao!.pagamentos).toEqual(expect.arrayContaining(["pix", "debito"]));
    expect(v!.operacao!.canais).toEqual(expect.arrayContaining(["whatsapp", "site"]));
    // O site do cadastro é canal e endereço atestados — veio dele.
    expect(v!.operacao!.handles).toContain("aurora.com.br");
    // Valor informado no briefing vira número comparável.
    expect(v!.valores).toContain(1500);
  });

  it("a peça é conferida contra a verdade do banco — as duas metades", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req9", clientId: "cli9", businessName: "Padaria Aurora", segment: "Alimentação",
      services: "[]", objectives: "[]", rawContext: BRIEFING_DA_PADARIA, briefingJson: null,
    });
    findUniqueBrand.mockResolvedValue(null);
    findUniqueClient.mockResolvedValue({ id: "cli9", name: "Padaria Aurora", phone: "(11) 98940-0692", email: "contato@aurora.com.br", website: null });

    const v = (await buildVerdadeDoCliente("req9"))!;
    // Passa: é o que ele contou.
    expect(conferirPisoDeVerdade("Abrimos de segunda a sábado, das 6h às 20h. Entrega em Santana.", v).aprovado).toBe(true);
    // Viola: contradiz.
    expect(conferirPisoDeVerdade("Abrimos todos os dias até meia-noite.", v).aprovado).toBe(false);
    expect(conferirPisoDeVerdade("Entregamos em toda a cidade.", v).aprovado).toBe(false);
    // Viola: o cliente nunca falou de parcelamento.
    expect(conferirPisoDeVerdade("Parcelamos em 6x sem juros.", v).aprovado).toBe(false);
  });

  it("cliente sem briefing → verdade vazia, e vazio REPROVA em vez de liberar", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req10", clientId: null, businessName: "Studio Novo", segment: "Design",
      services: "[]", objectives: "[]", rawContext: "", briefingJson: null,
    });

    const v = (await buildVerdadeDoCliente("req10"))!;
    expect(v.operacao!.horarios).toEqual([]);
    expect(findUniqueClient).not.toHaveBeenCalled();
    const r = conferirPisoDeVerdade("Atendemos das 9h às 18h.", v);
    expect(r.aprovado).toBe(false);
    expect(r.violacoes[0]!.id).toBe("horario_nao_informado");
  });

  it("solicitação inexistente → null, não uma verdade vazia inventada na hora", async () => {
    findUniqueRequest.mockResolvedValue(null);
    expect(await buildVerdadeDoCliente("nope")).toBeNull();
  });

  it("PII do cliente não entra no snapshot", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "req11", clientId: null, businessName: "Padaria Aurora", segment: "Alimentação",
      services: "[]", objectives: "[]", rawContext: BRIEFING_DA_PADARIA, briefingJson: null,
    });
    const snap = await buildClientSnapshot("req11");
    const serializado = JSON.stringify(snap!.operacao);
    expect(serializado).not.toMatch(/98940/);
    expect(serializado).not.toMatch(/contato@aurora/);
    // Mas o canal continua atestado: a palavra "WhatsApp" é fato, o número é PII.
    expect(snap!.operacao!.canais).toContain("whatsapp");
  });
});
