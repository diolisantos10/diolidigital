// BLOCO E — CONVERSAS, WHATSAPP, ENTRADA E OPORTUNIDADES LEEM DO BANCO
// (CEO, 04/10/2026). Raio-x: as telas já liam das rotas; o que ainda contava
// pela cópia do navegador eram os CONTADORES do menu. Esta trava impede a
// volta: tela e contador destes quatro itens não leem `useAgencyStore`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const TELAS: Record<string, string> = {
  "Caixa de entrada (Conversas)": "components/agency/portal/CaixaDeEntrada.tsx",
  "WhatsApp (Conversas)": "app/agency/whatsapp/page.tsx",
  "Quem procurou (Entrada)": "app/agency/leads/page.tsx",
  "Avisos de orçamento (Entrada)": "app/agency/avisos-de-orcamento/page.tsx",
  "Oportunidades": "app/agency/oportunidades/page.tsx",
};

describe("as telas leem do banco, sem cópia do navegador", () => {
  for (const [nome, arquivo] of Object.entries(TELAS)) {
    it(nome, () => {
      const fonte = ler(arquivo);
      expect(fonte).not.toContain("useAgencyStore");
      expect(fonte).toMatch(/fetch\(/);
    });
  }

  it("Solicitações: a cópia do navegador continua desligada", () => {
    expect(ler("app/agency/requests/page.tsx")).toContain("const MOSTRAR_COPIA_DO_NAVEGADOR = false");
  });
});

describe("os contadores do menu vêm do banco", () => {
  const menu = ler("components/agency/layout/AgencySidebar.tsx");
  const trecho = (de: string, ate: string) => menu.slice(menu.indexOf(de), menu.indexOf(ate, menu.indexOf(de) + de.length));

  it("Entrada conta as solicitações novas pela rota", () => {
    const t = trecho("function useNewRequestsCount", "\n}\n");
    expect(t).toContain("/api/brain/client-requests?status=new");
    expect(t).not.toContain("useAgencyStore");
  });

  it("Aprovações conta pela rota", () => {
    const t = trecho("function usePendingCount", "\n}\n");
    expect(t).toContain("/api/agency/aprovacoes");
    expect(t).not.toContain("useAgencyStore");
  });

  it("Conversas conta pela caixa (rota de mensagens)", () => {
    expect(menu).toContain("useCaixaDeEntrada()");
    expect(ler("components/agency/portal/useCaixaDeEntrada.ts")).not.toContain("useAgencyStore");
  });
});
