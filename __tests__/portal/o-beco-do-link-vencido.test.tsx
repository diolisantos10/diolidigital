// ═══════════════════════════════════════════════════════════════════════════
// OS DOIS BECOS DO ACESSO — medidos ao vivo em 29/08/2026, no celular
// ═══════════════════════════════════════════════════════════════════════════
//
//  1. 🔴 `/portal/access` sem token redirecionava (307) para `/portal/invalid`,
//     e **essa rota não existia**. O cliente recebia o 404 padrão do Next —
//     *"404 · This page could not be found."*, em inglês, sem marca, sem uma
//     palavra e sem botão. Quem clicou num link velho de e-mail conclui que a
//     agência sumiu.
//
//  2. 🔴 O token que morria no meio da sessão virava a string **"Access
//     denied"**, em vermelho, embaixo do botão "Aprovar". A tela descartava o
//     `res.status` (`throw new Error(j.error ?? "HTTP …")`), e o tradutor de
//     erro só reconhece o status quando a string é literalmente "HTTP 403".
//     Medido com o card real de aprovação, em 375px.
//
// ── A RÉGUA DESTE ARQUIVO ─────────────────────────────────────────────────
//
// Redirecionamento para rota que não existe é a classe de defeito que NENHUM
// teste de unidade pega, porque as duas metades estão certas cada uma por si:
// o `location` aponta para `/portal/invalid` (certo) e a página… não existe.
// Por isso o primeiro teste sai do código e vai ao DISCO: ele pergunta se o
// destino do redirecionamento tem arquivo. É o que estava faltando.
//
// Provado por mutação (conferido antes de relatar):
//   • apagar `app/portal/invalid/page.tsx`  → "o destino do redirecionamento existe" VERMELHO
//   • voltar `throw new Error(j.error ?? …)` → "a tela lê o status" VERMELHO
//   • `motivoDaNegativa` devolvendo "encerrado" para todo 403 → "CSRF" VERMELHO

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const validatePortalAccess = vi.hoisted(() => vi.fn());
const conferirTokenDoPortal = vi.hoisted(() => vi.fn(async (): Promise<boolean> => false));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess,
  conferirTokenDoPortal,
}));

import { GET as entradaGET } from "@/app/portal/access/route";
import { AcessoBloqueado } from "@/components/portal/cliente/AcessoBloqueado";
import { motivoDaNegativa, falhaDoPortal } from "@/components/portal/cliente/acesso";

const raiz = join(__dirname, "..", "..");
const fonte = (p: string) => readFileSync(join(raiz, p), "utf8");

beforeEach(() => vi.clearAllMocks());

describe("1. o destino do redirecionamento EXISTE", () => {
  it("a rota para onde /portal/access manda quem não tem token tem página no disco", async () => {
    const res = await entradaGET(new NextRequest("http://localhost/portal/access"));

    const destino = new URL(res.headers.get("location") ?? "", "http://localhost").pathname;
    expect(destino).toBe("/portal/invalid");

    // ⬇️ A metade que faltava. Sem este arquivo, o cliente recebe o 404 do Next.
    const arquivo = join(raiz, "app", ...destino.split("/").filter(Boolean), "page.tsx");
    expect(existsSync(arquivo)).toBe(true);
  });

  it("a página é a tela da casa, não uma folha em branco", () => {
    const src = fonte("app/portal/invalid/page.tsx");
    expect(src).toContain("AcessoBloqueado");
    // Portal de cliente nunca é conteúdo de busca.
    expect(src).toMatch(/robots/);
  });
});

