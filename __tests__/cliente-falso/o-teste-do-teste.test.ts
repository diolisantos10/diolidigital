// o-teste-do-teste.test.ts — quem testa o cliente falso.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
//
// Lição desta casa, 17/08/2026, e a mais cara de todas: **ferramenta que dá
// falso positivo é pior que ferramenta nenhuma.** Um instrumento que acusa
// defeito onde não há manda a casa consertar o que não quebrou — e um que
// aprova defeito de verdade manda o CEO dormir tranquilo enquanto o funil
// vaza.
//
// O cliente falso é a nova ferramenta. Aqui cada verificação dele é alimentada
// com DOIS percursos construídos à mão: um SÃO, que ela tem de aprovar, e um
// DOENTE, que ela tem de reprovar. Verificação que não falha quando deve falhar
// não é verificação: é enfeite verde.
//
// Isto não é teoria. A primeira rodada real (23/08/2026) pegou um falso
// positivo DENTRO deste instrumento: `orcamentoAcimaDaVerbaNomeiaADiferenca`
// procurava o texto "500" e aprovou um orçamento de "R$ 6.500" que não dizia
// UMA palavra sobre a verba do cliente — a verificação aprovou exatamente o
// defeito que existe para pegar. O caso virou o teste
// `nao aprova preco terminado nos mesmos digitos da verba` lá embaixo.

import { describe, it, expect } from "vitest";
import {
  nomeDaPortaNaoEPerguntadoDeNovo,
  ofertaDeDocumentoNaoEAtropelada,
  aCasaNaoSeRepete,
  nenhumTurnoBarradoPeloGuarda,
  oQueOClienteDeclarouChegaAoOrcamento,
  orcamentoAcimaDaVerbaNomeiaADiferenca,
  aCasaNaoSeContradizNoFim,
  oClienteConsegueEnviar,
  oOrcamentoChega,
  type Percurso,
} from "@/lib/agency/cliente-falso/verificacoes";
import { ROTEIRO_PADRAO } from "@/lib/agency/cliente-falso/roteiro";
import { emptyScope, emptyEstimate } from "@/lib/agency/briefing-conversation";

// ── O percurso SÃO: tudo como deveria ser ───────────────────────────────────
function percursoSao(): Percurso {
  const scope = {
    ...emptyScope(),
    prospectName: ROTEIRO_PADRAO.contatoDaPorta.nome,
    businessName: ROTEIRO_PADRAO.nomeDoNegocioNaFala,
    targetAudience: "Famílias do bairro",
    budgetRange: "R$ 500 por mês",
    wantsSocialMedia: true,
    social: { platforms: ["Instagram"], postsPerWeek: 14 },
  };
  return {
    roteiro: ROTEIRO_PADRAO,
    saudacao: "Olá, Marina! Para começar, qual é o nome do seu negócio?",
    turnos: [
      { numero: 1, doCliente: "Somos a Cantina da Prova.", daCasa: "Qual o principal objetivo?",
        intencao: "apresenta", escopoDepois: scope },
      { numero: 2, doCliente: "Vender mais no almoço.", daCasa: "Quem é seu público-alvo?",
        intencao: "declara_objetivo", escopoDepois: scope },
      { numero: 3, doCliente: "Posso te mandar nosso briefing em PDF, ajuda?",
        daCasa: "Claro, pode mandar! Enquanto isso: quem é o seu público-alvo?",
        intencao: "oferece_documento", escopoDepois: scope },
      { numero: 4, doCliente: "2 posts por dia", daCasa: "Qual faixa de orçamento você tem em mente?",
        intencao: "declara_volume", escopoDepois: scope },
      { numero: 5, doCliente: "Nosso orçamento é de R$ 500 por mês.",
        daCasa: "Anotado. Confira o resumo e confirme.", intencao: "declara_verba", escopoDepois: scope },
    ],
    escopoFinal: scope,
    estimativaFinal: { ...emptyEstimate(), totalMin: 400, totalMax: 480, confidence: "high" },
    portaoAbriu: true,
    bloqueioDoPortao: null,
    ultimaFalaDaCasa: "Anotado. Confira o resumo e confirme.",
    pedido: { id: "req-falso-1", status: "proposal_pending", businessName: "Cantina da Prova [TESTE]" },
    orcamentoEntregue: "A estimativa fica entre R$ 400 e R$ 480 por mês.",
    turnosBarrados: [],
    sdrAoVivo: true,
    saidasBloqueadas: [],
  };
}

