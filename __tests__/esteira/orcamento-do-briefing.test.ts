// O orçamento que já existia e ninguém entregava.
//
// O CEO entregou briefing e esperou horas por um número que estava gravado no
// próprio pedido desde o primeiro segundo. A metade que importa neste teste
// não é "entregou": é **não inventou**. Um briefing sem estimativa derivada não
// pode ganhar número nenhum — nesta casa, valor vem de cálculo, e a IA só
// explica.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
  portalAccess: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import {
  entregarOrcamentosPendentes,
  textoDoOrcamento,
  faixaDoOrcamento,
} from "@/lib/agency/esteira/orcamento-do-briefing";
import { orcamentoProntoEmail } from "@/lib/email/templates";

/** O contato DECLARADO, no formato canônico que o gate de 08/08 grava. */
const CONTATO = { nome: "Dioli", email: "ceo@cityjobs.com.br", whatsapp: null };

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "req1",
    clientId: "cli1",
    businessName: "CityJobs",
    status: "new",
    createdAt: new Date("2026-08-16T01:12:00Z"),
    sdrHandoffJson: null,
    briefingJson: JSON.stringify({
      contato: CONTATO,
      estimate: { totalMin: 1390, totalMax: 2590, items: [{ label: "Social media", detail: "3 posts/semana" }] },
    }),
    ...over,
  };
}

/** O mesmo pedido, mas do jeito que o do CEO entrou em 16/08: sem canal. */
function pedidoSemContato(over: Record<string, unknown> = {}) {
  return pedido({
    status: "lead_incompleto",
    briefingJson: JSON.stringify({
      estimate: { totalMin: 1390, totalMax: 2590 },
    }),
    ...over,
  });
}

beforeEach(() => {
  db.clientRequestDb.findMany.mockReset();
  db.clientRequestDb.update.mockReset();
  db.portalMessage.create.mockReset();
  db.portalAccess.findFirst.mockReset();
  db.portalAccess.findFirst.mockResolvedValue({ token: "tok123" });
  db.$transaction.mockClear();
  email.sendEmail.mockReset();
  email.sendEmail.mockResolvedValue({ ok: true, id: "em_1" });
});

describe("entrega o número que já estava calculado", () => {
  it("escreve a conversa e tira o pedido da fila de novos", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(1);
    expect(r.semOrcamento).toBe(0);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(db.clientRequestDb.update).toHaveBeenCalledTimes(1);

    // Mensagem e mudança de estado na MESMA transação: entregar sem sair de
    // `new` faria a casa mandar o mesmo orçamento a cada cinco minutos.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const estado = db.clientRequestDb.update.mock.calls[0][0];
    expect(estado.data.status).toBe("proposal_pending");
  });

  it("a mensagem vai como equipe, para o cliente daquele pedido", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();
    const msg = db.portalMessage.create.mock.calls[0][0].data;
    expect(msg.authorRole).toBe("team");
    expect(msg.clientRequestId).toBe("req1");
    expect(msg.clientId).toBe("cli1");
  });
});

describe("NÃO inventa número — a metade que importa", () => {
  it("briefing sem estimativa não vira mensagem nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: JSON.stringify({ scope: {} }) })]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(0);
    expect(r.semOrcamento).toBe(1);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    // E continua em `new`: fica para gente resolver, não some da fila.
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("JSON quebrado não derruba a rodada nem inventa valor", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: "{isso não é json" })]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(r.falhas).toEqual([]);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("estimativa zerada é o mesmo que estimativa nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: JSON.stringify({ estimate: { totalMin: 0, totalMax: 0 } }) }),
    ]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("um pedido com erro não impede o seguinte de ser entregue", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ id: "req1" }), pedido({ id: "req2" })]);
    db.$transaction.mockRejectedValueOnce(new Error("banco travou"));
    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(1);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("o texto que o cliente lê", () => {
  const e = {
    totalMin: 1390,
    totalMax: 2590,
    items: [{ label: "Social media", detail: "3 posts/semana" }],
    notIncluded: ["verba de mídia"],
    missingForEstimate: ["Frequência de posts por semana"],
  };

  it("mostra a faixa em reais e o que entra", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).toContain("CityJobs");
    expect(t).toMatch(/1\.390/);
    expect(t).toMatch(/2\.590/);
    expect(t).toContain("Social media");
  });

  it("diz o que NÃO está incluído e o que ainda falta", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).toContain("verba de mídia");
    expect(t).toContain("Frequência de posts por semana");
  });

  it("deixa claro que é estimativa, não proposta fechada", () => {
    expect(textoDoOrcamento("CityJobs", e)).toMatch(/estimativa/i);
    expect(textoDoOrcamento("CityJobs", e)).toMatch(/não a proposta final/i);
  });

  it("NÃO promete prazo — ordem do CEO em 16/08", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).not.toMatch(/\b1 dia\b|\bum dia\b|\b24 horas\b|\bat[ée] \d+ dias?\b/i);
  });

  it("não vaza vocabulário de máquina nem custo interno", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).not.toMatch(/\$\d|clientRequestId|correlation|orchestrator/i);
  });
});

