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
  portalAccess: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  // O AVISO QUE FALHA NUNCA MAIS SOME (16/08/2026): a persistência do
  // resultado usa SQL cru (a coluna é nova; ver o comentário de
  // `gravarResultadoDoAviso`), então o mock precisa dos dois métodos crus —
  // sem eles, toda gravação cairia silenciosamente no `catch` e nenhum teste
  // conseguiria provar que ela aconteceu.
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// `send.ts` está mockado, então o módulo real não entrega a constante aqui —
// o valor de verdade é exercitado em `__tests__/cliente-falso/a-trava-de-saida.test.ts`,
// contra o `sendEmail` real. Aqui só interessa que o motivo ATRAVESSE.
const SEM_CHAVE = "sem_chave: RESEND_API_KEY não configurada (ausente ou vazia) no ambiente";
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
  db.portalAccess.findMany.mockReset();
  // O pedido JÁ tem porta de aceite viva: `linkDaProposta` reaproveita e não
  // revoga nada — a regra 2 de `links-do-portal.ts`.
  db.portalAccess.findMany.mockResolvedValue([{ token: "tok123", expiresAt: null }]);
  db.portalAccess.create.mockReset();
  db.portalAccess.create.mockResolvedValue({ token: "tok-novo" });
  db.$transaction.mockClear();
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(1);
  db.$queryRawUnsafe.mockReset();
  db.$queryRawUnsafe.mockResolvedValue([]);
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

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ O QUE ESTE BLOCO GARANTIA, E O QUE MUDOU EM 25/08/2026
// ═══════════════════════════════════════════════════════════════════════════
//
// Este bloco exigia `portalMessage.create` NUNCA chamado, e chamava isso de
// "não inventa número". Duas coisas estavam grudadas numa asserção só:
//
//   1. **não inventar PREÇO** — verdadeiro, obrigatório, e continua exigido
//      aqui (`entregues: 0`, sem `proposal_pending`);
//   2. **não dizer NADA ao cliente** — que não era garantia nenhuma: era o
//      defeito. Medido em produção em 25/08: um briefing sem o número de posts
//      por semana travava em `scope_ready`, o relógio escrevia "aguardando
//      gente" a cada 5 minutos, e o cliente do outro lado nunca era avisado.
//      Ele sumia sem barulho.
//
// A régua nova separa as duas: o preço continua proibido, e o SILÊNCIO passa a
// ser proibido também. Ausência de informação não é informação, e silêncio não
// é espera.

