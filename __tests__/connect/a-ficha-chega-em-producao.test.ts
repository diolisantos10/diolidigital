// A FICHA CHEGA EM PRODUÇÃO? — o risco levantado, e a medição dele.
//
// ─── O RISCO, EM UMA FRASE ─────────────────────────────────────────────────
//
// `lib/agency/catalogo-v2/specs.ts:59` lê a ficha do DISCO em tempo de
// execução:
//
//     const RAIZ = path.join(process.cwd(), "agentes", "linha");
//
// e recusa NOMEADAMENTE quando não acha o arquivo ("sem ficha não se executa").
// `lib/agency/catalogo-v2/regras-da-ficha.ts:54` faz o mesmo caminho.
//
// Em produção o processo é `.next/standalone/server.js`, e o `server.js` que o
// Next gera começa com `process.chdir(__dirname)` (o template está em
// `node_modules/next/dist/build/utils.js:1084`). Ou seja: em produção
// `process.cwd()` **não é a raiz do repositório**, é `.next/standalone`. Se
// `agentes/` não viajar para lá, o motor de fichas recusa TODAS as funções —
// e recusa em silêncio para quem só olha o log de deploy, porque o app sobe
// normalmente.
//
// ─── O QUE FOI MEDIDO EM 30/08/2026 ────────────────────────────────────────
//
// `npm run build` nesta árvore produziu `.next/standalone/agentes/linha/` com
// as 93 fichas. Então HOJE o risco não se materializa. Mas ele chega lá por
// ACIDENTE, não por decisão: o próprio build imprime, quatro vezes,
//
//   "Encountered unexpected file in NFT list — A file was traced that indicates
//    that the whole project was traced unintentionally."
//
// É esse rastreio acidentalmente total que carrega `agentes/` junto. `npm run
// build` copia explicitamente só `.next/static` e `public`, e
// `outputFileTracingIncludes` (next.config.ts) nomeia só arquivos do
// playwright. **No dia em que alguém consertar aquele aviso — que é um
// conserto legítimo, de tamanho de imagem — o motor de fichas para de achar as
// fichas em produção, e nenhum teste desta casa acusaria.** Este arquivo
// acusa.
//
// A correção, se o dono quiser blindar sem esperar o acidente, é uma linha em
// `next.config.ts`: acrescentar `"agentes/linha/**/*.md"` ao
// `outputFileTracingIncludes`. Não foi feita aqui: mexer no empacotamento de
// produção não estava no escopo desta obra, e é decisão de quem responde pelo
// deploy.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

const RAIZ = process.cwd();

describe("metade 1 — a dependência de disco existe mesmo, e é do cwd", () => {
  it("`specs.ts` lê a ficha de `process.cwd()/agentes/linha` em runtime", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "lib/agency/catalogo-v2/specs.ts"), "utf8");
    expect(fonte).toContain('path.join(process.cwd(), "agentes", "linha")');
    expect(fonte).toContain("readFileSync");
  });

  it("o `server.js` do standalone troca o cwd — por isso a raiz do repo não vale lá", () => {
    const template = fs.readFileSync(path.join(RAIZ, "node_modules/next/dist/build/utils.js"), "utf8");
    expect(
      template.includes("process.chdir(__dirname)"),
      "o template do standalone mudou; refaça a medição do cwd de produção antes de confiar neste raciocínio",
    ).toBe(true);
  });
});

describe("metade 2 — o artefato construído realmente carrega as fichas", () => {
  const pastaDeFichas = path.join(RAIZ, ".next/standalone/agentes/linha");
  const construido = fs.existsSync(path.join(RAIZ, ".next/standalone/server.js"));

  // Sem build não se mede — e "não medi" não é "está certo". O skip DIZ isso,
  // em vez de passar verde calado (mesmo desenho de
  // `plataforma/o-navegador-chega-em-producao.test.ts`).
  it.skipIf(!construido)("toda função do catálogo tem a ficha dentro de `.next/standalone`", () => {
    const faltando = FUNCOES_V2.filter(
      (f) => !fs.existsSync(path.join(pastaDeFichas, f.departamentoId, `${f.id}.md`)),
    ).map((f) => `${f.departamentoId}/${f.id}`);

    expect(
      faltando,
      `${faltando.length} ficha(s) não viajaram para o contêiner — o motor recusaria essas funções em produção ` +
        `com "sem ficha não se executa". Conserto: acrescentar "agentes/linha/**/*.md" a ` +
        `outputFileTracingIncludes em next.config.ts.`,
    ).toEqual([]);
  });

  it.skipIf(!construido)("a ficha do gerente do piloto está lá e continua legível por máquina", () => {
    const caminho = path.join(pastaDeFichas, "client-service-sdr", "manager-atendimento.md");
    const conteudo = fs.readFileSync(caminho, "utf8");
    const bloco = conteudo.match(/```json\n([\s\S]*?)\n```/);
    expect(bloco, "a ficha chegou sem o bloco de especificação — o motor recusaria por ficha ilegível").not.toBeNull();
    const spec = JSON.parse(bloco![1]!) as { funcao: string; ativa: boolean };
    expect(spec.funcao).toBe("manager-atendimento");
    // E ela chega DESLIGADA, como tem de ser: este piloto não ligou nada.
    expect(spec.ativa).toBe(false);
  });
});
