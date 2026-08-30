// A PONTE DA META SÓ LÊ O COOKIE — a terceira rota sem régua (Fase 1).
//
// `/api/portal/conectar-meta` é a ponte que leva o cliente ao OAuth da Meta. A
// varredura da Fase 1 achou **zero testes** nela, e ela guarda uma decisão de
// segurança que só existe numa CHAMADA DE FUNÇÃO — `tokenDoPortal(request)`,
// com UM argumento.
//
// ── POR QUE UM ARGUMENTO A MAIS SERIA UM BURACO ────────────────────────────
//
// `tokenDoPortal(request, explicito)` prefere o `explicito` ao cookie, e quase
// todas as rotas do portal passam `?token=` por compatibilidade. Aqui NÃO se
// passa, e o motivo é o que esta ponte existe para fazer: ela **põe o token na
// URL** do redirect para o fluxo de OAuth. Aceitar um token vindo da query
// significaria que qualquer link com `?token=<token de outra pessoa>` abriria
// a conexão da Meta em nome dela — um token que o navegador de quem clica
// nunca teve.
//
// A diferença entre seguro e furado é UM ARGUMENTO, e nada a guardava.
//
// ⚠️ Nenhuma chamada de rede acontece aqui. Custo US$ 0,00.

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/http/endereco-publico", () => ({
  urlPublica: (_r: unknown, caminho: string) => `https://www.diolidigital.com.br${caminho}`,
}));

import { GET } from "@/app/api/portal/conectar-meta/route";
import { PORTAL_COOKIE as NOME_DO_COOKIE } from "@/lib/agency/persistence/portal-cookie";

function pedir(opcoes: { query?: string; cookie?: string }): Promise<Response> {
  // O cookie vai pelo CABEÇALHO, como o navegador o manda — montá-lo por
  // `r.cookies.set` escreveria o cookie de RESPOSTA, e o teste mediria a si
  // mesmo em vez de medir a rota.
  const headers = new Headers();
  if (opcoes.cookie) headers.set("cookie", `${NOME_DO_COOKIE}=${opcoes.cookie}`);
  return GET(new NextRequest(
    `http://localhost/api/portal/conectar-meta${opcoes.query ?? ""}`, { headers },
  ));
}

describe("a ponte da Meta lê o COOKIE, e só ele", () => {
  it("com o cookie, redireciona para o fluxo de OAuth levando o token do cookie", async () => {
    const res = await pedir({ cookie: "tok-do-cookie" });
    expect(res.status).toBe(307);
    const destino = res.headers.get("location")!;
    expect(destino).toContain("/api/meta/connect-parceiro");
    expect(destino).toContain("token=tok-do-cookie");
  });

  it("SEM cookie e COM `?token=` na URL: NÃO redireciona — o token da query é ignorado", async () => {
    // MUTAÇÃO QUE PROVA: troque `tokenDoPortal(request)` por
    // `tokenDoPortal(request, request.nextUrl.searchParams.get("token"))` —
    // a forma usada em quase toda rota do portal — e esta linha cai. Seria um
    // link com o token de outra pessoa abrindo a conexão da Meta em nome dela.
    const res = await pedir({ query: "?token=tok-de-um-link-qualquer" });
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("o cookie MANDA mesmo quando a query tenta outro token", async () => {
    const res = await pedir({ query: "?token=tok-do-atacante", cookie: "tok-do-cookie" });
    const destino = res.headers.get("location")!;
    expect(destino).toContain("token=tok-do-cookie");
    expect(destino).not.toContain("tok-do-atacante");
  });

  it("sem acesso nenhum, quem lê a resposta é uma PESSOA numa janela — não um cliente HTTP", async () => {
    const res = await pedir({});
    const corpo = await res.text();
    // A resposta é HTML de popup, com a falha nomeada. Um 401 seco deixaria a
    // janelinha branca na cara do cliente, sem dizer o que houve.
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    expect(corpo.length).toBeGreaterThan(20);
  });
});
