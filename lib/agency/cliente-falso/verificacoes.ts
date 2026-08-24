// verificacoes.ts — os defeitos que o CEO viveu, virados em pergunta de sim ou não.
//
// ─── A REGRA DESTE ARQUIVO ──────────────────────────────────────────────────
//
// Toda função aqui é PURA: recebe o percurso já medido e devolve um veredito.
// Nenhuma abre banco, nenhuma chama rede, nenhuma tem "if ambiente".
//
// Isso não é gosto de arquitetura — é o que torna possível o TESTE DO TESTE.
// Lição desta casa, 17/08/2026: *ferramenta que dá falso positivo é pior que
// ferramenta nenhuma* — um instrumento que acusa defeito onde não há manda a
// casa consertar o que não quebrou. Por isso `__tests__/cliente-falso/` alimenta
// cada uma destas funções com um percurso DOENTE e exige `quebrou`, e com um
// percurso SÃO e exige `passou`. Verificação que não falha quando deve falhar
// não é verificação: é enfeite verde.
//
// ─── "NÃO COBERTO" É UM VEREDITO, NÃO UM ATALHO ─────────────────────────────
//
// Quando o percurso rodou sem o SDR ao vivo, a verificação do guarda não pode
// dizer "passou" — ela não olhou nada. Dizer "passou" ali seria exatamente o
// defeito nº 4 do CEO acontecendo dentro do instrumento que existe para pegá-lo:
// o plano B atende, ninguém percebe, e a tela fica verde. Ausência de informação
// não é informação (guardrail 1).

import type { BriefingScope, LiveEstimate } from "../briefing-conversation";
import type { SaidaBloqueada } from "./trava-de-saida";
import type { Roteiro } from "./roteiro";

export type Veredito = "passou" | "quebrou" | "nao-coberto";

export type Achado = {
  /** Identificador estável — é por ele que o CEO cobra "isto de novo?". */
  id: string;
  /** O defeito que esta verificação guarda, em uma frase de negócio. */
  guarda: string;
  veredito: Veredito;
  /** A FALA EXATA que causou a falha. Sem isto o placar vira opinião. */
  falaExata?: string;
  /** O que se esperava contra o que veio. */
  detalhe?: string;
};

export type TurnoMedido = {
  numero: number;
  doCliente: string;
  daCasa: string;
  intencao: string;
  /** O escopo DEPOIS deste turno — para dizer em que turno o dado se perdeu. */
  escopoDepois: BriefingScope;
};

/**
 * O desfecho de UMA chamada à rota real do SDR (`app/api/sdr/chat`).
 *
 * Existe porque "a rodada foi ao vivo" e "a IA respondeu" não são a mesma
 * afirmação, e tratá-las como uma só deixava a verificação do guarda verde sem
 * ter olhado nada. Ver o cabeçalho de `chamarSdrDeVerdade`, em `percurso.ts`.
 */
export type RespostaDoSdr = {
  turno: number;
  /** `true` = o modelo respondeu E a fala atravessou os guardas da rota. */
  respondeu: boolean;
  /** Por que não respondeu. `null` quando respondeu. */
  motivo: string | null;
};

/** O desfecho da aprovação do escopo — e por QUAL caminho ela aconteceu. */
export type DesfechoDaAprovacao = {
  tentou: boolean;
  /** `true` = a ROTA autenticada rodou. `false` = só a função por baixo dela,
   *  ou seja, **a camada de autenticação não foi exercida**. A distinção é o
   *  ponto: "a esteira anda" e "a esteira anda quando alguém a destranca" são
   *  afirmações diferentes. */
  viaRota: boolean;
  ok: boolean;
  motivo: string | null;
  projetoId?: string | null;
  /**
   * A porta autenticada recusou TODAS as credenciais que não são de staff?
   *
   * `null` = não foi possível perguntar (a rota não rodou por HTTP). Só vira
   * booleano quando um servidor de verdade atendeu — porque a pergunta "quem a
   * porta deixa entrar?" não tem resposta honesta sem a porta de pé.
   */
  recusouQuemNaoEStaff: boolean | null;
  /** Cada tentativa de intruso e o que a porta respondeu. É a prova no dado. */
  intrusos: readonly TentativaDeIntruso[];
};

/** Uma credencial que NÃO deveria passar, e o que a porta fez com ela. */
export type TentativaDeIntruso = {
  /** Como a credencial foi forjada — "sem cookie", "role=client", … */
  quem: string;
  status: number;
  /** `true` quando a porta ABRIU para quem não devia. É o achado. */
  entrou: boolean;
};

/** O que sobrou da esteira depois da aprovação. */
export type EstadoDaEsteira = {
  projetoId: string | null;
  tarefas: number;
  /** `runProjectExecution` foi CHAMADA sem estourar. Não diz que produziu nada. */
  execucaoRodou: boolean;
  execucaoErro: string | null;
  /** O estado que o projeto ficou depois da chamada (`idle`, `running`, …). */
  execucaoStatus: string | null;
  /** O portão de direção: a produção só roda depois que o CLIENTE avaliza. */
  direcaoAprovada: boolean;
  /** Quantas entregas nasceram. É a prova de que algo andou de verdade. */
  entregas: number;
  /** MARCO 0 — `pedirDirecao()` rodou: o cliente REALMENTE recebeu o pedido de aval. */
  direcaoPedida: boolean;
  /**
   * O aval passou pela porta do CLIENTE (`POST /api/portal/esteira`,
   * `decisao: "aprovar_direcao"`, token de portal validado)?
   *
   * Existe separado de `direcaoAprovada` pelo mesmo motivo que `viaRota` existe
   * na aprovação de escopo: "o portão está aberto" e "o portão foi aberto por
   * quem tem direito de abrir" são fatos diferentes, e confundir os dois é como
   * um instrumento passa a mentir sem que ninguém perceba.
   */
  direcaoViaPortal: boolean;
  /** Por que o aval do cliente não passou, quando não passou. */
  direcaoMotivo: string | null;
  /** `executionError` lido do banco — o que a casa REGISTROU, não o que estourou. */
  execucaoPendencias: string | null;
  /** Quantas vezes a execução foi tentada. Zero = o portão nem deixou começar. */
  execucaoTentativas: number;
};

