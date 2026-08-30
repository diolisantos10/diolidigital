// A CONVERSA ÓRFÃ GANHA DONO — e o dono a leva até o orçamento.
//
// ═══ O BURACO, DECLARADO PELO AUTOR DO CONSERTO ANTERIOR ════════════════════
//
// `promover-conversas-paradas.ts` (#367) faz a conversa parada de um PARCEIRO
// virar pedido sozinha. Mas só age sobre rastros com `clienteDoConvite`.
//
// **E o rastro que importa não tem esse campo.** O primeiro cliente real da
// agência (FOOCCI, `cmtc145qf007a0xo4txmjss11`) conversou em 27/08 às 01:34 e
// às 13:43, contou o briefing inteiro, e a conversa travou na pergunta de
// verba. Aquele rastro é **v1**: não sabe de quem é. O cliente espera o
// orçamento há mais de 24 horas, e mandá-lo repetir o briefing é inaceitável.
//
// A saída ERRADA seria deduzir o dono pelo e-mail digitado no chat — qualquer
// visitante escreveria o e-mail de um parceiro e seria tratado como ele. O
// autor do #367 recusou, e a recusa continua de pé aqui.
//
// A saída CERTA é a casa poder DIZER de quem é a conversa: um operador com
// sessão de AGÊNCIA declara, e responde pelo ato. Declarar não é deduzir.
//
// ═══ O QUE ESTE ARQUIVO PROVA — O EFEITO, NÃO A FUNÇÃO ══════════════════════
//
// O banco é FALSO mas tem ESTADO e tem o ÍNDICE ÚNICO de `fioDaConversa`. E o
// caminho medido é o da ponta: **a ROTA real** (`POST .../atribuir`) é chamada
// com uma requisição de verdade, e é o relógio real que promove depois.
//
//   1. Rastro ÓRFÃO v1 → a rota atribui → o PEDIDO nasce → o ORÇAMENTO sai.
//   2. O MESMO rastro SEM a atribuição → NÃO promove. Os dois lados.
//   3. Sessão de portal (com `clientId`) NÃO atribui.
//   4. `atribuidoPor` vem da SESSÃO — o corpo é ignorado.
//   5. Parceria vencida/revogada → atribuir NÃO faz nascer pedido.
//   6. Leitura de banco falhando → recusa, nunca "pode ir".
//   7. Reatribuição de rastro que JÁ virou pedido → 409, nunca em silêncio.
//   8. Quem CHAMA isto: a rota chama o mecanismo; o despertador chama a promoção.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";

const WS = "ws_dioli";
const OUTRO_WS = "ws_outra_agencia";
const FIO = "sdr:conversa-foocci-1343";
const CLIENTE = "cmtc145qf007a0xo4txmjss11"; // o cliente real, como está em produção
const OPERADOR = "user_diretor";

// ─── O BANCO FALSO COM ESTADO ────────────────────────────────────────────────
const estado = vi.hoisted(() => ({
  eventos: [] as { id: string; clientId: string | null; message: string; timestamp: Date; workspaceId: string; type: string }[],
  clientes: [] as { id: string; name: string; workspaceId: string }[],
  pedidos: [] as Record<string, unknown>[],
  mensagens: [] as Record<string, unknown>[],
  isencoes: [] as Record<string, unknown>[],
  parceria: null as Record<string, unknown> | null,
  quebrarLeituraDeCliente: false,
}));

