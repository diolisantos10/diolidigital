// A COLUNA GRAVADA E NUNCA LIDA — agora tem leitor (16/08/2026).
//
// Medição do Essencial `qualidade` que abriu esta frente: `chaveDoProspect`
// era calculada e gravada em `createClientRequest`
// (`client-request-service.ts:136,143`) e **nenhum leitor de produção a
// lia** — `agruparPorProspect` recalculava tudo em memória, ignorando a
// coluna por completo.
//
// Este arquivo prova as DUAS METADES da correção:
//
//   1. a coluna, quando presente, VENCE — é o leitor de produção que faltava;
//   2. o recálculo, quando a coluna está nula (linha legada), CONTINUA
//      cobrindo — sem isso, linhas antigas deixariam de se agrupar, e isso
//      seria regressão silenciosa, não limbo resolvido.
//
// `__tests__/comercial/chave-do-prospect.test.ts` já prova o agrupamento PURO
// (sem coluna nenhuma) e a metade "não inventa parentesco" — este arquivo não
// repete aquilo, só a leitura da coluna.

import { describe, it, expect } from "vitest";
import { agruparPorProspect } from "@/lib/agency/comercial/chave-do-prospect";

/** Um briefing como ele chega pelo formulário público, no formato canônico. */
function briefing(contato: { nome?: string; email?: string; whatsapp?: string }) {
  return { briefingJson: { contato: { informadoEm: "2026-08-16T10:00:00.000Z", ...contato } } };
}

const T0 = new Date("2026-08-16T09:00:00.000Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("a coluna vence quando está presente e não vazia", () => {
  it("✅ agrupa pela coluna, procedência \"coluna\", e o recálculo NÃO é usado", () => {
    // O briefing, se recalculado, daria uma chave DIFERENTE da coluna — é
    // assim que o teste prova que quem decide é a coluna, não o texto.
    const g = agruparPorProspect([
      {
        id: "r1",
        createdAt: min(1),
        chaveDoProspect: "email:coluna@fixada.com",
        ...briefing({ email: "outro@recalculo.com" }),
      },
    ]);
    const linha = g.get("r1")!;
    expect(linha.procedencia).toBe("coluna");
    // Duas entradas com a MESMA coluna, mesmo que o recálculo (e-mails
    // diferentes) diria que são pessoas diferentes, casam pela coluna.
    const g2 = agruparPorProspect([
      { id: "a", createdAt: min(1), chaveDoProspect: "email:mesma@chave.com", ...briefing({ email: "a@um.com" }) },
      { id: "b", createdAt: min(2), chaveDoProspect: "email:mesma@chave.com", ...briefing({ email: "b@dois.com" }) },
    ]);
    expect(g2.get("a")!.vezes).toBe(2);
    expect(g2.get("b")!.vezes).toBe(2);
    expect(g2.get("a")!.procedencia).toBe("coluna");
    expect(g2.get("b")!.procedencia).toBe("coluna");
  });
});

describe("sem regressão: linha legada de coluna nula continua agrupando pelo recálculo", () => {
  it("✅ chave NULA cai no recálculo, procedência \"recalculada\" — prova de que não regrediu", () => {
    const cinco = [1, 2, 3].map((n) => ({
      id: `legado-${n}`,
      createdAt: min(n),
      chaveDoProspect: null,
      ...briefing({ nome: "João", email: "joao@email.com" }),
    }));
    const g = agruparPorProspect(cinco);
    for (const n of [1, 2, 3]) {
      expect(g.get(`legado-${n}`)!.vezes).toBe(3);
      expect(g.get(`legado-${n}`)!.procedencia).toBe("recalculada");
    }
  });

  it("✅ ausência do campo (nem sequer enviado) tem o mesmo efeito de null", () => {
    const g = agruparPorProspect([
      { id: "sem-campo-1", createdAt: min(1), ...briefing({ email: "sem-campo@email.com" }) },
      { id: "sem-campo-2", createdAt: min(2), ...briefing({ email: "sem-campo@email.com" }) },
    ]);
    expect(g.get("sem-campo-1")!.vezes).toBe(2);
    expect(g.get("sem-campo-1")!.procedencia).toBe("recalculada");
  });
});

describe("a mistura — o caso que mais importa e o mais fácil de quebrar", () => {
  it("✅ irmãos do mesmo contato caem no mesmo grupo mesmo que só um tenha coluna", () => {
    const g = agruparPorProspect([
      // O 1º chegou antes de a coluna existir: legado, nulo.
      { id: "antigo", createdAt: min(1), chaveDoProspect: null, ...briefing({ email: "camila@beauty.com.br" }) },
      // O 2º já nasceu com a coluna gravada.
      { id: "novo", createdAt: min(2), chaveDoProspect: "email:camila@beauty.com.br", ...briefing({ email: "camila@beauty.com.br" }) },
    ]);
    expect(g.get("antigo")!.vezes).toBe(2);
    expect(g.get("novo")!.vezes).toBe(2);
    expect(g.get("antigo")!.procedencia).toBe("recalculada");
    expect(g.get("novo")!.procedencia).toBe("coluna");
    expect(g.get("antigo")!.irmaos.map((i) => i.id)).toEqual(["novo"]);
    expect(g.get("novo")!.irmaos.map((i) => i.id)).toEqual(["antigo"]);
  });
});

describe("⛔ chave vazia na coluna não é chave válida", () => {
  it("string vazia (\"\") cai no recálculo, não trava o agrupamento com um balde comum", () => {
    const g = agruparPorProspect([
      { id: "vazio-1", createdAt: min(1), chaveDoProspect: "", ...briefing({ email: "vazio@email.com" }) },
      { id: "vazio-2", createdAt: min(2), chaveDoProspect: "   ", ...briefing({ email: "vazio@email.com" }) },
    ]);
    // Continuam se agrupando — mas PELO RECÁLCULO (mesmo e-mail), não porque
    // "" seja uma chave compartilhada.
    expect(g.get("vazio-1")!.vezes).toBe(2);
    expect(g.get("vazio-1")!.procedencia).toBe("recalculada");
    expect(g.get("vazio-2")!.procedencia).toBe("recalculada");

    // A prova de que "" não é chave: dois leads DIFERENTES, ambos com coluna
    // vazia, NÃO se juntam entre si.
    const g2 = agruparPorProspect([
      { id: "d1", createdAt: min(1), chaveDoProspect: "", ...briefing({ email: "um@email.com" }) },
      { id: "d2", createdAt: min(2), chaveDoProspect: "", ...briefing({ email: "dois@email.com" }) },
    ]);
    expect(g2.get("d1")!.vezes).toBe(1);
    expect(g2.get("d2")!.vezes).toBe(1);
  });
});

describe("✅ lead sem canal continua sem chave — nulo não agrupa com nulo", () => {
  it("dois leads sem contato, mesmo ambos com coluna nula, não viram grupo", () => {
    const g = agruparPorProspect([
      { id: "anon-1", createdAt: min(1), chaveDoProspect: null, briefingJson: { scope: { businessName: "Sushi Cazza" } } },
      { id: "anon-2", createdAt: min(2), chaveDoProspect: null, briefingJson: { scope: { businessName: "Sushi Cazza" } } },
    ]);
    expect(g.has("anon-1")).toBe(false);
    expect(g.has("anon-2")).toBe(false);
  });

  it("coluna vazia em lead sem canal também não inventa chave", () => {
    const g = agruparPorProspect([
      { id: "anon-3", createdAt: min(1), chaveDoProspect: "", briefingJson: {} },
    ]);
    expect(g.has("anon-3")).toBe(false);
  });
});
