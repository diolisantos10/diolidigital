// quality-auditor.ts — o agente de QUALIDADE audita cada entrega.
//
// ── TRÊS ESTADOS, NÃO DOIS (decisão do CEO, 04/08/2026) ──────────────────────
//
// Até hoje este arquivo devolvia `pass` em três situações que NÃO são a mesma
// coisa: a peça foi olhada e está boa; a IA da auditoria caiu; a IA respondeu
// lixo. As três viravam "quality_ok" no banco e a peça seguia ao cliente como
// se um árbitro tivesse dito sim. O único freio da casa dizia "sim" na dúvida.
//
// A regra da casa (CLAUDE.md, P0 item 2) pede as duas metades separadas:
// **reprovação BLOQUEANTE** e **indisponibilidade NÃO-bloqueante**. Fundidas num
// `pass` só, nenhuma das duas existe de verdade. Agora:
//
//   • `aprovado`     → o juiz olhou e aprovou.
//   • `reprovado`    → o juiz olhou e reprovou. BLOQUEIA a apresentação
//                      (`marcos.apresentar` / `mes.apresentarCiclo` recusam
//                      enquanto houver `quality_flag`), e `pacote-travado.ts`
//                      refaz até 2 tentativas antes de escalar.
//   • `nao_auditado` → NINGUÉM olhou (IA fora do ar, timeout, resposta
//                      inválida). NÃO bloqueia — a operação não pode parar
//                      porque um provedor caiu — mas fica declarado com todas
//                      as letras, no banco e num ActivityEvent, para ser
//                      possível responder depois "quantas peças foram ao
//                      cliente sem árbitro?".
//
// Vazio é vazio: `nao_auditado` NUNCA pode ser lido como `aprovado`. É por isso
// que o mapeamento para o banco mora AQUI (`revisionStatusDoVeredito`) e não
// espalhado em `? :` no chamador — string comparada à mão é como o bug volta.

import { generate } from "@/lib/ai/generate";
import type { AiProvider } from "@/lib/ai/resolve-key";
// ── A RÉGUA DETERMINÍSTICA, ANTES DA OPINIÃO (13/08/2026) ────────────────────
//
// Este juiz é UMA chamada de IA com cinco perguntas em prosa e a instrução
// `verdict="flag" só se houver problema real`. Em 07/08 ele carimbou
// `quality_ok` em 8 peças que um humano reprovou na hora seguinte
// (`docs/projetos/cityjobs-registro-07-08.md:139`). Nenhuma das frases era fato
// inventado — o piso de verdade estava certo em deixá-las passar —, e todas as
// quatro citadas no registro são regex.
//
// Prompt é aviso; código é trava. O que dá para conferir sem modelo passa a ser
// conferido sem modelo, e a opinião da IA continua existindo, julgando o que
// sobrou. Ver `lib/agency/execution/regua-do-texto.ts`.
import {
  conferirReguaDoTexto, resumirAlegacoes, reguaSeAplicaA,
} from "@/lib/agency/execution/regua-do-texto";

/** O parecer possível da Qualidade. Três estados, de propósito — ver o topo. */
export type VereditoDaQualidade = "aprovado" | "reprovado" | "nao_auditado";

/** Por que a peça não foi auditada. Só existe quando `verdict === "nao_auditado"`. */
export type MotivoDeNaoAuditar =
  | "ia_indisponivel" | "timeout" | "erro" | "resposta_invalida"
  /** Quem chamou não disse QUE TIPO de entrega é. Ver a trava em
   *  `auditDeliverable`: sem o tipo, o juiz inventa a régua. */
  | "tipo_nao_declarado"
  /** O juiz acabou sendo o MESMO modelo que escreveu a peça — ver
   *  `escolherArbitro`. Aprovação de si mesmo não é aprovação. */
  | "juiz_nao_imparcial"
  /**
   * TODOS os árbitros independentes responderam LIMITE DE TAXA (HTTP 429).
   *
   * ── Por que é um motivo próprio (25/08/2026) ──────────────────────────────
   * Medido em produção no case Farol 27, rodada 5: as 8 chamadas ao juiz
   * `gpt-4o` voltaram 429 e o julgamento caiu para o `claude-haiku-4-5`, que é
   * quem escreveu as peças. `ia_indisponivel` teria dito "a IA caiu" — e não
   * caiu: ela está viva e recusando por VOLUME. O conserto é esperar e repetir
   * (ou conectar outra chave), não investigar um provedor morto.
   *
   * Doutrina da casa, aprendida duas vezes no mesmo dia: **status de erro não é
   * motivo — o motivo está na mensagem.** Um `400` era falta de saldo; um `404`
   * era host morto; um `429` é fila cheia.
   */
  | "limite_de_taxa";

export interface QualityVerdict {
  verdict: VereditoDaQualidade;
  issues: string[];
  note: string;
  /** Preenchido SOMENTE em `nao_auditado`. Presente = ninguém olhou a peça. */
  motivo?: MotivoDeNaoAuditar;
  /** Quem de fato julgou. Ausente = ninguém julgou. */
  arbitro?: AiProvider;
  /**
   * O juiz era OUTRO modelo, que não o autor?
   *
   * Campo próprio em vez de "compare `arbitro` com `provedorDoAutor` lá fora":
   * a comparação depende de saber quem é o autor, e quem lê o banco meses
   * depois não sabe. A resposta é gravada no momento em que ela é conhecida.
   */
  arbitroIndependente?: boolean;
}

