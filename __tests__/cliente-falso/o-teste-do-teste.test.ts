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

  oPortaoDeDirecaoAbrePeloCliente,

  aExecucaoAnda,

  aPortaAutenticadaFoiExercitada,
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
    // Percurso SÃO com a esteira de baixo percorrida até a parada declarada.
    aprovacao: { tentou: true, viaRota: true, ok: true, motivo: null, projetoId: "proj-falso-1",
      recusouQuemNaoEStaff: true,
      intrusos: [
        { quem: "sem cookie", status: 401, entrou: false },
        { quem: "role \"client\"", status: 403, entrou: false },
      ] },
    esteira: {
      projetoId: "proj-falso-1", tarefas: 7, execucaoRodou: true, execucaoErro: null,
      execucaoStatus: "done", direcaoAprovada: true, entregas: 3,
      direcaoPedida: true, direcaoViaPortal: true, direcaoMotivo: null,
      execucaoPendencias: null, execucaoTentativas: 1,
    },
    // Percurso SÃO com SDR ao vivo = o modelo respondeu TODOS os turnos.
    // Sem esta linha, "são" incluiria uma rodada em que a IA nunca falou.
    respostasDoSdr: [1, 2, 3, 4, 5].map((turno) => ({ turno, respondeu: true, motivo: null })),
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

  // ── O FALSO VERDE DE 23/08/2026, virado em teste ─────────────────────────
  //
  // A versão anterior lia só `turnosBarrados`. Ele fica vazio quando o guarda
  // não barrou nada — e TAMBÉM quando a rota nem chegou ao modelo (sem chave,
  // ou 429 do próprio freio de ritmo), porque nesses casos ela volta antes de
  // escrever no diário. Resultado: `--ao-vivo` numa máquina sem
  // `ANTHROPIC_API_KEY` fechava 10 de 10 em VERDE, com a décima verificação
  // afirmando sobre um SDR que nunca falou.
  it("NÃO diz 'passou' quando a rodada é ao vivo e nenhum turno chegou à rota", () => {
    const p = percursoSao();
    p.respostasDoSdr = [];
    expect(nenhumTurnoBarradoPeloGuarda(p).veredito).toBe("nao-coberto");
  });

  it("NÃO diz 'passou' quando faltou chave de IA — diário vazio não é diário limpo", () => {
    const p = percursoSao();
    p.respostasDoSdr = p.respostasDoSdr.map((r) => ({ ...r, respondeu: false, motivo: "not_configured" }));
    const a = nenhumTurnoBarradoPeloGuarda(p);
    expect(a.veredito).toBe("nao-coberto");
    expect(a.detalhe).toMatch(/not_configured/);
  });

  it("NÃO diz 'passou' quando a própria bateria estourou o teto de ritmo da rota", () => {
    const p = percursoSao();
    p.respostasDoSdr[2] = { turno: 3, respondeu: false, motivo: "teto_de_ritmo" };
    const a = nenhumTurnoBarradoPeloGuarda(p);
    expect(a.veredito).toBe("nao-coberto");
    expect(a.detalhe).toMatch(/teto_de_ritmo/);
  });

  it("REPROVA quando o modelo caiu por defeito da casa e o cliente foi atendido pelo plano B", () => {
    // `provider_error`/`timeout` não são "não medi": são a IA falhando com o
    // cliente na frente. Isso é quebra, não lacuna.
    const p = percursoSao();
    p.respostasDoSdr[1] = { turno: 2, respondeu: false, motivo: "provider_error" };
    const a = nenhumTurnoBarradoPeloGuarda(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/provider_error/);
  });

  it("nomeia o motivo da barra no detalhe — o CEO cobra 'malformado' pelo nome", () => {
    const p = percursoSao();
    p.turnosBarrados = ["[resposta barrada pelo guarda: malformado — quem respondeu foi o motor de regras.]"];
    p.respostasDoSdr[2] = { turno: 3, respondeu: false, motivo: "malformado" };
    const a = nenhumTurnoBarradoPeloGuarda(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/malformado ×1/);
  });

  it("aprova a rodada ao vivo em que o modelo respondeu tudo, e DIZ quantos turnos olhou", () => {
    const a = nenhumTurnoBarradoPeloGuarda(percursoSao());
    expect(a.veredito).toBe("passou");
    expect(a.detalhe).toMatch(/5 turno/);
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

describe("portão de direção — a régua que impede o atalho de uma linha", () => {
  it("REPROVA o portão aberto sem o cliente ter passado pela porta dele", () => {
    // Este é o atalho proibido: gravar `directionApprovedAt` no banco e ver a
    // esteira inteira ficar verde. Mediria um caminho que não existe.
    const p = percursoSao();
    p.esteira = { ...p.esteira, direcaoAprovada: true, direcaoViaPortal: false };
    const a = oPortaoDeDirecaoAbrePeloCliente(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.detalhe).toMatch(/escreveu o portão/);
  });

  it("REPROVA a porta que responde OK sem o banco registrar nada", () => {
    const p = percursoSao();
    p.esteira = { ...p.esteira, direcaoViaPortal: true, direcaoAprovada: false };
    expect(oPortaoDeDirecaoAbrePeloCliente(p).veredito).toBe("quebrou");
  });

  it("diz 'não coberto' — nunca 'passou' — quando o aval do cliente não passou", () => {
    const p = percursoSao();
    p.esteira = { ...p.esteira, direcaoViaPortal: false, direcaoAprovada: false, direcaoMotivo: "a porta do cliente recusou (403)" };
    const a = oPortaoDeDirecaoAbrePeloCliente(p);
    expect(a.veredito).toBe("nao-coberto");
    expect(a.detalhe).toMatch(/403/);
  });

  it("aprova só o percurso em que MARCO 0 rodou E o cliente aprovou pela porta", () => {
    expect(oPortaoDeDirecaoAbrePeloCliente(percursoSao()).veredito).toBe("passou");
  });
});

describe("execução anda — a exceção da rodada offline é ESTREITA", () => {
  const semIA = "pendências: Social Media · Copy dos posts (IA: Nenhuma IA conectada. Conecte uma chave em Integrações.)";

  it("na rodada OFFLINE, falta de chave é 'não coberto' — a esteira andou até a produção", () => {
    const p = percursoSao();
    p.sdrAoVivo = false;
    p.esteira = { ...p.esteira, entregas: 0, execucaoStatus: "failed", execucaoPendencias: semIA, execucaoTentativas: 2 };
    const a = aExecucaoAnda(p);
    expect(a.veredito).toBe("nao-coberto");
    expect(a.detalhe).toMatch(/ao-vivo/);
  });

  it("na rodada AO VIVO, 'nenhuma IA conectada' volta a ser achado de verdade", () => {
    // Com chave na mão, a casa dizer que não tem IA é defeito — não condição.
    const p = percursoSao();
    p.sdrAoVivo = true;
    p.esteira = { ...p.esteira, entregas: 0, execucaoStatus: "failed", execucaoPendencias: semIA, execucaoTentativas: 2 };
    expect(aExecucaoAnda(p).veredito).toBe("quebrou");
  });

  it("zero tentativa não é 'faltou chave' — é 'não andou', e continua vermelho", () => {
    const p = percursoSao();
    p.sdrAoVivo = false;
    p.esteira = { ...p.esteira, entregas: 0, execucaoStatus: "failed", execucaoPendencias: semIA, execucaoTentativas: 0 };
    expect(aExecucaoAnda(p).veredito).toBe("quebrou");
  });

  it("execução que não produz por QUALQUER outro motivo continua vermelha", () => {
    const p = percursoSao();
    p.sdrAoVivo = false;
    p.esteira = { ...p.esteira, entregas: 0, execucaoStatus: "failed", execucaoPendencias: "pendências: agente travou", execucaoTentativas: 2 };
    expect(aExecucaoAnda(p).veredito).toBe("quebrou");
  });
});

describe("porta autenticada — medir só o caso feliz é medir metade", () => {
  it("REPROVA a porta que admite quem não é staff, por mais verde que esteja o resto", () => {
    // Porta escancarada também deixa o staff entrar. Se a régua só olhasse o
    // caso feliz, ela daria verde para uma rota sem autenticação nenhuma.
    const p = percursoSao();
    p.aprovacao = { ...p.aprovacao, recusouQuemNaoEStaff: false, intrusos: [
      { quem: "sem cookie", status: 401, entrou: false },
      { quem: 'role "client"', status: 200, entrou: true },
    ] };
    const a = aPortaAutenticadaFoiExercitada(p);
    expect(a.veredito).toBe("quebrou");
    expect(a.falaExata).toMatch(/client/);
  });

  it("REPROVA mesmo quando o staff entrou normalmente — o intruso manda na régua", () => {
    const p = percursoSao();
    p.aprovacao = { ...p.aprovacao, ok: true, recusouQuemNaoEStaff: false, intrusos: [
      { quem: "staff com clientId", status: 201, entrou: true },
    ] };
    expect(aPortaAutenticadaFoiExercitada(p).veredito).toBe("quebrou");
  });

  it("diz 'não coberto' quando o staff entrou mas ninguém testou os intrusos", () => {
    const p = percursoSao();
    p.aprovacao = { ...p.aprovacao, ok: true, recusouQuemNaoEStaff: null, intrusos: [] };
    const a = aPortaAutenticadaFoiExercitada(p);
    expect(a.veredito).toBe("nao-coberto");
    expect(a.detalhe).toMatch(/metade da porta/);
  });

  it("só aprova quando o staff entrou E todos os intrusos foram recusados", () => {
    expect(aPortaAutenticadaFoiExercitada(percursoSao()).veredito).toBe("passou");
  });

  it("REPROVA a porta que recusa o próprio staff", () => {
    const p = percursoSao();
    p.aprovacao = { ...p.aprovacao, ok: false, motivo: "a porta autenticada recusou o STAFF (403)" };
    expect(aPortaAutenticadaFoiExercitada(p).veredito).toBe("quebrou");
  });
});

describe("execução anda — produzir e terminar são duas perguntas", () => {
  it("projeto em 'blocked' com entregas passa, MAS o placar mostra o bloqueio", () => {
    // Medido ao vivo em 24/08/2026: 8 tarefas, 5 entregas, projeto em "blocked"
    // porque dois portões de qualidade da casa recusaram peça. É a casa
    // funcionando — e é fato que quem lê o placar precisa ver.
    const p = percursoSao();
    p.esteira = { ...p.esteira, tarefas: 8, entregas: 5, execucaoStatus: "blocked",
      execucaoPendencias: "[recusa] pendências: Social Media · Copy dos posts", execucaoTentativas: 2 };
    const a = aExecucaoAnda(p);
    expect(a.veredito).toBe("passou");
    expect(a.detalhe).toMatch(/NÃO fechou/);
    expect(a.detalhe).toMatch(/blocked/);
    expect(a.detalhe).toMatch(/Copy dos posts/);
  });

  it("projeto em 'done' diz que fechou, sem alarme falso", () => {
    const p = percursoSao();
    p.esteira = { ...p.esteira, tarefas: 8, entregas: 8, execucaoStatus: "done", execucaoPendencias: null };
    const a = aExecucaoAnda(p);
    expect(a.veredito).toBe("passou");
    expect(a.detalhe).not.toMatch(/NÃO fechou/);
  });
});
