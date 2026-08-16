import { describe, it, expect } from "vitest";
import { confrontoDeVerba, textoDaVerbaEstourada } from "@/lib/agency/comercial/verba-declarada";
import { PLANOS } from "@/lib/agency/planos";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE TESTE EXISTE
//
// 16/08/2026, piloto ao vivo. O CEO declarou **R$ 500/mês** no briefing. A casa
// devolveu uma estimativa de **R$ 1.800 – R$ 3.400** e não disse uma palavra
// sobre a diferença. A pessoa disse quanto tem; a casa fingiu que não ouviu.
//
// Este arquivo é a trava disso. Ele fixa as três metades da regra — porque
// trava que só prova o caso que a motivou é trava que dispara em todo mundo, e
// trava que dispara em todo mundo é desligada na primeira semana:
//
//   (a) verba ABAIXO da estimativa  → nomeia a diferença E oferece o que cabe;
//   (b) verba COMPATÍVEL            → cala (senão vira ruído e ninguém lê);
//   (c) verba NÃO DECLARADA         → não inventa comparação nenhuma.
//
// ⚠️ ELE APONTA PARA `verba-declarada.ts`, E ISSO TEM HISTÓRIA. No mesmo dia,
// duas frentes escreveram esta regra em dobro — este teste nasceu contra um
// `verba-vs-estimativa.ts` — APAGADO no mesmo dia, não procure o arquivo — que
// servia só o painel da casa, enquanto
// `verba-declarada.ts` já servia o caminho do prospect. O segundo módulo foi
// apagado e o teste veio junto para a fonte única: **duas implementações do
// mesmo julgamento comercial divergem no dia em que alguém mexe numa só**, e o
// jeito de descobrir seria o cliente ouvindo uma coisa e lendo outra.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O REAL FORMATADO EM pt-BR NÃO USA ESPAÇO COMUM — E NÃO USA SEMPRE O MESMO.
 *
 * `precoEmReais` cai em `Intl`, e o separador entre "R$" e o número é um espaço
 * não-quebrável — que pode ser U+00A0 **ou U+202F** (narrow no-break space),
 * conforme a versão do ICU embarcada no runtime. Os dois são invisíveis a olho
 * nu num diff, num log ou numa revisão de código, e a diferença entre eles não
 * aparece nem na mensagem de erro do teste: ela mostra `'R$ 297' to contain
 * 'R$ 297'`, que parece bug do assert.
 *
 * Por isso a normalização é por CATEGORIA (`\p{Zs}`, todo separador de espaço
 * Unicode) e não por caractere escolhido a dedo. Travar num código específico é
 * apostar na versão do ICU — e essa aposta quebra sozinha numa atualização de
 * Node, longe de quem escreveu o teste. Já custou duas rodadas hoje.
 */
const semNbsp = (s: string) => s.replace(/\p{Zs}/gu, " ");

/** O número exato do piloto. Não é exemplo: é o caso que produziu a regra. */
const PISO_DO_PILOTO = 1800;

/** A faixa que o CEO declarou — R$ 500/mês cai no teto de "entre R$ 150 e R$ 500". */
const VERBA_DO_PILOTO = "entre R$ 150 e R$ 500";

describe("(a) a verba declarada abaixo da estimativa é NOMEADA, não engolida", () => {
  const c = confrontoDeVerba(VERBA_DO_PILOTO, PISO_DO_PILOTO);
  const texto = semNbsp(textoDaVerbaEstourada(c!).join("\n"));

  it("o caso real do CEO produz resposta — não silêncio", () => {
    expect(c).not.toBeNull();
  });

  it("a diferença é dita com os valores na frente da pessoa", () => {
    // Não basta devolver não-nulo: o defeito era o silêncio sobre os números.
    // Uma frase que fale de "ajuste de escopo" sem citar o que ele declarou e o
    // quanto passa continua sendo a mesma omissão, em linguagem mais educada.
    expect(c!.teto).toBe(500);
    expect(c!.diferenca).toBe(PISO_DO_PILOTO - 500);
    // Sem distinção de caixa: a frase cita a faixa do cliente em minúsculas
    // ("...investir entre r$ 150 e r$ 500 por mês"), de propósito, porque ela
    // entra no meio de uma oração. O que importa é o NÚMERO estar lá.
    expect(texto).toMatch(/r\$ 150/i);
    expect(texto).toMatch(/r\$ 500/i);
    expect(texto).toMatch(/passa disso/i);
  });

  it("oferece os degraus de entrada que a casa realmente vende", () => {
    const nomes = c!.cabemNaVerba.map((p) => p.nome);
    expect(nomes).toContain("Pulso");
    expect(nomes).toContain("Ritmo");
  });

  it("não oferece degrau que não cabe na verba declarada", () => {
    // Empurrar o Presença (R$ 790) para quem declarou até R$ 500 é repetir o
    // defeito com a cara de solução.
    const nomes = c!.cabemNaVerba.map((p) => p.nome);
    expect(nomes).not.toContain("Presença");
    expect(nomes).not.toContain("Conteúdo");
    expect(nomes).not.toContain("Crescimento");
    for (const p of c!.cabemNaVerba) expect(p.preco).toBeLessThanOrEqual(500);
  });

  it("a implantação do Ritmo é declarada na MESMA frase do preço", () => {
    // O Ritmo é R$ 297/mês MAIS R$ 390 de entrada. Dizer "cabe nos seus R$ 500"
    // calando os R$ 390 é a mesma desonestidade, com o sinal trocado — e faria
    // a conversa recomeçar do zero no dia do boleto.
    const ritmo = c!.cabemNaVerba.find((p) => p.nome === "Ritmo")!;
    expect(ritmo.implantacao).toBe(390);
    const linhaDoRitmo = semNbsp(textoDaVerbaEstourada(c!).find((l) => l.includes("Ritmo"))!);
    expect(linhaDoRitmo).toContain("R$ 297");
    expect(linhaDoRitmo).toContain("R$ 390");
    expect(linhaDoRitmo).toMatch(/implantação/i);
  });

  it("o degrau sem taxa de entrada diz que é sem taxa, em vez de calar", () => {
    // Silêncio sobre a entrada é ambíguo: quem foi mordido uma vez assume que
    // existe uma taxa escondida. O Pulso não tem, e isso é argumento de venda.
    const linhaDoPulso = textoDaVerbaEstourada(c!).find((l) => l.includes("Pulso"))!;
    expect(linhaDoPulso).toMatch(/sem taxa de entrada/i);
  });

  it("o que o degrau NÃO inclui viaja junto da oferta", () => {
    // Vender o plano barato escondendo o corte fecha a venda e perde o cliente
    // no terceiro mês.
    for (const p of c!.cabemNaVerba) expect(p.naoInclui.length).toBeGreaterThan(0);
    expect(texto).toMatch(/Fora deste plano:/);
  });

  it("o cliente nunca fica sem próximo passo", () => {
    expect(texto).toMatch(/prioridade|remonto o escopo/i);
    expect(texto).not.toMatch(/desculpa|infelizmente|não temos|fora do seu alcance/i);
  });

  it("os preços vêm da fonte única, não de número escrito à mão", () => {
    // Se alguém trocar o preço em `planos.ts` e digitar o antigo aqui, este
    // teste cai — que é exatamente o serviço dele.
    for (const oferecido of c!.cabemNaVerba) {
      const naFonte = PLANOS.find((p) => p.nome === oferecido.nome)!;
      expect(oferecido.preco).toBe(naFonte.preco);
      expect(oferecido.implantacao).toBe(naFonte.implantacao);
      expect(oferecido.naoInclui).toEqual(naFonte.naoInclui);
    }
  });
});