describe("NÃO inventa número — a metade que importa", () => {
  it("briefing sem estimativa não vira PREÇO — e não vira silêncio", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: JSON.stringify({ scope: {} }) })]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(0);
    expect(r.semOrcamento).toBe(1);
    // NÃO avança para a fila que promete um número que ele não tem.
    const avancou = db.clientRequestDb.update.mock.calls.some(
      (c: unknown[]) => "status" in (c[0] as { data: Record<string, unknown> }).data,
    );
    expect(avancou).toBe(false);
    // E o cliente É avisado, uma vez, do que falta.
    expect(r.faltaAvisada).toBe(1);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    const corpo = db.portalMessage.create.mock.calls[0][0].data.body as string;
    expect(corpo).not.toMatch(/R\$/);
  });

  it("JSON quebrado não derruba a rodada nem inventa valor", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: "{isso não é json" })]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(r.falhas).toEqual([]);
    // JSON quebrado NÃO conclui "já avisei": o cliente é avisado, com o texto
    // honesto ("a minha conta não fechou"), sem chutar o que falta.
    expect(r.faltaAvisada).toBe(1);
    expect(db.portalMessage.create.mock.calls[0][0].data.body).not.toMatch(/R\$/);
  });

  it("estimativa zerada é o mesmo que estimativa nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: JSON.stringify({ estimate: { totalMin: 0, totalMax: 0 } }) }),
    ]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(r.entregues).toBe(0);
    expect(r.faltaAvisada).toBe(1);
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

  it("nao manda ORCAMENTO nenhum — manda o motivo", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    const r = await entregarOrcamentosPendentes();

    // Numero que nao se sustenta nao vira preco nesta casa. Nesta casa valor
    // vem de calculo, e a IA nunca inventa.
    expect(r.entregues).toBe(0);
    const corpo = db.portalMessage.create.mock.calls[0][0].data.body as string;
    // R$ 1.800 estava gravado e nao pode aparecer: e o numero que nao se sustenta.
    expect(corpo).not.toMatch(/1\.800|3\.400|R\$/);
    // O que aparece e o MOTIVO, que ja estava guardado na coluna e nunca virava
    // pixel — mais o dono e a proxima acao.
    expect(corpo).toContain("volume de posts");
    expect(corpo).toContain("equipe comercial");
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
    // numero que ele nao tem. A UNICA escrita permitida aqui e a marca do
    // aviso, que nao muda estado nenhum.
    for (const c of db.clientRequestDb.update.mock.calls) {
      expect(Object.keys(c[0].data)).toEqual(["briefingJson"]);
    }
  });

  it("avisa UMA vez: a segunda rodada nao repete a mensagem", async () => {
    // A varredura roda de 5 em 5 min. Sem a marca seriam 288 mensagens por dia
    // — o jeito mais rapido de ensinar o cliente a nao ler o portal.
    const jaAvisado = JSON.stringify({
      ...JSON.parse(travada),
      faltaAvisadaEm: "2026-08-25T12:00:00.000Z",
    });
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: jaAvisado })]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(r.faltaAvisada).toBe(0);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
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
    expect(html).toContain("https://www.diolidigital.com.br/proposta/tok123");
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

  it("quando NÃO dá para cunhar a porta, o e-mail sai assim mesmo — sem botão que não leva a lugar nenhum", async () => {
    // Cunhar falhou (banco fora do ar, por exemplo). A entrega vale: falhar em
    // fabricar o link não pode desfazer um orçamento já entregue.
    db.portalAccess.findMany.mockResolvedValue([]);
    db.portalAccess.create.mockRejectedValue(new Error("banco fora do ar"));
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

// ─────────────────────────────────────────────────────────────────────────────
// O AVISO QUE FALHA NUNCA MAIS SOME — 16/08/2026
//
// `RESEND_FROM` não existe no Railway (medido). Sem ela, todo aviso de
// orçamento falha no dia do deploy — e até aqui a falha virava um
// `console.warn` que morria no rodízio do log do container. "Log não é fila":
// ninguém consulta, ninguém reprocessa, e quando o CEO configurar a variável
// ninguém é reavisado — o silêncio de 51 dias (Sushi Cazza) recriado, agora
// invisível porque parece que o sistema fez a parte dele.
//
// Estes testes provam que o resultado (sucesso INCLUÍDO) vira uma escrita no
// banco que sobrevive à função que a produziu — é o que autoriza um reenvio a
// existir sem virar máquina de mandar o mesmo orçamento duas vezes.
// ─────────────────────────────────────────────────────────────────────────────

describe("a falha do aviso vira estado gravado — não some com a rodada", () => {
  it("e-mail que falha grava avisoOrcamentoStatus='falhou' com o motivo", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, error: "resend_422: domínio não verificado" });
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const args = db.$executeRawUnsafe.mock.calls[0];
    expect(args[0]).toMatch(/UPDATE ClientRequestDb/);
    // status, detalhe, em(iso), id — nesta ordem, ver `gravarResultadoDoAviso`.
    expect(args[1]).toBe("falhou");
    expect(args[2]).toMatch(/domínio não verificado/);
    expect(args[4]).toBe("req1");
  });

  it("RESEND_API_KEY ausente grava 'skipped', distinto de 'falhou' — é configuração, não defeito do pedido", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, skipped: true, error: SEM_CHAVE });
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    const args = db.$executeRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("skipped");
    expect(args[2]).toMatch(/RESEND_API_KEY/);
  });

  // ── O DEFEITO MEDIDO EM PRODUÇÃO EM 25/08/2026 ────────────────────────────
  // A tela do CEO mostrava DOIS pedidos com o motivo "RESEND_API_KEY ausente"
  // e contato `@cliente-falso.invalid` — enquanto `RESEND_API_KEY` estava
  // cadastrada no Railway. O e-mail não saiu porque a TRAVA DE SAÍDA barrou o
  // domínio de teste, que é ela funcionando; mas o motivo gravado mandava o CEO
  // configurar uma chave que já existia, e escondia a trava.
  //
  // `sendEmail` devolve `skipped: true` nos dois casos. Ler só a forma e chutar
  // o motivo é o defeito. Este teste mata a mutação que o traria de volta: se
  // alguém reescrever `detalhe` como frase fixa, ele fica vermelho.
  it("skipped por TRAVA DE SAÍDA grava a trava — nunca 'RESEND_API_KEY ausente'", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, skipped: true, error: "bloqueado:dominio_inexistente" });
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    const args = db.$executeRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("skipped");
    expect(args[2]).toMatch(/bloqueado:dominio_inexistente/);
    expect(args[2]).not.toMatch(/RESEND_API_KEY/);
  });

  it("caso limpo intacto: quem foi avisado de primeira grava 'avisado', nunca estado de erro", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();

    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const args = db.$executeRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("avisado");
    expect(args[2]).toBeNull();
  });

  it("sem_canal grava o fato, mas NUNCA como 'falhou' — sem_canal não é falha", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedidoSemContato()]);
    await entregarOrcamentosPendentes();

    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const args = db.$executeRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("sem_canal");
    expect(args[1]).not.toBe("falhou");
  });

  it("uma falha ao GRAVAR o estado não derruba a rodada — o próximo pedido segue", async () => {
    db.$executeRawUnsafe.mockRejectedValueOnce(new Error("banco fora do ar"));
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ id: "req1" }), pedido({ id: "req2" })]);
    const r = await entregarOrcamentosPendentes();

    // A entrega (o que chega ao cliente) não depende da gravação de
    // diagnóstico: os dois pedidos continuam entregues e avisados.
    expect(r.entregues).toBe(2);
    expect(r.avisados).toBe(2);
    expect(r.falhas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FILA NÃO ENTUPE MAIS — 86 falhas em 24h eram ARITMÉTICA, não IA
// ─────────────────────────────────────────────────────────────────────────────
//
// Medição de 25/08/2026 (`docs/medicoes/elo-9-orcamento.md`): a rodada pegava
// os 5 mais antigos, e pedido sem estimativa nunca muda de estado — logo nunca
// sai da janela. Cinco desses paravam a esteira para todo mundo, com
// `entregues=0, semOrcamento=5` a cada 5 minutos, calado.
//
// A prova aqui é a mesma do experimento controlado da medição: MESMO pedido,
// MESMA estimativa, mudando só quantos pedidos sem orçamento estão à frente.

describe("a fila do orçamento não entope com quem nunca gera número", () => {
  /** Um pedido ANTIGO e sem estimativa nenhuma: ele volta para sempre. */
  function velhoSemNumero(n: number) {
    return pedido({
      id: `velho${n}`,
      createdAt: new Date(`2026-07-0${n}T00:00:00Z`),
      briefingJson: JSON.stringify({ contato: CONTATO }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.clientRequestDb.update.mockResolvedValue({});
    db.portalMessage.create.mockResolvedValue({});
    db.portalAccess.findMany.mockResolvedValue([]);
    db.portalAccess.create.mockResolvedValue({ token: "tok" });
    email.sendEmail.mockResolvedValue({ ok: true });
  });

  it("com SEIS pedidos velhos sem número na frente, o orçamento pronto SAI mesmo assim", async () => {
    // Antes de 26/08/2026 este caso devolvia `entregues=0, semOrcamento=5`.
    db.clientRequestDb.findMany.mockResolvedValue([
      ...[1, 2, 3, 4, 5, 6].map(velhoSemNumero),
      pedido({ id: "novo-com-numero" }),
    ]);
    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(1);
  });

  it("quem não tem número CONTINUA sendo atendido — com as vagas que sobram", async () => {
    // A partição não é uma fila de exclusão: sem ninguém com número na frente,
    // os sem número ocupam a rodada inteira e recebem o aviso do que falta.
    db.clientRequestDb.findMany.mockResolvedValue([1, 2, 3].map(velhoSemNumero));
    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(0);
    expect(r.semOrcamento).toBe(3);
  });

  it("o teto de ENTREGAS por rodada continua valendo — a janela larga é só de leitura", async () => {
    db.clientRequestDb.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => pedido({ id: `com-numero-${i}` })),
    );
    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(5);
  });
});
