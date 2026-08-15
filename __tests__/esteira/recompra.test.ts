// A RÉGUA DE RECOMPRA — as duas metades de cada trava.
//
// Toda trava aqui é provada dos dois lados: que ela BARRA o caso ruim, e que
// ela NÃO ATRAPALHA o legítimo. Trava que só tem a primeira metade vira
// armadilha silenciosa — o toque nunca sai e ninguém descobre por quê.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = {
  clientNotice: { create: vi.fn() },
  project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  contentRequest: { findFirst: vi.fn() },
  portalMessage: { findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
};
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const avisarCliente = vi.fn();
vi.mock("@/lib/agency/esteira/triagem", () => ({ avisarCliente }));

const {
  marcoDevido,
  precoParaOferecer,
  temPromessaDeResultado,
  prometeCobrancaRecorrente,
  redigirToque,
  idDoToque,
  registrarToque,
  rodarReguaDeRecompra,
  MARCOS,
  TOLERANCIA_DIAS,
} = await import("@/lib/agency/esteira/recompra");

const DIA = 24 * 60 * 60 * 1000;

function ancora(over: Record<string, unknown> = {}) {
  return {
    clientId: "cli-1",
    workspaceId: "ws-1",
    projectId: "prj-1",
    clienteNome: "José da Silva",
    email: "ze@padaria.com",
    telefone: "11999999999",
    itemDeCatalogo: "balcao-carrossel-5",
    itemLabel: "Carrossel até 5 telas",
    entregaId: "del-1",
    entregueEm: new Date("2026-07-01T12:00:00Z"),
    compras: 1,
    ...over,
  } as Parameters<typeof registrarToque>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clientNotice.create.mockResolvedValue({ id: "n-1" });
  avisarCliente.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o gatilho é de tempo, e ele fecha", () => {
  it("dispara 30, 60 e 90 — e só um por vez", () => {
    expect(marcoDevido(30)).toBe(30);
    expect(marcoDevido(60)).toBe(60);
    expect(marcoDevido(90)).toBe(90);
  });

  it("cron atrasado ainda pega o toque: 40 dias continua sendo o marco de 30", () => {
    // A metade que prova que a trava não atrapalha o legítimo — sem a
    // tolerância, um dia de cron fora do ar perderia o toque para sempre.
    expect(marcoDevido(40)).toBe(30);
    expect(marcoDevido(30 + TOLERANCIA_DIAS)).toBe(30);
  });

  it("cliente antigo demais NÃO entra na régua", () => {
    // O caso ruim: ligar a régua num banco com histórico e disparar
    // "faz 30 dias do seu carrossel" sobre uma peça de um ano atrás.
    expect(marcoDevido(400)).toBeNull();
    expect(marcoDevido(30 + TOLERANCIA_DIAS + 1)).toBeNull();
    expect(marcoDevido(29)).toBeNull();
    expect(marcoDevido(Number.NaN)).toBeNull();
  });

  it("depois de 90 dias a casa cala — não existe quarto marco", () => {
    expect(MARCOS).toEqual([30, 60, 90]);
    expect(marcoDevido(120)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o preço vem das DUAS tabelas, ou não vem", () => {
  it("item com piso no comercial cita o valor do catálogo", () => {
    const p = precoParaOferecer("balcao-carrossel-5");
    expect(p.valor).toBe(129);
    expect(p.texto).toContain("129");
  });

  it("item SEM piso em negociacao.ts sai sem número nenhum", () => {
    // "1-reel" custa R$ 350 no catálogo e não tem linha na tabela de piso.
    // Preço sem autorização do comercial não é preço: é chute com cara de tabela.
    const p = precoParaOferecer("1-reel");
    expect(p.valor).toBeNull();
    expect(p.motivo).toMatch(/piso/i);
  });

  it("item inexistente não vira preço aproximado", () => {
    expect(precoParaOferecer("nao-existe").valor).toBeNull();
  });

  it("a régua NUNCA fala em desconto, em marco nenhum", () => {
    for (const m of MARCOS) {
      const { corpo } = redigirToque(m, ancora({ compras: 3 }));
      expect(corpo).not.toMatch(/desconto|promo|off\b|%/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a mensagem é ancorada no que ele comprou de verdade", () => {
  it("cita a peça pelo rótulo do catálogo e nada mais sobre o negócio dele", () => {
    const { corpo } = redigirToque(30, ancora());
    expect(corpo).toContain("carrossel até 5 telas");
    expect(corpo).toContain("30 dias");
    // `toLocaleString("pt-BR")` usa espaço NÃO-quebrável entre "R$" e o número.
    expect(corpo).toMatch(/R\$\s129/);
  });

  it("o degrau do plano só aparece para quem comprou MAIS DE UMA vez", () => {
    const umaVez = redigirToque(60, ancora({ compras: 1 })).corpo;
    expect(umaVez).not.toMatch(/pacote do mês|8 peças/i);

    const varias = redigirToque(60, ancora({ compras: 4 })).corpo;
    expect(varias).toContain("4 peças que você pediu avulsas");
    expect(varias).toContain("8 peças");
  });

  it("o toque de 90 dias avisa que é o último", () => {
    const { corpo } = redigirToque(90, ancora());
    expect(corpo).toMatch(/último lembrete autom/i);
    expect(corpo).toMatch(/não vou ficar te procurando/i);
  });

  it("nenhum dos três textos promete resultado", () => {
    for (const m of MARCOS) {
      for (const compras of [1, 5]) {
        expect(temPromessaDeResultado(redigirToque(m, ancora({ compras })).corpo)).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CASA NÃO COBRA RECORRENTE — ENTÃO NENHUM TOQUE PODE PROMETER QUE COBRA
//
// Achado em 15/08/2026: o toque de 60 dias escrevia "Existe o pacote do mês
// (R$ 297,00 POR MÊS): 8 peças POR MÊS" e entrava SOZINHO na conversa do portal,
// puxado por cron diário contra produção. Não existe `preapproval`, assinatura
// nem débito automático em lugar nenhum desta casa — a única chamada ao Mercado
// Pago é preferência avulsa. A frase era falsa quando saía.
//
// O PREÇO NÃO MUDOU. R$ 297 continua sendo o valor do catálogo. O que saiu foi a
// promessa de que ele volta todo mês.
describe("nenhum toque promete cobrança que a casa não executa", () => {
  it("o toque de 60 dias cita o R$ 297 SEM prometer que ele se repete", () => {
    const corpo = redigirToque(60, ancora({ compras: 4 })).corpo;

    // O preço continua lá — o conserto não foi apagar o número.
    expect(corpo).toMatch(/R\$\s297/);
    // E o escopo continua descrito.
    expect(corpo).toContain("8 peças");

    // Mas nenhuma cadência de cobrança colada ao valor.
    expect(corpo).not.toMatch(/R\$\s*[\d.,]+\s*(?:\/\s*m[êe]s|por\s+m[êe]s|ao\s+m[êe]s)/i);
    expect(corpo).not.toMatch(/assinatura|mensalidade|todo m[êe]s|mensalmente/i);
    expect(prometeCobrancaRecorrente(corpo)).toBe(false);

    // E diz, com todas as letras, o que é verdade: paga uma vez.
    expect(corpo).toMatch(/compra única/i);
  });

  it("NENHUM dos três textos promete recorrência, em nenhuma contagem de compras", () => {
    for (const m of MARCOS) {
      for (const compras of [1, 2, 5, 12]) {
        const { corpo } = redigirToque(m, ancora({ compras }));
        expect(prometeCobrancaRecorrente(corpo), `marco ${m}, ${compras} compras: "${corpo}"`).toBe(false);
      }
    }
  });

  // ── METADE 1: a trava BARRA de verdade ─────────────────────────────────────
  it("a trava reconhece as formas em que a promessa aparece", () => {
    expect(prometeCobrancaRecorrente("O pacote sai por R$ 297,00 por mês.")).toBe(true);
    expect(prometeCobrancaRecorrente("R$ 297/mês, 8 peças.")).toBe(true);
    expect(prometeCobrancaRecorrente("R$ 297 mensais")).toBe(true);
    expect(prometeCobrancaRecorrente("É uma assinatura simples.")).toBe(true);
    expect(prometeCobrancaRecorrente("A mensalidade entra no cartão.")).toBe(true);
    expect(prometeCobrancaRecorrente("A cobrança é automática.")).toBe(true);
    expect(prometeCobrancaRecorrente("Você recebe peças todo mês.")).toBe(true);
    expect(prometeCobrancaRecorrente("Renova automaticamente.")).toBe(true);
  });

  // ── METADE 2: NÃO barra o texto legítimo ───────────────────────────────────
  it("a trava NÃO barra frase honesta que fala de um mês de conteúdo", () => {
    expect(prometeCobrancaRecorrente("Existe o pacote do mês (R$ 297): pauta, 8 peças e calendário.")).toBe(false);
    expect(prometeCobrancaRecorrente("É compra única, para um mês de conteúdo.")).toBe(false);
    expect(prometeCobrancaRecorrente("Faz 30 dias que entreguei seu carrossel. Eu produzo por R$ 129.")).toBe(false);
  });

  // ── E É TRAVA, NÃO AVISO: fail-closed no registro ──────────────────────────
  it("promessa que entrar pela lacuna do dado NÃO vira rascunho nem mensagem", async () => {
    // O caso real: alguém cadastra um item chamado assim, e o molde limpo o
    // carrega para dentro sem ninguém escrever nada errado.
    const r = await registrarToque(ancora({ itemLabel: "Plano com mensalidade" }), 30);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/cobran[çc]a recorrente/i);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
    expect(avisarCliente).not.toHaveBeenCalled();
  });

  it("o toque legítimo de 60 dias continua entrando na fila e no portal", async () => {
    const r = await registrarToque(ancora({ compras: 4 }), 60);
    expect(r.ok).toBe(true);
    expect(db.clientNotice.create).toHaveBeenCalledOnce();
    expect(avisarCliente).toHaveBeenCalledOnce();
    const enviado = avisarCliente.mock.calls[0]![1] as string;
    expect(enviado).toMatch(/R\$\s297/);
    expect(prometeCobrancaRecorrente(enviado)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a trava de promessa de resultado", () => {
  it("barra promessa que entrou pela lacuna do dado", async () => {
    // O caso ruim real: o rótulo do serviço traz a promessa, e o molde limpo a
    // carrega para dentro sem ninguém escrever nada errado.
    const r = await registrarToque(ancora({ itemLabel: "Pacote que dobra suas vendas" }), 30);
    expect(r.ok).toBe(false);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
    expect(avisarCliente).not.toHaveBeenCalled();
  });

  it("deixa passar o texto legítimo", async () => {
    const r = await registrarToque(ancora(), 30);
    expect(r.ok).toBe(true);
    expect(db.clientNotice.create).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("idempotência no banco", () => {
  it("o id do toque é determinístico — mesma âncora, mesmo id", () => {
    const a = { clientId: "cli-1", entregaId: "del-1" };
    expect(idDoToque(a, 30)).toBe(idDoToque(a, 30));
    expect(idDoToque(a, 30)).not.toBe(idDoToque(a, 60));
    expect(idDoToque(a, 30)).not.toBe(idDoToque({ clientId: "cli-2", entregaId: "del-1" }, 30));
    expect(idDoToque(a, 30)).toMatch(/^recompra-30-[0-9a-f]{32}$/);
  });

  it("rodar o cron duas vezes NÃO manda duas mensagens", async () => {
    const primeira = await registrarToque(ancora(), 30);
    expect(primeira.ok && primeira.jaExistia).toBe(false);
    expect(avisarCliente).toHaveBeenCalledOnce();

    // A segunda passada bate na chave primária. É o caso normal, não erro.
    db.clientNotice.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const segunda = await registrarToque(ancora(), 30);
    expect(segunda.ok).toBe(true);
    expect(segunda.ok && segunda.jaExistia).toBe(true);

    // E o portal também não recebe a segunda cópia: um único ponto de trava.
    expect(avisarCliente).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("fail-closed no canal", () => {
  it("cliente sem e-mail e sem telefone: registra o motivo e não some", async () => {
    const r = await registrarToque(ancora({ email: null, telefone: "  " }), 30);
    expect(r.ok).toBe(true);
    const gravado = db.clientNotice.create.mock.calls[0]![0].data;
    expect(gravado.status).toBe("pendente");
    expect(gravado.channel).toBe("nenhum");
    expect(gravado.failReason).toMatch(/sem e-mail e sem telefone/i);
  });

  it("com canal, o motivo continua sendo a trava de plataforma — nada sai sozinho", async () => {
    await registrarToque(ancora(), 30);
    const gravado = db.clientNotice.create.mock.calls[0]![0].data;
    expect(gravado.channel).toBe("nenhum");
    expect(gravado.status).toBe("pendente");
    expect(gravado.failReason).toMatch(/opt-in|Modelo de mensagem/i);
    // A prova de que a régua NÃO fala com a Meta: o kind entra na fila humana.
    expect(gravado.kind).toBe("recompra");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("quem entra na passada", () => {
  const agora = new Date("2026-08-06T12:00:00Z");

  function projeto(over: Record<string, unknown> = {}) {
    return {
      id: "prj-1",
      workspaceId: "ws-1",
      clientId: "cli-1",
      clientRequestId: "req-1",
      client: { id: "cli-1", name: "José", email: "ze@padaria.com", phone: "119" },
      deliverables: [{ id: "del-1", createdAt: new Date(agora.getTime() - 31 * DIA) }],
      ...over,
    };
  }

  beforeEach(() => {
    db.project.findFirst.mockResolvedValue(null);
    db.contentRequest.findFirst.mockResolvedValue(null);
    db.portalMessage.findFirst.mockResolvedValue(null);
    db.project.count.mockResolvedValue(1);
    db.clientRequestDb.findUnique.mockResolvedValue({
      briefingJson: JSON.stringify({ serviceId: "balcao-carrossel-5" }),
    });
  });

  it("o cliente que sumiu recebe o toque", async () => {
    db.project.findMany.mockResolvedValue([projeto()]);
    const r = await rodarReguaDeRecompra("ws-1", agora);
    expect(r.registrados).toBe(1);
    expect(db.clientNotice.create).toHaveBeenCalledOnce();
  });

  it("quem NÃO recebeu peça nenhuma não é tocado — não há o que dizer", async () => {
    db.project.findMany.mockResolvedValue([projeto({ deliverables: [] })]);
    const r = await rodarReguaDeRecompra("ws-1", agora);
    expect(r.registrados).toBe(0);
    expect(r.linhas[0]!.motivo).toMatch(/nada foi entregue/i);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
  });

  it("quem VOLTOU não recebe 'faz 30 dias que você sumiu'", async () => {
    db.project.findMany.mockResolvedValue([projeto()]);
    db.portalMessage.findFirst.mockResolvedValue({ id: "msg-1" });
    const r = await rodarReguaDeRecompra("ws-1", agora);
    expect(r.registrados).toBe(0);
    expect(r.linhas[0]!.motivo).toMatch(/voltou/i);
    expect(db.clientNotice.create).not.toHaveBeenCalled();
  });

  it("sem saber o item comprado, a régua para — frase não-ancorada não sai", async () => {
    db.project.findMany.mockResolvedValue([projeto()]);
    db.clientRequestDb.findUnique.mockResolvedValue({ briefingJson: "{}" });
    const r = await rodarReguaDeRecompra("ws-1", agora);
    expect(r.registrados).toBe(0);
    expect(r.linhas[0]!.motivo).toMatch(/item comprado/i);
  });

  it("a busca é limitada por tempo e por quantidade", async () => {
    db.project.findMany.mockResolvedValue([]);
    await rodarReguaDeRecompra("ws-1", agora);
    const args = db.project.findMany.mock.calls[0]![0];
    expect(args.take).toBeLessThanOrEqual(40);
    expect(args.where.type).toBe("balcao");
    expect(args.where.createdAt.lte).toBeInstanceOf(Date);
    // Só peças que o cliente REALMENTE viu — o portal só mostra "compartilhado".
    expect(args.select.deliverables.where.visibility).toBe("compartilhado");
  });
});