describe("o percurso são passa em tudo — senão o instrumento acusa a casa por nada", () => {
  it("aprova a casa que faz tudo certo", () => {
    const p = percursoSao();
    for (const v of [
      nomeDaPortaNaoEPerguntadoDeNovo, ofertaDeDocumentoNaoEAtropelada, aCasaNaoSeRepete,
      nenhumTurnoBarradoPeloGuarda, oQueOClienteDeclarouChegaAoOrcamento,
      aCasaNaoSeContradizNoFim, oClienteConsegueEnviar, oOrcamentoChega,
    ]) {
      const a = v(p);
      expect(a.veredito, `${a.id} reprovou um percurso são: ${a.detalhe}`).not.toBe("quebrou");
    }
  });
});

describe("nome da porta — o defeito do CEO em 23/08/2026", () => {
  it("reprova a saudação que pede de novo o nome dado na porta", () => {
    const p = percursoSao();
    p.saudacao = "Para começar, qual é o seu nome e o nome do seu negócio?";
    expect(nomeDaPortaNaoEPerguntadoDeNovo(p).veredito).toBe("quebrou");
  });

  it("reprova o painel que fica em 'aguardando' com o nome já dado", () => {
    const p = percursoSao();
    p.escopoFinal = { ...p.escopoFinal, prospectName: undefined };
    const a = nomeDaPortaNaoEPerguntadoDeNovo(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/painel/i);
  });
});

describe("oferta de documento — quem colabora não pode ser atropelado", () => {
  it("reprova a casa que repete a pergunta por cima da oferta", () => {
    const p = percursoSao();
    p.turnos[2].daCasa = p.turnos[1].daCasa; // a mesma fala do turno anterior
    expect(ofertaDeDocumentoNaoEAtropelada(p).veredito).toBe("quebrou");
  });

  it("reprova a oferta gravada no pedido como se fosse resposta", () => {
    // O caso REAL medido na primeira rodada: "Posso te mandar nosso briefing em
    // PDF, ajuda?" virou o campo `targetAudience` do cliente.
    const p = percursoSao();
    p.turnos[2].escopoDepois = { ...p.escopoFinal, targetAudience: p.turnos[2].doCliente };
    const a = ofertaDeDocumentoNaoEAtropelada(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/targetAudience/);
  });
});

describe("fala repetida — o sinal de que ninguém está ouvindo", () => {
  it("reprova duas falas idênticas seguidas", () => {
    const p = percursoSao();
    p.turnos[3].daCasa = p.turnos[2].daCasa;
    expect(aCasaNaoSeRepete(p).veredito).toBe("quebrou");
  });

  it("não confunde pontuação e negrito com fala diferente", () => {
    const p = percursoSao();
    p.turnos[3].daCasa = "**Quem é o seu público-alvo?**";
    p.turnos[2].daCasa = "Quem é o seu público-alvo";
    expect(aCasaNaoSeRepete(p).veredito).toBe("quebrou");
  });
});

describe("guarda do SDR — plano B atendendo em silêncio é falha", () => {
  it("reprova quando algum turno foi barrado, ainda que o motor de regras tenha respondido", () => {
    const p = percursoSao();
    p.turnosBarrados = ["[resposta barrada pelo guarda: truncado — quem respondeu foi o motor de regras.]"];
    expect(nenhumTurnoBarradoPeloGuarda(p).veredito).toBe("quebrou");
  });

  it("NÃO diz 'passou' quando não houve SDR ao vivo — silêncio não é aprovação", () => {
    // Se esta verificação devolvesse "passou" sem ter olhado nada, o
    // instrumento estaria cometendo o defeito nº 4 do CEO dentro de si mesmo.
    const p = percursoSao();
    p.sdrAoVivo = false;
    expect(nenhumTurnoBarradoPeloGuarda(p).veredito).toBe("nao-coberto");
  });
});

