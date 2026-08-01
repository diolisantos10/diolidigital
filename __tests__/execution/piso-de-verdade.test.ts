import { describe, it, expect } from "vitest";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";

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
    expect(ok("Funcionamos das 18h às 23h. O pão leva 18 horas de fermentação.").aprovado).toBe(true);
  });

  it("data no texto não é documento", () => {
    expect(ok("A campanha vai de 01/09 a 30/09.").aprovado).toBe(true);
  });
});
