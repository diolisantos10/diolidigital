// A PORTA DOS FUNDOS É A API, NÃO A URL.
//
// ── O ATAQUE, REPRODUZIDO (16/08/2026, achado pelo `seguranca`) ─────────────
//
// A tela `/agency/leads` é `dono_e_gestao` (`lib/agency/organizacao/paginas.ts`):
// um `social_staff` é barrado nela. A ROTA que alimenta essa tela chamava
// `requireSession()` **sem lista de papéis** — e `proxy.ts` pula `/api/` inteiro
// de propósito. Resultado medido:
//
//   curl -b 'dioli-session=<jwt de social_staff>' '/api/agency/leads?contato=sim'
//   → 200, com nome, e-mail e WhatsApp de TODOS os leads do workspace,
//     mais as citações cruas do briefing e as pistas raspadas da conversa.
//
// **A tela barra e o curl entrega.** Guarda de borda que exclui `/api/`
// transforma toda permissão de página em arrumação, a menos que cada handler
// repita a regra à mão.
//
// ⚠️ O buraco é ANTERIOR a esta frente. O que esta frente fez foi **aumentar o
// valor do alvo**: `?contato=sim` devolve a lista pronta de quem tem para onde
// ligar — que é exatamente o recorte que um concorrente quereria.
//
// O mecanismo certo já existia: `exigirApiInterna(rota)` prende a permissão da
// API à MESMA linha do inventário que decide a tela. Mecanismo que existe e é
// usado por 1 rota de 16 não é trava, é intenção.

import { describe, it, expect, beforeEach, vi } from "vitest";

const sessao = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", async (original) => {
  const real = await original<typeof import("@/lib/auth/session")>();
  return { ...real, getSession: sessao };
});

const listar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/client-request-service", () => ({
  listClientRequests: listar,
}));

import { GET } from "@/app/api/agency/leads/route";
import { NextRequest } from "next/server";

/** Um lead inventado, com contato — o que o atacante quer. */
const LEAD = {
  id: "req-1",
  businessName: "Padaria Trigo de Ouro",
  segment: "alimentação",
  status: "new",
  createdAt: new Date("2026-08-10T10:00:00.000Z"),
  services: ["social media"],
  objectives: [],
  rawContext: "[Prospect] Meu perfil é o @trigodeouro, ticket médio R$ 40.",
  briefingJson: null,
  sdrHandoffJson: null,
  contatoNome: "Marcos",
  contatoEmail: "marcos@trigodeouro.com.br",
  contatoWhatsapp: "11977771234",
};

function pedir(url = "http://localhost/api/agency/leads?contato=sim"): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  listar.mockResolvedValue([LEAD]);
});

describe("⛔ A METADE QUE FALTAVA — quem é barrado na tela é barrado na API", () => {
  it("🔴 `social_staff` NÃO recebe a lista de leads — a tela dele é `dono_e_gestao`", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "social_staff" });

    const r = await GET(pedir());

    expect(r.status).toBe(403);
    // E o dado não sai nem no corpo do erro.
    const corpo = JSON.stringify(await r.json());
    expect(corpo).not.toContain("marcos@trigodeouro.com.br");
    expect(corpo).not.toContain("11977771234");
    expect(corpo).not.toContain("Marcos");
  });

  it("🔴 o banco NEM É CONSULTADO — negar depois de ler já vazou para o log e para o tempo de resposta", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "social_staff" });
    await GET(pedir());
    expect(listar).not.toHaveBeenCalled();
  });

  it("papel desconhecido no JWT também é negado — fecha por omissão, nunca promove", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "papel-que-nao-existe" });
    const r = await GET(pedir());
    expect(r.status).toBe(403);
    expect(listar).not.toHaveBeenCalled();
  });

  it("sem sessão nenhuma: 401, e nada de banco", async () => {
    sessao.mockResolvedValue(null);
    const r = await GET(pedir());
    expect(r.status).toBe(401);
    expect(listar).not.toHaveBeenCalled();
  });

  it("cliente logado no portal não atravessa para o território interno", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "client" });
    const r = await GET(pedir());
    expect(r.status).toBe(403);
    expect(listar).not.toHaveBeenCalled();
  });
});

describe("✅ A OUTRA METADE — a trava não fechou a porta de quem trabalha", () => {
  it("`master` continua recebendo a fila inteira", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "master" });
    const r = await GET(pedir());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.medido).toBe(true);
    expect(j.leads.length).toBe(1);
  });

  // O papel é `executivo_comercial` — dono de `client-service-sdr`, que é o
  // `dono` da página `/agency/leads`. Escrevi "sdr" na primeira versão deste
  // teste e ele deu 403: papel fora da tabela vira o perfil SEM ACESSO. O erro
  // foi meu e a trava estava certa — fica registrado porque prova, de graça,
  // que a guarda fecha por omissão em vez de promover o desconhecido.
  it("o dono do departamento de atendimento (`executivo_comercial`) continua entrando — é a mesa dele", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "executivo_comercial" });
    const r = await GET(pedir());
    expect(r.status).toBe(200);
  });

  it("🔑 o escopo continua vindo da SESSÃO, nunca da requisição", async () => {
    sessao.mockResolvedValue({ userId: "u1", workspaceId: "ws-A", role: "master" });
    // Um `workspaceId` plantado na query não pode trocar o recorte.
    await GET(pedir("http://localhost/api/agency/leads?contato=sim&workspaceId=ws-DO-VIZINHO"));
    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-A" }));
  });
});