describe("o que o cliente declarou — o caso CityJobs, 16/08/2026", () => {
  it("reprova volume que chegou ZERADO e mesmo assim virou preço", () => {
    const p = percursoSao();
    p.escopoFinal = { ...p.escopoFinal, social: { platforms: ["Instagram"], postsPerWeek: 0 } };
    p.estimativaFinal = { ...p.estimativaFinal, totalMin: 1800, totalMax: 3400, confidence: "high" };
    const a = oQueOClienteDeclarouChegaAoOrcamento(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/ZERADO/);
  });

  it("aceita volume perdido quando a casa TRAVOU a estimativa em vez de inventar preço", () => {
    // A trava (`travadaPor`) é o conserto certo: campo vazio não vira número.
    // Reprovar aqui puniria a casa por ter feito o certo.
    const p = percursoSao();
    p.escopoFinal = { ...p.escopoFinal, social: { platforms: ["Instagram"], postsPerWeek: 0 } };
    p.estimativaFinal = { ...p.estimativaFinal, totalMin: 0, totalMax: 0, travadaPor: "volume zerado" };
    const a = oQueOClienteDeclarouChegaAoOrcamento(p);
    expect(a.detalhe).not.toMatch(/virou preço/);
  });

  it("reprova volume convertido para a unidade errada", () => {
    // "2 posts por dia" = 14/semana. 2/semana seria a casa ignorando a unidade.
    const p = percursoSao();
    p.escopoFinal = { ...p.escopoFinal, social: { platforms: ["Instagram"], postsPerWeek: 2 } };
    const a = oQueOClienteDeclarouChegaAoOrcamento(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/14\/semana/);
  });

  it("distingue 'a casa nunca perguntou a verba' de 'a casa perdeu a verba'", () => {
    const p = percursoSao();
    p.escopoFinal = { ...p.escopoFinal, budgetRange: undefined };
    p.turnos = p.turnos.filter((t) => t.intencao !== "declara_verba");
    const a = oQueOClienteDeclarouChegaAoOrcamento(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/NUNCA perguntou/);
  });
});

describe("verba estourada — o silêncio que fecha a conversa", () => {
  it("reprova orçamento acima da verba que não menciona a diferença", () => {
    const p = percursoSao();
    p.estimativaFinal = { ...p.estimativaFinal, totalMin: 1800, totalMax: 3400 };
    p.orcamentoEntregue = "A estimativa fica entre R$ 1.800 e R$ 3.400 por mês.";
    expect(orcamentoAcimaDaVerbaNomeiaADiferenca(p).veredito).toBe("quebrou");
  });

  it("nao aprova preco terminado nos mesmos digitos da verba", () => {
    // ⚠️ O FALSO POSITIVO REAL, medido em 23/08/2026. O texto entregava
    // "R$ 4.000 e R$ 6.500" e a busca ingênua por "500" achou o "500" de
    // "6.500" — a verificação aprovou um orçamento que não dizia nada sobre a
    // verba de R$ 500 do cliente. É o motivo de este teste existir.
    const p = percursoSao();
    p.estimativaFinal = { ...p.estimativaFinal, totalMin: 4000, totalMax: 6500 };
    p.orcamentoEntregue = "A estimativa fica entre R$ 4.000 e R$ 6.500 por mês.";
    expect(orcamentoAcimaDaVerbaNomeiaADiferenca(p).veredito).toBe("quebrou");
  });

  it("aprova o texto que cita a verba do cliente na cara", () => {
    const p = percursoSao();
    p.estimativaFinal = { ...p.estimativaFinal, totalMin: 1800, totalMax: 3400 };
    p.orcamentoEntregue = "A estimativa fica entre R$ 1.800 e R$ 3.400 por mês. "
      + "Você falou em R$ 500 por mês — a conta passa disso, e aqui está o que cabe na sua verba.";
    expect(orcamentoAcimaDaVerbaNomeiaADiferenca(p).veredito).toBe("passou");
  });

  it("não cobra diferença nenhuma quando o orçamento cabe na verba", () => {
    expect(orcamentoAcimaDaVerbaNomeiaADiferenca(percursoSao()).veredito).toBe("nao-coberto");
  });
});

describe("o funil arrebentado no último passo — 16/08/2026", () => {
  it("reprova a casa que anuncia o fim com o portão fechado", () => {
    const p = percursoSao();
    p.ultimaFalaDaCasa = "Perfeito! Tenho todas as informações que preciso. Confira o resumo e confirme.";
    p.portaoAbriu = false;
    p.bloqueioDoPortao = "Conte o que você precisa para montarmos seu pedido";
    expect(aCasaNaoSeContradizNoFim(p).veredito).toBe("quebrou");
  });

  it("reprova o cliente que contou tudo e não consegue enviar", () => {
    const p = percursoSao();
    p.portaoAbriu = false;
    expect(oClienteConsegueEnviar(p).veredito).toBe("quebrou");
  });
});

describe("o orçamento que ninguém entregava — a noite de 15 para 16/08/2026", () => {
  it("reprova briefing que não virou pedido", () => {
    const p = percursoSao();
    p.pedido = null;
    expect(oOrcamentoChega(p).veredito).toBe("quebrou");
  });

  it("reprova pedido gravado que nunca recebeu orçamento", () => {
    const p = percursoSao();
    p.orcamentoEntregue = null;
    expect(oOrcamentoChega(p).veredito).toBe("quebrou");
  });
});
