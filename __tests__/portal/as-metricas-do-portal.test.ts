// AS MÉTRICAS DO PORTAL — a superfície que o cliente vê e que não tinha régua.
//
// ═══ COMO ESTE ARQUIVO NASCEU (Fase 1, varredura larga, 26/08/2026) ══════════
//
// Contagem de referências em `__tests__/` por rota de `app/api/portal/`:
//
//     approvals 10 · pedidos 10 · messages 7 · projetos 7 · esteira 5 ·
//     marca 4 · briefing 4 · vista 3 · transcrição 3 · materiais 3 ·
//     conexões 2 · sessão 1 · drive 1 · **métricas 0** · conectar-meta 0 ·
//     meta-ativos 0
//
// `metricas` é a rota do DASHBOARD do cliente — números do Instagram dele, na
// tela dele. Zero réguas. Este arquivo fecha as três perguntas que importam
// nela, e a primeira é a mais cara de todas.
//
// ⚠️ NENHUMA CHAMADA À META ACONTECE AQUI. A camada de leitura é dublê. Custo
// US$ 0,00, e nada é publicado em rede nenhuma.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const resolvePortalClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient }));

const lerMetricasDaConta = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/leitura", () => ({ lerMetricasDaConta }));

import { GET } from "@/app/api/portal/metricas/route";

const DONO = { clientId: "cli-do-token", workspaceId: "ws-1" };
const OUTRO = { clientId: "cli-de-outra-pessoa", workspaceId: "ws-2" };

function chamar(query = ""): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/portal/metricas${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue(DONO);
  lerMetricasDaConta.mockResolvedValue({
    ok: true,
    perfil: { seguidores: 812, totalDePosts: 44 },
    periodo: { desde: "2026-08-01", ate: "2026-08-26" },
    totais: { alcance: 5200, visualizacoes: 9100, contasComEngajamento: 310, interacoes: 640 },
    alcanceOrigem: "soma_diaria",
    rotuloDoAlcance: "Soma do alcance diário",
    serie: [{ dia: "2026-08-01", alcance: 200 }],
  });
});

describe("O CLIENTE DO TOKEN — e nunca o de outra pessoa", () => {
  it("o clientId é DERIVADO do token; o da query NÃO entra", async () => {
    // A pior classe de defeito que uma rota de portal pode ter: o cliente A
    // pedindo, e a casa servindo os números do cliente B. Aqui a pergunta é
    // feita de propósito, com o id do OUTRO na query.
    await chamar(`?token=t-do-dono&clientId=${OUTRO.clientId}&workspaceId=${OUTRO.workspaceId}`);

    // MUTAÇÃO QUE PROVA: troque `dono.clientId` por
    // `q.get("clientId") ?? dono.clientId` em `route.ts` e esta linha cai.
    expect(lerMetricasDaConta).toHaveBeenCalledWith(DONO.workspaceId, DONO.clientId, expect.anything());
    expect(lerMetricasDaConta).not.toHaveBeenCalledWith(
      OUTRO.workspaceId, OUTRO.clientId, expect.anything(),
    );
  });

  it("sem token não se lê nada — 400 antes de qualquer consulta", async () => {
    const res = await chamar();
    expect(res.status).toBe(400);
    expect(lerMetricasDaConta).not.toHaveBeenCalled();
  });

  it("token que não resolve dono é 403 — e a leitura NÃO acontece", async () => {
    resolvePortalClient.mockResolvedValue(null);
    const res = await chamar("?token=t-invalido");
    expect(res.status).toBe(403);
    // Falha fechada de verdade: negar depois de ler já teria lido.
    expect(lerMetricasDaConta).not.toHaveBeenCalled();
  });
});

describe("OS DOIS ESTADOS QUE O CLIENTE PRECISA VER COM TODAS AS LETRAS", () => {
  it("sem rede conectada: `semConexao` chega ao cliente, não some no `ok:false`", async () => {
    lerMetricasDaConta.mockResolvedValue({
      ok: false, error: "Nenhuma rede conectada.", semConexao: true,
    });
    const corpo = await (await chamar("?token=t")).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.semConexao).toBe(true);
    expect(corpo.precisaReconectar).toBe(false);
    // A frase é para o cliente ler, não um código de erro.
    expect(corpo.error).toContain("rede");
  });

  it("conexão vencida: `precisaReconectar` chega, e é DIFERENTE de não ter rede", async () => {
    lerMetricasDaConta.mockResolvedValue({
      ok: false, error: "Precisa reconectar o Instagram.", precisaReconectar: true,
    });
    const corpo = await (await chamar("?token=t")).json();
    expect(corpo.precisaReconectar).toBe(true);
    // Fundir os dois mandaria o cliente CONECTAR uma rede que ele já conectou.
    expect(corpo.semConexao).toBe(false);
  });

  it("AUSÊNCIA NÃO VIRA AFIRMAÇÃO: falha sem os dois sinalizadores não inventa nenhum", async () => {
    lerMetricasDaConta.mockResolvedValue({ ok: false, error: "A Meta não respondeu." });
    const corpo = await (await chamar("?token=t")).json();
    expect(corpo.semConexao).toBe(false);
    expect(corpo.precisaReconectar).toBe(false);
    // E o cliente não é mandado reconectar por causa de um erro de rede.
    expect(corpo.error).toBe("A Meta não respondeu.");
  });
});

describe("O NÚMERO NÃO MUDA DE SENTIDO NO CAMINHO", () => {
  it("o RÓTULO do alcance viaja junto com o número — soma diária não é conta única", async () => {
    const corpo = await (await chamar("?token=t")).json();
    expect(corpo.ok).toBe(true);
    // MUTAÇÃO QUE PROVA: apague `rotuloDoAlcance` da resposta em `route.ts` e
    // esta linha cai. Sem o rótulo o cliente lê "5.200 de alcance" e entende
    // 5.200 PESSOAS — que é outra coisa, e maior do que a verdade.
    expect(corpo.conta.rotuloDoAlcance).toBe("Soma do alcance diário");
    expect(corpo.conta.alcanceOrigem).toBe("soma_diaria");
    expect(corpo.conta.totais.alcance).toBe(5200);
  });

  it("data mal formada é recusada ANTES de gastar chamada na Meta", async () => {
    // Chamada à Meta custa cota (3 por leitura, `reservarChamadas`). Validar
    // depois seria pagar para descobrir que a pergunta estava errada.
    const res = await chamar("?token=t&desde=26/08/2026");
    expect(res.status).toBe(400);
    expect(lerMetricasDaConta).not.toHaveBeenCalled();
  });

  it("a queda da leitura vira 503 com frase de gente — nunca um `ok:true` vazio", async () => {
    lerMetricasDaConta.mockRejectedValue(new Error("socket hang up"));
    const res = await chamar("?token=t");
    const corpo = await res.json();
    expect(res.status).toBe(503);
    // O cliente não pode ler `ok: true` com tudo zerado: zero é uma AFIRMAÇÃO
    // ("você não teve alcance") e um erro de rede não pode fazê-la.
    expect(corpo.ok).not.toBe(true);
    expect(corpo.error).not.toContain("socket hang up");
  });
});
