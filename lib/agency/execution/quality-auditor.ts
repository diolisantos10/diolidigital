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
  | "juiz_nao_imparcial";

export interface QualityVerdict {
  verdict: VereditoDaQualidade;
  issues: string[];
  note: string;
  /** Preenchido SOMENTE em `nao_auditado`. Presente = ninguém olhou a peça. */
  motivo?: MotivoDeNaoAuditar;
  /** Quem de fato julgou. Ausente = ninguém julgou. */
  arbitro?: AiProvider;
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
  const doAutor = (autor ?? "claude").trim().toLowerCase();
  return FILA_DE_ARBITROS.find((p) => p !== doAutor) ?? "openai";
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

const MOTIVO_EM_PALAVRAS: Record<MotivoDeNaoAuditar, string> = {
  ia_indisponivel: "NÃO AUDITADA: a IA da Qualidade estava indisponível — nenhum árbitro olhou esta peça.",
  timeout: "NÃO AUDITADA: a IA da Qualidade não respondeu a tempo — nenhum árbitro olhou esta peça.",
  erro: "NÃO AUDITADA: a auditoria falhou com erro — nenhum árbitro olhou esta peça.",
  resposta_invalida: "NÃO AUDITADA: a IA da Qualidade respondeu fora do formato — o parecer não pôde ser lido.",
  juiz_nao_imparcial: "NÃO AUDITADA: o único modelo disponível para julgar é o MESMO que escreveu a peça — não existe aprovação independente aqui.",
  tipo_nao_declarado: "NÃO AUDITADA: quem pediu a auditoria não declarou o TIPO da entrega — sem saber se julga um post ou um plano, o juiz inventaria a régua.",
};

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
      };
    }
  }

  const arbitro = escolherArbitro(input.provedorDoAutor);
  const autor = (input.provedorDoAutor ?? "claude").trim().toLowerCase();
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
  try {
    const chamada = generate({
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
      maxTokens: 500,
      workspaceId: input.workspaceId,
      preferredProvider: arbitro,
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
    void Promise.resolve(chamada).catch(() => { /* já respondemos nao_auditado */ });

    if (estourou || !result) return semArbitro("timeout");
    if (!result.ok) return semArbitro("ia_indisponivel");

    const d = result.data as Record<string, unknown>;
    const veredito = lerVeredito(d.verdict);
    // Resposta que não traz veredito legível NÃO é aprovação. Este `return` é o
    // conserto do `d.verdict === "flag" ? "flag" : "pass"` antigo, onde `{}`,
    // `null` e "talvez" todos viravam aprovação silenciosa.
    if (veredito === null) return semArbitro("resposta_invalida");

    const issues = Array.isArray(d.issues) ? d.issues.filter((x): x is string => typeof x === "string") : [];
    const note = typeof d.note === "string" ? d.note : "";

    // ── QUEM REALMENTE JULGOU ────────────────────────────────────────────────
    // `preferredProvider` é preferência, não trava: sem a chave do árbitro,
    // `generate` volta para a fila e o autor pode ter se auto-aprovado.
    //
    // A degradação é ASSIMÉTRICA de propósito:
    //   • REPROVAÇÃO continua valendo. Ela bloqueia, e um problema apontado pelo
    //     próprio modelo é um problema — jogá-la fora seria trocar um freio real
    //     por pureza de método.
    //   • APROVAÇÃO vira `nao_auditado`. Não é reprovação, mas também não é
    //     aprovação: ninguém independente olhou. Fica declarada e contável, e
    //     some do "aprovado pela Qualidade".
    //
    // ⚠️ ATUALIZAÇÃO DE 24/08/2026 — esta linha dizia "não bloqueia", e deixou
    // de ser verdade por ordem do Diretor Geral: `nao_auditado` passou a RETER a
    // apresentação (`marcos.apresentar`), porque peça que ninguém olhou não pode
    // chegar ao cliente. O comentário está corrigido aqui porque doutrina que
    // descreve o comportamento antigo é pior que doutrina nenhuma: ela ensina
    // errado com a autoridade de estar escrita no código.
    //
    // CONSEQUÊNCIA MEDIDA, e é decisão de gente: com UM só provedor de IA
    // conectado, todo especialista que escreve em `claude` se auto-aprovaria, e
    // agora fica retido. No piloto de 24/08 isso foi 5 de 7 entregas. Não há
    // conserto em código — exige uma segunda chave de provedor.
    if (result.provider === autor && veredito === "aprovado") {
      return { ...semArbitro("juiz_nao_imparcial"), issues, arbitro: result.provider };
    }
    return { verdict: veredito, issues, note, arbitro: result.provider };
  } catch {
    return semArbitro("erro");
  }
}
