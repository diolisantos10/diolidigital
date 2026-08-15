// DESFAZER O CLIQUE QUE NINGUÉM QUIS DAR — e não desfazer mais nada.
//
// O CEO abriu o portal da CityJobs procurando os criativos, apertou "Aprovar as
// entregas prontas" e pediu para cancelar. O que aquele clique gravou:
// `Project.clientApprovedAt` e os `ApprovalRequest` prontos como
// `approved` / `reviewedBy:"cliente"` / `reviewedAt`.
//
// O que estes testes travam, e por que cada um existe:
//
//   1. A rota nasce FECHADA: sem CRON_SECRET → 503; segredo errado → 401.
//      Uma rota que se abre sozinha quando a variável some é uma rota sem
//      trava, e esta DESFAZ decisão registrada de cliente.
//   2. O padrão é LEITURA PURA: sem ?aplicar=1 nada é gravado, e o relatório
//      mostra item por item o que MUDARIA. É o "mostra antes de gravar".
//   3. ⭐ NÃO TOCA aprovação `client:<nome>` — a decisão de verdade do cliente.
//      É o teste que o despacho pediu por nome, e o que separa "desfazer um
//      clique" de "reescrever histórico".
//   4. Nem carimbo `equipe:<email>`.
//   5. Só o MESMO INSTANTE: carimbo seco fora da janela do `clientApprovedAt`
//      não é deste clique e fica de pé.
//   6. Idempotente: o projeto entra pela janela do carimbo; revertido, ele não
//      entra mais. Segunda passada volta "nada_a_reverter".
//   7. Deixa RASTRO: ActivityEvent com autor e motivo. Sem autor ou sem motivo,
//      não roda.
//   8. Não publica e não mexe em peça: nenhum `socialPost.update*` é chamado.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  project: { findMany: vi.fn(), update: vi.fn() },
  approvalRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  socialPost: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { POST as desfazerPelaRota } from "@/app/api/admin/reverter-aprovacao-do-pacote/route";
import {
  reverterAprovacaoDoPacote,
  ehCarimboDoPacoteAntigo,
  lerCarimbo,
  JANELA_MAXIMA_MINUTOS,
} from "@/lib/agency/esteira/reverter-aprovacao-do-pacote";

const SEGREDO = "segredo-de-cron-para-teste";

/** O instante do clique. `aprovarPacote` grava o MESMO `Date` no carimbo do
 *  projeto e no `reviewedAt` de cada card — é essa coincidência que identifica
 *  o clique. */
const CLIQUE = new Date("2026-08-15T13:40:00.000Z");

const PEDIDO = { cliente: "CityJobs", autor: "Dioli (CEO)", motivo: "clique acidental — queria ver as peças" };

function projeto(over: Record<string, unknown> = {}) {
  return {
    id: "p1", name: "CityJobs — lançamento", workspaceId: "ws1", clientId: "cli-cityjobs",
    clientRequestId: "cr1", clientApprovedAt: CLIQUE, ...over,
  };
}

/** Um card aprovado. O padrão é o carimbo seco do pacote, no instante do clique. */
function card(id: string, over: Record<string, unknown> = {}) {
  return { id, department: "social-media", reviewedBy: "cliente", reviewedAt: CLIQUE, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // "Agora" é dois minutos depois do clique: dentro de qualquer janela.
  vi.setSystemTime(new Date("2026-08-15T13:42:00.000Z"));
  process.env.CRON_SECRET = SEGREDO;
  db.client.findMany.mockResolvedValue([{ id: "cli-cityjobs", name: "CityJobs" }]);
  db.project.findMany.mockResolvedValue([projeto()]);
  db.project.update.mockResolvedValue({});
  db.approvalRequest.findMany.mockResolvedValue([card("ap1"), card("ap2", { department: "design" })]);
  db.approvalRequest.updateMany.mockResolvedValue({ count: 2 });
  db.activityEvent.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

function pedir(query: string, segredo = SEGREDO) {
  return new NextRequest(`http://localhost/api/admin/reverter-aprovacao-do-pacote?${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${segredo}` },
  });
}

