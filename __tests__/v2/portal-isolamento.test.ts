// O GATE DO MARCO 5 — isolamento entre organizações, provado à exaustão.
//
// Cenário 11 do 07-CRITERIOS: "usuário tenta acessar outro cliente alterando
// URL/ID e recebe negação". A posse é a mesma função que a rota usa
// (`pertenceAoToken`) — testar aqui É testar a rota, porque não existe segundo
// caminho de decisão de posse.

import { describe, it, expect } from "vitest";
import { pertenceAoToken } from "@/lib/agency/portal/posse-da-aprovacao";

const APROVACAO_DO_CLIENTE_A = {
  clientRequestId: "req-a",
  clientId: "cliente-a",
  clientRequestClientId: "cliente-a",
};

describe("pertenceAoToken — o isolamento do portal", () => {
  it("token da solicitação certa: pertence", () => {
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, { clientRequestId: "req-a", clientId: null }, null)).toBe(true);
  });

  it("token do cliente certo (cliente direto, sem solicitação): pertence", () => {
    expect(pertenceAoToken(
      { clientRequestId: null, clientId: "cliente-a", clientRequestClientId: null },
      { clientRequestId: null, clientId: "cliente-a" },
      null,
    )).toBe(true);
  });

  it("token cujo cliente vem da PRÓPRIA solicitação: pertence", () => {
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, { clientRequestId: "req-outra-do-mesmo", clientId: null }, "cliente-a")).toBe(true);
  });

  it("CENÁRIO 11: o cliente B troca o id na requisição — NEGADO", () => {
    const tokenDoClienteB = { clientRequestId: "req-b", clientId: "cliente-b" };
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, tokenDoClienteB, null)).toBe(false);
  });

  it("token de solicitação alheia sem cliente derivado — NEGADO", () => {
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, { clientRequestId: "req-b", clientId: null }, null)).toBe(false);
  });

  it("token de solicitação alheia CUJO cliente derivado é outro — NEGADO", () => {
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, { clientRequestId: "req-b", clientId: null }, "cliente-b")).toBe(false);
  });

  it("aprovação órfã (sem dono nenhum) não pertence a ninguém — fail-closed", () => {
    const orfa = { clientRequestId: null, clientId: null, clientRequestClientId: null };
    expect(pertenceAoToken(orfa, { clientRequestId: "req-a", clientId: "cliente-a" }, null)).toBe(false);
  });

  it("token vazio não alcança nada", () => {
    expect(pertenceAoToken(APROVACAO_DO_CLIENTE_A, { clientRequestId: null, clientId: null }, null)).toBe(false);
  });
});
