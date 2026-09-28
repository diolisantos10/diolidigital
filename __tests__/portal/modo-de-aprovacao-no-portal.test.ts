// W4 — O MODO DE APROVAÇÃO CHEGA AO PORTAL.
//
// `GET /api/portal/esteira` passa a devolver `modoAprovacao` (o que
// `modoEmVigor` decide para o CLIENTE do token) e, só quando o modo é
// SEMANAL, o `prazo` já formatado em português para a PRÓXIMA semana
// (`prazoEmPortugues` sobre `prazoDeAprovacao(semanaSeguinte(agora))`).
//
// A régua é dupla, e as duas metades importam igual:
//   • SEMANAL devolve prazo — é o aviso que aparece antes de "Aprovar tudo"
//     em `AprovacoesDoCliente.tsx` (`AvisoDeModoDoCliente`);
//   • qualquer outro modo devolve prazo AUSENTE — nunca um texto de prazo
//     inventado para um modo que não tem prazo de cliente nenhum.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const statusPelaSolicitacao = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null) => q,
}));
vi.mock("@/lib/agency/esteira/retrato", () => ({ statusPelaSolicitacao }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ aprovarDirecao: vi.fn(), aprovarPacote: vi.fn() }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution: vi.fn() }));

import { GET } from "@/app/api/portal/esteira/route";
import { lerFase } from "@/lib/agency/esteira/fases";

/** Um `StatusDoProjeto` mínimo, com `clientId` — o campo que W4 acrescentou
 *  para a rota conseguir consultar `Client.modoAprovacao` do DONO do token. */
function retrato(clientId: string | null) {
  const leitura = lerFase({
    propostaAceita: true,
    tarefas: { total: 1, entregues: 1, produzindo: 0, bloqueadas: 0 },
    entregaveis: { total: 1, emRevisao: 0, comRessalva: 0, aprovados: 1 },
    pedidosAbertos: 0, pedidosCobrados: 0,
    cicloAberto: false, postsPublicados: 0, postsAgendados: 0,
  });
  return {
    projectId: "p1", nome: "Cliente Teste", cliente: "Cliente Teste", clientId,
    leitura, responsavelLegivel: "a agência", trilha: [], pendencias: [], ciclo: null,
    pacote: { medido: true, pedeAprovacao: false, prontas: [], emProducao: [] },
    numeros: {} as never,
  };
}

const url = () => new NextRequest("http://localhost/api/portal/esteira?token=t");

beforeEach(() => {
  vi.clearAllMocks();
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1" } });
  statusPelaSolicitacao.mockResolvedValue(retrato("c1"));
});

describe("modo de aprovação no portal (W4)", () => {
  it("SEMANAL devolve prazo, formatado em português, para a PRÓXIMA semana", async () => {
    db.client.findUnique.mockResolvedValue({ modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null });

    const r = await GET(url());
    const j = (await r.json()) as { modoAprovacao?: string; prazo?: string };

    expect(j.modoAprovacao).toBe("SEMANAL");
    // O prazo é SEMPRE a sexta-feira anterior à segunda da semana seguinte
    // (`prazoDeAprovacao`), então o dia da semana é fixo — não depende de
    // quando o teste roda. Ex.: "sexta-feira, 02/10, às 18h".
    expect(j.prazo).toMatch(/^sexta-feira, \d{2}\/\d{2}, às 18h$/);
  });

  it.each(["APROVACAO_CEO", "PILOTO_AUTOMATICO", "MENSAL"])(
    "%s devolve modoAprovacao mas NUNCA um prazo inventado",
    async (modo) => {
      db.client.findUnique.mockResolvedValue({ modoAprovacao: modo, modoPendente: null, modoPendenteVigenteEm: null });

      const r = await GET(url());
      const j = (await r.json()) as { modoAprovacao?: string; prazo?: string };

      expect(j.modoAprovacao).toBe(modo);
      expect(j.prazo).toBeUndefined();
    },
  );

  it("sem cliente resolvido (clientId nulo), a rota não inventa modo nenhum", async () => {
    statusPelaSolicitacao.mockResolvedValue(retrato(null));

    const r = await GET(url());
    const j = (await r.json()) as { modoAprovacao?: string; prazo?: string };

    expect(j.modoAprovacao).toBeUndefined();
    expect(j.prazo).toBeUndefined();
    expect(db.client.findUnique).not.toHaveBeenCalled();
  });
});
