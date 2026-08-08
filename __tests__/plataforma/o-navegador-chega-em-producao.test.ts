// O NAVEGADOR CHEGA EM PRODUÇÃO — a trava do P0 do molde (08/08/2026).
//
// ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
//
// A agência passou dias sem produzir UMA peça para cliente nenhum. A causa que
// circulava — "não há Chromium no contêiner" — estava ERRADA. Medido de dentro
// da produção por `/api/admin/diagnostico-do-navegador`:
//
//   /usr/bin/chromium ......... EXISTE (o apt de railpack.json sempre funcionou)
//   import("playwright") ...... "Cannot find module
//                               node_modules/playwright-core/browsers.json"
//
// O rastreador do `output: "standalone"` só copia o que consegue seguir por
// `import`/`require`. `browsers.json` é aberto em tempo de execução: nenhum
// grafo de import chega nele, e o pacote viajou para o contêiner sem o arquivo
// que ele lê na primeira linha. Como `renderizadorDisponivel` e `renderizarHtml`
// importam o playwright ANTES de procurar o executável, os dois desistiam sem
// nunca olhar o Chromium que estava a um caminho de distância.
//
// ── POR QUE UM TESTE, E NÃO UM COMENTÁRIO ───────────────────────────────────
//
// "Não tire isto daqui" escrito em prosa é sugestão; a lei desta casa é trava,
// não aviso. Sem gate, esta configuração volta a sumir numa limpeza de
// `next.config.ts` e a agência para de novo — em silêncio, porque a única
// testemunha era o `lastError` dentro de cada post.
//
// As DUAS METADES: a config existe e nomeia o arquivo certo (metade 1) E o
// artefato construído realmente o contém (metade 2 — a que mede o mundo).
// Só a primeira seria um teste que aprova a intenção; só a segunda passaria
// verde por acaso num diretório de build velho.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

describe("a configuração que faz o playwright viajar inteiro", () => {
  const config = fs.readFileSync(path.join(RAIZ, "next.config.ts"), "utf8");

  it("metade 1 — `next.config.ts` inclui `playwright-core/browsers.json` no rastreio", () => {
    expect(
      config.includes("outputFileTracingIncludes"),
      "outputFileTracingIncludes saiu de next.config.ts — o playwright volta a chegar quebrado em produção",
    ).toBe(true);
    expect(
      config.includes("node_modules/playwright-core/browsers.json"),
      "o arquivo que o playwright abre na primeira linha saiu da lista de inclusão",
    ).toBe(true);
  });

  it("metade 2 — a saída `standalone` continua ligada (sem ela nada disto importa)", () => {
    expect(config.includes('output: "standalone"')).toBe(true);
  });
});

describe("o pacote realmente chega inteiro ao artefato", () => {
  const standalone = path.join(RAIZ, ".next/standalone/node_modules/playwright-core");
  const construido = fs.existsSync(standalone);

  // Vitest roda sem build no CI de teste puro. Pular é honesto: "não medi" não
  // é "está certo", e o `it.skipIf` DIZ que não mediu, em vez de passar verde
  // calado. Quem roda o portão inteiro (`tsc` · `vitest` · `build`) mede.
  it.skipIf(!construido)(
    "`.next/standalone/node_modules/playwright-core/browsers.json` existe depois do build",
    () => {
      expect(
        fs.existsSync(path.join(standalone, "browsers.json")),
        "o build produziu um playwright-core SEM browsers.json — é exatamente o estado que parou a agência",
      ).toBe(true);
    },
  );
});

describe("o renderizador continua procurando o Chromium do sistema", () => {
  const fonte = fs.readFileSync(path.join(RAIZ, "lib/agency/design/renderizar.ts"), "utf8");

  it("`/usr/bin/chromium` — o que o apt de fato instala — segue na lista de candidatos", () => {
    expect(
      fonte.includes("/usr/bin/chromium"),
      "o caminho do Chromium do sistema saiu de renderizar.ts; é o único que existe no contêiner",
    ).toBe(true);
  });

  it("e a busca não exige variável de ambiente para funcionar", () => {
    // A armadilha do ffmpeg: capacidade que só existe quando alguém lembra de
    // configurar some em silêncio, e o cliente recebe a peça crua.
    const semEnv = fonte.replace(/process\.env\.PLAYWRIGHT_CHROMIUM_EXECUTABLE[^\n]*\n/, "");
    expect(semEnv.includes("/usr/bin/chromium")).toBe(true);
  });
});
