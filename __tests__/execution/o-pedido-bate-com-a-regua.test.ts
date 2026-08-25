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
import { misturaDoLote, receitaDoLote } from "@/lib/agency/contrato-de-quantidade";
import {
  TODOS_OS_ESPECIALISTAS, conferirContrato, ctxBlock, MISTURA_DE_FORMATOS, type Ctx,
  ESQUEMA_DO_PACOTE,
  ctxBlockParaJuiz,
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

  it("a receita pedida RESPEITA a régua do LOTE que o contrato confere", () => {
    // A régua aceita uma FAIXA por formato; o pedido escolhe um ponto dentro
    // dela. O que não pode é o pedido sair da faixa — aí o especialista seria
    // reprovado de novo por obedecer.
    //
    // ⚠️ A faixa é do LOTE, não de um lote de 12 (25/08/2026). Com as levas o
    // lote varia — 4 peças no Essencial, 11 no Completo — e a régua absoluta
    // reprovava os dois extremos: os mínimos somavam 5 (impossível em 4) e os
    // tetos somavam 8 (impossível em 11).
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const daMistura = (["carrossel", "story", "feed"] as const)
      .filter((f) => exigencia.permitidos.includes(f));
    const regua = misturaDoLote(exigencia.max, daMistura);
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    for (const m of p.matchAll(/- (CARROSSEL|STORY|FEED): exatamente (\d+) peça\(s\)/g)) {
      const f = m[1]!.toLowerCase() as keyof typeof MISTURA_DE_FORMATOS;
      const [min, max] = regua[f];
      expect(Number(m[2]), `${f} fora da faixa da régua`).toBeGreaterThanOrEqual(min);
      expect(Number(m[2]), `${f} fora da faixa da régua`).toBeLessThanOrEqual(max);
    }
  });

  it("a receita pedida SOMA o lote — nenhuma aritmética sobra para o modelo", () => {
    // O defeito de 24/08: o pedido mandava faixas e "o resto vai em reel", com
    // o resto calculado sobre os máximos. O modelo entregava 11 de 12, sem ter
    // como acertar. Agora a receita fecha sozinha — e reel saiu da casa, então
    // não há mais formato-válvula para onde empurrar sobra.
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const p = copy.prompt(ctx({ escopoContratado: escopoDoPiloto }));
    const pedidas = [...p.matchAll(/- (?:CARROSSEL|STORY|FEED|REEL): exatamente (\d+) peça\(s\)/g)]
      .reduce((s2, m) => s2 + Number(m[1]), 0);
    expect(pedidas).toBe(exigencia.max);
    expect(p).not.toMatch(/REEL: exatamente/);
  });

  it("uma entrega que obedece ao prompt PASSA no contrato", () => {
    // O fecho do laço: monta a entrega exatamente como o prompt manda e exige
    // que a régua a aceite. É o teste que teria pegado o defeito no dia.
    const c = ctx({ escopoContratado: escopoDoPiloto });
    const exigencia = exigenciaDeConteudo(escopoDoPiloto);
    const daMistura = (["carrossel", "story", "feed"] as const)
      .filter((f) => exigencia.permitidos.includes(f));
    const receita = receitaDoLote(exigencia.max, daMistura);
    const items: Array<Record<string, unknown>> = [];
    const cenas = "1) [gancho] a fila do almoço · 2) [tensao] mesa vazia às 13h · 3) [mecanismo] o combinado do dia · 4) [acao] reserve pelo WhatsApp";
    for (const f of daMistura) {
      for (let i = 0; i < receita[f]; i++) {
        items.push({ format: f, pillar: "bastidor da cozinha", headline: "h", caption: "c",
          visual: "cozinheiro montando o prato no balcão da Cantina, luz do meio-dia", ...(f === "carrossel" ? { cenas } : {}) });
      }
    }
    expect(items.length, "a receita não fechou o lote").toBe(exigencia.max);
    const r = conferirContrato(copy, { title: "t", summary: "s", items }, c);
    expect(r.violacoes, `a entrega que segue o prompt foi reprovada: ${r.violacoes.join("; ")}`).toEqual([]);
  });
});
