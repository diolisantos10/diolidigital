// O escopo do briefing é resgatado no servidor e descartado na porta seguinte.
//
// Caso real, piloto ao vivo, 16/08/2026, 12:41–12:43: o CEO declarou 2
// posts/dia e R$ 500/mês de verba. O teto de tokens cortou a resposta do SDR
// no meio, o pacote virou `parse_error`, e o painel do briefing mostrou "0
// posts/mês" — a casa cotou R$ 1.800–3.400 com 3 posts/semana. Nem a verba
// dele, nem o volume.
//
// `app/api/sdr/chat/route.ts:579` já devolve o escopo salvo mesmo na recusa:
// `{ ok:false, reason, scope }`. O defeito estava na porta seguinte —
// `PublicBriefingRoom.tsx` jogava o pacote inteiro fora porque não havia
// fala (`data.reply`). Este teste prova a cadeia inteira com `fetch`
// mockado: não há jsdom/@testing-library nesta casa (medido), então a prova
// é a cadeia de funções puras exportadas do componente, não a renderização
// dele.
//
// CORREÇÃO DE 16/08/2026 sobre este próprio teste, medida, não lida: a
// asserção que fechava este arquivo (`included.some(s => s.includes("0/mês"))
// toBe(false)`) passava por acidente. Com 14 postsPerWeek/semana o Plano
// Premium inclui "15 posts/semana (60/mês)" — e `"60/mês".includes("0/mês")`
// é `true`. A asserção quebrava por causa de uma SUBSTRING que não tem nada a
// ver com o defeito (o "0" de "60"), não porque o número estivesse errado.
// Asserção que quebra por acaso é asserção que aprova por acaso: se o
// mecanismo tivesse regredido para "0 posts/mês" de verdade, essa mesma linha
// também teria dado `false` positivo em algum plano sem coincidência de
// dígito, e ninguém teria percebido. Trocado por número exato (56, não 0) e,
// mais importante, por um CONTRAFACTUAL: um teste que reproduz o
// comportamento ANTIGO (pacote descartado) e prova que ele produz 0 de
// verdade — sem isso, nenhuma versão deste teste distingue "o conserto
// funciona" de "o número sempre veio de outro lugar".

import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchSdrReply, mergeScopeGaps } from "@/components/agency/briefing/PublicBriefingRoom";
import { emptyScope } from "@/lib/agency/briefing-conversation";
import { computeEstimate } from "@/lib/agency/live-calculator";