export type Percurso = {
  roteiro: Roteiro;
  saudacao: string;
  turnos: TurnoMedido[];
  escopoFinal: BriefingScope;
  estimativaFinal: LiveEstimate;
  portaoAbriu: boolean;
  bloqueioDoPortao: string | null;
  ultimaFalaDaCasa: string;
  /** O que o banco guardou depois do envio. `null` = o envio não chegou lá. */
  pedido: { id: string; status: string; businessName: string } | null;
  /** O texto do orçamento que a casa ENTREGOU ao cliente. `null` = não entregou. */
  orcamentoEntregue: string | null;
  /** Falas barradas pelo guarda (`[resposta barrada pelo guarda: …]`). */
  turnosBarrados: string[];
  /** O que a rota real do SDR devolveu, turno a turno. Vazia fora do ao vivo. */
  respostasDoSdr: RespostaDoSdr[];
  /** Como (e se) o escopo foi aprovado — a porta que exige gente. */
  aprovacao: DesfechoDaAprovacao;
  /** Projeto, tarefas e execução, depois da aprovação. */
  esteira: EstadoDaEsteira;
  /** O SDR de verdade rodou? Se não, a verificação do guarda não afirma nada. */
  sdrAoVivo: boolean;
  saidasBloqueadas: readonly SaidaBloqueada[];
};

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** Compara falas ignorando o que não muda o sentido para quem lê. */
function mesmaFala(a: string, b: string): boolean {
  const n = (s: string) =>
    s.toLowerCase().replace(/\*\*/g, "").replace(/\s+/g, " ").replace(/[.!?…]+$/g, "").trim();
  return n(a) === n(b) && n(a).length > 0;
}

const PEDE_NOME_DA_PESSOA = /qual (é|e) o seu nome|seu nome e o nome|me diga seu nome|como (você|voce) se chama/i;

// ─── 1. O nome dado na porta não pode ser perguntado de novo ────────────────
//
// CEO, 23/08/2026, ao vivo: *"Primeiro erro, já pediu o meu nome novamente, se
// eu dei meu nome na página de entrada."* O painel confirmava a causa —
// "Nome: aguardando…" com o nome já digitado. A porta capturava e não entregava.
//
// A verificação olha os DOIS lugares, e de propósito: a fala (o que a pessoa lê)
// e o escopo (o que o painel mostra). Consertar só a fala deixaria o painel
// mentindo, e consertar só o escopo deixaria a saudação constrangendo.
export function nomeDaPortaNaoEPerguntadoDeNovo(p: Percurso): Achado {
  const base = {
    id: "nome-da-porta",
    guarda: "Nome dado na porta não pode ser perguntado outra vez, nem na tela nem no painel.",
  };
  if (!p.roteiro.contatoDaPorta.nome.trim()) {
    return { ...base, veredito: "nao-coberto", detalhe: "o roteiro entrou sem nome na porta" };
  }

  if (PEDE_NOME_DA_PESSOA.test(p.saudacao)) {
    return { ...base, veredito: "quebrou", falaExata: p.saudacao,
      detalhe: "a saudação pediu o nome que a pessoa acabou de digitar na porta" };
  }
  const turnoQuePede = p.turnos.find((t) => PEDE_NOME_DA_PESSOA.test(t.daCasa));
  if (turnoQuePede) {
    return { ...base, veredito: "quebrou", falaExata: turnoQuePede.daCasa,
      detalhe: `turno ${turnoQuePede.numero}: a casa perguntou de novo o nome da porta` };
  }
  if (!p.escopoFinal.prospectName?.trim()) {
    return { ...base, veredito: "quebrou", falaExata: p.saudacao,
      detalhe: "o painel ficou sem o nome (\"aguardando…\") apesar de a porta tê-lo capturado" };
  }
  return { ...base, veredito: "passou" };
}

// ─── 2. Quem oferece documento não pode ser atropelado ──────────────────────
//
// Defeito do piloto: o cliente diz "posso mandar o briefing?" e a casa segue com
// a MESMA pergunta, por cima. Duas formas de errar, e as duas contam aqui:
//   • repetir a pergunta que acabou de fazer, ignorando a oferta;
//   • pior: gravar a OFERTA como se fosse a resposta da pergunta aberta — o
//     escopo do cliente passa a conter uma frase que não é dado nenhum.
export function ofertaDeDocumentoNaoEAtropelada(p: Percurso): Achado {
  const base = {
    id: "oferta-de-documento",
    guarda: "Cliente que oferece documento não pode ser atropelado com a mesma pergunta.",
  };
  const i = p.turnos.findIndex((t) => t.intencao === "oferece_documento");
  if (i === -1) return { ...base, veredito: "nao-coberto", detalhe: "o roteiro não ofereceu documento" };

  const oferta = p.turnos[i];
  const anterior = i > 0 ? p.turnos[i - 1] : null;

  if (anterior && mesmaFala(anterior.daCasa, oferta.daCasa)) {
    return { ...base, veredito: "quebrou", falaExata: oferta.daCasa,
      detalhe: `turno ${oferta.numero}: a casa repetiu a pergunta por cima da oferta de documento` };
  }

  // A oferta virou dado do cliente em algum campo de texto do escopo?
  const alvo = oferta.doCliente.trim().toLowerCase();
  const camposDeTexto: (keyof BriefingScope)[] = ["businessName", "segment", "targetAudience", "budgetRange", "deadline"];
  for (const c of camposDeTexto) {
    const v = oferta.escopoDepois[c];
    if (typeof v === "string" && v.trim().toLowerCase() === alvo) {
      return { ...base, veredito: "quebrou", falaExata: oferta.doCliente,
        detalhe: `a oferta de documento foi gravada no campo "${String(c)}" do pedido, como se fosse resposta` };
    }
  }
  const objetivos = oferta.escopoDepois.objectives ?? [];
  if (objetivos.some((o) => o.trim().toLowerCase() === alvo)) {
    return { ...base, veredito: "quebrou", falaExata: oferta.doCliente,
      detalhe: "a oferta de documento foi gravada como OBJETIVO do cliente" };
  }
  return { ...base, veredito: "passou" };
}

