// AS DUAS ROTAS QUE GASTAVAM (OU PUBLICAVAM) SEM PERGUNTAR QUEM ERA.
//
// ── /api/generate-image ─────────────────────────────────────────────────────
// `getSession()` era chamado só para escolher a chave; sessão ausente não
// bloqueava nada. A única defesa era 10/min por IP num balde em memória que
// todo restart zera. A conta, com o preço real da imagem: 10/min × 1440 min =
// 14.400 imagens/dia POR IP, ~US$2.500–3.500/dia na chave da agência. Rotação
// de IP multiplica.
//
// ── /api/meta/publish ───────────────────────────────────────────────────────
// Pedia só `getSession()`. `design_staff`, `ads_staff` — e uma SESSÃO DE PORTAL
// (o próprio cliente) — publicavam conteúdo arbitrário no Instagram REAL do
// cliente. Post público, permanente, no perfil dele.
//
// AS DUAS METADES, nos dois casos: quem não tem direito é barrado ANTES de
// qualquer efeito (nenhuma chamada ao provedor, nenhuma chamada à Graph); quem
// tem direito passa sem atrito.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.hoisted(() => vi.fn());
const generateDesign = vi.hoisted(() => vi.fn());
const publishPost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, getSession };
});
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));

import { POST as gerarImagem } from "@/app/api/generate-image/route";
import { POST as publicar } from "@/app/api/meta/publish/route";

let n = 0;

function pedido(url: string, body: unknown): NextRequest {
  n += 1;
  return new NextRequest(url, {
    method: "POST",
    // "sec-fetch-site: same-origin" simula o navegador legítimo — a FAIXA 1
    // do CSRF (lib/security/navegacao-cross-site.ts) bloqueia por padrão sem
    // este sinal, exatamente o que este arquivo testa que NÃO deve acontecer
    // para quem tem direito.
    headers: { "content-type": "application/json", "x-forwarded-for": `172.16.0.${n % 250}`, "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

const SESSAO_AGENCIA = { userId: "u1", email: "a@b.c", name: "A", role: "master", workspaceId: "ws1" };
const SESSAO_PORTAL = { ...SESSAO_AGENCIA, userId: "cli-1", clientId: "cli-1" };

beforeEach(() => {
  vi.clearAllMocks();
  generateDesign.mockResolvedValue({ ok: true, url: "data:image/png;base64,x", model: "gpt-image-1" });
  publishPost.mockResolvedValue({ ok: true, externalId: "ig_1" });
  n += 11;
});

describe("/api/generate-image não gera imagem paga para desconhecido", () => {
  it("sem sessão → 401 e NENHUMA chamada ao provedor de imagem", async () => {
    getSession.mockResolvedValue(null);

    const res = await gerarImagem(pedido("http://localhost/api/generate-image", { prompt: "um gato" }));

    expect(res.status).toBe(401);
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("sessão de PORTAL (cliente) → 403: o cliente não decide gastar a chave da agência", async () => {
    getSession.mockResolvedValue(SESSAO_PORTAL);

    const res = await gerarImagem(pedido("http://localhost/api/generate-image", { prompt: "um gato" }));

    expect(res.status).toBe(403);
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("papel desconhecido numa sessão → 403 (o mesmo default negado do login)", async () => {
    getSession.mockResolvedValue({ ...SESSAO_AGENCIA, role: "papel_estranho" });

    const res = await gerarImagem(pedido("http://localhost/api/generate-image", { prompt: "um gato" }));

    expect(res.status).toBe(403);
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("staff de agência gera normalmente, e a chave é a do PRÓPRIO workspace", async () => {
    getSession.mockResolvedValue({ ...SESSAO_AGENCIA, role: "design_staff" });

    const res = await gerarImagem(pedido("http://localhost/api/generate-image", { prompt: "um gato" }));

    expect(res.status).toBe(200);
    expect(generateDesign).toHaveBeenCalledTimes(1);
    expect(generateDesign.mock.calls[0]![0].workspaceId).toBe("ws1");
  });

  it("o mesmo usuário em rajada bate no teto — e o teto para ANTES de gastar", async () => {
    getSession.mockResolvedValue({ ...SESSAO_AGENCIA, userId: `rajada-${Date.now()}` });

    const status: number[] = [];
    for (let i = 0; i < 14; i++) {
      status.push((await gerarImagem(pedido("http://localhost/api/generate-image", { prompt: "x" }))).status);
    }

    expect(status.at(-1)).toBe(429);
    // O teto é o que limita o gasto: menos chamadas ao provedor que requisições.
    expect(generateDesign.mock.calls.length).toBeLessThan(status.length);
  });
});

describe("/api/meta/publish não publica no perfil do cliente sem papel", () => {
  it("sem sessão → 401 e NADA vai para a Graph", async () => {
    getSession.mockResolvedValue(null);

    const res = await publicar(pedido("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));

    expect(res.status).toBe(401);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it.each(["design_staff", "ads_staff", "executivo_comercial"])(
    "%s → 403: produz peça, mas não leva ao ar em nome do cliente",
    async (papel) => {
      getSession.mockResolvedValue({ ...SESSAO_AGENCIA, role: papel });

      const res = await publicar(pedido("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));

      expect(res.status).toBe(403);
      expect(publishPost).not.toHaveBeenCalled();
    },
  );

  it("sessão de PORTAL → 403, mesmo carregando um papel interno no token", async () => {
    getSession.mockResolvedValue({ ...SESSAO_PORTAL, role: "master" });

    const res = await publicar(pedido("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));

    expect(res.status).toBe(403);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it.each(["master", "project_manager", "social_staff"])("%s publica normalmente", async (papel) => {
    getSession.mockResolvedValue({ ...SESSAO_AGENCIA, role: papel, userId: `ok-${papel}-${Date.now()}` });

    const res = await publicar(pedido("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));

    expect(res.status).toBe(200);
    expect(publishPost).toHaveBeenCalledWith("ws1", expect.objectContaining({ connectionId: "c1" }));
  });

  it("um laço de publicação bate no teto — rajada na Graph é o que restringe conta", async () => {
    getSession.mockResolvedValue({ ...SESSAO_AGENCIA, userId: `laco-${Date.now()}` });

    const status: number[] = [];
    for (let i = 0; i < 10; i++) {
      status.push((await publicar(pedido("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }))).status);
    }

    expect(status.at(-1)).toBe(429);
    expect(publishPost.mock.calls.length).toBeLessThan(status.length);
  });
});
