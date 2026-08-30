// A PORTA DA PROPOSTA SÓ DECIDE O QUE AINDA ESTÁ ABERTO.
//
// ═══════════════════════════════════════════════════════════════════════════
// MEDIDO EM PRODUÇÃO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// Como cliente exigente, recusei a proposta. E depois cliquei em aceitar:
//
//   POST /api/portal/briefing/aceite {recusado} → 200, status vira `rejected`
//   GET  /api/portal/briefing/proposta          → decidivel:false, jaRecusado:true
//   POST /api/portal/briefing/aceite {aceito}   → **200, e o projeto NASCE**
//
// A rota que LÊ dizia ao cliente que não havia mais o que decidir — o
// cabeçalho dela diz isso por escrito, *"`decidivel` é FATO, não convite (…)
// ausência de decisão nunca vira decisão"* — e a rota que ESCREVE decidia
// assim mesmo. "Prompt é aviso; código é trava", na forma mais limpa: o aviso
// estava do lado que lê, e o lado que age não o conhecia.
//
// ── E A DIREÇÃO CARA É A OUTRA ─────────────────────────────────────────────
// Aceitar e DEPOIS recusar marcava a solicitação `rejected` com o projeto já
// criado — possivelmente pago, possivelmente produzindo. Um clique derrubaria
// no papel um projeto que continua andando de verdade, e nada ficaria
// vermelho. É esse o teste que dói.
//
// ── A MUTAÇÃO QUE ESTE ARQUIVO PEGA ────────────────────────────────────────
// Apague o `if (!ESPERANDO_DECISAO_DA_PROPOSTA.includes(...))` e os dois
// primeiros testes quebram.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    // `marcarAceite` (real, não mockada aqui) passou a gravar o congelamento
    // de preço com `updateMany` em vez de `$executeRawUnsafe` (ficha C1d,
    // 29/08/2026) — API padrão do Prisma, não detalhe de SQL. Este teste é
    // sobre roteamento de decisão, não sobre preço, mas exercita a função
    // real por trás da rota, então o fake de Prisma precisa da mesma
    // superfície que `caminho-automatico.ts` chama.
    updateMany: vi.fn(async (): Promise<{ count: number }> => ({ count: 1 })),
  },
  portalAccess: { findUnique: vi.fn(), update: vi.fn() },
}));
const nascerDoAceite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null | undefined) => q ?? "t",
}));
vi.mock("@/lib/agency/esteira/caminho-automatico", async (orig) => {
  const real = await orig<typeof import("@/lib/agency/esteira/caminho-automatico")>();
  return { ...real, nascerDoAceite };
});

import { POST } from "@/app/api/portal/briefing/aceite/route";

const decidir = async (decisao: string) => {
  const res = await POST(new NextRequest("http://localhost/api/portal/briefing/aceite", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "t", decisao }),
  }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};

/** O estado da solicitação no banco. */
const comStatus = (status: string) =>
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", status, businessName: "Cantina Oculta NOME TESTE" });

beforeEach(() => {
  vi.clearAllMocks();
  db.portalAccess.findUnique.mockResolvedValue({
    token: "t", clientRequestId: "cr1", clientId: null, revokedAt: null, expiresAt: null,
  });
  db.portalAccess.update.mockResolvedValue({});
  db.clientRequestDb.update.mockResolvedValue({});
  nascerDoAceite.mockResolvedValue({ ok: true, jaExistia: false });
});

describe("depois de decidida, a porta fecha", () => {
  it("🔴 recusou e clicou em aceitar: 409, e NENHUM projeto nasce", async () => {
    comStatus("rejected");
    const r = await decidir("aceito");
    expect(r.status, "a leitura já dizia `decidivel: false` — e a escrita aceitou assim mesmo").toBe(409);
    expect(nascerDoAceite, "o projeto nasceu de um pedido recusado").not.toHaveBeenCalled();
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
    expect(String(r.body.mensagem), "e o cliente é levado para onde a mudança de ideia CABE")
      .toMatch(/conversa aqui do portal/i);
  });

  it("🔴 aceitou e clicou em recusar: 409 — um clique não derruba projeto que já está andando", async () => {
    comStatus("accepted");
    const r = await decidir("recusado");
    expect(r.status).toBe(409);
    expect(
      db.clientRequestDb.update,
      "marcaria `rejected` no papel com o projeto rodando de verdade — e nada ficaria vermelho",
    ).not.toHaveBeenCalled();
    expect(String(r.body.mensagem)).toMatch(/já foi aceita e o seu projeto já está em andamento/i);
  });

  it("estado que a casa não conhece também não decide — lista fechada", async () => {
    comStatus("in_progress");
    expect((await decidir("aceito")).status).toBe(409);
  });
});

describe("e a porta ABERTA continua abrindo — nada foi travado a mais", () => {
  for (const status of ["proposal_pending", "proposal", "negotiation"]) {
    it(`\`${status}\`: o aceite passa e o projeto nasce`, async () => {
      comStatus(status);
      const r = await decidir("aceito");
      expect(r.status).toBe(200);
      expect(r.body.projetoCriado).toBe(true);
      expect(nascerDoAceite).toHaveBeenCalledWith("cr1", "cliente (portal)");
    });

    it(`\`${status}\`: a recusa também — recusar é resposta`, async () => {
      comStatus(status);
      const r = await decidir("recusado");
      expect(r.status).toBe(200);
      expect(db.clientRequestDb.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "rejected" } }),
      );
    });
  }
});
