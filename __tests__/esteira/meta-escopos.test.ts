import { describe, it, expect } from "vitest";
import { DEFAULT_SCOPES, SCOPES_QUE_EXIGEM_APP_REVIEW } from "@/lib/integrations/meta/config";

describe("as permissões que pedimos à Meta", () => {
  it("pede anúncios — sem isto não existe gestão de tráfego pago", () => {
    // A consequência de faltar é absoluta e sem contorno: a Meta recusa
    // qualquer chamada de anúncio, com token válido e conta conectada.
    expect(DEFAULT_SCOPES).toContain("ads_management");
    expect(DEFAULT_SCOPES).toContain("ads_read");
  });

  it("pede publicação e métricas do Instagram", () => {
    expect(DEFAULT_SCOPES).toContain("instagram_content_publish");
    expect(DEFAULT_SCOPES).toContain("instagram_manage_insights");
  });

  it("pede WhatsApp para o atendimento", () => {
    expect(DEFAULT_SCOPES).toContain("whatsapp_business_messaging");
  });

  it("nenhuma permissão repetida — duplicata é sinal de merge malfeito", () => {
    expect(new Set(DEFAULT_SCOPES).size).toBe(DEFAULT_SCOPES.length);
  });

  it("toda permissão avançada declarada é uma que realmente pedimos", () => {
    // A lista existe para a tela avisar "isto depende da Meta". Listar algo que
    // não pedimos faria a tela mentir sobre o que está pendente.
    for (const s of SCOPES_QUE_EXIGEM_APP_REVIEW) {
      expect(DEFAULT_SCOPES, `${s} está na lista de avançadas mas não é pedido`).toContain(s);
    }
  });
});
