// A PÁGINA QUE ASSINA O ANÚNCIO PASSA PELA MESMA LISTA QUE A CONTA — 15/08/2026.
//
// Desde 06/08/2026 a CONTA DE ANÚNCIOS atravessa `MetaAtivoAutorizado` antes de
// qualquer escrita. A PÁGINA não atravessava nada: ela chegava crua de
// `montarCriativo` e ia direto para `object_story_spec.page_id`. Faltava a
// metade que o público enxerga — quem ASSINA a peça.
//
// A conferência mora dentro de `criarAnuncioPausado`, e não no chamador. É a
// lição de 06/08: conferir no chamador deixa a próxima porta descoberta, que foi
// exatamente como `publishPost` (publicação orgânica) ficou de fora da trava.
//
// Este arquivo mede as DUAS metades: a Página de terceiro é barrada e nenhum
// POST sai; a Página autorizada passa sem atrito.

import { describe, it, expect, beforeEach, vi } from "vitest";

const graphPost = vi.hoisted(() => vi.fn());
const loadConnectionToken = vi.hoisted(() => vi.fn());
const ativoAutorizado = vi.hoisted(() => vi.fn());

vi.mock("@/lib/integrations/meta/graph", () => ({
  graphGet: vi.fn(),
  graphPost,
  GraphApiError: class extends Error {},
}));
vi.mock("@/lib/integrations/meta/connections", () => ({ loadConnectionToken }));
vi.mock("@/lib/integrations/meta/ativos-autorizados", async (original) => {
  const real = await original<typeof import("@/lib/integrations/meta/ativos-autorizados")>();
  return {
    ...real,
    ativoAutorizado,
    filtrarAutorizados: vi.fn(async (_w: string, _c: unknown, _t: unknown, itens: unknown[]) => ({
      autorizados: itens, recusados: [], listaVazia: false,
    })),
  };
});

import { criarAnuncioPausado, criarConjuntoPausado } from "@/lib/integrations/meta/ads";

const CONTA_DO_CLIENTE = "act_1000";
const PAGINA_DO_CLIENTE = "page_do_cliente";
const PAGINA_DE_TERCEIRO = "page_de_terceiro";

const AD = {
  contaId: CONTA_DO_CLIENTE, adSetId: "adset_1", pageId: PAGINA_DO_CLIENTE, nome: "Anúncio",
  imagemUrl: "https://app.dioli.studio/api/media/m1?sig=x",
  texto: "Texto", titulo: "Título", link: "https://wa.me/5511999999999",
};

/** A lista real do cliente: a conta dele e a Página dele. Mais nada. */
const AUTORIZADOS = new Set([`ad_account:${CONTA_DO_CLIENTE}`, `page:${PAGINA_DO_CLIENTE}`]);

beforeEach(() => {
  vi.clearAllMocks();
  loadConnectionToken.mockResolvedValue({ token: "tk", platform: "user", externalId: "u1", clientId: "cli_1" });
  graphPost.mockResolvedValueOnce({ id: "cre_1" }).mockResolvedValueOnce({ id: "ad_1" });
  ativoAutorizado.mockImplementation(async (_w: string, _c: unknown, tipo: string, id: string) =>
    AUTORIZADOS.has(`${tipo}:${id}`));
});

describe("nenhum anúncio nasce assinado pela Página de outro cliente", () => {
  it("Página fora da lista do dono do token → recusa, e NADA é enviado à Meta", async () => {
    const r = await criarAnuncioPausado("ws1", "mc1", { ...AD, pageId: PAGINA_DE_TERCEIRO });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_autorizacao");
    // A recusa é NOSSA e precisa parecer nossa: confundi-la com uma recusa da
    // Meta manda o operador esperar por uma plataforma que não vai responder.
    expect(r.erro).toMatch(/não está na lista/i);
    expect(r.erro).not.toMatch(/a Meta recusou/i);
    // E ela ensina o gesto — barrar sem dizer onde clicar é o que trava a casa.
    expect(r.erro).toMatch(/O que a Dioli pode acessar/);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("anúncio SEM Página nenhuma também não passa — vazio não é permissão", async () => {
    const r = await criarAnuncioPausado("ws1", "mc1", { ...AD, pageId: "" });
    expect(r.ok).toBe(false);
    expect(graphPost).not.toHaveBeenCalled();
  });

  it("a conferência é feita com o dono do TOKEN, não com o que o chamador diz", async () => {
    await criarAnuncioPausado("ws1", "mc1", AD);
    const donos = ativoAutorizado.mock.calls.map((c) => c[1]);
    expect(donos.every((d) => d === "cli_1")).toBe(true);
  });

  it("A METADE OPOSTA: Página autorizada passa, e o anúncio nasce PAUSED", async () => {
    // Sem esta metade a trava viraria "nunca cria anúncio" e passaria em todo
    // teste de recusa entregando zero ao cliente.
    const r = await criarAnuncioPausado("ws1", "mc1", AD);
    expect(r.ok).toBe(true);
    const spec = JSON.parse(graphPost.mock.calls[0]![2].object_story_spec);
    expect(spec.page_id).toBe(PAGINA_DO_CLIENTE);
    expect(graphPost.mock.calls[1]![2].status).toBe("PAUSED");
  });

  it("a segunda porta: o conjunto de CONVERSAS também não injeta Página alheia", async () => {
    // `promoted_object.page_id` é o outro lugar deste arquivo por onde uma
    // Página chega à Meta. Nenhum chamador manda `pageId` aqui hoje — a trava
    // entra antes do primeiro chamador aparecer e ninguém lembrar.
    const r = await criarConjuntoPausado("ws1", "mc1", {
      contaId: CONTA_DO_CLIENTE, campaignId: "camp_1", nome: "Conjunto", objetivo: "conversas",
      pageId: PAGINA_DE_TERCEIRO,
      publico: { cidade: null, raioKm: 8, idadeMin: 25, idadeMax: 55, interesses: [] },
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_autorizacao");
    expect(graphPost).not.toHaveBeenCalled();
  });
});
