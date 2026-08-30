// A PEÇA QUE ESGOTA AS TENTATIVAS TEM PORTA — e o pedido repetido não queima
// tentativa paga em laço.
//
// O caso medido: um cliente (OFICINA FAROL) com 3 peças, ~9 tentativas pagas e
// ZERO entregues. Cada clique dele disparava uma chamada de IA que ia parar
// exatamente no mesmo lugar, e a frase que ele lia ("alguém da equipe te
// responde") não é uma porta: não diz o que ELE pode fazer agora.
//
// PROVA POR MUTAÇÃO (onde), em `lib/agency/esteira/porta-do-ajuste.ts`:
//   • fazer `valeChamarAIa` devolver sempre `true` → reprova;
//   • apagar o ramo de `teto_de_refacoes` do `classificarParada` → reprova
//     (a frase volta a ser a genérica, sem caminhos);
//   • fazer `mesmoPedido` comparar string crua → reprova o caso da digitação.

import { describe, it, expect } from "vitest";
import {
  classificarParada, valeChamarAIa, mesmoPedido,
  causaDaParadaAnterior, carimboDaParada, MAX_REFACOES_DO_CLIENTE,
} from "@/lib/agency/esteira/porta-do-ajuste";

describe("a porta de saída do teto", () => {
  const p = classificarParada({ causa: "teto_de_refacoes", detalhe: "peça refeita 2x" });

  it("não se retenta e é assunto de gente", () => {
    expect(p.retentavel).toBe(false);
    expect(p.classe).toBe("precisa_de_gente");
  });

  it("o aviso dá MOTIVO, DONO, PRÓXIMA AÇÃO e CAMINHO DE VOLTA", () => {
    expect(p.avisoAoCliente).toContain("Quem está com isso");
    expect(p.avisoAoCliente).toContain("gerente do seu projeto");
    // Os três caminhos concretos — é o que separa porta de aviso.
    expect(p.avisoAoCliente).toContain("três caminhos");
    expect(p.avisoAoCliente).toContain("ficar com a peça anterior");
    expect(p.avisoAoCliente).toContain("recusar ou cancelar");
    expect(p.avisoAoCliente).toContain("continua SUA para decidir");
  });

  it("o dono tem rosto, não é uma fila", () => {
    expect(p.motivoInterno).toContain("uma pessoa, não a fila");
  });

  it("o teto citado na frase é o mesmo que trava o laço", () => {
    expect(MAX_REFACOES_DO_CLIENTE).toBe(2);
    expect(classificarParada({ causa: "teto_de_refacoes" }).motivoInterno)
      .toContain(`teto de ${MAX_REFACOES_DO_CLIENTE} refações`);
  });
});

describe("o pedido repetido não paga IA de novo", () => {
  it("mesma parada não-retentável + mesmo pedido = não chama", () => {
    expect(valeChamarAIa({
      causaAnterior: "teto_de_refacoes",
      pedidoAnterior: "o fundo ficou escuro demais",
      pedidoNovo: "o fundo ficou escuro demais",
    })).toBe(false);
  });

  it("digitação diferente é o MESMO pedido", () => {
    expect(mesmoPedido("O FUNDO ficou escuro demais!", "o fundo ficou escuro, demais")).toBe(true);
    expect(mesmoPedido("terça", "terca")).toBe(true);
  });

  it("pedido DIFERENTE sempre passa — senão o beco só muda de lugar", () => {
    expect(valeChamarAIa({
      causaAnterior: "teto_de_refacoes",
      pedidoAnterior: "o fundo ficou escuro demais",
      pedidoNovo: "na verdade quero o prato de cima",
    })).toBe(true);
  });

  it("parada TRANSITÓRIA sempre retenta — provedor caído não vira porta fechada", () => {
    expect(valeChamarAIa({
      causaAnterior: "provedor_indisponivel",
      pedidoAnterior: "mais luz",
      pedidoNovo: "mais luz",
    })).toBe(true);
  });

  it("sem memória, chama — não saber nunca vira recusa de atender", () => {
    expect(valeChamarAIa({ causaAnterior: null, pedidoAnterior: "mais luz", pedidoNovo: "mais luz" })).toBe(true);
    expect(valeChamarAIa({ causaAnterior: "teto_de_refacoes", pedidoAnterior: null, pedidoNovo: "mais luz" })).toBe(true);
  });
});

describe("o carimbo — a memória curta, escrita e lida na mesma redação", () => {
  it("volta o que foi gravado", () => {
    const texto = `${carimboDaParada("proibicao_do_cliente")} a refação parou`;
    expect(causaDaParadaAnterior(texto)).toBe("proibicao_do_cliente");
  });

  it("texto sem carimbo é 'não sei', nunca uma causa adivinhada", () => {
    expect(causaDaParadaAnterior("Refeita a pedido do cliente: mais luz")).toBe(null);
    expect(causaDaParadaAnterior(null)).toBe(null);
    expect(causaDaParadaAnterior("[parada:coisa_que_nao_existe]")).toBe(null);
  });
});

describe("a porta do pedido repetido", () => {
  const p = classificarParada({ causa: "pedido_repetido_sem_mudanca", detalhe: "já parou por teto_de_refacoes" });
  it("diz ao cliente que NENHUMA rodada dele foi gasta", () => {
    expect(p.avisoAoCliente).toContain("eu não gastei nenhuma");
    expect(p.avisoAoCliente).toContain("três caminhos");
    expect(p.retentavel).toBe(false);
  });
});

describe("o que a memória NÃO barra — e por que isso importa", () => {
  it("saída fora do contrato e dado inventado retentam: a próxima chamada pode sair certa", () => {
    for (const causa of ["fora_do_contrato", "dado_inventado"] as const) {
      expect(valeChamarAIa({ causaAnterior: causa, pedidoAnterior: "mais luz", pedidoNovo: "mais luz" }), causa).toBe(true);
    }
  });

  it("a proibição registrada pelo cliente não retenta: a régua roda em código, sem IA", () => {
    expect(valeChamarAIa({
      causaAnterior: "proibicao_do_cliente", pedidoAnterior: "põe uma pizza", pedidoNovo: "põe uma pizza",
    })).toBe(false);
  });
});
