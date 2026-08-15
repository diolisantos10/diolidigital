// TESTES 7, 8 e 9 do contrato — quem vê, quem escreve, e quem NUNCA escreve.
//
// ── A REGRA, EM UMA FRASE ────────────────────────────────────────────────
// Todo mundo de dentro VÊ tudo; cada um ESCREVE só na sua área; integração
// ninguém de dentro escreve, nem Master.
//
// ── POR QUE "VER TUDO" NÃO É AFROUXAMENTO ────────────────────────────────
// O time inteiro precisa consultar o que as outras áreas produziram: o Design
// lê o Brand Hub, o Social lê a Estratégia, o Comercial lê a operação antes de
// falar com o cliente. Esconder aba de quem precisa consultar não protege nada
// — produz cópia de informação por WhatsApp, que é o vazamento de verdade.
//
// ── E POR QUE O BOTÃO NÃO SOME ───────────────────────────────────────────
// Sumir com o controle ensina que a função não existe, e a pessoa vai pedir por
// fora do sistema. Desabilitado com motivo ensina DE QUEM É a área. Este teste
// exige as duas coisas: o controle presente e o motivo escrito.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PAPEIS_INTERNOS,
  podeVerClienteInterno,
  podeVerAba,
  podeEscreverNaAba,
  podeEscreverNaArea,
  podeAlterarIntegracoes,
  permissoesDoWorkspace,
  MOTIVO_SEM_ESCRITA,
} from "@/lib/agency/clients/workspace/permissoes";
import {
  CLIENT_WORKSPACE_TAB_IDS,
  CLIENT_WORKSPACE_TABS,
} from "@/components/agency/clients/workspace/client-workspace-tabs";
import { isNavAllowed, getRolePermissions, type AgencyRole } from "@/lib/agency/roles";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { IntegrationsTab } = await import("@/components/agency/clients/workspace/IntegrationsTab");
const { ProjectsTab } = await import("@/components/agency/clients/workspace/ProjectsTab");
const { render, texto, vistaCheia, permsDe } = await import("./_fixture");

describe("7. TODO papel interno vê a lista de clientes e as doze abas", () => {
  it("são seis papéis internos — `client` é do portal e não está aqui", () => {
    expect([...PAPEIS_INTERNOS].sort()).toEqual(
      ["ads_staff", "design_staff", "executivo_comercial", "master", "project_manager", "social_staff"].sort(),
    );
  });

  for (const role of PAPEIS_INTERNOS) {
    it(`"${role}" vê o cliente e TODAS as doze abas`, () => {
      expect(podeVerClienteInterno(role)).toBe(true);
      for (const aba of CLIENT_WORKSPACE_TAB_IDS) {
        expect(podeVerAba(role, aba), `${role} não vê ${aba}`).toBe(true);
      }
    });

    it(`"${role}" alcança /agency/clients pela navegação`, () => {
      // ⚠️ Isto quebrou de verdade: os três departamentos NÃO tinham
      // `/agency/clients` na allowlist. Quem produzia a peça não conseguia
      // abrir a página do cliente para quem produzia.
      expect(isNavAllowed(role, "/agency/clients"), `${role} não alcança a lista`).toBe(true);
      expect(getRolePermissions(role).canViewAllClients, `${role} com canViewAllClients falso`).toBe(true);
    });
  }
});