// ─── 3. A casa não repete a mesma fala duas vezes seguidas ──────────────────
//
// O sinal mais barato de que ninguém está ouvindo. O cliente responde, e a
// mesma frase volta — ele conclui, com razão, que falou com uma parede.
export function aCasaNaoSeRepete(p: Percurso): Achado {
  const base = {
    id: "sem-fala-repetida",
    guarda: "A casa não pode dizer a mesma coisa duas vezes seguidas.",
  };
  for (let i = 1; i < p.turnos.length; i++) {
    if (mesmaFala(p.turnos[i - 1].daCasa, p.turnos[i].daCasa)) {
      return { ...base, veredito: "quebrou", falaExata: p.turnos[i].daCasa,
        detalhe: `turnos ${p.turnos[i - 1].numero} e ${p.turnos[i].numero}: fala idêntica` };
    }
  }
  return { ...base, veredito: "passou" };
}

// ─── 4. Turno barrado pelo guarda é FALHA, ainda que o plano B tenha atendido ─
//
// Ordem do CEO, 23/08/2026. Hoje isto passa despercebido porque o cliente NÃO
// SABE que caiu no plano B: a conversa continua, a fala é do motor de regras, e
// só o diário registra `[resposta barrada pelo guarda: …]`. Duas vezes em três
// minutos no piloto de 16/08.
//
// ⚠️ Sem SDR ao vivo NÃO existe guarda para barrar nada. Devolver "passou" aqui
// seria o instrumento cometendo o próprio defeito que ele guarda.
/**
 * Os motivos em que a rota RECUSOU ANTES de o modelo abrir a boca.
 *
 * A distinção não é preciosismo: nenhum destes deixa linha no diário — a rota
 * volta antes de `registrar`. Se eles contassem como "passou", a verificação
 * aprovaria com base num diário vazio que só está vazio porque a chamada nunca
 * chegou ao modelo. E se contassem como "quebrou", acusariam a CASA por um
 * defeito da RODADA (sem chave, ou a própria bateria batendo no teto de ritmo
 * por rodar rápido demais). Nenhuma das duas seria verdade. São "não coberto",
 * com o motivo escrito.
 */
const RECUSA_ANTES_DO_MODELO = new Set([
  "not_configured",        // não havia chave de IA para gastar
  "teto_de_ritmo",         // 429: a própria bateria estourou o freio da rota
  "contador_indisponivel", // 503: o contador do freio fora do ar (fail-closed)
  "bad_request",           // o corpo não passou na porta da rota
]);

export function nenhumTurnoBarradoPeloGuarda(p: Percurso): Achado {
  const base = {
    id: "guarda-nao-barrou",
    guarda: "Nenhuma resposta pode ser barrada pelo guarda — plano B atendendo em silêncio é falha.",
  };
  if (!p.sdrAoVivo) {
    return { ...base, veredito: "nao-coberto",
      detalhe: "rodada sem SDR ao vivo: não houve guarda para barrar, e silêncio não é aprovação" };
  }

  // ── "AO VIVO" NÃO É PROVA DE QUE A IA FALOU ───────────────────────────────
  //
  // Este bloco é o conserto de 23/08/2026, e o defeito que ele fecha era o
  // pior tipo: a verificação lia `turnosBarrados` vazio e devolvia "passou".
  // Só que `turnosBarrados` também fica vazio quando a rota recusou ANTES de
  // chamar o modelo — sem chave (`not_configured`), no 429 do próprio freio de
  // ritmo. Uma rodada `--ao-vivo` numa máquina SEM `ANTHROPIC_API_KEY` fechava
  // 10 de 10 em verde, e a décima afirmava sobre um guarda que nunca existiu.
  //
  // É literalmente o defeito nº 4 do CEO — o plano B atende, ninguém percebe,
  // a tela fica verde — cometido pelo instrumento que guarda esse defeito.
  // Ausência de informação não é informação (guardrail 1).
  if (p.respostasDoSdr.length === 0) {
    return { ...base, veredito: "nao-coberto",
      detalhe: "a rodada diz ter sido ao vivo e nenhum turno chegou à rota do SDR — não há o que afirmar" };
  }

  // Barrado pelo guarda é o achado principal, e vem primeiro: aqui o modelo
  // FALOU e a fala foi recusada. É falha da casa, e é a pergunta original.
  if (p.turnosBarrados.length > 0) {
    return { ...base, veredito: "quebrou", falaExata: p.turnosBarrados[0],
      detalhe: `${p.turnosBarrados.length} turno(s) barrado(s); quem atendeu o cliente foi o motor de regras`
             + `${resumoDosMotivos(p)}` };
  }

  const recusadosAntes = p.respostasDoSdr.filter(
    (r) => !r.respondeu && r.motivo !== null && RECUSA_ANTES_DO_MODELO.has(r.motivo),
  );
  if (recusadosAntes.length > 0) {
    const motivos = [...new Set(recusadosAntes.map((r) => r.motivo))].join(", ");
    return { ...base, veredito: "nao-coberto",
      detalhe: `${recusadosAntes.length} de ${p.respostasDoSdr.length} turno(s) nem chegaram ao modelo (${motivos}) — `
             + `o guarda não foi exercitado, e não medir não é aprovar` };
  }

  // Sobrou o caso feio: o modelo não respondeu por um motivo que É da casa
  // (timeout, queda de rede, erro do provedor) e mesmo assim o diário não
  // registrou barra. O cliente foi atendido pelo plano B do mesmo jeito.
  const semResposta = p.respostasDoSdr.filter((r) => !r.respondeu);
  if (semResposta.length > 0) {
    const motivos = [...new Set(semResposta.map((r) => r.motivo ?? "sem motivo"))].join(", ");
    return { ...base, veredito: "quebrou", falaExata: p.turnos[semResposta[0].turno - 1]?.daCasa,
      detalhe: `${semResposta.length} de ${p.respostasDoSdr.length} turno(s) sem resposta do modelo (${motivos}); `
             + `quem atendeu o cliente foi o motor de regras` };
  }

  return { ...base, veredito: "passou",
    detalhe: `${p.respostasDoSdr.length} turno(s) respondidos pelo SDR de IA, nenhum barrado` };
}

