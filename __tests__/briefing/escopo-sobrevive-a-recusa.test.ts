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
//
// CORREÇÃO DE 16/08/2026, segunda rodada, medida contra o servidor pós-merge
// `5d806a60` ("Reconcilia TRÊS consertos paralelos"): os fixtures abaixo
// usavam `parse_error_truncado`/`parse_error_formato`, nomes que a rota NÃO
// emite mais — hoje ela emite `truncado`/`malformado` (ver
// `app/api/sdr/chat/route.ts:580` e `:607`). A allowlist do cliente
// (`MOTIVOS_COM_ESCOPO_APROVEITAVEL` em `PublicBriefingRoom.tsx`) e este
// arquivo mockavam a mesma ficção e concordavam entre si — nenhum dos dois
// conferia contra o servidor real, então nada aqui acusava o desalinhamento.
// Trocados para os nomes reais; a trava contra essa mesma deriva acontecer de
// novo, sem quebrar teste nenhum, é
// `__tests__/esteira/allowlist-bate-com-o-servidor.test.ts` — ele chama a
// rota de verdade.
//
// CORREÇÃO DE 16/08/2026, TERCEIRA RODADA — o beco sem saída em silêncio:
// `fetchSdrReply` deixou de devolver `null`/`{reply,scope}` — devolve
// `SdrOutcome`, um `kind` por motivo (`resposta`/`barrado`/`quebrado`/
// `sem_novidade`). O achado do `experiencia`: um `null` achatado não vira
// "sem falha visível" — vira a PRÓXIMA PERGUNTA DO ROTEIRO (motor de regras,
// calculado ANTES da rede), cronologicamente coerente, como se fosse a SDR
// respondendo. Pior que tela em branco: tela em branco a pessoa questiona,
// esta ela acredita. Os testes deste arquivo que mediam `toBeNull()` para
// 429/503/rede foram reescritos para medir o `kind` certo, e ganharam a
// prova que faltava: que `avisoParaResultadoSdr(outcome)` — a função que
// alimenta o estado visível na tela — produz um aviso, não `null`, para os
// dois motivos de erro, com textos que não se misturam.

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  fetchSdrReply,
  mergeScopeGaps,
  avisoParaResultadoSdr,
  TEXTO_AVISO_BARRADO,
  TEXTO_AVISO_QUEBRADO,
} from "@/components/agency/briefing/PublicBriefingRoom";
import { emptyScope } from "@/lib/agency/briefing-conversation";
import { computeEstimate } from "@/lib/agency/live-calculator";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";

function respostaFake(body: unknown, ok = true, status?: number) {
  return {
    ok,
    status: status ?? (ok ? 200 : 500),
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recusa por corte (truncado) com escopo salvo — o número sobrevive", () => {
  it("fetchSdrReply devolve o escopo mesmo sem fala", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "truncado",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14, platforms: ["instagram"] } },
        }),
      ),
    );

    const claude = await fetchSdrReply([], "quero 2 posts por dia", emptyScope(), "sess-1");

    expect(claude.kind).toBe("resposta");
    if (claude.kind !== "resposta") throw new Error("unreachable");
    expect(claude.reply).toBeNull(); // sem fala — a fala o motor de regras refaz
    expect(claude.scope).toMatchObject({ social: { postsPerWeek: 14 } });
  });

  it("o escopo resgatado funde e recomputa a estimativa: 14 postsPerWeek → 56/mês, não 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaFake({
          ok: false,
          reason: "truncado",
          scope: { wantsSocialMedia: true, social: { postsPerWeek: 14, platforms: ["instagram"] } },
        }),
      ),
    );

    const baseScope = emptyScope(); // painel "vazio" — o estado do defeito real
    const claude = await fetchSdrReply([], "quero 2 posts por dia", baseScope, "sess-1");
    expect(claude.kind).toBe("resposta");
    if (claude.kind !== "resposta") throw new Error("unreachable");

    const mergedScope = mergeScopeGaps(baseScope, claude.scope);
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
    // `ok:false` — inclusive `truncado`, o motivo real do piloto — fazia
    // `fetchSdrReply` devolver `null` e o pacote inteiro (fala + escopo) ir
    // para o lixo. Hoje `truncado` está na allowlist e É resgatado (teste
    // acima); aqui usamos um motivo FORA da allowlist para reproduzir o mesmo
    // efeito de descarte total que todo `ok:false` tinha antes do resgate —
    // é o comportamento que este teste prova que não volta.
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
    // fazia sempre, para qualquer `ok:false`. Hoje isso é "sem_novidade": o
    // servidor respondeu 200, só não havia nada aproveitável — não é erro,
    // não gera aviso, mas também não resgata nada.
    expect(claude).toEqual({ kind: "sem_novidade" });

    // Sem `scope` resgatado, o componente nunca chega a chamar `mergeScopeGaps` — é
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
    expect(claude).toEqual({ kind: "sem_novidade" });
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
    expect(claude).toEqual({ kind: "sem_novidade" });
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
    expect(claude).toEqual({ kind: "sem_novidade" });
  });
});