describe("(b) verba compatível NÃO dispara — aviso que aparece sempre não é lido", () => {
  it("cala quando a estimativa cabe folgada na verba", () => {
    expect(confrontoDeVerba("entre R$ 1.500 e R$ 5.000", 1800)).toBeNull();
  });

  it("cala quando a estimativa encosta no teto sem passar", () => {
    // Exatamente no teto ainda cabe. Disparar aqui seria alarme sobre um fato
    // que não existe — e o custo de um alarme falso é o próximo ser ignorado.
    expect(confrontoDeVerba("entre R$ 150 e R$ 500", 500)).toBeNull();
  });

  it("cala quando a verba não tem teto ('acima de R$ 5.000')", () => {
    expect(confrontoDeVerba("acima de R$ 5.000", 40000)).toBeNull();
  });
});

describe("(c) verba não declarada não inventa comparação", () => {
  it("sem verba, não há diferença a nomear", () => {
    // Ausência de informação não é informação. Sem o número da pessoa, deduzir
    // a faixa pelo segmento ou pelo jeito de falar é chutar o bolso dela.
    for (const vazio of [null, undefined, "", "   "]) {
      expect(confrontoDeVerba(vazio, PISO_DO_PILOTO)).toBeNull();
    }
  });

  it("texto que não é faixa da casa é descartado, nunca adivinhado", () => {
    for (const lixo of ["mais ou menos uns 500 reais", "tanto faz", "R$ 500", "pouco"]) {
      expect(confrontoDeVerba(lixo, PISO_DO_PILOTO)).toBeNull();
    }
  });

  it("estimativa ausente ou inválida também não vira comparação", () => {
    // Estimativa zerada é "ainda não sei calcular", não "custa zero" — e
    // comparar contra zero acusaria estouro de verba em toda conversa nova.
    expect(confrontoDeVerba(VERBA_DO_PILOTO, 0)).toBeNull();
    expect(confrontoDeVerba(VERBA_DO_PILOTO, NaN)).toBeNull();
  });
});

describe("a régua lê o id da faixa e o rótulo — e o cliente nunca lê o id", () => {
  it("o id cru produz o mesmo confronto do rótulo", () => {
    // O SDR grava `budgetRange` ora como id ("pacote"), ora como rótulo — nos
    // turnos seguintes ele recebe o escopo acumulado e devolve o que viu. Ler
    // só uma das formas faria o aviso aparecer e sumir de um turno para o outro.
    const porId = confrontoDeVerba("pacote", PISO_DO_PILOTO);
    const porRotulo = confrontoDeVerba(VERBA_DO_PILOTO, PISO_DO_PILOTO);
    expect(porId).not.toBeNull();
    expect(porId!.teto).toBe(porRotulo!.teto);
    expect(porId!.diferenca).toBe(porRotulo!.diferenca);
  });

  it("o id NÃO vaza para o texto que o cliente lê", () => {
    // Sem normalizar, o cliente lia *"você comentou que pensa em investir
    // pacote por mês"*. Nome interno de faixa não é palavra de cliente.
    const texto = textoDaVerbaEstourada(confrontoDeVerba("pacote", PISO_DO_PILOTO)!).join("\n");
    expect(texto).not.toMatch(/investir pacote/i);
    expect(semNbsp(texto)).toMatch(/entre r\$ 150 e r\$ 500/i);
  });

  it("normalizar não pode APAGAR o que a pessoa disse", () => {
    // Fallback: faixa que o normalizador não reconhece mas cujo teto existe
    // continua sendo citada com as palavras dela. Perder a frase do cliente
    // seria trocar um defeito por outro.
    const c = confrontoDeVerba("PACOTE", PISO_DO_PILOTO);
    expect(c).not.toBeNull();
    expect(c!.rotulo.length).toBeGreaterThan(0);
  });
});
