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
// Duas regras escritas, duas furadas. Agora são código, no gancho `pre-push`
// que o `npm install` instala sozinho — e este arquivo é a catraca da catraca:
// ele impede que alguém apague qualquer uma das duas sem ficar vermelho.
//
// ⚠️ O QUE ELE NÃO PROVA, e a distinção é a de sempre: que o gancho está
// INSTALADO na máquina de quem lê. `--no-verify` fura qualquer gancho, e
// gancho local não alcança quem empurra pela web do GitHub. A trava do
// servidor (proteção de branch) é outra, e o que aconteceu com ela está
// declarado no relatório da Fase 1 — não aqui, para esta régua não afirmar o
// que não mede.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SCRIPT = "scripts/reivindicar.mts";
const BRANCH_DE_DEPLOY = "claude/dioli-agency-os-architecture-kk7kp";

/** Roda o portão como o git o roda: as refs do push vêm pela ENTRADA PADRÃO. */
function portao(refsNaEntrada: string): { codigo: number; saida: string } {
  try {
    const saida = execFileSync("npx", ["tsx", SCRIPT, "portao-de-push"], {
      input: refsNaEntrada, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    return { codigo: 0, saida };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { codigo: err.status ?? 1, saida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const ref = (branchRemota: string) => `refs/heads/local abc123 refs/heads/${branchRemota} def456\n`;

describe("o gancho pre-push carrega as duas catracas", () => {
  const gancho = readFileSync(SCRIPT, "utf8");

  it("o conteúdo do gancho chama o portão — e o `conferir` deixou de ser ignorado", () => {
    // MUTAÇÃO QUE PROVA: apague a linha `portao-de-push` de
    // `CONTEUDO_DO_GANCHO` e esta linha cai.
    expect(gancho).toContain('"$(git rev-parse --show-toplevel)/scripts/reivindicar.mts" portao-de-push');
    // E o `conferir` que já existia passou a decidir: sem o `|| exit 1` o
    // código de saída dele era engolido pela linha seguinte. Catraca que não
    // confere o código de saída é catraca que aprova tudo.
    expect(gancho).toContain('conferir || exit 1');
  });

  it("o gancho recebe os argumentos do git — sem eles o portão mede o remoto, não a branch", () => {
    // `git push origin HEAD:outra-branch` chama o gancho com `<nome> <url>`:
    // o primeiro argumento é "origin", NUNCA a branch. Quem sabe o destino
    // real é a entrada padrão. O `"$@"` está aqui para o dia em que o portão
    // precisar do remoto — e para que a passagem não se perca em silêncio.
    expect(gancho).toContain('portao-de-push "$@"');
  });
});

describe("CATRACA 1 — ninguém empurra direto na branch de deploy", () => {
  it("push na branch de deploy com arquivo de CÓDIGO é BARRADO", () => {
    const r = portao(ref(BRANCH_DE_DEPLOY));
    expect(r.codigo, `o portão deixou passar:\n${r.saida}`).toBe(1);
    expect(r.saida).toContain("PUSH DIRETO NA BRANCH DE DEPLOY");
    // E ele diz o que fazer no lugar — proibição sem instrução gêmea empurra
    // a próxima sessão para o `--no-verify`.
    expect(r.saida).toContain("git switch -c");
  });

  it("push numa branch PRÓPRIA passa — é o caminho que a casa quer", () => {
    const r = portao(ref("claude/uma-branch-qualquer-de-trabalho"));
    expect(r.codigo, r.saida).toBe(0);
  });

  it("push sem refs na entrada NÃO barra — falta de informação não é veredito", () => {
    const r = portao("");
    expect(r.codigo, r.saida).toBe(0);
  });

  it("`reivindicacoes/` continua passando — barrá-la quebraria a trava de colisão", () => {
    // A exceção não é conveniência: `abrir`/`encerrar` publicam a
    // reivindicação com `git push origin HEAD:<branch de deploy>`, e é a única
    // fonte que duas sessões isoladas compartilham. A régua está no código do
    // portão, e é ela que este teste congela.
    const fonte = readFileSync(SCRIPT, "utf8");
    expect(fonte).toContain('!f.startsWith("reivindicacoes/")');
  });
});

describe("CATRACA 2 — `tsc --noEmit`, com o código de saída conferido", () => {
  it("o portão roda `tsc --noEmit` e DECIDE pelo código de saída", () => {
    const fonte = readFileSync(SCRIPT, "utf8");
    // MUTAÇÃO QUE PROVA: troque `if (r.status !== 0)` por `if (false)` — a
    // catraca vira enfeite, e esta linha cai.
    expect(fonte).toContain('spawnSync("npx", ["tsc", "--noEmit"]');
    expect(fonte).toContain("if (r.status !== 0)");
    expect(fonte).toContain("process.exit(1)");
  });

  it("a árvore de agora COMPILA — se não compilasse, o push desta sessão estaria barrado", () => {
    // Não é redundância com o CI: é a mesma pergunta feita no momento em que
    // ela ainda é barata de responder. E este teste é o que faz a catraca 2
    // ter dente dentro da própria suíte.
    const r = portao(ref("claude/uma-branch-qualquer-de-trabalho"));
    expect(r.codigo, `\`tsc --noEmit\` reprovou a árvore:\n${r.saida}`).toBe(0);
    expect(r.saida).not.toContain("REPROVOU");
  });

  it("ferramenta AUSENTE avisa e deixa passar — portão que barra por infraestrutura é desligado", () => {
    const fonte = readFileSync(SCRIPT, "utf8");
    expect(fonte).toContain("if (r.error)");
    expect(fonte).toContain("Ferramenta ausente não é defeito do código");
  });
});
