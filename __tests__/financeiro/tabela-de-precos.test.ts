// A TABELA DE PREÇOS E O FREIO DO NEGOCIADOR — 27/08/2026.
//
// Ordem do CEO: *"preço de custo, preço final, margem de desconto — até onde eu
// posso dar de desconto, pro SDR negociador ter na manga. Isso tem que estar
// claríssimo pro negociador."* E o freio: o SDR **não pode** ofertar abaixo do
// piso.
//
// Estes testes travam as duas metades: a tabela (uma fonte só) e a recusa.

import { describe, it, expect } from "vitest";
import {
  TABELA_DE_PRECOS, TETO_DE_PECAS_POR_MES, CUSTOS_NAO_MEDIDOS,
  podeOfertar, podePrometerVolume, pisoDoServico, margemNoPiso,
  servicoPorChave, coberturaDeCusto, volumeQueACasaVende, aCasaProduz,
  MARGEM_MINIMA_PCT, fechaMargemMinima, servicosQueNaoFechamAMargem,
  margemNoPisoPct, precoQueFechaAMargemMinima,
} from "@/lib/agency/financeiro/tabela-de-precos";
import { medido } from "@/lib/agency/financeiro/dinheiro";

describe("a tabela é a fonte única", () => {
  it("os três planos entram com o preço fechado em D-0B6 — e não são remarcados", () => {
    expect(servicoPorChave("plano_ritmo")!.precoFinalCentavos).toBe(29000);
    expect(servicoPorChave("plano_presenca")!.precoFinalCentavos).toBe(49000);
    expect(servicoPorChave("plano_conteudo")!.precoFinalCentavos).toBe(79000);
  });

  it("os planos entregam exatamente o volume da decisão — 12, 20 e 36", () => {
    expect(servicoPorChave("plano_ritmo")!.pecasPorMes).toBe(12);
    expect(servicoPorChave("plano_presenca")!.pecasPorMes).toBe(20);
    expect(servicoPorChave("plano_conteudo")!.pecasPorMes).toBe(36);
  });

  it("todo serviço tem produtor — vitrine é promessa, e promessa sem produtor é dívida", () => {
    for (const s of TABELA_DE_PRECOS) {
      expect(s.produtor, `${s.nome} sem produtor`).toBeTruthy();
      expect(["maquina", "maquina_com_direcao", "humano"]).toContain(s.produtor);
    }
  });

  it("vídeo e reel NÃO estão na tabela — não há quem produza", () => {
    const nomes = TABELA_DE_PRECOS.map((s) => s.nome.toLowerCase()).join(" ");
    expect(nomes).not.toMatch(/v[ií]deo|reel|stories?\b/);
    expect(podeOfertar("video", 50000).pode).toBe(false);
    expect(podeOfertar("reel", 50000).pode).toBe(false);
  });

  it("nenhum plano passa da capacidade da casa", () => {
    for (const s of TABELA_DE_PRECOS) {
      expect(s.pecasPorMes).toBeLessThanOrEqual(TETO_DE_PECAS_POR_MES);
    }
  });
});

describe("o custo é honesto sobre o que não sabe", () => {
  it("nenhum serviço tem custo dado como medido — cinco parcelas faltam", () => {
    // O CEO esperava que o Financeiro já tivesse tudo. Foi medido: não tem.
    for (const s of TABELA_DE_PRECOS) {
      expect(s.custo.estado, `${s.nome} finge saber o próprio custo`).toBe("nao_medido");
    }
    expect(coberturaDeCusto().medidos).toBe(0);
    expect(coberturaDeCusto().parcelasEmFalta).toBe(CUSTOS_NAO_MEDIDOS.length);
  });

  it("cada custo não medido tem motivo E dono — buraco sem dono é buraco esquecido", () => {
    expect(CUSTOS_NAO_MEDIDOS.length).toBeGreaterThan(0);
    for (const c of CUSTOS_NAO_MEDIDOS) {
      expect(c.motivo.length, `${c.rotulo} sem motivo`).toBeGreaterThan(10);
      expect(c.dono, `${c.rotulo} sem dono`).toMatch(/CEO|gerente/i);
    }
  });

  it("a margem no piso NÃO é inventada quando o custo não é medido", () => {
    // Margem calculada sobre custo incompleto é pior que margem nenhuma: dá
    // confiança falsa para o negociador descer o preço.
    for (const s of TABELA_DE_PRECOS) {
      expect(margemNoPiso(s).estado).toBe("nao_medido");
    }
  });
});