/** Os motivos de barra, contados — o que o CEO pediu ver por rodada. */
function resumoDosMotivos(p: Percurso): string {
  const conta = new Map<string, number>();
  for (const r of p.respostasDoSdr) {
    if (r.respondeu || !r.motivo) continue;
    conta.set(r.motivo, (conta.get(r.motivo) ?? 0) + 1);
  }
  if (conta.size === 0) return "";
  return ` — motivos: ${[...conta].map(([m, n]) => `${m} ×${n}`).join(", ")}`;
}

// ─── 5. O que o cliente declarou tem de chegar ao orçamento ─────────────────
//
// Caso CityJobs, 16/08/2026: o cliente disse "2 posts por dia" e o volume chegou
// ZERADO ao escopo; disse "R$ 500 por mês" e a verba virou pó. O orçamento saiu
// mesmo assim — R$ 1.800–3.400, `confidence: "high"`, `missingForEstimate: []`.
// Confiança máxima sobre um campo vazio.
//
// São duas afirmações separadas, e as duas contam:
//   (a) o número que o cliente falou tem de estar no escopo, na unidade dele;
//   (b) campo zerado NÃO pode virar preço — se o volume se perdeu, a estimativa
//       tem de estar travada (`travadaPor`), nunca virar faixa de reais.
export function oQueOClienteDeclarouChegaAoOrcamento(p: Percurso): Achado {
  const base = {
    id: "declarado-chega-ao-orcamento",
    guarda: "Volume e verba que o cliente declarou têm de aparecer no orçamento; campo zerado não vira preço.",
  };
  const d = p.roteiro.declarado;
  const posts = p.escopoFinal.social?.postsPerWeek;
  const e = p.estimativaFinal;

  // (b) primeiro, porque é o dano maior: número inventado sobre buraco.
  const volumePerdido = posts === undefined || posts === 0;
  const virouPreco = (e.totalMin ?? 0) > 0 || (e.totalMax ?? 0) > 0;
  if (volumePerdido && virouPreco && !e.travadaPor) {
    const turno = p.turnos.find((t) => t.intencao === "declara_volume");
    return { ...base, veredito: "quebrou", falaExata: turno?.doCliente ?? d.fraseDoVolume,
      detalhe: `volume chegou ${posts === undefined ? "AUSENTE" : "ZERADO"} ao escopo e mesmo assim virou preço `
             + `(R$ ${e.totalMin}–${e.totalMax}, confiança "${e.confidence}")` };
  }

  // (a) o volume declarado chegou, e chegou certo?
  if (volumePerdido) {
    const turno = p.turnos.find((t) => t.intencao === "declara_volume");
    return { ...base, veredito: "quebrou", falaExata: turno?.doCliente ?? d.fraseDoVolume,
      detalhe: `o cliente declarou "${d.fraseDoVolume}" (${d.postsPorSemana}/semana) e o escopo ficou sem volume` };
  }
  if (posts !== d.postsPorSemana) {
    const turno = p.turnos.find((t) => t.intencao === "declara_volume");
    return { ...base, veredito: "quebrou", falaExata: turno?.doCliente ?? d.fraseDoVolume,
      detalhe: `o cliente declarou ${d.postsPorSemana}/semana ("${d.fraseDoVolume}") e o escopo guardou ${posts}/semana` };
  }

  // A verba declarada foi OUVIDA? Sem ela gravada, o confronto de verba abaixo
  // nunca acontece — o silêncio sobre a diferença começa aqui.
  if (!p.escopoFinal.budgetRange?.trim()) {
    // ── "NÃO PERGUNTOU" E "PERGUNTOU E PERDEU" SÃO DEFEITOS DIFERENTES ──────
    // O cliente falso só fala de verba quando lhe perguntam (ver `roteiro.ts`).
    // Se nenhum turno tem `declara_verba`, o campo não se perdeu no caminho: a
    // casa nunca abriu a boca sobre isso — e mandar orçamento a quem nunca foi
    // perguntado quanto pode gastar é um erro comercial de outra natureza.
    // Ausência de informação não é informação (guardrail 1): o placar tem de
    // dizer QUAL dos dois aconteceu, senão manda consertar o parser errado.
    const turno = p.turnos.find((t) => t.intencao === "declara_verba");
    return { ...base, veredito: "quebrou", falaExata: turno?.doCliente ?? p.ultimaFalaDaCasa,
      detalhe: turno
        ? `o cliente declarou "${d.fraseDaVerba}" e o pedido chegou sem faixa de verba nenhuma`
        : `a casa NUNCA perguntou quanto o cliente pode investir na gestão — fechou a entrevista `
          + `e mandou orçamento sem essa resposta` };
  }
  return { ...base, veredito: "passou" };
}

