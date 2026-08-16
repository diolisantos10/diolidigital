// A FRONTEIRA DO WORKSPACE NO AVISO DE ORÇAMENTO — 16/08/2026, devolução do
// `seguranca`.
//
// O BURACO MEDIDO: `reenviarAvisosQueFalharam`, `contarAvisosLegados` e
// `candidatosLegados` (e a leitura irmã no GET da rota) buscavam
// `ClientRequestDb` inteiro, sem NUNCA filtrar por `workspaceId`.
// `autenticar()`, na rota, confere "existe sessão?" — nunca "esta sessão é
// dona deste dado?". Consequência medida: um funcionário logado em QUALQUER
// workspace via negócio, e-mail e motivo de falha de prospects de TODOS os
// workspaces, e o botão de reenviar disparava e-mail de VERDADE para um
// prospect que não é da agência dele — efeito externo em nome de outro.
//
// Este arquivo prova as duas metades do teste pedido na devolução:
//   ⛔ pedido de OUTRO workspace não aparece e não recebe e-mail;
//   ✅ pedido do PRÓPRIO workspace continua listado e continua sendo reenviado.
//
// O mock de `$queryRawUnsafe` devolve as duas linhas (ws-a e ws-b) INDEPENDENTE
// do texto do SQL — de propósito: um banco real já filtraria pelo `WHERE`,
// mas este teste prova a camada que sobrevive mesmo que o `WHERE` falhe: o
// filtro em memória (`apenasDoWorkspace`, de `lib/auth/posse-de-workspace.ts`),
// chamado depois da consulta. As DUAS camadas existem; este teste garante que
// a segunda, sozinha, já barra o vazamento.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  portalAccess: { findFirst: vi.fn() },
  client: { findMany: vi.fn() },
  agencyWorkspace: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import {
  reenviarAvisosQueFalharam,
  contarAvisosLegados,
  reenviarAvisosLegados,
} from "@/lib/agency/esteira/orcamento-do-briefing";

const WS_A = "ws-a-dona";
const WS_B = "ws-b-alheio";

function linha(over: Record<string, unknown> = {}) {
  return {
    id: "req-a",
    businessName: "Da Casa A",
    briefingJson: JSON.stringify({
      contato: { nome: "Fulano", email: "fulano@ws-a.com.br", whatsapp: null },
      estimate: { totalMin: 1000, totalMax: 2000, items: [{ label: "Social media" }] },
    }),
    sdrHandoffJson: null,
    workspaceId: WS_A,
    clientId: null,
    ...over,
  };
}

function linhaAlheia(over: Record<string, unknown> = {}) {
  return linha({
    id: "req-b",
    businessName: "Da Casa B",
    briefingJson: JSON.stringify({
      contato: { nome: "Ciclano", email: "ciclano@ws-b.com.br", whatsapp: null },
      estimate: { totalMin: 3000, totalMax: 4000, items: [{ label: "Social media" }] },
    }),
    workspaceId: WS_B,
    ...over,
  });
}

beforeEach(() => {
  db.portalAccess.findFirst.mockReset();
  db.portalAccess.findFirst.mockResolvedValue(null);
  db.client.findMany.mockReset();
  db.client.findMany.mockResolvedValue([]);
  db.agencyWorkspace.findMany.mockReset();
  db.agencyWorkspace.findMany.mockResolvedValue([]);
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue([]);
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(1);
  email.sendEmail.mockReset();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_ws" });
});

describe("reenviarAvisosQueFalharam — escopo de workspace obrigatório", () => {
  it("⛔ pedido de OUTRO workspace não aparece e não recebe e-mail — só o dono passa", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linha(), linhaAlheia()]);

    const r = await reenviarAvisosQueFalharam({ workspaceId: WS_A });

    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("fulano@ws-a.com.br");
    // O prospect alheio nunca é destinatário de nada.
    expect(email.sendEmail.mock.calls.some((c) => c[0].to === "ciclano@ws-b.com.br")).toBe(false);
  });

  it("✅ pedido do PRÓPRIO workspace continua sendo reenviado normalmente", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linha()]);

    const r = await reenviarAvisosQueFalharam({ workspaceId: WS_A });

    expect(r.reenviados).toBe(1);
    expect(r.aindaFalhando).toBe(0);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("o SQL passa a filtrar por workspaceId (defesa em profundidade, camada 1)", async () => {
    await reenviarAvisosQueFalharam({ workspaceId: WS_A });

    const sql = db.$queryRawUnsafe.mock.calls[0][0] as string;
    const params = db.$queryRawUnsafe.mock.calls[0].slice(1);
    expect(sql).toMatch(/workspaceId = \? OR workspaceId IS NULL/);
    expect(params).toContain(WS_A);
  });

  it("`{ casaInteira: true }` (o segredo de operação) enxerga os dois — decisão declarada, não vazamento", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linha(), linhaAlheia()]);

    const r = await reenviarAvisosQueFalharam({ casaInteira: true });

    expect(r.reenviados).toBe(2);
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
    // E o SQL deste caminho não carrega parâmetro de workspace nenhum.
    const params = db.$queryRawUnsafe.mock.calls[0].slice(1);
    expect(params).not.toContain(WS_A);
    expect(params).not.toContain(WS_B);
  });
});

describe("o balde de legados — mesma fronteira", () => {
  it("⛔ `contarAvisosLegados` não lista o legado de outro workspace", async () => {
    db.$queryRawUnsafe.mockResolvedValue([
      linha({ id: "req-legado-a" }),
      linhaAlheia({ id: "req-legado-b" }),
    ]);

    const balde = await contarAvisosLegados({ workspaceId: WS_A });

    expect(balde.total).toBe(1);
    expect(balde.itens[0]!.id).toBe("req-legado-a");
    expect(balde.itens.some((i) => i.id === "req-legado-b")).toBe(false);
  });

  it("⛔ `reenviarAvisosLegados` não manda e-mail para o legado de outro workspace", async () => {
    db.$queryRawUnsafe.mockResolvedValue([
      linha({ id: "req-legado-a" }),
      linhaAlheia({ id: "req-legado-b" }),
    ]);

    const r = await reenviarAvisosLegados({ workspaceId: WS_A });

    expect(r.reenviados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("fulano@ws-a.com.br");
  });

  it("✅ o legado do PRÓPRIO workspace continua alcançável", async () => {
    db.$queryRawUnsafe.mockResolvedValue([linha({ id: "req-legado-a" })]);

    const balde = await contarAvisosLegados({ workspaceId: WS_A });
    expect(balde.total).toBe(1);

    const r = await reenviarAvisosLegados({ workspaceId: WS_A });
    expect(r.reenviados).toBe(1);
  });
});

describe("o anti-duplicata sobrevive à fronteira de workspace", () => {
  it("quem já está 'avisado' não é buscado — nem por escopo, nem por casaInteira (a query nunca traz 'avisado')", async () => {
    // O SQL real nunca devolveria uma linha 'avisado' (o WHERE do reenvio só
    // busca 'falhou'/'skipped'); simulamos o banco real devolvendo lista
    // vazia — a garantia estrutural (o texto do WHERE) já é coberta pelos
    // testes de `reenvio-do-aviso-de-orcamento.test.ts` e não se repete aqui.
    db.$queryRawUnsafe.mockResolvedValue([]);

    const r = await reenviarAvisosQueFalharam({ workspaceId: WS_A });
    expect(r.reenviados).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
