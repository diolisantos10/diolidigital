// A RÉGUA DO ESPAÇAMENTO É UMA SÓ — e este teste é o que impede que vire duas.
//
// `faltaEsperar` nasceu em `lib/agency/esteira/publicacao.ts` (o freio de rajada
// da publicação, 6 peças no mesmo minuto). Em 15/08/2026 duas frentes novas
// passaram a precisar dela — as avaliações do Google e o guardião de verba — e
// ela foi para `lib/agency/esteira/ritmo.ts`.
//
// ⚠️ O certo seria `publicacao.ts` importar de lá e o repositório ter UMA
//    implementação. Não foi feito porque aquele arquivo está sob ordem explícita
//    de não ser tocado nesta rodada (parecer do especialista `meta` sobre a
//    publicação orgânica). Duas cópias da mesma regra é o defeito nº 2 do
//    incidente do Drive — então, enquanto a unificação não acontece, é ESTE
//    teste que segura a ponte: as duas têm de responder igual, sempre.

import { describe, it, expect, vi } from "vitest";

// A publicação carrega um grafo grande (Meta, mídia, marca). Os mocks abaixo
// existem só para o módulo poder ser importado — nada aqui exercita publicação.
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost: vi.fn() }));
vi.mock("@/lib/integrations/meta/connections", () => ({ conexaoDoCliente: vi.fn() }));
vi.mock("@/lib/agency/esteira/contrato-de-marca", () => ({ contratoDeMarca: vi.fn() }));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  caminhoPublicoAssinado: (id: string) => `/api/media/${id}`,
}));

import { faltaEsperar as daPublicacao, INTERVALO_MINIMO_POR_PERFIL_MS } from "@/lib/agency/esteira/publicacao";
import { faltaEsperar as compartilhada } from "@/lib/agency/esteira/ritmo";

const AGORA = new Date("2026-08-15T12:00:00Z");

/** Os casos que importam, incluindo as duas bordas fail-closed. */
const CASOS: Array<[string, Date | null | undefined]> = [
  ["nunca aconteceu (null)", null],
  ["nunca aconteceu (undefined)", undefined],
  ["data inválida", new Date("não é data")],
  ["acabou de acontecer", AGORA],
  ["1 minuto atrás", new Date(AGORA.getTime() - 60_000)],
  ["exatamente no intervalo", new Date(AGORA.getTime() - INTERVALO_MINIMO_POR_PERFIL_MS)],
  ["1 ms antes do intervalo", new Date(AGORA.getTime() - INTERVALO_MINIMO_POR_PERFIL_MS + 1)],
  ["muito tempo atrás", new Date(AGORA.getTime() - 10 * INTERVALO_MINIMO_POR_PERFIL_MS)],
  ["NO FUTURO (relógio torto)", new Date(AGORA.getTime() + 3_600_000)],
];

describe("as duas cópias da régua respondem IGUAL", () => {
  for (const [nome, ultima] of CASOS) {
    it(nome, () => {
      expect(
        compartilhada(ultima, AGORA, INTERVALO_MINIMO_POR_PERFIL_MS),
        "a cópia divergiu da régua original — duas verdades sobre a mesma regra",
      ).toBe(daPublicacao(ultima, AGORA, INTERVALO_MINIMO_POR_PERFIL_MS));
    });
  }

  it("e as duas bordas fail-closed continuam de pé na cópia", () => {
    // Data no futuro conta como "acabou de acontecer": o freio erra para o lado
    // seguro. Nunca ter acontecido é `0` — e é diferente de "não consegui
    // medir", que é decisão do chamador, nunca desta função.
    expect(compartilhada(new Date(AGORA.getTime() + 1), AGORA, 1000)).toBe(1000);
    expect(compartilhada(null, AGORA, 1000)).toBe(0);
  });
});
