// `lib/agency/celula/papel-do-usuario.ts` — a origem de verdade do papel na
// Célula. Prova as duas metades: LEITURA fail-closed e ESCRITA nas três
// regras, nesta ordem: quem atribui → posse do alvo → valor válido.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { buscarPapelNaCelula, atribuirPapelNaCelula } from "@/lib/agency/celula/papel-do-usuario";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buscarPapelNaCelula — leitura fail-closed", () => {
  it("usuário inexistente: null", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await buscarPapelNaCelula("u-fantasma")).toBeNull();
  });

  it("valor gravado bate com RESPONSAVEIS: devolve o papel", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "sdr" });
    expect(await buscarPapelNaCelula("u-1")).toBe("sdr");
  });

  it("valor gravado NÃO bate com RESPONSAVEIS (dado sujo): null, nunca vira permissão", async () => {
    db.user.findUnique.mockResolvedValue({ papelNaCelula: "CEO" });
    expect(await buscarPapelNaCelula("u-1")).toBeNull();
  });

  it("sem userId: null, sem sequer consultar o banco", async () => {
    expect(await buscarPapelNaCelula("")).toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("atribuirPapelNaCelula — as três regras, nesta ordem", () => {
  it("master atribui com sucesso a alguém do mesmo workspace", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u-alvo" });
    db.user.update.mockResolvedValue({ id: "u-alvo" });

    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      papel: "gerente_de_atendimento",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.papel).toBe("gerente_de_atendimento");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u-alvo" },
      data: { papelNaCelula: "gerente_de_atendimento" },
    });
  });

  it("não-master é recusado — nem chega a consultar o alvo", async () => {
    const r = await atribuirPapelNaCelula({
      atorUserId: "u-diretor",
      atorAutoridade: "director",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      papel: "sdr",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("sem_autoridade");
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("director e project_manager também são recusados — só master, sem exceção", async () => {
    for (const autoridade of ["director", "project_manager", "department_member"]) {
      const r = await atribuirPapelNaCelula({
        atorUserId: "u-x",
        atorAutoridade: autoridade,
        atorWorkspaceId: "ws-1",
        alvoUserId: "u-alvo",
        papel: "sdr",
      });
      expect(r.ok, `autoridade "${autoridade}" não deveria conseguir atribuir`).toBe(false);
    }
  });

  it("alvo de OUTRO workspace: 'não encontrado' — não revela que o id existe alhures", async () => {
    // Simula o Prisma de verdade: a busca leva `workspaceId` no `where`, e um
    // alvo de outro workspace nunca bate — devolve null, exatamente como
    // "usuário não existe".
    db.user.findFirst.mockResolvedValue(null);

    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-de-outro-workspace",
      papel: "sdr",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("alvo_nao_encontrado");
    expect(db.user.update).not.toHaveBeenCalled();
    // A busca do alvo PRECISA levar o workspace do ator no where — sem isso,
    // a checagem de posse não checa posse nenhuma.
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u-de-outro-workspace", workspaceId: "ws-1" },
      select: { id: true, role: true },
    });
  });

  it("valor inválido é recusado, mesmo vindo de master", async () => {
    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      // @ts-expect-error — exatamente o valor que a trava tem que barrar.
      papel: "CEO",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("papel_invalido");
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("alvo é conta de cliente do portal: recusado ANTES de gravar, mesmo sendo do workspace certo", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u-cliente", role: "client" });

    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-cliente",
      papel: "gerente_de_atendimento",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("alvo_e_cliente");
    expect(db.user.update).not.toHaveBeenCalled();
    // A checagem de posse (workspace) roda ANTES: a busca leva `role` no
    // `select`, prova de que a trava lê o dado real, não infere de outro
    // lugar.
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u-cliente", workspaceId: "ws-1" },
      select: { id: true, role: true },
    });
  });

  it("alvo staff (role !== client) continua funcionando normalmente", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u-alvo", role: "social_staff" });
    db.user.update.mockResolvedValue({ id: "u-alvo" });

    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      papel: "sdr",
    });

    expect(r.ok).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u-alvo" },
      data: { papelNaCelula: "sdr" },
    });
  });

  it("papel: null remove o papel — e é um valor válido, não um erro", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u-alvo" });
    db.user.update.mockResolvedValue({ id: "u-alvo" });

    const r = await atribuirPapelNaCelula({
      atorUserId: "u-master",
      atorAutoridade: "master",
      atorWorkspaceId: "ws-1",
      alvoUserId: "u-alvo",
      papel: null,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.papel).toBeNull();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u-alvo" },
      data: { papelNaCelula: null },
    });
  });
});
