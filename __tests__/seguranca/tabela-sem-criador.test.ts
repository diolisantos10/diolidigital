// A CATRACA DA TRAVA SEM FECHADURA.
//
// ── O defeito que ela reprova, medido duas vezes em 27/08/2026 ──────────────
// `IsencaoDeParceria` nasceu com o portão que a LÊ (`portao-de-pagamento.ts`) e
// o reset que a APAGA (`admin/reset`). **Nada, em lugar nenhum, criava uma.**
//
// O portão estava impecável — dono obrigatório, validade obrigatória, validade
// ilegível recusada, fail-closed. E consultava uma tabela que ninguém conseguia
// preencher. Trava perfeita numa porta sem maçaneta.
//
// O efeito: o cliente 001, que entra por parceria e não paga, era
// INCONCEDÍVEL. O commit chamado "o cliente 001 entra sem furar o portão de
// pagamento" não fazia o cliente 001 entrar.
//
// Este modo de falha é silencioso por construção: `tsc` fica verde (o código
// existe e compila), a suíte fica verde (os testes chamam a função direto), e a
// única coisa que falta é alguém CHAMAR. Nenhuma régua da casa fazia essa
// pergunta. Esta faz.
//
// ── Por que ESTA catraca é estreita, e isso é a decisão ────────────────────
// A pergunta larga — "que função exportada nenhuma tela chama?" — foi medida
// nesta mesma sessão e devolveu **250** resultados em `lib/agency`, quase todos
// falsos positivos (auxiliares internos, chamados por outra função do mesmo
// módulo). Régua larga é régua desligada na primeira reclamação — a casa já
// escreveu isso sobre a régua da promessa do SDR.
//
// Tabela de banco é outra coisa: o conjunto é fechado (o schema), a pergunta é
// binária, e o resultado hoje é ZERO. Régua com zero falso positivo é régua que
// sobrevive.
//
// ⚠️ E UMA ARMADILHA QUE QUASE ME ENGANOU, escrita aqui para não pegar o
// próximo: a primeira versão desta varredura devolveu "nenhum caso" **inclusive
// no estado em que o defeito existia**. A causa era `lib/generated/prisma/`: o
// cliente gerado traz, em comentário de documentação, um exemplo de CADA
// operação para CADA modelo — então todo modelo parecia ter um `create`.
// Detector cego devolve verde, e verde por ausência não é verde. Por isso o
// código gerado e as linhas de comentário são excluídos, e por isso o teste
// abaixo prova a varredura contra um caso conhecido antes de confiar nela.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();

/** Escrever, ler, apagar — em nomes do Prisma. */
const ESCREVE = ["create", "createMany", "upsert"];
const LE = ["findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy"];
const APAGA = ["delete", "deleteMany"];

/** Onde mora código que a casa escreveu. `lib/generated` fica FORA: ver o aviso
 *  no cabeçalho — é a fonte exata do falso verde. */
const PASTAS = ["lib", "app", "scripts", "components"];

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  let entradas: string[];
  try { entradas = readdirSync(dir); } catch { return acc; }
  for (const e of entradas) {
    const p = join(dir, e);
    const rel = relative(RAIZ, p);
    if (rel.startsWith("lib/generated") || e === "node_modules" || e === ".next") continue;
    if (statSync(p).isDirectory()) arquivosDeCodigo(p, acc);
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

/** As linhas que são CHAMADA, não documentação. */
function linhasDeCodigo(caminhos: string[]): string[] {
  const out: string[] = [];
  for (const p of caminhos) {
    for (const linha of readFileSync(p, "utf8").split("\n")) {
      const t = linha.trim();
      if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
      out.push(t);
    }
  }
  return out;
}

const MODELOS = [
  ...readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8").matchAll(/^model (\w+) \{/gm),
].map((m) => m[1]);

const CODIGO = linhasDeCodigo(PASTAS.flatMap((d) => arquivosDeCodigo(join(RAIZ, d))));

/** O acessor Prisma do modelo: `IsencaoDeParceria` → `isencaoDeParceria`. */
const acessor = (modelo: string) => modelo[0].toLowerCase() + modelo.slice(1);

function usos(modelo: string, ops: string[], linhas: string[] = CODIGO): boolean {
  const a = acessor(modelo);
  return linhas.some((l) => ops.some((o) => l.includes(`.${a}.${o}`)));
}

function semCriador(linhas: string[]): string[] {
  return MODELOS.filter(
    (m) => (usos(m, LE, linhas) || usos(m, APAGA, linhas)) && !usos(m, ESCREVE, linhas),
  );
}

describe("a varredura enxerga — provada contra um caso conhecido", () => {
  it("o schema foi lido de verdade", () => {
    expect(MODELOS.length).toBeGreaterThan(50);
    expect(MODELOS).toContain("IsencaoDeParceria");
  });

  it("há código para varrer, e ele não é o cliente gerado", () => {
    expect(CODIGO.length).toBeGreaterThan(10_000);
    expect(CODIGO.some((l) => l.includes(".isencaoDeParceria.findUnique"))).toBe(true);
    expect(CODIGO.some((l) => l.includes(".isencaoDeParceria.create"))).toBe(true);
  });

  it("🔴 ACHA o defeito real: sem o criador da isenção, ela é denunciada", () => {
    // O estado exato de 26/08/2026 — o portão lia, o reset apagava, nada criava.
    const comoEraOntem = CODIGO.filter((l) => !l.includes(".isencaoDeParceria.create"));
    expect(semCriador(comoEraOntem)).toContain("IsencaoDeParceria");
  });

  it("e NÃO denuncia quando o criador existe — a régua distingue os dois estados", () => {
    expect(semCriador(CODIGO)).not.toContain("IsencaoDeParceria");
  });
});

describe("nenhuma tabela é lida ou apagada sem que algo saiba criá-la", () => {
  it("o conjunto está vazio", () => {
    const orfas = semCriador(CODIGO);
    expect(
      orfas,
      "Tabela LIDA ou APAGADA que NADA cria — trava sem fechadura.\n" +
        "Ou o caminho de escrita ainda não foi construído (foi o caso da\n" +
        "IsencaoDeParceria e do cliente 001, que ficou inconcedível), ou o\n" +
        "modelo é resíduo e deveria sair do schema. As duas exigem decisão\n" +
        "humana — nenhuma se resolve baixando esta régua.\n" +
        `Órfãs: ${orfas.join(", ")}`,
    ).toEqual([]);
  });
});