describe("briefing SEM contato tambem e atendido — a causa raiz da noite de 16/08", () => {
  it("pega lead_incompleto, nao so new", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await entregarOrcamentosPendentes();
    const where = db.clientRequestDb.findMany.mock.calls[0][0].where;
    // O briefing do CEO entrou sem contato (o SDR havia parado de pedir
    // e-mail) e a porta de entrada o gravou como `lead_incompleto`. Nesse
    // estado ele ficava fora da vista de TUDO — e o CEO esperou a noite
    // inteira por um orcamento de um pedido tratado como lixo.
    expect(where.status.in).toContain("new");
    expect(where.status.in).toContain("lead_incompleto");
    // Terceiro estado, achado pelo diario do piloto: o auto-scope move o
    // pedido para `scope_ready` e ali ele morria — escopo pronto era o fim da
    // linha em vez do meio dela.
    expect(where.status.in).toContain("scope_ready");
  });

  it("entrega o orcamento de um lead_incompleto pelo portal", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ status: "lead_incompleto", clientId: null })]);
    const r = await entregarOrcamentosPendentes();
    // Faltar contato impede AVISAR por fora; nao impede ATENDER. O portal nao
    // precisa de e-mail para funcionar.
    expect(r.entregues).toBe(1);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
  });
});

describe("estimativa travada nao vira orcamento — o CityJobs de 16/08", () => {
  // O cliente pediu 2 posts estaticos por DIA. O volume chegou ZERADO ao
  // calculo, atravessou os guardioes (que testavam `=== undefined`, e zero e
  // definido), virou "Plano Essencial" de 3 posts/semana por tabela e saiu como
  // R$ 1.800 a R$ 3.400 — com `confidence: "high"`.
  //
  // O que torna esse caso perigoso, e o motivo deste teste existir: a
  // estimativa travada TEM numero. R$ 1.800 e maior que zero e passaria por
  // toda conferencia de "tem estimativa?" que existia neste arquivo.
  const travada = JSON.stringify({
    estimate: {
      totalMin: 1800,
      totalMax: 3400,
      items: [{ label: "Plano Essencial", detail: "3 posts + 5 stories/semana" }],
      travadaPor: "O volume de posts nao chegou no pedido, e e ele que define o plano.",
    },
  });

  it("nao manda mensagem nenhuma ao cliente", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    const r = await entregarOrcamentosPendentes();

    // Numero que nao se sustenta nao vira preco nesta casa. Nesta casa valor
    // vem de calculo, e a IA nunca inventa.
    expect(r.entregues).toBe(0);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("conta como semOrcamento — o pedido fica parado, mas nunca em silencio", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    const r = await entregarOrcamentosPendentes();

    // `semOrcamento` e o numero que faz gente olhar. Travar sem contar seria
    // trocar um orcamento errado por um pedido desaparecido — e o CEO ja
    // esperou uma noite inteira por um pedido que o sistema tratava como lixo.
    expect(r.semOrcamento).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });

  it("deixa o pedido de pe, no estado em que estava", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    await entregarOrcamentosPendentes();
    // Sem `proposal_pending`: o pedido nao avanca para uma fila que promete um
    // numero que ele nao tem.
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A SETA SEGUINTE — 16/08/2026
//
// Pergunta do CEO, com o piloto no ar: *"nada ainda via e-mail. O que
// aconteceu?"*. Tinha acontecido que este arquivo criava o `portalMessage` e
// mais nada: o orçamento esperava dentro do portal alguém voltar para olhar.
// Caixa certa, seta faltando — de novo, um degrau adiante.
// ─────────────────────────────────────────────────────────────────────────────

describe("o cliente FICA SABENDO que o orçamento ficou pronto", () => {
  it("manda e-mail pelo canal que o cliente declarou", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(1);
    expect(r.avisados).toBe(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].to).toBe("ceo@cityjobs.com.br");
  });

  it("o e-mail leva o link do portal, no domínio da casa", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    const html = email.sendEmail.mock.calls[0][0].html as string;
    // Ordem do CEO em 16/08: *"está tudo ainda com o domínio, é pra estar
    // diolidigital.com.br."* Link de `*.up.railway.app` na caixa de entrada do
    // cliente não é o endereço da casa — e ainda quebra o OAuth do Drive.
    expect(html).toContain("https://www.diolidigital.com.br/portal/access/tok123");
    expect(html).not.toMatch(/up\.railway\.app/);
  });

  it("o e-mail AVISA, não substitui o portal — a conversa segue sendo a verdade", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    const html = email.sendEmail.mock.calls[0][0].html as string;
    // Mandar a mensagem inteira por e-mail criaria uma segunda verdade, que
    // diverge do portal no primeiro ajuste de escopo. O e-mail leva o
    // essencial (a faixa) e o caminho de ver o resto.
    expect(html).toMatch(/conversa/i);
    expect(html).toContain("Ver o orçamento completo");
    expect(html).not.toContain("O que NÃO está incluído");
  });

  it("sem token de portal o e-mail sai assim mesmo, sem botão que não leva a lugar nenhum", async () => {
    db.portalAccess.findFirst.mockResolvedValue(null);
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    expect(r.avisados).toBe(1);
    const html = email.sendEmail.mock.calls[0][0].html as string;
    expect(html).not.toContain("Ver o orçamento completo");
    // E continua dizendo por onde responder: aviso sem saída é aviso pela metade.
    expect(html).toMatch(/responder/i);
  });
});

