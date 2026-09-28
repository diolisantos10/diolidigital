// Mídia fora de spec nunca alcança a Meta — 422 sem sair do próprio processo
// de validação. E domínio fora da allowlist / SSRF nunca chegam a um fetch de
// verdade.

import { describe, it, expect, beforeEach, vi } from "vitest";

const confereUrlExternaSegura = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true } | { ok: false; motivo: string }> => ({ ok: true })),
);
vi.mock("@/lib/security/url-externa-segura", () => ({ confereUrlExternaSegura }));

const guardarArquivo = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; arquivo: { id: string } }> => ({ ok: true, arquivo: { id: "med_123" } })),
);
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo }));

import { dominioPermitido, dominiosPermitidosDeEnv, baixarEValidarMidiaExterna } from "@/lib/integracoes/cityjobs/midia";

const DOMINIOS = ["cdn.cityjobs.example.com"];

function mockFetchSequencia(respostas: Array<Partial<Response> & { headers: Headers; ok: boolean; status?: number; arrayBuffer?: () => Promise<ArrayBuffer> }>) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i++;
    return r as unknown as Response;
  }));
}

function jpegBytes(n: number): ArrayBuffer {
  return new Uint8Array(n).buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  confereUrlExternaSegura.mockResolvedValue({ ok: true });
});

describe("allowlist de domínio", () => {
  it("aceita o domínio exato", () => {
    expect(dominioPermitido("https://cdn.cityjobs.example.com/x.jpg", DOMINIOS)).toBe(true);
  });
  it("aceita subdomínio do domínio cadastrado", () => {
    expect(dominioPermitido("https://a.cdn.cityjobs.example.com/x.jpg", DOMINIOS)).toBe(true);
  });
  it("recusa domínio fora da lista", () => {
    expect(dominioPermitido("https://evil.example.com/x.jpg", DOMINIOS)).toBe(false);
  });
  it("recusa domínio-pai do cadastrado (não é o contrário)", () => {
    expect(dominioPermitido("https://example.com/x.jpg", DOMINIOS)).toBe(false);
  });
  it("lista vazia nunca permite nada", () => {
    expect(dominioPermitido("https://cdn.cityjobs.example.com/x.jpg", [])).toBe(false);
  });
  it("lê a lista da env, separada por vírgula", () => {
    expect(dominiosPermitidosDeEnv({ CITYJOBS_DOMINIOS_DE_MIDIA: "a.com, b.com ,c.com" })).toEqual(["a.com", "b.com", "c.com"]);
  });
});

describe("domínio fora da lista → recusa ANTES de qualquer fetch", () => {
  it("nunca chama fetch nem SSRF", async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal("fetch", fetchEspiao);
    const r = await baixarEValidarMidiaExterna({
      url: "https://evil.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("campo_invalido");
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(confereUrlExternaSegura).not.toHaveBeenCalled();
  });
});

describe("SSRF: confereUrlExternaSegura recusando barra antes do fetch de verdade", () => {
  it("propaga o motivo do SSRF sem baixar nada", async () => {
    confereUrlExternaSegura.mockResolvedValue({ ok: false, motivo: "endereço privado" });
    const fetchEspiao = vi.fn();
    vi.stubGlobal("fetch", fetchEspiao);
    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("campo_invalido");
      expect(r.motivo).toContain("endereço privado");
    }
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

describe("mídia fora de spec → 422 sem ir à Meta", () => {
  it("PNG é recusado para feed_imagem (Meta só aceita JPEG)", async () => {
    mockFetchSequencia([
      { ok: true, headers: new Headers({ "content-length": "1000", "content-type": "image/png" }) },
      { ok: true, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => jpegBytes(1000) },
    ]);
    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.png",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("midia_fora_de_spec");
      expect(r.motivo).toMatch(/JPEG/i);
    }
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("arquivo maior que o teto é recusado pelo content-length declarado, sem baixar o corpo", async () => {
    const enorme = 200 * 1024 * 1024; // 200MB > qualquer teto aceito
    mockFetchSequencia([{ ok: true, headers: new Headers({ "content-length": String(enorme) }) }]);
    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.mp4",
      formato: "story",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("midia_fora_de_spec");
  });

  it("JPEG dentro do teto para feed_imagem é aceito e guardado", async () => {
    mockFetchSequencia([
      { ok: true, headers: new Headers({ "content-length": "1000", "content-type": "image/jpeg" }) },
      { ok: true, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => jpegBytes(1000) },
    ]);
    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });
    expect(r).toEqual({ ok: true, mediaAssetId: "med_123", mime: "image/jpeg", bytes: 1000 });
    expect(guardarArquivo).toHaveBeenCalledTimes(1);
  });
});

// ── TIMEOUT DE REDE (seguranca, gap — J4, 28/09/2026) ────────────────────────
// As duas chamadas de rede (HEAD e GET) tinham `redirect: "manual"` mas
// NENHUM timeout — uma origem que nunca responde prenderia a requisição
// inteira. As duas metades: as chamadas de verdade levam `signal`
// (`AbortSignal`); e um timeout de verdade vira recusa legível, não uma
// promessa pendurada para sempre.
describe("timeout de rede (HEAD e GET nunca ficam pendurados)", () => {
  it("o HEAD e o GET são chamados com um AbortSignal", async () => {
    const fetchEspiao = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return { ok: true, headers: new Headers({ "content-length": "1000", "content-type": "image/jpeg" }) } as unknown as Response;
      }
      return {
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => jpegBytes(1000),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchEspiao);

    await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });

    expect(fetchEspiao).toHaveBeenCalledTimes(2);
    for (const chamada of fetchEspiao.mock.calls) {
      const init = chamada[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("HEAD que nunca responde (timeout) recusa com motivo legível, sem baixar nada", async () => {
    const erroDeTimeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") throw erroDeTimeout;
      throw new Error("não deveria chegar ao GET");
    }));

    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/timeout/i);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("GET que nunca responde (timeout) recusa com motivo legível", async () => {
    const erroDeTimeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return { ok: true, headers: new Headers({ "content-length": "1000", "content-type": "image/jpeg" }) } as unknown as Response;
      }
      throw erroDeTimeout;
    }));

    const r = await baixarEValidarMidiaExterna({
      url: "https://cdn.cityjobs.example.com/x.jpg",
      formato: "feed_imagem",
      workspaceId: "w1",
      clientId: "c1",
      dominiosPermitidos: DOMINIOS,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/timeout/i);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });
});
