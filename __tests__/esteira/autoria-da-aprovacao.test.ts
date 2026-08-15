// A GRAFIA DE QUEM APROVOU — e por que a string seca "cliente" morreu.
//
// ── O defeito de fundo (CEO, 15/08/2026) ─────────────────────────────────────
//
// `marcos.aprovarPacote` gravava `reviewedBy: "cliente"`, seco, por QUALQUER
// caminho — o portal do cliente (token) e a rota de sessão da agência. A trava
// de publicação (`aprovacao-da-peca`) recusa essa grafia de propósito, porque
// não dá para saber quem carimbou. O sistema ficava nos dois erros ao mesmo
// tempo:
//
//   • para o CEO, a peça aparecia APROVADA no portal;
//   • para o publicador, ela NÃO estava aprovada e nunca sairia.
//
// A recusa na LEITURA estava certa; o erro era continuar ESCREVENDO. Estes
// testes travam as duas metades do conserto:
//
//   1. a régua pura (`autoria-da-aprovacao`): o que é gravável e o que não é;
//   2. os pontos de ESCRITA (`approval-service`): a régua é trava, não convenção
//      — uma rota nova que esqueça a regra quebra alto em vez de gravar em
//      silêncio uma linha que a publicação nunca vai aceitar.
//
// E a ponte entre as duas: o que a escrita produz, a leitura da trava aceita.
// Sem este par, as duas metades podem divergir sem nenhum teste ficar vermelho.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvalRequest: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  carimboDaAutoria,
  conferirCarimbo,
  exigirCarimbo,
  CarimboRecusado,
  CARIMBO_SECO,
} from "@/lib/agency/esteira/autoria-da-aprovacao";
import { decisaoEhDoCliente, nomeDeQuemAprovou } from "@/lib/agency/esteira/aprovacao-da-peca";
import { updateApprovalStatus, decidirIrmaosGenericos } from "@/lib/agency/persistence/approval-service";

beforeEach(() => {
  vi.clearAllMocks();
  db.approvalRequest.update.mockResolvedValue({ id: "ap1" });
  db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
  db.approvalRequest.findMany.mockResolvedValue([]);
});

// ─── A RÉGUA ────────────────────────────────────────────────────────────────

describe("o carimbo é construído pelo CAMINHO DE AUTENTICAÇÃO", () => {
  it("token de portal validado ⇒ `client:<nome>`", () => {
    expect(carimboDaAutoria({ tipo: "cliente", nome: "Dioli Santos" })).toBe("client:Dioli Santos");
  });

  it("sessão da agência ⇒ `equipe:<email>` — e ela não se disfarça de cliente", () => {
    const c = carimboDaAutoria({ tipo: "equipe", email: "pm@dioli.com.br" });
    expect(c).toBe("equipe:pm@dioli.com.br");
    expect(decisaoEhDoCliente(c)).toBe(false);
  });

  it("cliente SEM nome não vira a string seca — era exatamente aqui que ela nascia", () => {
    const c = carimboDaAutoria({ tipo: "cliente", nome: null });
    expect(c).not.toBe(CARIMBO_SECO);
    // O NOME é enfeite; o LADO é a pergunta que a trava de publicação faz.
    expect(decisaoEhDoCliente(c)).toBe(true);
  });

  it("equipe sem email é declarada, não anônima", () => {
    expect(carimboDaAutoria({ tipo: "equipe", email: "" })).toBe("equipe:desconhecido");
  });

  it("quebra de linha e espaço duplo não entram no carimbo", () => {
    expect(carimboDaAutoria({ tipo: "cliente", nome: " Dioli \n  Santos " })).toBe("client:Dioli Santos");
  });
});

