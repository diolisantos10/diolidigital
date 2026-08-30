// O LINK DO PARCEIRO TEM DE CHEGAR AO SERVIDOR — a oitava trava sem fechadura.
//
// ═══ O ACHADO (27/08/2026, antes de entregar o link ao CEO) ════════════════
//
// A rota do SDR já aceitava `convite`, já resolvia o token pelo servidor, já
// conferia a parceria viva e já injetava o bloco que desliga a pergunta da
// verba. Tudo testado, tudo provado por mutação.
//
// E **nada na sala de briefing mandava o campo.** O link `?convite=…` chegava
// ao navegador do parceiro e morria ali. O CEO teria entregado ao Marcos um
// link que não faria absolutamente nada — com a casa inteira achando que faria,
// porque cada metade estava provada em separado.
//
// *A pergunta obrigatória é "quem CHAMA isto?"*, e a resposta era **ninguém**.
// Régua verde sobre o componente errado é pior que régua nenhuma: a régua
// nenhuma deixa a dúvida viva; a verde no lugar errado mata a dúvida e deixa
// o defeito.
//
// ═══ POR QUE ESTE TESTE OLHA O `fetch` ═════════════════════════════════════
//
// Porque o defeito não estava em nenhuma das duas metades — estava no fio entre
// elas. Só um teste que olha o CORPO QUE SAI DA SALA pega isso.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { fetchSdrReply, conviteDaUrl } from "@/components/agency/briefing/PublicBriefingRoom";

const RESPOSTA_OK = {
  ok: true, reply: "Legal! Me conta mais.", scope: {}, estimate: null,
};

let corpos: Record<string, unknown>[] = [];

function comUrl(search: string) {
  vi.stubGlobal("window", { location: { search } } as unknown as Window & typeof globalThis);
}

beforeEach(() => {
  corpos = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    corpos.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(RESPOSTA_OK), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("a leitura do convite na URL", () => {
  it("lê `?convite=` quando ele está lá", () => {
    comUrl("?convite=tok_do_marcos");
    expect(conviteDaUrl()).toBe("tok_do_marcos");
  });

  it("devolve `undefined` sem convite, com convite vazio, ou fora do navegador", () => {
    comUrl("");
    expect(conviteDaUrl()).toBeUndefined();
    comUrl("?convite=");
    expect(conviteDaUrl()).toBeUndefined();
    comUrl("?convite=%20%20");
    expect(conviteDaUrl()).toBeUndefined();
    vi.stubGlobal("window", undefined);
    expect(conviteDaUrl()).toBeUndefined();
  });
});

describe("⚠️ O FIO ENTRE A SALA E O SERVIDOR", () => {
  it("o convite da URL VAI no corpo do turno — o link deixa de morrer no navegador", async () => {
    comUrl("?convite=tok_do_marcos");
    await fetchSdrReply([], "somos um SaaS de CRM que vende para restaurantes", {
      objectives: [], wantsSocialMedia: false,
    }, "sess_1");

    expect(corpos).toHaveLength(1);
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ───────────────────────────────────
    // Tire `convite: conviteDaUrl()` do corpo e a linha fica VERMELHA. Era
    // exatamente esse o estado do código: rota pronta, sala calada, link morto.
    expect(corpos[0]!.convite).toBe("tok_do_marcos");
  });

  it("SEM convite na URL, o campo não vai — e o visitante segue anônimo", async () => {
    comUrl("");
    await fetchSdrReply([], "oi", { objectives: [], wantsSocialMedia: false }, "sess_2");
    expect(corpos[0]!.convite).toBeUndefined();
  });

  it("o convite viaja em TODO turno, não só no primeiro", async () => {
    // Se ele fosse guardado em estado da sala, um recarregamento no meio da
    // conversa transformaria o parceiro em visitante comum na metade do
    // briefing — e a verba voltaria a ser perguntada do nada.
    comUrl("?convite=tok_do_marcos");
    const escopo = { objectives: [], wantsSocialMedia: false };
    await fetchSdrReply([], "primeiro", escopo, "sess_3");
    await fetchSdrReply([], "segundo", escopo, "sess_3");
    await fetchSdrReply([], "terceiro", escopo, "sess_3");
    expect(corpos.map((c) => c.convite)).toEqual(
      ["tok_do_marcos", "tok_do_marcos", "tok_do_marcos"],
    );
  });
});