describe("o piso: sem faixa autorizada, desconto nenhum", () => {
  it("hoje o piso É o preço de tabela — nenhuma faixa foi autorizada", () => {
    for (const s of TABELA_DE_PRECOS) {
      expect(s.descontoAutorizadoPct).toBeNull();
      expect(pisoDoServico(s)).toBe(s.precoFinalCentavos);
    }
  });

  // ⚠️ ESTE TESTE MUDOU DE RESPOSTA EM 27/08/2026, E A MUDANÇA É A ORDEM DO CEO.
  //
  // Ele afirmava que uma faixa autorizada baixava o piso: 79000 − 10% = 71100.
  // Estava certo até a ordem *"margem mínima nesse início: dez por cento de
  // lucro"*. Com o custo `nao_medido`, ninguém consegue PROVAR que 71100 deixa
  // 10% — pode deixar 40% e pode ser prejuízo, e os dados da casa sustentam as
  // duas hipóteses igualmente. O que não se prova não vale, e o piso NÃO desce.
  //
  // Não é o teste que ficou chato: é a régua que subiu, e o teste seguiu a régua.
  it("faixa autorizada NÃO baixa o piso enquanto o custo tiver buraco", () => {
    const s = { ...servicoPorChave("plano_conteudo")!, descontoAutorizadoPct: 10 };
    expect(s.custo.estado).toBe("nao_medido");
    expect(pisoDoServico(s)).toBe(79000);
    // E o SDR bate na trava mesmo com a autorização escrita ao lado dele.
    expect(margemNoPisoPct(s)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A MARGEM MÍNIMA DE 10% — ordem do CEO, 27/08/2026
// ═══════════════════════════════════════════════════════════════════════════

describe("⛔ dez por cento de lucro é o chão, e é código", () => {
  const comCusto = (centavos: number, desconto: number | null) => ({
    ...servicoPorChave("plano_conteudo")!,
    custo: medido(centavos, "manual" as const),
    descontoAutorizadoPct: desconto,
  });

  // A LEITURA ESCOLHIDA, ESCRITA: 10% DO PREÇO, não 10% em cima do custo.
  // "custo × 1,10" daria 9,1% de margem e passaria por baixo da ordem sem
  // ninguém ver a diferença. Onde há duas leituras, a casa fica com a que
  // protege — e diz qual escolheu.
  it("o piso é custo ÷ 0,90, não custo × 1,10", () => {
    expect(precoQueFechaAMargemMinima(9000)).toBe(10000);
    expect(precoQueFechaAMargemMinima(45000)).toBe(50000);
  });

  // MUTAÇÃO QUE DERRUBA: trocar `Math.max(comDesconto, comMargemMinima)` por
  // `comDesconto` em `pisoDoServico`. O CEO autoriza 40% num serviço cujo custo
  // come 70% do preço, e o SDR fecha a venda no prejuízo achando que cumpriu a
  // regra.
  it("o piso SOBE quando o desconto autorizado passaria por baixo dos 10%", () => {
    // Custo R$ 553,00 sobre preço R$ 790,00. Com 40% autorizados o preço iria a
    // R$ 474,00 — prejuízo de R$ 79,00. O piso sobe para 55300 ÷ 0,90.
    const s = comCusto(55300, 40);
    expect(pisoDoServico(s)).toBe(61445);
    // ≥ 10, nunca 9,99. O `Math.ceil` do piso é de propósito: arredondar para
    // baixo entregaria 9,9992% e chamaria de dez por cento.
    expect(margemNoPisoPct(s)!).toBeGreaterThanOrEqual(MARGEM_MINIMA_PCT);
    expect(margemNoPisoPct(s)!).toBeLessThan(MARGEM_MINIMA_PCT + 0.01);
    expect(podeOfertar("plano_conteudo", 47400).pode).toBe(false);
  });

  it("quando o desconto CABE nos 10%, ele vale — a trava não estrangula a venda", () => {
    // Custo R$ 100,00, desconto 10% → R$ 711,00, margem de 85,9%. Passa.
    const s = comCusto(10000, 10);
    expect(pisoDoServico(s)).toBe(71100);
    expect(margemNoPisoPct(s)!).toBeGreaterThan(10);
  });

  // MUTAÇÃO QUE DERRUBA: tirar o `if (s.custo.estado !== "medido") return
  // s.precoFinalCentavos;`. É a linha que impede *margem otimista sobre custo
  // incompleto* — a que dá confiança falsa ao negociador para descer o preço até
  // um lugar que parece lucro e é prejuízo.
  it("custo NÃO MEDIDO anula qualquer faixa autorizada, em todos os serviços", () => {
    for (const s of TABELA_DE_PRECOS) {
      const comFaixa = { ...s, descontoAutorizadoPct: 40 };
      expect(pisoDoServico(comFaixa), `${s.nome} deixou o desconto passar`).toBe(s.precoFinalCentavos);
      expect(margemNoPisoPct(comFaixa)).toBeNull();
    }
  });

  it("a margem no piso NUNCA é um número quando o custo não é um número", () => {
    for (const s of TABELA_DE_PRECOS) {
      expect(margemNoPisoPct(s), `${s.nome} inventou uma margem`).toBeNull();
    }
  });
});

describe("⛔ o SDR não consegue ofertar abaixo do piso", () => {
  it("recusa um centavo abaixo do piso", () => {
    const v = podeOfertar("plano_conteudo", 78999);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.pisoCentavos).toBe(79000);
      expect(v.motivo).toMatch(/piso/i);
    }
  });

  it("recusa o desconto que o cliente pediu de boca — 'faz por 500'", () => {
    expect(podeOfertar("plano_conteudo", 50000).pode).toBe(false);
    expect(podeOfertar("plano_presenca", 30000).pode).toBe(false);
    expect(podeOfertar("plano_ritmo", 19000).pode).toBe(false);
  });

  it("aceita o preço de tabela, e aceita acima dele", () => {
    expect(podeOfertar("plano_conteudo", 79000).pode).toBe(true);
    expect(podeOfertar("plano_conteudo", 99000).pode).toBe(true);
  });

  it("preço inválido (NaN, negativo) é recusa, nunca passagem", () => {
    // Fail-closed: número que não é número não pode virar oferta.
    expect(podeOfertar("plano_ritmo", Number.NaN).pode).toBe(false);
    expect(podeOfertar("plano_ritmo", -1).pode).toBe(false);
    expect(podeOfertar("plano_ritmo", Number.NEGATIVE_INFINITY).pode).toBe(false);
  });

  it("a recusa NUNCA vira beco: vem com como seguir", () => {
    const v = podeOfertar("plano_conteudo", 50000);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      // Muda-se de degrau, não de preço — e o degrau de baixo tem nome e preço.
      expect(v.comoSeguir).toMatch(/Presença/);
      expect(v.comoSeguir).toMatch(/degrau/i);
    }
  });

  it("no degrau mais barato a saída é GENTE, com próxima ação", () => {
    const v = podeOfertar("balcao_post", 1000);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.comoSeguir).toMatch(/gerente do projeto/i);
      expect(v.comoSeguir).not.toMatch(/degrau de baixo/i);
    }
  });
});

