// OS TESTES NEGATIVOS — o que separa proteção de arrumação.
//
// Filtrar o menu esconde o link. Não fecha a porta. Este arquivo prova as duas
// portas que sobram quando o menu já escondeu tudo:
//
//   1. a URL digitada na barra de endereço (`proxy.ts`, camada de borda);
//   2. a chamada de API feita com `curl` (`guarda.ts`, camada de rota).
//
// Se algum destes ficar vermelho, o menu continua bonito e o dado continua
// saindo pela porta dos fundos.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/auth/secret";
import type { AgencyRole } from "@/lib/agency/roles";

// ─── Camada 1: a URL direta ──────────────────────────────────────────────────

async function biscoitoDe(role: string): Promise<string> {
  return new SignJWT({
    userId: "u1",
    email: "quem@dioli.studio",
    name: "Quem Quer Que Seja",
    role,
    workspaceId: "w1",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getAuthSecret());
}

async function pedir(caminho: string, role: string | null) {
  const { proxy } = await import("@/proxy");
  const req = new NextRequest(new URL(`http://localhost${caminho}`));
  if (role) req.cookies.set("dioli-session", await biscoitoDe(role));
  return proxy(req);
}

/** O proxy barrou por permissão (e não por falta de login)? */
function foiBarrado(res: { headers: Headers }): boolean {
  return res.headers.get("x-dioli-acesso") === "negado";
}

describe("a URL direta não contorna a permissão", () => {
  it("membro de Social digitando /agency/settings é barrado", async () => {
    const res = await pedir("/agency/settings", "social_staff");
    expect(foiBarrado(res)).toBe(true);
  });

  it("membro de Social digitando a mesa do Design é barrado", async () => {
    expect(foiBarrado(await pedir("/agency/design-agent", "social_staff"))).toBe(true);
    expect(foiBarrado(await pedir("/agency/ads-agent", "social_staff"))).toBe(true);
  });

  it("querystring não disfarça a rota", async () => {
    // `/agency/settings?aba=chaves` tinha de cair na MESMA decisão.
    expect(foiBarrado(await pedir("/agency/settings?aba=chaves", "social_staff"))).toBe(true);
    expect(foiBarrado(await pedir("/agency/settings/", "design_staff"))).toBe(true);
  });

  it("papel desconhecido no JWT é negado, nunca promovido", async () => {
    // Se um dia o fallback aqui virar "master", este teste é o que grita.
    expect(foiBarrado(await pedir("/agency/settings", "papel_que_nao_existe"))).toBe(true);
    expect(foiBarrado(await pedir("/agency/dashboard", "client"))).toBe(true);
  });

  it("sem biscoito nenhum, vai para o login — não para a tela", async () => {
    const res = await pedir("/agency/dashboard", null);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/signin");
  });

  it("a Central de Trabalho continua aberta para todo mundo de dentro", async () => {
    for (const papel of ["master", "diretor", "project_manager", "social_staff", "design_staff", "ads_staff", "executivo_comercial"]) {
      expect(foiBarrado(await pedir("/agency/dashboard", papel)), `${papel} barrado no dashboard`).toBe(false);
    }
  });

  it("master e diretor passam em toda rota, inclusive nas administrativas", async () => {
    for (const papel of ["master", "diretor"]) {
      for (const rota of ["/agency/settings", "/agency/integrations", "/agency/brain", "/agency/design-agent", "/agency/financeiro"]) {
        expect(foiBarrado(await pedir(rota, papel)), `${papel} barrado em ${rota}`).toBe(false);
      }
    }
  });

  it("a tela que EXPLICA o barramento não é ela mesma barrada", async () => {
    // Sem isto o barrado cai num laço: barrado → sem-permissao → barrado.
    expect(foiBarrado(await pedir("/agency/sem-permissao", "social_staff"))).toBe(false);
  });
});

// ─── Camada 2: a API ─────────────────────────────────────────────────────────

const sessaoMock = vi.hoisted(() => ({ atual: null as unknown }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => sessaoMock.atual,
  SESSION_COOKIE: "dioli-session",
}));

function comSessao(role: AgencyRole | "client" | null) {
  sessaoMock.atual = role
    ? { userId: "u1", email: "e@x", name: "N", role, workspaceId: "w1" }
    : null;
}

describe("a API não contorna a permissão", () => {
  beforeEach(() => comSessao(null));

  it("sem sessão devolve 401", async () => {
    const { exigirApiInterna } = await import("@/lib/agency/organizacao/guarda");
    const { erro } = await exigirApiInterna("/agency/dashboard");
    expect(erro?.status).toBe(401);
  });

  it("papel de cliente devolve 403 mesmo com sessão válida", async () => {
    comSessao("client");
    const { exigirApiInterna } = await import("@/lib/agency/organizacao/guarda");
    const { erro } = await exigirApiInterna("/agency/dashboard");
    expect(erro?.status).toBe(403);
  });

  it("a API herda a permissão da MESMA linha do inventário que a tela", async () => {
    comSessao("social_staff");
    const { exigirApiInterna } = await import("@/lib/agency/organizacao/guarda");
    // A tela de configurações é fechada para ele; a API que a serve também.
    expect((await exigirApiInterna("/agency/settings")).erro?.status).toBe(403);
    // A leitura da Central é aberta para ele; a API também.
    expect((await exigirApiInterna("/agency/dashboard")).erro).toBeNull();
  });

  it("escrever na área de outro departamento devolve 403", async () => {
    comSessao("social_staff");
    const { exigirCapacidade } = await import("@/lib/agency/organizacao/guarda");
    expect((await exigirCapacidade("editar", "design")).erro?.status).toBe(403);
    expect((await exigirCapacidade("publicar", "paid-traffic")).erro?.status).toBe(403);
    // Na própria área, passa.
    expect((await exigirCapacidade("editar", "social-media")).erro).toBeNull();
  });

  it("LER a área de outro departamento é liberado — é a regra do CEO", async () => {
    comSessao("design_staff");
    const { exigirCapacidade } = await import("@/lib/agency/organizacao/guarda");
    expect((await exigirCapacidade("ler", "paid-traffic")).erro).toBeNull();
    expect((await exigirCapacidade("ler", "financeiro")).erro).toBeNull();
  });

  it("administração é da direção — nem o PM passa", async () => {
    const { exigirAdministracao } = await import("@/lib/agency/organizacao/guarda");
    comSessao("project_manager");
    expect((await exigirAdministracao()).erro?.status).toBe(403);
    comSessao("social_staff");
    expect((await exigirAdministracao()).erro?.status).toBe(403);
    comSessao("master");
    expect((await exigirAdministracao()).erro).toBeNull();
    comSessao("diretor");
    expect((await exigirAdministracao()).erro).toBeNull();
  });

  it("o perfil vem da SESSÃO — não existe caminho para passá-lo por parâmetro", async () => {
    // A assinatura das funções é a trava: nenhuma aceita papel, autoridade ou
    // workspace de fora. Se alguém acrescentar esse parâmetro "só para testar",
    // este teste vira o lugar onde a conversa acontece.
    const guarda = await import("@/lib/agency/organizacao/guarda");
    expect(guarda.exigirApiInterna.length).toBeLessThanOrEqual(1);
    expect(guarda.exigirAdministracao.length).toBeLessThanOrEqual(1);
  });
});
