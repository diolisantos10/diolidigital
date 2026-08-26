import { describe, it, expect } from "vitest";

// A RÉGUA DE NEGOCIAÇÃO — as duas metades do teste.
//
// Metade 1: a função BARRA o que está abaixo do piso (e barra o que não conhece).
// Metade 2: a função NÃO barra o que está acima. Um portão que só sabe dizer
// "não" não é portão, é parede — e parede o comercial contorna na primeira
// semana, escrevendo o preço na mão em outro lugar. Por isso as duas metades
// moram no mesmo arquivo: quem afrouxar o piso quebra a metade 1; quem
// endurecer demais quebra a metade 2.

import {
  ofertaParaFaixa,
  podeFechar,
  chegouNoPiso,
  moedasDeTroca,
  barganhaPara,
  ehPerguntaDeFaixa,
  faixaValida,
  normalizarFaixa,
  TABELA_DE_PISO,
  FAIXAS,
  MOEDAS,
} from "@/lib/agency/comercial/negociacao";

// ─────────────────────────────────────────────────────────────────────────────
describe("faixas de investimento — toda faixa tem produto", () => {
  it("põe cada valor na faixa certa, incluindo as bordas", () => {
    expect(ofertaParaFaixa(90).faixa).toBe("balcao");
    expect(ofertaParaFaixa(150).faixa).toBe("balcao"); // borda: 150 ainda é balcão
    expect(ofertaParaFaixa(151).faixa).toBe("pacote");
    expect(ofertaParaFaixa(297).faixa).toBe("pacote");
    expect(ofertaParaFaixa(500).faixa).toBe("pacote"); // borda superior inclusiva
    expect(ofertaParaFaixa(790).faixa).toBe("presenca");
    expect(ofertaParaFaixa(1500).faixa).toBe("presenca");
    expect(ofertaParaFaixa(2590).faixa).toBe("gestao");
    expect(ofertaParaFaixa(5000).faixa).toBe("gestao");
    expect(ofertaParaFaixa(5001).faixa).toBe("projeto");
    expect(ofertaParaFaixa(50000).faixa).toBe("projeto");
  });

  it("nenhuma faixa devolve 'não temos nada para você'", () => {
    for (const valor of [10, 150, 300, 800, 2000, 9000]) {
      const oferta = ofertaParaFaixa(valor);
      expect(oferta.principal.trim().length).toBeGreaterThan(0);
      expect(oferta.alternativa.trim().length).toBeGreaterThan(0);
    }
    // Toda faixa da tabela tem principal e alternativa — nenhuma é um beco.
    expect(FAIXAS.every((f) => f.principal && f.alternativa)).toBe(true);
  });

  it("valor inválido NÃO vira faixa deduzida — vira 'preciso confirmar'", () => {
    for (const lixo of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const oferta = ofertaParaFaixa(lixo);
      expect(oferta.faixa).toBe("indefinida");
      expect(oferta.confirmarAntes).toBe(true);
    }
    // Zero é informação ("não tenho verba agora"): tem produto, mas confirma.
    expect(ofertaParaFaixa(0).faixa).toBe("balcao");
    expect(ofertaParaFaixa(0).confirmarAntes).toBe(true);
  });
});

// ── METADE 1 — o portão BARRA ────────────────────────────────────────────────
describe("podeFechar — barra o que está abaixo do piso", () => {
  it("barra um centavo abaixo do piso de cada item da tabela", () => {
    for (const linha of Object.values(TABELA_DE_PISO)) {
      const r = podeFechar(linha.id, linha.piso - 1);
      expect(r.pode, `${linha.id} deveria barrar ${linha.piso - 1}`).toBe(false);
      expect(r.piso).toBe(linha.piso);
      expect(r.motivo).toMatch(/abaixo do piso/i);
    }
  });

  it("barra os casos concretos que o SDR ouve na conversa", () => {
    expect(podeFechar("post", 45).pode).toBe(false);        // piso 49
    expect(podeFechar("carrossel", 70).pode).toBe(false);   // piso 79
    expect(podeFechar("stories", 50).pode).toBe(false);     // piso 59
    expect(podeFechar("copy", 20).pode).toBe(false);        // piso 29
    expect(podeFechar("auditoria", 89).pode).toBe(false);   // piso 99
    // ⚠️ TABELA ÚNICA (26/08/2026): os pisos dos planos passaram a ser
    // DERIVADOS (78% do cheio) e o Crescimento saiu da tabela. Os números não
    // são mais digitados aqui — a régua é "um real abaixo do piso não fecha",
    // qualquer que seja o piso.
    for (const id of ["ritmo", "presenca", "conteudo"] as const) {
      const piso = TABELA_DE_PISO[id].piso;
      expect(podeFechar(id, piso - 1).pode, `${id} fechou abaixo do piso`).toBe(false);
      expect(podeFechar(id, piso).pode, `${id} não fechou NO piso`).toBe(true);
    }
  });

  it("FAIL-CLOSED: item desconhecido barra, e o piso não é zero", () => {
    for (const desconhecido of ["reel", "site", "", "POST", "plano-x", "ritmo "]) {
      const r = podeFechar(desconhecido, 999_999);
      expect(r.pode, `"${desconhecido}" não pode ser autorizado`).toBe(false);
      // Piso infinito, não zero: piso zero deixaria qualquer valor passar num
      // chamador que compara `valor >= piso`.
      expect(r.piso).toBe(Number.POSITIVE_INFINITY);
      expect(r.motivo).toMatch(/confirmar/i);
    }
  });

  it("FAIL-CLOSED: item desconhecido nunca vira true, nem com valor absurdo", () => {
    expect(podeFechar("qualquer-coisa", 1_000_000).pode).toBe(false);
    // Nem herdando de Object: `constructor`/`toString` existem em todo objeto e
    // seriam autorizados se a busca fosse ingênua.
    expect(podeFechar("constructor", 500).pode).toBe(false);
    expect(podeFechar("toString", 500).pode).toBe(false);
  });

  it("barra valor inválido mesmo em item conhecido", () => {
    for (const lixo of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(podeFechar("ritmo", lixo).pode).toBe(false);
    }
  });
});