const db = vi.hoisted(() => {
  const e = estado;
  let seq = 0;
  const casa = (l: { type: string; clientId: string | null; workspaceId: string },
                w: { type?: string; clientId?: string; workspaceId?: string }) =>
    (!w.type || l.type === w.type) &&
    (w.clientId === undefined || l.clientId === w.clientId) &&
    (!w.workspaceId || l.workspaceId === w.workspaceId);

  return {
    client: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (e.quebrarLeituraDeCliente) throw new Error("DB unavailable");
        return e.clientes.find((c) => c.id === where.id) ?? null;
      }),
    },
    activityEvent: {
      findMany: vi.fn(async ({ where }: { where: { type: string; workspaceId?: string } }) =>
        e.eventos.filter((l) => casa(l, where))),
      findFirst: vi.fn(async ({ where }: { where: { type?: string; clientId?: string; workspaceId?: string } }) =>
        e.eventos.find((l) => casa(l, where)) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: { clientId: string } }) => {
        const antes = e.eventos.length;
        e.eventos = e.eventos.filter((l) => l.clientId !== where.clientId);
        return { count: antes - e.eventos.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const l = e.eventos.find((x) => x.id === where.id);
        if (l) Object.assign(l, data);
        return l;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const linha = { id: `ev_${++seq}`, timestamp: new Date(), ...data } as (typeof e.eventos)[number];
        e.eventos.push(linha);
        return linha;
      }),
    },
    parceriaDoCliente: {
      findUnique: vi.fn(async ({ where }: { where: { clientId: string } }) =>
        e.parceria && e.parceria.clientId === where.clientId ? e.parceria : null),
    },
    isencaoDeParceria: {
      findUnique: vi.fn(async ({ where }: { where: { clientRequestId: string } }) =>
        e.isencoes.find((i) => i.clientRequestId === where.clientRequestId) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { e.isencoes.push(data); return data; }),
    },
    clientRequestDb: {
      // ⚠️ O ÍNDICE ÚNICO, emulado — a trava do #367, que NÃO se afrouxa aqui.
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const fio = data.fioDaConversa as string | undefined;
        if (fio && e.pedidos.some((p) => p.fioDaConversa === fio)) {
          throw Object.assign(new Error("Unique constraint failed on the fields: (`fioDaConversa`)"), { code: "P2002" });
        }
        const linha = { id: `req_${++seq}`, createdAt: new Date(), status: "new", ...data };
        e.pedidos.push(linha);
        return linha;
      }),
      findFirst: vi.fn(async ({ where }: { where: { fioDaConversa?: string } }) =>
        e.pedidos.find((p) => !where.fioDaConversa || p.fioDaConversa === where.fioDaConversa) ?? null),
      findMany: vi.fn(async ({ where }: { where?: { status?: { in: string[] } } }) =>
        e.pedidos.filter((p) => !where?.status || where.status.in.includes(p.status as string))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => e.pedidos.find((p) => p.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const p = e.pedidos.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    portalMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { e.mensagens.push(data); return data; }),
    },
    portalAccess: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: { token: string } }) => ({ token: data.token })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const sessao = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/session", async (original) => {
  // `isAgencyRole` é régua de verdade e continua sendo a de produção — trocá-la
  // por um `() => true` de teste faria a guarda de papel passar a ser provada
  // contra si mesma.
  const real = await original<typeof import("@/lib/auth/session")>();
  return { ...real, getSession: sessao.getSession };
});

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

const { POST } = await import("@/app/api/agency/conversas-sem-pedido/atribuir/route");
const { promoverConversasParadas } = await import("@/lib/agency/comercial/promover-conversas-paradas");
const { entregarOrcamentosPendentes } = await import("@/lib/agency/esteira/orcamento-do-briefing");
const { donoDeclaradoDoRastro } = await import("@/lib/agency/comercial/dono-do-rastro");
const { conversasSemPedido, guardarRastroDaConversa } = await import("@/lib/agency/comercial/conversa-sem-pedido");
const { TIPO_CONVERSA_ATRIBUIDA } = await import("@/lib/agency/comercial/atribuir-conversa-orfa");

const AGORA = new Date("2026-08-28T12:00:00.000Z");

/** O escopo como o cliente o construiu na conversa — nada além do que ele disse. */
const ESCOPO_COMPLETO = {
  prospectName: "Interlocutor FOOCCI",
  businessName: "FOOCCI",
  segment: "tecnologia",
  objectives: ["vender mais"],
  wantsSocialMedia: true,
  social: { platforms: ["Instagram"], postsPerWeek: 3, storiesPerWeek: 3, videosPerMonth: 4 },
  prospectEmail: "contato@foocci.com.br",
};

const PARCERIA_VIVA = {
  id: "p1", clientId: CLIENTE, autorizadaPor: "Dioli Santos (CEO), D-0B9",
  validaAte: new Date("2026-11-27T00:00:00.000Z"), escopo: "Social Media — parceria de lançamento",
  pecasContratadas: 12, tetoDeIaCentavosUsd: 200, revogadaEm: null,
};

/** ⚠️ O RASTRO ÓRFÃO **v1** — exatamente a forma que está no banco de produção
 *  para a conversa das 13:43. Sem `clienteDoConvite`, sem `atribuicao`: a casa
 *  guardou o briefing inteiro e não sabe de quem ele é. */
