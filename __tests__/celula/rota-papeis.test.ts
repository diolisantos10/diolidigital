// `app/api/agency/celula/papeis/route.ts` — a porta que atribui o papel na
// Célula. GET é leitura larga (eGestao); POST é escrita estreita (só
// master), com a MESMA regra conferida de novo dentro de
// `atribuirPapelNaCelula` (defesa em profundidade).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ user: { findMany: vi.fn() } }));
const requireSession = vi.hoisted(() => vi.fn());
const atribuirPapelNaCelula = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
// `responsavelOuNulo` fica REAL (não é hoisted/mock): é uma função pura de
// sanitização, e o GET desta rota depende dela para não devolver dado sujo.
// Mockar o módulo inteiro sem incluí-la faria `undefined(...)` estourar.
vi.mock("@/lib/agency/celula/papel-do-usuario", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agency/celula/papel-do-usuario")>();
  return { ...real, atribuirPapelNaCelula };
});

import { GET, POST } from "@/app/api/agency/celula/papeis/route";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/agency/celula/papeis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/agency/celula/papeis — leitura larga, só do próprio workspace", () => {
  it("master lista as contas do PRÓPRIO workspace", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-1", role: "master", workspaceId: "ws-1" }, error: null });
    db.user.findMany.mockResolvedValue([{ id: "u-1", name: "Master", email: "m@x.com", role: "master", papelNaCelula: null }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // `role: { not: "client" }` entrou no 3º despacho (achado do
        // `interface`: contas de cliente não podem aparecer nesta lista) —
        // o teste passa a exigir o filtro, em vez de só o workspace.
        where: expect.objectContaining({ workspaceId: "ws-1", role: { not: "client" } }),
      }),
    );
  });

  it("diretor e project_manager também leem (eInterno)", async () => {
    for (const role of ["diretor", "project_manager"]) {
      requireSession.mockResolvedValue({ session: { userId: "u-1", role, workspaceId: "ws-1" }, error: null });
      db.user.findMany.mockResolvedValue([]);
      const res = await GET();
      expect(res.status, `role "${role}" deveria ler`).toBe(200);
    }
  });

  it("filtra role \"client\" na CONSULTA — a query já exclui, não só o retorno", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-1", role: "master", workspaceId: "ws-1" }, error: null });
    db.user.findMany.mockResolvedValue([]);

    await GET();
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-1", role: { not: "client" } } }),
    );
  });

  it("NUNCA devolve conta de cliente, mesmo que o mock (banco sujo) devolva uma junto", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-1", role: "master", workspaceId: "ws-1" }, error: null });
    db.user.findMany.mockResolvedValue([
      { id: "u-staff", name: "Staff", email: "s@x.com", role: "executivo_comercial", papelNaCelula: null },
      { id: "u-cliente", name: "Cliente", email: "c@x.com", role: "client", papelNaCelula: null },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.contas.some((c: { role: string }) => c.role === "client")).toBe(false);
    expect(body.contas.map((c: { id: string }) => c.id)).toEqual(["u-staff"]);
  });

  it("department_member (ex.: executivo_comercial, dono da Célula) LÊ — corrigido em 02/09/2026: leitura é larga, achado do `experiencia`", async () => {
    requireSession.mockResolvedValue({
      session: { userId: "u-1", role: "executivo_comercial", workspaceId: "ws-1" },
      error: null,
    });
    db.user.findMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.user.findMany).toHaveBeenCalled();
  });

  it("cliente (`role: \"client\"`) NÃO lê — `/agency/**` é território proibido, sem exceção", async () => {
    requireSession.mockResolvedValue({
      session: { userId: "u-cliente", role: "client", workspaceId: "ws-1" },
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/agency/celula/papeis — só master escreve", () => {
  it("master: chama atribuirPapelNaCelula com o ATOR da sessão, alvo do corpo", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-master", role: "master", workspaceId: "ws-1" }, error: null });
    atribuirPapelNaCelula.mockResolvedValue({ ok: true, alvoUserId: "u-alvo", papel: "sdr" });

    const res = await POST(post({ userId: "u-alvo", papel: "sdr" }));
    expect(res.status).toBe(200);
    expect(atribuirPapelNaCelula).toHaveBeenCalledWith({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      papel: "sdr",
    });
  });

  it("não-master: 403 na PRÓPRIA rota — nem chega a chamar atribuirPapelNaCelula", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-2", role: "diretor", workspaceId: "ws-1" }, error: null });

    const res = await POST(post({ userId: "u-alvo", papel: "sdr" }));
    expect(res.status).toBe(403);
    expect(atribuirPapelNaCelula).not.toHaveBeenCalled();
  });

  it("alvo de outro workspace: a função devolve 'alvo_nao_encontrado' e a rota mapeia para 404", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-master", role: "master", workspaceId: "ws-1" }, error: null });
    atribuirPapelNaCelula.mockResolvedValue({
      ok: false,
      codigo: "alvo_nao_encontrado",
      motivo: "usuário não encontrado.",
    });

    const res = await POST(post({ userId: "u-de-outro-workspace", papel: "sdr" }));
    expect(res.status).toBe(404);
  });

  it("papel inválido: a função devolve 'papel_invalido' e a rota mapeia para 400", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-master", role: "master", workspaceId: "ws-1" }, error: null });
    atribuirPapelNaCelula.mockResolvedValue({
      ok: false,
      codigo: "papel_invalido",
      motivo: "papel inválido.",
    });

    const res = await POST(post({ userId: "u-alvo", papel: "CEO" }));
    expect(res.status).toBe(400);
  });

  it("corpo sem userId: 400, sem sequer chamar atribuirPapelNaCelula", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-master", role: "master", workspaceId: "ws-1" }, error: null });
    const res = await POST(post({ papel: "sdr" }));
    expect(res.status).toBe(400);
    expect(atribuirPapelNaCelula).not.toHaveBeenCalled();
  });

  it("alvo é conta de cliente: a função devolve 'alvo_e_cliente' e a rota mapeia para 400", async () => {
    requireSession.mockResolvedValue({ session: { userId: "u-master", role: "master", workspaceId: "ws-1" }, error: null });
    atribuirPapelNaCelula.mockResolvedValue({
      ok: false,
      codigo: "alvo_e_cliente",
      motivo: "contas de cliente do portal nunca recebem papel operacional na Célula.",
    });

    const res = await POST(post({ userId: "u-cliente", papel: "sdr" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.codigo).toBe("alvo_e_cliente");
  });
});