// ─── 6. Orçamento acima da verba tem de NOMEAR a diferença ──────────────────
//
// CityJobs outra vez: o cliente tinha acabado de dizer "algo em torno de R$ 500
// por mês" e recebeu R$ 1.800–3.400 sem uma palavra sobre a diferença. Quem lê
// o número e não vê a própria verba citada entende que não estavam escutando, e
// fecha a conversa ali.
export function orcamentoAcimaDaVerbaNomeiaADiferenca(p: Percurso): Achado {
  const base = {
    id: "verba-estourada-nomeada",
    guarda: "Orçamento acima da verba declarada tem de nomear a diferença, na cara.",
  };
  const texto = p.orcamentoEntregue;
  if (!texto) {
    return { ...base, veredito: "nao-coberto", detalhe: "nenhum orçamento foi entregue nesta rodada" };
  }
  const teto = p.roteiro.declarado.verbaMensal;
  const piso = p.estimativaFinal.totalMin ?? 0;
  if (piso <= 0 || piso <= teto) {
    return { ...base, veredito: "nao-coberto",
      detalhe: `a estimativa (R$ ${piso}) não passou da verba declarada (R$ ${teto}) — não há diferença a nomear` };
  }
  // ── ESTE TRECHO JÁ DEU FALSO POSITIVO, e o registro fica ───────────────────
  // A primeira versão procurava a string "500" no texto e devolveu "passou"
  // numa rodada em que a casa NÃO tinha dito uma palavra sobre a verba: o texto
  // entregava "R$ 4.000 e R$ 6.500", e o "500" de "6.500" satisfez a busca. A
  // verificação aprovou o defeito exato que ela existe para pegar.
  //
  // `(?<![\d.,])` e `(?![\d])` exigem o número SOZINHO — "R$ 500" casa,
  // "6.500" não. É a diferença entre citar a verba do cliente e ter o azar de
  // um preço terminado nos mesmos três dígitos.
  const numeroSozinho = new RegExp(`(?<![\\d.,])${teto}(?![\\d])`);
  const citaAVerba = numeroSozinho.test(texto) || !!p.estimativaFinal.confrontoDeVerba;
  if (!citaAVerba) {
    return { ...base, veredito: "quebrou", falaExata: texto.slice(0, 240),
      detalhe: `estimativa de R$ ${piso} contra verba declarada de R$ ${teto}, e o texto entregue não menciona a diferença` };
  }
  return { ...base, veredito: "passou" };
}

// ─── 7. A trava: nada saiu para pessoa de verdade ───────────────────────────
//
// Não é verificação de comportamento da casa — é a prova de que o INSTRUMENTO é
// seguro. Um cliente falso que manda e-mail é um incidente, não um teste.
export function nenhumaSaidaReal(p: Percurso): Achado {
  const base = {
    id: "nenhuma-saida-real",
    guarda: "O cliente falso não pode disparar e-mail, WhatsApp ou mensagem a pessoa de verdade.",
  };
  const vazadas = p.saidasBloqueadas.filter((s) => s.motivo !== "modo_cliente_falso" && s.motivo !== "dominio_inexistente");
  if (vazadas.length > 0) {
    return { ...base, veredito: "quebrou", falaExata: vazadas[0].destino,
      detalhe: "houve tentativa de saída que a trava não classificou como bloqueada" };
  }
  return { ...base, veredito: "passou",
    detalhe: `${p.saidasBloqueadas.length} tentativa(s) de envio barrada(s) pela trava` };
}

// ─── 8. A casa não pode anunciar o fim com o portão fechado ─────────────────
//
// 16/08/2026: o SDR dizia *"Tenho todas as informações que preciso, confira o
// resumo e confirme"* enquanto `canSubmitProposal` continuava falso — e o botão
// de envio nunca aparecia. O visitante fez o briefing inteiro e ficou sem o que
// clicar: o funil arrebentado no último passo, em piloto ao vivo.
const ANUNCIA_FIM = /tenho (todas as|as) informa|confir(a|me) o resumo|j[áa] posso preparar seu or[çc]amento/i;

export function aCasaNaoSeContradizNoFim(p: Percurso): Achado {
  const base = {
    id: "fim-nao-contradiz-portao",
    guarda: "A casa não pode dizer que terminou enquanto o portão de envio está fechado.",
  };
  if (ANUNCIA_FIM.test(p.ultimaFalaDaCasa) && !p.portaoAbriu) {
    return { ...base, veredito: "quebrou", falaExata: p.ultimaFalaDaCasa,
      detalhe: `a fala anuncia o fim, mas o portão segue fechado: "${p.bloqueioDoPortao ?? "sem motivo declarado"}"` };
  }
  return { ...base, veredito: "passou" };
}

// ─── 9. O cliente consegue chegar ao fim ────────────────────────────────────
//
// A pergunta mais simples de todas, e a que o piloto do CEO respondeu com
// "não": depois de contar tudo, dá para enviar o briefing?
export function oClienteConsegueEnviar(p: Percurso): Achado {
  const base = {
    id: "portao-abre",
    guarda: "Depois de contar tudo, o cliente tem de conseguir enviar o briefing.",
  };
  if (!p.portaoAbriu) {
    return { ...base, veredito: "quebrou", falaExata: p.ultimaFalaDaCasa,
      detalhe: `o portão não abriu: "${p.bloqueioDoPortao ?? "sem motivo declarado"}"` };
  }
  return { ...base, veredito: "passou" };
}