describe("o que NÃO é gravável", () => {
  it('⭐ a grafia seca "cliente" é recusada, e a recusa explica o porquê', () => {
    const p = conferirCarimbo("cliente");
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.motivo).toContain("15/08/2026");
      expect(p.motivo).toContain("client:");
      expect(p.motivo).toContain("equipe:");
    }
  });

  it("maiúscula e espaço não driblam a recusa", () => {
    expect(conferirCarimbo("  Cliente ").ok).toBe(false);
  });

  it("vazio é recusado: aprovação sem autor não é aprovação", () => {
    expect(conferirCarimbo("").ok).toBe(false);
    expect(conferirCarimbo(null).ok).toBe(false);
  });

  it("grafia inventada é recusada — fail-closed", () => {
    // Uma terceira grafia grava uma aprovação que nenhuma trava sabe ler: o
    // cliente veria "aprovado" para sempre e nada iria ao ar.
    expect(conferirCarimbo("Quality Director").ok).toBe(false);
    expect(conferirCarimbo("internal").ok).toBe(false);
    expect(conferirCarimbo("client:").ok).toBe(false);
    expect(conferirCarimbo("equipe:").ok).toBe(false);
  });

  it("as duas grafias vivas passam", () => {
    expect(conferirCarimbo("client:Dioli").ok).toBe(true);
    expect(conferirCarimbo("equipe:pm@dioli.com.br").ok).toBe(true);
  });

  it("`exigirCarimbo` LANÇA um erro nomeado — quem chama distingue regra de banco caído", () => {
    expect(() => exigirCarimbo("cliente")).toThrow(CarimboRecusado);
    expect(exigirCarimbo("client:Dioli")).toBe("client:Dioli");
  });
});

// ─── A TRAVA NOS PONTOS DE ESCRITA ──────────────────────────────────────────

describe("a régua é trava, não convenção", () => {
  it('⭐ `updateApprovalStatus` RECUSA gravar "cliente" — e nada chega ao banco', async () => {
    await expect(updateApprovalStatus("ap1", "approved", "cliente")).rejects.toThrow(CarimboRecusado);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("decisão sem autor nenhum também não grava", async () => {
    await expect(updateApprovalStatus("ap1", "approved")).rejects.toThrow(CarimboRecusado);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("decisão do cliente passa e é gravada como veio", async () => {
    await updateApprovalStatus("ap1", "approved", "client:Dioli Santos");
    expect(db.approvalRequest.update.mock.calls[0][0].data.reviewedBy).toBe("client:Dioli Santos");
  });

  it("REABRIR (`pending`) continua podendo ficar sem autor — ali a ausência é a informação certa", async () => {
    await updateApprovalStatus("ap1", "pending");
    expect(db.approvalRequest.update.mock.calls[0][0].data.reviewedBy).toBeNull();
  });

  it("a duplicata que fecha junto passa pela MESMA régua — sem porta lateral", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "irmao", reviewNote: null, deliverableVersionId: null, sourcePostIdsJson: "[]" },
    ]);
    await expect(decidirIrmaosGenericos({
      id: "ap1", clientRequestId: "cr1", clientId: null, department: "social-media",
      status: "approved", reviewedBy: "cliente",
    })).rejects.toThrow(CarimboRecusado);
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
  });
});

// ─── A PONTE ENTRE ESCRITA E LEITURA ────────────────────────────────────────

describe("o que a escrita produz, a leitura da trava entende", () => {
  it("carimbo do portal ⇒ a trava reconhece o cliente, com nome", () => {
    const c = carimboDaAutoria({ tipo: "cliente", nome: "CityJobs" });
    expect(conferirCarimbo(c).ok).toBe(true);
    expect(decisaoEhDoCliente(c)).toBe(true);
    expect(nomeDeQuemAprovou(c)).toBe("CityJobs");
  });

  it("carimbo da equipe ⇒ gravável, e deliberadamente NÃO libera publicação", () => {
    const c = carimboDaAutoria({ tipo: "equipe", email: "pm@dioli.com.br" });
    expect(conferirCarimbo(c).ok).toBe(true);
    expect(decisaoEhDoCliente(c)).toBe(false);
  });
});
