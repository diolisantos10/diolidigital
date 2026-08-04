import { describe, it, expect } from "vitest";
import {
  conferirPisoDeVerdade,
  resumirViolacoes,
  extrairVerdadeOperacional,
  classesSemInformacao,
  type VerdadeDoCliente,
} from "@/lib/agency/execution/piso-de-verdade";

const verdade: VerdadeDoCliente = {
  businessName: "Sushi Cazza",
  telefones: ["(11) 98940-0692"],
  emails: ["contato@sushicazza.com.br"],
  servicos: ["Social Media", "Design"],
  valores: [2000],
};

const ok = (c: string) => conferirPisoDeVerdade(c, verdade);

describe("o piso reprova o que chega no cliente como mentira", () => {
  it("telefone que a agência não conhece", () => {
    // Cliente ligando num número errado impresso pela agência é dano direto ao
    // negócio dele — não é questão de estilo.
    const r = ok("Faça sua reserva: (11) 91234-5678");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes[0]!.id).toBe("telefone_inventado");
  });

  it("e-mail que não veio do cliente", () => {
    const r = ok("Escreva para reservas@sushicazza.com");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes[0]!.id).toBe("email_inventado");
  });

  it("valor que o cliente nunca informou", () => {
    const r = ok("Investimento sugerido: R$ 5.000,00 por mês.");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes[0]!.id).toBe("valor_inventado");
  });

  it("CNPJ inventado — não existe motivo legítimo para a IA gerar documento", () => {
    const r = ok("CNPJ 12.345.678/0001-90");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes[0]!.id).toBe("documento_inventado");
  });

  it("rascunho vazado para a entrega", () => {
    const r = ok("Ligue para [inserir telefone aqui] e reserve.");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes.some((v) => v.id === "placeholder")).toBe(true);
  });

  it("garantia de resultado com número — é risco jurídico, não estético", () => {
    const r = ok("Garantimos 30% mais vendas no primeiro mês.");
    expect(r.aprovado).toBe(false);
    expect(r.violacoes.some((v) => v.id === "promessa_de_resultado")).toBe(true);
  });

  it("promessa sem número também não passa", () => {
    expect(ok("Prometemos aumento de faturamento já no primeiro mês.").aprovado).toBe(false);
  });
});

describe("o piso NÃO atrapalha o trabalho legítimo", () => {
  it("o telefone real do cliente passa, mesmo escrito de outro jeito", () => {
    expect(ok("Reservas pelo 11 98940-0692").aprovado).toBe(true);
    expect(ok("WhatsApp: +55 (11) 9 8940-0692").aprovado).toBe(true);
  });

  it("o valor que o cliente informou passa", () => {
    expect(ok("Verba mensal de R$ 2.000,00 conforme combinado.").aprovado).toBe(true);
  });

  it('"PRECISO CONFIRMAR" é o comportamento CERTO e não pode ser punido', () => {
    // A trava de verdade ancorada manda o especialista admitir o que não sabe.
    // Se o piso reprovasse a admissão, ensinaria o agente a chutar.
    const r = ok("Investimento: PRECISO CONFIRMAR: verba mensal com o cliente.");
    expect(r.aprovado).toBe(true);
  });

  it("peça criativa sem número nem contato passa limpo", () => {
    const r = ok("**1. O rodízio que vale a espera**\n- Legenda: Sua mesa está pronta. Venha viver a experiência.\n- Visual: prato em close, luz quente lateral.");
    expect(r.aprovado).toBe(true);
  });

  it("falar de percentual sem prometer não é promessa", () => {
    expect(ok("A meta de referência do setor gira em torno de 20% de alcance orgânico.").aprovado).toBe(true);
  });
});

describe("o parecer serve para o agente corrigir sozinho", () => {
  it("diz o que achou e por que não pode ir", () => {
    const r = ok("Ligue (11) 91234-5678 — garantimos 50% mais clientes.");
    const resumo = resumirViolacoes(r.violacoes);
    expect(resumo).toMatch(/91234-5678/);
    expect(resumo).toMatch(/garantimos 50%/i);
    expect(resumo).toMatch(/inventado|enganosa/i);
  });

  it("peça limpa não gera parecer nenhum", () => {
    expect(resumirViolacoes(ok("Conteúdo limpo e específico.").violacoes)).toBe("");
  });
});

