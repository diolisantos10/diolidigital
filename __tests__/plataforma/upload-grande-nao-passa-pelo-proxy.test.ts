// UPLOAD GRANDE NÃO PASSA PELO PROXY (04/10/2026).
//
// O brand book da Santioh (23,8 MB) voltava 400 "Envio inválido" com o teto
// da rota em 120 MB. Causa medida: no Next 16, o pedido que passa pelo proxy
// tem o corpo guardado em memória com teto de 10 MB e chega CORTADO à rota.
// O proxy não age em `/api` (PUBLIC_PATHS), então `/api` saiu do matcher.
// Reproduzido no servidor local: 24 MB → 400 sem o conserto, 201 com ele.

import { describe, it, expect } from "vitest";
import { config } from "@/proxy";

const casa = (caminho: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(caminho));

describe("o matcher do proxy", () => {
  it("NÃO pega /api — upload de material de marca não é cortado em 10 MB", () => {
    expect(casa("/api/media")).toBe(false);
    expect(casa("/api/agency/clients/x/ficha-unica")).toBe(false);
  });

  it("a outra metade: as telas da agência continuam guardadas pelo proxy", () => {
    expect(casa("/agency/clients/abc")).toBe(true);
    expect(casa("/agency")).toBe(true);
    expect(casa("/portal/access/tok")).toBe(true);
  });
});