describe("8. cada papel só escreve na área autorizada", () => {
  const ESPERADO: Record<AgencyRole, string[]> = {
    master: ["overview", "requests", "strategy", "social", "branding", "design", "traffic", "projects", "approvals", "deliveries", "intel"],
    project_manager: ["overview", "requests", "strategy", "social", "branding", "design", "traffic", "projects", "approvals", "deliveries", "intel"],
    executivo_comercial: ["overview", "requests"],
    social_staff: ["social"],
    design_staff: ["branding", "design"],
    ads_staff: ["traffic"],
  };

  for (const role of PAPEIS_INTERNOS) {
    it(`"${role}" escreve exatamente onde deve — nem uma aba a mais`, () => {
      const escreve = CLIENT_WORKSPACE_TAB_IDS.filter((a) => podeEscreverNaAba(role, a));
      expect([...escreve].sort()).toEqual([...ESPERADO[role]!].sort());
    });
  }

  it("Social NÃO escreve em Branding, Design nem Tráfego", () => {
    for (const aba of ["branding", "design", "traffic"] as const) {
      expect(podeEscreverNaAba("social_staff", aba)).toBe(false);
    }
  });

  it("Ads NÃO escreve em Social nem em Aprovações", () => {
    expect(podeEscreverNaAba("ads_staff", "social")).toBe(false);
    expect(podeEscreverNaAba("ads_staff", "approvals")).toBe(false);
  });

  it("Comercial NÃO escreve em nenhuma área de produção", () => {
    for (const aba of ["social", "branding", "design", "traffic", "approvals", "deliveries"] as const) {
      expect(podeEscreverNaAba("executivo_comercial", aba)).toBe(false);
    }
  });

  it("toda área fechada tem MOTIVO escrito — 403 e botão mudo não ensinam nada", () => {
    for (const t of CLIENT_WORKSPACE_TABS) {
      expect(MOTIVO_SEM_ESCRITA[t.area]?.length ?? 0).toBeGreaterThan(30);
    }
  });

  it("o pacote que desce para a tela traz escrita E motivo para as doze", () => {
    const p = permissoesDoWorkspace("social_staff", CLIENT_WORKSPACE_TAB_IDS);
    for (const aba of CLIENT_WORKSPACE_TAB_IDS) {
      expect(typeof p.escrita[aba]).toBe("boolean");
      if (!p.escrita[aba]) expect(p.motivo[aba]).toBeTruthy();
      else expect(p.motivo[aba]).toBeNull();
    }
  });

  it("na tela, quem não pode escrever vê o controle DESABILITADO com o motivo — não sumido", () => {
    const html = render(
      <ProjectsTab
        view={vistaCheia()}
        perms={permsDe("social_staff")}
        setTab={(() => {}) as never}
        onOpenProject={() => {}}
        onNewProject={() => {}}
      />,
    );
    expect(html, "o botão sumiu em vez de aparecer desabilitado").toContain("Novo projeto");
    expect(html).toContain("disabled");
    expect(texto(html)).toContain("Projetos, aprovações e entregas são operados por Master ou Project Manager");
  });

  it("quem PODE escrever vê o mesmo controle ativo", () => {
    const html = render(
      <ProjectsTab
        view={vistaCheia()}
        perms={permsDe("project_manager")}
        setTab={(() => {}) as never}
        onOpenProject={() => {}}
        onNewProject={() => {}}
      />,
    );
    expect(html).toContain("Novo projeto");
    expect(html).not.toContain("Projetos, aprovações e entregas são operados");
  });

  it("a trava do servidor consulta o MESMO mapa que a tela — não uma segunda lista", () => {
    const guarda = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/guarda.ts"),
      "utf8",
    );
    expect(guarda).toContain("podeEscreverNaArea");
    expect(guarda).toContain("MOTIVO_SEM_ESCRITA");
    expect(guarda).toContain("status: 403");
  });

  it("a rota do cliente aplica a permissão no SERVIDOR, não só na tela", () => {
    const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/clients/[id]/page.tsx"), "utf8");
    expect(pagina).toContain("podeVerClienteInterno");
    expect(pagina).toContain("permissoesDoWorkspace");
    // A posse por workspace é a terceira camada: papel não amplia inquilino.
    expect(pagina).toContain("session.workspaceId");
  });

  it("a consulta ao banco é sempre por { id, workspaceId }", () => {
    const loader = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/carregar-cliente.ts"),
      "utf8",
    );
    expect(loader).toContain("where: { id: clientId, workspaceId }");
  });
});

describe("9. a equipe interna NÃO altera integrações — nem Master", () => {
  for (const role of PAPEIS_INTERNOS) {
    it(`"${role}" não pode alterar integração`, () => {
      expect(podeAlterarIntegracoes(role)).toBe(false);
      expect(podeEscreverNaArea(role, "somente-leitura")).toBe(false);
      expect(podeEscreverNaAba(role, "integrations")).toBe(false);
    });
  }

  it("a lista de papéis que escrevem em integração é VAZIA, não ['master']", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/permissoes.ts"),
      "utf8",
    );
    expect(fonte).toMatch(/"somente-leitura":\s*\[\s*\]/);
  });

  it("o servidor tem uma recusa própria e nomeada", () => {
    const guarda = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/guarda.ts"),
      "utf8",
    );
    expect(guarda).toContain("recusarAlteracaoDeIntegracao");
  });

  it("a aba de Integrações não renderiza NENHUM controle de escrita", () => {
    const html = render(
      <IntegrationsTab
        view={vistaCheia()}
        perms={permsDe("master")}
        setTab={(() => {}) as never}
        onOpenPortal={() => {}}
      />,
    );
    const t = texto(html).toLowerCase();
    for (const proibido of ["reconectar", "desconectar", "remover integração", "trocar conta", "alterar escopo"]) {
      // A palavra pode aparecer descrevendo a REGRA ("Conectar ou reconectar ·
      // Somente Cliente"); o que não pode é ela ser um controle ativo.
      const comoControle = new RegExp(`<button[^>]*>[^<]*${proibido}`, "i");
      expect(html, `controle proibido: ${proibido}`).not.toMatch(comoControle);
    }
    expect(t).toContain("somente leitura");
    expect(t).toContain("somente cliente");
  });

  it("o tipo trava o acesso: `agencyAccess` é o literal 'Somente leitura'", () => {
    const vista = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/vista.ts"),
      "utf8",
    );
    expect(vista).toMatch(/agencyAccess:\s*"Somente leitura"/);
  });

  it("o carregador NUNCA lê o token cifrado", () => {
    const loader = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/carregar-cliente.ts"),
      "utf8",
    );
    for (const segredo of ["accessTokenEncrypted", "refreshTokenEncrypted", "apiKeyEncrypted", "configBlob"]) {
      const semComentario = loader.replace(/^\s*\/\/.*$/gm, " ");
      expect(semComentario, `segredo lido: ${segredo}`).not.toContain(`${segredo}: true`);
    }
  });
});
