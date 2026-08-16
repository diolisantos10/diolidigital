import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// A ROTA QUE MEDE PRODUÇÃO SEM CREDENCIAL DE TERMINAL — 16/08/2026
//
// Três vezes no mesmo dia a medição de produção parou no mesmo muro:
// `npx @railway/cli whoami → "Unauthorized"`, e `railway login` é interativo.
// Duas ferramentas de saneamento subiram ao CEO com o tamanho da sujeira
// DESCONHECIDO — não por falta de regra, mas por falta de acesso.
//
// A rota roda DENTRO do container, onde o banco de produção é local. Com ela, a
// decisão que sobe ao CEO deixa de ser "me dá credencial?" e passa a ser "o
// tamanho é este, corrijo?".
//
// O QUE ESTE TESTE GUARDA: que ela continue sendo o que foi desenhada para ser —
// **uma rota que MEDE**. No dia em que alguém acrescentar um `update` "só para
// facilitar", isto cai.
// ─────────────────────────────────────────────────────────────────────────────

const CAMINHO = "app/api/piloto/diagnostico/route.ts";
const ARQUIVO = readFileSync(join(process.cwd(), CAMINHO), "utf8");
const CODIGO = ARQUIVO
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

describe("a rota NÃO escreve — nenhum caminho, nenhum verbo", () => {
  it("só existe GET", () => {
    expect(CODIGO).toMatch(/export async function GET/);
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(CODIGO, `apareceu um ${verbo} nesta rota`).not.toMatch(new RegExp(`export async function ${verbo}`));
    }
  });

  it("o único verbo de banco é findMany", () => {
    // Prova por mutação: qualquer escrita de Prisma que alguém acrescente aqui
    // derruba este teste. É o que separa "somente leitura" de "somente leitura
    // por enquanto".
    for (const escrita of ["update", "updateMany", "create", "createMany", "delete", "deleteMany", "upsert", "$executeRaw"]) {
      expect(CODIGO, `a rota de diagnóstico passou a chamar ${escrita}`).not.toMatch(
        new RegExp(`prisma\\.[A-Za-z]+\\.${escrita.replace("$", "\\$")}`),
      );
    }
    expect(CODIGO).toMatch(/prisma\.clientRequestDb\.findMany/);
  });

  it("não importa as ferramentas de correção", () => {
    // As regras de DIAGNÓSTICO são importadas (puras, testadas). Os SCRIPTS que
    // escrevem, não — importar um deles traria o caminho de escrita junto.
    // Só as linhas de IMPORT valem: a resposta cita o nome dos scripts em texto,
    // de propósito, para quem lê o JSON não ter de perguntar como corrigir.
    // Citar não é importar — e um teste que confunde as duas coisas proíbe a
    // documentação em vez do defeito.
    const imports = CODIGO.split("\n").filter((l) => l.trim().startsWith("import"));
    for (const l of imports) {
      expect(l, `a rota importou um script de correção: ${l}`).not.toMatch(/scripts\//);
    }
  });
});

describe("segredo ausente não vira porta aberta", () => {
  it("sem segredo configurado, responde 503 e não mede nada", () => {
    // O `if (secret)` que só protege quando a variável existe deixa a porta
    // escancarada em produção mal configurada — e tudo continua funcionando,
    // então ninguém percebe.
    expect(CODIGO).toMatch(/if \(!esperado\)[\s\S]{0,200}status: 503/);
    // E a checagem de autorização também falha fechada.
    expect(CODIGO).toMatch(/if \(!esperado\) return false/);
  });

  it("chave errada responde 401", () => {
    expect(CODIGO).toMatch(/status: 401/);
  });

  it("usa a comparação timing-safe da casa, não uma nova", () => {
    // Não se inventa proteção quando a casa já tem uma provada — e comparação de
    // string com `===` vaza o segredo por tempo de resposta.
    expect(CODIGO).toContain("segredoConfere");
    expect(CODIGO).not.toMatch(/esperado\s*===\s*(doHeader|daQuery)/);
  });
});

describe("devolve o tamanho, não o conteúdo", () => {
  it("os três estados do volume aparecem SEPARADOS", () => {
    // Somar "não recuperável" com "confere" esconderia o buraco: ausência de
    // conversa gravada não é atestado de que está certo.
    expect(CODIGO).toMatch(/confere:/);
    expect(CODIGO).toMatch(/subestimado:/);
    expect(CODIGO).toMatch(/nao_recuperavel:/);
  });

  it("não devolve PII do prospect nem o briefing inteiro", () => {
    // Contagens e ids bastam para dimensionar. A frase original é prova, e vive
    // no relatório do script — que roda no terminal de quem já tem o banco.
    for (const vazamento of ["frase", "businessName:", "briefingJson:", "prospectName", "prospectPhone", "transcript"]) {
      expect(CODIGO, `a resposta passou a carregar ${vazamento}`).not.toMatch(
        new RegExp(`\\b${vazamento.replace(":", "")}\\b\\s*[,:]\\s*(m\\.|l\\.|linha)`),
      );
    }
    expect(CODIGO).toMatch(/ids_subestimados: volume\.mudancas\.map\(\(m\) => m\.id\)/);
  });

  it("falha de leitura não vira zero", () => {
    // "Não há sujeira" e "não consegui olhar" são fatos opostos. O segundo com
    // cara do primeiro é como esta casa deixou uma fila invisível por 7 semanas.
    expect(CODIGO).toMatch(/medido: false/);
    expect(CODIGO).toMatch(/NÃO são zero|não são zero/i);
  });

  it("reaproveita as regras já testadas — não escreve uma terceira versão", () => {
    expect(CODIGO).toContain("comercial/volume-subestimado");
    expect(CODIGO).toContain("comercial/diagnostico-do-negocio");
  });
});
