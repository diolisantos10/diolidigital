// A TRAVA MENTIA SOBRE O PRÓPRIO EFEITO — E AGORA HÁ COMO PROVAR QUE NÃO MENTE.
//
// ── O INCIDENTE (ficha `.despachos/B1-reivindicar-mente.md`, 29/08/2026) ────
// `npm run reivindicar -- abrir` RECUSOU e imprimiu, como última linha:
//
//   (nada foi escrito, commitado ou empurrado — o disco está como estava.)
//
// Isso era FALSO: o comando tinha CRIADO `reivindicacoes/<slug>.json`,
// COMMITADO (99977f1) e EMPURRADO para a branch de deploy — e só depois
// desfez a cópia LOCAL. A reivindicação ficou viva no remoto e invisível
// para o próprio dono, que é quem `conferir`/`encerrar` enxergam.
//
// ── A MEDIÇÃO (exercitando `scripts/reivindicar.mts`, não só lendo) ────────
// No estado atual do arquivo, `exigirBranchAlinhado(branch)` já roda ANTES
// de `writeFileSync` em `comandoAbrir` (scripts/reivindicar.mts) e em
// `comandoEncerrar` — conserto de PR #378 (commit 38cd61c, 28/08/2026), que
// já documenta esta MESMA classe de defeito ("O portão roda ANTES de
// escrever — a recusa mentia sobre o próprio efeito"). Isto PRECEDE o
// commit do incidente (99977f1, 29/08/2026 21:40 UTC) em mais de um dia —
// o sinal mais forte de que a sessão do incidente rodou uma cópia do script
// desatualizada em relação a este branch, não que a ordem atual esteja
// errada. Este arquivo não presume nenhuma das duas explicações: ele RODA o
// script de hoje, como processo, e mede.
//
// ── POR QUE ISTO NÃO EXISTIA ANTES ──────────────────────────────────────────
// `scripts/reivindicar.mts` fixava `RAIZ` a partir do próprio caminho do
// arquivo — sempre O REPOSITÓRIO REAL desta casa. `__tests__/coordenacao/
// encerrar-com-tree-sujo.test.ts` já registrou por que isso torna impossível
// rodar o script de verdade contra um repositório temporário sem reescrever
// a casca inteira — e por que um teste nunca deve escrever/empurrar no
// repositório real. A ficha B1 pede EXATAMENTE isto (rodar como processo,
// contra um repositório git temporário), então `scripts/reivindicar.mts`
// ganhou uma única válvula de escape: `REIVINDICAR_RAIZ_DE_TESTE`, uma
// variável de ambiente que só um teste automatizado define — em produção ela
// não existe, e `RAIZ` continua sendo calculada exatamente como antes.
//
// ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
// 1. No caminho que HOJE mentiria (branch com commit alheio à frente do
//    remoto): nenhum arquivo novo em disco, nenhum commit novo, nenhum push
//    — `git log` do clone local e do remoto BARE, antes e depois, idênticos.
// 2. A recusa continua dizendo "nada foi escrito, commitado ou empurrado" —
//    e agora essa frase é MEDIDA como verdadeira, não lida como promessa.
// 3. O caminho feliz (branch alinhada) continua escrevendo, commitando E
//    empurrando de verdade — a trava não amoleceu.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAIZ_DO_REPO = join(__dirname, "..", "..");
const SCRIPT = join(RAIZ_DO_REPO, "scripts", "reivindicar.mts");
const TSX = join(RAIZ_DO_REPO, "node_modules", ".bin", "tsx");

const AMBIENTE_GIT = {
  GIT_AUTHOR_NAME: "teste-dioli",
  GIT_AUTHOR_EMAIL: "teste-dioli@example.com",
  GIT_COMMITTER_NAME: "teste-dioli",
  GIT_COMMITTER_EMAIL: "teste-dioli@example.com",
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...AMBIENTE_GIT } }).trim();
}

/** `git log --oneline <branch>`, tolerando "branch/ref não existe ainda"
 *  (devolve string vazia em vez de lançar) — o remoto BARE recém-criado não
 *  tem "main" até o primeiro push. */
