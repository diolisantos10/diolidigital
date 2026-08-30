// O SDR NA PÁGINA DO ORÇAMENTO — 27/08/2026.
//
// Ordem do CEO: *"a página onde vai estar o orçamento tem que ter o agente de
// SDR pronto para negociar valores e não deixar o cliente desistir."*
//
// Antes daqui a tela tinha DOIS botões: aceitar e "agora não". Cliente que só
// tem esses dois botões e acha caro não negocia — some, e a casa nem fica
// sabendo que houve objeção.
//
// ⚠️ ESTES TESTES OLHAM A TELA, não só a função. A vista foi separada em
// `CorpoDaProposta` justamente para que `renderToStaticMarkup` alcance o HTML
// que o cliente lê — *o teste alcança o que o cliente de verdade vê?*

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CorpoDaProposta } from "@/app/proposta/[token]/page";
import {
  servicoDaProposta, pisoRespeitado, falaQueRespeitaOPiso,
  valoresNaFala, contextoDaNegociacao, degrausAbaixo,
} from "@/lib/agency/comercial/negociacao-da-proposta";
import { servicoPorChave } from "@/lib/agency/financeiro/tabela-de-precos";
import { AVISO_DE_AGENDAMENTO_MANUAL } from "@/lib/agency/esteira/aviso-de-agendamento-manual";

const CONTEUDO = servicoPorChave("plano_conteudo")!;

const decidindo = {
  negocio: "Foocci",
  texto: "Recebemos seu briefing da Foocci — obrigado pelo material.",
  decidivel: true,
  status: "proposal_pending",
  avisoDeAgendamento: AVISO_DE_AGENDAMENTO_MANUAL,
};

function tela(over: Record<string, unknown> = {}, resposta: string | null = null) {
  return renderToStaticMarkup(
    <CorpoDaProposta
      dados={{ ...decidindo, ...over } as never}
      token="tok-de-teste"
      enviando={null}
      resposta={resposta}
      erro={null}
      onDecidir={() => {}}
    />,
  );
}

describe("a tela que o cliente abre para decidir", () => {
  it("tem a conversa do SDR — não só aceitar e recusar", () => {
    const html = tela();
    expect(html).toContain("Ficou com dúvida no valor?");
    // Campo de escrever E botão de enviar: conversa de verdade, não um convite morto.
    expect(html).toContain('id="fala-da-proposta"');
    expect(html).toContain("Enviar");
  });

  it("NÃO quebrou o que já estava de pé: aceitar e recusar continuam lá", () => {
    const html = tela();
    expect(html).toContain("Aceitar e começar");
    expect(html).toContain("Agora não");
  });

  it("o aviso da publicação manual aparece ANTES dos botões", () => {
    const html = tela();
    expect(html).toContain(AVISO_DE_AGENDAMENTO_MANUAL);
    // Quem aceita tem de saber o que está comprando.
    expect(html.indexOf(AVISO_DE_AGENDAMENTO_MANUAL)).toBeLessThan(html.indexOf("Aceitar e começar"));
  });

  it("o aviso some quando a Meta liberar — sem ninguém apagar texto", () => {
    const html = tela({ avisoDeAgendamento: null });
    expect(html).not.toContain("publicação automática");
    // E os botões continuam.
    expect(html).toContain("Aceitar e começar");
  });

  it("proposta JÁ DECIDIDA não reabre negociação pelas costas do cliente", () => {
    const html = tela({ decidivel: false, jaAceito: true });
    expect(html).not.toContain("Ficou com dúvida no valor?");
    expect(html).not.toContain("Aceitar e começar");
    expect(html).toContain("Você já aceitou esta proposta");
  });

  it("depois de responder, a conversa sai da tela", () => {
    const html = tela({}, "Resposta registrada.");
    expect(html).not.toContain("Ficou com dúvida no valor?");
  });
});

