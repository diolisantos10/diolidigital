// As rotas do cofre (04/10/2026): estado, pedido manual de pareamento e prova
// real. Papéis certos, e o segredo NUNCA na resposta.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Sessao = { userId: string; email: string; name: string; role: string; workspaceId: string; clientId?: string } | null;
const sessao = vi.hoisted(() => ({ atual: null as Sessao }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async (): Promise<Sessao> => sessao.atual) }));
const par = vi.hoisted(() => ({
  resumo: vi.fn(async (): Promise<{ estado: string; solicitadoEm: string | null; aprovadoEm: string | null; hashInicio: string | null }> =>
    ({ estado: "pendente", solicitadoEm: "2026-10-04T15:00:00.000Z", aprovadoEm: null, hashInicio: "abcd1234" })),
  solicitar: vi.fn(async (): Promise<{ ok: boolean; status: number | null; detalhe: string }> => ({ ok: true, status: 202, detalhe: "" })),
}));
vi.mock("@/lib/ai/pareamento-do-cofre", () => ({ resumoDoPareamento: par.resumo, solicitarPareamento: par.solicitar }));
const cofre = vi.hoisted(() => ({
  pedir: vi.fn(async (p: { modalidade: string }): Promise<Record<string, unknown>> =>
    p.modalidade === "text"
      ? { ok: true, texto: "{}", imagemUrl: null, modelo: "deepseek-chat", uso: null, custo: 0.0002 }
      : { ok: true, texto: null, imagemUrl: "data:image/png;base64,AAAA", modelo: "grok-2-image", uso: null, custo: 0.07 }),
}));
vi.mock("@/lib/ai/cofre", () => ({ pedirAoCofre: cofre.pedir }));

import { GET as estado } from "@/app/api/agency/cofre/estado/route";
import { POST as parear } from "@/app/api/agency/cofre/parear/route";
import { POST as prova } from "@/app/api/agency/cofre/prova/route";

const master = { userId: "u", email: "m@x", name: "Diego", role: "master", workspaceId: "w" };
const post = () => new NextRequest("https://www.diolidigital.com.br/x", { method: "POST", headers: { "sec-fetch-site": "same-origin" } });

beforeEach(() => {
  sessao.atual = master;
  par.solicitar.mockClear();
  cofre.pedir.mockClear();
});

describe("GET /api/agency/cofre/estado", () => {
  it("devolve estado, frase e o começo do hash — e nada de segredo", async () => {
    const r = await estado();
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ estado: "pendente", frase: "Aguardando aprovação no cofre.", hashInicio: "abcd1234" });
    expect(Object.keys(j)).not.toContain("segredo");
  });
  it("sem sessão → 401; sessão de portal → 403", async () => {
    sessao.atual = null;
    expect((await estado()).status).toBe(401);
    sessao.atual = { ...master, clientId: "c1" };
    expect((await estado()).status).toBe(403);
  });
});

describe("POST /api/agency/cofre/parear — só master", () => {
  it("master pede, 202", async () => {
    const r = await parear(post());
    expect(r.status).toBe(202);
    expect(par.solicitar).toHaveBeenCalledTimes(1);
  });
  it("outro papel → 403 e nenhum pedido (pedido novo exige clique novo)", async () => {
    sessao.atual = { ...master, role: "social_staff" };
    expect((await parear(post())).status).toBe(403);
    expect(par.solicitar).not.toHaveBeenCalled();
  });
});

describe("POST /api/agency/cofre/prova — só master, só status, modelo e custo", () => {
  it("um texto e uma imagem, e a resposta traz só o resumo", async () => {
    const r = await prova(post());
    const j = (await r.json()) as { texto: Record<string, unknown>; imagem: Record<string, unknown> };
    expect(j.texto).toEqual({ status: "ok", modelo: "deepseek-chat", custo: 0.0002 });
    expect(j.imagem).toEqual({ status: "ok", modelo: "grok-2-image", custo: 0.07 });
    expect(cofre.pedir.mock.calls.map((c) => c[0].modalidade).sort()).toEqual(["image", "text"]);
  });
  it("outro papel → 403 e nada gasto", async () => {
    sessao.atual = { ...master, role: "project_manager" };
    expect((await prova(post())).status).toBe(403);
    expect(cofre.pedir).not.toHaveBeenCalled();
  });
});