describe("os falsos positivos que tornariam o piso inútil", () => {
  it('"Todo dia" não é marcador de rascunho — é português', () => {
    // Achado ao ligar o piso: `TODO` sem diferenciar maiúscula casa com "Todo",
    // "toda", "todos". Barraria peça legítima o tempo todo — e freio que
    // reprova tudo é desligado na primeira semana.
    expect(ok("O João acorda às 3h. Todo dia, há 22 anos.").aprovado).toBe(true);
    expect(ok("Toda semana um tema novo. Todos os dias uma história.").aprovado).toBe(true);
  });

  it("TODO em caixa alta continua sendo barrado — ali é rascunho mesmo", () => {
    expect(ok("Legenda: TODO escrever depois").aprovado).toBe(false);
  });

  it("horário e duração não viram telefone nem valor", () => {
    // O que esta linha protege continua valendo: hora não pode virar telefone
    // nem valor. Mudou o veredito, e a mudança é o P0: "Funcionamos das 18h às
    // 23h" É uma afirmação factual sobre o negócio — e esta `verdade` não tem
    // horário informado, então ela reprova por horário, e SÓ por horário.
    const r = ok("Funcionamos das 18h às 23h. O pão leva 18 horas de fermentação.");
    expect(r.violacoes.map((v) => v.id)).toEqual(["horario_nao_informado"]);
    // A frase da fermentação não tem quadro de funcionamento — não é alegação
    // de expediente e não entra.
    expect(r.violacoes[0]!.trecho).toMatch(/Funcionamos/);
  });

  it("data no texto não é documento", () => {
    expect(ok("A campanha vai de 01/09 a 30/09.").aprovado).toBe(true);
  });
});

// ─── AFIRMAÇÃO CONTRA O SNAPSHOT ────────────────────────────────────────────
//
// Por que estes testes existem, na frase do CEO: **quem revisa é o cliente**, e
// ele não tem como revisar o que não consegue conferir. Gosto, marca e tom ele
// julga muito bem. "Atendemos até meia-noite" ele lê como coisa dele e aprova
// de boa-fé — e o erro sai publicado no nome do negócio dele.
//
// A verdade abaixo é montada com o MESMO extrator que o servidor usa sobre o
// briefing (`extrairVerdadeOperacional`). O teste, portanto, é de ida e volta:
// o cliente escreveu isto, logo a peça pode afirmar isto e nada além.

const PALAVRAS_DO_CLIENTE = [
  "Sushi Cazza, restaurante japonês em Moema.",
  "Funcionamos de terça a domingo, das 18h às 23h.",
  "Fazemos delivery em Moema e Vila Mariana, raio de 5 km.",
  "Aceitamos Pix, cartão de crédito e dinheiro. Parcelamos em até 3x.",
  "Pedidos pelo WhatsApp e pelo iFood.",
  "Entrega em 45 minutos.",
  "O cardápio tem rodízio, combinados e temaki.",
].join("\n");

const comOperacao: VerdadeDoCliente = {
  ...verdade,
  operacao: extrairVerdadeOperacional(PALAVRAS_DO_CLIENTE, "Sushi Cazza"),
};

/** O cliente novo: cadastro criado, briefing ainda vazio. */
const clienteNovo: VerdadeDoCliente = {
  businessName: "Padaria Aurora", telefones: [], emails: [], servicos: [], valores: [],
  operacao: extrairVerdadeOperacional("", "Padaria Aurora"),
};

const conf = (c: string) => conferirPisoDeVerdade(c, comOperacao);
const ids = (c: string) => conferirPisoDeVerdade(c, comOperacao).violacoes.map((v) => v.id);

