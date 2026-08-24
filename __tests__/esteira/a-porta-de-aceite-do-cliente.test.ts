// A PORTA DE ACEITE DO CLIENTE — a fechadura existia, a porta não.
//
// ═══ O ACHADO QUE PRODUZIU ESTE ARQUIVO (24/08/2026, medido em produção) ═════
//
// `POST /api/portal/briefing/aceite` estava no ar, testada e correta. Busca no
// código inteiro: **nenhuma tela a chamava, e nenhum caminho automático cunhava
// o token que ela exige.** Os únicos que cunhavam `PortalAccess` eram
// `/api/brain/portal-access` (sessão de agência), `/api/admin/reset-request`
// (`CRON_SECRET`) e o arnês do cliente falso.
//
// Consequência medida: `www.diolidigital.com.br` com ZERO clientes com projeto,
// e o relógio repetindo *"a casa ainda não tem NENHUM CLIENTE COM PROJETO"*.
// Não faltava demanda nem motor: **o cliente não conseguia dizer "aceito"
// porque a agência precisava fabricar a porta dele primeiro.**
//
// ⚠️ O QUE ESTES TESTES NÃO AUTORIZAM — e é a metade que mais importa:
// nada aqui automatiza o ACEITE. O OK do escopo é do cliente, é humano, e é o
// desenho da casa — não um gargalo. O que se automatiza é a FABRICAÇÃO DA
// PORTA: cunhar o token e mandar o link junto com o orçamento. Quem empurra o
// botão continua sendo gente.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
  portalAccess: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import { entregarOrcamentosPendentes } from "@/lib/agency/esteira/orcamento-do-briefing";
import { avaliarCasoNormal, precoAceito } from "@/lib/agency/esteira/caminho-automatico";
import { lerEscopoDeConteudo } from "@/lib/agency/execution/escopo-do-cliente";

/** O escopo REAL da Farol 27, como a produção o guardou. O volume veio
 *  estruturado do próprio SDR da casa, e a verba nunca foi dita (a conversa
 *  morreu no guarda de preço antes de a cliente responder). */
const ESCOPO_FAROL = {
  wantsSocialMedia: true,
  social: { platforms: ["Instagram", "TikTok"], postsPerWeek: 3, storiesPerWeek: 3, videosPerMonth: 8 },
  budgetRange: "acima de R$ 5.000",
  prospectEmail: "ana.farol@cliente-falso.invalid",
};

const PEDIDO_FAROL = {
  id: "farol27",
  clientId: null,
  businessName: "Farol 27 — Padaria & Café [TESTE]",
  status: "new",
  createdAt: new Date("2026-08-24T17:39:58Z"),
  sdrHandoffJson: null,
  briefingJson: JSON.stringify({
    contato: { nome: "Ana Farol [TESTE]", email: "ana.farol@cliente-falso.invalid", whatsapp: null },
    scope: ESCOPO_FAROL,
  }),
};

