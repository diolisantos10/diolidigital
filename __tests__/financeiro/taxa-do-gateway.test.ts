// A TAXA DO MERCADO PAGO — 27/08/2026.
//
// Ordem do CEO: *"A taxa do Mercado Pago entra no custo — o gateway foi ligado
// hoje. Meça; se não conseguir, declare."*
//
// Não deu para medir, e está declarado no cabeçalho de `taxa-do-gateway.ts`.
// Este arquivo prova a coisa que sobra e que é a que protege o negociador: que
// a AUSÊNCIA da medida nunca vira o número zero.
//
// *Margem calculada sobre custo incompleto é pior que margem nenhuma.* Uma taxa
// lida como zero daria ao negociador entre 1 e 5 pontos de margem que não
// existem — e é no piso que esses pontos decidem se a venda dá lucro ou não.

import { describe, it, expect, vi } from "vitest";

const db = vi.hoisted(() => ({ pagamentoConfirmado: { findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { taxaDoPagamento, liquidoDoPagamento, taxaDoGatewayMedida } = await import(
  "@/lib/agency/financeiro/taxa-do-gateway"
);

describe("⛔ nulo é NÃO MEDIDO, nunca taxa zero", () => {
  // MUTAÇÃO QUE DERRUBA: trocar os `return null` de `taxaDoPagamento` por
  // `return 0`. O tipo continua batendo, o tsc fica verde, e a casa passa a
  // afirmar que o Mercado Pago não cobra nada.
  it("pagamento SEM fee_details devolve null, não 0", () => {
    expect(taxaDoPagamento({ transaction_amount: 790 })).toBeNull();
  });

  // Lista VAZIA é "o provedor não detalhou", não "não houve taxa". O Pix pode
  // de fato ter taxa zero num plano — mas quem afirma isso é o extrato, não a
  // ausência de um campo.
  it("fee_details VAZIO também é null", () => {
    expect(taxaDoPagamento({ transaction_amount: 790, fee_details: [] })).toBeNull();
    expect(taxaDoPagamento({ fee_details: [{ type: "mercadopago_fee" }] })).toBeNull();
  });

  it("soma TODAS as retenções, não só a primeira", () => {
    // MUTAÇÃO QUE DERRUBA: usar `detalhes[0].amount` em vez da soma. O provedor
    // manda `mercadopago_fee` e `financing_fee` separados — pegar só a primeira
    // subestima o custo, que é o lado errado de errar numa conta de margem.
    const t = taxaDoPagamento({
      transaction_amount: 790,
      fee_details: [{ type: "mercadopago_fee", amount: 39.42 }, { type: "financing_fee", amount: 4.5 }],
    });
    expect(t).toBe(4392);
  });

  it("o líquido também é null quando o provedor não informou", () => {
    expect(liquidoDoPagamento({})).toBeNull();
    expect(liquidoDoPagamento({ transaction_details: { net_received_amount: 750.58 } })).toBe(75058);
  });
});

describe("a taxa efetiva só existe quando há pagamento real", () => {
  it("SEM pagamento com taxa gravada: nao_medido, com o motivo por escrito", async () => {
    db.pagamentoConfirmado.findMany.mockResolvedValue([]);
    const r = await taxaDoGatewayMedida();
    expect(r.pct).toBeNull();
    expect(r.amostra).toBe(0);
    expect(r.totalRetido.estado).toBe("nao_medido");
    // O motivo tem de nomear o bloqueio real, não só dizer "faltou dado".
    expect(r.motivo).toMatch(/MERCADOPAGO_WEBHOOK_SECRET/);
  });

  // MUTAÇÃO QUE DERRUBA: trocar o `catch` por `.catch(() => [])`. Banco fora do
  // ar viraria "amostra vazia" — que é a mesma resposta de "ainda não houve
  // pagamento", e as duas coisas exigem ações diferentes de gente diferente.
  it("banco fora do ar vira nao_medido, jamais zero", async () => {
    db.pagamentoConfirmado.findMany.mockRejectedValue(new Error("connection refused"));
    const r = await taxaDoGatewayMedida();
    expect(r.pct).toBeNull();
    expect(r.totalRetido.estado).toBe("nao_medido");
    expect(r.motivo).toMatch(/jamais taxa zero/);
  });

  it("COM pagamentos reais, a taxa efetiva é medida sobre o que o provedor reteve", async () => {
    db.pagamentoConfirmado.findMany.mockResolvedValue([
      { valorCentavos: 79000, taxaCentavos: 3942 },
      { valorCentavos: 49000, taxaCentavos: 2445 },
    ]);
    const r = await taxaDoGatewayMedida();
    expect(r.amostra).toBe(2);
    expect(r.pct!).toBeCloseTo(((3942 + 2445) / (79000 + 49000)) * 100, 6);
    expect(r.totalRetido.estado).toBe("medido");
    if (r.totalRetido.estado === "medido") {
      expect(r.totalRetido.centavos).toBe(6387);
      // `extrato`, não `manual`: a origem do número é o próprio provedor.
      expect(r.totalRetido.origem).toBe("extrato");
    }
  });
});