// ─── 1. A PORTA ─────────────────────────────────────────────────────────────

describe("a rota nasce fechada", () => {
  it("sem CRON_SECRET no ambiente → 503, e nada é lido", async () => {
    delete process.env.CRON_SECRET;
    const res = await desfazerPelaRota(pedir("cliente=CityJobs&autor=a&motivo=b"));
    expect(res.status).toBe(503);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("segredo errado → 401", async () => {
    const res = await desfazerPelaRota(pedir("cliente=CityJobs&autor=a&motivo=b", "outro-segredo"));
    expect(res.status).toBe(401);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("sem ?cliente → 400: desfazer a casa inteira apaga decisão de quem não pediu", async () => {
    const res = await desfazerPelaRota(pedir("autor=a&motivo=b"));
    expect(res.status).toBe(400);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });
});

// ─── 2. MOSTRA ANTES DE GRAVAR ──────────────────────────────────────────────

describe("leitura pura por padrão", () => {
  it("sem ?aplicar=1 NADA é gravado", async () => {
    const r = await reverterAprovacaoDoPacote(PEDIDO);
    expect(r.situacao).toBe("so_medi");
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });

  it("mostra ITEM POR ITEM o que mudaria — não só a contagem", async () => {
    const r = await reverterAprovacaoDoPacote(PEDIDO);
    expect(r.projetos).toHaveLength(1);
    expect(r.projetos[0]!.projeto).toBe("CityJobs — lançamento");
    expect(r.projetos[0]!.limpaCarimboDoProjeto).toBe(true);
    expect(r.projetos[0]!.reverte.map((c) => c.id)).toEqual(["ap1", "ap2"]);
    // O que estava gravado aparece ANTES de qualquer escrita.
    expect(r.projetos[0]!.reverte[0]!.reviewedBy).toBe("cliente");
    expect(r.cardsRevertidos).toBe(2);
  });

  it("a rota diz, na própria resposta, que não gravou", async () => {
    const res = await desfazerPelaRota(pedir("cliente=CityJobs&autor=Dioli&motivo=engano"));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.situacao).toBe("so_medi");
    expect(j.aviso).toMatch(/nada foi gravado/i);
  });
});

// ─── 3. ⭐ NÃO VARRE APROVAÇÃO LEGÍTIMA DO CLIENTE ──────────────────────────

describe("a reversão é ESTREITA — o que não é aquele clique fica de pé", () => {
  it("⭐ NÃO toca `client:<nome>`: a assinatura de quem assinou de verdade", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card("ap-seco"),
      card("ap-do-cliente", { reviewedBy: "client:Dioli Santos" }),
    ]);

    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });

    // Só o carimbo seco entra na lista de reversão.
    expect(r.projetos[0]!.reverte.map((c) => c.id)).toEqual(["ap-seco"]);
    expect(db.approvalRequest.updateMany.mock.calls[0][0].where.id.in).toEqual(["ap-seco"]);
    // E o card do cliente aparece PRESERVADO, com o motivo — não some do relato.
    const preservado = r.projetos[0]!.preserva.find((c) => c.id === "ap-do-cliente")!;
    expect(preservado.leitura).toBe("decisao_do_cliente");
    expect(preservado.motivo).toMatch(/assinatura/i);
  });

  it("⭐ havendo decisão `client:` no mesmo instante, o carimbo do PROJETO fica", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card("ap-seco"),
      card("ap-do-cliente", { reviewedBy: "client:Dioli Santos" }),
    ]);

    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });

    // O `clientApprovedAt` é sustentado por uma aprovação de verdade: apagá-lo
    // desfaria a decisão dela, não a do clique.
    expect(r.projetos[0]!.limpaCarimboDoProjeto).toBe(false);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("⭐ só há aprovação `client:` → NADA é revertido, nem card nem carimbo", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card("ap-do-cliente", { reviewedBy: "client:Dioli Santos" })]);

    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });

    expect(r.situacao).toBe("nada_a_reverter");
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("NÃO toca carimbo de equipe (`equipe:<email>`)", async () => {
    db.approvalRequest.findMany.mockResolvedValue([card("ap-equipe", { reviewedBy: "equipe:pm@dioli.com.br" })]);

    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });

    expect(r.situacao).toBe("nada_a_reverter");
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it("carimbo seco FORA do instante do clique não é deste clique — fica de pé", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      card("ap-agora"),
      // Uma hora antes: outro clique, outro dia de trabalho.
      card("ap-antigo", { reviewedAt: new Date(CLIQUE.getTime() - 3_600_000) }),
    ]);

    const r = await reverterAprovacaoDoPacote(PEDIDO);

    expect(r.projetos[0]!.reverte.map((c) => c.id)).toEqual(["ap-agora"]);
  });

  it("clique fora da JANELA nem é considerado", async () => {
    // O carimbo do projeto está 3 dias atrás; a janela padrão são 4 horas — e a
    // consulta pede `clientApprovedAt >= desde`, então o banco não devolve nada.
    db.project.findMany.mockResolvedValue([]);
    const r = await reverterAprovacaoDoPacote(PEDIDO);
    expect(r.situacao).toBe("nada_a_reverter");
    const filtro = db.project.findMany.mock.calls[0][0].where;
    expect(filtro.clientApprovedAt.gte).toBeInstanceOf(Date);
  });

  it("a janela tem teto — reversão não vira reescrita de histórico", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, janelaMinutos: 999_999 });
    const filtro = db.project.findMany.mock.calls[0][0].where;
    const minutos = (Date.now() - filtro.clientApprovedAt.gte.getTime()) / 60_000;
    expect(minutos).toBe(JANELA_MAXIMA_MINUTOS);
  });

  it("nome ambíguo RECUSA em vez de escolher", async () => {
    db.client.findMany.mockResolvedValue([
      { id: "c1", name: "CityJobs" }, { id: "c2", name: "CityJobs Recrutamento" },
    ]);
    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    expect(r.situacao).toBe("nome_ambiguo");
    expect(db.project.findMany).not.toHaveBeenCalled();
  });
});

