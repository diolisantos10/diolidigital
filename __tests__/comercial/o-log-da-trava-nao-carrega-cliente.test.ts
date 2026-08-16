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
    // separador, espaço e as palavras "reais"/"mês" — ou o número puro que o
    // leitor extraiu. Qualquer outra coisa é texto livre voltando pela porta dos
    // fundos.
    const FORMA = /^(?:R\$\s*[\d.,]+|[\d.,]+\s*(?:reais|\/m[êe]s)|\d+)$/i;
    for (const frase of [
      COM_NOME,
      COM_NOME_2,
      "Consigo 20% de desconto para o Joao",
      "Fica em 800 reais para a Pizzaria do Marcelo",
      // As classes NOVAS entram aqui: é nelas que o campo passou a ser
      // preenchido pelo leitor, e é nelas que um recorte de texto livre voltaria.
      "Fechando com a Pizzaria do Joao Silva, sai por 1.200.",
      "Para a Clinica da Camila Pereira fica assim: 1.850 por mês.",
      "Posso ajustar para o Plano Turbo do Marcelo.",
    ]) {
      const v = marcaDoVazamento(frase).valor;
      if (v === null) continue;
      expect(v, `valor com texto livre: "${v}"`).toMatch(FORMA);
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

  // ── ⛔ A MARCA FALAVA A RÉGUA VELHA (16/08/2026, quarta passada) ────────────
  //
  // A trava passou a barrar duas classes que o regex antigo nunca viu — preço
  // implícito e nome de plano fora do catálogo — e o classificador continuou
  // perguntando à régua aposentada. Medido pelo CEO:
  //
  //   trava=true | padrao=desconhecido valor=null | "Sai por 1.200."
  //   trava=true | padrao=desconhecido valor=null | "Posso ajustar para o Plano Turbo."
  //
  // A trava dispara e ninguém sabe por quê. `desconhecido` volta a significar o
  // que o nome diz, e para isso as classes novas precisam ter nome próprio.
  it("🔴 as classes que a trava GANHOU chegam ao log com padrão e valor", () => {
    const implicito = marcaDoVazamento("Sai por 1.200.");
    expect(implicito.padrao, "preço sem cifrão continua chegando como `desconhecido`").toBe("preco_implicito");
    expect(implicito.valor, "preço sem cifrão continua chegando sem valor").toBe("1200");

    const plano = marcaDoVazamento("Posso ajustar para o Plano Turbo.");
    expect(plano.padrao, "nome de plano fantasma continua chegando como `desconhecido`").toBe("plano_fora_do_catalogo");

    // O fail-closed do parser também tem nome — saber que foi ELE que disparou
    // é a diferença entre ajustar o prompt e ajustar o leitor.
    expect(marcaDoVazamento("fica em R$ ..,.. por mês").padrao).toBe("valor_ilegivel");
  });

  it("e o valor novo é dígito puro — PII-free por construção, não por regex", () => {
    // Quando não há casamento monetário explícito, o campo passa a receber o
    // número que o LEITOR extraiu, já normalizado. Um `number` impresso não tem
    // como carregar nome de pessoa nem de negócio: a garantia é do tipo.
    const comNome = marcaDoVazamento("Fechando com a Pizzaria do Joao Silva, sai por 1.200.");
    expect(comNome.valor).toBe("1200");
    for (const nome of IDENTIDADES) {
      expect(JSON.stringify(comNome)).not.toContain(nome);
    }
    expect(comNome.valor!).toMatch(/^\d+$/);
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

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ O PORTÃO ERA EVADÍVEL POR UMA VARIÁVEL LOCAL — e o autor usou a saída
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Achado por `qualidade` em 16/08/2026 (quarta passada), em uma frase:
  //
  //     const t = body.currentMessage;  console.warn("x", t);   → PASSA VERDE
  //
  // A varredura acima procura identificadores **dentro** da chamada `console.*`.
  // Içar o valor para uma constante uma linha antes derrota o portão inteiro — e
  // foi exatamente o que a rota precisou fazer (`pareciaPerguntaDeFaixa`), com o
  // motivo escrito no código. **Quando o autor precisa da saída de emergência do
  // próprio portão para o código dele passar, o portão já está medido.**
  //
  // A REGRA QUE O CEO ADOTOU (`docs/decisoes.md`, 16/08/2026): portão que lista
  // identificadores proibidos dentro de uma chamada é derrotado por uma variável
  // local. O conserto não é engrossar a lista: é **seguir o rastro**.
  //
  // A varredura nova é de CONTÁGIO. Toda constante da rota cujo inicializador
  // menciona uma fonte proibida fica contaminada, e o contágio é TRANSITIVO —
  // ele segue `res` → `json` → `text` → `parsed` → `replyText` sem que nenhum
  // desses nomes precise estar numa lista.
  //
  // ⚠️ E A ISENÇÃO NÃO É UM NOME NA LISTA — É UMA ANOTAÇÃO DE TIPO.
  //
  // Um valor contaminado só entra no log se for declarado com anotação
  // explícita de um tipo que **não tem como carregar texto livre**: `boolean`,
  // `number`, ou `MarcaDoVazamento` (cujo `padrao` é união fechada e cujo
  // `valor` tem a forma travada pelos testes acima, neste mesmo arquivo).
  //
  // Isto responde ao "hoje é booleano; amanhã é string" com mecanismo, não com
  // confiança: quem trocar o tipo tem de trocar a anotação, e trocar a anotação
  // ou derruba este portão ou derruba o `tsc`. A régua deixou de ser "o autor
  // lembrou de não logar texto" e passou a ser "o compilador não deixa".
  const TIPOS_SEGUROS = ["boolean", "number", "MarcaDoVazamento"];

  /**
   * O código sem os comentários.
   *
   * Não é higiene: sem isto, o portão acusa o EXEMPLO DO DEFEITO escrito num
   * comentário — e o preço disso é a documentação do incidente sair do código
   * para o portão passar, que é a troca errada. Portão que não sabe distinguir
   * código de prosa ensina a apagar a prosa.
   */
  function semComentarios(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  }

  /**
   * `const X: T = <expr>;` — nome, anotação (se houver) e inicializador.
   *
   * ⛔ `let` E `var` ENTRARAM EM 16/08/2026 (quinta passada). O contágio seguia
   * só `const`, então `let x = replyText; console.warn(x)` passava verde — a
   * mesma evasão de uma variável local que produziu o portão, com outra palavra
   * na frente. Hoje a rota tem um `let` só (`let body: ChatRequest;`, sem
   * inicializador), então não havia exposição real; fechar antes de haver custa
   * uma alternância no regex, e é este o momento barato.
   */
  function constantes(fonte: string): { nome: string; tipo: string | null; init: string }[] {
    const saida: { nome: string; tipo: string | null; init: string }[] = [];
    for (const m of fonte.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*([^=;]+?)\s*)?=\s*/g)) {
      const inicio = m.index + m[0].length;
      let i = inicio;
      let prof = 0;
      while (i < fonte.length) {
        const c = fonte[i]!;
        if (c === "(" || c === "[" || c === "{") prof++;
        else if (c === ")" || c === "]" || c === "}") {
          if (prof === 0) break;
          prof--;
        } else if (c === ";" && prof === 0) break;
        i++;
      }
      saida.push({ nome: m[1]!, tipo: m[2] ?? null, init: fonte.slice(inicio, i) });
    }
    return saida;
  }

  /**
   * Os nomes contaminados que NÃO podem entrar num log: a constante cujo
   * inicializador toca uma fonte proibida (ou outra contaminada) e que não
   * declara um dos tipos provadamente incapazes de carregar texto.
   *
   * Quem declara o tipo seguro para de propagar também — de um `boolean` não sai
   * a fala do cliente.
   */
  function contaminadas(fonte: string): string[] {
    const consts = constantes(fonte);
    const sujas = new Set<string>();
    for (let passada = 0; passada < 6; passada++) {
      for (const { nome, tipo, init } of consts) {
        if (sujas.has(nome)) continue;
        if (tipo && TIPOS_SEGUROS.includes(tipo.trim())) continue;
        const tocaFonte =
          PROIBIDOS.some((p) => init.includes(p)) || [...sujas].some((s) => new RegExp(`\\b${s}\\b`).test(init));
        if (tocaFonte) sujas.add(nome);
      }
    }
    return [...sujas];
  }

  it("🔴 nem por VARIÁVEL LOCAL: o texto do cliente não chega ao log por rastro", () => {
    const codigo = semComentarios(rota);
    const sujas = contaminadas(codigo);
    expect(sujas.length, "não contaminei nada — a varredura virou fachada").toBeGreaterThan(0);
    const chamadas = chamadasDeLog(codigo);
    expect(chamadas.length, "não achei chamada de log nenhuma").toBeGreaterThan(0);
    for (const chamada of chamadas) {
      for (const suja of sujas) {
        expect(
          new RegExp(`\\b${suja}\\b`).test(chamada),
          `log com valor derivado de texto livre (\`${suja}\`): ${chamada.replace(/\s+/g, " ").slice(0, 160)}`,
        ).toBe(false);
      }
    }
  });

  it("🔴 nem por `let` nem por `var` — a evasão de uma palavra a menos", () => {
    // O portão anterior seguia SÓ `const`. Estas três linhas passavam verde.
    expect(contaminadas(`let x = replyText; console.warn("x", x);`)).toContain("x");
    expect(contaminadas(`var y = body.currentMessage; console.warn("y", y);`)).toContain("y");
    // E o contágio transitivo atravessa a mistura de declarações.
    const misturado = `
      let bruto = body.currentMessage;
      const derivado = bruto.slice(0, 40);
      console.warn("[sdr/chat] x", JSON.stringify({ derivado }));
    `;
    expect(contaminadas(misturado)).toEqual(expect.arrayContaining(["bruto", "derivado"]));
    // A isenção continua sendo o TIPO, não a palavra-chave.
    expect(contaminadas(`let ok: boolean = /faixa/i.test(replyText); console.warn("x", ok);`)).toEqual([]);
  });

  it("a varredura de contágio PEGA a evasão que `qualidade` descreveu", () => {
    const plantado = `
      const t = body.currentMessage;
      const u = t.slice(0, 40);
      console.warn("[sdr/chat] algo", JSON.stringify({ turno: 3, msg: u }));
    `;
    // A varredura ANTIGA passava verde nisto — é este o defeito.
    const chamadas = chamadasDeLog(plantado);
    expect(PROIBIDOS.some((p) => chamadas[0]!.includes(p)), "o caso não reproduz a evasão").toBe(false);
    // A nova segue o rastro em dois saltos.
    const sujas = contaminadas(plantado);
    expect(sujas).toContain("t");
    expect(sujas, "o contágio parou no primeiro salto").toContain("u");
    expect(sujas.some((s) => new RegExp(`\\b${s}\\b`).test(chamadas[0]!))).toBe(true);
  });

  it("e NÃO acusa o valor DECLARADO como booleano — a isenção é o tipo", () => {
    const limpo = `
      const pareciaPerguntaDeFaixa: boolean = /investir|faixa/i.test(replyText);
      console.warn("[sdr/chat] price-leak", JSON.stringify({ pareciaPerguntaDeFaixa }));
    `;
    expect(contaminadas(limpo)).toEqual([]);
  });

  it("🔴 'hoje é booleano, amanhã é string' — o portão pega o amanhã", () => {
    // Sem anotação nenhuma: contaminado, mesmo sendo boolean de fato hoje.
    const semAnotacao = `
      const pareciaPerguntaDeFaixa = /investir|faixa/i.test(replyText);
      console.warn("[sdr/chat] x", JSON.stringify({ pareciaPerguntaDeFaixa }));
    `;
    expect(contaminadas(semAnotacao)).toContain("pareciaPerguntaDeFaixa");

    // E o dia em que o valor vira texto: a anotação teria de mudar junto, ou o
    // `tsc` reprova. Aqui ela mudou — e o portão reprova.
    const amanha = `
      const pareciaPerguntaDeFaixa: string = replyText.slice(0, 40);
      console.warn("[sdr/chat] x", JSON.stringify({ pareciaPerguntaDeFaixa }));
    `;
    expect(contaminadas(amanha)).toContain("pareciaPerguntaDeFaixa");
  });

  it("a linha da trava continua sendo a marca, e só ela", () => {
    const daTrava = chamadasDeLog(rota).find((c) => c.includes("price-leak"));
    expect(daTrava, "a linha de log da trava sumiu").toBeDefined();
    expect(daTrava).toContain("marca.padrao");
    expect(daTrava).toContain("marca.valor");
  });
});
