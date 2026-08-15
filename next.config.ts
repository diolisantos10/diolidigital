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
  // ── O MEDIDOR DE PIXEL, PELO MESMO MOTIVO (15/08/2026) ───────────────────
  //
  // Sete dias depois do navegador, a MESMA doença num segundo lugar. O portão
  // de pixel do fundo (`lib/agency/design/portao-do-fundo.ts`) é FAIL CLOSED de
  // propósito: sem medida, reprova. E quem mede é `sharp`, que até 15/08 NÃO
  // estava em `dependencies` — chegava só como dependência OPCIONAL do `next`
  // (`package-lock.json`, `"optional": true`). Dependência opcional é a que o
  // npm tem PERMISSÃO de não instalar: `--omit=optional`, plataforma sem
  // binário pré-compilado ou uma poda do instalador e ela some sem erro.
  //
  // O estrago, num contêiner sem ela: `await import("sharp")` cai no `catch` de
  // `medir-fundo.ts:29`, `medirFundo` devolve `null`, o portão vira
  // `nao_foi_possivel_medir` e reprova 100% das peças com fundo gerado — DEPOIS
  // de a chamada paga já ter rodado (`artes.ts`, `generateDesign`), três vezes
  // por peça. Torneira aberta contra balde furado, de novo.
  //
  // Duas metades, como no playwright: a declaração em `dependencies` faz o
  // pacote existir; a inclusão aqui faz ele CHEGAR INTEIRO. `sharp` carrega o
  // binário nativo por `require` de `@img/sharp-<plataforma>` resolvido em
  // tempo de execução — o rastreador do `output: "standalone"` segue import,
  // não string montada, e o pacote viaja sem o `.node` que ele abre.
  //
  // `__tests__/plataforma/o-medidor-de-pixel-chega-em-producao.test.ts` reprova
  // quem tirar qualquer uma das duas metades daqui.
  outputFileTracingIncludes: {
    "/**": [
      "node_modules/playwright-core/browsers.json",
      "node_modules/playwright-core/bin/**/*",
      "node_modules/sharp/**/*",
      "node_modules/@img/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