// ─── 4. O QUE A REVERSÃO GRAVA ──────────────────────────────────────────────

describe("aplicar: o que volta ao lugar", () => {
  it("os cards voltam a `pending`, SEM autor e SEM data", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    const escrita = db.approvalRequest.updateMany.mock.calls[0][0];
    expect(escrita.data).toEqual({ status: "pending", reviewedBy: null, reviewedAt: null });
  });

  it("o `where` da escrita repete as duas condições — quem decidiu no meio não é atropelado", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    const onde = db.approvalRequest.updateMany.mock.calls[0][0].where;
    expect(onde.status).toBe("approved");
    expect(onde.reviewedBy).toBe("cliente");
  });

  it("o carimbo do projeto volta a nulo — e o `stage` NÃO é inventado", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    const escrita = db.project.update.mock.calls[0][0];
    expect(escrita.data).toEqual({ clientApprovedAt: null });
  });

  it("as duas escritas vão numa transação — meio-caminho é pior que não desfazer", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(2);
  });
});

// ─── 5. O RASTRO ────────────────────────────────────────────────────────────

describe("desfazer sem rastro é pior que não desfazer", () => {
  it("grava ActivityEvent com AUTOR, MOTIVO e os ids afetados", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    const evento = db.activityEvent.create.mock.calls[0][0].data;
    expect(evento.type).toBe("aprovacao_do_pacote_revertida");
    expect(evento.projectId).toBe("p1");
    expect(evento.workspaceId).toBe("ws1");
    expect(evento.message).toContain("Dioli (CEO)");
    expect(evento.message).toContain("clique acidental");
    expect(evento.message).toContain("ap1");
  });

  it("sem AUTOR não roda — e nem lê o banco", async () => {
    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, autor: "  ", aplicar: true });
    expect(r.situacao).toBe("sem_autor");
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it("sem MOTIVO não roda", async () => {
    const r = await reverterAprovacaoDoPacote({ ...PEDIDO, motivo: "", aplicar: true });
    expect(r.situacao).toBe("sem_motivo");
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
});

// ─── 6. IDEMPOTÊNCIA ────────────────────────────────────────────────────────

describe("rodar duas vezes não faz mal", () => {
  it("segunda passada não encontra o projeto (carimbo já nulo) e volta `nada_a_reverter`", async () => {
    const primeira = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    expect(primeira.situacao).toBe("revertido");

    // Depois da reversão o `clientApprovedAt` é nulo: o filtro `gte` não o pega.
    db.project.findMany.mockResolvedValue([]);
    vi.clearAllMocks();
    db.client.findMany.mockResolvedValue([{ id: "cli-cityjobs", name: "CityJobs" }]);
    db.project.findMany.mockResolvedValue([]);

    const segunda = await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    expect(segunda.situacao).toBe("nada_a_reverter");
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
    expect(db.project.update).not.toHaveBeenCalled();
    expect(db.activityEvent.create).not.toHaveBeenCalled();
  });
});

// ─── 7. NÃO PUBLICA E NÃO MEXE EM PEÇA ──────────────────────────────────────

describe("nada publica, nada muda de status", () => {
  it("nenhum SocialPost é escrito", async () => {
    await reverterAprovacaoDoPacote({ ...PEDIDO, aplicar: true });
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.socialPost.updateMany).not.toHaveBeenCalled();
  });

  // Mock não prova ausência de caminho que nem foi importado. É o FONTE que
  // prova — mesma régua de `pacote-da-peca.test.ts`.
  it("o FONTE não conhece plataforma nenhuma", () => {
    const raiz = process.cwd();
    for (const arquivo of [
      "lib/agency/esteira/reverter-aprovacao-do-pacote.ts",
      "app/api/admin/reverter-aprovacao-do-pacote/route.ts",
    ]) {
      const src = readFileSync(join(raiz, arquivo), "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      for (const proibido of ["publishPost", "graph.facebook", "PUBLICACAO_ORGANICA", "publicarAgendados", "aprovarCalendario"]) {
        expect(src, `${arquivo} não pode citar ${proibido}`).not.toContain(proibido);
      }
    }
  });
});

// ─── 8. A RÉGUA DO CARIMBO, PURA ────────────────────────────────────────────

describe("quem é alvo e quem não é", () => {
  it("só a string seca `cliente` é o carimbo do pacote antigo", () => {
    expect(ehCarimboDoPacoteAntigo("cliente")).toBe(true);
    expect(ehCarimboDoPacoteAntigo(" Cliente ")).toBe(true);
    expect(ehCarimboDoPacoteAntigo("client:Dioli")).toBe(false);
    expect(ehCarimboDoPacoteAntigo("equipe:pm@dioli.com.br")).toBe(false);
    expect(ehCarimboDoPacoteAntigo(null)).toBe(false);
  });

  it("cada grafia é lida como o que ela é", () => {
    expect(lerCarimbo("cliente")).toBe("carimbo_do_pacote");
    expect(lerCarimbo("client:Dioli")).toBe("decisao_do_cliente");
    expect(lerCarimbo("equipe:pm@dioli.com.br")).toBe("carimbo_de_equipe");
    expect(lerCarimbo("Quality Director")).toBe("outro");
    // "client:" pelado não é ninguém — e não pode contar como o cliente.
    expect(lerCarimbo("client:")).toBe("outro");
  });
});
