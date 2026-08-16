import { describe, it, expect } from "vitest";
import { verbaVsEstimativa } from "@/lib/agency/comercial/verba-vs-estimativa";
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
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O REAL FORMATADO EM pt-BR NÃO USA ESPAÇO COMUM.
 *
 * `precoEmReais` cai em `Intl`, e o separador entre "R$" e o número é um espaço
 * NÃO-QUEBRÁVEL (U+00A0) — invisível a olho nu num diff, num log ou numa
 * revisão de código. Sem esta normalização, `toContain("R$ 390")` falha contra
 * uma string que, na tela, é exatamente "R$ 390". Já custou uma rodada aqui;
 * fica escrito para não custar a próxima.
 */
const semNbsp = (s: string) => s.replace(/ /g, " ");

/** O número exato do piloto. Não é exemplo: é o caso que produziu a regra. */
const ESTIMATIVA_DO_PILOTO = { totalMin: 1800, totalMax: 3400 };

/** A faixa que o CEO declarou — R$ 500/mês cai no teto de "entre R$ 150 e R$ 500". */
const VERBA_DO_PILOTO = "entre R$ 150 e R$ 500";

describe("(a) a verba declarada abaixo da estimativa é NOMEADA, não engolida", () => {
  const r = verbaVsEstimativa(VERBA_DO_PILOTO, ESTIMATIVA_DO_PILOTO);

  it("o caso real do CEO produz resposta — não silêncio", () => {
    expect(r).not.toBeNull();
  });

  it("a diferença é dita com os DOIS valores na frente da pessoa", () => {
    // Não basta devolver não-nulo: o defeito era o silêncio sobre os números.
    // Uma frase que fale de "ajuste de escopo" sem citar quanto ele declarou e
    // quanto custa continua sendo a mesma omissão, em linguagem mais educada.
    const dito = semNbsp(r!.diferenca);
    expect(dito).toContain("R$ 150");
    expect(dito).toContain("R$ 500");
    expect(dito).toContain("R$ 1.800");
    expect(dito).toContain("R$ 3.400");
    expect(dito).toMatch(/acima do que você me disse/i);
  });

  it("oferece os degraus de entrada que a casa realmente vende", () => {
    const ids = r!.planosQueCabem.map((p) => p.id);
    expect(ids).toContain("pulso");
    expect(ids).toContain("ritmo");
  });

  it("não oferece degrau que não cabe na verba declarada", () => {
    // Empurrar o Presença (R$ 790) para quem declarou até R$ 500 é repetir o
    // defeito com a cara de solução.
    const ids = r!.planosQueCabem.map((p) => p.id);
    expect(ids).not.toContain("presenca");
    expect(ids).not.toContain("conteudo");
    expect(ids).not.toContain("crescimento");
    for (const p of r!.planosQueCabem) expect(p.preco).toBeLessThanOrEqual(500);
  });

  it("a implantação do Ritmo é declarada, não escondida no rodapé", () => {
    // O Ritmo é R$ 297/mês MAIS R$ 390 de entrada. Dizer "cabe nos seus R$ 500"
    // calando os R$ 390 é a mesma desonestidade, com o sinal trocado.
    const ritmo = r!.planosQueCabem.find((p) => p.id === "ritmo")!;
    expect(ritmo.implantacao).toBe(390);
    expect(semNbsp(r!.oQueCabe)).toContain("R$ 390");
    expect(r!.oQueCabe).toMatch(/implantação/i);
  });

  it("o que o degrau NÃO inclui viaja junto da oferta", () => {
    // Vender o degrau de baixo escondendo o corte é a briga do terceiro mês.
    for (const p of r!.planosQueCabem) expect(p.naoInclui.length).toBeGreaterThan(0);
  });

  it("o escopo maior continua na mesa — a oferta não vira 'é isso ou nada'", () => {
    expect(r!.oCaminhoQueContinua).toMatch(/não sai da mesa|quem escolhe é você/i);
  });

  it("os preços vêm da fonte única, não de número escrito à mão", () => {
    // Se alguém trocar o preço em `planos.ts` e digitar o antigo aqui, este
    // teste cai — que é exatamente o serviço dele.
    for (const oferecido of r!.planosQueCabem) {
      const naFonte = PLANOS.find((p) => p.id === oferecido.id)!;
      expect(oferecido.preco).toBe(naFonte.preco);
      expect(oferecido.implantacao).toBe(naFonte.implantacao);
    }
  });
});

describe("(b) verba compatível NÃO dispara — aviso que aparece sempre não é lido", () => {
  it("cala quando a estimativa cabe folgada na verba", () => {
    expect(verbaVsEstimativa("entre R$ 1.500 e R$ 5.000", { totalMin: 1800, totalMax: 3400 })).toBeNull();
  });

  it("cala quando a estimativa encosta no teto sem passar", () => {
    // Exatamente no teto ainda cabe. Disparar aqui seria alarme sobre um fato
    // que não existe — e o custo de um alarme falso é o próximo ser ignorado.
    expect(verbaVsEstimativa("entre R$ 150 e R$ 500", { totalMin: 500, totalMax: 900 })).toBeNull();
  });

  it("cala quando a verba não tem teto ('acima de R$ 5.000')", () => {
    expect(verbaVsEstimativa("acima de R$ 5.000", { totalMin: 12000, totalMax: 30000 })).toBeNull();
  });
});

describe("(c) verba não declarada não inventa comparação", () => {
  it("sem verba, não há diferença a nomear", () => {
    // Ausência de informação não é informação. Sem o número da pessoa, deduzir
    // a faixa pelo segmento ou pelo jeito de falar é chutar o bolso dela.
    for (const vazio of [null, undefined, "", "   "]) {
      expect(verbaVsEstimativa(vazio, ESTIMATIVA_DO_PILOTO)).toBeNull();
    }
  });

  it("texto que não é faixa da casa é descartado, nunca adivinhado", () => {
    for (const lixo of ["mais ou menos uns 500 reais", "tanto faz", "R$ 500", "pouco"]) {
      expect(verbaVsEstimativa(lixo, ESTIMATIVA_DO_PILOTO)).toBeNull();
    }
  });

  it("estimativa ausente ou inválida também não vira comparação", () => {
    // Estimativa zerada é "ainda não sei calcular", não "custa zero" — e
    // comparar contra zero acusaria estouro de verba em toda conversa nova.
    expect(verbaVsEstimativa(VERBA_DO_PILOTO, { totalMin: 0, totalMax: 0 })).toBeNull();
    expect(verbaVsEstimativa(VERBA_DO_PILOTO, { totalMin: NaN, totalMax: 3400 })).toBeNull();
  });
});

describe("a régua lê o id da faixa e o rótulo — a conversa devolve as duas formas", () => {
  it("o id cru vindo do modelo produz o mesmo resultado do rótulo", () => {
    // O SDR grava `budgetRange` ora como id ("pacote"), ora como rótulo — nos
    // turnos seguintes ele recebe o escopo acumulado e devolve o que viu. Ler só
    // uma das formas faria o aviso aparecer e sumir de um turno para o outro.
    const porId = verbaVsEstimativa("pacote", ESTIMATIVA_DO_PILOTO);
    const porRotulo = verbaVsEstimativa(VERBA_DO_PILOTO, ESTIMATIVA_DO_PILOTO);
    expect(porId).not.toBeNull();
    expect(porId!.diferenca).toBe(porRotulo!.diferenca);
  });
});
