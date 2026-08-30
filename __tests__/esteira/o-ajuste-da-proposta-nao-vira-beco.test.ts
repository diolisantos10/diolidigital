// O CLIENTE QUE PEDE AJUSTE NA PROPOSTA NÃO PODE CAIR NUM BECO.
//
// ═══ O DEFEITO, MEDIDO AO VIVO COM `curl` (29/08/2026) ═══════════════════════
//
// `lib/agency/execution/negotiate-proposal.ts` monta a proposta ajustada, cria
// um `ApprovalRequest` VISÍVEL ao cliente com a frase "é só aprovar aqui
// embaixo que a gente começa" — e gravava `status: "scope_ready"`.
//
// `scope_ready` não é um estado de "cliente decide". As DUAS portas da proposta
// respondiam coisas OPOSTAS sobre o mesmo estado, e as duas mentiam:
//
//   GET  /api/portal/briefing/proposta → `decidivel:false`,
//        "a proposta ainda está sendo montada" → a tela não desenha botão;
//   POST /api/portal/briefing/aceite   → **409** "Esta proposta já foi
//        respondida" — e o cliente nunca respondeu.
//
// Quem negocia preço ficava preso e o projeto não nascia.
//
// ═══ O QUE ESTE ARQUIVO TRAVA — E POR QUE SÃO TRÊS TRAVAS ═══════════════════
//
//   1. o estado que `negotiateProposal` grava ESTÁ em
//      `ESPERANDO_DECISAO_DA_PROPOSTA` — é a trava do beco;
//   2. `scope_ready` NÃO está nessa lista — é a trava contra o conserto ERRADO
//      (ver o porquê no `describe` correspondente, e não o apague sem lê-lo);
//   3. as duas portas CONCORDAM sobre esse estado — a que lê diz "decidível" e
//      a que escreve aceita a decisão. Foi a divergência entre elas que virou
//      beco, então é a concordância que precisa ficar vermelha.
//
// ═══ PROVA POR MUTAÇÃO (conferida, uma a uma) ═══════════════════════════════
//
//   • voltar `negotiate-proposal.ts` para `status: "scope_ready"`
//        → quebram a trava 1 e as duas metades da trava 3;
//   • acrescentar `"scope_ready"` a `ESPERANDO_DECISAO_DA_PROPOSTA`
//        → quebra a trava 2;
//   • apagar `"proposal_pending"` de `ESPERANDO_DECISAO_DA_PROPOSTA`
//        → quebram a trava 1 e a trava 3.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks com ASSINATURA ────────────────────────────────────────────────────
// `vi.hoisted(() => vi.fn())` sem tipo faz o `tsc --noEmit` do CI inferir
// `never[]` para `mock.calls` — o erro que já barrou três PRs desta casa. Todo
// mock daqui declara o que devolve.
type PedidoNoBanco = { id: string; status: string; businessName: string; briefingJson: string | null; clientId: string | null; workspaceId: string | null };
type Atualizacao = { where: { id: string }; data: { status?: string } };