// ── O JUIZ NÃO PODE SER O AUTOR ──────────────────────────────────────────────
//
// O gate `quality_audit_impartial` DECLARA que a auditoria roda num modelo
// diferente do que gerou a peça. Até 05/08/2026 o código garantia o contrário:
// 11 dos 14 especialistas são `claude` e este arquivo fixava
// `preferredProvider: "claude"`. O argumento inteiro do piso de verdade
// ("um LLM julgando outro LLM tem o mesmo ponto cego dos dois",
// `piso-de-verdade.ts:7-9`) estava escrito no repositório e contradito por uma
// linha dele.
//
// Duas metades, e a segunda é a que importa: escolher outro provedor NÃO basta,
// porque `generate` cai para o próximo da fila quando a chave preferida não
// existe — numa casa com uma chave só, o "outro modelo" volta a ser o mesmo, em
// silêncio. Por isso o veredito é conferido contra o provedor REAL da resposta.

/** A fila do árbitro, em ordem de preferência. */
const FILA_DE_ARBITROS: AiProvider[] = ["claude", "openai", "gemini", "deepseek"];

/**
 * Quem julga uma peça escrita por `autor`. Nunca devolve o próprio autor.
 *
 * `perplexity` não entra na fila: é pesquisadora com fonte, não juíza de texto.
 * Autor desconhecido cai em "claude" como se fosse o autor — é a suposição
 * conservadora, porque claude é quem escreve quase tudo nesta casa.
 */
export function escolherArbitro(autor?: string | null): AiProvider {
  return filaDeArbitros(autor)[0] ?? "openai";
}

/**
 * TODOS os árbitros independentes possíveis para uma peça escrita por `autor`,
 * em ordem de preferência. O autor NUNCA está na lista.
 *
 * ── Por que a fila inteira, e não só o primeiro (25/08/2026) ────────────────
 * `escolherArbitro` devolvia um nome só, e quem chamava passava esse nome como
 * `preferredProvider` para `generate` — que é PREFERÊNCIA, não trava: quando o
 * preferido falha, `generate` anda na ordem da casa, e a ordem da casa começa
 * no `claude`, que é quem escreve quase tudo. Ou seja: o mecanismo que existia
 * para garantir independência entregava o julgamento ao autor no primeiro
 * tropeço do juiz.
 *
 * Medido no Farol 27, rodada 5: 8 chamadas ao `gpt-4o` em 429, 10 julgamentos
 * saídos do mesmo `claude-haiku-4-5` que escreveu as peças, 0 de 10 com árbitro
 * independente — e nenhuma tela mudou.
 *
 * Com a fila inteira, o auditor anda ELE MESMO de árbitro em árbitro, cada um
 * chamado com `apenasOPreferido: true` — que desliga a reserva de `generate`.
 * Acabou a fila, a peça é RETIDA. Nunca cai no autor.
 *
 * `perplexity` não entra: é pesquisadora com fonte, não juíza de texto.
 */
export function filaDeArbitros(autor?: string | null): AiProvider[] {
  const doAutor = (autor ?? "claude").trim().toLowerCase();
  return FILA_DE_ARBITROS.filter((p) => p !== doAutor);
}

// ── AS TRÊS PALAVRAS QUE A TELA PRECISA DIZER (25/08/2026) ───────────────────
//
// `revisionStatus` responde "qual foi o veredito" e NÃO responde "quem julgou".
// São perguntas diferentes, e confundi-las é o defeito do Farol 27: uma peça
// `quality_flag` julgada pelo próprio autor e uma peça `quality_flag` julgada
// por um juiz independente ficavam idênticas em toda tela da casa.
//
// Três coisas, três palavras:
//   • `arbitro_independente` → outro modelo, que não o autor, olhou e decidiu.
//   • `autojulgado`          → quem julgou foi o MESMO modelo que escreveu.
//                              Vale como freio (reprovação bloqueia), NUNCA
//                              como aprovação — ver a degradação assimétrica.
//   • `sem_arbitro`          → ninguém olhou. Retém.
//   • `decisao_humana`      → quem decidiu foi uma PESSOA, pela tela. É uma
//                              quarta coisa, e a palavra é própria por isso:
//                              não é auto-julgamento (nenhum modelo julgou a si
//                              mesmo) e muito menos árbitro independente. Ver
//                              `camposDaDecisaoHumana`.
export type Arbitragem = "arbitro_independente" | "autojulgado" | "sem_arbitro" | "decisao_humana";

export const ARBITRAGEM_EM_PALAVRAS: Record<Arbitragem, string> = {
  arbitro_independente: "julgada por árbitro independente",
  autojulgado: "julgada pelo PRÓPRIO autor — não é aprovação independente",
  sem_arbitro: "NÃO julgada — ninguém auditou",
  decisao_humana: "decidida por uma PESSOA pela tela — não é auditoria de árbitro nenhum",
};

/**
 * OS CAMPOS DE BANCO quando quem decidiu foi UMA PESSOA, pela tela.
 *
 * ── Por que uma QUARTA palavra (25/08/2026, ordem do Diretor Geral) ─────────
 * `app/api/deliverables/[id]` grava `revisionStatus` vindo do corpo da
 * requisição. Sem esta função, ela escreveria o veredito e deixaria
 * `qualityArbitragem` como estava — herdando o carimbo da auditoria anterior,
 * ou ficando nulo. Nos dois casos a tela volta a mentir, e sem má-fé nenhuma:
 * basta alguém usar a tela.
 *
 * E não bastava reusar uma palavra existente. "Um humano decidiu" NÃO é
 * `autojulgado` (nenhum modelo julgou a si mesmo), NÃO é `sem_arbitro` (alguém
 * olhou, e com mais autoridade que qualquer modelo) e MUITO menos
 * `arbitro_independente` (não houve árbitro). É uma quarta coisa e ganhou o
 * nome dela — do mesmo jeito honesto que as outras três.
 *
 * `qualityArbiter` guarda QUEM, com prefixo `pessoa:`: o prefixo é o que
 * impede a coluna de ser lida como nome de provedor de IA por quem abrir o
 * banco daqui a um mês.
 */
