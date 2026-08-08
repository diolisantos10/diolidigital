// O DOSSIÊ DO LEAD — o que a agência consegue montar SEM falar com a pessoa.
//
// Pedido do CEO sobre as três paradas: leitura do negócio, proposta de escopo e
// faixa de preço pela tabela da casa, prontas no admin para ele decidir se
// aborda. As travas aqui são as três que o tornam assinável:
//
//   1. o preço sai da TABELA DA CASA, não da cabeça de um modelo;
//   2. o que não se sabe aparece como não sabido — faixa ausente NÃO é R$ 0;
//   3. contato não se deduz; pista é pista e tem outro nome.

import { describe, it, expect } from "vitest";
import { montarDossie } from "@/lib/agency/comercial/dossie-do-lead";
import { SOCIAL_PACKAGES } from "@/lib/agency/live-calculator";
import { DEPARTMENT_CATALOG } from "@/lib/agency/service-catalog";

const AGORA = new Date("2026-08-08T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000);

const SUSHI_CAZZA = {
  id: "cm-sushi",
  businessName: "Restaurante Sushi Cazza",
  segment: "gastronomia",
  status: "new",
  createdAt: diasAtras(51),
  services: ["planejamento de conteúdo", "direção visual", "estratégia"],
  objectives: ["aumentar presença digital"],
  rawContext:
    "[Prospect] Nosso ticket médio é R$ 180 e o público tem de 25 a 45 anos, mora na zona sul.\n" +
    "[Prospect] A paleta é preto, vermelho e dourado. Nosso perfil é o @sushicazzaoficial.",
  briefingJson: null,
};

describe("Sushi Cazza — o caso real, 51 dias parado", () => {
  const d = montarDossie(SUSHI_CAZZA, AGORA);

  it("conta há quanto tempo, com o número que dói", () => {
    expect(d.diasParado).toBe(51);
  });

  it("🔴 declara que NÃO há como falar, e o motivo", () => {
    expect(d.contato.temComoFalar).toBe(false);
    expect(d.contato.motivo).toBeTruthy();
    expect(d.precisoConfirmar[0]).toMatch(/Como falar/i);
  });

  it("mostra o @sushicazzaoficial como PISTA — não como contato", () => {
    expect(d.pistas).toContainEqual({ tipo: "instagram", valor: "@sushicazzaoficial" });
    expect(d.contato.temComoFalar).toBe(false); // a pista não move o veredito
  });

  it("cita o que ele contou, em vez de parafrasear — é a única 'leitura do negócio' que dá para assinar sem ter falado com ele", () => {
    expect(d.oQueEleContou.join(" ")).toContain("ticket médio");
    expect(d.oQueEleContou.join(" ")).toContain("paleta");
  });

  it("propõe escopo e faixa pela TABELA DA CASA — social + identidade visual, sem cadência declarada", () => {
    expect(d.fonteDaFaixa).toBe("catalogo_sem_cadencia");
    const deptos = d.escopo.map((l) => l.departamento);
    expect(deptos).toContain("Social Media");
    expect(deptos).toContain("Identidade Visual");

    const branding = DEPARTMENT_CATALOG.find((c) => c.id === "branding")!.addons![0];
    const pisoSocial = Math.min(...SOCIAL_PACKAGES.map((p) => p.minPrice));
    expect(d.faixa!.minimo).toBe(pisoSocial + branding.minPrice);
  });

  it("a faixa larga DIZ que é larga — número sem procedência é número que engana", () => {
    expect(d.notaDaFaixa).toMatch(/não fixou volume|banda inteira/i);
    expect(d.precisoConfirmar.join(" ")).toMatch(/Volume contratado/);
  });
});

describe("quando o escopo foi declarado, a tabela é aplicada de verdade", () => {
  it("usa `computeEstimate` sobre o escopo gravado e sobe a confiança", () => {
    const d = montarDossie(
      {
        ...SUSHI_CAZZA,
        briefingJson: {
          scope: {
            businessName: "Sushi Cazza",
            objectives: [],
            wantsSocialMedia: true,
            social: { platforms: ["instagram"], postsPerWeek: 3, storiesPerWeek: 5 },
          },
        },
      },
      AGORA,
    );
    expect(d.fonteDaFaixa).toBe("escopo_declarado");
    expect(d.escopo.length).toBeGreaterThan(0);
    expect(d.faixa!.maximo).toBeGreaterThan(0);
    expect(d.notaDaFaixa).toMatch(/tabela da casa/i);
  });

  it("escopo gravado VAZIO não é escopo — senão `computeEstimate` devolveria zero com cara de 'a agência calculou e deu R$ 0'", () => {
    const d = montarDossie({ ...SUSHI_CAZZA, briefingJson: { scope: {} } }, AGORA);
    expect(d.fonteDaFaixa).not.toBe("escopo_declarado");
  });
});

describe("o que não se sabe aparece como não sabido", () => {
  it("🔴 serviço que a tabela não cobre → faixa NULA com motivo escrito, nunca R$ 0", () => {
    const d = montarDossie(
      { ...SUSHI_CAZZA, services: ["consultoria jurídica"], objectives: [], rawContext: "" },
      AGORA,
    );
    expect(d.faixa).toBeNull();
    expect(d.fonteDaFaixa).toBe("indeterminada");
    expect(d.notaDaFaixa).toMatch(/não é R\$ 0/);
  });

  it("segmento ausente vira 'preciso confirmar', não vira palpite", () => {
    const d = montarDossie({ ...SUSHI_CAZZA, segment: "" }, AGORA);
    expect(d.segmento).toBeNull();
    expect(d.precisoConfirmar.join(" ")).toMatch(/Segmento/);
  });
});

describe("o lead COM contato — a metade limpa", () => {
  it("não pede contato em 'preciso confirmar' e não abre bloco de pista", () => {
    const d = montarDossie(
      {
        ...SUSHI_CAZZA,
        briefingJson: { contato: { nome: "Pedro", whatsapp: "11989400692" } },
      },
      AGORA,
    );
    expect(d.contato.temComoFalar).toBe(true);
    expect(d.precisoConfirmar.join(" ")).not.toMatch(/Como falar/i);
  });
});
