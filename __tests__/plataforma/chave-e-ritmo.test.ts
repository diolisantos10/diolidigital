// Dois furos de custo achados pela 7ª auditoria adversarial (S6 e S7), e a
// telemetria que os subestimava.
//
// S6 — a transcrição do portal gastava a chave de QUALQUER workspace:
//   `resolveProviderKey("openai")` sem workspaceId cai num `findFirst` por
//   qualquer linha do banco. Latente com uma agência só; estrutural na segunda.
//   O token já sabe de quem é: `resolvePortalClient` devolve cliente e
//   workspace. Estava escrito e não era usado.
//
// S7 — o balde do rate limit tinha chave que o CHAMADOR escrevia:
//   `x-forwarded-for` é uma lista que cada proxy APENDA no fim; o começo é o
//   que o cliente mandou. Lendo o primeiro item, `X-Forwarded-For: <aleatório>`
//   a cada requisição dava um balde novo por chamada — num endpoint que gasta
//   chave de IA paga. Atrás de proxy, o IP confiável é o ÚLTIMO salto.
//
// CUSTO — `chamadasPagas`: o número "≈US$ 0,011 por ciclo" estava escrito à mão
//   num comentário e ignorava a retentativa (até 2+1+1 = 4 chamadas pagas).
//   Agora o gasto é MEDIDO e volta no resultado.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── S7: a chave do balde ─────────────────────────────────────────────────────

import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { chamadasPagasNoPiorCaso } from "@/lib/ai/visao";

function comXff(valor: string | null, real?: string): Request {
  const headers: Record<string, string> = {};
  if (valor !== null) headers["x-forwarded-for"] = valor;
  if (real) headers["x-real-ip"] = real;
  return new Request("http://localhost/x", { headers });
}

describe("clientIp — o IP confiável é o ÚLTIMO salto, não o primeiro", () => {
  it("o item que o CLIENTE forjou no início é ignorado", async () => {
    // "1.2.3.4" é texto que o atacante escreveu; "203.0.113.9" foi o proxy da
    // borda quem apendou. Ler o primeiro era ler o atacante.
    expect(clientIp(comXff("1.2.3.4, 203.0.113.9"))).toBe("203.0.113.9");
  });

  it("cabeçalho forjado NÃO zera o balde: duas requisições com XFF diferente caem no MESMO balde", () => {
    const a = clientIp(comXff("aleatorio-1, 203.0.113.9"));
    const b = clientIp(comXff("aleatorio-2, 203.0.113.9"));
    expect(a).toBe(b);
  });

  it("um IP só (sem proxy intermediário declarado) continua funcionando", () => {
    expect(clientIp(comXff("203.0.113.9"))).toBe("203.0.113.9");
  });

  it("sem x-forwarded-for, cai em x-real-ip; sem nenhum, 'unknown'", () => {
    expect(clientIp(comXff(null, "198.51.100.4"))).toBe("198.51.100.4");
    expect(clientIp(comXff(null))).toBe("unknown");
  });

  it("cabeçalho vazio ou só com vírgulas não vira bypass", () => {
    expect(clientIp(comXff(" , , "))).toBe("unknown");
  });

  it("o teto realmente barra quando a chave é estável (a metade que PROTEGE)", () => {
    const chave = `teste:${Math.random()}`;
    expect(rateLimit(chave, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(chave, 2, 60_000).allowed).toBe(true);
    const terceira = rateLimit(chave, 2, 60_000);
    expect(terceira.allowed).toBe(false);
    expect(terceira.retryAfter).toBeGreaterThan(0);
  });
});

// ── Custo medido ─────────────────────────────────────────────────────────────

describe("chamadasPagasNoPiorCaso — o custo derivado do código, não do comentário", () => {
  it("com os três provedores conectados são 4 chamadas pagas: 2 no preferido + 1 em cada reserva", () => {
    expect(chamadasPagasNoPiorCaso(3)).toBe(4);
  });
  it("com um provedor só são 2 (a retentativa do preferido)", () => {
    expect(chamadasPagasNoPiorCaso(1)).toBe(2);
  });
  it("sem provedor nenhum não se gasta nada", () => {
    expect(chamadasPagasNoPiorCaso(0)).toBe(0);
  });
});

// ── S6: a chave da transcrição é a do workspace do token ─────────────────────

const resolvePortalClient = vi.hoisted(() => vi.fn());
const resolveProviderKey = vi.hoisted(() => vi.fn());
const transcreverAudio = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient,
  // 6ª rodada: as rotas de leitura passaram a usar `donoDoPortal`, que separa
  // "token inválido" de "ainda não há ficha de cliente". O dublê DERIVA do
  // mesmo `resolvePortalClient` deste arquivo — nenhuma expectativa mudou.
  donoDoPortal: async (t: string) => (await resolvePortalClient(t)) ?? "invalido",
}));
vi.mock("@/lib/ai/resolve-key", () => ({ resolveProviderKey }));
vi.mock("@/lib/ai/transcricao", async () => {
  const real = await vi.importActual<typeof import("@/lib/ai/transcricao")>("@/lib/ai/transcricao");
  return { ...real, transcreverAudio };
});

import { POST as transcricao } from "@/app/api/portal/transcricao/route";

function pedidoDeAudio(token = "tok-1", bytes = 5_000): NextRequest {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), "audio.webm");
  fd.append("token", token);
  return new NextRequest("http://localhost/api/portal/transcricao", {
    method: "POST",
    body: fd,
    // "sec-fetch-site: same-origin" — a FAIXA 1 do CSRF bloqueia por padrão
    // sem este sinal; aqui simulamos o navegador legítimo do portal.
    headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, "sec-fetch-site": "same-origin" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "cli1", workspaceId: "ws-do-token" });
  resolveProviderKey.mockResolvedValue({ apiKey: "sk-x", source: "ui", model: null });
  transcreverAudio.mockResolvedValue({ ok: true, texto: "quero mudar a cor do fundo" });
});

describe("POST /api/portal/transcricao — quem paga é o workspace do TOKEN", () => {
  it("a chave é resolvida COM o workspaceId derivado do token", async () => {
    const res = await transcricao(pedidoDeAudio());
    expect(res.status).toBe(200);
    expect(resolveProviderKey).toHaveBeenCalledWith("openai", "ws-do-token");
  });

  it("token inválido/revogado/vencido: 403 e a chave NEM é consultada — não se gasta antes de saber quem é", async () => {
    resolvePortalClient.mockResolvedValue(null);
    const res = await transcricao(pedidoDeAudio());
    expect(res.status).toBe(403);
    expect(resolveProviderKey).not.toHaveBeenCalled();
    expect(transcreverAudio).not.toHaveBeenCalled();
  });

  it("o texto ditado NÃO volta em log — só na resposta (é fala do cliente, pode ter PII)", async () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await transcricao(pedidoDeAudio());
    const corpo = await res.json();
    expect(corpo.texto).toBe("quero mudar a cor do fundo");
    const tudoQueFoiLogado = [...aviso.mock.calls, ...log.mock.calls].flat().join(" ");
    expect(tudoQueFoiLogado).not.toContain("quero mudar a cor do fundo");
    aviso.mockRestore();
    log.mockRestore();
  });
});