const db = vi.hoisted(() => ({
  clientRequestDb: {
    findUnique: vi.fn(async (_args?: unknown): Promise<Record<string, unknown> | null> => null),
    findFirst: vi.fn(async (_args?: unknown): Promise<Record<string, unknown> | null> => null),
    update: vi.fn(async (_args: { where: { id: string }; data: { status?: string } }): Promise<unknown> => ({})),
    // `marcarAceite` (real, não mockada aqui) grava o congelamento de preço
    // com `updateMany` — API padrão do Prisma (ficha C1d, 29/08/2026, trocou
    // o `$executeRawUnsafe` de antes). Este arquivo é sobre o beco da
    // negociação, não sobre preço, mas passa pela rota real de aceite, que
    // chama a função real.
    updateMany: vi.fn(async (_args?: unknown): Promise<{ count: number }> => ({ count: 1 })),
  },
  portalMessage: { create: vi.fn(async (_args?: unknown): Promise<unknown> => ({})) },
  approvalRequest: { update: vi.fn(async (_args?: unknown): Promise<unknown> => ({})) },
  portalAccess: { update: vi.fn(async (_args?: unknown): Promise<unknown> => ({})) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const ia = vi.hoisted(() => ({
  generate: vi.fn(async (_args?: unknown): Promise<{ ok: boolean; data?: unknown }> => ({
    ok: true,
    data: { message: "Consigo uma condição especial pra você.", newTotal: null },
  })),
}));
vi.mock("@/lib/ai/generate", () => ia);

const aprovacoes = vi.hoisted(() => ({
  createApprovalRequest: vi.fn(async (_args?: unknown): Promise<{ id: string }> => ({ id: "ap1" })),
}));
vi.mock("@/lib/agency/persistence/approval-service", () => aprovacoes);

// ── As duas portas do portal: só o que as cerca é falso ─────────────────────
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null | undefined) => q ?? "t",
}));
const acesso = vi.hoisted(() => ({
  validatePortalAccess: vi.fn(async (_t: string): Promise<{ valid: boolean; record: { clientRequestId: string | null; clientId: string | null } | null }> => ({
    valid: true,
    record: { clientRequestId: "cr1", clientId: null },
  })),
}));
vi.mock("@/lib/agency/persistence/portal-access-service", () => acesso);
vi.mock("@/lib/agency/esteira/aviso-de-agendamento-manual", () => ({
  avisoDeAgendamentoManual: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock("@/lib/agency/financeiro/parceria-do-parceiro", () => ({
  parceriaVivaDoCliente: vi.fn(async (): Promise<null> => null),
}));

// `nascerDoAceite` é a única coisa mockada de `caminho-automatico` — a LISTA
// vem real, e é ela que está sob teste. Mockar a lista seria testar a cópia.
const nascerDoAceite = vi.hoisted(() =>
  vi.fn(async (_id: string, _quem?: string): Promise<{ ok: boolean; projectId: string; jaExistia: boolean }> => ({
    ok: true, projectId: "p1", jaExistia: false,
  })),
);
vi.mock("@/lib/agency/esteira/caminho-automatico", async (orig) => {
  const real = await orig<typeof import("@/lib/agency/esteira/caminho-automatico")>();
  return { ...real, nascerDoAceite };
});

import { negotiateProposal } from "@/lib/agency/execution/negotiate-proposal";
import { ESPERANDO_DECISAO_DA_PROPOSTA } from "@/lib/agency/esteira/caminho-automatico";
import { GET as lerProposta } from "@/app/api/portal/briefing/proposta/route";
import { POST as decidirProposta } from "@/app/api/portal/briefing/aceite/route";

/** O pedido como ele está no banco quando o cliente pede ajuste: a proposta já
 *  foi entregue, o número já está gravado no `briefingJson` (é o que
 *  `orcamento-do-briefing` faz), e ele respondeu "quero mudar". */
function pedido(status: string): PedidoNoBanco {
  return {
    id: "cr1",
    status,
    businessName: "PIZZARIA DO BECO NOME TESTE",
    clientId: null,
    workspaceId: null,
    briefingJson: JSON.stringify({
      scope: { wantsSocialMedia: true, social: { postsPerWeek: 3 } },
      estimate: { totalMin: 1390, totalMax: 2590, items: [{ label: "Social media", detail: "3 posts/semana" }] },
    }),
  };
}

/** Roda o código REAL da negociação e devolve o estado que ele gravou. */
async function estadoGravadoPelaNegociacao(): Promise<string> {
  db.clientRequestDb.findUnique.mockResolvedValue(pedido("proposal_pending"));
  await negotiateProposal("cr1", "achei caro");
  const chamadas = db.clientRequestDb.update.mock.calls as unknown as Atualizacao[][];
  const gravado = chamadas.at(-1)?.[0]?.data?.status;
  expect(gravado, "a negociação não gravou estado nenhum").toBeTruthy();
  return String(gravado);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clientRequestDb.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.approvalRequest.update.mockResolvedValue({});
  db.portalAccess.update.mockResolvedValue({});
  aprovacoes.createApprovalRequest.mockResolvedValue({ id: "ap1" });
  ia.generate.mockResolvedValue({ ok: true, data: { message: "Consigo uma condição especial.", newTotal: null } });
  acesso.validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  nascerDoAceite.mockResolvedValue({ ok: true, projectId: "p1", jaExistia: false });
});

// ── TRAVA 1 — o beco ────────────────────────────────────────────────────────
describe("a proposta AJUSTADA nasce esperando a decisão do cliente", () => {
  it("🔴 o estado gravado está em ESPERANDO_DECISAO_DA_PROPOSTA", async () => {
    const estado = await estadoGravadoPelaNegociacao();
    expect(
      ESPERANDO_DECISAO_DA_PROPOSTA,
      `a negociação gravou "${estado}", que não é um estado de "o cliente decide" — ` +
      "e é exatamente aí que o cliente que pediu ajuste ficou preso",
    ).toContain(estado);
  });

  it("o cliente RECEBE o convite de decidir junto com o estado que permite decidir", async () => {
    await estadoGravadoPelaNegociacao();
    // A frase e o estado são as duas metades do mesmo interruptor: convidar a
    // aprovar num estado que não aceita aprovação é a mentira que se conserta aqui.
    const criada = aprovacoes.createApprovalRequest.mock.calls.at(0)?.[0] as { clientVisible?: boolean } | undefined;
    expect(criada?.clientVisible, "o convite é visível ao cliente").toBe(true);
    const nota = db.approvalRequest.update.mock.calls.at(0)?.[0] as { data?: { reviewNote?: string } } | undefined;
    expect(String(nota?.data?.reviewNote)).toContain("é só aprovar aqui embaixo");
  });
});

// ── TRAVA 2 — contra o conserto ERRADO ──────────────────────────────────────
describe("scope_ready NÃO entra na lista de quem espera o cliente", () => {
  it("🔴 `scope_ready` fora de ESPERANDO_DECISAO_DA_PROPOSTA — e leia o porquê antes de mudar isto", () => {
    // ⛔ SE VOCÊ CHEGOU AQUI PORQUE ESTE TESTE FICOU VERMELHO, NÃO O APAGUE.
    //
    // `scope_ready` é escrito em DOIS lugares desta casa, com significados
    // OPOSTOS sobre quem tem a bola:
    //
    //   • `lib/dioli-brain/run-auto-scope.ts` → o cérebro gerou o escopo e a
    //     AGÊNCIA revisa. É o crachá "N para revisar" e o botão "Ver escopo →"
    //     de `app/agency/requests/page.tsx`;
    //   • `lib/agency/execution/negotiate-proposal.ts` → antes deste conserto,
    //     "proposta ajustada enviada, o CLIENTE decide".
    //
    // Pôr `scope_ready` nesta lista faria o cliente APROVAR SOZINHO um escopo
    // que a agência ainda não revisou — o buraco de contrato que a lista existe
    // para evitar. Um nome de estado carregando dois fatos opostos é a doença;
    // alargar a lista espalharia a doença por toda a casa.
    //
    // O conserto certo é o outro lado: quem grava passa a gravar um estado que
    // JÁ significa "o cliente decide". É o que a trava 1 prova.
    expect(ESPERANDO_DECISAO_DA_PROPOSTA).not.toContain("scope_ready");
  });

  it("e a negociação não grava `scope_ready` — nem por outro caminho", async () => {
    expect(await estadoGravadoPelaNegociacao()).not.toBe("scope_ready");
  });
});

// ── TRAVA 3 — as duas portas concordam ──────────────────────────────────────
describe("as duas portas da proposta dizem a MESMA coisa sobre esse estado", () => {
  it("🔴 a porta que LÊ diz `decidivel: true` — a tela desenha os botões", async () => {
    const estado = await estadoGravadoPelaNegociacao();
    db.clientRequestDb.findUnique.mockResolvedValue(pedido(estado));

    const res = await lerProposta(new NextRequest("http://localhost/api/portal/briefing/proposta?token=t"));
    const corpo = await res.json() as { decidivel?: boolean; motivo?: string; status?: string };

    expect(res.status).toBe(200);
    expect(
      corpo.decidivel,
      `estado "${estado}": a tela do cliente não desenharia botão nenhum (motivo: ${corpo.motivo ?? "—"})`,
    ).toBe(true);
  });

  it("🔴 a porta que ESCREVE aceita a decisão — nada de 409 para quem nunca respondeu", async () => {
    const estado = await estadoGravadoPelaNegociacao();
    db.clientRequestDb.findUnique.mockResolvedValue(pedido(estado));
    db.clientRequestDb.update.mockClear();

    const res = await decidirProposta(new NextRequest("http://localhost/api/portal/briefing/aceite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "t", decisao: "aceito" }),
    }));
    const corpo = await res.json() as { mensagem?: string; jaDecidido?: boolean };

    expect(
      res.status,
      `estado "${estado}": a porta respondeu "${corpo.mensagem ?? ""}" a um cliente que nunca respondeu`,
    ).toBe(200);
    expect(corpo.jaDecidido).toBeFalsy();
    expect(nascerDoAceite, "o projeto do cliente que negociou preço não nasceu").toHaveBeenCalledWith("cr1", "cliente (portal)");
  });

  it("e a recusa também passa — pedir ajuste não pode fechar a porta de dizer não", async () => {
    const estado = await estadoGravadoPelaNegociacao();
    db.clientRequestDb.findUnique.mockResolvedValue(pedido(estado));
    db.clientRequestDb.update.mockClear();

    const res = await decidirProposta(new NextRequest("http://localhost/api/portal/briefing/aceite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "t", decisao: "recusado" }),
    }));
    expect(res.status).toBe(200);
    expect(db.clientRequestDb.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "rejected" } }),
    );
  });
});

