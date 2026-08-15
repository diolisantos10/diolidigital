// O MEDIDOR DE PIXEL CHEGA EM PRODUÇÃO — a segunda vez que a casa pega a mesma
// doença (15/08/2026).
//
// ── O QUE FOI MEDIDO ────────────────────────────────────────────────────────
//
// `sharp` NÃO estava em `dependencies`. Ele chegava só como dependência
// OPCIONAL do `next` — `package-lock.json`, `"optional": true`. Dependência
// opcional é, por definição, a que o npm tem PERMISSÃO de não instalar:
// `npm ci --omit=optional`, plataforma sem binário pré-compilado, ou uma poda
// do instalador, e ela some SEM ERRO no build.
//
// A cadeia do estrago, arquivo por arquivo:
//
//   medir-fundo.ts:29 ......... `await import("sharp")` dentro de try → catch
//                               devolve `null`
//   portao-do-fundo.ts:89-100 . `null` vira `nao_foi_possivel_medir` e REPROVA
//                               (fail closed, e está certo assim)
//   artes.ts .................. a peça cai — DEPOIS de `generateDesign` já ter
//                               rodado e cobrado, até 3 vezes por peça
//                               (`MAX_TENTATIVAS_POR_PECA`)
//
// Num contêiner sem `sharp`: 100% das peças com fundo gerado reprovadas depois
// de pagas, e a única testemunha seria o `lastError` dentro de cada post.
//
// ── POR QUE ESTE TESTE, E POR QUE ASSIM ─────────────────────────────────────
//
// Em 08/08 a casa viveu isto com o Playwright e nasceu
// `o-navegador-chega-em-producao.test.ts`. Não existia o equivalente para o
// `sharp`. Este arquivo é o mesmo molde, e segue a mesma disciplina: um teste
// que compara uma constante do código com uma constante escrita nele mesmo é
// carimbo. Cada afirmação aqui MEDE alguma coisa — o disco, o instalador ou o
// mundo — e a asserção que não pôde medir DIZ que não mediu, em vez de passar
// verde calada.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

describe("metade 1 — a declaração: `sharp` é dependência DIRETA e obrigatória", () => {
  const pkg = JSON.parse(ler("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  it("`sharp` está em `dependencies`", () => {
    expect(
      pkg.dependencies?.sharp,
      "sharp saiu de `dependencies` — o portão do fundo volta a reprovar 100% das peças DEPOIS de pagas",
    ).toBeTruthy();
  });

  it("e NÃO está em `devDependencies` nem em `optionalDependencies`", () => {
    // As duas formas de "instalado aqui, ausente lá". `devDependencies` foi
    // exatamente o que derrubou o playwright em 07/08; `optionalDependencies`
    // é o que o npm pode pular sem falhar o build.
    expect(pkg.devDependencies?.sharp).toBeUndefined();
    expect(pkg.optionalDependencies?.sharp).toBeUndefined();
  });

  it("o lock deixou de marcar `sharp` como opcional", () => {
    // A METADE QUE PEGOU O DEFEITO. O package.json podia estar limpo e o lock
    // continuar entregando `sharp` só pela via opcional do next: é assim que
    // ele estava até 15/08. `optional: true` aqui significa "o instalador tem
    // permissão de não trazer".
    const lock = JSON.parse(ler("package-lock.json")) as {
      packages: Record<string, { optional?: boolean; dev?: boolean; version?: string }>;
    };
    const entrada = lock.packages["node_modules/sharp"];
    expect(entrada, "`sharp` sumiu do package-lock.json").toBeTruthy();
    expect(
      entrada!.optional,
      `package-lock.json marca sharp como OPCIONAL (v${entrada!.version}) — foi exatamente este estado que reprovou toda peça paga`,
    ).not.toBe(true);
    expect(entrada!.dev, "`sharp` voltou a ser dependência só de desenvolvimento").not.toBe(true);

    // E a raiz do lock precisa listá-lo como dependência do PROJETO, não como
    // uma transitiva que sobrou de outro pacote.
    const raiz = lock.packages[""] as { dependencies?: Record<string, string> } | undefined;
    expect(
      raiz?.dependencies?.sharp,
      "o lock não registra `sharp` entre as dependências diretas do projeto — ele voltou a ser transitiva do next",
    ).toBeTruthy();
  });
});