describe("o SDR não promete o que a casa não produz", () => {
  it("o teto é 36 — o número literal, não a constante que ele mesmo define", () => {
    // ⚠️ ESTE TESTE NASCEU DE UMA FALHA DA PRÓPRIA PROVA DE MUTAÇÃO: a versão
    // anterior media `podePrometerVolume(TETO + 1)`, que é a constante contra
    // ela mesma. Subir o teto para 100 passava verde — o teste acompanhava a
    // mudança em vez de barrá-la. Capacidade é fato do mundo (a casa produz 36),
    // não um número que o código pode redefinir sozinho.
    expect(TETO_DE_PECAS_POR_MES).toBe(36);
    expect(podePrometerVolume(36).pode).toBe(true);
    const v = podePrometerVolume(37);
    expect(v.pode).toBe(false);
    expect(v.motivo).toMatch(/capacidade/i);
    expect(podePrometerVolume(100).pode).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OS DOIS DEFEITOS DO PAINEL DO CLIENTE 001 — 27/08/2026
//   "Posts: 28/mês"  → 28 não existe na tabela (12 · 20 · 36)
//   "Vídeo: A definir" → vídeo não tem produtor; "a definir" é promessa em branco
// ─────────────────────────────────────────────────────────────────────────────
describe("28 peças/mês: a casa encaixa num degrau e DIZ que encaixou", () => {
  it("28 vira o degrau que COBRE o pedido — 36, nunca 20", () => {
    const r = volumeQueACasaVende(28);
    expect(r.vende).toBe(true);
    if (r.vende) {
      expect(r.degrau.pecasPorMes).toBe(36);
      // Arredondar para baixo entregaria menos do que foi pedido, calado.
      expect(r.degrau.pecasPorMes).toBeGreaterThanOrEqual(28);
      // E o cliente lê o encaixe, em vez de descobrir na fatura.
      expect(r.frase).toMatch(/28/);
      expect(r.frase).toMatch(/36/);
      expect(r.frase).toMatch(/recebe mais, não menos/i);
    }
  });

  it("o volume exato não inventa conversa", () => {
    const r = volumeQueACasaVende(20);
    expect(r.vende).toBe(true);
    if (r.vende) {
      expect(r.degrau.pecasPorMes).toBe(20);
      expect(r.frase).not.toMatch(/recebe mais/i);
    }
  });

  it("acima da capacidade a casa NÃO vende — e diz por quê", () => {
    const r = volumeQueACasaVende(60);
    expect(r.vende).toBe(false);
    expect(r.frase).toMatch(/capacidade/i);
  });
});

describe("vídeo: 'não fazemos', nunca 'a definir'", () => {
  it("serviço sem produtor recebe uma recusa clara", () => {
    const r = aCasaProduz("Vídeo institucional");
    expect(r.produz).toBe(false);
    expect(r.frase).toMatch(/não fazemos/i);
  });

  it("⛔ a resposta NUNCA é indefinição — promessa com assinatura em branco", () => {
    for (const servico of ["Vídeo", "Reel", "Stories em vídeo", "TikTok"]) {
      const r = aCasaProduz(servico);
      expect(r.produz).toBe(false);
      expect(r.frase.toLowerCase()).not.toContain("a definir");
      expect(r.frase.toLowerCase()).not.toContain("sob consulta");
      expect(r.frase.toLowerCase()).not.toContain("a combinar");
    }
  });

  it("o que a casa produz responde que sim", () => {
    expect(aCasaProduz("plano_conteudo").produz).toBe(true);
    expect(aCasaProduz("Post avulso").produz).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CHÃO DE LUCRO — "margem mínima nesse início: dez por cento" (CEO, 27/08)
// ─────────────────────────────────────────────────────────────────────────────
describe("os 10% de lucro são chão, não meta", () => {
  it("o número é 10, cravado — não a constante contra ela mesma", () => {
    // A lição da prova de mutação do teto de capacidade: um teste que compara a
    // constante com ela mesma acompanha a mudança em vez de barrá-la.
    expect(MARGEM_MINIMA_PCT).toBe(10);
  });

  it("com custo NÃO MEDIDO, a resposta é `null` — nunca um 'sim' tímido", () => {
    for (const s of TABELA_DE_PRECOS) {
      expect(fechaMargemMinima(s)).toBeNull();
    }
    // E a lista de prejuízo vem vazia POR NÃO SABER, não por estar tudo bem.
    // Quem separa os dois é `coberturaDeCusto`, e o relatório tem de dizer qual.
    expect(servicosQueNaoFechamAMargem()).toEqual([]);
    expect(coberturaDeCusto().medidos).toBe(0);
  });

  it("o chão VENCE a faixa autorizada quando ela desceria demais", () => {
    // Custo R$ 500 medido → chão = R$ 550. Um desconto de 30% sobre R$ 790
    // daria R$ 553, que passa; 40% daria R$ 474, que o chão barra em R$ 550.
    const base = {
      ...servicoPorChave("plano_conteudo")!,
      custo: { estado: "medido", centavos: 50000, moeda: "BRL", origem: "manual" },
    } as never as Parameters<typeof pisoDoServico>[0];
    // ⚠️ ESTES NÚMEROS MUDARAM NA UNIFICAÇÃO DE 27/08/2026, e a mudança é a
    // doutrina: "dez por cento de lucro" passou a ser 10% DO PREÇO
    // (custo ÷ 0,90 = R$ 555,56) e não 10% em cima do custo (× 1,10 = R$ 550,00,
    // que entrega 9,09% e chamaria de dez). O porquê está em
    // `precoQueFechaAMargemMinima`. Agora o chão vence os DOIS descontos.
    expect(pisoDoServico({ ...base, descontoAutorizadoPct: 30 })).toBe(55556);
    expect(pisoDoServico({ ...base, descontoAutorizadoPct: 40 })).toBe(55556);
    // 55556 = ceil(50000 ÷ 0,90) — o chão, não o desconto.
  });

  it("serviço que não fecha 10% nem no preço de tabela aparece POR NOME", () => {
    const caro = {
      ...servicoPorChave("balcao_post")!,
      custo: { estado: "medido", centavos: 9000, moeda: "BRL", origem: "manual" },
    } as never as Parameters<typeof fechaMargemMinima>[0];
    // R$ 79 de preço contra R$ 90 de custo: prejuízo declarado.
    expect(fechaMargemMinima(caro)).toBe(false);
  });
});
