// AS QUATRO FONTES DE VERDADE QUE A 1ª RODADA NÃO VIU.
//
// A 1ª rodada varreu preço de PLANO e declarou os catálogos paralelos
// eliminados. A camada de dúvida achou quatro fontes de outra natureza, e a
// afirmação estava errada. Este arquivo é o mecanismo das quatro.
//
//   1. Adicionais em duas tabelas digitadas — `maxPrice` de uma era o
//      `targetPrice` da outra, número por número.
//   2. Terceira cópia da economia do reel, com CONTRADIÇÃO VIVA: piso R$ 200
//      contra mínimo de tabela R$ 150.
//   3. `negociacao.ts` duplicando os limites de faixa dentro de si mesmo.
//   4. O `pricing` da proposta: texto livre, direto ao cliente, sem referência
//      a fonte nenhuma.

import { describe, it, expect } from "vitest";
import { ADICIONAIS, ADICIONAIS_COM_CONTRADICAO, adicionalPorId, faixaDoAdicional } from "@/lib/agency/adicionais";
import { ADDON_MARGINS, computeDealFloor } from "@/lib/agency/pricing-margins";
import { DEPARTMENT_CATALOG } from "@/lib/agency/service-catalog";
import { FAIXAS, ehPerguntaDeFaixa } from "@/lib/agency/comercial/negociacao";
import { conferirPrecoDaProposta, isValidProposalPricing } from "@/lib/agency/reporting";
import { PLANOS, PLANOS_PUBLICOS, PLANOS_INTERNOS, precoEmReais } from "@/lib/agency/planos";

describe("FONTE 1 — os adicionais têm uma tabela só", () => {
  it("o catálogo de departamento DERIVA de adicionais.ts", () => {
    const traffic = DEPARTMENT_CATALOG.find((d) => d.id === "traffic")!.addons![0];
    const a = adicionalPorId("trafficMgmt")!;
    expect([traffic.minPrice, traffic.maxPrice]).toEqual([a.precoDe, a.precoAte]);

    const branding = DEPARTMENT_CATALOG.find((d) => d.id === "branding")!.addons!;
    const b = adicionalPorId("branding")!;
    const bf = adicionalPorId("brandingFull")!;
    expect([branding[0].minPrice, branding[0].maxPrice]).toEqual([b.precoDe, b.precoAte]);
    expect([branding[1].minPrice, branding[1].maxPrice]).toEqual([bf.precoDe, bf.precoAte]);
  });

  it("⛔ o padrão que estava escondido: `maxPrice` de uma NÃO pode ser `targetPrice` da outra por coincidência", () => {
    // Eles CONTINUAM iguais — e agora é porque saem do MESMO objeto, não porque
    // duas pessoas digitaram o mesmo número. A prova é a origem, não o valor.
    for (const a of ADICIONAIS) {
      if (a.piso === null) continue;
      expect(ADDON_MARGINS[a.id]!.targetPrice).toBe(a.precoAte);
      expect(ADDON_MARGINS[a.id]!.floorPrice).toBe(a.piso);
      expect(ADDON_MARGINS[a.id]!.costBasis).toBe(a.custoBase);
    }
  });

  it("a faixa falha ALTO para adicional inexistente — nunca cota `undefined`", () => {
    expect(() => faixaDoAdicional("nao-existe")).toThrow(/não existe/);
    expect(faixaDoAdicional("branding")).toEqual({ min: 1200, max: 2500 });
  });
});