describe("faltar contato impede AVISAR, nunca impede ATENDER", () => {
  it("briefing sem e-mail é entregue no portal e NÃO tenta enviar nada", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedidoSemContato()]);
    const r = await entregarOrcamentosPendentes();

    // A causa raiz da noite de 16/08 foi tratar "sem contato" como "sem
    // pedido". O portal não precisa de e-mail para funcionar: o cliente
    // escreveu, anexou material e está com a conversa aberta.
    expect(r.entregues).toBe(1);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(r.semCanal).toBe(1);
    expect(r.avisados).toBe(0);
    expect(email.sendEmail).not.toHaveBeenCalled();
    // Sem canal NÃO é falha — é fato. Contá-lo como falha ensinaria a casa a
    // ignorar o alarme que importa.
    expect(r.avisosQueFalharam).toEqual([]);
    expect(r.falhas).toEqual([]);
  });
});

describe("falha de e-mail não desfaz nem repete a entrega", () => {
  it("e-mail que falha deixa a entrega de pé e vira notícia", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, error: "resend_422: domínio não verificado" });
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    // Desfazer a entrega por causa de um e-mail trocaria um problema pequeno
    // (o cliente não foi avisado) por um grande (o orçamento sumiu do portal).
    expect(r.entregues).toBe(1);
    expect(db.clientRequestDb.update.mock.calls[0][0].data.status).toBe("proposal_pending");
    expect(r.avisados).toBe(0);
    expect(r.avisosQueFalharam).toHaveLength(1);
    expect(r.falhas).toEqual([]);
  });

  it("e-mail que LANÇA não derruba a rodada nem o pedido seguinte", async () => {
    email.sendEmail.mockRejectedValueOnce(new Error("rede caiu"));
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ id: "req1" }), pedido({ id: "req2" })]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(2);
    expect(r.avisados).toBe(1);
    expect(r.avisosQueFalharam).toHaveLength(1);
  });

  it("um e-mail por orçamento, e só depois de o pedido sair da fila", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    // ESTA É A GARANTIA DE NÃO DUPLICAR, e ela é de ORDEM, não de contador.
    // O que tira o pedido de `new` é a transação; enquanto ele estiver lá, a
    // próxima batida do relógio (cinco minutos) o pega de novo. Se o e-mail
    // saísse ANTES da transação, um banco que falhasse produziria um e-mail a
    // cada cinco minutos com o mesmo orçamento.
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const ordemDaTransacao = db.$transaction.mock.invocationCallOrder[0];
    const ordemDoEmail = email.sendEmail.mock.invocationCallOrder[0];
    expect(ordemDoEmail).toBeGreaterThan(ordemDaTransacao);
  });

  it("transação que falha NÃO manda e-mail — senão o cliente recebe de novo na próxima rodada", async () => {
    db.$transaction.mockRejectedValueOnce(new Error("banco travou"));
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(0);
    expect(r.falhas).toHaveLength(1);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe("o texto do e-mail entra na MESMA regra do texto do orçamento", () => {
  const pronto = () =>
    orcamentoProntoEmail({
      prospectName: "Dioli",
      businessName: "CityJobs",
      faixa: "R$ 1.390 a R$ 2.590 por mês",
      portalLink: "https://www.diolidigital.com.br/portal/access/tok123",
    });

  it("NÃO promete prazo — ordem do CEO em 16/08", () => {
    // *"em relação à confirmação de promessa, de orçamento em um dia, não
    // autorizei nada disso."* O e-mail é irmão da tela e do texto do portal:
    // consertar só o que aparece no print deixa a promessa viva na caixa de
    // entrada do cliente.
    const { subject, html } = pronto();
    for (const t of [subject, html]) {
      expect(t).not.toMatch(/\b1 dia\b|\bum dia\b|\b24 horas\b|\bat[ée] \d+ dias?\b|\bem breve\b/i);
    }
  });

  it("diz que é estimativa, não proposta fechada", () => {
    expect(pronto().html).toMatch(/estimativa/i);
    expect(pronto().html).toMatch(/não a proposta final/i);
  });

  it("mostra a faixa que veio pronta e não inventa número nenhum", () => {
    const { html } = pronto();
    expect(html).toMatch(/1\.390/);
    expect(html).toMatch(/2\.590/);

    // Sem faixa não aparece valor: o template NÃO calcula. Se quem chama não
    // derivou número, número não existe — nesta casa valor vem de cálculo.
    const sem = orcamentoProntoEmail({ businessName: "CityJobs" });
    expect(sem.html).not.toMatch(/R\$/);
  });

  it("o valor sai de um formatador só, o mesmo do portal", () => {
    // Dois formatadores arredondam diferente, e o cliente lê dois valores para
    // o mesmo orçamento — que é como se perde a confiança num número certo.
    // (O `\s` das expressões é o espaço inquebrável que o `pt-BR` insere depois
    // do `R$` — comparar com espaço comum reprovaria um texto correto.)
    expect(faixaDoOrcamento({ totalMin: 1390, totalMax: 2590 })).toMatch(/^R\$\s1\.390 a R\$\s2\.590 por mês$/);
    expect(faixaDoOrcamento({ totalMin: 990, totalMax: 990 })).toMatch(/^R\$\s990 por mês$/);
    expect(textoDoOrcamento("CityJobs", { totalMin: 1390, totalMax: 2590 })).toMatch(/R\$\s1\.390/);
  });

  it("não vaza vocabulário de máquina para a caixa do cliente", () => {
    expect(pronto().html).not.toMatch(/clientRequestId|lead_incompleto|proposal_pending|resend_/i);
  });

  it("faixa acima da verba declarada não chega NUA na caixa de entrada", () => {
    // O CityJobs disse *"algo em torno de R$ 500 por mês"* e recebeu
    // R$ 1.800–3.400. O portal passou a nomear a diferença; o e-mail é onde o
    // cliente lê o valor PRIMEIRO — mostrar só a faixa devolveria o silêncio
    // que a casa acabou de tirar da conversa.
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({
        briefingJson: JSON.stringify({
          contato: CONTATO,
          estimate: {
            totalMin: 1800,
            totalMax: 3400,
            confrontoDeVerba: { teto: 500, rotulo: "R$ 500", diferenca: 2900, cabemNaVerba: [] },
          },
        }),
      }),
    ]);
    return entregarOrcamentosPendentes().then(() => {
      const html = email.sendEmail.mock.calls[0][0].html as string;
      expect(html).toMatch(/verba menor/i);
      // Reconhecimento, não conta. Quem nomeia a diferença e oferece o que cabe
      // é a conversa — duas versões da mesma conta divergem no primeiro ajuste.
      expect(html).not.toMatch(/2\.900|R\$\s?500\b/);
    });
  });

  it("sem confronto de verba o e-mail não inventa ressalva nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();
    expect(email.sendEmail.mock.calls[0][0].html as string).not.toMatch(/verba menor/i);
  });
});
