import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ── O NAVEGADOR DO MOLDE, E POR QUE ISTO PRECISA ESTAR AQUI ──────────────
  //
  // 08/08/2026. A agência ficou dias sem produzir UMA peça porque
  // `import("playwright")` FALHAVA em produção. A hipótese que circulava era
  // "não há Chromium no contêiner". Medido de dentro
  // (`/api/admin/diagnostico-do-navegador`), o contêiner respondeu o contrário:
  //
  //   /usr/bin/chromium ......... EXISTE (o apt de railpack.json funciona)
  //   /usr/lib/chromium/ ........ 20 arquivos, binário e tudo
  //   import("playwright") ...... "Cannot find module
  //                               node_modules/playwright-core/browsers.json"
  //
  // O rastreador de arquivos do `output: "standalone"` copia o que consegue
  // SEGUIR por `import`/`require`. `browsers.json` é lido do disco em tempo de
  // execução, então nenhum grafo de import leva até ele — e o pacote chega ao
  // contêiner sem o arquivo que ele abre na primeira linha. `renderizarHtml` e
  // `renderizadorDisponivel` fazem o import ANTES de procurar o executável;
  // com o import morto, os dois desistem sem nunca olhar `/usr/bin/chromium`.
  //
  // Ou seja: o navegador estava lá o tempo todo. Quem não chegava era a
  // biblioteca. Trocar o pacote do apt, mexer em PLAYWRIGHT_BROWSERS_PATH ou
  // baixar um segundo Chromium no build não consertaria uma linha disto.
  //
  // A prova de que continua consertado é local e barata: depois de
  // `npm run build`, `.next/standalone/node_modules/playwright-core/browsers.json`
  // tem de existir. `__tests__/plataforma/o-navegador-chega-em-producao.test.ts`
  // reprova quem tirar esta configuração daqui.
  outputFileTracingIncludes: {
    "/**": ["node_modules/playwright-core/browsers.json", "node_modules/playwright-core/bin/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
