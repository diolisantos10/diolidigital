import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── POR QUE ESTE TESTE EXISTE ──────────────────────────────────────────────
//
// Em 15/08/2026 o raio-x noturno estava parado havia dez dias — e o painel do
// GitHub mostrava OITO rodadas seguidas em VERDE. Ele rodava mesmo: fazia
// `checkout` de `ref: claude/dioli-pm-role-pow56e`, uma branch congelada,
// varria aquele código velho e empurrava a coleta de volta para lá. A branch de
// trabalho ficou com a última coleta em 05/08 e ninguém viu, porque o sinal que
// se olha ("o job passou?") continuava dizendo que sim.
//
// O mesmo defeito estava em `biblioteca-diaria.yml`, e ali é pior: são NOVE
// noites de recaptura da biblioteca de plataformas commitadas na branch morta,
// enquanto o CHANGELOG da branch viva parava em 06/08. É essa biblioteca que
// impede o parecer da trava de plataforma de ser opinião de memória.
//
// O comentário no YAML não protege nada — comentário é aviso, e a lei da casa
// pede TRAVA. Esta é a trava: nome de branch escrito à mão numa rotina que
// commita reprova o CI.

const PASTA = join(process.cwd(), ".github", "workflows");

/**
 * Devolve os motivos pelos quais um workflow aponta para uma branch FIXA.
 * Lista vazia = limpo. Função pura: é ela que os dois lados do teste exercitam.
 */
export function branchesFixasEm(yaml: string): string[] {
  const motivos: string[] = [];

  // Só interessa a rotina que ESCREVE de volta no repositório. Workflow que
  // apenas lê pode fixar uma ref sem que nada apodreça em silêncio.
  if (!/git\s+push\s/.test(yaml)) return motivos;

  for (const linha of yaml.split("\n")) {
    const semComentario = linha.replace(/#.*$/, "");

    // 1. `ref: <nome-literal>` no checkout — o que faz varrer código velho.
    const ref = semComentario.match(/^\s*ref:\s*(.+?)\s*$/);
    if (ref && !ref[1].includes("${{")) {
      motivos.push(`checkout com ref fixa: ${ref[1]}`);
    }

    // 2. `git push origin HEAD:<nome-literal>` — o que faz o resultado
    //    aterrissar onde ninguém olha.
    const push = semComentario.match(/git\s+push\s+\S+\s+["']?HEAD:([^"'\s]+)/);
    if (push && !push[1].includes("${{") && !push[1].includes("$")) {
      motivos.push(`push para branch fixa: ${push[1]}`);
    }

    // 3. `git pull --rebase origin <nome-literal>` — mesma doença, mesmo lugar.
    const pull = semComentario.match(
      /git\s+pull\s+--rebase\s+\S+\s+["']?([^"'\s|]+)/,
    );
    if (pull && !pull[1].includes("${{") && !pull[1].includes("$")) {
      motivos.push(`pull de branch fixa: ${pull[1]}`);
    }
  }

  return motivos;
}

describe("rotina agendada não pode apontar para branch fixa", () => {
  // ── METADE 1: acha o problema plantado ──────────────────────────────────
  it("REPROVA o workflow exatamente como ele estava quando o raio-x ficou cego", () => {
    const comoEstava = `
jobs:
  coletar:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: claude/dioli-pm-role-pow56e
          persist-credentials: true
      - name: Guardar a coleta
        run: |
          git add docs/raio-x/coletas
          git commit -m "coleta"
          git pull --rebase origin claude/dioli-pm-role-pow56e || exit 0
          git push origin HEAD:claude/dioli-pm-role-pow56e
`;
    const motivos = branchesFixasEm(comoEstava);
    expect(motivos).toHaveLength(3);
    expect(motivos.join(" ")).toContain("claude/dioli-pm-role-pow56e");
  });

  it("REPROVA mesmo que só o push tenha ficado para trás", () => {
    const meioConsertado = `
    steps:
      - uses: actions/checkout@v4
      - run: git push origin HEAD:claude/branch-morta
`;
    expect(branchesFixasEm(meioConsertado)).toEqual([
      "push para branch fixa: claude/branch-morta",
    ]);
  });

  // ── METADE 2: não inventa problema no caso limpo ────────────────────────
  it("NÃO reprova a forma consertada, que segue a branch que disparou a rodada", () => {
    const consertado = `
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: true
      - name: Guardar a coleta
        env:
          BRANCH: \${{ github.ref_name }}
        run: |
          git pull --rebase origin "$BRANCH" || exit 0
          git push origin "HEAD:$BRANCH"
`;
    expect(branchesFixasEm(consertado)).toEqual([]);
  });

  it("NÃO reprova quem fixa uma ref mas não commita de volta", () => {
    const soLeitura = `
    steps:
      - uses: actions/checkout@v4
        with:
          ref: claude/alguma-branch
      - run: npm test
`;
    expect(branchesFixasEm(soLeitura)).toEqual([]);
  });

  it("NÃO confunde a palavra dentro de um comentário com configuração", () => {
    const soComentario = `
    steps:
      # ref: claude/dioli-pm-role-pow56e  <- era assim, e era o defeito
      - uses: actions/checkout@v4
      - run: git push origin "HEAD:\${{ github.ref_name }}"
`;
    expect(branchesFixasEm(soComentario)).toEqual([]);
  });

  // ── E o que interessa: os arquivos DE VERDADE, hoje ─────────────────────
  it("nenhum workflow deste repositório commita para uma branch escrita à mão", () => {
    const arquivos = readdirSync(PASTA).filter((n) => n.endsWith(".yml"));
    expect(arquivos.length).toBeGreaterThan(0);

    const sujos: string[] = [];
    for (const nome of arquivos) {
      const motivos = branchesFixasEm(readFileSync(join(PASTA, nome), "utf8"));
      for (const m of motivos) sujos.push(`${nome} — ${m}`);
    }

    expect(sujos).toEqual([]);
  });
});