describe("o servidor lê a verdade do cliente e ela vira tokens comparáveis", () => {
  it("extrai só o que o cliente escreveu — e nada além", () => {
    const op = comOperacao.operacao!;
    expect(op.horarios).toEqual(expect.arrayContaining(["18:00", "23:00"]));
    expect(op.dias).toEqual(expect.arrayContaining(["ter", "dom"]));
    expect(op.areas).toEqual(expect.arrayContaining(["moema", "vila mariana"]));
    expect(op.raioEntregaKm).toBe(5);
    expect(op.pagamentos).toEqual(expect.arrayContaining(["pix", "credito", "dinheiro"]));
    expect(op.parcelasMax).toBe(3);
    expect(op.canais).toEqual(expect.arrayContaining(["whatsapp", "ifood"]));
    expect(op.prazos).toContain("45 minuto");
    // O que ele NÃO disse não aparece: nunca houve "sábado", nunca houve boleto.
    expect(op.dias).not.toContain("sab");
    expect(op.pagamentos).not.toContain("boleto");
  });

  it("briefing vazio → verdade vazia, e a casa sabe listar o que falta", () => {
    // Cliente novo não é cliente permissivo: é cliente sobre quem não se afirma
    // nada. O comportamento é declarado, não acidental.
    const op = clienteNovo.operacao!;
    expect(op.horarios).toEqual([]);
    expect(op.areas).toEqual([]);
    expect(classesSemInformacao(op)).toEqual(
      expect.arrayContaining(["horario", "area_de_atendimento", "pagamento", "oferta", "canal", "prazo"]),
    );
  });
});

describe("a peça que CONTRADIZ o snapshot não vai ao cliente", () => {
  it("horário que o cliente não pratica", () => {
    expect(ids("Atendemos até meia-noite.")).toContain("horario_contradiz");
    expect(ids("Aberto de segunda a sábado, das 18h às 23h.")).toContain("horario_contradiz");
  });

  it("cobertura maior do que a que ele informou", () => {
    expect(ids("Entregamos em toda a cidade.")).toContain("area_contradiz");
    expect(ids("Fazemos delivery em Pinheiros.")).toContain("area_contradiz");
    expect(ids("Entregamos num raio de 15 km.")).toContain("area_contradiz");
  });

  it("forma de pagamento e parcelamento que ele não aceita", () => {
    expect(ids("Aceitamos boleto.")).toContain("pagamento_contradiz");
    expect(ids("Parcelamos em 12x sem juros.")).toContain("pagamento_contradiz");
  });

  it("serviço que ele nunca disse que faz", () => {
    expect(ids("Também fazemos yakisoba de camarão.")).toContain("oferta_contradiz");
  });

  it("canal e perfil que não são dele", () => {
    expect(ids("Peça pelo Rappi.")).toContain("canal_contradiz");
    expect(ids("Siga em @sushicazzaoficial.")).toContain("endereco_inventado");
  });

  it("prazo diferente do que ele pratica — prazo prometido é prazo cobrado", () => {
    expect(ids("Entrega em 20 minutos.")).toContain("prazo_contradiz");
  });
});

describe("afirmar sobre o que o snapshot NÃO tem é violação — não é 'provavelmente certo'", () => {
  const novo = (c: string) => conferirPisoDeVerdade(c, clienteNovo);

  it("cada classe reprova, e o parecer diz o que falta perguntar", () => {
    expect(novo("Funcionamos das 7h às 19h.").violacoes[0]!.id).toBe("horario_nao_informado");
    expect(novo("Entregamos em toda a cidade.").violacoes[0]!.id).toBe("area_nao_informada");
    expect(novo("Aceitamos Pix.").violacoes[0]!.id).toBe("pagamento_nao_informado");
    expect(novo("Também fazemos bolo de aniversário.").violacoes[0]!.id).toBe("oferta_nao_informada");
    expect(novo("Peça pelo iFood.").violacoes[0]!.id).toBe("canal_nao_informado");
    expect(novo("Entrega em 30 minutos.").violacoes[0]!.id).toBe("prazo_nao_informado");
  });

  it("o motivo manda perguntar, não adivinhar", () => {
    const r = novo("Funcionamos das 7h às 19h.");
    expect(r.violacoes[0]!.motivo).toMatch(/Horário de funcionamento/);
    expect(r.violacoes[0]!.motivo).toMatch(/ausência de informação não é informação/i);
    expect(r.violacoes[0]!.motivo).toMatch(/PRECISO CONFIRMAR/);
  });

  it("admitir que não sabe continua sendo o comportamento CERTO", () => {
    expect(novo("Horário: PRECISO CONFIRMAR: horário de funcionamento com o cliente.").aprovado).toBe(true);
  });
});

