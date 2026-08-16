// O LOG DA TRAVA DE PREÇO NÃO PODE CARREGAR NOME DE CLIENTE — e carregava.
//
// ── O BLOQUEANTE (16/08/2026, achado por `qualidade`) ───────────────────────
//
// `app/api/sdr/chat/route.ts` gravava `trecho: vazamento[0].slice(0, 40)`, com
// um comentário logo acima AFIRMANDO que nome de pessoa e de negócio não
// entravam na linha. A afirmação era falsa, e a prova é o quarto ramo do regex
// da trava:
//
//     /r\$\s*\d | \d+\s*(reais|\/m[êe]s\b) | desconto | \bplano\b.*\bR\$/i
//                                                        ▲
//                                        `.*` GULOSO — começa em "plano" e
//                                        arrasta tudo até o cifrão.
//
// Reproduzido com a frase real:
//
//   "Para o plano da Pizzaria do Joao Silva, dono Marcelo, o valor fica em R$ 500."
//        → gravava  "plano da Pizzaria do Joao Silva, dono Ma"
//
// Nome de pessoa e nome de negócio no log de um contêiner cujo acesso não é o
// acesso ao banco. Este arquivo é o portão que impede a volta: as duas metades
// são "o recorte cru VAZA" (para a regra não virar folclore) e "a marca nova
// NÃO vaza, e ainda assim serve para diagnosticar".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { marcaDoVazamento } from "@/lib/agency/comercial/resposta-de-preco";

// O MESMO regex da rota (o teste `trava-de-preco-do-sdr` prova que é o mesmo).
const PRICE_LEAK = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;

// As frases que o auditor executou contra a trava. São dados de teste, não
// clientes reais — mas têm a FORMA do que aparece numa conversa de verdade.
const COM_NOME = "Para o plano da Pizzaria do Joao Silva, dono Marcelo, o valor fica em R$ 500.";
const COM_NOME_2 = "Fechando o plano da Clinica Camila Pereira, com o Ricardo, sai por R$ 1.200 mensais.";
const IDENTIDADES = ["Pizzaria", "Joao", "Silva", "Marcelo", "Clinica", "Camila", "Pereira", "Ricardo"];

describe("o recorte cru era vazamento — a metade que documenta o defeito", () => {
  it("`vazamento[0]` arrasta a frase inteira, com nome de pessoa e de negócio", () => {
    const bruto = COM_NOME.match(PRICE_LEAK)?.[0] ?? "";
    // É isto que ia para o log — e os 40 caracteres do slice não salvavam nada.
    expect(bruto).toContain("Pizzaria");
    expect(bruto).toContain("Joao Silva");
    expect(bruto.slice(0, 40)).toBe("plano da Pizzaria do Joao Silva, dono Ma");
  });

  it("o `.*` guloso é a causa — sem ele o casamento não passaria de 'plano'", () => {
    expect(PRICE_LEAK.source).toContain("\\bplano\\b.*\\bR\\$");
  });
});

describe("a marca nova NÃO carrega identidade", () => {
  // ── METADE 1: NÃO VAZA ────────────────────────────────────────────────────
  it.each([
    ["a frase do bloqueante", COM_NOME, "R$ 500"],
    ["outra, com clínica e dois nomes", COM_NOME_2, "R$ 1.200"],
  ])("%s: grava só o valor casado", (_caso, frase, esperado) => {
    const marca = marcaDoVazamento(frase);
    expect(marca.valor).toBe(esperado);
    const linha = JSON.stringify(marca);
    for (const nome of IDENTIDADES) {
      expect(linha, `"${nome}" apareceu na linha de log: ${linha}`).not.toContain(nome);
    }
  });

  it("nenhuma letra além do padrão monetário sobrevive ao campo `valor`", () => {
    // Trava de forma, não de conteúdo: o campo só pode ter cifrão, dígito,
    // separador, espaço e as palavras "reais"/"mês". Qualquer outra coisa é
    // texto livre voltando pela porta dos fundos.
    for (const frase of [COM_NOME, COM_NOME_2, "Consigo 20% de desconto para o Joao", "Fica em 800 reais para a Pizzaria do Marcelo"]) {
      const v = marcaDoVazamento(frase).valor;
      if (v === null) continue;
      expect(v, `valor com texto livre: "${v}"`).toMatch(/^(?:R\$\s*[\d.,]+|[\d.,]+\s*(?:reais|\/m[êe]s))$/i);
    }
  });

  it("teto de 24 caracteres — o campo não pode virar janela de texto", () => {
    const gigante = `R$ ${"1".repeat(200)}`;
    expect(marcaDoVazamento(gigante).valor!.length).toBeLessThanOrEqual(24);
  });

  // ── METADE 2: AINDA SERVE PARA DIAGNOSTICAR ───────────────────────────────
  it("o padrão diz QUAL ramo da trava disparou — é o dado que a equipe usa", () => {
    expect(marcaDoVazamento("O Plano Ritmo fica em R$ 297/mês.").padrao).toBe("rs_com_numero");
    expect(marcaDoVazamento("Fica em torno de 1.500 reais por mês.").padrao).toBe("numero_com_reais");
    expect(marcaDoVazamento("Consigo um desconto especial hoje.").padrao).toBe("desconto");
    expect(marcaDoVazamento("Consigo um desconto especial hoje.").valor).toBeNull();
  });

  it("fala sem dinheiro nenhum não inventa valor", () => {
    const m = marcaDoVazamento("Quantos posts por semana você quer?");
    expect(m.valor).toBeNull();
    expect(m.padrao).toBe("desconhecido");
  });
});

