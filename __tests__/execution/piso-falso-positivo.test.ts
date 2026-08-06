import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// A 5ª AUDITORIA ADVERSARIAL DO PISO DE VERDADE (04/08/2026) — A MORDAÇA.
//
// A auditoria NÃO achou falso negativo: as 18 alucinações que ela montou foram
// todas barradas. Ela achou o outro lado: **8 de 30 peças LEGÍTIMAS barradas**,
// 27% de falso positivo. Em `run-execution.ts`, peça barrada vira `skipped` →
// `executionStatus: failed` → o pacote NUNCA é apresentado. Com 27%, quase
// nenhum pacote sai: o fail-closed deixou de proteger e virou mordaça.
//
// A causa era uma só e era estrutural: **o EXTRATOR exigia mais do texto do
// CLIENTE do que o CONFERIDOR exigia da PEÇA.** O cliente escreve "de segunda a
// sábado" e a peça escreve "quarta-feira"; o cliente escreve "23h30" e a peça
// escreve "23:30"; o cliente escreve uma lista com vírgula e a peça cita o
// segundo item da lista. Nos três, a verdade existia e o piso não a enxergava.
//
// POR QUE ESTE ARQUIVO EXISTE, e é a lição que a casa já pagou duas vezes:
// os testes de `piso-de-verdade.test.ts` escreviam o briefing na MESMA notação
// da peça ("Funcionamos de terça a domingo, das 18h às 23h" dos dois lados).
// Media-se um mundo que o próprio teste arrumou. Aqui **o briefing é escrito
// por um cliente desleixado** — sem pontuação, com `23h30`, com intervalo de
// dias, em bullet sem verbo, com preço no meio da frase — e a verdade é montada
// pelo CAMINHO DE PRODUÇÃO (`buildVerdadeDoCliente`, lendo o banco), não à mão.
//
// E a medição é uma TAXA, não um exemplo: exemplo escolhido a dedo prova o que
// quem escolheu quis provar. Taxa sobre corpus é o que dá para acompanhar.
// ─────────────────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn() },
  client: { findUnique: vi.fn() },
  brandBrain: { findUnique: vi.fn() },
  // A gaveta das PROIBIÇÕES (`esteira/proibicoes.ts`). Ausente, a leitura falha
  // e o piso REPROVA por fail-closed — certo, mas não é o que esta suíte mede.
  brainArtifact: { findFirst: vi.fn(() => Promise.resolve(null)) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { buildVerdadeDoCliente } from "@/lib/dioli-brain/client-snapshot";
import { conferirPisoDeVerdade, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";

// ── Cliente 1: o briefing como o cliente escreve de verdade ──────────────────
//
// Sem ponto final, com intervalo de dias, com `23h30`, com lista separada por
// vírgula, e a linha de pagamento em BULLET — sem verbo nenhum. Nada aqui foi
// escrito para casar com a peça: foi escrito para parecer WhatsApp de cliente.
const BRIEFING_DESLEIXADO = [
  "Sushi Cazza restaurante japonês em Moema",
  "a gente abre de terça a domingo das 18h às 23h30",
  "delivery em Moema, Vila Mariana e Ibirapuera raio de 5 km",
  "Pix, cartão em até 6x e boleto",
  "pedidos pelo WhatsApp e pelo iFood",
  "entregamos em 45 minutos",
  "no cardápio tem rodízio, combinados e temaki",
].join("\n");

const PEDIDO_SUSHI = {
  id: "cr-sushi",
  clientId: "c-sushi",
  businessName: "Sushi Cazza",
  segment: "Restaurante",
  services: JSON.stringify(["Social Media"]),
  objectives: JSON.stringify(["Mais pedidos"]),
  rawContext: BRIEFING_DESLEIXADO,
  briefingJson: JSON.stringify({ businessName: "Sushi Cazza", budgetRange: "R$ 2.000" }),
  sdrHandoffJson: null,
};

// ── Cliente 2: o CAMINHO DE PRODUÇÃO REAL ────────────────────────────────────
//
// Aqui a verdade vem só do `briefingJson` — e o `BriefingScope`
// (`lib/agency/briefing-conversation.ts:68-95`) **não tem campo nenhum** de
// horário, área, pagamento ou prazo. O que ele tem é `social.platforms`, que é
// onde se PUBLICA, e nunca foi a lista de canais de contato do cliente.
const PEDIDO_SALAO = {
  id: "cr-salao",
  clientId: "c-salao",
  businessName: "Studio Bella",
  segment: "Beleza",
  services: JSON.stringify(["Social Media", "Tráfego Pago"]),
  objectives: JSON.stringify(["Mais agendamentos"]),
  rawContext:
    "Salão em Pinheiros. Escova a partir de R$ 60, corte feminino R$ 90 e coloração a partir de R$ 250.",
  briefingJson: JSON.stringify({
    businessName: "Studio Bella",
    segment: "Beleza",
    objectives: ["Mais agendamentos"],
    wantsSocialMedia: true,
    social: { platforms: ["Instagram", "Facebook"], postsPerMonth: 12 },
    wantsPaidTraffic: true,
    budgetRange: "R$ 1.500 a R$ 3.000",
    deadline: "30 dias",
    prospectPhone: "(11) 98765-4321",
  }),
  sdrHandoffJson: null,
};

const CLIENTES: Record<string, { request: unknown; client: unknown }> = {
  "cr-sushi": {
    request: PEDIDO_SUSHI,
    client: { id: "c-sushi", name: "Sushi Cazza", phone: "(11) 98940-0692", email: "contato@sushicazza.com.br", website: null },
  },
  "cr-salao": {
    request: PEDIDO_SALAO,
    client: { id: "c-salao", name: "Studio Bella", phone: null, email: null, website: null },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.clientRequestDb.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    CLIENTES[where.id]?.request ?? null,
  );
  db.client.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    Object.values(CLIENTES).find((c) => (c.client as { id: string }).id === where.id)?.client ?? null,
  );
  db.brandBrain.findUnique.mockResolvedValue(null);
});

