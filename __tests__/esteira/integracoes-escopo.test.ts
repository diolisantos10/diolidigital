import { describe, it, expect } from "vitest";
import {
  MOCK_INTEGRATIONS,
  escopoDaIntegracao,
  integracoesDaAgencia,
  integracoesDoCliente,
} from "@/lib/agency/integrations";

// A pergunta do CEO que originou isto: "o que eu vou conectar aqui o Google
// Analytics? De quem?". Numa tela global ela não tem resposta.
describe("de quem é a conta que cada integração conecta", () => {
  it("provedor de IA é da agência — uma assinatura serve todos os clientes", () => {
    expect(escopoDaIntegracao("ai_provider")).toBe("agencia");
  });

  it("Analytics, Ads e publicação são do CLIENTE — uma conta por cliente", () => {
    expect(escopoDaIntegracao("analytics")).toBe("cliente");
    expect(escopoDaIntegracao("ads_platform")).toBe("cliente");
    expect(escopoDaIntegracao("publishing")).toBe("cliente");
  });

  it("toda integração do catálogo tem escopo — nenhuma fica sem dono", () => {
    for (const i of MOCK_INTEGRATIONS) {
      expect(escopoDaIntegracao(i.category), `${i.name} sem escopo`).toBeDefined();
    }
  });

  it("os dois grupos somam o catálogo inteiro e não se sobrepõem", () => {
    const agencia = integracoesDaAgencia(MOCK_INTEGRATIONS);
    const cliente = integracoesDoCliente(MOCK_INTEGRATIONS);
    expect(agencia.length + cliente.length).toBe(MOCK_INTEGRATIONS.length);
    const ids = new Set(agencia.map((i) => i.id));
    expect(cliente.every((i) => !ids.has(i.id))).toBe(true);
  });

  it("nenhuma ferramenta do cliente sobra na lista da agência", () => {
    // Este é o teste que impede a regressão: alguém adiciona "Google Ads" numa
    // categoria de agência e a tela volta a pedir uma conta que não existe.
    const nomes = integracoesDaAgencia(MOCK_INTEGRATIONS).map((i) => i.name.toLowerCase());
    for (const proibido of ["google ads", "analytics", "search console", "meta ads"]) {
      expect(nomes.some((n) => n.includes(proibido)), `${proibido} não é conta da agência`).toBe(false);
    }
  });
});