// ── A OUTRA METADE DO INTERRUPTOR — dívida DECLARADA, não consertada aqui ────
//
// A porta que LÊ tem DUAS condições, não uma: além do estado, ela exige que o
// número esteja gravado no `briefingJson` (`estimativaEntregue`). Se o número
// não estiver lá, ela devolve `decidivel:false` com a frase
// "a proposta ainda está sendo montada" — **qualquer que seja o estado**.
//
// Essa é, letra por letra, a frase medida no beco. E `negotiateProposal`
// CALCULA a estimativa (`computeEstimate`) mas **não a grava** — quem grava é
// `orcamento-do-briefing.ts` (`comEstimativa`), na entrega da proposta normal.
// Então a proposta ajustada de um pedido cujo número nunca foi persistido
// continua sem botão, mesmo com o estado certo.
//
// ⚠️ NÃO consertado nesta frente de propósito: gravar número em `briefingJson`
// é mexer no que o cliente vai pagar, e o SDR ainda negocia um `newTotal` que
// não é persistido em lugar nenhum — a página da proposta mostraria o valor
// ANTIGO enquanto o card de aprovação mostra o ajustado. Duas verdades sobre
// dinheiro é decisão de dono, não conserto de especialista.
//
// Este teste não pede o conserto: ele PRENDE o fato, para que a próxima pessoa
// que medir o beco encontre a segunda metade já nomeada em vez de redescobri-la.
describe("o estado certo não basta: a porta que lê também exige o NÚMERO gravado", () => {
  it("sem `estimate` no briefingJson, a proposta ajustada continua sem botão", async () => {
    const estado = await estadoGravadoPelaNegociacao();
    const semNumero = { ...pedido(estado), briefingJson: JSON.stringify({ scope: { wantsSocialMedia: true, social: { postsPerWeek: 3 } } }) };
    db.clientRequestDb.findUnique.mockResolvedValue(semNumero);

    const res = await lerProposta(new NextRequest("http://localhost/api/portal/briefing/proposta?token=t"));
    const corpo = await res.json() as { decidivel?: boolean; motivo?: string };

    expect(corpo.decidivel).toBe(false);
    expect(corpo.motivo, "a frase exata que o Diretor mediu no beco").toBe("a proposta ainda está sendo montada");
  });

  it("e a porta que ESCREVE aceita assim mesmo — as duas voltam a divergir aqui", async () => {
    // A concordância que a trava 3 garante vale para o ESTADO. Sobre o NÚMERO,
    // as duas portas continuam discordando: a que lê recusa, a que escreve
    // aceita. É a mesma doença, um andar acima — e fica registrada, não corrigida.
    const estado = await estadoGravadoPelaNegociacao();
    db.clientRequestDb.findUnique.mockResolvedValue({
      ...pedido(estado),
      briefingJson: JSON.stringify({ scope: { wantsSocialMedia: true, social: { postsPerWeek: 3 } } }),
    });
    const res = await decidirProposta(new NextRequest("http://localhost/api/portal/briefing/aceite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "t", decisao: "aceito" }),
    }));
    expect(res.status).toBe(200);
  });
});