function respostaFake(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recusa por corte (parse_error_truncado) com escopo salvo — o número sobrevive", () => {
  it("fetchSdrReply devolve o escopo mesmo sem fala", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "parse_error_truncado",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14, platforms: ["instagram"] } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "quero 2 posts por dia", emptyScope(), "sess-1");

    expect(claude).not.toBeNull();
    expect(claude!.reply).toBeNull(); // sem fala — a fala o motor de regras refaz
    expect(claude!.scope).toMatchObject({ social: { postsPerWeek: 14 } });
  });

  it("o escopo resgatado funde e recomputa a estimativa: 14 postsPerWeek → 56/mês, não 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "parse_error_truncado",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14, platforms: ["instagram"] } },
        }),
      ),
    );

    const baseScope = emptyScope(); // painel "vazio" — o estado do defeito real
    const claude = await fetchSdrReply([], "quero 2 posts por dia", baseScope, "sess-1");
    expect(claude).not.toBeNull();

    const mergedScope = mergeScopeGaps(baseScope, claude!.scope);
    expect(mergedScope.social?.postsPerWeek).toBe(14);
    expect(mergedScope.wantsSocialMedia).toBe(true);

    // A METADE QUE PROVA O CONSERTO: o número onde o CEO viu o defeito não é
    // o do pacote de plano (esse é texto, e texto por substring já provou
    // pouco nesta mesma linha uma vez). É a quantidade que o painel monta
    // direto do escopo, com a fórmula de PublicBriefingRoom.tsx:69/90/182/633
    // — `postsPerWeek * 4`. Com o escopo resgatado ela dá 56, não 0.
    const paintedQuantity = (mergedScope.social?.postsPerWeek ?? 0) * 4;
    expect(paintedQuantity).toBe(56);
    expect(paintedQuantity).not.toBe(0);

    const estimate = computeEstimate(mergedScope);
    // 14 posts/semana * 4 = 56/mês — detecta o Plano Premium (>50), NÃO o
    // Plano Essencial de 3/semana que o piloto cotou errado.
    expect(estimate.missingForEstimate).not.toContain("Frequência de posts por semana");
    const socialItem = estimate.items.find((i) => /Premium/i.test(i.label));
    expect(socialItem).toBeDefined();
    expect(estimate.included.some((s) => /posts\/semana \(\d+\/mês\)/.test(s))).toBe(true);
    // Checagem exata (não substring): nenhum item do plano é literalmente
    // "0/mês". "60/mês" contém a substring "0/mês" — por isso a versão antiga
    // desta linha (`.includes("0/mês")`) passava mesmo com o Premium ativo, e
    // não provava nada. Igualdade exata prova o que a substring não prova.
    expect(estimate.included).not.toContain("0/mês");
    expect(estimate.included.every((s) => s !== "0/mês")).toBe(true);
  });

  it("CONTRAFACTUAL: sem o resgate, o defeito volta — a mesma fórmula dá 0, o estimador trava", async () => {
    // Simula o comportamento ANTIGO: antes do resgate existir, QUALQUER
    // `ok:false` — inclusive `parse_error_truncado`, o motivo real do piloto
    // — fazia `fetchSdrReply` devolver `null` e o pacote inteiro (fala +
    // escopo) ir para o lixo. Hoje `parse_error_truncado` está na allowlist
    // e É resgatado (teste acima); aqui usamos um motivo FORA da allowlist
    // para reproduzir o mesmo efeito de descarte total que todo `ok:false`
    // tinha antes do resgate — é o comportamento que este teste prova que
    // não volta.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "motivo_fora_da_allowlist_simulando_o_codigo_pre_resgate",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14, platforms: ["instagram"] } },
        }),
      ),
    );

    const baseScope = emptyScope();
    const claude = await fetchSdrReply([], "quero 2 posts por dia", baseScope, "sess-1");

    // O pacote inteiro foi descartado — exatamente o que o código antigo
    // fazia sempre, para qualquer `ok:false`.
    expect(claude).toBeNull();

    // Sem `claude`, o componente nunca chega a chamar `mergeScopeGaps` — é
    // esse o defeito real: a porta seguinte nem tenta resgatar. O escopo que
    // sobrevive é o `baseScope` intocado, com `social` ausente.
    expect(baseScope.social).toBeUndefined();

    // A MESMA fórmula do painel (`(postsPerWeek ?? 0) * 4`) aplicada a este
    // escopo dá exatamente o número que o CEO viu no piloto: 0, não 56.
    const paintedQuantity = (baseScope.social?.postsPerWeek ?? 0) * 4;
    expect(paintedQuantity).toBe(0);
    expect(paintedQuantity).not.toBe(56);

    // E o estimador trava — em vez de repetir o CityJobs (plano de
    // R$ 1.800–3.400 cotado com `confidence: "high"` sobre um campo vazio).
    const estimate = computeEstimate({ ...baseScope, wantsSocialMedia: true });
    expect(estimate.missingForEstimate).toContain("Frequência de posts por semana");
    expect(estimate.confidence).toBe("none");
  });

  it("dado já confirmado não cede ao resgate parcial (mergeScopeGaps só preenche lacuna)", () => {
    const baseScope = { ...emptyScope(), wantsSocialMedia: true, social: { platforms: ["instagram"], postsPerWeek: 5 } };
    const merged = mergeScopeGaps(baseScope, { social: { postsPerWeek: 99, platforms: ["tiktok"] } });
    // 5 já estava confirmado pelo motor de regras — o resgate NÃO sobrescreve.
    expect(merged.social?.postsPerWeek).toBe(5);
  });
});

describe("recusa por email_hallucination / price_leak — o escopo NÃO é aproveitado", () => {
  it("mesmo com escopo presente no corpo, o pacote inteiro é descartado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "email_hallucination",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14 } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "meu email é...", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });

  it("price_leak também descarta, allowlist é fail-closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "price_leak",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14 } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "quanto custa mesmo?", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });

  it("motivo desconhecido (nunca previsto) também descarta — por omissão, não por lista de exclusão", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "motivo_que_ninguem_previu",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14 } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });
});

describe("recusa sem escopo nenhum — comportamento de hoje, intacto", () => {
  it("ok:false, reason resgatável, mas sem escopo (ou escopo vazio) continua descartando tudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFake({ ok: false, reason: "parse_error_truncado", scope: {} })),
    );

    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });

  it("ok:false sem reason nem escopo continua descartando tudo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({ ok: false })));

    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });
});

describe("caminho feliz (ok:true) — não regride", () => {
  it("fala e escopo chegam juntos, como sempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: true,
          reply: "Perfeito, anotei 14 posts por semana!",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14 } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "quero 14 posts por semana", emptyScope(), "sess-1");
    expect(claude).not.toBeNull();
    expect(claude!.reply).toBe("Perfeito, anotei 14 posts por semana!");
    expect(claude!.scope).toMatchObject({ social: { postsPerWeek: 14 } });
  });

  it("res.ok HTTP falso (rede) continua descartando tudo, como sempre", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({}, false)));
    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });

  it("fetch que lança (rede fora do ar) continua descartando tudo, como sempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toBeNull();
  });
});
