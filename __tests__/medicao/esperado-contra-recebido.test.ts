// A COMPARAÇÃO ESPERADO × RECEBIDO — e a distinção que carrega o resto.
//
// O que este teste protege, em uma frase: **"nenhum evento faltando" só é
// verdade quando a comparação rodou.** Um sistema de dois estados escreve
// "íntegro" quando na verdade nunca perguntou, e foi assim que um painel desta
// casa ficou verde por 10 dias com o medidor morto.

import { describe, it, expect } from "vitest";
import {
  conciliar, conciliarCampanhaDaMeta, confiavel, type Conciliacao,
} from "@/lib/agency/medicao/conciliacao";
import { planoDoObjetivo } from "@/lib/agency/medicao/plano-de-mensuracao";
import {
  apresentarNumero, avisoDoRelatorio, MARCA_DE_INCOMPLETO, MARCA_DE_NAO_MEDIDO,
} from "@/lib/agency/medicao/apresentacao";
import { medirIntegridade, relatorioConfiavel } from "@/lib/agency/medicao/integridade-do-panorama";
import { tentarRecuperar } from "@/lib/agency/medicao/recuperacao";
import type { DesempenhoDaCampanha } from "@/lib/integrations/meta/ads-leitura";

const campanha = (p: Partial<DesempenhoDaCampanha> = {}): DesempenhoDaCampanha => ({
  campanhaId: "c1", nome: "Padaria — leads", objetivo: "OUTCOME_LEADS",
  gasto: 300, impressoes: 10_000, alcance: 8_000, frequencia: 1.2, cliques: 200,
  cpm: 30, cpc: 1.5, ctrPct: 2, resultado: null, custoPorResultado: null,
  acoes: { lead: 40 }, naoMedido: [], ...p,
});

describe("o plano de mensuração é uma declaração, não um palpite", () => {
  it("objetivo declarado tem plano, com o evento principal na frente", () => {
    const p = planoDoObjetivo("meta_ads", "OUTCOME_LEADS")!;
    expect(p.eventos[0]!.nome).toBe("lead");
    expect(p.eventos[0]!.papel).toBe("resultado");
  });

  it("canal sem declaração devolve null — e null nunca vira verde", () => {
    expect(planoDoObjetivo("tiktok_ads", "OUTCOME_LEADS")).toBeNull();
    const c = conciliar({ plano: planoDoObjetivo("tiktok_ads", "OUTCOME_LEADS"), recebidos: ["lead"] });
    expect(c.estado).toBe("nao_medido");
    expect(confiavel(c)).toBe(false);
  });

  it("campanha sem objetivo declarado é não medida, não íntegra", () => {
    expect(conciliarCampanhaDaMeta({ objetivo: null, acoes: { lead: 3 } }).estado).toBe("nao_medido");
  });
});

describe("os três estados — e o abismo entre 'íntegro' e 'não medido'", () => {
  it("o evento esperado chegou: íntegro, e a comparação rodou", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { lead: 40 } });
    expect(c.estado).toBe("integro");
    expect(c.comparacaoRodou).toBe(true);
    expect(confiavel(c)).toBe(true);
  });

  it("o evento esperado NÃO chegou: incompleto, com o que falta NOMEADO", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { link_click: 200 } });
    expect(c.estado).toBe("incompleto");
    expect(c.faltando.map((f) => f.nome)).toContain("lead");
    expect(c.faltando[0]!.como).toBe("nunca_chegou");
  });

  it("a fonte não respondeu (actions ausente): NÃO MEDIDO, e não 'zero eventos'", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: null });
    expect(c.estado).toBe("nao_medido");
    expect(c.comparacaoRodou).toBe(false);
  });

  it("O CASO DO CASE: o evento chegava antes e parou — o número menor é denunciado", () => {
    const c = conciliarCampanhaDaMeta({
      objetivo: "OUTCOME_LEADS",
      acoes: { leadgen_grouped: 12 },     // um alternativo assumiu o lugar
      acoesAntes: { lead: 40, leadgen_grouped: 40 },
    });
    expect(c.estado).toBe("incompleto");
    const parou = c.faltando.find((f) => f.como === "parou_de_chegar")!;
    expect(parou.nome).toBe("lead");
    expect(parou.frase).toMatch(/está MENOR por falta de evento/);
  });

  it("lista de esperados vazia jamais produz 'íntegro'", () => {
    const c = conciliar({
      plano: { canal: "meta_ads", objetivo: "X", eventos: [], fonte: "teste" },
      recebidos: [],
    });
    expect(c.estado).toBe("nao_medido");
    expect(confiavel(c)).toBe(false);
  });

  it("`confiavel` exige as DUAS coisas: rodou E nada faltando", () => {
    const mentira: Conciliacao = {
      estado: "integro", comparacaoRodou: false, esperados: ["lead"], recebidos: [], faltando: [], motivo: "",
    };
    expect(confiavel(mentira)).toBe(false);
  });
});

