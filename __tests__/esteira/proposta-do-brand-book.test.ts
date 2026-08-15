// O BRAND BOOK PROPÕE — E NÃO FECHA A FICHA.
//
// Dois riscos, e os dois são de MENTIRA, não de erro de conta:
//
//   1. sobrescrever a resposta do dono com o palpite de um modelo lendo um PDF;
//   2. dar a entender que mandar o PDF resolve a ficha — o CEO clica em aplicar,
//      vê 33% e conclui que o sistema comeu o arquivo dele.
//
// Os testes abaixo travam os dois. O módulo é puro de propósito: nenhuma destas
// provas precisa de banco, de rede ou de chave de IA.

import { describe, it, expect } from "vitest";
import {
  proporDoBrandBook,
  fundirProcedencia,
  ALCANCADOS_PELO_BRAND_BOOK,
  PORQUE_FORA_DO_ALCANCE,
} from "@/lib/agency/esteira/proposta-do-brand-book";
import { CAMPOS_DA_MARCA, ROTULO, type CampoDaMarca, type EstadoDoCampo } from "@/lib/agency/esteira/ficha-de-marca";
import type { BrandExtraction } from "@/lib/types/brand-extraction";

const EXTRACAO: BrandExtraction = {
  brandName: "CityJobs",
  tagline: "O emprego perto de você",
  primaryColor: "#0B3D91",
  secondaryColor: "#F2F2F2",
  accentColor: "#FF6B00",
  typography: "Inter",
  tone: "próximo e direto",
  values: ["proximidade", "clareza"],
  targetAudience: "quem procura vaga na própria cidade",
  positioning: "o classificado de vagas do bairro",
  summary: "marca de empregos locais",
};

/** Uma ficha com todos os campos em lacuna, salvo os que o teste mandar. */
function ficha(definidos: CampoDaMarca[] = []) {
  return {
    campos: CAMPOS_DA_MARCA.map((campo) => ({
      campo,
      rotulo: ROTULO[campo],
      estado: (definidos.includes(campo) ? "definido" : "lacuna") as EstadoDoCampo,
      valor: definidos.includes(campo) ? "resposta que o DONO deu" : "",
      pergunta: null,
    })),
  };
}

describe("o brand book alcança três campos — e os outros seis não são falha de extração", () => {
  it("propõe exatamente os três, com valor utilizável", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    expect(p.aplicaveis.map((a) => a.campo).sort()).toEqual([...ALCANCADOS_PELO_BRAND_BOOK].sort());
  });

  it("os seis restantes saem NOMEADOS e com motivo — a tela não pode omitir", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    expect(p.foraDoAlcance).toHaveLength(6);
    for (const f of p.foraDoAlcance) {
      // Motivo vazio seria pior que ausência: viraria um campo cinza sem
      // explicação, e o dono não saberia que a resposta tem de vir dele.
      expect(f.porque.length, `campo ${f.campo} sem motivo`).toBeGreaterThan(20);
      expect(PORQUE_FORA_DO_ALCANCE[f.campo]).toBe(f.porque);
    }
    expect(p.foraDoAlcance.map((f) => f.campo)).toContain("hierarquia_e_dono");
    expect(p.foraDoAlcance.map((f) => f.campo)).toContain("proibicoes");
  });

  it("a cor e a tipografia viram TOKEN, não adjetivo", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    const formais = p.aplicaveis.find((a) => a.campo === "atributos_formais");
    expect(formais).toBeTruthy();
    const tokens = JSON.parse(formais!.valor) as Record<string, string>;
    expect(tokens.corPrimaria).toBe("#0B3D91");
    expect(tokens.tipografia).toBe("Inter");
    // "próximo e direto" é adjetivo: NÃO entra em atributo formal nem em voz.
    expect(formais!.valor).not.toContain("próximo e direto");
  });

  it("o TOM não preenche a voz — adjetivo não é verificável", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    expect(p.aplicaveis.map((a) => a.campo)).not.toContain("voz");
  });

  it("o RESUMO do modelo nunca vira régua de marca", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    for (const a of p.aplicaveis) expect(a.valor).not.toContain("marca de empregos locais");
  });
});

