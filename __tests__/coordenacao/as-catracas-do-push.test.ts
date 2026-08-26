// AS CATRACAS DO PUSH — prompt é aviso; código é trava (Fase 1, 26/08/2026).
//
// ═══ AS DUAS REGRAS QUE ESTAVAM SÓ EM PROSA ══════════════════════════════════
//
//   1. **Ninguém empurra direto na branch de deploy.** Está no CLAUDE.md, e
//      foi furada uma vez — declarada por quem furou.
//   2. **`tsc --noEmit` depois do teste.** Tem uma SEÇÃO INTEIRA no CLAUDE.md,
//      e a casa barrou o CI **cinco vezes** pelo mesmo motivo: arquivo de teste
//      novo, verde no `vitest` (que não checa tipo), vermelho no compilador.
//
// ─── ⚠️ DEFEITO MEU, MEDIDO NO CI, NA PRIMEIRA RODADA ───────────────────────
//
// A primeira versão deste arquivo chamava o SCRIPT de verdade, no repositório
// de verdade, e cobrava `exit 1`. **Passou aqui e REPROVOU no CI.** No runner o
// checkout é raso: `origin/<branch de deploy>` não existe local, a régua cai no
// ramo fail-open — corretamente — e não barra nada.
//
// A régua estava certa. O TESTE é que media o repositório em volta em vez de
// medir a régua. É a mesma lição que esta casa já tem escrita em três lugares:
// **régua verde sobre o componente errado é pior que régua nenhuma.**
//
// O conserto foi o padrão da casa — régua PURA (`lib/coordenacao/portao-de-push.ts`)
// e casca (`scripts/reivindicar.mts`), como `trava-de-fundo`/`medir-fundo` e
// `regua-da-peca-final`/`medir-peca-final`. A decisão passou a ser exercitável
// sem montar meia casa, e sem depender de que git o runner tem.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO PROVA: que o gancho está INSTALADO na máquina de
// quem lê. `--no-verify` fura qualquer gancho, e gancho local não alcança quem
// empurra pela web do GitHub. A trava do servidor (proteção de branch) é outra,
// e o que aconteceu com ela está declarado no relatório da Fase 1 — não aqui,
// para esta régua não afirmar o que não mede.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  vereditoDoPortao, refsDaEntradaPadrao, PASTA_QUE_PASSA_DIRETO,
} from "@/lib/coordenacao/portao-de-push";

const SCRIPT = "scripts/reivindicar.mts";
const DEPLOY = "claude/dioli-agency-os-architecture-kk7kp";

/** O que o git escreve na entrada padrão do gancho, no formato real. */
const entrada = (remota: string) => `refs/heads/local abc123 refs/heads/${remota} def456\n`;

describe("as refs saem da ENTRADA PADRÃO, nunca do argumento", () => {
  it("recorta a branch REMOTA de destino", () => {
    expect(refsDaEntradaPadrao(entrada(DEPLOY))).toEqual([{ remota: DEPLOY }]);
  });

  it("`git push origin HEAD:outra` tem destino DIFERENTE do remoto", () => {
    // O git passa `origin` como ARGUMENTO do gancho. Ler o argumento como se
    // fosse a branch seria uma catraca que mede a coisa errada — deixaria
    // passar todo `git push origin HEAD:<deploy>`.
    const refs = refsDaEntradaPadrao(`refs/heads/minha-branch aaa refs/heads/${DEPLOY} bbb\n`);
    expect(refs[0]!.remota).toBe(DEPLOY);
  });

  it("entrada vazia ou truncada não vira ref inventada", () => {
    expect(refsDaEntradaPadrao("")).toEqual([]);
    expect(refsDaEntradaPadrao("linha solta sem colunas\n")).toEqual([]);
  });

  it("push de várias refs de uma vez: todas são vistas", () => {
    const refs = refsDaEntradaPadrao(
      `refs/heads/a 1 refs/heads/outra 2\nrefs/heads/b 3 refs/heads/${DEPLOY} 4\n`,
    );
    expect(refs.map((r) => r.remota)).toEqual(["outra", DEPLOY]);
  });
});