describe("a rota grava a marca, e não o recorte", () => {
  const rota = readFileSync(path.join(process.cwd(), "app/api/sdr/chat/route.ts"), "utf8");

  it("`vazamento[0]` não aparece em lugar nenhum da rota", () => {
    expect(
      rota.includes("vazamento[0]"),
      "o recorte cru voltou para o log — ele arrasta nome de cliente",
    ).toBe(false);
  });

  it("o log estruturado é montado por `marcaDoVazamento`", () => {
    expect(rota).toContain("marcaDoVazamento(replyText)");
    expect(rota).toContain("padrao: marca.padrao");
    expect(rota).toContain("valor: marca.valor");
  });

  // ── ⛔ O PORTÃO ANTIGO FATIAVA SÓ O BLOCO DA TRAVA (16/08, terceira passada)
  //
  // Ele lia da linha `"[sdr/chat] price-leak"` até o `return`, e só. `qualidade`
  // mostrou o furo em uma frase: **um `console.warn` com `body.currentMessage`
  // em OUTRO ponto da rota passava verde.** A rota tem quatro pontos de log e o
  // portão vigiava um.
  //
  // A varredura abaixo lê TODA chamada de `console.*` do arquivo, com os
  // parênteses balanceados, e reprova qualquer uma que carregue texto livre —
  // a fala do modelo, a mensagem do cliente ou o escopo (que traz nome de
  // pessoa e de negócio dentro).

  /** Toda chamada `console.x(...)` do arquivo, com o argumento inteiro. */
  function chamadasDeLog(fonte: string): string[] {
    const achadas: string[] = [];
    const re = /console\.(?:log|warn|error|info|debug|trace)\s*\(/g;
    for (const m of fonte.matchAll(re)) {
      let i = m.index + m[0].length;
      let profundidade = 1;
      while (i < fonte.length && profundidade > 0) {
        const c = fonte[i]!;
        if (c === "(") profundidade++;
        else if (c === ")") profundidade--;
        i++;
      }
      achadas.push(fonte.slice(m.index, i));
    }
    return achadas;
  }

  /** Os identificadores que carregam texto do cliente ou do modelo. */
  const PROIBIDOS = [
    "replyText",
    "currentMessage",
    "body.messages",
    "body.scope",
    "scopePatch",
    "escopoAtual",
    "parsed.reply",
    "claudeMessages[",
    "vazamento[",
  ];

  it("🔴 NENHUM `console.*` da rota inteira carrega texto livre — não só o da trava", () => {
    const chamadas = chamadasDeLog(rota);
    expect(chamadas.length, "não achei chamada de log nenhuma — o portão virou fachada").toBeGreaterThan(0);
    for (const chamada of chamadas) {
      for (const proibido of PROIBIDOS) {
        expect(
          chamada.includes(proibido),
          `log com texto livre (\`${proibido}\`): ${chamada.replace(/\s+/g, " ").slice(0, 160)}`,
        ).toBe(false);
      }
    }
  });

  it("a varredura PEGA o log que vaza — a metade que prova que ela morde", () => {
    const plantado = `
      console.warn("[sdr/chat] algo", JSON.stringify({ turno: 3, msg: body.currentMessage }));
    `;
    const chamadas = chamadasDeLog(plantado);
    expect(chamadas).toHaveLength(1);
    expect(PROIBIDOS.some((p) => chamadas[0]!.includes(p))).toBe(true);
  });

  it("a linha da trava continua sendo a marca, e só ela", () => {
    const daTrava = chamadasDeLog(rota).find((c) => c.includes("price-leak"));
    expect(daTrava, "a linha de log da trava sumiu").toBeDefined();
    expect(daTrava).toContain("marca.padrao");
    expect(daTrava).toContain("marca.valor");
  });
});