export function camposDaDecisaoHumana(revisionStatus: string, quem: string): {
  revisionStatus: string;
  qualityArbiter: string;
  qualityArbitragem: Arbitragem;
} {
  return { revisionStatus, qualityArbiter: `pessoa:${quem}`, qualityArbitragem: "decisao_humana" };
}

/**
 * Quem julgou esta peça, na linguagem das três palavras acima.
 *
 * Ponto ÚNICO de tradução, igual a `revisionStatusDoVeredito`: nenhuma tela,
 * contador ou relatório compara `arbitro` com `provedorDoAutor` na mão. Foi
 * comparação de string espalhada que produziu o bug original.
 */
export function arbitragemDoVeredito(v: QualityVerdict): Arbitragem {
  if (v.verdict === "nao_auditado") return "sem_arbitro";
  return v.arbitroIndependente ? "arbitro_independente" : "autojulgado";
}

/**
 * O `revisionStatus` que cada veredito grava no `Deliverable`.
 *
 * Único ponto de tradução veredito → banco. Quem precisar ler o estado da
 * Qualidade importa daqui em vez de comparar string na mão.
 */
export const REVISION_STATUS_DA_QUALIDADE = {
  aprovado: "quality_ok",
  reprovado: "quality_flag",
  nao_auditado: "quality_nao_auditado",
} as const satisfies Record<VereditoDaQualidade, string>;

export type RevisionStatusDaQualidade =
  (typeof REVISION_STATUS_DA_QUALIDADE)[VereditoDaQualidade];

export function revisionStatusDoVeredito(v: VereditoDaQualidade): RevisionStatusDaQualidade {
  return REVISION_STATUS_DA_QUALIDADE[v];
}

/**
 * OS `revisionStatus` QUE SÃO VEREDITO DA QUALIDADE.
 *
 * Nem todo `revisionStatus` é veredito: `revision_requested`, `resolved` e
 * `none` são estados do fluxo com o cliente e não afirmam auditoria nenhuma.
 * Só os três daqui dizem "a Qualidade decidiu isto" — e só eles obrigam quem
 * grava a dizer TAMBÉM quem decidiu.
 */
export const VEREDITOS_NO_BANCO: readonly string[] =
  Object.values(REVISION_STATUS_DA_QUALIDADE);

export function eVereditoDaQualidade(revisionStatus?: string | null): boolean {
  return typeof revisionStatus === "string" && VEREDITOS_NO_BANCO.includes(revisionStatus);
}


/**
 * OS CAMPOS DE BANCO que um veredito grava — os três de uma vez.
 *
 * Existe para que nenhum dos cinco chamadores de `auditDeliverable` grave o
 * veredito e ESQUEÇA de gravar quem julgou. Foi exatamente isso que aconteceu
 * até 25/08/2026: `QualityVerdict.arbitro` era calculado e descartado, em todos
 * os caminhos, porque cada chamador montava o `data:` do Prisma à mão.
 *
 * Espalhe-se em `prisma.deliverable.create({ data: { ..., ...camposDaQualidade(v) } })`.
 */
export function camposDaQualidade(v: QualityVerdict): {
  revisionStatus: RevisionStatusDaQualidade;
  qualityArbiter: string | null;
  qualityArbitragem: Arbitragem;
} {
  return {
    revisionStatus: revisionStatusDoVeredito(v.verdict),
    qualityArbiter: v.arbitro ?? null,
    qualityArbitragem: arbitragemDoVeredito(v),
  };
}

/**
 * A peça foi OLHADA e APROVADA por um árbitro?
 *
 * Só `aprovado` responde `true`. Existe para que nenhum contador, tela ou
 * relatório precise escrever `!== "reprovado"` — que é exatamente a forma de
 * contar "não auditado" como aprovado com outra roupa.
 */
export function foiAprovadaPelaQualidade(v: VereditoDaQualidade): boolean {
  return v === "aprovado";
}

/** A peça foi reprovada por um árbitro que a olhou? (o que bloqueia) */
export function foiReprovadaPelaQualidade(v: VereditoDaQualidade): boolean {
  return v === "reprovado";
}

/** Ninguém olhou a peça. (não bloqueia, mas precisa ficar declarado) */
export function ficouSemArbitro(v: VereditoDaQualidade): boolean {
  return v === "nao_auditado";
}

/** Teto de espera do juiz. Provedor que pendura a conexão travaria a produção
 *  inteira sem isto — e "travou" seria contado como... nada. Estourou: a peça
 *  não fica reprovada nem aprovada; fica declarada como não auditada. */
export const AUDIT_TIMEOUT_MS = 45_000;