function rastroOrfaoV1(over: { escopo?: unknown; fio?: string; workspaceId?: string } = {}) {
  return {
    id: "ev_rastro",
    type: "conversa_sem_pedido",
    clientId: over.fio ?? FIO,
    workspaceId: over.workspaceId ?? WS,
    timestamp: new Date("2026-08-27T16:43:00.000Z"),
    message: JSON.stringify({
      v: 1,
      escopo: "escopo" in over ? over.escopo : ESCOPO_COMPLETO,
      contato: { nome: "Interlocutor FOOCCI", email: "contato@foocci.com.br" },
      turnos: 11,
    }),
  };
}

const SESSAO_AGENCIA = { userId: OPERADOR, email: "diretor@dioli.com", name: "Diretor", role: "master", workspaceId: WS };

function pedidoDeAtribuicao(corpo: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/agency/conversas-sem-pedido/atribuir", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  estado.eventos = [];
  estado.clientes = [{ id: CLIENTE, name: "FOOCCI", workspaceId: WS }];
  estado.pedidos = [];
  estado.mensagens = [];
  estado.isencoes = [];
  estado.parceria = PARCERIA_VIVA;
  estado.quebrarLeituraDeCliente = false;
  vi.clearAllMocks();
  sessao.getSession.mockResolvedValue(SESSAO_AGENCIA);
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. O EFEITO REAL — o rastro órfão é atribuído e o pedido NASCE", () => {
  it("a rota atribui, o relógio promove, e o orçamento sai — sem o cliente repetir nada", async () => {
    estado.eventos.push(rastroOrfaoV1());

    // ── ANTES: o rastro órfão NÃO promove. É o buraco medido, e é a metade do
    // teste que prova que o efeito a seguir veio da atribuição, não do acaso.
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
    expect(estado.pedidos).toHaveLength(0);

    // ── O ATO: a casa DIZ de quem é. Pela ROTA de verdade.
    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // ── DEPOIS: a MESMA régua do #367, com a segunda fonte de dono.
    const promocao = await promoverConversasParadas(AGORA);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (a) Desligue a atribuição — devolva `null` em `donoDeclaradoDoRastro`
    // para a `atribuicao`, ou volte o promotor a ler só `clienteDoConvite`.
    // O rastro do FOOCCI volta a ser órfão e o cliente espera outras 24 horas.
    expect(promocao.promovidos).toHaveLength(1);
    expect(estado.pedidos).toHaveLength(1);

    const pedido = estado.pedidos[0];
    expect(pedido.clientId).toBe(CLIENTE);
    // ⛔ NADA INVENTADO: o negócio é o que ELE escreveu.
    expect(pedido.businessName).toBe("FOOCCI");
    // A isenção é DERIVADA da parceria — nunca um pagamento falso de R$ 0.
    expect(estado.isencoes).toHaveLength(1);
    expect(estado.pedidos.some((p) => p.status === "paid")).toBe(false);

    // ── A TRILHA DENTRO DO PEDIDO: quem atribuiu, quando, e de qual rastro.
    const origem = JSON.parse(pedido.briefingJson as string).origem;
    expect(origem.donoDeclaradoPor).toBe("atribuicao_da_casa");
    expect(origem.atribuicao.atribuidoPor).toBe(OPERADOR);
    expect(origem.atribuicao.fio).toBe(FIO);
    expect(typeof origem.atribuicao.atribuidoEm).toBe("string");

    // ── O FIO ATÉ O FIM: a perna seguinte do MESMO relógio entrega o número.
    const orcamento = await entregarOrcamentosPendentes();
    expect(orcamento.entregues).toBe(1);
    expect(estado.mensagens).toHaveLength(1);
    expect(String(estado.mensagens[0].body)).toMatch(/FOOCCI/);
    expect(estado.pedidos[0].status).toBe("proposal_pending");
  });

  it("a certidão SOBREVIVE ao rastro — que é apagado quando vira pedido", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    await promoverConversasParadas(AGORA);

    // O rastro sumiu (o #367 o resolve), e é justamente por isso que a trilha
    // não podia viver só dentro dele.
    expect(estado.eventos.filter((l) => l.type === "conversa_sem_pedido")).toHaveLength(0);
    const trilha = estado.eventos.filter((l) => l.type === TIPO_CONVERSA_ATRIBUIDA);
    expect(trilha).toHaveLength(1);
    const t = JSON.parse(trilha[0].message);
    expect(t.clientId).toBe(CLIENTE);
    expect(t.atribuidoPor).toBe(OPERADOR);
    expect(t.fio).toBe(FIO);
  });

  it("o rastro atribuído aparece com dono na lista — quem vai atribuir vê o que já tem dono", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    const [r] = await conversasSemPedido(WS, 50);
    expect(r.atribuicao?.clientId).toBe(CLIENTE);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. O OUTRO LADO — sem atribuição, continua NÃO promovendo", () => {
  it("rastro órfão sem ato nenhum não vira pedido, por mais completo que esteja", async () => {
    estado.eventos.push(rastroOrfaoV1());
    const r = await promoverConversasParadas(AGORA);
    expect(estado.pedidos).toHaveLength(0);
    expect(r.semParceria).toBe(1);
  });

  it("a régua pura recusa meia atribuição — dono sem quem responda por ele não é dono", () => {
    // Carga truncada no teto, ou escrita por uma versão anterior. Recusa inteira.
    expect(donoDeclaradoDoRastro({ clienteDoConvite: null, atribuicao: null })).toBeNull();
    expect(donoDeclaradoDoRastro({
      clienteDoConvite: null,
      // @ts-expect-error — a forma inválida é justamente o que se testa
      atribuicao: { clientId: CLIENTE, atribuidoEm: "2026-08-28T12:00:00Z", fio: FIO },
    })).toBeNull();
    expect(donoDeclaradoDoRastro({ clienteDoConvite: "  ", atribuicao: null })).toBeNull();
  });

  it("⛔ o e-mail do cliente NO CHAT continua não sendo dono — a recusa do #367 fica de pé", async () => {
    // O escopo carrega `prospectEmail: contato@foocci.com.br` e o contato
    // declara o mesmo e-mail. Se algum dia isso virar dono, qualquer visitante
    // escreve o e-mail de um parceiro e recebe produção de graça.
    estado.eventos.push(rastroOrfaoV1());
    const [r] = await conversasSemPedido(WS, 50);
    expect(r.contato?.email).toBe("contato@foocci.com.br");
    expect(donoDeclaradoDoRastro(r)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. A PORTA — quem pode declarar de quem é uma conversa", () => {
  it("sem sessão: 401", async () => {
    sessao.getSession.mockResolvedValue(null);
    expect((await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }))).status).toBe(401);
  });

  it("⛔ SESSÃO DE PORTAL (com clientId) NÃO atribui — 403", async () => {
    estado.eventos.push(rastroOrfaoV1());
    sessao.getSession.mockResolvedValue({ ...SESSAO_AGENCIA, clientId: CLIENTE });

    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (b) Apague `session.clientId ||` da guarda. O cliente passa a declarar
    // que a conversa é dele — e, com parceria viva, a se auto-servir de
    // produção isenta. A porta do portal não abre a sala de decisão da casa.
    expect(res.status).toBe(403);
    expect(estado.eventos[0].message).not.toContain("atribuicao");
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
  });

  it("papel que não é de agência: 403", async () => {
    sessao.getSession.mockResolvedValue({ ...SESSAO_AGENCIA, role: "client" });
    expect((await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }))).status).toBe(403);
  });

  it("mutação cross-site é barrada — CSRF", async () => {
    estado.eventos.push(rastroOrfaoV1());
    const req = new NextRequest("http://localhost/api/agency/conversas-sem-pedido/atribuir", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ fio: FIO, clientId: CLIENTE }),
    });
    expect((await POST(req)).status).toBe(403);
    expect(estado.eventos[0].message).not.toContain("atribuicao");
  });

  it("⛔ `atribuidoPor` sai da SESSÃO — o corpo é IGNORADO", async () => {
    estado.eventos.push(rastroOrfaoV1());

    const res = await POST(pedidoDeAtribuicao({
      fio: FIO, clientId: CLIENTE,
      // A tentativa de assinar o ato com o nome de outro.
      atribuidoPor: "user_falsificado",
    }));
    expect(res.status).toBe(200);

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (c) Troque `atribuidoPor: session.userId` por `texto(body.atribuidoPor)`
    // na rota. A trilha inteira vira ficção: qualquer operador assina com o
    // nome de qualquer outro, e "quem atribuiu isto?" passa a responder "quem
    // quer que tenha digitado".
    const [r] = await conversasSemPedido(WS, 50);
    expect(r.atribuicao?.atribuidoPor).toBe(OPERADOR);
    expect(r.atribuicao?.atribuidoPor).not.toBe("user_falsificado");
  });

  it("cliente de OUTRO workspace não é atribuível — a fronteira de inquilino", async () => {
    estado.eventos.push(rastroOrfaoV1());
    estado.clientes = [{ id: CLIENTE, name: "FOOCCI", workspaceId: OUTRO_WS }];
    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    expect(res.status).toBe(400);
    expect((await res.json()).recusa).toBe("cliente_inexistente");
  });

  it("rastro de OUTRO workspace não é atribuível", async () => {
    estado.eventos.push(rastroOrfaoV1({ workspaceId: OUTRO_WS }));
    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    expect(res.status).toBe(400);
    expect((await res.json()).recusa).toBe("rastro_inexistente");
  });

  it("fio ou cliente em branco: recusa, nunca um padrão de conveniência", async () => {
    expect((await POST(pedidoDeAtribuicao({ fio: "", clientId: CLIENTE }))).status).toBe(400);
    expect((await POST(pedidoDeAtribuicao({ fio: FIO, clientId: "   " }))).status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. ATRIBUIR NÃO É AUTORIZAR — a régua do #367 fica intacta", () => {
  it("parceria VENCIDA: atribuído e mesmo assim NÃO promove", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    estado.parceria = { ...PARCERIA_VIVA, validaAte: new Date("2026-08-01T00:00:00Z") };

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (d) Faça a atribuição valer por parceria — promova quando `dono` existe
    // sem conferir `parceriaVivaDoCliente`. Uma parceria vencida voltaria a
    // produzir de graça, e o portão de pagamento seria contornado por um ato
    // que não é sobre pagamento nenhum.
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
    expect(estado.pedidos).toHaveLength(0);
  });

  it("parceria REVOGADA: atribuído e mesmo assim NÃO promove", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    estado.parceria = { ...PARCERIA_VIVA, revogadaEm: new Date("2026-08-20T00:00:00Z") };
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
  });

  it("ESCOPO INCOMPLETO: atribuído e mesmo assim NÃO promove — a pendência é NOMEADA", async () => {
    const { businessName: _fora, ...semNegocio } = ESCOPO_COMPLETO;
    estado.eventos.push(rastroOrfaoV1({ escopo: semNegocio }));
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));

    const r = await promoverConversasParadas(AGORA);
    // ⛔ Dar dono não preenche o que o cliente não disse. Recuperar o que ele JÁ
    // DISSE honra o trabalho dele; inventar o resto é mentir.
    expect(estado.pedidos).toHaveLength(0);
    expect(r.pendencias.join(" ")).toMatch(/nome do negócio/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. FALHA DE LEITURA NÃO VIRA 'PODE IR'", () => {
  it("banco fora do ar durante a atribuição: 503 e NADA é gravado", async () => {
    estado.eventos.push(rastroOrfaoV1());
    estado.quebrarLeituraDeCliente = true;

    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (e) Troque o `catch` de `atribuirRastroAoCliente` por um `return { ok:
    // true }`. Um banco fora do ar devolveria sucesso, o operador iria embora
    // achando que a conversa tem dono, e ninguém saberia por que o orçamento
    // nunca saiu. "Não sei" viraria "pode ir".
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
    expect(estado.eventos[0].message).not.toContain("atribuicao");

    estado.quebrarLeituraDeCliente = false;
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. NENHUMA REATRIBUIÇÃO EM SILÊNCIO", () => {
  it("rastro que JÁ virou pedido não muda de dono — 409 com o motivo", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    await promoverConversasParadas(AGORA);
    expect(estado.pedidos).toHaveLength(1);

    // O rastro ressurge (uma aba antiga, uma reimportação) e alguém tenta dá-lo
    // a outro cliente.
    estado.clientes.push({ id: "cli_outro", name: "Outro", workspaceId: WS });
    estado.eventos.push(rastroOrfaoV1());
    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: "cli_outro" }));

    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (f) Apague a checagem de `clientRequestDb.findFirst({ fioDaConversa })`.
    // O dono de uma produção que JÁ CORREU passa a ser reescrito em silêncio —
    // e nenhum índice único pega isso, porque não é um pedido novo: é a
    // história do pedido antigo mudando.
    expect(res.status).toBe(409);
    expect((await res.json()).recusa).toBe("ja_virou_pedido");
    expect(estado.pedidos[0].clientId).toBe(CLIENTE);
  });

  it("rastro já atribuído a OUTRO cliente: 409, e o ato original fica de pé", async () => {
    estado.eventos.push(rastroOrfaoV1());
    estado.clientes.push({ id: "cli_outro", name: "Outro", workspaceId: WS });
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));

    const res = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: "cli_outro" }));
    expect(res.status).toBe(409);
    expect((await res.json()).recusa).toBe("ja_atribuida_a_outro");
    const [r] = await conversasSemPedido(WS, 50);
    expect(r.atribuicao?.clientId).toBe(CLIENTE);
  });

  it("atribuir DUAS VEZES ao MESMO cliente é idempotente — e preserva a data do ato original", async () => {
    estado.eventos.push(rastroOrfaoV1());
    const primeira = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    const j1 = await primeira.json();
    expect(j1.jaExistia).toBe(false);

    const segunda = await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));
    const j2 = await segunda.json();
    expect(segunda.status).toBe(200);
    expect(j2.jaExistia).toBe(true);
    expect(j2.atribuicao.atribuidoEm).toBe(j1.atribuicao.atribuidoEm);
    // E uma certidão só: o clique dobrado não vira duas linhas de história.
    expect(estado.eventos.filter((l) => l.type === TIPO_CONVERSA_ATRIBUIDA)).toHaveLength(1);
  });

  it("o turno seguinte do SDR NÃO apaga a atribuição", async () => {
    estado.eventos.push(rastroOrfaoV1());
    await POST(pedidoDeAtribuicao({ fio: FIO, clientId: CLIENTE }));

    // O cliente volta à aba e escreve mais uma coisa. `guardarRastroDaConversa`
    // reescreve a carga inteira — e a atribuição tem de sobreviver a isso.
    await guardarRastroDaConversa({
      sessionId: "conversa-foocci-1343",
      workspaceId: WS,
      escopo: { ...ESCOPO_COMPLETO, objectives: ["vender mais", "ganhar autoridade"] },
      contato: { nome: "Interlocutor FOOCCI", email: "contato@foocci.com.br" },
      turnos: 12,
    });

    const [r] = await conversasSemPedido(WS, 50);
    expect(r.atribuicao?.clientId).toBe(CLIENTE);
    expect(r.atribuicao?.atribuidoPor).toBe(OPERADOR);
    expect((await promoverConversasParadas(AGORA)).promovidos).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. QUEM CHAMA ISTO? — a pergunta que este conserto existe para responder", () => {
  it("a ROTA chama o mecanismo, e ela nasce no MESMO commit", async () => {
    const fonte = await readFile(
      new URL("../../app/api/agency/conversas-sem-pedido/atribuir/route.ts", import.meta.url), "utf8",
    );
    expect(fonte).toContain("atribuirRastroAoCliente");
    // ⛔ E o autor sai da SESSÃO. Uma porta que aceita o autor do corpo é uma
    // trilha que não prova nada.
    expect(fonte).toContain("atribuidoPor: session.userId");
    expect(fonte).not.toContain("body.atribuidoPor");
  });

  it("o PROMOTOR lê a atribuição — e o despertador continua chamando o promotor", async () => {
    const promotor = await readFile(
      new URL("../../lib/agency/comercial/promover-conversas-paradas.ts", import.meta.url), "utf8",
    );
    // ── A MUTAÇÃO QUE ESTE `expect` MATA ─────────────────────────────────
    // (a, a outra metade) Tire `donoDeclaradoDoRastro` do promotor. A rota
    // continuaria existindo, testada e correta — e a atribuição não chegaria a
    // lugar nenhum: a trava construída sem a fechadura, de novo.
    expect(promotor).toContain("donoDeclaradoDoRastro");
    const despertador = await readFile(
      new URL("../../lib/agency/despertador.ts", import.meta.url), "utf8",
    );
    expect(despertador).toContain("promoverConversasParadas");
  });
});