describe("o piso não mata a peça boa — o que o snapshot CONFIRMA passa", () => {
  it("horário, dia, bairro, pagamento, canal, prazo e oferta atestados", () => {
    expect(conf("Funcionamos de terça a domingo, das 18h às 23h.").aprovado).toBe(true);
    expect(conf("Delivery em Moema e Vila Mariana.").aprovado).toBe(true);
    expect(conf("Entrega em 45 minutos.").aprovado).toBe(true);
    expect(conf("Aceitamos Pix e cartão.").aprovado).toBe(true);
    expect(conf("Peça pelo WhatsApp.").aprovado).toBe(true);
    expect(conf("Também temos rodízio.").aprovado).toBe(true);
  });

  it("peça inteira, do jeito que o cliente recebe", () => {
    const peca = [
      "**Post 1 — O rodízio que vale a espera**",
      "Legenda: Sua mesa está pronta. Funcionamos de terça a domingo, das 18h às 23h.",
      "CTA: Peça pelo WhatsApp — entrega em 45 minutos em Moema.",
    ].join("\n");
    expect(conf(peca).aprovado).toBe(true);
  });
});

describe("frase de marketing não é afirmação factual — senão o piso vira carimbo", () => {
  it("elogio sem fato verificável passa, mesmo num cliente sem briefing", () => {
    const novo = (c: string) => conferirPisoDeVerdade(c, clienteNovo);
    expect(novo("Atendimento rápido e sem complicação.").aprovado).toBe(true);
    expect(novo("O melhor da região, feito com carinho todo dia.").aprovado).toBe(true);
    expect(novo("Qualidade incomparável, do jeito que você merece.").aprovado).toBe(true);
    expect(novo("Sabor de verdade, no capricho, para toda a família.").aprovado).toBe(true);
  });

  it("planejamento interno da agência não vira promessa da operação do cliente", () => {
    // "Entregar 12 posts em 30 dias" é escopo da agência, não prazo do
    // restaurante. O verbo conjugado ("entregamos em") é o que marca promessa.
    expect(conf("Plano do mês: entregar 12 posts em 30 dias.").aprovado).toBe(true);
    expect(conf("Post para o Instagram na quinta.").aprovado).toBe(true);
  });

  it("duração que não é expediente continua fora", () => {
    expect(conf("O pão leva 18 horas de fermentação.").aprovado).toBe(true);
  });
});

describe("o endereço é conferido no texto inteiro, não frase a frase", () => {
  it("domínio inventado não escapa pelo ponto final", () => {
    // O ponto de "sushicazza.com.br" é fim de frase para o separador e parte do
    // endereço para o leitor. Conferindo por frase, o domínio saía partido em
    // "sushicazza" + "com" + "br" e o site inventado passava inteiro.
    const r = conf("Acesse sushicazza.com.br e peça online.");
    expect(r.violacoes.map((v) => [v.id, v.trecho])).toEqual([["endereco_inventado", "sushicazza.com.br"]]);
  });

  it("perfil inventado sai por completo no parecer", () => {
    const r = conf("Siga em @sushicazza.oficial.");
    expect(r.violacoes[0]!.trecho).toBe("@sushicazza.oficial");
  });

  it("o domínio do e-mail conhecido não vira 'site inventado'", () => {
    // O e-mail já tem checagem própria; contá-lo duas vezes só faria o agente
    // reescrever no escuro.
    expect(conf("Escreva para contato@sushicazza.com.br.").aprovado).toBe(true);
  });
});