export const MOTIVO_EM_PALAVRAS: Record<MotivoDeNaoAuditar, string> = {
  ia_indisponivel: "NÃO AUDITADA: a IA da Qualidade estava indisponível — nenhum árbitro olhou esta peça.",
  timeout: "NÃO AUDITADA: a IA da Qualidade não respondeu a tempo — nenhum árbitro olhou esta peça.",
  erro: "NÃO AUDITADA: a auditoria falhou com erro — nenhum árbitro olhou esta peça.",
  resposta_invalida: "NÃO AUDITADA: a IA da Qualidade respondeu fora do formato — o parecer não pôde ser lido.",
  // ── O MOTIVO DIZ QUAL CHAVE RESOLVE (24/08/2026) ──────────────────────────
  // Medido no piloto: 5 de 7 entregas pararam aqui, e a mensagem antiga
  // explicava o problema sem dizer o conserto. Quem abrisse o portal daqui a um
  // mês saberia que a peça não foi auditada e não saberia o que fazer — e o
  // conserto NÃO é reescrever a peça, é conectar um provedor.
  //
  // A fila de árbitros é `FILA_DE_ARBITROS` (logo acima): qualquer uma das três
  // resolve, e são chaves de preços diferentes. Nomear as três é dar a escolha
  // a quem paga, em vez de mandá-lo adivinhar.
  juiz_nao_imparcial:
    "NÃO AUDITADA: o único modelo disponível para julgar é o MESMO que escreveu a peça — "
    + "não existe aprovação independente aqui. NÃO é defeito da peça: não reescreva. "
    + "CONSERTO: conectar uma SEGUNDA chave de IA (openai, gemini ou deepseek) em "
    + "Integrações — qualquer uma delas serve como árbitro independente.",
  tipo_nao_declarado: "NÃO AUDITADA: quem pediu a auditoria não declarou o TIPO da entrega — sem saber se julga um post ou um plano, o juiz inventaria a régua.",
  // ── 429 É FILA CHEIA, NÃO PROVEDOR MORTO (25/08/2026) ─────────────────────
  // O conserto aqui NÃO é reescrever a peça e NÃO é investigar um host caído: é
  // esperar (a casa já esperou e repetiu, ver `VOLTAS_DO_ARBITRO`) ou ampliar o
  // limite da chave. Dizer "IA indisponível" mandaria a pessoa procurar o
  // defeito no lugar errado.
  limite_de_taxa:
    "NÃO AUDITADA: todos os árbitros independentes recusaram por LIMITE DE TAXA (HTTP 429) — "
    + "a IA está no ar e recusando por volume, não fora do ar. A casa já repetiu com espera crescente. "
    + "NÃO é defeito da peça: não reescreva. CONSERTO: repetir a auditoria mais tarde, ou ampliar o "
    + "limite/conectar outra chave de árbitro (openai, gemini ou deepseek) em Integrações.",
};

/** Quantas VOLTAS na fila inteira de árbitros antes de reter. Cada volta já
 *  carrega as re-tentativas internas de `generate` (espera crescente); a volta
 *  existe para o caso em que TODOS os árbitros estavam em 429 ao mesmo tempo,
 *  que é transitório por definição. Teto baixo de propósito: auditoria que
 *  insiste para sempre trava a produção tanto quanto auditoria que não roda. */
export const VOLTAS_DO_ARBITRO = 2;

/** Espera entre uma volta e outra na fila de árbitros, em ms. Cresce por volta. */
export const ESPERA_ENTRE_VOLTAS_MS = 1_500;

/**
 * O erro veio de LIMITE DE TAXA?
 *
 * Lê a MENSAGEM, não um código isolado — é a doutrina da casa: `400` já foi
 * falta de saldo e `404` já foi host morto. O que identifica a fila cheia é o
 * 429 e as palavras que os provedores usam junto dele.
 */
export function eLimiteDeTaxa(erro?: string | null): boolean {
  const e = (erro ?? "").toLowerCase();
  return e.includes("429") || e.includes("rate limit") || e.includes("rate_limit")
      || e.includes("too many requests") || e.includes("limite de taxa")
      || e.includes("quota");
}

/**
 * O árbitro RESPONDEU, mas o que veio não dá para ler como parecer: corpo
 * vazio, JSON quebrado, ou JSON válido sem veredito reconhecível.
 *
 * ── Por que isto ganhou nome próprio (26/08/2026) ──────────────────────────
 * Medido na 7ª volta de cliente oculto, em produção: OpenAI devolveu 429,
 * DeepSeek devolveu corpo VAZIO e Gemini devolveu JSON INVÁLIDO. A peça foi
 * retida — o que está certo — mas retida DEPOIS DE UMA VOLTA SÓ, porque a
 * segunda volta na fila era guardada por `if (!houve429) break`. Ou seja: a
 * casa desistia de dois árbitros vivos que tinham apenas gaguejado.
 *
 * `generate` já classifica "vazia" e "json" como TRANSITÓRIOS e repete por
 * dentro (`isTransientError` / `callWithRetry`). O auditor discordava do seu
 * próprio motor: tratava como veredito final o que o motor chama de soluço.
 * Agora as duas metades concordam.
 *
 * O que NÃO muda: continua fail-closed. Mais uma volta é mais uma CHANCE de
 * achar juiz — nunca um caminho para aprovar sem juiz. Fila esgotada retém.
 */
export function eRespostaIlegivel(erro?: string | null): boolean {
  const e = (erro ?? "").toLowerCase();
  return e.includes("vazia") || e.includes("json inválido") || e.includes("json invalido")
      || e.includes("resposta ilegível");
}

/**
 * Esta falha merece outra volta na fila inteira?
 *
 * Só o que o tempo conserta: fila cheia (429), soluço de formato (vazio/JSON
 * quebrado), timeout e queda de rede. Falta de chave NÃO merece — provedor sem
 * chave não ganha chave esperando, e insistir só atrasa a retenção honesta.
 */
export function mereceOutraVolta(erro?: string | null): boolean {
  if (eFaltaDeChave(erro)) return false;
  const e = (erro ?? "").toLowerCase();
  return eLimiteDeTaxa(erro) || eRespostaIlegivel(erro)
      || e.includes("timeout") || e.includes("rede") || /http 5\d\d/.test(e);
}

