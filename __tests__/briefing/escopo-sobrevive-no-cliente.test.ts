// A METADE CLIENTE DO CONSERTO DE 16/08.
//
// O servidor (`app/api/sdr/chat/route.ts`) passou a devolver `scope` mesmo com
// `ok: false`, quando a fala foi barrada mas o escopo sobreviveu. Sem este
// arquivo, essa metade do trabalho fica só no papel: o consumidor real
// (`PublicBriefingRoom.tsx`) jogava a resposta inteira fora sempre que
// `data.ok` era falso — `if (!data.ok || ...) return null;` — e o número que
// o cliente falou uma vez (os R$ 500/mês, os 2 posts por dia) se perdia de
// novo, agora no cliente em vez do servidor.
//
// Este teste chama a função de verdade — não lê o arquivo como texto — porque
// é lógica, e lógica se prova rodando, não citando.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSdrReply, mergeScopeGaps } from "@/components/agency/briefing/PublicBriefingRoom";
import { emptyScope } from "@/lib/agency/briefing-conversation";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSdrReply — ok:false não é mais 'nada aproveitável'", () => {
  it("fala barrada com scope recuperado: reply vem null, scope vem preenchido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: false,
          reason: "truncado",
          scope: { budgetRange: "entre R$ 150 e R$ 500", social: { postsPerWeek: 14 } },
        }),
      })),
    );

    const resultado = await fetchSdrReply([], "quero 2 posts por dia, uns R$ 500 por mês", emptyScope(), "s1");

    // null é a fala barrada, não "nada chegou" — a diferença é o que o
    // chamador faz: cair no motor de regras para a FALA, mas ainda aplicar
    // o scope.
    expect(resultado).not.toBeNull();
    expect(resultado?.reply).toBeNull();
    expect(resultado?.scope.budgetRange).toBe("entre R$ 150 e R$ 500");
    expect((resultado?.scope.social as Record<string, unknown>).postsPerWeek).toBe(14);
  });

  it("ok:false SEM scope nenhum: nada aproveitável, cai no fallback inteiro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, reason: "malformado" }) })),
    );

    const resultado = await fetchSdrReply([], "oi", emptyScope(), "s2");
    expect(resultado).toBeNull();
  });

  it("ok:true continua devolvendo a fala normalmente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, reply: "Oi! Me conta mais.", scope: { businessName: "City Jobs" } }),
      })),
    );

    const resultado = await fetchSdrReply([], "oi, sou da City Jobs", emptyScope(), "s3");
    expect(resultado?.reply).toBe("Oi! Me conta mais.");
    expect(resultado?.scope.businessName).toBe("City Jobs");
  });

  it("falha de rede: null, como sempre — é o motor de regras que responde", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const resultado = await fetchSdrReply([], "oi", emptyScope(), "s4");
    expect(resultado).toBeNull();
  });
});

describe("mergeScopeGaps — o escopo recuperado entra por gap-fill, nunca por cima do confirmado", () => {
  it("preenche budgetRange e volume de posts quando o scope local ainda não tem", () => {
    const base = emptyScope();
    const patch = { budgetRange: "entre R$ 150 e R$ 500", social: { postsPerWeek: 14 } };

    const merged = mergeScopeGaps(base, patch);

    expect(merged.budgetRange).toBe("entre R$ 150 e R$ 500");
    // O gap-fill de social é inferido pelo conteúdo — postsPerWeek presente
    // já basta para marcar wantsSocialMedia, é o que faz a estimativa calcular
    // em cima do que o cliente pediu.
    expect(merged.wantsSocialMedia).toBe(true);
    expect(merged.social?.postsPerWeek).toBe(14);
  });

  it("NÃO sobrescreve um budgetRange que o motor de regras já tinha confirmado", () => {
    const base = { ...emptyScope(), budgetRange: "acima de R$ 5.000" };
    const merged = mergeScopeGaps(base, { budgetRange: "até R$ 150" });
    expect(merged.budgetRange).toBe("acima de R$ 5.000");
  });
});
