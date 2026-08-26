// O PORTAL NÃO NEGA ACESSO A QUEM ELE ACABOU DE CONVIDAR — e não diz que nada
// aconteceu enquanto a proposta espera a assinatura dele.
//
// ═══════════════════════════════════════════════════════════════════════════
// OS DOIS ACHADOS, MEDIDOS EM PRODUÇÃO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// Um prospect recém-orçado, com o link que a casa acabou de mandar. MESMO
// token, MESMO minuto:
//
//   /api/portal/esteira   → 200 "Ainda estamos organizando tudo"
//   /api/portal/messages  → 200, com a PROPOSTA dele: valor, escopo e o link
//                            de aceitar ou recusar
//   /api/portal/projetos  → 403 "Acesso negado"
//   /api/portal/pedidos   → 403 "Acesso negado"
//   /api/portal/vista     → 403 "Acesso negado"
//
// ── 1. TRÊS ABAS FECHADAS PARA QUEM TINHA O LINK ───────────────────────────
// A ficha de `Client` só nasce quando ele ACEITA. `resolvePortalClient`
// devolvia `null` antes disso, e `null` chegava às rotas achatado com "token
// inválido". Guardrail 1 pela porta do HTTP: a ausência de uma FICHA virou a
// afirmação de que o ACESSO foi negado — para alguém a quem a casa acabara de
// mandar um convite.
//
// ── 2. A QUARTA CONTRADIÇÃO ────────────────────────────────────────────────
// "Ainda estamos organizando tudo" era um literal cravado na rota, disparado
// sempre que não existe `Project` — e `Project` só nasce depois do aceite. Em
// TODA a fase comercial a esteira dizia que nada tinha acontecido, enquanto a
// proposta esperava na aba do lado. `lerFase` já sabia responder isso: os
// ramos comerciais existiam e nunca eram alcançados por esta porta.
//
// ── AS MUTAÇÕES QUE ESTE ARQUIVO PEGA ──────────────────────────────────────
// Volte `if (!dono) → 403` e o primeiro grupo quebra. Volte o literal
// "Ainda estamos organizando tudo" e o segundo quebra.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), findFirst: vi.fn() },
  socialPost: { findMany: vi.fn() },
  pagamentoConfirmado: { findMany: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
  portalAccess: { findUnique: vi.fn(), update: vi.fn() },
  contentRequest: { findMany: vi.fn() },
  materialRequest: { findMany: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const statusPelaSolicitacao = vi.hoisted(() => vi.fn());
const statusDoProjeto = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null) => q,
}));
vi.mock("@/lib/agency/esteira/retrato", () => ({ statusDoProjeto, statusPelaSolicitacao }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ aprovarDirecao: vi.fn(), aprovarPacote: vi.fn() }));
// `validatePortalAccess` é substituída para a ESTEIRA (que a importa direto).
// `donoDoPortal` NÃO é substituída: ela é o que este arquivo veio medir, e ela
// roda de verdade, sobre o mesmo `portalAccess` do banco-dublê abaixo.
vi.mock("@/lib/agency/persistence/portal-access-service", async (orig) => {
  const real = await orig<typeof import("@/lib/agency/persistence/portal-access-service")>();
  return { ...real, validatePortalAccess };
});

import { GET as GET_PROJETOS } from "@/app/api/portal/projetos/route";
import { GET as GET_ESTEIRA } from "@/app/api/portal/esteira/route";

const url = (rota: string) => new NextRequest(`http://localhost${rota}?token=t`);

beforeEach(() => {
  vi.clearAllMocks();
  // O ESTADO EXATO DA MEDIÇÃO: token válido, ligado à SOLICITAÇÃO, e a
  // solicitação ainda sem ficha de cliente (ela nasce no aceite).
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  // O que a `donoDoPortal` REAL lê: o token existe, está vivo, e aponta para a
  // solicitação — sem ficha de cliente, que é o estado medido.
  db.portalAccess.findUnique.mockResolvedValue({
    token: "t", clientRequestId: "cr1", clientId: null, revokedAt: null, expiresAt: null,
  });
  db.portalAccess.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({
    status: "quoted", businessName: "Cantina Oculta NOME TESTE", clientId: null,
  });
  db.project.findMany.mockResolvedValue([]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.pagamentoConfirmado.findMany.mockResolvedValue([]);
  statusPelaSolicitacao.mockResolvedValue(null); // ainda não há Project
});

describe("1. token válido sem ficha de cliente não é acesso negado", () => {
  it("🔴 a aba Projetos responde 200 com o vazio honesto — não 403 na cara de quem foi convidado", async () => {
    const r = await GET_PROJETOS(url("/api/portal/projetos"));
    expect(
      r.status,
      "a casa mandou o link e a proposta, e a aba respondeu que o acesso foi negado",
    ).toBe(200);
    const j = await r.json() as { ok: boolean; projetos: unknown[]; aindaSemFicha?: boolean };
    expect(j.ok).toBe(true);
    expect(j.projetos).toEqual([]);
    expect(j.aindaSemFicha, "e o vazio é DECLARADO, não disfarçado de lista vazia comum").toBe(true);
  });

  it("⛔ token INVÁLIDO continua 403 — nada aqui afrouxa segurança", async () => {
    db.portalAccess.findUnique.mockResolvedValue(null);
    const r = await GET_PROJETOS(url("/api/portal/projetos"));
    expect(r.status).toBe(403);
  });

  it("⛔ token revogado/expirado também — a régua é a validação, não a ficha", async () => {
    db.portalAccess.findUnique.mockResolvedValue({
      token: "t", clientRequestId: "cr1", clientId: null,
      revokedAt: new Date("2026-08-01"), expiresAt: null,
    });
    const r = await GET_PROJETOS(url("/api/portal/projetos"));
    expect(r.status).toBe(403);
  });
});

describe("2. a quarta contradição: a esteira na fase comercial", () => {
  it("🔴 com a proposta na mão dele, a esteira NÃO diz que nada aconteceu", async () => {
    const r = await GET_ESTEIRA(url("/api/portal/esteira"));
    const j = await r.json() as { etapa: string; titulo: string; aBolaEstaComVoce: boolean; oQueEsperamosDeVoce: string };

    expect(
      j.titulo,
      "a proposta está na aba do lado, com valor e link de aceitar — e a esteira dizia que o projeto 'está sendo preparado'",
    ).not.toBe("Ainda estamos organizando tudo");
    expect(j.etapa).toBe("Proposta na sua mão");
    expect(j.aBolaEstaComVoce, "quem tem de agir agora é ele").toBe(true);
    expect(j.oQueEsperamosDeVoce).toMatch(/de acordo|mudar/i);
  });

  it("`etapa` e `titulo` dizem a MESMA coisa — duas chaves com dois textos é como a casa se contradiz", async () => {
    const r = await GET_ESTEIRA(url("/api/portal/esteira"));
    const j = await r.json() as { etapa: string; titulo: string };
    expect(j.titulo).toBe(j.etapa);
  });

  it("e quem ainda está em sondagem lê a sondagem, não a proposta", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ status: "new", businessName: "X", clientId: null });
    const r = await GET_ESTEIRA(url("/api/portal/esteira"));
    const j = await r.json() as { etapa: string };
    expect(j.etapa).toBe("Conhecendo o seu negócio");
  });
});