// ─── 10. O orçamento chega ──────────────────────────────────────────────────
export function oOrcamentoChega(p: Percurso): Achado {
  const base = {
    id: "orcamento-chega",
    guarda: "O orçamento tem de chegar ao cliente depois do briefing enviado.",
  };
  if (!p.pedido) {
    return { ...base, veredito: "quebrou", falaExata: p.ultimaFalaDaCasa,
      detalhe: "o briefing não chegou a virar pedido no banco" };
  }
  if (!p.orcamentoEntregue) {
    return { ...base, veredito: "quebrou",
      detalhe: `pedido ${p.pedido.id} está em "${p.pedido.status}" e nenhum orçamento foi entregue` };
  }
  return { ...base, veredito: "passou" };
}

// ─── 11. O escopo aprovado vira projeto ─────────────────────────────────────
//
// Achado de 24/08/2026, e é o mais grave da esteira: `createProjectFromRequest`
// só é chamada de UMA rota de painel autenticada. O relógio nunca a chama. Ou
// seja: por mais briefing que entre, **nenhum vira cliente até alguém aprovar à
// mão**. Isto explica os zero clientes medidos em produção.
export function oEscopoAprovadoViraProjeto(p: Percurso): Achado {
  const base = {
    id: "escopo-vira-projeto",
    guarda: "Briefing aprovado tem de virar projeto — senão o funil para e ninguém vê.",
  };
  if (!p.aprovacao.tentou) {
    return { ...base, veredito: "nao-coberto", detalhe: p.aprovacao.motivo ?? "não houve pedido para aprovar" };
  }
  if (!p.aprovacao.ok) {
    return { ...base, veredito: "quebrou", detalhe: p.aprovacao.motivo ?? "a aprovação não passou" };
  }
  if (!p.esteira.projetoId) {
    return { ...base, veredito: "quebrou", detalhe: "a aprovação disse OK e nenhum projeto apareceu no banco" };
  }
  return { ...base, veredito: "passou", detalhe: `projeto ${p.esteira.projetoId} criado` };
}

// ─── 12. A porta autenticada foi mesmo exercitada? ──────────────────────────
//
// "A esteira anda" e "a esteira anda quando alguém a destranca" são afirmações
// diferentes, e só uma delas vale como cobertura da rota real.
//
// ⚠️ ESTA RÉGUA MEDE QUE A PORTA FUNCIONA — NÃO QUE ELA DEVA EXISTIR.
//
// O raio-X da Dioli (24/08/2026) derrubou a premissa por baixo dela: o fluxo
// oficial da agência NÃO prevê humano aprovando escopo. O cursograma do CEO tem
// um único ponto de decisão depois da precificação — "cliente aceitou?" — e vai
// direto para o projeto nascer; a Arquitetura Operacional V2 abre dizendo que
// "o sistema não pode depender de o executor ser IA ou humano". Ou seja: a
// porta que esta régua exercita é um portão que a doutrina nunca pediu, e é a
// explicação dos ZERO clientes em produção.
//
// A medição continua valendo integralmente, e por dois motivos:
//   • enquanto o portão existir, é obrigação dele recusar intruso — e agora se
//     sabe, com prova, que recusa (401, 401, 403, 403);
//   • a forma desta régua (o caso infeliz primeiro, mandando no veredito) serve
//     a QUALQUER rota de staff, e o portão do escopo é só a primeira.
//
// Se o CEO mandar tirar o portão, o que sai é o portão — não a régua. Ela passa
// a apontar para a próxima rota autenticada. O molde do conserto já existe na
// casa: a "escada" tinha o mesmo defeito (peça presa porque soltar exigia
// sessão de admin) e virou código que o relógio aplica sozinho. **Nada aqui é
// para ser mexido antes da palavra do CEO** — guardrail 3.
export function aPortaAutenticadaFoiExercitada(p: Percurso): Achado {
  const base = {
    id: "porta-autenticada",
    guarda: "A aprovação do escopo passa por uma rota autenticada — e é ela que precisa ser exercitada.",
  };
  if (!p.aprovacao.tentou) return { ...base, veredito: "nao-coberto", detalhe: "não houve aprovação a exercitar" };
  if (!p.aprovacao.viaRota) {
    return { ...base, veredito: "nao-coberto",
      detalhe: p.aprovacao.motivo ?? "a rota autenticada não rodou; só a função por baixo dela" };
  }

  // ── A PERGUNTA QUE FALTAVA: A PORTA RECUSA QUEM NÃO É STAFF? ─────────────
  // Uma porta que deixa o staff entrar está metade medida. Rota autenticada
  // que aceita qualquer um também deixa o staff entrar — e passaria numa régua
  // que só olha o caso feliz. Por isso o caso INFELIZ é obrigatório aqui:
  // qualquer intruso admitido é "quebrou", por mais verde que esteja o resto.
  const admitidos = p.aprovacao.intrusos.filter((i) => i.entrou);
  if (admitidos.length > 0) {
    return { ...base, veredito: "quebrou",
      falaExata: admitidos.map((i) => `${i.quem} → ${i.status}`).join("; "),
      detalhe: `a rota autenticada ADMITIU ${admitidos.length} credencial(is) que não são de staff` };
  }

  if (!p.aprovacao.ok) {
    return { ...base, veredito: "quebrou", detalhe: p.aprovacao.motivo ?? "a rota autenticada recusou o staff" };
  }
  if (p.aprovacao.recusouQuemNaoEStaff !== true) {
    // Staff entrou, mas ninguém perguntou pelos outros. Meia medição não é
    // aprovação — é "não coberto" com o motivo na cara.
    return { ...base, veredito: "nao-coberto",
      detalhe: "o staff entrou pela rota, mas as credenciais de intruso não foram testadas — "
             + "metade da porta ficou sem medir" };
  }
  return { ...base, veredito: "passou",
    detalhe: `o staff entrou e a porta recusou ${p.aprovacao.intrusos.length} credencial(is) de intruso: `
           + p.aprovacao.intrusos.map((i) => `${i.quem} → ${i.status}`).join("; ") };
}