describe("a extração PROPÕE — nunca sobrescreve o que o dono já respondeu", () => {
  it("campo já definido sai de `aplicaveis` e entra em `jaDefinidos`", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha(["publico_e_relacao"]));
    expect(p.aplicaveis.map((a) => a.campo)).not.toContain("publico_e_relacao");
    expect(p.jaDefinidos.map((j) => j.campo)).toContain("publico_e_relacao");
  });

  it("com os três já respondidos, NADA é aplicável — e isso não é sucesso", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha(ALCANCADOS_PELO_BRAND_BOOK));
    expect(p.aplicaveis).toHaveLength(0);
    expect(p.jaDefinidos).toHaveLength(3);
  });
});

describe("a resposta NUNCA pode soar como “pronto”", () => {
  it("`fechaAFicha` é falso mesmo aplicando tudo", () => {
    expect(proporDoBrandBook(EXTRACAO, ficha()).fechaAFicha).toBe(false);
  });

  it("nenhum campo alcançável entra no gatilho de saída do dia zero", () => {
    // De `lerFichaDeMarca`: `naoConstituida` exige estes cinco definidos.
    // Se um dia um deles virar alcançável pelo brand book, este teste quebra —
    // e é para quebrar, porque aí a promessa da tela muda.
    const EXIGIDOS_NO_DIA_ZERO: CampoDaMarca[] = [
      "proposito_e_promessa", "publico_e_relacao", "voz", "lexico", "hierarquia_e_dono",
    ];
    const faltantes = EXIGIDOS_NO_DIA_ZERO.filter((c) => !ALCANCADOS_PELO_BRAND_BOOK.includes(c));
    // voz, lexico e hierarquia_e_dono continuam fora — logo o PDF não constitui
    // a marca sozinho, por mais completo que seja.
    expect(faltantes).toEqual(["voz", "lexico", "hierarquia_e_dono"]);
  });

  it("o recado diz que faltam campos e que eles são decisão do dono", () => {
    const r = proporDoBrandBook(EXTRACAO, ficha()).recado;
    expect(r).toContain("decisão sua");
    expect(r).toMatch(/não fecha a ficha/i);
  });
});

describe("procedência: de qual arquivo, quando, e quem confirmou", () => {
  it("grava origem, arquivo e autor em cada campo aplicado", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    const json = fundirProcedencia("{}", p.aplicaveis, {
      arquivo: "cityjobs-brandbook.pdf",
      confirmadoPor: "dioli@dioli.com.br",
      em: new Date("2026-08-15T10:00:00Z"),
    });
    const estados = JSON.parse(json) as Record<string, Record<string, string>>;
    expect(estados.atributos_formais.origem).toBe("brand_book");
    expect(estados.atributos_formais.arquivo).toBe("cityjobs-brandbook.pdf");
    expect(estados.atributos_formais.confirmadoPor).toBe("dioli@dioli.com.br");
    expect(estados.atributos_formais.em).toBe("2026-08-15T10:00:00.000Z");
  });

  it("NÃO apaga o estado de campos que vieram por outro caminho", () => {
    const antes = JSON.stringify({ proibicoes: { estado: "definido", origem: "portal" } });
    const p = proporDoBrandBook(EXTRACAO, ficha());
    const estados = JSON.parse(fundirProcedencia(antes, p.aplicaveis, {
      arquivo: "bb.pdf", confirmadoPor: "quem",
    })) as Record<string, Record<string, string>>;
    expect(estados.proibicoes.origem).toBe("portal");
    expect(estados.atributos_formais.origem).toBe("brand_book");
  });

  it("JSON ilegível no banco não faz perder o que está sendo gravado agora", () => {
    const p = proporDoBrandBook(EXTRACAO, ficha());
    const estados = JSON.parse(fundirProcedencia("isto não é json", p.aplicaveis, {
      arquivo: "bb.pdf", confirmadoPor: "quem",
    })) as Record<string, unknown>;
    expect(Object.keys(estados)).toContain("atributos_formais");
  });
});

describe("extração pobre não inventa campo", () => {
  it("sem cor, sem tipografia, sem público e sem posicionamento, nada é aplicável", () => {
    const vazia: BrandExtraction = {
      ...EXTRACAO,
      tagline: "", primaryColor: "", secondaryColor: "", accentColor: "",
      typography: "", targetAudience: "", positioning: "",
    };
    const p = proporDoBrandBook(vazia, ficha());
    expect(p.aplicaveis).toHaveLength(0);
    expect(p.recado).toContain("não trouxe nada");
  });
});
