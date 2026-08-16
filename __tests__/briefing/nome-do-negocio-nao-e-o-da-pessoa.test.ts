import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerNegocio } from "@/lib/agency/comercial/negocio-do-lead";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE TESTE EXISTE
//
// A porta pública do briefing (`app/briefing/page.tsx`) mandava, no campo do
// NEGÓCIO, o nome de QUEM preencheu:
//
//     businessName: data.prospectName ?? contatoDaPorta?.nome ?? data.title
//
// O nome do negócio já vinha pronto no submit (`PublicBriefingRoom.tsx:1344`,
// montado do escopo acumulado da conversa) e simplesmente não era usado. O
// resultado ia direto para a coluna `businessName` do banco: a ficha do cliente
// nascia chamada como a pessoa, não como a empresa.
//
// É o IRMÃO do bug que `74810b75` fechou no `prospect-engine` (o e-mail do
// prospect virando nome do negócio). Duas portas gravavam o mesmo campo, e
// consertar uma deixava a outra vazando em silêncio — exatamente o padrão que
// esta casa pagou em 16/08 com as DUAS rotas que criavam cadastro de cliente.
//
// A regra de leitura NÃO é reimplementada aqui: quem decide "isto é um nome ou
// isto é nada" é `lerNegocio` (`negocio-do-lead.ts`), o leitor único criado no
// commit `d2367cf4`. Uma terceira versão da mesma regra seria o defeito que os
// dois consertos anteriores vieram fechar.
// ─────────────────────────────────────────────────────────────────────────────

const ARQUIVO = readFileSync(join(process.cwd(), "app/briefing/page.tsx"), "utf8");

/** O código sem os comentários — o comentário cita o defeito antigo de
 *  propósito, e uma busca ingênua acusaria a própria explicação histórica. */
const FONTE = ARQUIVO
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((linha) => !linha.trim().startsWith("//"))
  .join("\n");

describe("o campo do negócio recebe o NEGÓCIO, nunca o nome da pessoa", () => {
  it("a porta pública manda o nome do negócio que veio do briefing", () => {
    expect(FONTE).toMatch(/businessName:\s*lerNegocio\(data\.businessName\)/);
  });

  it("o nome da pessoa não é mais candidato ao campo do negócio", () => {
    // As três fontes do fallback antigo, na ordem em que apareciam. Nenhuma
    // delas pode voltar a alimentar `businessName`: `prospectName` e
    // `contatoDaPorta.nome` são a PESSOA, e `title` é uma frase montada
    // ("Orçamento — …"), não um nome de empresa.
    expect(FONTE).not.toMatch(/businessName:\s*data\.prospectName/);
    expect(FONTE).not.toMatch(/businessName:[^\n]*contatoDaPorta\?\.nome/);
    expect(FONTE).not.toMatch(/businessName:[^\n]*data\.title/);
  });

  it("usa o leitor único da casa, não uma terceira versão da regra", () => {
    expect(FONTE).toContain('from "@/lib/agency/comercial/negocio-do-lead"');
  });

  // ── AS DUAS METADES DA REGRA, no leitor que decide ────────────────────────

  it("negócio informado entra inteiro, sem virar outra coisa", () => {
    expect(lerNegocio("Clínica Bela Face")).toBe("Clínica Bela Face");
    expect(lerNegocio("  Sushi Cazza  ")).toBe("Sushi Cazza");
  });

  it("negócio ausente NÃO vira o nome da pessoa nem o e-mail", () => {
    // Ausência de informação não é informação. Sem revisor humano, um nome
    // deduzido vira dado inventado no cadastro do cliente — e ninguém depois
    // consegue dizer se "Dioli Santos" é a empresa ou a pessoa.
    for (const vazio of ["", "   ", null, undefined]) {
      expect(lerNegocio(vazio)).toBeNull();
    }
    // O que a porta manda nesse caso é a ausência declarada (`""`), que a casa
    // inteira já sabe ler — nunca o nome de quem preencheu.
    expect(lerNegocio(null) ?? "").toBe("");
  });
});

describe("a rota pública não descarta o briefing por falta do nome do negócio", () => {
  const ROTA = readFileSync(join(process.cwd(), "app/api/brain/client-requests/route.ts"), "utf8");

  it("aceita a ausência declarada em vez de responder 400 e perder a conversa", () => {
    // A guarda antiga (`if (!businessName …)`) derrubava string vazia com 400.
    // E derrubava CALADA: a tela trata a falha do dual-write como não-fatal, e
    // o briefing inteiro do prospect ia embora por causa de um campo
    // descritivo. Perder a conversa é o dano caro; não saber o nome do negócio
    // é o barato, e a casa já sabe exibir esse "não sei".
    expect(ROTA).not.toMatch(/if\s*\(\s*!businessName\s*\|\|/);
    expect(ROTA).toMatch(/if\s*\(\s*typeof businessName !== "string"\s*\)/);
  });

  it("continua exigindo o campo — presença e tipo", () => {
    // Aceitar `undefined` deixaria passar quem esqueceu o campo, e aí a
    // ausência deixa de ser declarada para virar acidente.
    expect(ROTA).toContain('{ error: "businessName required" }');
    expect(ROTA).toContain("status: 400");
  });
});