// ── O corpus LEGÍTIMO ────────────────────────────────────────────────────────
//
// 30 peças que uma agência competente entrega e que o cliente confirmaria sem
// pestanejar — cada uma sustentada pelo que ELE escreveu, só que na notação de
// quem escreve peça, não na de quem preenche formulário.
const PECAS_LEGITIMAS_SUSHI = [
  // O intervalo de dias: o cliente disse "de terça a domingo"; quarta, quinta e
  // sexta estão DENTRO. Todo post de "hoje é quarta, vem!" morria aqui.
  "Quarta-feira é dia de sushi. Atendemos das 18h às 23h30.",
  "Sexta chegou! Funcionamos das 18:00 às 23:30.",
  "Sábado com casa cheia — abrimos às 18h.",
  "Quinta-feira o rodízio te espera. Atendimento até 23h30.",
  "Domingo em família: abrimos às 18h.",
  "Terça-feira, das 18h às 23h30, a casa é sua.",
  "Segunda a gente descansa. Funcionamos de terça a domingo, das 18h às 23h30.",
  "Aberto hoje, quinta, das 18h às 23h30.",
  "Sexta e sábado, das 18h às 23h30, com música ao vivo.",
  "Atendemos de terça a domingo.",
  // A lista de bairros: o cliente listou três; a peça cita o segundo e o terceiro.
  "Delivery na Vila Mariana.",
  "Entregamos em Ibirapuera também.",
  "Delivery em Moema, Vila Mariana e Ibirapuera.",
  "Entregamos em Moema em 45 minutos.",
  "Raio de entrega de 5 km.",
  "Combinados fresquinhos, entrega em 45 minutos na Vila Mariana.",
  // O bullet de pagamento, repetido em outra ordem.
  "Pague no Pix, boleto ou em até 6x no cartão.",
  "Aceitamos Pix.",
  "Parcele em até 6x no cartão.",
  "Pagamento no Pix ou boleto.",
  // Canal, prazo e oferta que ele informou.
  "Chame no WhatsApp e peça o seu.",
  "Peça pelo iFood e receba em 45 minutos.",
  "Entrega em 45 minutos, sem correria.",
  "Peça pelo WhatsApp.",
  "Também temos temaki.",
  "Combinado do dia: temaki de salmão. Peça pelo iFood.",
  "Nosso rodízio é a casa cheia de terça a domingo.",
  // Peça de marketing sem fato verificável — elogio nunca foi alegação.
  "Sabor que vale a espera.",
  "O melhor combinado do bairro, feito na hora.",
  // A peça inteira, do jeito que o cliente recebe.
  [
    "**Post 1 — Quarta é dia de rodízio**",
    "Legenda: A semana pede sushi. Funcionamos de terça a domingo, das 18h às 23h30.",
    "CTA: Chame no WhatsApp — entrega em 45 minutos na Vila Mariana.",
  ].join("\n"),
];

