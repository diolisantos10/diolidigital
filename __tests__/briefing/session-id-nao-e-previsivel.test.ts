// O `sessionId` DEIXA DE SER ADIVINHÁVEL — achado 1 do parecer do `seguranca`
// sobre o freio por `sessionId` (16/08/2026).
//
// Até este conserto, `PublicBriefingRoom.tsx` gerava o `tempClientId` — o
// MESMO valor que vira `sessionId` em `/api/sdr/chat` e chave do freio por
// sessão (`limite-no-banco.ts`) — como `"prospect-" + Date.now()`: um relógio
// em milissegundos, SEM componente aleatório. Quem observasse (ou tentasse
// adivinhar por força bruta, numa janela de poucos segundos) o `Date.now()`
// de um visitante conseguia ACERTAR o `sessionId` de outra pessoa e queimar a
// cota dela — negação de serviço direcionada a um lead.
//
// Este arquivo prova as DUAS metades da definição de pronto do despacho:
//   1. o valor não é mais previsível a partir do relógio — dois ids gerados
//      no MESMO milissegundo (o pior caso para um atacante que já sabe o
//      relógio) ainda assim diferem, com entropia suficiente para inviabilizar
//      força bruta numa janela de segundos;
//   2. o valor SOBREVIVE à higienização de `fioDaConversa` (só
//      `[A-Za-z0-9_-]`, corte em 64) e continua distinto de `"sem-sessao"` —
//      se a higienização mutilasse o id, o freio por sessão perderia
//      identidade e o registro da conversa fragmentaria.

import { describe, it, expect, vi } from "vitest";
import { gerarTempClientId } from "@/components/agency/briefing/PublicBriefingRoom";
import { fioDaConversa } from "@/lib/agency/comercial/registro-da-conversa";

describe("o sessionId gerado não é previsível a partir do relógio", () => {
  it("dois ids gerados no MESMO milissegundo (Date.now travado) ainda assim diferem", () => {
    const relogioTravado = 1_755_000_000_000; // um instante qualquer, fixo
    vi.spyOn(Date, "now").mockReturnValue(relogioTravado);

    const a = gerarTempClientId();
    const b = gerarTempClientId();

    // Se o id fosse só `"prospect-" + Date.now()`, `a` e `b` seriam IDÊNTICOS
    // aqui — é exatamente essa igualdade que tornava o valor adivinhável.
    expect(a).not.toBe(b);

    vi.restoreAllMocks();
  });

  it("o id carrega um componente de alta entropia (UUID), não só o relógio", () => {
    const id = gerarTempClientId();
    // `prospect-<epoch>-<uuid v4>` — o UUID sozinho já inviabiliza a força
    // bruta numa janela de segundos (2^122 combinações).
    expect(id).toMatch(
      /^prospect-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("1000 ids gerados em sequência são todos distintos (sem colisão nem repetição do relógio)", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => gerarTempClientId()));
    expect(ids.size).toBe(1000);
  });
});

describe("o id sobrevive à higienização de fioDaConversa", () => {
  it("nenhum caractere do id é cortado pela higienização — cabe inteiro nos 64", () => {
    const id = gerarTempClientId();
    // `fioDaConversa` só mantém [A-Za-z0-9_-] e corta em 64. O id só usa
    // dígitos, hífen e hex — nenhum caractere é removido — e cabe em 64.
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);

    const fio = fioDaConversa(id);
    expect(fio).toBe(`sdr:${id}`);
  });

  it("o fio resultante NUNCA cai no balde global sdr:sem-sessao", () => {
    for (let i = 0; i < 20; i++) {
      const fio = fioDaConversa(gerarTempClientId());
      expect(fio).not.toBe("sdr:sem-sessao");
    }
  });

  it("o mesmo id produz o MESMO fio em chamadas repetidas — o freio por sessão acumula contagem", () => {
    const id = gerarTempClientId();
    expect(fioDaConversa(id)).toBe(fioDaConversa(id));
  });
});