/** O erro é "esse provedor não tem chave"? Ausência de chave NÃO é falha do
 *  provedor — é o árbitro não existir nesta casa. Motivos diferentes, consertos
 *  diferentes: um pede espera, o outro pede uma chave nova. */
function eFaltaDeChave(erro?: string | null): boolean {
  const e = (erro ?? "").toLowerCase();
  return e.includes("não está configurado") || e.includes("nenhuma ia conectada")
      || e.includes("não tem chave conectada");
}

/**
 * O QUE O JUIZ ESTÁ JULGANDO — e com que régua.
 *
 * ── O defeito que isto conserta (24/08/2026) ───────────────────────────────
 * O prompt do auditor mandava título, departamento e corpo, e cinco critérios
 * todos de PEÇA. Nenhuma linha dizia se aquilo era um post ou um plano. O juiz
 * preencheu a lacuna sozinho e reprovou o "Posicionamento" — tipo `strategy` —
 * por *"exigir a entrega REAL (peças prontas), não documentação de
 * planejamento"*. Reprovou um plano por ser um plano.
 *
 * ⚠️ INFORMAR UMA RÉGUA NÃO É AFROUXAR UMA RÉGUA. Nenhum critério sai daqui: o
 * juiz continua reprovando invenção, promessa falsa, número fabricado e clichê
 * nos dois casos. O que muda é ele parar de cobrar peça pronta de quem nunca
 * deveria entregar peça.
 *
 * A lista de tipos internos é a MESMA de `TIPOS_DE_DOCUMENTO_INTERNO`, que a
 * régua determinística já usava — importada, não copiada. Duas listas da mesma
 * verdade é a doença que esta casa já pagou várias vezes.
 */
/**
 * OS TIPOS QUE SE JULGAM COMO PLANO — e por que a lista não é a mesma.
 *
 * `TIPOS_DE_DOCUMENTO_INTERNO` responde a outra pergunta: "a régua
 * determinística de texto se aplica?". Ela isenta estratégia e relatório porque
 * analisar um concorrente dispara o detector de jargão da peça.
 *
 * Aqui a pergunta é diferente: "isto é para publicar?". Um plano de conteúdo
 * NÃO é para publicar — mas continua tendo de passar na régua de texto, porque
 * o cliente vai ler o calendário dele. Duas perguntas, duas respostas: juntar as
 * listas isentaria a pauta da régua de texto sem ninguém ter pedido.
 */
const TIPOS_DE_PLANEJAMENTO: readonly string[] = ["plano-de-conteudo"];

/**
 * O QUE **NÃO** É MOTIVO PARA REPROVAR — a instrução gêmea do juiz.
 *
 * ── Por que existe (24/08/2026) ────────────────────────────────────────────
 * O prompt listava cinco critérios e fechava com "flag só se houver problema
 * real". Sem dizer o que NÃO é problema, o juiz virou maximalista: medido ao
 * vivo, reprovou peças exigindo que declarassem tipografia de uma marca que
 * ainda não tem identidade, que o CTA nomeasse canais (quando "chama a gente no
 * direct" é EXATAMENTE o que a casa manda escrever para não depender de dado
 * ausente), e leu "terça a domingo" como contradição de "ter, qua, qui, sex,
 * sab, dom" — que é a mesma coisa.
 *
 * É a doutrina de "toda proibição precisa da instrução gêmea", aplicada ao
 * contrário: **toda instrução de julgar precisa do seu limite.** Critério sem
 * fronteira não vira rigor, vira invenção — do mesmo jeito que proibição sem
 * alternativa empurra o autor para o comportamento adjacente.
 *
 * ⚠️ NENHUM CRITÉRIO SAI. Os cinco continuam inteiros, e invenção e promessa
 * falsa continuam reprovando (há teste). O que este bloco faz é impedir que o
 * juiz acrescente critérios que ninguém escreveu.
 */
const LIMITE_DO_JUIZ = [
  "",
  "O QUE **NÃO** É MOTIVO PARA REPROVAR — reprovar por isto trava o pacote inteiro sem defeito:",
  "- A peça NÃO citar um fato atestado. Ela não é um cadastro: não precisa listar horário,",
  "  endereço, canais nem dias. Só é defeito quando o que ela DIZ está errado.",
  "- CTA genérico que não depende de dado ausente (\"chama a gente no direct\", \"manda mensagem\").",
  "  É o comportamento CORRETO desta casa — peça que depende de dado que ninguém tem é que é defeito.",
  "- Faltar diretriz visual, tipografia ou cor quando a marca ainda não tem identidade constituída.",
  "- A peça NOMEAR o que ainda depende do cliente. Nomear a pendência é a função de um bom",
  "  documento, não um defeito dele.",
  "- Quantidade entregue (número de peças, de roteiros, de semanas). Isso é conferido em código",
  "  pelo contrato de saída, antes de você — não é o seu trabalho e você não tem o contrato à vista.",
  "- Preferência editorial sua: outro ângulo, outra ordem, mais diferenciação entre peças.",
  "",
  "CONTRADIÇÃO é a peça afirmar o OPOSTO do atestado — não uma forma diferente de dizer a mesma",
  "coisa. \"Terça a domingo\" e \"ter, qua, qui, sex, sab, dom\" são o MESMO fato.",
  "",
].join("\n");

