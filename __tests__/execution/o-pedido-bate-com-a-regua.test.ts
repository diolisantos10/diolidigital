// O PEDIDO AO ESPECIALISTA TEM DE BATER COM A RÉGUA QUE O CONFERE.
//
// ── O defeito que este arquivo existe para impedir (24/08/2026) ─────────────
//
// O piloto do cliente falso barrou "Copy dos posts" com "entregou 0 peças de
// conteúdo — o contrato com o cliente é de 12". Investigado, o defeito não
// estava no modelo nem na régua: o contrato de saída passou a DERIVAR do que o
// cliente comprou (15/08/2026) e o prompt do especialista ficou preso em
// "Escreva de 6 a 8 peças", escrito à mão.
//
// O especialista era reprovado por OBEDECER ao pedido. E o laço de refação
// reenviava o mesmo prompt, então nenhuma tentativa saía do lugar.
//
// A regra que fica: quem PEDE e quem CONFERE leem a mesma fonte. Estes testes
// falham se as duas voltarem a divergir.

import { describe, it, expect } from "vitest";
import {
  TODOS_OS_ESPECIALISTAS, conferirContrato, ctxBlock, MISTURA_DE_FORMATOS, type Ctx,
} from "@/lib/agency/execution/especialistas";
import { lerEscopoDeConteudo, exigenciaDeConteudo } from "@/lib/agency/execution/escopo-do-cliente";

const copy = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "social-copy")!;

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    businessName: "Cantina da Prova", segment: "restaurante", targetAudience: "famílias do bairro",
    tone: "próximo", services: ["gestão de redes sociais"], objectives: ["vender mais no almoço"],
    strategyHeadline: "", hasBrandAssets: false, hasRawMaterial: true, criandoIdentidade: false,
    materiaisEntregues: [], ...over,
  };
}

/** O escopo do cliente do piloto: 2 posts por dia. */
const escopoDoPiloto = lerEscopoDeConteudo({
  servicos: ["gestão de redes sociais"],
  escopo: JSON.stringify({ social: { postsPerWeek: 14 } }),
  contextoBruto: "Quero 2 posts por dia no Instagram.",
});

describe("o volume pedido é o volume conferido", () => {
  it("o prompt NÃO carrega mais um número de peças escrito à mão", () => {
    // A frase exata que causou o defeito. Se ela voltar, este teste morre.
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    expect(p).not.toMatch(/Escreva de 6 a 8 peças/);
  });

  it("pede EXATAMENTE o que o contrato de saída vai cobrar", () => {
    const escopo = escopoDoPiloto;
    const exigencia = exigenciaDeConteudo(escopo);
    const p = copy.prompt(ctx({ escopoContratado: escopo }));
    // O número que a régua cobra tem de aparecer no pedido.
    expect(p).toContain(String(exigencia.min));
  });

  it("cliente sem volume legível continua na régua histórica, e o prompt a repete", () => {
    const semVolume = lerEscopoDeConteudo({ servicos: ["gestão de redes sociais"], escopo: "{}", contextoBruto: "" });
    const exigencia = exigenciaDeConteudo(semVolume);
    const p = copy.prompt(ctx({ escopoContratado: semVolume }));
    expect(p).toContain(`de ${exigencia.min} a ${exigencia.max} peças`);
  });

  it("a receita pedida RESPEITA os limites da tabela que o contrato confere", () => {
    // A régua aceita uma FAIXA por formato; o pedido escolhe um ponto dentro
    // dela. O que não pode é o pedido sair da faixa — aí o especialista seria
    // reprovado de novo por obedecer.
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    for (const m of p.matchAll(/- (CARROSSEL|STORY|FEED): exatamente (\d+) peça\(s\)/g)) {
      const f = m[1]!.toLowerCase() as keyof typeof MISTURA_DE_FORMATOS;
      const [min, max] = MISTURA_DE_FORMATOS[f];
      expect(Number(m[2]), `${f} fora da faixa da régua`).toBeGreaterThanOrEqual(min);
      expect(Number(m[2]), `${f} fora da faixa da régua`).toBeLessThanOrEqual(max);
    }
  });

  it("quando o volume passa do teto da mistura, o excedente vai para reel", () => {
    // 12 peças, e carrossel+story+feed somam no máximo 8. As 4 restantes têm de
    // ter destino declarado — senão o modelo enche de feed e é reprovado.
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const teto = (["carrossel", "story", "feed"] as const)
      .reduce((s2, f) => s2 + MISTURA_DE_FORMATOS[f][1], 0);
    if (exigencia.min > teto) expect(p).toMatch(/REEL: exatamente \d+ peça\(s\)/);
  });

  it("uma entrega que obedece ao prompt PASSA no contrato", () => {
    // O fecho do laço: monta a entrega exatamente como o prompt manda e exige
    // que a régua a aceite. É o teste que teria pegado o defeito no dia.
    const c = ctx({ escopoContratado: escopoDoPiloto });
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const items: Array<Record<string, unknown>> = [];
    const cenas = "1) [gancho] a fila do almoço · 2) [tensao] mesa vazia às 13h · 3) [mecanismo] o combinado do dia · 4) [acao] reserve pelo WhatsApp";
    for (const f of ["carrossel", "story", "feed"] as const) {
      const [min] = MISTURA_DE_FORMATOS[f];
      for (let i = 0; i < min; i++) {
        items.push({ format: f, pillar: "bastidor da cozinha", headline: "h", caption: "c",
          visual: "cozinheiro montando o prato no balcão da Cantina, luz do meio-dia", ...(f === "carrossel" ? { cenas } : {}) });
      }
    }
    while (items.length < exigencia.min) {
      items.push({ format: "reel", pillar: "bastidor da cozinha", headline: "h", caption: "c",
        visual: "salão cheio no horário do almoço, luz natural pela vitrine" });
    }
    const r = conferirContrato(copy, { title: "t", summary: "s", items }, c);
    expect(r.violacoes, `a entrega que segue o prompt foi reprovada: ${r.violacoes.join("; ")}`).toEqual([]);
  });
});

