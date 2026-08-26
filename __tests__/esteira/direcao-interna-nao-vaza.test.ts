// A DIREÇÃO INTERNA NÃO VAI AO AR — a régua que faltava na rodada paga.
//
// O caso é literal: a legenda que voltou da refação em 27/08/2026, com a
// segunda linha sendo o briefing dentro do post.
//
// PROVA POR MUTAÇÃO (onde): apagar qualquer padrão de `PADROES` em
// `lib/agency/esteira/direcao-interna.ts`, ou trocar `limparDirecaoInterna`
// por identidade em `captionDaPeca` (`lib/agency/produtos/story-instagram-v1.ts`),
// reprova este arquivo.

import { describe, it, expect } from "vitest";
import {
  frasesDeDirecaoInterna, temDirecaoInterna, limparDirecaoInterna,
} from "@/lib/agency/esteira/direcao-interna";
import { captionDaPeca } from "@/lib/agency/produtos/story-instagram-v1";

/** A legenda EXATA que a peça `cmt8xk6ks…` recebeu na refação paga. */
const LEGENDA_MEDIDA = "Sexta é dia de estar aqui\nPost destacando a atmosfera acolhedora da trattoria.";

describe("a legenda medida em produção", () => {
  it("é reconhecida como direção interna", () => {
    const achadas = frasesDeDirecaoInterna(LEGENDA_MEDIDA);
    expect(achadas.length).toBe(1);
    expect(achadas[0]!.frase).toContain("Post destacando");
  });

  it("perde a direção e mantém a legenda de verdade", () => {
    expect(limparDirecaoInterna(LEGENDA_MEDIDA)).toBe("Sexta é dia de estar aqui");
  });
});

describe("as outras formas que o briefing assume", () => {
  const vazam = [
    "Peça que comunica o cuidado da casa com o ingrediente.",
    "Carrossel mostrando o passo a passo da massa.",
    "Este post reforça o pilar de bastidores.",
    "Imagem com o prato em primeiro plano",
    "Objetivo: gerar desejo pelo prato principal.",
    "Direção de arte: luz quente, sombra curta.",
    "A publicação destaca a atmosfera acolhedora.",
  ];
  for (const frase of vazam) {
    it(`barra: ${frase.slice(0, 40)}`, () => {
      expect(temDirecaoInterna(frase)).toBe(true);
    });
  }
});

describe("a legenda legítima passa inteira", () => {
  const ficam = [
    "Terça é dia de cacio e pepe.",
    "A massa é feita na hora, todos os dias. Vem provar.",
    "O ambiente cheio que faz você querer estar aqui também.",
    "Chegou a nova carta de vinhos — e ela tem história.",
    "Reserve sua mesa pelo link da bio.",
  ];
  for (const frase of ficam) {
    it(`passa: ${frase.slice(0, 40)}`, () => {
      expect(temDirecaoInterna(frase)).toBe(false);
      expect(limparDirecaoInterna(frase)).toBe(frase);
    });
  }
});

describe("captionDaPeca — o funil por onde toda legenda passa", () => {
  it("não deixa a direção interna virar caption", () => {
    const caption = captionDaPeca({
      titulo: "Sexta é dia de estar aqui",
      legenda: "Post destacando a atmosfera acolhedora da trattoria.",
      direcaoDeArte: null,
      pilar: "bastidores",
    });
    expect(caption).not.toContain("Post destacando");
    expect(caption).toBe("Sexta é dia de estar aqui");
  });

  it("NÃO esvazia a peça quando só há direção interna — o texto original fica de pé", () => {
    const caption = captionDaPeca({
      titulo: "",
      legenda: "Post destacando a atmosfera acolhedora da trattoria.",
      direcaoDeArte: null,
      pilar: null,
    });
    // Fica o texto cru: quem barra é o portão de publicação, com gente no meio.
    expect(caption).toBe("Post destacando a atmosfera acolhedora da trattoria.");
    expect(temDirecaoInterna(caption)).toBe(true);
  });

  it("a legenda boa atravessa byte a byte", () => {
    const caption = captionDaPeca({
      titulo: "Terça tem prato especial",
      legenda: "A massa é feita na hora, todos os dias.",
      direcaoDeArte: null,
      pilar: null,
    });
    expect(caption).toBe("Terça tem prato especial\nA massa é feita na hora, todos os dias.");
  });
});