function logDe(cwd: string, ref: string): string {
  try {
    return execFileSync("git", ["log", "--oneline", ref], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...AMBIENTE_GIT },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

type Resultado = { code: number; saida: string };

/** Roda o SCRIPT DE VERDADE como processo — `tsx scripts/reivindicar.mts` —
 *  com `REIVINDICAR_RAIZ_DE_TESTE` apontando para o repositório temporário.
 *  `CLAUDE_CODE_SESSION_ID` é fixado para uma âncora de sessão determinística
 *  e não-degradada: sem isto, "abrir" recusaria (por padrão) rodar em modo
 *  degradado neste ambiente, e o teste ficaria refém de o ambiente que roda
 *  a suíte ter (ou não) uma sessão real do Claude Code por perto. */
function rodarReivindicar(localDir: string, args: string[]): Resultado {
  const r = spawnSync(TSX, [SCRIPT, ...args], {
    cwd: localDir,
    encoding: "utf8",
    env: {
      ...process.env,
      ...AMBIENTE_GIT,
      REIVINDICAR_RAIZ_DE_TESTE: localDir,
      CLAUDE_CODE_SESSION_ID: "sessao-de-teste-reivindicar-guarda-b1",
    },
  });
  return { code: r.status ?? -1, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

let raiz: string;
let remoto: string;
let local: string;

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "dioli-reivindicar-guarda-"));
  remoto = join(raiz, "remoto.git");
  local = join(raiz, "local");

  git(raiz, ["init", "--bare", remoto]);
  git(raiz, ["clone", remoto, local]);
  git(local, ["checkout", "-b", "main"]);
  writeFileSync(join(local, "raiz.md"), "# repositório de teste\n", "utf8");
  git(local, ["add", "raiz.md"]);
  git(local, ["commit", "-m", "estado inicial"]);
  git(local, ["push", "origin", "main"]);
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe("abrir: o branch NÃO alinhado — o caminho que hoje mentiria", () => {
  it("nenhum arquivo, nenhum commit, nenhum push — e a mensagem que promete isso é verdadeira", () => {
    // Simula "trabalho anterior não empurrado": exatamente o que
    // `soLevaAReivindicacao` existe para pegar — o branch chegaria ao push
    // levando um commit ALÉM da reivindicação.
    writeFileSync(join(local, "trabalho-anterior.txt"), "algo que não é a reivindicação\n", "utf8");
    git(local, ["add", "trabalho-anterior.txt"]);
    git(local, ["commit", "-m", "trabalho anterior, ainda não empurrado"]);

    const logLocalAntes = logDe(local, "main");
    const logRemotoAntes = logDe(remoto, "main");
    expect(logLocalAntes.split("\n")).toHaveLength(2); // estado inicial + trabalho anterior
    expect(logRemotoAntes.split("\n")).toHaveLength(1); // só o estado inicial

    const caminhoDaReivindicacao = join(local, "reivindicacoes", "teste-guarda-antes-de-escrever.json");
    expect(existsSync(caminhoDaReivindicacao)).toBe(false);

    const { code, saida } = rodarReivindicar(local, [
      "abrir",
      "--branch", "main",
      "--frente", "frente de teste: a guarda vem antes de escrever",
      "--responsabilidade", "teste-guarda-antes-de-escrever",
      "--arquivos", "arquivo-fake-da-frente.ts",
    ]);

    // 1. Recusou.
    expect(code).not.toBe(0);
    expect(saida).toContain("reivindicação NÃO empurrada");
    expect(saida).toContain("nada foi escrito, commitado ou empurrado");

    // 2. ⛔ A TRAVA, MEDIDA — não lida na mensagem, CONFERIDA no disco e no git.
    //    Nenhum arquivo de reivindicação nasceu…
    expect(existsSync(caminhoDaReivindicacao)).toBe(false);
    //    …nenhum commit novo no clone local (só os dois de antes desta chamada)…
    expect(logDe(local, "main")).toBe(logLocalAntes);
    //    …e nada chegou ao remoto BARE — a `git log` dele é IDÊNTICA a antes.
    expect(logDe(remoto, "main")).toBe(logRemotoAntes);

    // 3. E a mensagem citou o comando de saída de verdade (não deixou beco sem saída).
    expect(saida).toContain("git checkout -B");
  });
});

describe("abrir: branch alinhada — o caminho feliz continua escrevendo, commitando e empurrando", () => {
  it("cria o arquivo, commita e empurra para o remoto de verdade", () => {
    const logRemotoAntes = logDe(remoto, "main");
    expect(logRemotoAntes.split("\n")).toHaveLength(1);

    const { code, saida } = rodarReivindicar(local, [
      "abrir",
      "--branch", "main",
      "--frente", "frente de teste: o caminho feliz continua vivo",
      "--responsabilidade", "teste-caminho-feliz-continua-vivo",
      "--arquivos", "arquivo-fake-da-frente-feliz.ts",
    ]);

    expect(code).toBe(0);
    expect(saida).toContain("✅ Reivindicado");

    // O arquivo existe, localmente…
    const caminhoDaReivindicacao = join(local, "reivindicacoes", "teste-caminho-feliz-continua-vivo.json");
    expect(existsSync(caminhoDaReivindicacao)).toBe(true);
    const conteudo = JSON.parse(readFileSync(caminhoDaReivindicacao, "utf8"));
    expect(conteudo.responsabilidade).toBe("teste-caminho-feliz-continua-vivo");
    expect(conteudo.encerradaEm).toBeNull();

    // …está commitado…
    const logLocalDepois = logDe(local, "main");
    expect(logLocalDepois).toContain("reivindica: frente de teste: o caminho feliz continua vivo");

    // …e chegou ao remoto BARE — não é só um commit LOCAL órfão.
    const logRemotoDepois = logDe(remoto, "main");
    expect(logRemotoDepois).toContain("reivindica: frente de teste: o caminho feliz continua vivo");
    expect(logRemotoDepois).not.toBe(logRemotoAntes);
  });
});

describe("a válvula de teste não existe para produção", () => {
  it("REIVINDICAR_RAIZ_DE_TESTE só é lida quando definida — sem ela, RAIZ é o repositório real", () => {
    const fonte = readFileSync(SCRIPT, "utf8");
    expect(fonte).toContain("process.env.REIVINDICAR_RAIZ_DE_TESTE");
    // MUTAÇÃO QUE PROVA: troque o `?` pelo valor fixo do repositório de teste
    // (sempre usar a válvula) e esta linha cai — a válvula viraria a ÚNICA
    // fonte de RAIZ, inclusive fora de teste.
    expect(fonte).toContain('resolve(dirname(fileURLToPath(import.meta.url)), "..");');
  });
});