// ── METADE 2 — o portão NÃO barra o que está acima ───────────────────────────
describe("podeFechar — deixa passar o que está no piso ou acima", () => {
  it("fecha exatamente no piso de cada item (o piso é vendável)", () => {
    for (const linha of Object.values(TABELA_DE_PISO)) {
      const r = podeFechar(linha.id, linha.piso);
      expect(r.pode, `${linha.id} deveria fechar em ${linha.piso}`).toBe(true);
      expect(r.motivo).toMatch(/n[ãa]o desce mais/i);
    }
  });

  it("fecha no preço cheio e em qualquer ponto entre piso e cheio", () => {
    for (const linha of Object.values(TABELA_DE_PISO)) {
      expect(podeFechar(linha.id, linha.cheio).pode).toBe(true);
      const meio = Math.round((linha.piso + linha.cheio) / 2);
      expect(podeFechar(linha.id, meio).pode).toBe(true);
      // Acima do cheio também fecha: cliente que paga mais não é barrado.
      expect(podeFechar(linha.id, linha.cheio + 100).pode).toBe(true);
    }
  });

  it("avisa para pedir moeda de troca sempre que houver desconto", () => {
    // Um real acima do piso: há desconto, logo há contrapartida a pedir.
    const r = podeFechar("presenca", TABELA_DE_PISO.presenca.piso + 1);
    expect(r.pode).toBe(true);
    expect(r.motivo).toMatch(/moeda de troca/i);
  });

  it("no preço cheio não cobra contrapartida", () => {
    const { veredicto, barganha } = barganhaPara("post", 79);
    expect(veredicto.pode).toBe(true);
    expect(barganha.moedas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("chegouNoPiso — parar de baixar preço e cortar escopo", () => {
  it("no piso, devolve a frase de saída com a versão menor", () => {
    // O Crescimento saiu da tabela em 26/08/2026 — o maior degrau é o Conteúdo,
    // e a versão menor dele é o degrau de baixo (Presença).
    const s = chegouNoPiso("conteudo", TABELA_DE_PISO.conteudo.piso);
    expect(s.noPiso).toBe(true);
    expect(s.versaoMenor).toContain("Presença");
    expect(s.frase).toMatch(/n[ãa]o desço mais/i);
    // A saída é escopo, nunca margem: a frase oferece outra coisa, não outro preço.
    expect(s.frase).toContain(s.versaoMenor);
  });

  it("abaixo do piso também é 'chegou no piso' — não existe abaixo", () => {
    expect(chegouNoPiso("ritmo", 100).noPiso).toBe(true);
  });

  it("acima do piso, ainda há espaço — mas com contrapartida", () => {
    const s = chegouNoPiso("ritmo", 280);
    expect(s.noPiso).toBe(false);
    expect(s.frase).toMatch(/contrapartida/i);
  });

  it("item desconhecido para a conversa e escala, em vez de improvisar", () => {
    const s = chegouNoPiso("pacote-mensal-vip", 300);
    expect(s.noPiso).toBe(true);
    expect(s.precisaConfirmar).toBe(true);
    expect(s.frase).toMatch(/confirmar/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("moedasDeTroca — desconto nunca sai de graça", () => {
  it("sem desconto, não há o que pedir", () => {
    for (const nada of [0, -10, Number.NaN]) {
      const b = moedasDeTroca(nada);
      expect(b.moedas).toHaveLength(0);
      expect(b.quantidade).toBe(0);
    }
  });

  it("quanto maior o desconto, mais coisas ele pede", () => {
    const q = (v: number) => moedasDeTroca(v).quantidade;
    expect(q(20)).toBe(1);
    expect(q(60)).toBe(2);
    expect(q(150)).toBe(3);
    expect(q(350)).toBe(4);
    expect(q(900)).toBe(5);
    // Monotônico: nunca pedir menos por um desconto maior.
    const valores = [1, 20, 31, 60, 100, 150, 250, 350, 500, 5000];
    const qs = valores.map(q);
    expect(qs).toEqual([...qs].sort((a, b) => a - b));
  });

  it("respeita a ordem de preferência: o que não custa margem vem primeiro", () => {
    expect(moedasDeTroca(20).moedas[0].id).toBe("a_vista");
    expect(moedasDeTroca(900).moedas.map((m) => m.id)).toEqual([
      "a_vista", "prazo", "rodadas", "contrato", "case",
    ]);
    expect(MOEDAS[0].id).toBe("a_vista");
  });

  it("barganhaPara calcula o desconto sozinho — o chamador não faz conta na mão", () => {
    const cheio = TABELA_DE_PISO.conteudo.cheio;
    const oferta = TABELA_DE_PISO.conteudo.piso + 10;
    const { veredicto, barganha } = barganhaPara("conteudo", oferta);
    expect(veredicto.pode).toBe(true);
    // A conta é da função, não do teste: desconto é cheio − oferta.
    expect(barganha.desconto).toBe(cheio - oferta);
  });

  it("desconto abaixo do piso não gera barganha nenhuma — não há acordo a fazer", () => {
    const { veredicto, barganha } = barganhaPara("crescimento", 1000);
    expect(veredicto.pode).toBe(false);
    expect(barganha.moedas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ehPerguntaDeFaixa — a exceção estreita da trava de preço", () => {
  const PERGUNTA =
    "Pra eu montar a proposta certa, Ana: quanto você pensa em investir por mês — " +
    "até R$ 150, entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, entre R$ 1.500 e R$ 5.000, ou acima disso?";

  it("deixa passar a pergunta da faixa com a régua inteira", () => {
    expect(ehPerguntaDeFaixa(PERGUNTA)).toBe(true);
  });

  it("NÃO deixa passar cotação disfarçada de pergunta de investimento", () => {
    expect(ehPerguntaDeFaixa("O investimento do seu plano fica em R$ 790 por mês.")).toBe(false);
    expect(ehPerguntaDeFaixa("Pelo seu orçamento, consigo por R$ 690 em vez de R$ 790.")).toBe(false);
    // Valor fora da régua contamina a fala inteira, mesmo com a régua junto.
    expect(
      ehPerguntaDeFaixa(PERGUNTA.replace("ou acima disso?", "ou os R$ 297 do nosso plano?")),
    ).toBe(false);
  });

  it("desconto nunca passa, nem dentro da pergunta da faixa", () => {
    expect(ehPerguntaDeFaixa(PERGUNTA + " Posso ver um desconto pra você.")).toBe(false);
  });

  it("fala sem contexto de investimento não passa", () => {
    expect(ehPerguntaDeFaixa("Nossos pacotes vão de R$ 150 a R$ 500 e R$ 1.500.")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o que vai para o prompt público", () => {
  it("aceita só os ids de faixa canônicos", () => {
    expect(faixaValida("balcao")).toBe(true);
    expect(faixaValida("projeto")).toBe(true);
    expect(faixaValida("indefinida")).toBe(false); // não é escolha do cliente
    expect(faixaValida("R$ 500")).toBe(false);
    expect(faixaValida(500)).toBe(false);
    expect(faixaValida(undefined)).toBe(false);
  });

  it("normaliza para o rótulo que o cliente lê — nunca para o id interno", () => {
    expect(normalizarFaixa("gestao")).toBe("entre R$ 1.500 e R$ 5.000");
    expect(normalizarFaixa("  BALCAO ")).toBe("até R$ 150");
    // Aceita o rótulo de volta: nos turnos seguintes o modelo devolve o que viu
    // no scope acumulado. Sem isso, a faixa apareceria e sumiria.
    expect(normalizarFaixa("entre R$ 500 e R$ 1.500")).toBe("entre R$ 500 e R$ 1.500");
  });

  it("descarta faixa inventada em vez de aproximar — fail-closed", () => {
    for (const lixo of ["uns R$ 800", "medio", "alto", "", "  ", 800, null, undefined, {}]) {
      expect(normalizarFaixa(lixo)).toBeNull();
    }
  });
});
