// TESTES 3, 4 e 5 do contrato — o cabeçalho, as setas e o deep-link.
//
// Aqui o casco é renderizado DE VERDADE. O que não roda em
// `renderToStaticMarkup` é `useEffect` — e é justamente ali que moram o
// `popstate` e a medição de rolagem. Por isso este arquivo cobre a ESTRUTURA
// (os controles existem, estão ligados, a folha esconde a barra) e a LÓGICA
// pura do deep-link; a interação de clique e o voltar do navegador são
// verificados no Playwright, contra o navegador real.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const { ClientWorkspaceShell } = await import("@/components/agency/clients/workspace/ClientWorkspaceShell");
const { CLIENT_WORKSPACE_TABS, abaDaQuery, CLIENT_WORKSPACE_TAB_PARAM } = await import(
  "@/components/agency/clients/workspace/client-workspace-tabs"
);
const { render, texto, vistaCheia, vistaVazia, fichaDeTeste, permsDe } = await import("./_fixture");

const BLOCOS = {
  fichaDeMarca: null, materialDeMarca: null, brandHub: null, redes: null,
  reconciliar: null, atividade: null, editar: null, portal: null,
};

function casco(view = vistaCheia(), role: Parameters<typeof permsDe>[0] = "master") {
  return render(
    <ClientWorkspaceShell
      view={view}
      sheet={fichaDeTeste()}
      perms={permsDe(role)}
      blocos={BLOCOS}
      onEditar={() => {}}
      onPortal={() => {}}
    />,
  );
}

describe("3. Ficha do cliente e Chat do cliente abrem pelo CABEÇALHO", () => {
  const html = casco();

  it("os dois botões existem no cabeçalho, não na trilha de abas", () => {
    const cabecalho = html.slice(0, html.indexOf("clientNavShell"));
    expect(cabecalho).toContain("Ficha do cliente");
    expect(cabecalho).toContain("Chat do cliente");
  });

  it("os dois são botões, não links — abrem modal sobre a aba em que se estava", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "components/agency/clients/workspace/ClientWorkspaceShell.tsx"),
      "utf8",
    );
    expect(fonte).toContain("onClick={() => setShowSheet(true)}");
    expect(fonte).toContain("onClick={() => setShowChat(true)}");
  });

  it("o botão do chat mostra quantas mensagens existem", () => {
    expect(texto(html)).toMatch(/Chat do cliente\s*1/);
  });

  it("com conversa vazia o contador não desenha um zero", () => {
    expect(texto(casco(vistaVazia()))).not.toMatch(/Chat do cliente\s*0/);
  });
});

describe("4. as setas navegam pelas abas e nenhuma barra de rolagem aparece", () => {
  const html = casco();
  const css = fs.readFileSync(
    path.join(process.cwd(), "components/agency/clients/workspace/workspace.css"),
    "utf8",
  );

  it("as duas setas existem, com rótulo acessível", () => {
    expect(html).toContain('aria-label="Ver abas anteriores"');
    expect(html).toContain('aria-label="Ver próximas abas"');
  });

  it("seta sem para onde ir nasce desabilitada — seta acesa que não move é botão morto", () => {
    // No primeiro render não há rolagem medida: as duas saem `disabled`, e a
    // medição do `useEffect` acende a de avançar quando houver overflow.
    expect(html).toContain('class="navArrow prev"');
    expect(html).toContain("disabled");
  });

  it("a trilha de abas esconde a barra de rolagem nos três motores", () => {
    const trilha = css.slice(css.indexOf(".clientTabs"));
    expect(trilha).toMatch(/scrollbar-width:\s*none/);
    expect(trilha).toMatch(/-ms-overflow-style:\s*none/);
    expect(trilha).toMatch(/::-webkit-scrollbar/);
  });

  it("as doze abas estão na trilha, na ordem, e a ativa é marcada", () => {
    const trilha = html.slice(html.indexOf("clientTabs"), html.indexOf("</nav>"));
    let pos = -1;
    for (const t of CLIENT_WORKSPACE_TABS) {
      const i = trilha.indexOf(t.label);
      expect(i, `aba "${t.label}" não está na trilha`).toBeGreaterThan(-1);
      expect(i, `aba "${t.label}" está fora de ordem`).toBeGreaterThan(pos);
      pos = i;
    }
    expect(trilha).toContain('aria-current="page"');
  });
});

describe("5. deep-link e voltar/avançar do navegador preservam a aba", () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), "components/agency/clients/workspace/ClientWorkspaceShell.tsx"),
    "utf8",
  );

  it("o parâmetro é um só, e é `tab`", () => {
    expect(CLIENT_WORKSPACE_TAB_PARAM).toBe("tab");
  });

  it("cada uma das doze tem um link direto que resolve nela mesma", () => {
    for (const t of CLIENT_WORKSPACE_TABS) expect(abaDaQuery(t.id)).toBe(t.id);
  });

  it("a troca de aba escreve na URL sem recarregar", () => {
    expect(fonte).toContain("window.history.pushState");
  });

  it("⚠️ NÃO usa router.push para trocar de aba", () => {
    // `router.push` reexecutaria o componente de servidor e recarregaria o
    // cliente inteiro do Prisma a cada clique de aba. Troca de aba é estado de
    // tela, não navegação de dado.
    const trechoDaTroca = fonte.slice(fonte.indexOf("const setTab ="), fonte.indexOf("// ── A trilha"));
    expect(trechoDaTroca).not.toContain("router.push");
  });

  it("voltar e avançar do navegador andam pelas abas", () => {
    expect(fonte).toContain('window.addEventListener("popstate"');
    expect(fonte).toContain('window.removeEventListener("popstate"');
  });

  it("o servidor já entrega a aba do deep-link — sem pisca na hidratação", () => {
    const pagina = fs.readFileSync(
      path.join(process.cwd(), "app/agency/clients/[id]/page.tsx"),
      "utf8",
    );
    expect(pagina).toContain("abaDaQuery");
    expect(pagina).toContain("abaInicial");
  });

  it("a aba ativa é trazida para o campo de visão — deep-link não abre a trilha no começo", () => {
    expect(fonte).toContain("scrollIntoView");
  });
});