function naturezaDaEntrega(tipo: string | null): string {
  const t = (tipo ?? "").trim().toLowerCase();
  const interno = !reguaSeAplicaA(tipo) || TIPOS_DE_PLANEJAMENTO.includes(t);
  if (interno) {
    return [
      `NATUREZA DESTA ENTREGA: DOCUMENTO DE TRABALHO INTERNO (tipo "${tipo}").`,
      "Isto é um plano, uma análise ou um relatório da agência — NÃO é uma peça de",
      "comunicação e NÃO deve virar post. Avalie como se avalia um plano: o raciocínio",
      "se sustenta? as recomendações decorrem do que foi levantado? o que ele afirma",
      "sobre o cliente e o mercado tem base?",
      "NÃO reprove por não ser 'entrega final', por não ter legenda, por não estar",
      "pronto para publicar, nem por listar decisões que ainda dependem do cliente —",
      "nomear o que falta é a função de um documento de planejamento, não um defeito.",
    ].join("\n");
  }
  return [
    `NATUREZA DESTA ENTREGA: PEÇA DE COMUNICAÇÃO (tipo "${tipo}").`,
    "Isto vai chegar ao cliente e falar com o público dele. Avalie como peça pronta:",
    "ela pode ser publicada como está?",
  ].join("\n");
}

function semArbitro(motivo: MotivoDeNaoAuditar): QualityVerdict {
  return { verdict: "nao_auditado", issues: [], note: MOTIVO_EM_PALAVRAS[motivo], motivo };
}

/** Lê o veredito do JSON do modelo SEM inventar o benefício da dúvida.
 *  Qualquer coisa que não seja um dos dois rótulos conhecidos é resposta que
 *  não dá para interpretar — e não interpretar é `nao_auditado`, não `pass`. */
function lerVeredito(bruto: unknown): "aprovado" | "reprovado" | null {
  if (typeof bruto !== "string") return null;
  const v = bruto.trim().toLowerCase();
  if (v === "flag" || v === "reprovado" || v === "fail") return "reprovado";
  if (v === "pass" || v === "aprovado" || v === "ok") return "aprovado";
  return null;
}

