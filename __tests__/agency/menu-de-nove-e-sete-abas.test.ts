// O MENU DE 9 E AS 7 ABAS DO CLIENTE (CEO, 04/10/2026) — e a frase do botão Google.
//
// Trava as três promessas do bloco: (1) cada porta do menu tem página-índice
// registrada e nenhuma tela de dentro sumiu; (2) as 12 telas internas do
// cliente cabem em 7 abas, cada uma em UMA só, e link antigo cai na aba certa;
// (3) o erro do botão Google nunca mostra código técnico.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MENU_PRINCIPAL, itemAtivo } from "@/lib/agency/menu/menu-principal";
import { PAGINAS } from "@/lib/agency/organizacao/paginas";
import {
  ABAS_VISIVEIS,
  CLIENT_WORKSPACE_TABS,
  abaVisivelDe,
} from "@/components/agency/clients/workspace/client-workspace-tabs";
import { fraseDoErroGoogle } from "@/lib/auth/erro-do-google";

const existe = (href: string) =>
  fs.existsSync(path.join(process.cwd(), "app", href.replace(/^\//, ""), "page.tsx"));

describe("as portas do menu", () => {
  const portas = MENU_PRINCIPAL.filter((i) => i.filhos?.length);

  it("são quatro: Entrada, Conversas, Gestão e Agência por dentro", () => {
    expect(portas.map((p) => p.rotulo)).toEqual(["Entrada", "Conversas", "Gestão", "Agência por dentro"]);
  });

  it("toda porta tem página-índice e está registrada nas páginas da casa", () => {
    const registradas = JSON.stringify(PAGINAS);
    for (const p of portas) {
      expect(existe(p.href), p.href).toBe(true);
      expect(registradas, p.href).toContain(p.href);
    }
  });

  it("toda tela de dentro existe — nada foi apagado", () => {
    for (const p of portas) for (const f of p.filhos!) expect(existe(f.href), f.href).toBe(true);
  });

  it("o item fica aceso numa tela de dentro dele", () => {
    expect(itemAtivo("/agency/whatsapp")?.rotulo).toBe("Conversas");
    expect(itemAtivo("/agency/brain")?.rotulo).toBe("Agência por dentro");
    expect(itemAtivo("/agency/clients/abc")?.rotulo).toBe("Clientes");
  });
});

describe("as 7 abas do cliente", () => {
  it("nesta ordem", () => {
    expect(ABAS_VISIVEIS.map((a) => a.label)).toEqual([
      "Visão geral", "Projetos e entregas", "Social", "Marca", "Anúncios", "Conversas", "Financeiro",
    ]);
  });

  it("cada uma das 12 telas internas mora em exatamente uma aba", () => {
    for (const t of CLIENT_WORKSPACE_TABS) {
      const casas = ABAS_VISIVEIS.filter((a) => a.contem.includes(t.id));
      expect(casas.length, t.id).toBe(1);
    }
  });

  it("link antigo abre a aba que contém a tela", () => {
    expect(abaVisivelDe("design")).toBe("branding");
    expect(abaVisivelDe("approvals")).toBe("projects");
    expect(abaVisivelDe("intel")).toBe("overview");
    expect(abaVisivelDe("financeiro")).toBe("financeiro");
    expect(abaVisivelDe("lixo")).toBe("overview");
  });

  it("Financeiro sem conteúdo mostra estado vazio honesto, não tela falsa", () => {
    const shell = fs.readFileSync(
      path.join(process.cwd(), "components/agency/clients/workspace/ClientWorkspaceShell.tsx"), "utf8");
    expect(shell).toContain("Financeiro deste cliente ainda não está ligado");
  });
});

describe("o erro do botão Google fala com gente", () => {
  const codigos = ["redirect_uri_mismatch — Bad Request", "state_mismatch", "no_code", "access_denied",
    "invalid_client", "token_exchange", "userinfo", "unknown", "", "nao_configurado"];

  it("nenhuma frase repete o código técnico", () => {
    for (const c of codigos) {
      const f = fraseDoErroGoogle(c);
      expect(f, c).not.toMatch(/_|mismatch|invalid|token|Bad Request/i);
      expect(f, c).toMatch(/formulário/);
    }
  });

  it("o popup e a tela usam a frase, não o código", () => {
    const popup = fs.readFileSync(path.join(process.cwd(), "app/api/auth/google/callback/route.ts"), "utf8");
    expect(popup).not.toContain("Código do erro");
    const ida = fs.readFileSync(path.join(process.cwd(), "app/api/auth/google/route.ts"), "utf8");
    expect(ida).not.toContain("NextResponse.json");
    const tela = fs.readFileSync(path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"), "utf8");
    expect(tela).toContain("fraseDoErroGoogle(errorCode)");
    expect(tela).not.toContain("Erro ao autenticar com Google");
  });
});