describe("recusa sem escopo nenhum — comportamento de hoje, intacto", () => {
  it("ok:false, reason resgatável, mas sem escopo (ou escopo vazio) continua descartando tudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFake({ ok: false, reason: "truncado", scope: {} })),
    );

    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toEqual({ kind: "sem_novidade" });
  });

  it("ok:false sem reason nem escopo continua descartando tudo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({ ok: false })));

    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toEqual({ kind: "sem_novidade" });
  });
});

describe("caminho feliz (ok:true) — não regride, e SEM aviso nenhum", () => {
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
    expect(claude.kind).toBe("resposta");
    if (claude.kind !== "resposta") throw new Error("unreachable");
    expect(claude.reply).toBe("Perfeito, anotei 14 posts por semana!");
    expect(claude.scope).toMatchObject({ social: { postsPerWeek: 14 } });

    // A METADE MAIS FÁCIL DE QUEBRAR (mandado pela ficha): sem erro, nenhum
    // aviso aparece. Se alguém trocar o `if` por um `switch` desatento e
    // vazar um `default` que produz aviso, este teste acusa.
    expect(avisoParaResultadoSdr(claude)).toBeNull();
  });

  it("res.ok HTTP falso, status genérico (não 429): 'quebrado', não mais um `null` sem motivo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({}, false, 500)));
    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toEqual({ kind: "quebrado" });
  });

  it("fetch que lança (rede fora do ar): 'quebrado' — mesma família do 503, o SISTEMA falhou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const claude = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(claude).toEqual({ kind: "quebrado" });
  });
});

// ── TERCEIRO BECO SEM SAÍDA EM SILÊNCIO (16/08) ─────────────────────────────
//
// O achado do `experiencia`: `if (!res.ok) return null;` não produzia "sem
// aviso" — produzia um aviso FALSO. A pessoa não via uma falha; via a
// próxima pergunta do roteiro (motor de regras, calculado ANTES da rede,
// cronologicamente coerente) e ACREDITAVA que era a SDR respondendo. Pior
// que tela em branco.
//
// Os dois blocos abaixo provam as DUAS METADES exigidas pela ficha:
//   1. o `kind` certo sai da rede (429 → barrado, 503/rede → quebrado);
//   2. esse `kind` PRODUZ um aviso de verdade (`avisoParaResultadoSdr`), não
//      só um valor diferente por baixo do pano — é essa função que alimenta
//      o estado visível na tela (`avisoConversa` em `PublicBriefingRoom`).