describe("metade 2 — o rastreio: o pacote precisa CHEGAR inteiro ao contêiner", () => {
  const config = ler("next.config.ts");

  it("`next.config.ts` inclui `sharp` e o binário nativo no rastreio", () => {
    expect(config.includes("outputFileTracingIncludes")).toBe(true);
    expect(
      config.includes("node_modules/sharp/**/*"),
      "sharp saiu de outputFileTracingIncludes",
    ).toBe(true);
    expect(
      config.includes("node_modules/@img/**/*"),
      "`@img/*` saiu do rastreio — é onde mora o `.node` que o sharp carrega por caminho montado em tempo de execução; sem ele o módulo resolve e o binário falta",
    ).toBe(true);
  });

  it("e não desfez o rastreio do playwright, que divide a mesma lista", () => {
    // A lista é uma só: quem mexer nela para incluir o sharp pode derrubar o
    // navegador sem perceber. O outro teste também pegaria — dois é de propósito.
    expect(config.includes("node_modules/playwright-core/browsers.json")).toBe(true);
    expect(config.includes('output: "standalone"')).toBe(true);
  });

  it.skipIf(!fs.existsSync(path.join(RAIZ, ".next/standalone")))(
    "depois do build, `.next/standalone/node_modules/sharp` existe de verdade",
    () => {
      // Pular é honesto: "não medi" não é "está certo", e o `skipIf` DIZ que
      // não mediu. Quem roda o portão inteiro (tsc · vitest · build) mede.
      expect(
        fs.existsSync(path.join(RAIZ, ".next/standalone/node_modules/sharp")),
        "o build produziu um standalone SEM sharp — é exatamente o estado que reprova toda peça paga",
      ).toBe(true);
    },
  );
});

describe("metade 3 — o mundo: a biblioteca resolve E decodifica de verdade aqui", () => {
  it("`import(\"sharp\")` resolve neste ambiente", async () => {
    // Sem try/catch de propósito: se não resolve, o teste tem de FALHAR com o
    // erro real do módulo na cara de quem lê, não devolver um booleano.
    const mod = await import("sharp");
    expect(typeof mod.default).toBe("function");
  });

  it("e o binário nativo carrega — não basta o módulo JS existir", async () => {
    // `sharp` é um invólucro fino sobre `@img/sharp-<plataforma>`, carregado
    // por require montado em tempo de execução. Módulo presente e `.node`
    // ausente é um estado real, e ele passaria no teste de cima.
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    expect(png.length).toBeGreaterThan(0);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("a sonda de disponibilidade responde `true` quando a biblioteca está aqui", async () => {
    const { medidorDeFundoDisponivel } = await import("@/lib/agency/design/medir-fundo");
    const r = await medidorDeFundoDisponivel();
    expect(r.disponivel, `a sonda reprovou num ambiente COM sharp: ${r.motivo}`).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it("e `medirFundo` devolve medida real pelo corpo de prova embutido na própria sonda", async () => {
    // Fecha o círculo: prova que o caminho exercitado pela sonda é o MESMO que
    // a peça do cliente percorre, e que ele produz número, não `null`.
    const { medirFundo } = await import("@/lib/agency/design/medir-fundo");
    const sharp = (await import("sharp")).default;
    const foto = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 40, b: 60 } },
    })
      .png()
      .toBuffer();
    const m = await medirFundo(foto);
    expect(m, "medirFundo devolveu null num PNG válido — é o estado `nao_foi_possivel_medir`").not.toBeNull();
    expect(m!.coresDistintas).toBeGreaterThan(0);
  });
});

