// A CICATRIZ: em 06/08/2026 o CEO clicou em "Conectar Facebook/Instagram" no
// portal e a janela abriu em `http://0.0.0.0:8080/api/meta/connect-parceiro`.
// O endereço interno do contêiner foi parar no navegador dele.
//
// Estes testes provam as DUAS metades, como toda trava desta casa: que o
// endereço que não alcança ninguém é RECUSADO, e que o caso legítimo passa.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { origemPublica, urlPublica } from "@/lib/http/endereco-publico";

const req = (headers: Record<string, string>) => ({
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
});

describe("origemPublica", () => {
  const antes = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => { delete process.env.NEXT_PUBLIC_APP_URL; });
  afterEach(() => {
    if (antes === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = antes;
  });

  it("prefere o que o proxy diz que o navegador pediu", () => {
    expect(origemPublica(req({
      "x-forwarded-host": "www.diolidigital.com.br",
      "x-forwarded-proto": "https",
      host: "0.0.0.0:8080",
    }))).toBe("https://www.diolidigital.com.br");
  });

  // ⛔ A METADE QUE PEGA O BUG DE 06/08.
  it("RECUSA 0.0.0.0 mesmo quando é o que o cabeçalho diz", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.diolidigital.com.br";
    expect(origemPublica(req({ host: "0.0.0.0:8080" })))
      .toBe("https://www.diolidigital.com.br");
    expect(origemPublica(req({ "x-forwarded-host": "0.0.0.0:8080", host: "0.0.0.0:8080" })))
      .toBe("https://www.diolidigital.com.br");
  });

  it("sem endereço público conhecido, devolve NULO — não chuta", () => {
    // Chutar vira link quebrado na mão do cliente, e ninguém descobre até ele
    // reclamar. Nulo faz quem chama tratar a ausência.
    expect(origemPublica(req({ host: "0.0.0.0:8080" }))).toBeNull();
    expect(origemPublica(req({}))).toBeNull();
  });

  // ✅ A METADE QUE PROVA QUE NÃO INVENTA PROBLEMA.
  it("localhost do desenvolvimento continua passando", () => {
    expect(origemPublica(req({ host: "localhost:3000", "x-forwarded-proto": "http" })))
      .toBe("http://localhost:3000");
  });

  it("x-forwarded-host com vários valores usa o primeiro, o do cliente", () => {
    expect(origemPublica(req({
      "x-forwarded-host": "www.diolidigital.com.br, interno.railway",
      "x-forwarded-proto": "https, http",
    }))).toBe("https://www.diolidigital.com.br");
  });

  it("a variável declarada perde a barra do fim", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.diolidigital.com.br/";
    expect(origemPublica(req({}))).toBe("https://www.diolidigital.com.br");
  });

  it("urlPublica monta o caminho e some quando não há origem", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.diolidigital.com.br";
    expect(urlPublica(req({}), "/api/meta/callback"))
      .toBe("https://www.diolidigital.com.br/api/meta/callback");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(urlPublica(req({ host: "0.0.0.0:8080" }), "/api/meta/callback")).toBeNull();
  });
});
