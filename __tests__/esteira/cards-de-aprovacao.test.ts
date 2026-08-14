// O botão que ABRE o pedido de aprovação — e que NUNCA aprova.
//
// O que estes testes travam, e por que cada um existe:
//
//   1. A rota administrativa nasce FECHADA: sem CRON_SECRET no ambiente → 503;
//      com segredo errado → 401. Uma rota que se abre sozinha quando a variável
//      some é uma rota sem trava nenhuma — e esta escreve no portal de um
//      cliente pagante.
//   2. O padrão é LEITURA PURA. Sem ?criar=1 nada é gravado. É como se confere
//      o estado de produção sem sessão de master e sem risco.
//   3. Ela NÃO APROVA. O card nasce "pending", sem reviewedBy e sem reviewedAt.
//      Este é o teste que impede a rota de virar, num ajuste distraído, o
//      carimbo da agência em nome do cliente que a ordem de 14/08/2026 proíbe.
//   4. IDEMPOTÊNCIA pelo dado: peça já num card pendente não ganha um segundo.
//   5. A sutileza que faz o módulo valer: card "approved" carimbado pela AGÊNCIA
//      (`cliente` seco, `equipe:<email>`) NÃO conta como aprovado — a peça
//      continua elegível, porque a trava de publicação também não o aceita.
//      Tratá-la como pronta a deixaria num limbo: ninguém abriria o card e a
//      publicação nunca abriria a porta.
//   6. Nome ambíguo RECUSA em vez de escolher — abrir o card errado mostra o
//      trabalho de um cliente a outro, e isso não se desfaz.
//   7. O corpo do card é o MESMO das duas rotas (a régua não pode divergir: é o
//      que o portal renderiza para o cliente).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
}));
const createApprovalRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest }));

import { POST as abrirPeloBotao } from "@/app/api/admin/cards-de-aprovacao/route";
import {
  abrirCardsDeAprovacao,
  corpoDoCard,
  triarPecas,
  type PecaDoCard,
} from "@/lib/agency/esteira/cards-de-aprovacao";

const SEGREDO = "segredo-de-cron-para-teste";

/** Uma peça do CityJobs, no estado em que as 6 estavam: carrossel agendado,
 *  compartilhado, com as telas descritas. */
function peca(i: number, over: Partial<PecaDoCard> = {}): PecaDoCard {
  return {
    id: `sp${i}`,
    clientId: "cli-cityjobs",
    caption: `Vaga ${i} — como se candidatar sem perder tempo.`,
    format: "carousel",
    pillar: "vagas",
    status: "scheduled",
    visibility: "compartilhado",
    scenesJson: JSON.stringify([`capa ${i}`, `dor ${i}`, `CTA ${i}`]),
    scheduledFor: new Date(2026, 7, 10 + i),
    ...over,
  };
}
const SEIS = [1, 2, 3, 4, 5, 6].map((i) => peca(i));
const SEIS_IDS = SEIS.map((p) => p.id);

