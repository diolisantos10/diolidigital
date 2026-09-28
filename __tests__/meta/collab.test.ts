// 1C-C1 (27/09/2026) — `conferirCollaborators`: a ÚNICA leitura que existe
// sobre o estado de um convite de colaboração (não existe endpoint para
// ACEITAR — só o painel do Instagram faz isso).

import { describe, it, expect, vi, beforeEach } from "vitest";

const graphGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/graph", () => ({ graphGet }));

import { conferirCollaborators, convitePendente, INVITE_STATUS_PENDENTE } from "@/lib/integrations/meta/collab";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conferirCollaborators", () => {
  it("devolve os convites com username e invite_status", async () => {
    graphGet.mockResolvedValue({
      data: [
        { username: "parceiro.oficial", invite_status: "PENDING" },
        { username: "outro_parceiro", invite_status: "APPROVED" },
      ],
    });

    const r = await conferirCollaborators("ig_media_1", "tk");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.convites).toEqual([
        { username: "parceiro.oficial", invite_status: "PENDING" },
        { username: "outro_parceiro", invite_status: "APPROVED" },
      ]);
    }
    expect(graphGet).toHaveBeenCalledWith("ig_media_1/collaborators", "tk");
  });

  it("resposta sem `data` vira lista vazia, não erro", async () => {
    graphGet.mockResolvedValue({});
    const r = await conferirCollaborators("ig_media_1", "tk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.convites).toEqual([]);
  });

  it("item malformado (sem username ou invite_status) é descartado, não quebra a leitura", async () => {
    graphGet.mockResolvedValue({
      data: [{ username: "ok_um" }, { invite_status: "PENDING" }, { username: "ok_dois", invite_status: "PENDING" }],
    });
    const r = await conferirCollaborators("ig_media_1", "tk");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.convites).toEqual([{ username: "ok_dois", invite_status: "PENDING" }]);
  });

  it("falha na chamada NUNCA lança — vira { ok: false, error }", async () => {
    graphGet.mockRejectedValue(new Error("ETIMEDOUT"));
    const r = await conferirCollaborators("ig_media_1", "tk");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ETIMEDOUT");
  });
});

describe("convitePendente", () => {
  it("reconhece 'pending' sem diferenciar caixa", () => {
    expect(convitePendente({ username: "a", invite_status: "PENDING" })).toBe(true);
    expect(convitePendente({ username: "a", invite_status: "pending" })).toBe(true);
    expect(convitePendente({ username: "a", invite_status: INVITE_STATUS_PENDENTE })).toBe(true);
  });

  it("não reconhece aprovado/recusado como pendente", () => {
    expect(convitePendente({ username: "a", invite_status: "APPROVED" })).toBe(false);
    expect(convitePendente({ username: "a", invite_status: "DECLINED" })).toBe(false);
  });
});