describe("barrado (429) — recusado por limite, não por falha do sistema", () => {
  it("fetchSdrReply distingue 429 de qualquer outro status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({ error: "Muitas requisições em pouco tempo." }, false, 429)));
    const outcome = await fetchSdrReply([], "quero 2 posts por dia", emptyScope(), "sess-1");
    expect(outcome).toEqual({ kind: "barrado" });
  });

  it("o aviso produzido é o texto de ESPERA, exatamente o combinado — sem código de erro, sem contagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaFake({}, false, 429)));
    const barrado = await fetchSdrReply([], "x", emptyScope(), "sess-1");

    const aviso = avisoParaResultadoSdr(barrado);
    // NENHUM DOS DOIS SOME EM SILÊNCIO: é um objeto de verdade, não `null`.
    expect(aviso).not.toBeNull();
    expect(aviso?.tipo).toBe("barrado");
    expect(aviso?.texto).toBe(TEXTO_AVISO_BARRADO);
    expect(aviso?.texto).toBe(
      "Você está mandando mensagens rápido demais. Espere alguns segundos e continue — sua conversa não foi perdida.",
    );
    // Sem código de erro nem número de segundos assustador na tela.
    expect(aviso?.texto).not.toMatch(/429/);
    expect(aviso?.texto).not.toMatch(/\d+\s*segundos?/i);
  });

  it("escopo já capturado antes do barramento NÃO se perde — o motor de regras roda independente da rede", () => {
    // Simula uma conversa que JÁ tinha confirmado volume numa pergunta
    // estruturada anterior (o jeito real do motor de regras capturar
    // `postsPerWeek`, ver `question-engine.ts`) — o estado que chega ao
    // turno seguinte, o que seria barrado por 429.
    const estadoComScopeConfirmado = {
      conv: {
        ...initProspectConvState().conv,
        scope: { ...emptyScope(), wantsSocialMedia: true, social: { platforms: ["instagram"], postsPerWeek: 14 } },
        isFirstMessage: false,
      },
      sdr: initProspectConvState().sdr,
    };

    // `processProspectMessage` — a linha de base que roda ANTES da rede
    // (comentário original: ":1337") — é chamada com o estado anterior como
    // ponto de partida, exatamente como `runTurn` faz. O resultado carrega o
    // scope confirmado adiante, e é ESTE resultado (`ruleResult`) que o
    // componente aplica quando o outcome da rede é "barrado" — nunca um
    // scope vazio, porque a rede nunca participou desse cálculo.
    const ruleResult = processProspectMessage("mais alguma coisa", estadoComScopeConfirmado, []);

    expect(ruleResult.conv.scope.social?.postsPerWeek).toBe(14);
    expect(ruleResult.conv.scope.wantsSocialMedia).toBe(true);
  });
});

describe("quebrado (503 / erro de rede) — o SISTEMA falhou, fato oposto ao barrado", () => {
  it("503 produz 'quebrado', com o aviso de sistema fora do ar — texto diferente do de limite", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respostaFake({ error: "Serviço temporariamente indisponível." }, false, 503)),
    );
    const quebrado = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(quebrado).toEqual({ kind: "quebrado" });

    const aviso = avisoParaResultadoSdr(quebrado);
    expect(aviso).not.toBeNull();
    expect(aviso?.tipo).toBe("quebrado");
    expect(aviso?.texto).toBe(TEXTO_AVISO_QUEBRADO);
    expect(aviso?.texto).not.toMatch(/503/);

    // Os dois avisos NUNCA são a mesma frase — são fatos opostos (ritmo da
    // pessoa vs. falha do sistema) e não podem se misturar.
    expect(aviso?.texto).not.toBe(TEXTO_AVISO_BARRADO);
  });

  it("erro de rede (fetch lança) produz o MESMO aviso que 503 — mesma família de falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const quebrado = await fetchSdrReply([], "x", emptyScope(), "sess-1");
    expect(avisoParaResultadoSdr(quebrado)?.texto).toBe(TEXTO_AVISO_QUEBRADO);
  });
});

describe("sem_novidade — não é erro, não gera aviso nenhum", () => {
  it("avisoParaResultadoSdr devolve null para sem_novidade, igual ao caminho feliz", () => {
    expect(avisoParaResultadoSdr({ kind: "sem_novidade" })).toBeNull();
  });
});