const PECAS_LEGITIMAS_SALAO = [
  // O CTA mais comum do mercado brasileiro. O briefing lista Instagram e
  // Facebook porque é lá que se PUBLICA — e o cliente deu o telefone dele.
  "Chame no WhatsApp e agende o seu horário.",
  "Agende pelo WhatsApp, sem fila.",
  // Preço que o CLIENTE escreveu, na notação de quem escreve peça.
  "Escova a partir de R$ 60,00.",
  "Corte feminino por R$ 90,00.",
  "Coloração a partir de R$ 250,00.",
  // Relatório mensal: gasto medido pela própria casa, dentro da verba dele.
  "Investimos R$ 1.200,00 em anúncios em julho.",
  "No mês, aplicamos R$ 1.500,00 em mídia paga.",
  // Publicação nos canais que ele contratou.
  "Siga a gente no Instagram.",
  "Acompanhe no Facebook.",
  "Beleza que começa no espelho e termina na rua.",
];

// ── O corpus ADVERSARIAL — o 0% de falso negativo não pode ceder ─────────────
const ALUCINACOES_SUSHI = [
  "Atendemos até meia-noite.",
  // O falso NEGATIVO comprovado pela auditoria: sem fronteira de palavra entre
  // `h` e `30`, "23h30" não era reconhecido em lugar NENHUM — e "2h30 da manhã"
  // PASSAVA num cliente que fecha 23h30. A trava era cara ou coroa.
  "Fechamos às 2h30 da manhã.",
  "Abrimos de segunda a domingo, das 12h às 23h30.",
  "Entregamos em toda a cidade.",
  "Fazemos delivery em Pinheiros.",
  "Entregamos num raio de 15 km.",
  "Aceitamos vale-refeição.",
  "Parcelamos em 12x sem juros.",
  "Também fazemos yakisoba de camarão.",
  "Peça pelo Rappi.",
  "Siga em @sushicazzaoficial.",
  "Acesse sushicazza.com.br e peça online.",
  "Entrega em 20 minutos.",
  "Reserve pelo (11) 91234-5678.",
  "Escreva para reservas@sushicazza.com.",
  "CNPJ 12.345.678/0001-90 — nota fiscal na hora.",
  "Garantimos 30% mais vendas no primeiro mês.",
  "Investimento sugerido: R$ 5.000,00 por mês.",
  "Legenda: TODO escrever depois.",
  "Ligue para [inserir telefone aqui] e reserve.",
];

const ALUCINACOES_SALAO = [
  // Gasto ACIMA da verba que o cliente autorizou continua sendo invenção.
  "Investimos R$ 12.000,00 em anúncios em julho.",
  "Escova a partir de R$ 35,00.",
  "Atendemos das 9h às 20h.",
  "Peça pelo iFood.",
  "Entregamos em toda a Zona Sul.",
  "Aceitamos Pix e boleto.",
  "Também fazemos micropigmentação.",
];

function taxa(pecas: string[], verdade: VerdadeDoCliente) {
  const barradas = pecas.filter((p) => !conferirPisoDeVerdade(p, verdade).aprovado);
  return { total: pecas.length, barradas: barradas.length, pct: barradas.length / pecas.length, quais: barradas };
}

describe("A TAXA DE FALSO POSITIVO — medida com texto de cliente, não de teste", () => {
  it("nenhuma peça legítima é barrada: 0% de falso positivo nos dois clientes", async () => {
    const sushi = (await buildVerdadeDoCliente("cr-sushi"))!;
    const salao = (await buildVerdadeDoCliente("cr-salao"))!;

    const a = taxa(PECAS_LEGITIMAS_SUSHI, sushi);
    const b = taxa(PECAS_LEGITIMAS_SALAO, salao);
    const pct = (a.barradas + b.barradas) / (a.total + b.total);

    // O relatório fica no próprio teste: quem quebrar isto vê O QUE foi barrado,
    // não só um número vermelho.
    if (pct > 0) {
      console.warn(
        `[falso-positivo] ${a.barradas + b.barradas}/${a.total + b.total} = ${(pct * 100).toFixed(0)}%\n` +
          [...a.quais, ...b.quais]
            .map((p) => {
              const v = conferirPisoDeVerdade(p, p.includes("R$") || p.includes("WhatsApp e agende") ? salao : sushi);
              return `  • "${p.slice(0, 70)}" → ${v.violacoes.map((x) => x.id).join(", ")}`;
            })
            .join("\n"),
      );
    }
    expect({ barradas: [...a.quais, ...b.quais], pct }).toEqual({ barradas: [], pct: 0 });
  });

  it("e o 0% de falso NEGATIVO não cedeu: toda alucinação continua barrada", async () => {
    const sushi = (await buildVerdadeDoCliente("cr-sushi"))!;
    const salao = (await buildVerdadeDoCliente("cr-salao"))!;

    const passaram = [
      ...ALUCINACOES_SUSHI.filter((p) => conferirPisoDeVerdade(p, sushi).aprovado),
      ...ALUCINACOES_SALAO.filter((p) => conferirPisoDeVerdade(p, salao).aprovado),
    ];
    expect(passaram).toEqual([]);
  });
});