describe("2. a tela lê o status em vez de jogá-lo fora", () => {
  it("o 403 de token vencido vira perda de acesso, com o motivo do servidor", () => {
    expect(motivoDaNegativa(403, { error: "Access denied", reason: "expired" })).toBe("expirado");
    expect(motivoDaNegativa(403, { error: "Access denied", reason: "revoked" })).toBe("revogado");
    expect(motivoDaNegativa(403, { error: "Access denied", reason: "not_found" })).toBe("invalido");
    // As rotas de orçamento e de esteira negam em português e SEM `reason`.
    expect(motivoDaNegativa(403, { error: "Acesso negado" })).toBe("encerrado");
    // Cookie que sumiu do navegador no meio da sessão.
    expect(motivoDaNegativa(400, { error: "token é obrigatório" })).toBe("encerrado");
  });

  it("o 403 de ORIGEM NÃO CONFIÁVEL não expulsa ninguém", () => {
    // Tratar todo 403 como "seu link morreu" mandaria o cliente pedir um link
    // novo que não resolveria nada — a trava de CSRF continuaria recusando.
    expect(motivoDaNegativa(403, { error: "Origem não confiável para esta ação." })).toBeNull();
  });

  it("erro comum não vira perda de acesso — e leva o status junto", async () => {
    expect(motivoDaNegativa(409, { error: "Este orçamento acabou de ser decidido." })).toBeNull();
    expect(motivoDaNegativa(500, {})).toBeNull();

    const quinhentos = new Response("{}", { status: 500 });
    const falha = await falhaDoPortal(quinhentos, "registrar sua resposta");
    expect(falha.bloqueio).toBeNull();
    // É o número que a tela descartava: sem ele o tradutor não sabe traduzir.
    expect(falha.mensagem).toContain("500");
  });

  it("o corpo em inglês da API NUNCA chega à tela", async () => {
    const negado = new Response(JSON.stringify({ error: "Access denied", reason: "expired" }), { status: 403 });
    const falha = await falhaDoPortal(negado, "registrar sua resposta");
    expect(falha.bloqueio).toBe("expirado");
    expect(falha.mensagem).not.toContain("Access denied");
    expect(falha.mensagem).toContain("expirou");
  });

  it("as três decisões do portal chamam o leitor de status, e nenhuma descarta", () => {
    const src = fonte("app/portal/access/[token]/page.tsx");
    // A linha que produzia "Access denied" na cara do cliente.
    const descarta = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .filter((l) => l.includes("throw new Error(j.error"));
    expect(descarta).toEqual([]);
    // Aprovação, orçamento e esteira — as três.
    expect(src.match(/await relatarFalha\(res,/g) ?? []).toHaveLength(3);
  });
});

describe("3. a tela do beco fala português e dá o próximo passo", () => {
  const html = (m: Parameters<typeof AcessoBloqueado>[0]) => renderToStaticMarkup(<AcessoBloqueado {...m} />);

  it("quem chegou por um link sem token lê o que houve e o que fazer", () => {
    const saida = html({ motivo: "sem-link", contexto: "entrada" });
    expect(saida).toContain("Dioli");                       // a marca vem antes da má notícia
    expect(saida).toContain("O que fazer agora");
    expect(saida).toContain("Peça um link novo");
    expect(saida).toContain("https://wa.me/");              // o passo tem ferramenta
    expect(saida).not.toMatch(/could not be found|Access denied|Not Found/i);
  });

  it("quem estava DENTRO não é mandado conferir um link que não usou", () => {
    const sessao = html({ motivo: "expirado", contexto: "sessao" });
    expect(sessao).toContain("enquanto você estava aqui");
    expect(sessao).toContain("não é culpa sua");
    expect(sessao).toContain("não foi registrada");         // a decisão que se perdeu
    expect(sessao).toContain('role="alert"');               // apareceu no lugar de outra tela

    const entrada = html({ motivo: "expirado", contexto: "entrada" });
    expect(entrada).not.toContain("enquanto você estava aqui");
  });

  it("os seis motivos rendem tela digna — nenhum cai em branco", () => {
    for (const motivo of ["sem-link", "expirado", "revogado", "invalido", "encerrado", "rede"] as const) {
      for (const contexto of ["entrada", "sessao"] as const) {
        const saida = html({ motivo, contexto });
        expect(saida).toContain("O que fazer agora");
        expect(saida.length).toBeGreaterThan(400);
      }
    }
  });

  it("“Tentar de novo” só existe quando tentar de novo resolve", () => {
    expect(html({ motivo: "rede", contexto: "entrada", aoTentarDeNovo: () => {} })).toContain("Tentar de novo");
    expect(html({ motivo: "expirado", contexto: "sessao" })).not.toContain("Tentar de novo");
  });
});
