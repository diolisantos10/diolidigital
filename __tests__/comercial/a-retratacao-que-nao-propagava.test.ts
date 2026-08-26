// A RETRATAÇÃO QUE NÃO PROPAGAVA — 8ª volta do cliente oculto, 26/08/2026.
//
// O cliente escreveu "esquece o WhatsApp, prefiro e-mail". O turno seguinte do
// SDR já não trazia `prospectPhone` — e o número reapareceu inteiro em
// `briefingJson.scope.prospectPhone` e em `contato.whatsapp` na solicitação
// gravada. Ouvir não bastava: nenhuma das três memórias da conversa sabia
// apagar. Ver `lib/agency/comercial/retratacao.ts`.

import { describe, it, expect } from "vitest";
import {
  canaisRetratados,
  escopoComRetratacao,
  canalFoiRetratado,
} from "@/lib/agency/comercial/retratacao";

describe("a fala que desdiz", () => {
  it("lê a fala MEDIDA em produção", () => {
    expect(canaisRetratados("esquece o WhatsApp, prefiro e-mail")).toEqual(["whatsapp"]);
  });

  it("lê as outras formas de desdizer o mesmo canal", () => {
    for (const fala of [
      "Não usem o meu WhatsApp, por favor.",
      "pode tirar o meu telefone do cadastro",
      "Deixa pra lá o zap — me manda por e-mail.",
      "cancela o wpp",
      "apaga o meu número",
    ]) {
      expect(canaisRetratados(fala), fala).toContain("whatsapp");
    }
  });

  it("PREFERÊNCIA NÃO É RETRATAÇÃO — 'prefiro e-mail' sozinho não apaga telefone", () => {
    expect(canaisRetratados("prefiro e-mail")).toEqual([]);
    expect(canaisRetratados("pode ser por e-mail mesmo")).toEqual([]);
  });

  it("a janela é a FRASE — negar outra coisa e citar o canal na sequência não retrata", () => {
    // Sem a janela, esta fala apagaria o número que o cliente acabou de dar.
    expect(canaisRetratados("Não quero anúncio pago agora; pode falar comigo no WhatsApp.")).toEqual([]);
    expect(canaisRetratados("Não precisa de vídeo. Meu WhatsApp é (11) 99999-0000.")).toEqual([]);
  });

  it("não inventa retratação em fala sem verbo nem canal", () => {
    for (const fala of ["", "   ", "Bom dia!", "Entre R$ 500 e R$ 1.500.", "meu whatsapp é 11999990000"]) {
      expect(canaisRetratados(fala), fala).toEqual([]);
    }
    expect(canaisRetratados(null)).toEqual([]);
    expect(canaisRetratados({ fala: "esquece o whatsapp" })).toEqual([]);
  });
});

describe("o escopo depois da retratação", () => {
  it("derruba o campo do canal e diz por onde falar no lugar", () => {
    const antes = { prospectPhone: "11999990000", businessName: "GRAO DO BECO NOME TESTE" };
    const depois = escopoComRetratacao(antes, "esquece o WhatsApp, prefiro e-mail");
    expect(depois.prospectPhone).toBeUndefined();
    expect(depois.preferredChannel).toBe("email");
    expect(depois.canaisRetratados).toEqual(["whatsapp"]);
    // Nada mais foi tocado: retratar um canal não é apagar o pedido.
    expect(depois.businessName).toBe("GRAO DO BECO NOME TESTE");
  });

  it("A MARCA ATRAVESSA OS TURNOS — o número não volta quando o modelo reenvia o escopo", () => {
    const turno1 = escopoComRetratacao({ prospectPhone: "11999990000" }, "esquece o WhatsApp");
    // O turno seguinte: o escopo acumulado do modelo traz o número DE NOVO, e a
    // fala do cliente não fala de canal nenhum. É exatamente o caminho pelo qual
    // ele reapareceu em produção.
    const turno2 = escopoComRetratacao({ ...turno1, prospectPhone: "11999990000" }, "abro das 8 às 18");
    expect(turno2.prospectPhone).toBeUndefined();
    expect(canalFoiRetratado(turno2, "whatsapp")).toBe(true);
  });

  it("sem retratação nenhuma, o escopo passa intacto e SEM marca", () => {
    const e = { prospectPhone: "11999990000", preferredChannel: "whatsapp" };
    expect(escopoComRetratacao(e, "meu whatsapp é esse mesmo")).toEqual(e);
  });

  it("canalFoiRetratado é a pergunta que as três memórias fazem", () => {
    expect(canalFoiRetratado({ canaisRetratados: ["whatsapp"] }, "whatsapp")).toBe(true);
    expect(canalFoiRetratado({ canaisRetratados: ["whatsapp"] }, "email")).toBe(false);
    expect(canalFoiRetratado({}, "whatsapp")).toBe(false);
    expect(canalFoiRetratado(null, "whatsapp")).toBe(false);
    // Lixo vindo do navegador não vira marca.
    expect(canalFoiRetratado({ canaisRetratados: "whatsapp" }, "whatsapp")).toBe(false);
  });
});

// ── AS TRÊS MEMÓRIAS, PROVADAS UMA A UMA ─────────────────────────────────────
//
// O módulo acima é a régua. Estes testes provam que ela está LIGADA nos três
// lugares onde o número reapareceu — porque régua verde sobre o componente
// errado é pior do que régua nenhuma.

import { mergeScopeGaps } from "@/components/agency/briefing/PublicBriefingRoom";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

/** O escopo mínimo que o tipo exige — os campos obrigatórios, e nada mais.
 *  `tsc` barrou este teste antes do commit por causa deles (é a quinta vez que
 *  a régua da casa pega o meu próprio teste): objeto literal parcial não é
 *  `BriefingScope`. */
const escopo = (extra: Partial<BriefingScope>): BriefingScope =>
  ({ objectives: [], wantsSocialMedia: false, ...extra });

describe("memória 2 — o gap-fill do navegador", () => {
  it("APAGA o telefone quando a marca chega no patch (antes ele só preenchia buraco)", () => {
    const base = escopo({ prospectPhone: "11999990000", businessName: "GRAO DO BECO NOME TESTE" });
    const merged = mergeScopeGaps(base, { canaisRetratados: ["whatsapp"] });
    expect(merged.prospectPhone).toBeUndefined();
    expect(merged.businessName).toBe("GRAO DO BECO NOME TESTE");
  });

  it("a marca sobrevive ao turno seguinte, em que o patch não fala de canal", () => {
    const t1 = mergeScopeGaps(escopo({ prospectPhone: "11999990000" }), { canaisRetratados: ["whatsapp"] });
    const t2 = mergeScopeGaps(t1, { prospectPhone: "11999990000", segment: "cafeteria" });
    expect(t2.prospectPhone).toBeUndefined();
    expect(t2.segment).toBe("cafeteria");
  });

  it("sem marca, o gap-fill continua exatamente como era", () => {
    const merged = mergeScopeGaps(escopo({}), { prospectPhone: "11999990000" });
    expect(merged.prospectPhone).toBe("11999990000");
  });
});
