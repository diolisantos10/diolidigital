// A trava da regra: nenhum provedor entra na camada sem declarar como garante
// formato. Silêncio é a única resposta proibida.
//
// Por que este teste existe, e não só o `Record` do compilador: o compilador
// cobra a CHAVE presente. Ele aceita `{ tipo: "nenhuma", porque: "" }` — que é
// exatamente a omissão que este arquivo existe para impedir, só que disfarçada
// de declaração. Quem acrescenta um provedor tem de escrever o MOTIVO.
//
// É o mesmo padrão do `enforceFrequency`: obrigar quem escreve o próximo
// caminho a responder a pergunta, em vez de herdar a resposta em silêncio.

import { describe, it, expect } from "vitest";
import { ALL_PROVIDERS } from "@/lib/ai/resolve-key";
import {
  GARANTIA_DE_FORMATO,
  provedoresComTravaDeFormato,
  comoGaranteOFormato,
} from "@/lib/ai/formato-garantido";

describe("todo provedor declara como garante o formato", () => {
  it("nenhum provedor de ALL_PROVIDERS fica de fora", () => {
    for (const p of ALL_PROVIDERS) {
      expect(GARANTIA_DE_FORMATO[p], `provedor "${p}" entrou na camada sem declarar formato`).toBeDefined();
    }
    // E o contrário também: nada declarado que não seja provedor de verdade.
    expect(Object.keys(GARANTIA_DE_FORMATO).sort()).toEqual([...ALL_PROVIDERS].sort());
  });

  it("todo provedor escreve o PORQUÊ, e não um porquê de fachada", () => {
    for (const p of ALL_PROVIDERS) {
      const g = GARANTIA_DE_FORMATO[p];
      expect(g.porque.trim().length, `"${p}" declarou sem explicar por quê`).toBeGreaterThan(40);
    }
  });

  it("quem diz que garante tem de nomear O MECANISMO — 'garanto' sozinho não é resposta", () => {
    for (const p of ALL_PROVIDERS) {
      const g = GARANTIA_DE_FORMATO[p];
      if (g.tipo === "nenhuma") continue;
      expect(g.mecanismo.trim().length, `"${p}" diz que garante e não diz como`).toBeGreaterThan(10);
    }
  });

  // ── O ACHADO DE 24/08/2026 ────────────────────────────────────────────────
  // O Claude era o único provedor sem trava E sem declaração — a pior das três
  // posições, porque parecia coberto. 10 de 16 turnos do SDR vinham em prosa.
  it("o Claude tem trava de formato — foi o furo que custou 10 de 16 turnos", () => {
    expect(GARANTIA_DE_FORMATO.claude.tipo).not.toBe("nenhuma");
  });

  it("a Perplexity segue declarada como SEM trava — e isso é resposta, não omissão", () => {
    const g = GARANTIA_DE_FORMATO.perplexity;
    expect(g.tipo).toBe("nenhuma");
    expect(g.porque).toMatch(/400|response_format/i);
  });

  it("provedoresComTravaDeFormato não devolve quem não garante", () => {
    expect(provedoresComTravaDeFormato()).not.toContain("perplexity");
    expect(provedoresComTravaDeFormato()).toContain("claude");
  });

  it("quem não garante APARECE dizendo o que não garante — nunca em silêncio", () => {
    expect(comoGaranteOFormato("perplexity")).toMatch(/sem trava de formato/);
    expect(comoGaranteOFormato("claude")).toMatch(/tool_choice/);
  });
});