describe("dado incompleto nunca sai limpo", () => {
  it("íntegro sai limpo — este é o ÚNICO caso", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { lead: 40 } });
    const n = apresentarNumero(40, c, { rotulo: "Leads" });
    expect(n.texto).toBe("Leads: 40");
    expect(n.confiavel).toBe(true);
    expect(n.ressalva).toBeNull();
  });

  it("incompleto sai MARCADO, com o evento faltante no texto que a pessoa lê", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { link_click: 9 } });
    const n = apresentarNumero(12, c, { rotulo: "Leads" });
    expect(n.confiavel).toBe(false);
    expect(n.texto).toContain(MARCA_DE_INCOMPLETO);
    expect(n.texto).toContain("lead");
    expect(n.ressalva).toMatch(/faltam eventos de medição/);
  });

  it("não medido não mostra número nenhum — o valor cru não escapa para o texto", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: null, acoes: { lead: 40 } });
    const n = apresentarNumero(40, c);
    expect(n.texto).toContain(MARCA_DE_NAO_MEDIDO);
    expect(n.texto).not.toContain("40");
    expect(n.valor).toBeNull();
  });

  it("relatório sem nenhuma conciliação avisa que NADA foi verificado", () => {
    expect(avisoDoRelatorio([])).toContain(MARCA_DE_NAO_MEDIDO);
  });

  it("relatório todo íntegro é o único que fica em silêncio", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { lead: 1 } });
    expect(avisoDoRelatorio([c])).toBe("");
  });
});

describe("o panorama inteiro herda o pior estado", () => {
  const totais = { gasto: 300, impressoes: 10_000, alcance: 8_000, cliques: 200 };

  it("uma campanha incompleta contamina o total — total menor não sai limpo", () => {
    const i = medirIntegridade({
      desempenho: [campanha(), campanha({ campanhaId: "c2", acoes: { link_click: 5 } })],
      totais,
    });
    expect(i.estado).toBe("incompleto");
    expect(i.totais.gasto!.confiavel).toBe(false);
    expect(i.totais.gasto!.texto).toContain(MARCA_DE_INCOMPLETO);
    expect(relatorioConfiavel(i)).toBe(false);
  });

  it("panorama sem campanha nenhuma é NÃO MEDIDO, não íntegro", () => {
    const i = medirIntegridade({ desempenho: [], totais });
    expect(i.estado).toBe("nao_medido");
    expect(i.comparacaoRodou).toBe(false);
    expect(relatorioConfiavel(i)).toBe(false);
  });

  it("tudo íntegro: aviso vazio e total confiável", () => {
    const i = medirIntegridade({ desempenho: [campanha()], totais });
    expect(i.estado).toBe("integro");
    expect(i.aviso).toBe("");
    expect(relatorioConfiavel(i)).toBe(true);
  });
});

describe("a tentativa de recuperação é registrada, e a ausência dela também", () => {
  const plano = planoDoObjetivo("meta_ads", "OUTCOME_LEADS");
  const quebrada = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { link_click: 1 } });

  it("sem caminho de releitura: diz que NÃO tentou — e não finge fracasso", async () => {
    const r = await tentarRecuperar({ conciliacao: quebrada, plano });
    expect(r.tentou).toBe(false);
    expect(r.recuperou).toBe(false);
    expect(r.relato).toMatch(/NÃO HOUVE TENTATIVA/);
  });

  it("releitura bem-sucedida: registra a tentativa e o resultado", async () => {
    const r = await tentarRecuperar({ conciliacao: quebrada, plano, reler: async () => ["lead"] });
    expect(r.tentou).toBe(true);
    expect(r.recuperou).toBe(true);
    expect(r.conciliacao.estado).toBe("integro");
  });

  it("releitura que explode não vira recuperação: tentou, falhou, segue marcado", async () => {
    const r = await tentarRecuperar({
      conciliacao: quebrada, plano,
      reler: async () => { throw new Error("a Meta recusou"); },
    });
    expect(r.tentou).toBe(true);
    expect(r.recuperou).toBe(false);
    expect(r.relato).toContain("a Meta recusou");
    expect(r.conciliacao.estado).toBe("incompleto");
  });
});