describe("CATRACA 1 — ninguém empurra direto na branch de deploy", () => {
  const pedir = (remota: string, arquivosTocados: string[] | null) =>
    vereditoDoPortao({ refs: [{ remota }], branchDeDeploy: DEPLOY, arquivosTocados });

  it("branch de deploy + arquivo de CÓDIGO = BARRADO, com os arquivos nomeados", () => {
    const v = pedir(DEPLOY, ["lib/agency/esteira/fases.ts", "app/api/portal/vista/route.ts"]);
    expect(v.barrar).toBe(true);
    if (v.barrar) expect(v.foraDaReivindicacao).toHaveLength(2);
  });

  it("branch PRÓPRIA passa, mesmo mexendo em tudo — é o caminho que a casa quer", () => {
    expect(pedir("claude/uma-branch-de-trabalho", ["lib/qualquer-coisa.ts"]).barrar).toBe(false);
  });

  it("`reivindicacoes/` passa direto — barrá-la quebraria a trava de colisão", () => {
    // Não é conveniência: `abrir`/`encerrar` publicam lá com
    // `git push origin HEAD:<deploy>`, e é a única fonte que duas sessões
    // isoladas compartilham.
    const v = pedir(DEPLOY, [`${PASTA_QUE_PASSA_DIRETO}sessao-a.md`, `${PASTA_QUE_PASSA_DIRETO}sessao-b.md`]);
    expect(v.barrar).toBe(false);
  });

  it("MAS reivindicação MISTURADA com código é barrada — e só o código é citado", () => {
    const v = pedir(DEPLOY, [`${PASTA_QUE_PASSA_DIRETO}x.md`, "lib/agency/esteira/fases.ts"]);
    expect(v.barrar).toBe(true);
    if (v.barrar) expect(v.foraDaReivindicacao).toEqual(["lib/agency/esteira/fases.ts"]);
  });

  it("NÃO CONSEGUI COMPARAR (`null`) avisa e DEIXA PASSAR — o caso do CI", () => {
    // Este é o caminho que o runner percorre: checkout raso, sem
    // `origin/<deploy>` local. Portão que barra por falta de informação ensina
    // todo mundo a usar `--no-verify`, e aí ele deixa de existir.
    const v = pedir(DEPLOY, null);
    expect(v.barrar).toBe(false);
    if (!v.barrar) expect(v.aviso).toContain("não consegui comparar");
  });

  it("e `null` NUNCA é confundido com lista vazia — são duas coisas", () => {
    const semNada = pedir(DEPLOY, []);
    const semSaber = pedir(DEPLOY, null);
    expect(semNada.barrar).toBe(false);
    expect(semSaber.barrar).toBe(false);
    // A diferença está no AVISO: "nada mudou" é silêncio; "não sei" fala.
    expect((semNada as { aviso?: string }).aviso).toBeUndefined();
    expect((semSaber as { aviso?: string }).aviso).toBeTruthy();
  });

  it("push que nem vai para a branch de deploy nem é avaliado", () => {
    const v = pedir("outra-branch", null);
    expect(v.barrar).toBe(false);
    expect((v as { aviso?: string }).aviso).toBeUndefined();
  });
});

describe("CATRACA 2 — `tsc --noEmit`, com o código de saída conferido", () => {
  const fonte = readFileSync(SCRIPT, "utf8");

  it("a casca roda `tsc --noEmit` e DECIDE pelo código de saída", () => {
    // MUTAÇÃO QUE PROVA: troque `if (r.status !== 0)` por `if (false)` — a
    // catraca vira enfeite, e esta linha cai.
    expect(fonte).toContain('spawnSync("npx", ["tsc", "--noEmit"]');
    expect(fonte).toContain("if (r.status !== 0)");
  });

  it("ferramenta AUSENTE avisa e deixa passar — portão que barra por infraestrutura é desligado", () => {
    expect(fonte).toContain("if (r.error)");
    expect(fonte).toContain("Ferramenta ausente não é defeito do código");
  });
});

describe("o gancho pre-push carrega as duas catracas", () => {
  const fonte = readFileSync(SCRIPT, "utf8");

  it("o conteúdo do gancho chama o portão", () => {
    // MUTAÇÃO QUE PROVA: apague a linha `portao-de-push` de
    // `CONTEUDO_DO_GANCHO` e esta linha cai.
    expect(fonte).toContain('"$(git rev-parse --show-toplevel)/scripts/reivindicar.mts" portao-de-push');
  });

  it("o `conferir` deixou de ter o código de saída engolido", () => {
    // Defeito achado nesta fase: sem o `|| exit 1`, o veredito do `conferir`
    // morria na linha seguinte. Catraca que não confere o código de saída é
    // catraca que aprova tudo.
    expect(fonte).toContain("conferir || exit 1");
  });

  it("a casca usa a régua pura — a decisão não voltou para dentro do script", () => {
    // MUTAÇÃO QUE PROVA: reescreva o `if`/`filter` dentro de `reivindicar.mts`
    // e esta linha cai. Foi a decisão morar na casca que fez o teste medir o
    // repositório em vez da régua, e reprovar no CI.
    expect(fonte).toContain("vereditoDoPortao({ refs");
    expect(fonte).toContain('from "../lib/coordenacao/portao-de-push.ts"');
  });
});
