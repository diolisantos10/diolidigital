// A LEITURA DO PEDIDO, sem banco e sem IA — as duas metades, palavra por palavra.
//
// Esta suíte existe porque a trava do verbo tem de ser conferível isoladamente:
// se ela só fosse testada através da triagem, um dia alguém trocaria o mock do
// modelo e acharia que a leitura passou a funcionar.

import { describe, it, expect } from "vitest";
import { lerPedido, normalizar } from "@/lib/agency/esteira/leitura-do-pedido";

const TEXTO_DO_CEO =
  "Precisamos criar videos meus falando das principais features do foocci para reels e Youtube. " +
  "Preciso do roteiro com as falas paras produzir os videos e assim usar nas redes sociais e no site. " +
  "Alem disso preciso de videos explicando os produtos para os clientes que serao atendidos pelo SDR no whatsapp.";

describe("o verbo — insumo, peça final, ou pergunta", () => {
  it("“preciso do roteiro” é INSUMO, não produção de vídeo", () => {
    expect(lerPedido("Preciso do roteiro com as falas para eu gravar.").entregavel).toBe("insumo");
    expect(lerPedido("Me manda o script do vídeo, eu gravo.").entregavel).toBe("insumo");
    expect(lerPedido("Quero só a legenda, a arte eu já tenho.").entregavel).toBe("insumo");
    // "para eu gravar" é o cliente produzindo — não é pedido de produção à casa.
    expect(lerPedido("Preciso do roteiro com as falas para eu gravar o vídeo.").entregavel).toBe("insumo");
  });

  it("“quero um reel pronto” é PEÇA FINAL — a metade que não pode ter atrito", () => {
    expect(lerPedido("Quero um reel pronto do combo do almoço.").entregavel).toBe("peca");
    expect(lerPedido("Façam o vídeo do cardápio novo para mim.").entregavel).toBe("peca");
    expect(lerPedido("Preciso de um carrossel para o feed.").entregavel).toBe("peca");
  });

  it("insumo depois de “com” é ATRIBUTO da peça: “um reel com roteiro” continua sendo reel", () => {
    expect(lerPedido("Quero um reel com roteiro, edição e legendas animadas.").entregavel).toBe("peca");
  });

  it("o texto do CEO pede as duas coisas — e o lado certo é PERGUNTAR", () => {
    expect(lerPedido(TEXTO_DO_CEO).entregavel).toBe("ambiguo");
  });

  it("texto sem peça e sem insumo não bloqueia nada por si só", () => {
    expect(lerPedido("Quero um orçamento de site institucional.").entregavel).toBe("indefinido");
  });

  it("acento não muda a leitura — quem digita no celular escreve “videos”", () => {
    expect(normalizar("VÍDEOS")).toBe("videos");
    expect(lerPedido("Preciso do ROTEIRO do vídeo.").entregavel).toBe("insumo");
  });
});

describe("a quantidade — ausência de informação não é informação", () => {
  it("plural sem número NÃO vira 1", () => {
    const l = lerPedido("Quero uns reels prontos mostrando os pratos.");
    expect(l.quantidade).toBeNull();
    expect(l.motivoDaContagem).toBe("plural_sem_numero");
  });

  it("o texto do CEO fala de vídeos no plural três vezes e não diz quantos", () => {
    expect(lerPedido(TEXTO_DO_CEO).quantidade).toBeNull();
  });

  it("número explícito é contado — inclusive por extenso", () => {
    expect(lerPedido("Quero 6 reels para a semana.").quantidade).toBe(6);
    expect(lerPedido("Quero três posts novos.").quantidade).toBe(3);
  });

  it("duas contagens diferentes não viram soma: somar é palpite", () => {
    const l = lerPedido("Preciso de 6 reels e 4 videos para o SDR.");
    expect(l.quantidade).toBeNull();
    expect(l.motivoDaContagem).toBe("varias_contagens");
  });

  it("singular é 1, e continua sendo 1 — o caso limpo", () => {
    expect(lerPedido("Quero um reel pronto do combo.").quantidade).toBe(1);
    expect(lerPedido("Preciso de uma arte para o feed.").quantidade).toBe(1);
  });

  it("a evidência é o texto DELE — conclusão sem citação não convence ninguém", () => {
    const l = lerPedido("Quero 6 reels para a semana.");
    expect(l.evidencias.join(" ")).toContain("6 reels");
  });
});
