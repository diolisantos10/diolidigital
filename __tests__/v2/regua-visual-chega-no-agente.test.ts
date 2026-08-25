// A RÉGUA VISUAL CHEGA NO AGENTE — ou não passa de documento.
//
// ─── O DEFEITO QUE ESTE TESTE GUARDA ────────────────────────────────────────
//
// Em 25/08/2026 o CEO perguntou: *"tem ou não tem como melhorar a ficha desses
// designers?"*. A resposta honesta tinha duas metades, e a segunda é a que
// importa:
//
//   1. dá para escrever uma régua de qualidade visual muito melhor — e foi
//      escrita, no bloco 15 de `agentes/linha/design/_departamento.md`;
//   2. **e, até aquele dia, escrever não adiantaria nada.**
//
// A casa tem uma fiação genérica que leva a ficha até o system prompt do agente
// em runtime: `blocoDeRegrasParaPrompt` lê o trecho entre os marcadores
// `REGRAS-DO-CARGO` e o injeta em `adaptador-de-ia.ts`. Ela vale para as 81
// funções e não precisa de código novo para nenhuma.
//
// Das 81 fichas, **uma** tinha os marcadores. A fiação existia, era genérica, e
// estava vazia — então toda regra escrita numa ficha de design era invisível
// para quem executa. É a forma mais cara de ilusão que este repositório pode
// ter: documentação revisada, versionada e sem efeito nenhum.
//
// ─── POR QUE ELE TEM AS DUAS METADES ────────────────────────────────────────
//
// Os dois primeiros casos provam que a régua CHEGA. O terceiro prova que o teste
// sabe distinguir — cargo sem marcadores continua devolvendo vazio. Sem ele, um
// `blocoDeRegrasParaPrompt` que passasse a devolver o mesmo texto para todo
// mundo deixaria os outros verdes sem significar mais nada.

import { describe, it, expect } from "vitest";
import { blocoDeRegrasParaPrompt } from "@/lib/agency/catalogo-v2/regras-da-ficha";

const DESIGN = [
  "graphic-designer",
  "creative-director",
  "motion-designer",
  "video-editor",
  "adaptation-and-resizing",
  "creative-library",
  "manager-design",
];

describe("a régua de qualidade visual chega no agente", () => {
  it("as 7 fichas de design entregam bloco não-vazio ao prompt", () => {
    for (const cargo of DESIGN) {
      const bloco = blocoDeRegrasParaPrompt(cargo);
      expect(
        bloco.length,
        `${cargo}: bloco vazio — a ficha NÃO chega ao agente, e a régua é decoração`,
      ).toBeGreaterThan(500);
    }
  });

  it("a regra dura e a primeira trava viajam inteiras", () => {
    // Não é busca de palavra por gosto: estas duas frases são o que separa uma
    // régua conferível de um pedido de bom gosto. Se sumirem do texto que chega
    // ao agente, o resto do bloco não sustenta nada sozinho.
    for (const cargo of DESIGN) {
      const bloco = blocoDeRegrasParaPrompt(cargo);
      expect(bloco, `${cargo}: sem a regra dura de olhar a própria peça`).toContain(
        "Peça não vista não é entregue",
      );
      expect(bloco, `${cargo}: sem a trava das duas famílias tipográficas`).toContain(
        "DUAS famílias tipográficas",
      );
    }
  });

  it("cargo sem marcadores continua devolvendo vazio", () => {
    // A metade que prova que os casos acima não passam por acidente.
    expect(blocoDeRegrasParaPrompt("brand-architect")).toBe("");
  });
});
