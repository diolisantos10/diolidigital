// A ROTA DO FUNIL — a mesma prova do conserto do header, para a segunda rota
// que sofria do mesmo furo.
//
// `__tests__/celula/jornada-ponta-a-ponta.test.ts` já prova que a rota existe
// e importa `podeNaCelula`/`requireSession`/`workspaceId`. Este arquivo prova
// especificamente o que mudou em 02/09/2026: o papel na Célula vem do banco
// (`User.papelNaCelula`), nunca mais de `x-papel-na-celula` — nem como fonte,
// nem como fallback.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const CAMINHO = "app/api/agency/oportunidades/[id]/funil/route.ts";
const fonte = readFileSync(CAMINHO, "utf-8");

describe("🔴 a rota do funil — a fonte não lê mais o header", () => {
  it("não há mais leitura de x-papel-na-celula no código (só pode sobrar em comentário histórico, se sobrar)", () => {
    expect(fonte).not.toMatch(/headers\.get\(\s*["'`]x-papel-na-celula["'`]\s*\)/);
  });

  it("usa buscarPapelNaCelula do banco", () => {
    expect(fonte).toContain("@/lib/agency/celula/papel-do-usuario");
    expect(fonte).toContain("buscarPapelNaCelula");
  });

  // ── 02/09/2026 — achado do `experiencia`: cast vs. conversão ─────────────
  // Mesma classe de furo de `fila-diaria/route.ts`: `session.role` é
  // `AgencyRole` (pt); `Autoridade` é outro vocabulário. `autoridadeDoPapel`
  // é o conversor certo — ver `__tests__/celula/role-diretor-conversao.test.ts`
  // para a prova do efeito na trava incondicional.
  it("usa autoridadeDoPapel — NÃO faz `session.role as Autoridade`", () => {
    expect(fonte).toContain("autoridadeDoPapel");
    expect(fonte).toContain("@/lib/agency/roles");
    expect(fonte).not.toMatch(/session\.role\s+as\s+Autoridade/);
  });
});

// ── A PROVA EM EXECUÇÃO ─────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  oportunidade: { findFirst: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());
const avancarFunil = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ ok: true; de: string; para: string }> => ({ ok: true, de: "qualificada", para: "abordada" }),
  ),
);
const estadoDoFunil = vi.hoisted(() => vi.fn(async (): Promise<string> => "encontrada"));
const trilhaDoFunil = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/celula/trilha", () => ({ estadoDoFunil, trilhaDoFunil, avancarFunil }));

import { POST } from "@/app/api/agency/oportunidades/[id]/funil/route";

const SESSAO = { userId: "u-1", role: "master", workspaceId: "ws-1" };
const CTX = { params: Promise.resolve({ id: "op-1" }) };

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/agency/oportunidades/op-1/funil", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /[id]/funil — o banco é a ÚNICA fonte do papel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO, error: null });
    db.oportunidade.findFirst.mockResolvedValue({ id: "op-1" });
  });

  it("sem papel gravado no banco: 403, avancarFunil nunca chamado", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const res = await POST(post({ para: "abordada" }), CTX);
    expect(res.status).toBe(403);
    expect(avancarFunil).not.toHaveBeenCalled();
  });

  it("com 'gerente_de_atendimento' no banco: guarda passa, avancarFunil é chamado", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "gerente_de_atendimento" });
    const res = await POST(post({ para: "abordada" }), CTX);
    expect(res.status).toBe(200);
    expect(avancarFunil).toHaveBeenCalledOnce();
  });

  it("🔴 header 'x-papel-na-celula' forjado não muda o resultado — só o banco decide", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const res = await POST(post({ para: "abordada" }, { "x-papel-na-celula": "gerente_de_atendimento" }), CTX);
    expect(res.status, "o header forjado tinha que ser ignorado").toBe(403);
    expect(avancarFunil).not.toHaveBeenCalled();
  });

  it("posse continua antes do papel: oportunidade de outro workspace é 404, mesmo com papel de gerente no banco", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "gerente_de_atendimento" });
    db.oportunidade.findFirst.mockResolvedValue(null);
    const res = await POST(post({ para: "abordada" }), CTX);
    expect(res.status).toBe(404);
    expect(avancarFunil).not.toHaveBeenCalled();
  });
});

// ── 02/09/2026 — achado do `experiencia`: role "diretor" (não "master") ────
// Nunca testado antes nesta suíte, que só usava "master". A conversão
// (`autoridadeDoPapel`) não muda o resultado observável destas duas ações
// aqui (nem "autorizar_envio" nem a posse dependem do valor exato de
// `autoridade`) — o que muda é o valor que chegaria a uma trava incondicional
// se esta rota um dia expusesse "aprovar_modelo"/"pausar_modelo"/
// "operar_fila_de_excecoes", o que ela NÃO faz hoje. Prova completa do efeito
// da conversão nas travas: `__tests__/celula/role-diretor-conversao.test.ts`.
const SESSAO_DIRETOR = { userId: "u-diretor", role: "diretor", workspaceId: "ws-1" };

describe("POST /[id]/funil — role 'diretor': caminho feliz não regride", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: SESSAO_DIRETOR, error: null });
    db.oportunidade.findFirst.mockResolvedValue({ id: "op-1" });
  });

  it("com 'gerente_de_atendimento' no banco: guarda passa, avancarFunil é chamado", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "gerente_de_atendimento" });
    const res = await POST(post({ para: "abordada" }), CTX);
    expect(res.status).toBe(200);
    expect(avancarFunil).toHaveBeenCalledOnce();
  });

  it("sem papel gravado no banco: 403, igual ao comportamento de 'master'", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: null });
    const res = await POST(post({ para: "abordada" }), CTX);
    expect(res.status).toBe(403);
    expect(avancarFunil).not.toHaveBeenCalled();
  });
});