function req(query: string, segredo: string | null = SEGREDO): NextRequest {
  return new NextRequest(`http://localhost/api/admin/cards-de-aprovacao${query}`, {
    method: "POST",
    ...(segredo === null ? {} : { headers: { authorization: `Bearer ${segredo}` } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  db.client.findMany.mockResolvedValue([{ id: "cli-cityjobs", name: "CityJobs" }]);
  db.socialPost.findMany.mockResolvedValue(SEIS);
  db.approvalRequest.findMany.mockResolvedValue([]);
  createApprovalRequest.mockResolvedValue({ id: "ap-novo" });
});

// ── 1. A porta ──────────────────────────────────────────────────────────────

describe("a porta da rota administrativa", () => {
  it("sem CRON_SECRET no ambiente → 503, porta FECHADA (nunca aberta)", async () => {
    delete process.env.CRON_SECRET;
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    expect(res.status).toBe(503);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("segredo errado → 401 e nada é gravado", async () => {
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1", "chute"));
    expect(res.status).toBe(401);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("sem ?cliente → 400: um cliente por chamada, nunca a casa inteira", async () => {
    const res = await abrirPeloBotao(req("?criar=1"));
    expect(res.status).toBe(400);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});

// ── 2. Leitura pura por padrão ──────────────────────────────────────────────

describe("o padrão é medir, não escrever", () => {
  it("sem ?criar=1 NADA é gravado — e o relatório diz quantas peças entrariam", async () => {
    const res = await abrirPeloBotao(req("?cliente=CityJobs"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.situacao).toBe("so_medi");
    expect(j.elegiveis).toBe(6);
    expect(j.approvalRequestId).toBeNull();
    expect(j.aviso).toContain("Leitura pura");
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("só examina peça que AINDA VAI AO AR: o padrão é `scheduled`", async () => {
    await abrirPeloBotao(req("?cliente=CityJobs"));
    const where = db.socialPost.findMany.mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["scheduled"] });
    expect(where.clientId).toBe("cli-cityjobs");
  });

  it("estado inventado é descartado — `published` nunca entra na seleção", async () => {
    await abrirPeloBotao(req("?cliente=CityJobs&estados=published,draft"));
    const where = db.socialPost.findMany.mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["draft"] });
  });
});

// ── 3. Ela abre o pedido. Ela NÃO aprova. ───────────────────────────────────

describe("abrir não é aprovar", () => {
  it("com ?criar=1 abre UM card PENDENTE, sem autor e sem data de decisão", async () => {
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.situacao).toBe("criado");
    expect(j.approvalRequestId).toBe("ap-novo");

    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    const arg = createApprovalRequest.mock.calls[0]![0];
    expect(arg.clientId).toBe("cli-cityjobs");
    expect(arg.clientVisible).toBe(true);
    expect(arg.department).toBe("social-media");
    expect(arg.sourcePostIds).toEqual(SEIS_IDS);

    // A LINHA QUE IMPORTA: nada aqui carimba uma decisão. Se algum dia um
    // `status`, um `reviewedBy` ou um `reviewedAt` aparecer neste objeto, a rota
    // virou o carimbo da agência em nome do cliente — e é isso que a ordem do
    // CEO de 14/08/2026 proíbe.
    expect(arg).not.toHaveProperty("status");
    expect(arg).not.toHaveProperty("reviewedBy");
    expect(arg).not.toHaveProperty("reviewedAt");
    // E a origem é declarada como a AGÊNCIA — grafia que a trava recusa como
    // aprovação, de propósito.
    expect(arg.requestedBy).toContain("equipe:");
    expect(arg.requestedBy).not.toContain("client:");
  });
});

// ── 4 e 5. Idempotência, e o carimbo que não vale ───────────────────────────

describe("idempotência pelo dado", () => {
  it("peça já num card PENDENTE não ganha um segundo card", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "ap-antigo", status: "pending", reviewedBy: null, sourcePostIdsJson: JSON.stringify(SEIS_IDS) },
    ]);
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    const j = await res.json();
    expect(j.situacao).toBe("nada_a_criar");
    expect(createApprovalRequest).not.toHaveBeenCalled();
    expect(j.excluidas).toContainEqual(
      expect.objectContaining({ motivo: "ja_em_card_pendente", quantas: 6 }),
    );
  });

  it("peça que o CLIENTE já aprovou não volta para a fila", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      {
        id: "ap-ok", status: "approved", reviewedBy: "client:Dioli Santos",
        sourcePostIdsJson: JSON.stringify(SEIS_IDS),
      },
    ]);
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    const j = await res.json();
    expect(j.situacao).toBe("nada_a_criar");
    expect(j.excluidas).toContainEqual(
      expect.objectContaining({ motivo: "ja_aprovada_pelo_cliente", quantas: 6 }),
    );
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("card 'approved' carimbado pela AGÊNCIA não conta — a peça CONTINUA elegível", async () => {
    // A sutileza inteira do módulo. `aprovacaoDaPeca` recusa estes carimbos, então
    // a peça segue barrada na publicação e PRECISA de um card de verdade.
    for (const carimbo of ["cliente", "equipe:master@dioli.studio", "internal", null]) {
      vi.clearAllMocks();
      db.client.findMany.mockResolvedValue([{ id: "cli-cityjobs", name: "CityJobs" }]);
      db.socialPost.findMany.mockResolvedValue(SEIS);
      createApprovalRequest.mockResolvedValue({ id: "ap-novo" });
      db.approvalRequest.findMany.mockResolvedValue([
        {
          id: "ap-carimbo", status: "approved", reviewedBy: carimbo,
          sourcePostIdsJson: JSON.stringify(SEIS_IDS),
        },
      ]);
      const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
      const j = await res.json();
      expect(j.situacao, `carimbo ${carimbo}`).toBe("criado");
      expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    }
  });
});

// ── 6. Nunca escolher cliente por palpite ───────────────────────────────────

describe("o cliente nunca é adivinhado", () => {
  it("nome que casa com DOIS clientes recusa e não grava nada", async () => {
    db.client.findMany.mockResolvedValue([
      { id: "c1", name: "CityJobs SP" },
      { id: "c2", name: "CityJobs RJ" },
    ]);
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    const j = await res.json();
    expect(j.situacao).toBe("nome_ambiguo");
    expect(j.candidatos).toBe(2);
    expect(createApprovalRequest).not.toHaveBeenCalled();
    // O placar não carrega os NOMES dos candidatos: ele vive 90 dias num log de
    // CI e nome de cliente não precisa morar lá.
    expect(JSON.stringify(j)).not.toContain("CityJobs SP");
  });

  it("nome que não casa com ninguém recusa — e não vira 'nada a criar'", async () => {
    db.client.findMany.mockResolvedValue([{ id: "c1", name: "Foocci" }]);
    const res = await abrirPeloBotao(req("?cliente=CityJobs&criar=1"));
    const j = await res.json();
    expect(j.situacao).toBe("cliente_nao_existe");
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });
});

// ── 7. A triagem e o corpo do card ──────────────────────────────────────────

describe("a triagem, peça por peça", () => {
  const nada = { emCardPendente: new Set<string>(), aprovadaPeloCliente: new Set<string>() };

  it("peça interna fica de fora — o cliente só decide o que pode ver", () => {
    const t = triarPecas([peca(1, { visibility: "interno" }), peca(2)], nada);
    expect(t.elegiveis.map((p) => p.id)).toEqual(["sp2"]);
    expect(t.excluidas[0]!.motivo).toBe("interna");
  });

  it("peça já publicada fica de fora — a decisão chegaria depois do fato", () => {
    const t = triarPecas([peca(1, { status: "published" })], nada);
    expect(t.elegiveis).toHaveLength(0);
    expect(t.excluidas[0]!.motivo).toBe("ja_publicada");
  });

  it("peça sem dono fica de fora — não existe quem a aprove", () => {
    const t = triarPecas([peca(1, { clientId: null })], nada);
    expect(t.elegiveis).toHaveLength(0);
    expect(t.excluidas[0]!.motivo).toBe("sem_cliente");
  });

  it("cada exclusão carrega o MOTIVO legível, nunca só a contagem", () => {
    const t = triarPecas([peca(1, { visibility: "interno" })], nada);
    expect(t.excluidas[0]!.detalhe).toContain("só decide o que pode ver");
  });
});

describe("o corpo do card é a régua única que o portal renderiza", () => {
  it("título na PRIMEIRA linha, peças ordenadas por data, com legenda e telas", () => {
    const { titulo, reviewNote, ordenados } = corpoDoCard([peca(3), peca(1), peca(2)]);
    expect(titulo).toBe("Carrosséis de lançamento — 3 peças");
    expect(reviewNote.split("\n")[0]).toBe(titulo);
    expect(ordenados.map((p) => p.id)).toEqual(["sp1", "sp2", "sp3"]);
    expect(reviewNote).toContain("- Telas: 1) capa 1");
    expect(reviewNote).toContain("- Legenda: Vaga 2");
  });

  it("formato misturado muda o título — carrossel não é o nome de tudo", () => {
    const { titulo } = corpoDoCard([peca(1), peca(2, { format: "reel" })]);
    expect(titulo).toBe("Peças do calendário — 2 peças");
  });
});

// ── 8. O módulo não fala com plataforma nenhuma ─────────────────────────────

describe("nada publica", () => {
  it("abrir card não lê o freio de emergência nem toca a data marcada", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.PUBLICACAO_ORGANICA = "liberada";
    await abrirCardsDeAprovacao({ cliente: "CityJobs", criar: true });
    // Nenhuma chamada de rede: a trava de plataforma continua inteira.
    expect(fetchSpy).not.toHaveBeenCalled();
    // E nenhuma escrita em SocialPost: a data marcada é do calendário, não daqui.
    expect(db.socialPost).not.toHaveProperty("update");
    fetchSpy.mockRestore();
    delete process.env.PUBLICACAO_ORGANICA;
  });
});