export async function auditDeliverable(input: {
  deptLabel: string;
  title: string;
  content: string;
  brandContext: string;
  /** Diretrizes ATUAIS de mercado (Radar Dioli) — a Qualidade audita contra elas. */
  marketGuidelines?: string;
  /** O estado da leitura do feed, vindo da própria `SinteseDoFeed` — não de
   *  farejar substring no contexto. Ausente = fluxo que não leu feed nenhum. */
  feed?: { lida: boolean; posts: number };
  /** Qual modelo ESCREVEU a peça. O árbitro é escolhido para não ser ele. */
  provedorDoAutor?: string | null;
  workspaceId: string;
  /** DE QUEM é a conta desta auditoria. A Qualidade custa dinheiro e o custo é
   *  do cliente auditado — sem isto ele caía em "gasto sem dono". */
  clientId?: string | null;
  projectId?: string | null;
  /**
   * O `type` do entregável (`social`, `campaign`, `report`, …).
   *
   * Decide se a régua determinística de texto se aplica: documento em que a
   * agência ANALISA (estratégia, relatório) não é peça que fala com o mercado, e
   * a régua reprovaria a análise correta de um concorrente pela mesma forma que
   * reprova a peça ruim. Ver `TIPOS_DE_DOCUMENTO_INTERNO`.
   *
   * **Omitir NÃO isenta.** Ausência de informação não é informação: chamador que
   * não declara o tipo é tratado como peça de comunicação, que é o lado seguro.
   */
  tipoDaEntrega: string | null;
}): Promise<QualityVerdict> {
  // ── SEM SABER O QUE JULGA, O JUIZ NÃO JULGA (24/08/2026) ──────────────────
  //
  // Medido no piloto: a Qualidade REPROVOU o "Posicionamento" — um entregável
  // do tipo `strategy` — com o parecer *"a auditoria de qualidade exige a
  // entrega REAL (peças prontas), não documentação de planejamento"*. Ou seja:
  // reprovou um documento de estratégia por ele ser um documento de estratégia.
  //
  // O prompt nunca dizia QUE TIPO de artefato estava na mesa. Os cinco
  // critérios são todos de peça (tom, promessa, número inventado, clichê,
  // mercado), e o juiz preencheu a lacuna inventando a régua que faltava.
  //
  // A casa SABE fazer essa distinção — `TIPOS_DE_DOCUMENTO_INTERNO` isenta
  // `strategy` e `analytics` da régua determinística desde antes. A distinção é
  // que não chegava ao juiz de IA. Régua certa, informação faltando.
  //
  // Agora o tipo é OBRIGATÓRIO na assinatura (o compilador pega quem esquecer)
  // E conferido em execução (o compilador não pega `null` vindo do banco).
  // Faltando, a peça sai como `nao_auditado` — que NUNCA é aprovação e segura a
  // apresentação. É o padrão da casa: obrigar quem chama a responder a
  // pergunta, em vez de deixar o silêncio virar um palpite.
  if (!(input.tipoDaEntrega ?? "").trim()) return semArbitro("tipo_nao_declarado");
  // ── PRIMEIRO A TRAVA, DEPOIS A OPINIÃO ────────────────────────────────────
  //
  // Roda antes de `escolherArbitro` e antes de qualquer chamada: reprovação
  // determinística não custa uma chamada de IA e não pode ser "convencida" por
  // um modelo bem-humorado. O que ela pega, o juiz nem chega a ver.
  //
  // O TÍTULO entra junto com o corpo. Ele vira o `name` do `Deliverable` e é o
  // primeiro campo que o cliente lê no portal — foi por conferir só o corpo que
  // "Pacote Noiva R$ 1.000" atravessou o piso de verdade até 05/08.
  if (reguaSeAplicaA(input.tipoDaEntrega)) {
    const regua = conferirReguaDoTexto(`${input.title}\n\n${input.content}`);
    if (!regua.aprovado) {
      const issues = resumirAlegacoes(regua.violacoes);
      return {
        verdict: "reprovado",
        issues,
        // O parecer diz que a recusa é de CÓDIGO. Sem isso, quem lê o registro
        // atribui a um modelo o que nenhum modelo decidiu — e passa a discutir
        // com o juiz uma recusa que não é dele.
        note: `Reprovada pela régua de texto da casa (conferência determinística, sem IA): ${regua.violacoes.length} afirmação(ões) que nada sustenta.`,
        // A régua é CÓDIGO da casa. É independente do autor pela construção —
        // nenhum modelo a convence — e por isso não pode ser contada como
        // "autojulgada" na tela. `arbitro` fica ausente de propósito: não houve
        // provedor nenhum, e inventar um nome aqui seria mentir sobre o custo.
        arbitroIndependente: true,
      };
    }
  }

  const autor = (input.provedorDoAutor ?? "claude").trim().toLowerCase();
  const fila = filaDeArbitros(autor);
  // O critério do feed real (pedido do CEO, 04/08/2026) tem TRÊS estados, e a
  // versão anterior só enxergava dois porque decidia farejando o texto do
  // contexto (`includes("FEED REAL DO CLIENTE")`). Conta conectada com ZERO
  // posts produz exatamente essa substring SEM a marca "feed não lido" — e o
  // juiz era perguntado "isto conversa com o feed real do cliente?" sobre um
  // feed que não existe. Pergunta sem referente só pode ser respondida por
  // invenção. Agora o estado vem do booleano da síntese.
  const estado: "lido" | "semPosts" | "naoLido" | "desconhecido" =
    !input.feed ? "desconhecido"
    : !input.feed.lida ? "naoLido"
    : input.feed.posts > 0 ? "lido"
    : "semPosts";

  const criterioDoFeed = estado === "lido"
    ? ` (6) a peça CONVERSA com o FEED REAL DO CLIENTE descrito no contexto — mesma família de tom, tema e formato do que ele já publica, sem destoar nem copiar?`
    : "";
  const avisoSemFeed =
    estado === "naoLido"
      ? `\nATENÇÃO: o feed do cliente NÃO foi lido nesta produção. NÃO avalie aderência ao feed e NÃO penalize a peça por isso.`
      : estado === "semPosts"
        ? `\nATENÇÃO: a conta do cliente está conectada e NÃO tem nenhum post publicado — não existe feed contra o qual comparar. NÃO avalie aderência ao feed, NÃO penalize a peça por isso e NÃO descreva um estilo anterior que não existe.`
        : "";
  const promptDoJuiz = {
    system: "Você é o agente de Qualidade de uma agência de marketing brasileira. Audite a entrega abaixo com rigor — NÃO reescreva, só avalie. Responda SOMENTE com JSON válido.",
    user: `${naturezaDaEntrega(input.tipoDaEntrega)}

ENTREGA (${input.deptLabel}) — "${input.title}":
${input.content}

CONTEXTO DA MARCA:
${input.brandContext}
${input.marketGuidelines ? `\n${input.marketGuidelines}\n` : ""}
Verifique: (1) está no tom e no segmento certos? (2) tem promessa falsa ou garantia irreal? (3) inventa número/preço/dado que não foi fornecido? (4) tem clichê vazio ou erro grave? (5) está alinhada às diretrizes ATUAIS de mercado acima (quando houver)?${criterioDoFeed}${avisoSemFeed}
${LIMITE_DO_JUIZ}
Responda JSON: {"verdict":"pass"|"flag","issues":["problema 1","problema 2"],"note":"1 frase de parecer"}. verdict="flag" só se houver problema real.`,
  };

  /** Uma tentativa contra UM árbitro nomeado. `apenasOPreferido` é a trava:
   *  sem ela `generate` cai na ordem da casa — que começa no autor. */
  async function chamarArbitro(candidato: AiProvider): Promise<
    | { tipo: "ok"; provider: AiProvider; data: Record<string, unknown> }
    | { tipo: "falha"; erro: string }
    | { tipo: "timeout" }
  > {
    const chamada = generate({
      ...promptDoJuiz,
      maxTokens: 500,
      workspaceId: input.workspaceId,
      preferredProvider: candidato,
      // ⚠️ A LINHA QUE CONSERTA O FAROL 27. `preferredProvider` sozinho é
      // preferência: quando o juiz falha, `generate` anda na fila da casa e a
      // fila da casa começa no `claude` — o autor. Com `apenasOPreferido`, a
      // chamada é COM ESTE ÁRBITRO OU NENHUM. Quem anda na fila, agora, é este
      // laço aqui, e esta fila não contém o autor.
      apenasOPreferido: true,
      agentId: "quality-auditor",
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
    });

    // O timeout é do AUDITOR, não do provedor: provedor que pendura a conexão
    // seguraria a produção inteira, e "a produção travou" não é um veredito.
    let estourou = false;
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      chamada,
      new Promise<null>((resolve) => {
        relogio = setTimeout(() => { estourou = true; resolve(null); }, AUDIT_TIMEOUT_MS);
      }),
    ]);
    if (relogio) clearTimeout(relogio);
    // Uma chamada abandonada que rejeita depois viraria unhandled rejection.
    void Promise.resolve(chamada).catch(() => { /* já respondemos */ });

    if (estourou || !result) return { tipo: "timeout" };
    if (!result.ok) return { tipo: "falha", erro: result.error };
    return { tipo: "ok", provider: result.provider, data: result.data as Record<string, unknown> };
  }

  try {
    // ── ANDAR NA FILA, E SÓ ENTÃO RETER ──────────────────────────────────────
    //
    // Ordem das decisões, e ela importa:
    //   1. tenta cada árbitro independente, um por um (cada um já com as
    //      re-tentativas de espera crescente de `generate` por dentro);
    //   2. se TODOS caíram por limite de taxa, espera e dá outra volta na fila
    //      inteira — 429 é transitório por definição, e desistir na primeira
    //      recusa por volume é desistir de um juiz que está vivo;
    //   3. acabaram as voltas: RETÉM, com o motivo real.
    //
    // O que NUNCA acontece em nenhum ramo: cair no autor.
    let ultimaFalha: string | null = null;
    let houve429 = false;
    let houveTimeout = false;
    // Alguém RESPONDEU ilegível em QUALQUER ponto da fila — não só por último.
    // `ultimaFalha` sozinha é memória de um item só: com três árbitros, o
    // "resposta vazia" do DeepSeek era apagado pelo "JSON inválido" do Gemini,
    // e a retenção saía carimbada `ia_indisponivel` — "o provedor caiu" — sobre
    // dois provedores que estavam de pé e falando. Motivo errado manda o dono
    // investigar a coisa errada.
    let houveIlegivel = false;
    // Alguma falha da volta merece outra volta? Ver `mereceOutraVolta`.
    let valeOutraVolta = false;
    let todosSemChave = fila.length > 0;

    for (let volta = 0; volta < VOLTAS_DO_ARBITRO; volta++) {
      if (volta > 0) {
        // Só vale outra volta se o que derrubou a fila for coisa que o TEMPO
        // conserta: volume (429), soluço de formato (corpo vazio / JSON
        // quebrado), timeout, rede. Provedor sem chave não ganha chave
        // esperando — esse continua sem segunda volta.
        //
        // A versão anterior escrevia aqui "resposta ilegível não melhora", e
        // isso é falso pelo próprio motor da casa: `generate.isTransientError`
        // trata "vazia" e "json" como transitórios e repete. A 7ª volta de
        // cliente oculto pagou a conta — DeepSeek vazio + Gemini JSON inválido,
        // uma volta só, peça retida sem segunda chance.
        if (!valeOutraVolta) break;
        await new Promise((r) => setTimeout(r, ESPERA_ENTRE_VOLTAS_MS * volta));
      }

      for (const candidato of fila) {
        const tentativa = await chamarArbitro(candidato);

        if (tentativa.tipo === "timeout") {
          houveTimeout = true; todosSemChave = false; valeOutraVolta = true; continue;
        }
        if (tentativa.tipo === "falha") {
          ultimaFalha = tentativa.erro;
          if (eLimiteDeTaxa(tentativa.erro)) houve429 = true;
          if (eRespostaIlegivel(tentativa.erro)) houveIlegivel = true;
          if (mereceOutraVolta(tentativa.erro)) valeOutraVolta = true;
          if (!eFaltaDeChave(tentativa.erro)) todosSemChave = false;
          continue;
        }

        // ── A CONFERÊNCIA DE CINTO, MESMO COM A TRAVA POSTA ──────────────────
        // `apenasOPreferido` já impede a queda no autor. Esta linha existe
        // porque a trava anterior desta casa também "já impedia" — e não
        // impedia. Se o provedor que respondeu for o autor, o julgamento não
        // conta como independente, e aprovação NUNCA sai daqui.
        const independente = tentativa.provider !== autor;

        const veredito = lerVeredito(tentativa.data.verdict);
        // Resposta que não traz veredito legível NÃO é aprovação. Este `return`
        // é o conserto do `d.verdict === "flag" ? "flag" : "pass"` antigo, onde
        // `{}`, `null` e "talvez" todos viravam aprovação silenciosa.
        // JSON válido, veredito inelegível. É soluço de formato como qualquer
        // outro: próximo árbitro AGORA, e a fila inteira de novo depois.
        if (veredito === null) {
          todosSemChave = false; ultimaFalha = "resposta ilegível";
          houveIlegivel = true; valeOutraVolta = true; continue;
        }

        const issues = Array.isArray(tentativa.data.issues)
          ? tentativa.data.issues.filter((x): x is string => typeof x === "string") : [];
        const note = typeof tentativa.data.note === "string" ? tentativa.data.note : "";

        // ── DEGRADAÇÃO ASSIMÉTRICA, DE PROPÓSITO ─────────────────────────────
        //   • REPROVAÇÃO do próprio autor continua valendo. Ela bloqueia, e um
        //     problema apontado pelo próprio modelo é um problema — jogá-la
        //     fora seria trocar um freio real por pureza de método. Mas agora
        //     ela sai CARIMBADA como `autojulgado`, e a tela diz isso.
        //   • APROVAÇÃO do próprio autor não existe. Vira `nao_auditado` e
        //     RETÉM a apresentação (`marcos.apresentar`).
        if (!independente && veredito === "aprovado") {
          return { ...semArbitro("juiz_nao_imparcial"), issues, arbitro: tentativa.provider, arbitroIndependente: false };
        }
        return { verdict: veredito, issues, note, arbitro: tentativa.provider, arbitroIndependente: independente };
      }
    }

    // Fila esgotada. A peça NÃO é julgada — é retida, com o motivo real.
    if (houve429) return semArbitro("limite_de_taxa");
    if (todosSemChave || fila.length === 0) return semArbitro("juiz_nao_imparcial");
    if (houveTimeout && ultimaFalha === null) return semArbitro("timeout");
    // `houveIlegivel`, não `ultimaFalha === "resposta ilegível"`: o motivo é
    // sobre a FILA INTEIRA, e não sobre quem falou por último.
    if (houveIlegivel) return semArbitro("resposta_invalida");
    return semArbitro("ia_indisponivel");
  } catch {
    return semArbitro("erro");
  }
}
