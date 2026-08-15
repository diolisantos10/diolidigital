// O INVENTÁRIO É COMPLETO, OU O PORTÃO NÃO VALE NADA.
//
// `podeAbrirRota` fecha por omissão: rota fora do inventário é negada para
// quem não é direção. Isso protege — e, se ninguém vigiar, esconde. Uma tela
// nova esquecida no registro some do menu de todo mundo menos master/diretor,
// e ninguém descobre até um cliente reclamar.
//
// Este arquivo varre `app/agency/**` no disco e reprova página que exista e
// não esteja declarada. O alerta carrega a evidência: ele imprime o caminho.

import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAGINAS, resolverPagina } from "@/lib/agency/organizacao/paginas";

const RAIZ = join(process.cwd(), "app", "agency");

/** Todas as rotas com `page.tsx` sob /agency, em forma de URL. */
function rotasEmDisco(dir = RAIZ, prefixo = "/agency"): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome.startsWith("[")) {
        // Segmento dinâmico: TUDO abaixo dele resolve no pai. Descer aqui
        // produziria "/agency/requests/scope", que é uma URL que não existe —
        // a real é "/agency/requests/<id>/scope".
        if (rotasEmDisco(caminho, prefixo).length > 0) achados.push(prefixo);
        continue;
      }
      achados.push(...rotasEmDisco(caminho, `${prefixo}/${nome}`));
    } else if (nome === "page.tsx") {
      achados.push(prefixo);
    }
  }
  return [...new Set(achados)];
}

describe("inventário de páginas internas", () => {
  it("toda página em disco está declarada em PAGINAS", () => {
    const naoRegistradas = rotasEmDisco().filter((rota) => {
      const p = resolverPagina(rota);
      // Casar com um ANCESTRAL não conta: `/agency/financeiro` cair em
      // `/agency` significaria herdar a permissão errada em silêncio.
      return !p || p.href !== rota;
    });
    expect(naoRegistradas, `páginas sem registro em organizacao/paginas.ts: ${naoRegistradas.join(", ")}`).toEqual([]);
  });

  it("toda rota declarada existe em disco", () => {
    const emDisco = new Set(rotasEmDisco());
    // `/agency/execution` é o pai de `[id]` e não tem page.tsx próprio — está
    // no inventário para que o detalhe herde a permissão certa.
    const toleradas = new Set(["/agency/execution"]);
    const fantasmas = PAGINAS.map((p) => p.href).filter(
      (href) => !emDisco.has(href) && !toleradas.has(href),
    );
    expect(fantasmas, `rotas declaradas que não existem: ${fantasmas.join(", ")}`).toEqual([]);
  });

  it("não declara a mesma rota duas vezes", () => {
    const hrefs = PAGINAS.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("resolve o filho antes do pai", () => {
    // `/agency/dashboard/operacao` NÃO pode cair em `/agency/dashboard`.
    expect(resolverPagina("/agency/dashboard/operacao")?.href).toBe("/agency/dashboard/operacao");
    // Segmento dinâmico resolve no pai, de propósito.
    expect(resolverPagina("/agency/clients/abc123")?.href).toBe("/agency/clients");
    expect(resolverPagina("/agency/projects/xyz/qualquer")?.href).toBe("/agency/projects");
    // Querystring e barra final não podem enganar o casamento — é por aí que
    // um `/agency/settings?x=1` passaria por rota desconhecida.
    expect(resolverPagina("/agency/settings?aba=ia")?.href).toBe("/agency/settings");
    expect(resolverPagina("/agency/settings/")?.href).toBe("/agency/settings");
  });
});
