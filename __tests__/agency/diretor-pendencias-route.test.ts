// GET /api/diretor/pendencias — a rota é a única coisa que este teste cobre.
//
// A lógica do veredito já é de `pendencias.ts` (testado em
// `diretor-pendencias.test.ts`) e a leitura do banco já é de `coletor.ts`
// (testado em `diretor-coletor.test.ts`). Aqui importa só a superfície:
//   ⛔ sem sessão, 401 — e o coletor NEM É CHAMADO (não gasta banco por nada);
//   ✅ com sessão, devolve o veredito inteiro, no formato que `pendencias.ts` produz;
//   ✅ o recorte por `?escopo=` chega a `recortarPorEscopo`, de verdade.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.hoisted(() => vi.fn());
const coletarRetratoDasFontes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/diretor/coletor", () => ({
  coletarRetratoDasFontes,
  ESCOPO_DESTE_PRODUTO: "dioli-digital",
}));

import { GET } from "@/app/api/diretor/pendencias/route";

const SESSAO = { userId: "u1", email: "m@dioli.studio", name: "M", role: "master" as const, workspaceId: "ws1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("guarda", () => {
  it("sem sessão: 401, e o coletor nem chega a ser chamado", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/diretor/pendencias"));
    expect(res.status).toBe(401);
    expect(coletarRetratoDasFontes).not.toHaveBeenCalled();
  });
});

describe("o veredito inteiro chega na resposta", () => {
  it("devolve podeEncerrar, pendências (ordenadas) e falhas — o mesmo formato de pendencias.ts", async () => {
    getSession.mockResolvedValue(SESSAO);
    coletarRetratoDasFontes.mockResolvedValue({
      pendencias: [
        { tipo: "bloqueio_aberto", escopo: "dioli-digital", referencia: "a", horasParada: 5, acao: "faça algo" },
        { tipo: "efeito_morto", escopo: "dioli-digital", referencia: "b", horasParada: 40, acao: "reprocesse" },
      ],
      falhas: [],
    });
    const res = await GET(new NextRequest("http://localhost/api/diretor/pendencias"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.podeEncerrar).toBe(false);
    expect(body.motivo).toBe("pendencias_abertas");
    expect(body.pendencias.map((p: { referencia: string }) => p.referencia)).toEqual(["b", "a"]); // 40h antes de 5h
  });

  it("falha de fonte vira 'auditoria_incompleta' na resposta, nunca 'ok' escondido", async () => {
    getSession.mockResolvedValue(SESSAO);
    coletarRetratoDasFontes.mockResolvedValue({
      pendencias: [],
      falhas: [{ fonte: "bloqueios-canonicos", erro: "banco indisponível" }],
    });
    const res = await GET(new NextRequest("http://localhost/api/diretor/pendencias"));
    const body = await res.json();
    expect(body.podeEncerrar).toBe(false);
    expect(body.motivo).toBe("auditoria_incompleta");
  });

  it("?escopo= chega a recortarPorEscopo de verdade: escopo sem pendência libera", async () => {
    getSession.mockResolvedValue(SESSAO);
    coletarRetratoDasFontes.mockResolvedValue({
      pendencias: [{ tipo: "bloqueio_aberto", escopo: "dioli-digital", referencia: "a", horasParada: 5, acao: "x" }],
      falhas: [],
    });
    const res = await GET(new NextRequest("http://localhost/api/diretor/pendencias?escopo=foocci"));
    const body = await res.json();
    // Este coletor só produz pendência com escopo "dioli-digital" — pedir por
    // "foocci" não encontra nada AQUI, e isto é o comportamento certo (ver o
    // cabeçalho de coletor.ts): este produto não fala pelos outros.
    expect(body.podeEncerrar).toBe(true);
  });
});