// ─── 13. Projeto sem tarefa é projeto que ninguém executa ───────────────────
export function oProjetoNasceComTarefas(p: Percurso): Achado {
  const base = {
    id: "projeto-tem-tarefas",
    guarda: "Projeto criado tem de nascer com tarefas — projeto vazio não vira entrega.",
  };
  if (!p.esteira.projetoId) return { ...base, veredito: "nao-coberto", detalhe: "nenhum projeto foi criado nesta rodada" };
  if (p.esteira.tarefas === 0) {
    return { ...base, veredito: "quebrou", detalhe: `projeto ${p.esteira.projetoId} nasceu com ZERO tarefas` };
  }
  return { ...base, veredito: "passou", detalhe: `${p.esteira.tarefas} tarefa(s)` };
}

// ─── 13.5. O portão de direção abre PELA MÃO DO CLIENTE ─────────────────────
//
// ── Por que esta régua nasceu (24/08/2026) ──────────────────────────────────
// A execução parava no portão de direção e havia um atalho de uma linha à mão:
// gravar `directionApprovedAt` no banco e ver a esteira inteira ficar verde.
// Seria medir um caminho que não existe — em produção ninguém escreve esse
// campo, quem o escreve é `aprovarDirecao()`, chamada pela porta do portal.
//
// Por isso esta verificação não pergunta "o portão está aberto?". Pergunta
// "QUEM abriu?". Portão aberto sem o cliente ter passado pela porta dele é
// exatamente o atalho que se proibiu — e vira "quebrou", não "passou".
export function oPortaoDeDirecaoAbrePeloCliente(p: Percurso): Achado {
  const base = {
    id: "direcao-pelo-cliente",
    guarda: "O portão de direção só pode ser aberto pela ação do CLIENTE — nunca por escrita direta no banco.",
  };
  if (!p.esteira.projetoId) return { ...base, veredito: "nao-coberto", detalhe: "nenhum projeto para avalizar" };

  // O caso que esta régua existe para pegar: o campo cedeu sem a porta ter sido
  // usada. Se algum dia alguém "consertar" a bateria por dentro, cai aqui.
  if (p.esteira.direcaoAprovada && !p.esteira.direcaoViaPortal) {
    return { ...base, veredito: "quebrou",
      detalhe: "a direção consta aprovada, mas NÃO passou pela porta do cliente — "
             + "alguém escreveu o portão em vez de abri-lo" };
  }
  if (!p.esteira.direcaoPedida) {
    return { ...base, veredito: "nao-coberto",
      detalhe: `o MARCO 0 não rodou: ${p.esteira.direcaoMotivo ?? "sem motivo registrado"}` };
  }
  if (!p.esteira.direcaoViaPortal) {
    return { ...base, veredito: "nao-coberto",
      detalhe: `a direção foi pedida ao cliente, mas o aval não passou: ${p.esteira.direcaoMotivo ?? "sem motivo registrado"}` };
  }
  if (!p.esteira.direcaoAprovada) {
    return { ...base, veredito: "quebrou",
      detalhe: "a porta do cliente disse OK, mas o banco não registrou a aprovação — "
             + "a rota respondeu sucesso sem ter feito o que diz que faz" };
  }
  return { ...base, veredito: "passou",
    detalhe: "pedirDirecao() rodou e o cliente aprovou por POST /api/portal/esteira com token de portal validado" };
}