describe("metade 4 — a fábrica para de GRAÇA, e o portão continua fail closed", () => {
  const artes = ler("lib/agency/execution/artes.ts");
  const portao = ler("lib/agency/design/portao-do-fundo.ts");

  it("a guarda do medidor roda ANTES da primeira chamada paga do lote", () => {
    // Isto é ordem de execução medida no arquivo, não intenção declarada: a
    // guarda tem de estar acima do `generateDesign`, senão ela não economiza
    // nada e é só mais uma linha.
    const guarda = artes.indexOf("medidorDeFundoDisponivel()");
    const pago = artes.indexOf("await generateDesign(");
    expect(guarda, "a guarda `medidorDeFundoDisponivel()` sumiu de artes.ts").toBeGreaterThan(-1);
    expect(pago).toBeGreaterThan(-1);
    expect(
      guarda,
      "a guarda do medidor caiu para DEPOIS da chamada paga — ela deixou de economizar qualquer coisa",
    ).toBeLessThan(pago);
  });

  it("a guarda devolve a rodada sem entrar no laço das peças", () => {
    const guarda = artes.indexOf("saida.semMedidorDeFundo =");
    const laco = artes.indexOf("for (const post of pendentes)");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda, "a guarda ficou DENTRO do laço — voltou a falhar peça a peça").toBeLessThan(laco);
  });

  it("o alerta carrega a própria evidência: diz o que fazer e onde olhar", () => {
    // Guardrail 6 da casa. "Algo falhou" sem o caso concreto é ruído.
    const trecho = artes.slice(artes.indexOf("saida.semMedidorDeFundo ="), artes.indexOf("saida.semMedidorDeFundo =") + 1200);
    expect(trecho).toContain("sharp");
    expect(trecho).toContain("dependencies");
    expect(trecho).toContain("next.config.ts");
    expect(trecho).toContain("/api/capacidades");
  });

  it("o despertador GRITA quando a rodada para por falta de medidor", () => {
    // Fila parada em silêncio foi o defeito de 08/08. Sem esta linha a casa
    // economiza dinheiro e ninguém descobre que parou de produzir.
    const desp = ler("lib/agency/despertador.ts");
    expect(desp).toContain("r.semMedidorDeFundo");
    expect(desp).toMatch(/quebrou\("arte", r\.semMedidorDeFundo\)/);
  });

  it("o portão do fundo NÃO foi afrouxado: sem medida, continua reprovando", () => {
    // A metade que prova que a correção não virou o oposto dela. A guarda
    // barata NÃO pode ter comprado a queda do fail closed por peça.
    expect(portao).toContain("nao_foi_possivel_medir");
    const iMedida = portao.indexOf("const medida = await medirFundo(bytes)");
    // A partir de `iMedida`: o motivo também é NOMEADO no tipo, lá em cima, e
    // procurar do começo acharia a declaração em vez do uso.
    expect(iMedida).toBeGreaterThan(-1);
    const iVeredito = portao.indexOf("nao_foi_possivel_medir", iMedida);
    expect(iVeredito, "o veredito `nao_foi_possivel_medir` saiu do caminho de execução").toBeGreaterThan(iMedida);
    expect(
      portao.slice(iMedida, iVeredito),
      "a checagem `if (!medida)` sumiu do portão — ausência de medida voltaria a passar como aprovação",
    ).toContain("if (!medida)");
    expect(
      portao.slice(iMedida, iVeredito + 400),
      "o veredito de não-medida deixou de ser reprovação",
    ).toContain("ok: false");
  });

  it("a sonda DECODIFICA — não se contenta com o import resolvendo", () => {
    // O ponto cego desta casa: verificador que aprova por silêncio. Uma sonda
    // que só faz `await import("sharp")` passaria num contêiner com o módulo
    // JS e sem o binário nativo, que é metade do modo de falha real.
    const medir = ler("lib/agency/design/medir-fundo.ts");
    const iSonda = medir.indexOf("export async function medidorDeFundoDisponivel");
    expect(iSonda).toBeGreaterThan(-1);
    const corpo = medir.slice(iSonda);
    expect(
      corpo,
      "a sonda parou de exercitar `medirFundo` — voltou a medir só se o módulo resolve",
    ).toContain("medirFundo(IMAGEM_DE_PROVA)");
  });
});

describe("metade 5 — a sonda REPROVA quando a biblioteca não está lá", () => {
  // Sem esta metade, uma sonda que devolvesse `{ disponivel: true }` fixo
  // passaria em todas as outras. Detector que só foi visto aprovando é
  // indistinguível de um que aprova sempre.

  it("com o `import(\"sharp\")` falhando, `medidorDeFundoDisponivel` devolve false", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    const { medidorDeFundoDisponivel } = await import("@/lib/agency/design/medir-fundo");
    const r = await medidorDeFundoDisponivel();
    expect(
      r.disponivel,
      "a sonda aprovou um ambiente SEM sharp — ela não mede nada e a fábrica volta a queimar dinheiro peça a peça",
    ).toBe(false);
    vi.doUnmock("sharp");
    vi.resetModules();
  });

  it("e `medirFundo` devolve null no mesmo cenário — a origem do `nao_foi_possivel_medir`", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    const { medirFundo } = await import("@/lib/agency/design/medir-fundo");
    expect(await medirFundo(Buffer.from("qualquer coisa"))).toBeNull();
    vi.doUnmock("sharp");
    vi.resetModules();
  });
});