describe("⛔ o piso: a casa recusa preço abaixo dele", () => {
  it("recusa o desconto que o cliente pediu — 'faz por 600'", () => {
    const v = pisoRespeitado("Consigo fechar por R$ 600 para você.", CONTEUDO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.menorOfertado).toBe(60000);
  });

  it("vale o MENOR valor da fala — a frase perigosa cita os dois", () => {
    // "são R$ 790, mas consigo por R$ 600" passaria se olhássemos só o primeiro.
    const v = pisoRespeitado("O plano é R$ 790/mês, mas consigo fazer por R$ 600.", CONTEUDO);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.menorOfertado).toBe(60000);
  });

  it("o preço de tabela passa, e acima também", () => {
    expect(pisoRespeitado("São R$ 790 por mês.", CONTEUDO).ok).toBe(true);
    expect(pisoRespeitado("Um projeto desses sai por R$ 2.000.", CONTEUDO).ok).toBe(true);
  });

  it("fala sem valor nenhum passa", () => {
    expect(pisoRespeitado("Posso te explicar o que entra no plano?", CONTEUDO).ok).toBe(true);
  });

  it("sem serviço conhecido, QUALQUER valor é recusado — ausência de piso não é piso zero", () => {
    const v = pisoRespeitado("Fica R$ 5.000 o projeto.", null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toMatch(/sem piso conhecido/i);
  });

  it("a recusa NUNCA é um 'não' seco: vem com o degrau que existe", () => {
    const { fala, corrigida } = falaQueRespeitaOPiso("Faço por R$ 600.", CONTEUDO);
    expect(corrigida).toBe(true);
    expect(fala).toMatch(/Presença/);
    expect(fala).toMatch(/R\$\s?490/);
    expect(fala).toMatch(/\?$/); // devolve a decisão ao cliente
  });

  it("no degrau mais barato a saída é GENTE, não um degrau inventado", () => {
    const balcao = servicoPorChave("balcao_post")!;
    const { fala } = falaQueRespeitaOPiso("Faço por R$ 10.", balcao);
    expect(fala).toMatch(/gerente do projeto/i);
  });

  it("lê o valor nos formatos que o modelo escreve", () => {
    expect(valoresNaFala("R$ 490")).toEqual([49000]);
    expect(valoresNaFala("R$ 1.390,00")).toEqual([139000]);
    expect(valoresNaFala("R$490,50")).toEqual([49050]);
    expect(valoresNaFala("sem valor")).toEqual([]);
  });
});

describe("o contexto que vai ao modelo", () => {
  const bloco = () =>
    contextoDaNegociacao({
      negocio: "Foocci",
      servico: CONTEUDO,
      textoDaProposta: "Sua proposta.",
      avisoDeAgendamento: AVISO_DE_AGENDAMENTO_MANUAL,
    });

  it("⛔ NÃO carrega o piso — número interno não entra em prompt", () => {
    // Prompt é texto que o interlocutor pode tentar extrair. O piso é aplicado
    // no servidor, sobre a fala pronta — nunca confiado ao modelo.
    expect(bloco()).not.toMatch(/piso/i);
  });

  it("diz que desconto é ZERO e oferece o degrau de baixo", () => {
    const b = bloco();
    expect(b).toMatch(/NÃO PODE DAR DESCONTO/);
    expect(b).toContain("Presença");
    expect(b).toContain("Ritmo");
  });

  it("proíbe o que a casa não produz e o volume que não cabe", () => {
    const b = bloco();
    expect(b).toMatch(/vídeo/i);
    expect(b).toMatch(/não fazemos/i);
    expect(b).toMatch(/36 peças/);
  });

  it("proíbe pressão falsa e promessa que nada dispara", () => {
    const b = bloco();
    expect(b).toMatch(/última vaga/i);
    expect(b).toMatch(/Sem pressão falsa/i);
    expect(b).toMatch(/Não prometa/i);
  });

  it("manda escalar para gente quando não resolve", () => {
    expect(bloco()).toMatch(/gerente do projeto/i);
  });

  it("orçamento fora da tabela: nenhuma autorização de preço", () => {
    const b = contextoDaNegociacao({
      negocio: "X", servico: null, textoDaProposta: "t", avisoDeAgendamento: null,
    });
    expect(b).toMatch(/NÃO É UM PLANO DE TABELA/);
    expect(b).toMatch(/NÃO tem autorização de preço/i);
  });
});

describe("de qual serviço a proposta fala", () => {
  it("casa pelo valor mensal já escrito na proposta", () => {
    expect(servicoDaProposta(790, 790)?.chave).toBe("plano_conteudo");
    expect(servicoDaProposta(490)?.chave).toBe("plano_presenca");
  });

  it("valor fora da tabela não vira serviço — e por isso não vira piso", () => {
    expect(servicoDaProposta(1234)).toBeNull();
    expect(servicoDaProposta(0)).toBeNull();
    expect(servicoDaProposta(undefined)).toBeNull();
  });

  it("os degraus abaixo saem em ordem, do mais caro para o mais barato", () => {
    const abaixo = degrausAbaixo(CONTEUDO).map((s) => s.chave);
    expect(abaixo[0]).toBe("plano_presenca");
    expect(abaixo).toContain("plano_ritmo");
  });
});