describe("o EXTRATOR não pode exigir mais do cliente do que o CONFERIDOR exige da peça", () => {
  it("intervalo de dias: 'de terça a domingo' inclui os dias do meio", async () => {
    const op = (await buildVerdadeDoCliente("cr-sushi"))!.operacao!;
    expect(op.dias).toEqual(expect.arrayContaining(["ter", "qua", "qui", "sex", "sab", "dom"]));
    expect(op.dias).not.toContain("seg");
  });

  it("'23h30' é uma hora — e por não ser reconhecida, '2h30 da manhã' passava", async () => {
    const op = (await buildVerdadeDoCliente("cr-sushi"))!.operacao!;
    expect(op.horarios).toEqual(expect.arrayContaining(["18:00", "23:30"]));
    expect(op.horarios).not.toContain("23:00");
  });

  it("lista com vírgula: os três bairros viram verdade, não só o primeiro", async () => {
    const op = (await buildVerdadeDoCliente("cr-sushi"))!.operacao!;
    expect(op.areas).toEqual(expect.arrayContaining(["moema", "vila mariana", "ibirapuera"]));
    expect(op.raioEntregaKm).toBe(5);
  });

  it("bullet de pagamento sem verbo continua sendo o que o cliente aceita", async () => {
    const op = (await buildVerdadeDoCliente("cr-sushi"))!.operacao!;
    expect(op.pagamentos).toEqual(expect.arrayContaining(["pix", "cartao", "boleto"]));
    expect(op.parcelasMax).toBe(6);
    expect(op.pagamentos).not.toContain("vale");
  });

  it("preço escrito no meio da frase é valor informado pelo cliente", async () => {
    const v = (await buildVerdadeDoCliente("cr-salao"))!;
    expect(v.valores).toEqual(expect.arrayContaining([60, 90, 250, 1500, 3000]));
  });

  it("telefone informado ancora o CTA de WhatsApp — publicar não é atender", async () => {
    const v = (await buildVerdadeDoCliente("cr-salao"))!;
    expect(v.telefones.length).toBeGreaterThan(0);
    expect(conferirPisoDeVerdade("Chame no WhatsApp e agende.", v).aprovado).toBe(true);
    // Sem telefone nenhum, o mesmo CTA volta a ser afirmação sem lastro.
    const semTelefone: VerdadeDoCliente = { ...v, telefones: [] };
    expect(conferirPisoDeVerdade("Chame no WhatsApp e agende.", semTelefone).aprovado).toBe(false);
  });
});

describe('"NUNCA LANÇA" é promessa de código, não de comentário', () => {
  it("delegate ausente (modelo fora do client) devolve null em vez de estourar", async () => {
    const original = db.clientRequestDb;
    try {
      // @ts-expect-error — é exatamente o estado que o comentário prometia cobrir.
      delete db.clientRequestDb;
      await expect(buildVerdadeDoCliente("cr-sushi")).resolves.toBeNull();
    } finally {
      db.clientRequestDb = original;
    }
  });

  it("banco fora do ar devolve null — a virada do mês não cai por leitura auxiliar", async () => {
    db.clientRequestDb.findUnique.mockRejectedValue(new Error("connection refused"));
    await expect(buildVerdadeDoCliente("cr-sushi")).resolves.toBeNull();
  });

  it("registro corrompido no meio do caminho também não estoura", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ ...PEDIDO_SUSHI, services: null, rawContext: null });
    await expect(buildVerdadeDoCliente("cr-sushi")).resolves.not.toThrow();
  });
});