describe("FONTE 2 — a contradição do reel não foi resolvida por mim, foi TRAVADA", () => {
  it("o reel não tem piso, e a contradição está escrita com os dois números", () => {
    const reel = adicionalPorId("reel")!;
    expect(reel.piso, "escolher entre 150 e 200 seria inventar o piso de um produto").toBeNull();
    expect(reel.contradicao).toContain("150");
    expect(reel.contradicao).toContain("200");
  });

  it("⛔ sem piso, o reel NÃO entra em fechamento automático — e diz por quê", () => {
    const negocio = computeDealFloor({ socialPackage: "presenca", extraReels: 3 });
    expect(negocio.lines.some((l) => l.label.includes("Reel"))).toBe(false);
    expect(negocio.semAutorizacao.join(" ")).toMatch(/[Rr]eel/);
    // 🔑 e o piso do negócio NÃO foi inflado nem deflacionado por um reel
    // cotado no escuro: ele é só o do plano.
    const soPlano = computeDealFloor({ socialPackage: "presenca" });
    expect(negocio.totalFloor).toBe(soPlano.totalFloor);
  });

  it("✅ a outra metade: adicional COM piso continua entrando normalmente", () => {
    const negocio = computeDealFloor({ socialPackage: "presenca", wantsTraffic: true });
    expect(negocio.lines.some((l) => l.label.includes("Tráfego"))).toBe(true);
    expect(negocio.semAutorizacao).toEqual([]);
    expect(negocio.totalFloor).toBe(690 + adicionalPorId("trafficMgmt")!.piso!);
  });

  it("toda contradição declarada tem texto que nomeia o conflito", () => {
    expect(ADICIONAIS_COM_CONTRADICAO.length).toBeGreaterThan(0);
    for (const a of ADICIONAIS_COM_CONTRADICAO) {
      expect(a.contradicao!.length, `${a.nome}: contradição sem explicação`).toBeGreaterThan(80);
    }
  });

  it("🔴 e a contradição de PERMISSÃO fica registrada: tráfego pago vendido com a conta restrita", () => {
    // É a MESMA laranja que tornou o Performance não vendável. Não removi o
    // produto — isso é decisão do CEO. Mas ela não fica sem registro.
    const t = adicionalPorId("trafficMgmt")!;
    expect(t.contradicao).toMatch(/restrit/i);
    expect(t.contradicao).toContain("03/08/2026");
  });
});

describe("FONTE 3 — os limites de faixa saem da própria régua", () => {
  it("a lista de limites é DERIVADA de FAIXAS, não digitada ao lado dela", () => {
    // A prova é comportamental: a pergunta certa do SDR continua sendo aceita,
    // e ela é montada com os rótulos das próprias FAIXAS.
    const pergunta =
      "Pra eu montar a proposta certa: quanto você pensa em investir por mês — até R$ 150, " +
      "entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, entre R$ 1.500 e R$ 5.000, ou acima disso?";
    expect(ehPerguntaDeFaixa(pergunta)).toBe(true);
  });

  it("⛔ a probe: mexer numa FAIXA não pode calar o SDR em silêncio", () => {
    // O modo de falhar era este: trocar um limite fazia `ehPerguntaDeFaixa`
    // REJEITAR a pergunta correta, o turno inteiro ser descartado e o motor de
    // regras assumir — sem erro, sem log, sem tela vermelha.
    const limitesDaRegua = new Set(
      FAIXAS.flatMap((f) => [f.de, f.ate]).filter((n) => Number.isFinite(n) && n > 0),
    );
    const citadosNaPergunta = [150, 500, 1500, 5000];
    for (const v of citadosNaPergunta) {
      expect(limitesDaRegua.has(v), `o limite ${v} sumiu de FAIXAS e a pergunta do SDR morreria calada`).toBe(true);
    }
    // ✅ a outra metade: valor FORA da régua continua sendo tratado como cotação
    expect(ehPerguntaDeFaixa("Seu investimento fica em R$ 777 por mês")).toBe(false);
  });
});