describe("a verdade atestada chega a quem produz", () => {
  it("o bloco de contexto lista o que o cliente atestou", () => {
    const b = ctxBlock(ctx({ verdadeAtestada: { linhas: ["Áreas atendidas: pinheiros"], semInformacao: [] } }));
    expect(b).toContain("O QUE O CLIENTE ATESTOU");
    expect(b).toContain("pinheiros");
  });

  it("o bloco NOMEIA o que o cliente nunca contou e manda escrever PRECISO CONFIRMAR", () => {
    // É o conserto do `area_nao_informada` do piloto: o especialista escrevia
    // área de atendimento sem nunca ter sido avisado de que ela não era sabida.
    const b = ctxBlock(ctx({ verdadeAtestada: { linhas: [], semInformacao: ["área de atendimento, bairro, cidade ou raio de entrega"] } }));
    expect(b).toContain("O QUE O CLIENTE NUNCA CONTOU");
    expect(b).toContain("área de atendimento");
    expect(b).toContain("PRECISO CONFIRMAR");
  });

  it("sem verdade montada o bloco CALA — não afirma que o cliente não contou nada", () => {
    // A diferença entre "não sei" e "ele não contou" é a regra de ouro da casa.
    const b = ctxBlock(ctx());
    expect(b).not.toContain("O QUE O CLIENTE NUNCA CONTOU");
    expect(b).not.toContain("O QUE O CLIENTE ATESTOU");
  });

  it("todo especialista recebe o bloco, não só o que alguém lembrou de alterar", () => {
    const c = ctx({ verdadeAtestada: { linhas: ["Horários atestados: 11:00, 23:00"], semInformacao: [] } });
    const semBloco = TODOS_OS_ESPECIALISTAS.filter((e) => !e.prompt(c).includes("O QUE O CLIENTE ATESTOU"));
    expect(semBloco.map((e) => e.id)).toEqual([]);
  });
});

describe("a receita de formatos fecha a conta — o modelo não faz aritmética", () => {
  it("a receita pedida SOMA exatamente o que o contrato exige", () => {
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const m = p.match(/= (\d+) peças/);
    expect(m, "o prompt não declara o total da receita").toBeTruthy();
    expect(Number(m![1])).toBe(exigencia.min);
  });

  it("o prompt pede número EXATO por formato, nunca faixa", () => {
    // Foi a faixa que produziu 11 de 12 ao vivo: o modelo escolheu o meio.
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    expect(p).toMatch(/exatamente \d+ peça\(s\)/);
    expect(p).not.toMatch(/CARROSSEL: de \d+ a \d+/);
  });

  it("a entrega montada PELA RECEITA passa no contrato", () => {
    // O fecho: extrai a receita do próprio prompt, monta exatamente aquilo e
    // exige que a régua aceite. Se prompt e régua divergirem, morre aqui.
    const c = ctx({ escopoContratado: escopoDoPiloto });
    const p = copy.prompt(c);
    const cenas = "1) [gancho] a fila do almoço · 2) [tensao] mesa vazia às 13h · 3) [mecanismo] o combinado do dia · 4) [acao] reserve pelo WhatsApp";
    const items: Array<Record<string, unknown>> = [];
    for (const m of p.matchAll(/- (CARROSSEL|STORY|FEED|REEL): exatamente (\d+) peça\(s\)/g)) {
      const f = m[1]!.toLowerCase();
      for (let i = 0; i < Number(m[2]); i++) {
        items.push({ format: f, pillar: "bastidor da cozinha", headline: "h", caption: "c",
          visual: "cozinheiro montando o prato no balcão da Cantina, luz do meio-dia",
          ...(f === "carrossel" ? { cenas } : {}) });
      }
    }
    expect(items.length).toBe(exigenciaDeConteudo(escopoDoPiloto).min);
    const r = conferirContrato(copy, { title: "t", summary: "s", items }, c);
    expect(r.violacoes, `a receita do prompt foi reprovada: ${r.violacoes.join("; ")}`).toEqual([]);
  });
});