beforeEach(() => {
  for (const m of [db.clientRequestDb.findMany, db.clientRequestDb.update, db.portalMessage.create,
                   db.portalAccess.findMany, db.portalAccess.create, email.sendEmail]) m.mockReset();
  db.portalAccess.findMany.mockResolvedValue([]);
  db.portalAccess.create.mockImplementation(async ({ data }: { data: { token: string } }) => ({ token: data.token }));
  db.$transaction.mockClear();
  db.$executeRawUnsafe.mockResolvedValue(1);
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1. o volume que o cliente comprou — a casa lê o que ela mesma anotou", () => {
  it("lê o CAMPO ESTRUTURADO que o SDR preencheu — 3 posts + 3 stories/semana + 8 vídeos/mês = 32/mês", () => {
    const e = lerEscopoDeConteudo({ servicos: ["social-media"], escopo: JSON.stringify(ESCOPO_FAROL), contextoBruto: "" });
    // 32 é exatamente o que o case vendeu: 12 feed + 12 stories + 8 TikTok.
    expect(e.pecasPorMes).toBe(32);
    expect(e.procedencia.join(" ")).toMatch(/campo do briefing/);
  });

  it("lê 'por semana' na PROSA — que é como gente fala, e era o buraco", () => {
    // MUTAÇÃO QUE PROVA: apague a regex de `por semana` em
    // `escopo-do-cliente.ts` e esta linha vira `null`. Foi assim, com o campo
    // estruturado vazio, que a produção concluiu que não sabia o que vendeu.
    const e = lerEscopoDeConteudo({ servicos: ["social-media"], contextoBruto: "Queremos 3 posts por semana no feed." });
    expect(e.pecasPorMes).toBe(12);
  });

  it("continua NÃO chutando: sem volume declarado, é lacuna e não número", () => {
    const e = lerEscopoDeConteudo({ servicos: ["social-media"], escopo: JSON.stringify({ social: { postsPerWeek: 0 } }), contextoBruto: "" });
    expect(e.pecasPorMes).toBeNull();
    expect(e.lacunas.join(" ")).toMatch(/quantas peças por mês/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. a porta do cliente é FABRICADA junto com a proposta", () => {
  it("cunha um PortalAccess AMARRADO À SOLICITAÇÃO e manda o link no texto do cliente", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([PEDIDO_FAROL]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(1);
    // MUTAÇÃO QUE PROVA: devolva `null` em vez de cunhar (era o comportamento
    // anterior, `linkDaConversa`) e as três linhas abaixo caem juntas.
    expect(db.portalAccess.create).toHaveBeenCalledTimes(1);
    const criado = db.portalAccess.create.mock.calls[0][0].data;
    expect(criado.clientRequestId).toBe("farol27");
    // Credencial, não identificador: o `cuid()` sequencial do schema não serve
    // para uma chave que viaja por e-mail e vale uma decisão comercial.
    expect(criado.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const corpo = db.portalMessage.create.mock.calls[0][0].data.body as string;
    expect(corpo).toContain(`https://www.diolidigital.com.br/proposta/${criado.token}`);
    // E o e-mail leva a MESMA porta — não uma segunda.
    expect(email.sendEmail.mock.calls[0][0].html as string).toContain(criado.token);
  });

  it("NÃO revoga nem troca o link que o cliente já tem", async () => {
    db.portalAccess.findMany.mockResolvedValue([{ token: "ja-enviado", expiresAt: null }]);
    db.clientRequestDb.findMany.mockResolvedValue([PEDIDO_FAROL]);
    await entregarOrcamentosPendentes();

    expect(db.portalAccess.create).not.toHaveBeenCalled();
    expect(db.portalMessage.create.mock.calls[0][0].data.body).toContain("/proposta/ja-enviado");
  });

  it("cunhar é do RELÓGIO, nunca de um pedido de fora — a rota pública não chama isto", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/api/brain/client-requests/route.ts", "utf-8"));
    expect(fonte).not.toMatch(/portalAccess|createPortalAccess|linkDaProposta/);
  });

  it("a porta existe no produto: uma TELA chama a rota de aceite", async () => {
    // O defeito que este teste trava é literal: a fechadura no ar e nenhuma
    // porta na parede. Se a página sumir, o aceite volta a ser inalcançável.
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/proposta/[token]/page.tsx", "utf-8"));
    expect(fonte).toContain("/api/portal/briefing/aceite");
    // As duas saídas, e as duas são do humano. Recusar também é resposta.
    expect(fonte).toContain('"aceito"');
    expect(fonte).toContain('"recusado"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. falha fechada — silêncio nunca vira aceite", () => {
  it("sem proposta entregue não há preço aceito: `precoAceito` devolve null", () => {
    expect(precoAceito(null)).toBeNull();
    expect(precoAceito(JSON.stringify({ scope: ESCOPO_FAROL }))).toBeNull();
  });

  it("estimativa TRAVADA não vira preço aceito — o zero do CityJobs não volta", () => {
    expect(precoAceito(JSON.stringify({
      estimate: { totalMin: 1800, totalMax: 3400, travadaPor: "o volume não chegou" },
    }))).toBeNull();
  });

  it("ANTES da proposta o automático PARA; só o aceite de um número o libera", () => {
    const base = {
      services: JSON.stringify(["social-media"]),
      rawContext: "Verba de mídia R$ 30 mil para 60 dias.",
      chaveDoProspect: "email:ana.farol@cliente-falso.invalid",
    };
    const antes = avaliarCasoNormal({ ...base, briefingJson: JSON.stringify({ scope: ESCOPO_FAROL }) });
    expect(antes.normal).toBe(false);

    const depois = avaliarCasoNormal({
      ...base,
      briefingJson: JSON.stringify({ scope: ESCOPO_FAROL, estimate: { totalMin: 3100, totalMax: 6100 } }),
    });
    expect(depois).toEqual({ normal: true });
  });

  it("aceite abaixo do piso da tabela continua parando — a tabela é do site", () => {
    const r = avaliarCasoNormal({
      services: JSON.stringify(["social-media"]),
      rawContext: "",
      chaveDoProspect: "email:ana@exemplo.com",
      briefingJson: JSON.stringify({ scope: ESCOPO_FAROL, estimate: { totalMin: 10, totalMax: 10 } }),
    });
    expect(r.normal).toBe(false);
    expect(r.normal === false && r.motivo).toMatch(/abaixo do menor plano/);
  });
});