describe("🔴 FONTE 4 — o `pricing` da proposta era texto livre e ia direto ao cliente", () => {
  it("✅ o que já funcionava continua: vazio, placeholder e zero são barrados", () => {
    for (const ruim of ["", "   ", "a definir", "TBD", "-", "0", "R$ 0,00"]) {
      expect(isValidProposalPricing(ruim), `"${ruim}" passou`).toBe(false);
    }
  });

  it("⛔ NOVO: citar um plano com preço que não é o dele é RECUSA", () => {
    // O bypass: "qualquer string não-vazia vai ao cliente". Alguém escrevia
    // "Plano Ritmo — R$ 197/mês" e a proposta saía com um preço inexistente.
    const v = conferirPrecoDaProposta("Plano Ritmo — R$ 197/mês");
    expect(v.pode).toBe(false);
    expect(v.ancorado).toBe(true);
    // `precoEmReais` usa espaço NÃO-SEPARÁVEL (U+00A0) entre "R$" e o número,
    // como todo `toLocaleString("pt-BR")`. Comparar com espaço comum aqui daria
    // um teste vermelho por um motivo que não é o do teste.
    expect(v.motivo).toContain(precoEmReais(297));
  });

  it("⛔ NOVO: citar um plano NÃO VENDÁVEL é recusa, com o motivo", () => {
    for (const p of PLANOS_INTERNOS) {
      const v = conferirPrecoDaProposta(`Proposta: plano ${p.nome}, ${precoEmReais(p.preco)}/mês`);
      expect(v.pode, `${p.nome} passou na proposta`).toBe(false);
      expect(v.motivo).toMatch(/não é vendável/i);
    }
  });

  it("✅ o preço CERTO do plano passa — e o piso também, que é desconto autorizado", () => {
    const ritmo = PLANOS.find((p) => p.id === "ritmo")!;
    expect(conferirPrecoDaProposta(`Plano Ritmo — ${precoEmReais(ritmo.preco)}/mês`).pode).toBe(true);
    expect(conferirPrecoDaProposta(`Plano Ritmo — ${precoEmReais(ritmo.piso!)}/mês (à vista)`).pode).toBe(true);
  });

  it("✅ a metade que impede o portão de quebrar o produto: proposta sob medida PASSA", () => {
    // Exigir que todo `pricing` cite um plano travaria projeto de marca, site e
    // pacote misto — quebrar o produto para consertar o portão não é conserto.
    const custom = conferirPrecoDaProposta("Projeto de identidade visual: R$ 2.900, em 3x");
    expect(custom.pode).toBe(true);
    // ...e quem chama SABE que não foi conferido contra a tabela.
    expect(custom.ancorado).toBe(false);
    expect(custom.motivo).toMatch(/não foi conferido/i);
  });

  it("✅ e cita o plano sem número: passa, porque não há o que conferir", () => {
    const v = conferirPrecoDaProposta("Plano Presença, condições no contrato — R$ 790/mês");
    expect(v.pode).toBe(true);
    expect(v.ancorado).toBe(true);
  });

  it("acento digitado errado não abre buraco: 'presenca' é reconhecido como 'Presença'", () => {
    // Quem escreve proposta digita sem acento. Se a comparação exigisse o
    // acento, o caminho mais provável de errar seria também o que escapa.
    const v = conferirPrecoDaProposta("Plano Presenca — R$ 590/mês");
    expect(v.pode).toBe(false);
    expect(v.motivo).toContain(precoEmReais(790));
  });

  it("R$ 297,00 e R$ 297 são o MESMO valor para o conferidor", () => {
    expect(conferirPrecoDaProposta("Plano Ritmo — R$ 297,00/mês").pode).toBe(true);
    // e R$ 297,50 não é: centavos diferentes de zero são outro número
    expect(conferirPrecoDaProposta("Plano Ritmo — R$ 297,50/mês").pode).toBe(false);
  });

  it("plano sem piso não aceita desconto nenhum — e o motivo diz isso", () => {
    const pulso = PLANOS_PUBLICOS.find((p) => p.id === "pulso")!;
    expect(pulso.piso).toBeNull();
    const v = conferirPrecoDaProposta("Plano Pulso — R$ 39/mês");
    expect(v.pode).toBe(false);
    expect(v.motivo).toMatch(/NÃO tem piso/i);
  });
});