// ─── 14. A execução anda ────────────────────────────────────────────────────
export function aExecucaoAnda(p: Percurso): Achado {
  const base = {
    id: "execucao-anda",
    guarda: "A execução do projeto tem de PRODUZIR — rodar sem estourar não é andar.",
  };
  if (!p.esteira.projetoId) return { ...base, veredito: "nao-coberto", detalhe: "nenhum projeto para executar" };
  if (p.esteira.execucaoErro) {
    return { ...base, veredito: "quebrou", falaExata: p.esteira.execucaoErro,
      detalhe: "a execução estourou — no relógio isso seria uma rodada perdida em silêncio" };
  }

  // ── A RÉGUA QUE MENTIU, E O CONSERTO (24/08/2026) ────────────────────────
  // A primeira versão desta verificação devolvia "passou" quando a chamada não
  // estourava. Na primeira rodada da esteira de baixo ela deu VERDE com o
  // projeto em `executionStatus: idle`, `executionAttempts: 0`, as 4 tarefas em
  // `pending` e ZERO entregas. Ou seja: mediu "não explodiu" e chamou de
  // "andou" — a mesma doença que esta bateria inteira existe para combater,
  // cometida por dentro dela pela terceira vez no mesmo dia.
  //
  // E o motivo de nada ter andado NÃO é defeito: `runProjectExecution` tem um
  // PORTÃO DE DIREÇÃO — a produção só roda depois que o cliente avaliza o
  // caminho ("aprovar uma direção custa uma conversa; refazer um mês de
  // produção custa o mês"). Portão fechado é a casa funcionando, e por isso
  // aqui é "não coberto" com o motivo, jamais "quebrou".
  if (!p.esteira.direcaoAprovada) {
    return { ...base, veredito: "nao-coberto",
      detalhe: `o portão de direção está fechado (o cliente ainda não avalizou), então a produção não roda — `
             + `projeto em "${p.esteira.execucaoStatus ?? "?"}", ${p.esteira.tarefas} tarefa(s), `
             + `${p.esteira.entregas} entrega(s). Portão fechado é a casa funcionando, não falha.` };
  }
  // ── SEM IA CONECTADA NÃO É DEFEITO DA CASA — É A RODADA OFFLINE ──────────
  // Medido em 24/08/2026, na primeira volta em que o portão de direção abriu de
  // verdade: a execução TENTOU (2 tentativas) e as 7 tarefas de produção caíram
  // com "Nenhuma IA conectada. Conecte uma chave em Integrações." Isso é a casa
  // se comportando exatamente como deve numa rodada sem chave.
  //
  // A exceção é ESTREITA de propósito, e as três condições valem juntas:
  //   • a rodada é offline (`sdrAoVivo === false`) — numa rodada AO VIVO, com
  //     chave na mão, "nenhuma IA conectada" volta a ser achado de verdade;
  //   • a casa REGISTROU o motivo no banco (`executionError`), em vez de falhar
  //     em silêncio;
  //   • a execução foi mesmo TENTADA. Zero tentativa não é "faltou chave", é
  //     "não andou", e continua vermelho.
  const faltouIA = !p.sdrAoVivo
    && !!p.esteira.execucaoPendencias
    && /nenhuma ia conectada/i.test(p.esteira.execucaoPendencias)
    && p.esteira.execucaoTentativas > 0;
  if (p.esteira.entregas === 0 && faltouIA) {
    return { ...base, veredito: "nao-coberto",
      detalhe: `a esteira andou até a produção (${p.esteira.execucaoTentativas} tentativa(s)) e parou por falta de `
             + `chave de IA — rodada offline. Produzir de verdade só se mede com \`--ao-vivo\`.` };
  }
  if (p.esteira.entregas === 0) {
    return { ...base, veredito: "quebrou",
      detalhe: `direção aprovada e a execução não produziu NADA (projeto em "${p.esteira.execucaoStatus ?? "?"}", `
             + `${p.esteira.execucaoTentativas} tentativa(s), ${p.esteira.entregas} entregas) — `
             + `rodar sem produzir é a rodada perdida em silêncio`
             + (p.esteira.execucaoPendencias ? `. A casa registrou: ${p.esteira.execucaoPendencias}` : "") };
  }
  // ── PRODUZIU, MAS TERMINOU? SÃO DUAS PERGUNTAS ──────────────────────────
  // Medido na primeira rodada ao vivo em que a esteira andou inteira
  // (24/08/2026): 8 tarefas, 5 entregas, e o projeto em `blocked` — duas
  // tarefas RECUSADAS pelos portões de qualidade da própria casa (piso de
  // verdade e contrato de saída). Isso é a casa funcionando como foi desenhada:
  // `blocked` existe justamente para o cron não re-rolar o dado eternamente.
  //
  // O guarda desta régua é "a execução tem de PRODUZIR", e produzir ela
  // produziu — então o veredito é "passou", e alargá-lo para vermelho seria
  // acusar a casa de ter portão de qualidade.
  //
  // MAS o placar não pode encolher isso para "5 entregas produzidas". Um
  // projeto parado em `blocked` com tarefa recusada é fato que quem lê PRECISA
  // ver, e a régua que o esconde vira aquela que "não estourou" — o defeito que
  // esta bateria persegue. Então o detalhe carrega o estado e as pendências
  // sempre que o projeto não fechou em `done`.
  const fechou = p.esteira.execucaoStatus === "done";
  if (!fechou) {
    return { ...base, veredito: "passou",
      detalhe: `${p.esteira.entregas} entrega(s) produzida(s) de ${p.esteira.tarefas} tarefa(s), `
             + `mas o projeto NÃO fechou: está em "${p.esteira.execucaoStatus ?? "?"}"`
             + (p.esteira.execucaoPendencias ? ` — ${p.esteira.execucaoPendencias}` : "")
             + `. A execução andou; o pacote não saiu inteiro.` };
  }
  return { ...base, veredito: "passou",
    detalhe: `${p.esteira.entregas} entrega(s) produzida(s) de ${p.esteira.tarefas} tarefa(s), projeto em "done"` };
}

// ─── 15. A PARADA DECLARADA — publicação não é exercitada, e diz isso ───────
//
// Nunca devolve "passou". Publicar sai no perfil do cliente, é público, e
// desfazer não desfaz o print. Esta verificação existe para que a parada seja
// LIDA no placar toda vez, em vez de virar um silêncio que alguém confunde com
// cobertura — que é o defeito que esta bateria inteira existe para combater.
export function aPublicacaoNaoFoiExercitada(_p: Percurso): Achado {
  return {
    id: "publicacao-nao-coberta",
    guarda: "A publicação (Instagram/Google) NÃO é exercitada por esta bateria.",
    veredito: "nao-coberto",
    detalhe:
      "parada deliberada: publicar sai no perfil do cliente, é público e desfazer não desfaz o print. " +
      "As travas de saída existem desde 24/08/2026, mas nunca foram exercitadas ao vivo — declarado, não presumido.",
  };
}

// ─── A lista, na ordem em que o CEO lê ──────────────────────────────────────
export const VERIFICACOES: ((p: Percurso) => Achado)[] = [
  nomeDaPortaNaoEPerguntadoDeNovo,
  ofertaDeDocumentoNaoEAtropelada,
  aCasaNaoSeRepete,
  nenhumTurnoBarradoPeloGuarda,
  oQueOClienteDeclarouChegaAoOrcamento,
  orcamentoAcimaDaVerbaNomeiaADiferenca,
  aCasaNaoSeContradizNoFim,
  oClienteConsegueEnviar,
  oOrcamentoChega,
  nenhumaSaidaReal,
  // ── A metade de baixo, que nunca tinha sido percorrida ──────────────────
  oEscopoAprovadoViraProjeto,
  aPortaAutenticadaFoiExercitada,
  oProjetoNasceComTarefas,
  oPortaoDeDirecaoAbrePeloCliente,
  aExecucaoAnda,
  aPublicacaoNaoFoiExercitada,
];

export function conferir(p: Percurso): Achado[] {
  return VERIFICACOES.map((v) => v(p));
}
