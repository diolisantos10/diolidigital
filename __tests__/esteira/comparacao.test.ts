import { describe, it, expect } from "vitest";
import { compararMetrica, lerEvolucao, RUIDO_PERCENTUAL } from "@/lib/agency/esteira/comparacao";

describe("a conta é feita em CÓDIGO, não pela IA", () => {
  // Se a IA calculasse, poderia escrever "crescemos 30%" a partir de números
  // que dão 12% — e o percentual é exatamente onde o cliente presta atenção.
  it("calcula a variação certa", () => {
    const c = compararMetrica("alcance", 5200, 4000)!;
    expect(c.variacaoPercentual).toBe(30);
    expect(c.direcao).toBe("subiu");
  });

  it("queda é queda, e aparece com aviso", () => {
    const c = compararMetrica("alcance", 3000, 4000)!;
    expect(c.variacaoPercentual).toBe(-25);
    expect(c.direcao).toBe("caiu");
    expect(c.leitura).toContain("⚠️");
  });
});

describe("o que NÃO pode virar número no relatório", () => {
  it("sem mês anterior não há evolução — não é crescimento de zero", () => {
    const c = compararMetrica("alcance", 4200, null)!;
    expect(c.direcao).toBe("sem_base");
    expect(c.variacaoPercentual).toBeNull();
    expect(c.leitura).toMatch(/primeiro mês medido/);
  });

  it("sair de ZERO não vira 'aumento de infinito%'", () => {
    // Divisão por zero num relatório de resultado é o tipo de número que
    // destrói a credibilidade do documento inteiro.
    const c = compararMetrica("cliques", 40, 0)!;
    expect(c.variacaoPercentual).toBeNull();
    expect(c.leitura).toMatch(/mês passado era zero/);
    expect(Number.isFinite(c.atual)).toBe(true);
  });

  it("métrica não medida some da comparação em vez de virar zero", () => {
    expect(compararMetrica("alcance", null, 4000)).toBeNull();
  });

  it("oscilação pequena NÃO é chamada de crescimento", () => {
    // 4.200 → 4.300 não "cresceu". Chamar isso de crescimento ensina o cliente
    // a desconfiar dos próximos relatórios.
    const c = compararMetrica("alcance", 4300, 4200)!;
    expect(Math.abs(c.variacaoPercentual!)).toBeLessThan(RUIDO_PERCENTUAL);
    expect(c.direcao).toBe("estavel");
    expect(c.leitura).toMatch(/praticamente igual/);
  });
});

describe("nem toda métrica é 'quanto maior melhor'", () => {
  it("custo por clique CAINDO é boa notícia", () => {
    const c = compararMetrica("custo por clique", 0.8, 2.0)!;
    expect(c.direcao).toBe("caiu");
    expect(c.leitura).toContain("✅");
  });

  it("custo por clique SUBINDO é alerta", () => {
    const c = compararMetrica("custo por clique", 3.0, 1.0)!;
    expect(c.leitura).toContain("⚠️");
  });

  it("valor em reais é formatado como dinheiro", () => {
    expect(compararMetrica("investido", 120.5, 100)!.leitura).toContain("R$ 120.50");
  });
});

describe("a leitura completa da evolução", () => {
  const atual = { alcance: 5200, "posts publicados": 8, "custo por clique": 3.0 };
  const anterior = { alcance: 4000, "posts publicados": 8, "custo por clique": 1.0 };

  it("junta as linhas e separa o que piorou — o time precisa saber antes do cliente", () => {
    const e = lerEvolucao(atual, anterior);
    expect(e.temBase).toBe(true);
    expect(e.linhas).toHaveLength(3);
    // Alcance subiu (bom), posts iguais (ruído), CPC subiu (ruim).
    expect(e.pioraram).toHaveLength(1);
    expect(e.pioraram[0]).toMatch(/Custo por clique/);
  });

  it("primeiro ciclo não inventa evolução", () => {
    const e = lerEvolucao(atual, null);
    expect(e.temBase).toBe(false);
    expect(e.pioraram).toHaveLength(0);
    expect(e.linhas.every((l) => /primeiro mês medido/.test(l))).toBe(true);
  });

  it("mês estável não é reportado como piora", () => {
    const e = lerEvolucao({ alcance: 4100 }, { alcance: 4000 });
    expect(e.pioraram).toHaveLength(0);
  });
});
