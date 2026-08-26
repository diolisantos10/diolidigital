// ─── Prospect SDR Engine V2 ───────────────────────────────────────────────────
// Extends the conversational briefing engine with:
// 1. Identity capture (name / business / e-mail / WhatsApp) before scope questions
// 2. SDR commercial intelligence: objection detection, budget parsing, negotiation
// 3. Restaurant-aware consultative questions
// 4. Submission gate: identity + service complete, no unresolved price objection
// ─────────────────────────────────────────────────────────────────────────────

import type { ConvState, ConvMessage, BriefingScope } from "./briefing-conversation";
import { nomeDoNegocioNoTexto } from "./comercial/nome-do-negocio-no-texto";
import {
  LIMITE_DE_INSISTENCIA, O_QUE_A_PERGUNTA_COLHE,
  acrescentarRespostaSemEncaixe, reformular,
} from "./comercial/pergunta-sem-encaixe";
import { emptyScope, emptyEstimate } from "./briefing-conversation";
import { computeEstimate } from "./live-calculator";
import {
  ehAvisoDeAnexo, ehOfertaDeDocumento, recadoDeRecebimento, RETOMADA_DA_PERGUNTA,
} from "./anexo-nao-e-resposta";
import { emailValido, whatsappValido } from "./comercial/contato-do-lead";
import { lerBasicosOperacionais, reformularBasicosOperacionais } from "./comercial/resposta-que-responde";
import { emailNoTexto } from "./comercial/contato-do-lead";
import {
  isYes, parseInitialMessage, inferAnsweredQIds, mergeScopeDelta,
  buildAcknowledgment, detectNegotiation, getNextQuestion,
  type QuestionDef,
} from "./question-engine";
import {
  emptySdrState, parseBudgetAmount, detectObjectionTypes,
  isRestaurantSegment, evaluateBudgetFit, detectNegotiationStage,
  buildPriceObjectionReply, buildConsultativeFrequencyQuestion,
  buildBudgetQuestion, canSubmitProposal, getSubmissionBlockReason, computeQualificationScore,
  type SDRAgentState, type BudgetSignal,
} from "./sdr-agent";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProspectConvState {
  conv: ConvState;
  sdr: SDRAgentState;
}

// ── Identity helpers ──────────────────────────────────────────────────────────

// 16/08/2026: quando a resposta à pergunta de identidade não bate nenhum
// padrão de nome/negócio (ex.: a pessoa cola um e-mail), o parser antigo
// gravava a resposta CRUA como businessName/prospectName — um e-mail virava
// "nome do negócio" na tela do CEO. Ausência de informação não é informação:
// se a resposta é claramente um canal de contato (e-mail, @arroba, telefone),
// ela nunca deve ser usada como identidade. Ver `contato-do-lead.ts` — o
// leitor único de contato — para os mesmos validadores.
function respostaEhCanalDeContato(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (emailValido(t)) return true;
  // ── O E-MAIL NO MEIO DA FRASE ENTRA NA MESMA TRAVA (6ª rodada) ────────────
  //
  // A trava de 16/08 perguntava se a resposta INTEIRA era um canal de contato.
  // Achado por régua nesta rodada (`a-casa-ouve-o-que-ja-foi-dito.test.ts`):
  // *"Pode mandar tudo pro marina@cantina.invalid, tá?"* não é um e-mail
  // inteiro — então passava, caía no fallback da resposta crua, e a FRASE
  // INTEIRA, com o endereço dentro, virava `businessName`.
  //
  // É o defeito de 16/08 entrando pela porta do lado: um e-mail na tela do CEO
  // como nome do negócio, e — pior que naquele dia — PII gravada no campo que
  // viaja para dentro do prompt do modelo.
  //
  // A regra vale só para o FALLBACK da resposta crua: `nomeDoNegocioNoTexto`
  // continua livre para achar um nome de verdade numa frase que também traz um
  // e-mail. O que morre é o palpite, não a leitura.
  if (emailNoTexto(t)) return true;
  if (/^@/.test(t)) return true;
  if (/^[\d\s()+.-]+$/.test(t) && whatsappValido(t)) return true;
  return false;
}

function parseProspectNameBiz(text: string): { prospectName?: string; businessName?: string } {
  let prospectName: string | undefined;

  // ── Business name ─────────────────────────────────────────────────────────
  // A lista de padrões NÃO mora mais aqui: ela era uma de DUAS cópias (a outra
  // em `question-engine.parseInitialMessage`), e as duas divergiam. Leitor
  // único em `comercial/nome-do-negocio-no-texto.ts` — ver o caso Farol 27.
  const businessName = nomeDoNegocioNoTexto(text);

  // ── Person name (skip greetings and words identical to business name) ──────
  const GREETINGS = /^(oi|olá|ola|hey|hi|hello|bom|boa|caro|cara|prezado|prezada)$/i;
  const namePatterns = [
    /\b(?:sou (?:a |o )?|me chamo |meu nome [eé] |chamo-me )([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /^([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)\s*[,–-]/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) {
      const candidate = m[1].trim();
      if (!GREETINGS.test(candidate) && candidate.toLowerCase() !== businessName?.toLowerCase()) {
        prospectName = candidate;
      }
      break;
    }
  }

  // ── Fallback: bare answer to "qual é o seu nome?" ─────────────────────────
  // When neither a business nor a person name matched a pattern, but the user
  // typed a short proper-noun-like answer (e.g. just "Pedro"), treat it as the
  // person's name. The welcome explicitly asks for the name first, so a short
  // standalone answer is far more likely a name than a service request. This
  // stops the "I didn't understand, repeating the question" loop.
  if (!businessName && !prospectName) {
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/);
    const SERVICE_OR_INTENT =
      /\b(redes?|social|m[ií]dia|tr[áa]fego|ads?|an[úu]ncio|marca|logo|identidade|posts?|stories|reels?|quero|preciso|gostaria|busco|procuro)\b/i;
    if (
      words.length >= 1 && words.length <= 2 &&
      /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*( [A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*)?$/.test(trimmed) &&
      !SERVICE_OR_INTENT.test(trimmed) &&
      !GREETINGS.test(words[0])
    ) {
      prospectName = trimmed;
    }
  }

  return { prospectName, businessName };
}

// Extract a business name hint from uploaded file names (weak signal — used only when
// text-based detection finds nothing). Takes words from the START of the filename
// until hitting a descriptor/filler word so that:
//   "Marca_Exemplo_Brand_Book_v2.pdf" → "Marca Exemplo"
//   "marca_exemplo_brand_book.pdf" → "Marca Exemplo"
//   "apresentacao_institucional.pdf" → (ignored — "apresentacao" is a filler-like word)
function extractBizFromFileNames(fileNames: string[]): string | undefined {
  const FILLER = /^(brand|book|guide|logo|identidade|visual|manual|marca|proposta|briefing|documento|arquivo|file|doc|presentation|slide|deck|kit|pack|template|mockup|reference|ref|final|v\d+|original|compressed|revised?|revisao|fiel|draft|version|copy|master|update|new|old|complete|full|apresent\w*|institucional|completo|oficial|\d+)$/i;
  for (const name of fileNames) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim();
    const words = base.split(/\s+/);
    // Take words from the START until hitting a filler/descriptor keyword
    const nameWords: string[] = [];
    for (const w of words) {
      if (w.length < 2 || FILLER.test(w)) break;
      nameWords.push(w);
    }
    if (nameWords.length >= 1) {
      const candidate = nameWords
        .slice(0, 4)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      if (candidate.length >= 3) return candidate;
    }
  }
  return undefined;
}

// ── Identity question IDs ─────────────────────────────────────────────────────

function inferProspectAnsweredQIds(scope: BriefingScope): string[] {
  const base = inferAnsweredQIds(scope);
  if (scope.prospectName && scope.businessName) base.push("prospect_name_biz");
  return [...new Set(base)];
}

// ── Identity question definitions ─────────────────────────────────────────────

// NOTE: e-mail and WhatsApp are NEVER collected in the conversation. They are
// captured automatically when the prospect signs in with Google after confirming
// their request (see PublicBriefingRoom → GoogleSignInButton). Asking for them in
// the chat caused the model to confuse business descriptions with email inputs —
// the bug is eliminated by removing the questions entirely, not by patching them.
const IDENTITY_QUESTIONS: QuestionDef[] = [
  {
    id: "prospect_name_biz",
    when: (s) => !s.scope.prospectName || !s.scope.businessName,
    text: (s) => {
      const biz  = s.scope.businessName;
      const name = s.scope.prospectName;
      if (biz && !name) {
        return `Entendi que estamos falando do **${biz}**! E qual é o seu nome?`;
      }
      if (name && !biz) {
        const first = name.split(" ")[0];
        return `Prazer, ${first}! E qual é o nome do seu negócio?`;
      }
      return "Para começar, qual é o seu nome e o nome do seu negócio?";
    },
    parse: (answer, s) => {
      let { prospectName, businessName } = parseProspectNameBiz(answer);
      // "Negócio = Nome" fix: a bare multi-word proper name given while we still
      // need the person's name (welcome asks the NAME first) is the person, not
      // the business — the old TitleCase rule wrongly captured it as businessName.
      const hasBizSignal = /chamad[ao]|neg[óo]cio|empresa|loja\b|marca\b|restaurante|bar\b|caf[eé]|est[úu]dio|studio|ag[êe]ncia|cl[íi]nica|é\s+(o|a)\s|sou\s+d[aeo]/i.test(answer);
      if (businessName && !prospectName && !s.scope.prospectName && !hasBizSignal && businessName.trim().split(/\s+/).length >= 3) {
        prospectName = businessName;
        businessName = undefined;
      }
      // 16/08/2026: se a resposta crua é um canal de contato (e-mail, @arroba,
      // telefone), ela NUNCA vira identidade — nem nome, nem negócio. Ver
      // `respostaEhCanalDeContato` acima e o incidente no cabeçalho deste bloco.
      const naoUsarComoIdentidade = respostaEhCanalDeContato(answer);
      return {
        ...(prospectName ? { prospectName } : {}),
        ...(businessName
          ? { businessName }
          // If we already know the businessName and only asked for a person name,
          // treat the raw answer as the prospect name rather than the business name
          // — a não ser que a resposta seja um canal de contato (e-mail/@/telefone):
          // aí não vira nome nenhum, e a pergunta continua pendente.
          : s.scope.businessName && !naoUsarComoIdentidade
          ? { prospectName: prospectName ?? answer.trim() }
          : !prospectName && !naoUsarComoIdentidade
          ? { businessName: answer.trim() }
          : {}),
      };
    },
  },
];

/** A última coisa que o cliente disse. É dela que sai o "o que ainda falta" da
 *  reformulação — reler o histórico evita carregar mais um campo de estado só
 *  para lembrar de uma frase que já está guardada. */
function ultimaFalaDoCliente(state: ConvState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i]!.role === "client") return state.messages[i]!.text;
  }
  return "";
}

// ── Question ordering ─────────────────────────────────────────────────────────

function getNextProspectQuestion(state: ConvState): QuestionDef | null {
  for (const q of IDENTITY_QUESTIONS) {
    if (!state.answeredQIds.includes(q.id) && q.when(state)) return q;
  }
  return getNextQuestion(state);
}

// ── SDR-aware question text override ─────────────────────────────────────────

function buildSDRQuestionText(q: QuestionDef, state: ConvState, sdr: SDRAgentState): string {
  // ── A MESMA FRASE NUNCA DUAS VEZES SEGUIDAS ────────────────────────────────
  // Quando a pergunta já foi feita e está voltando, o texto MUDA. Repetir
  // palavra por palavra é o que faz a pessoa concluir que não foi lida — e foi
  // exatamente o que ela leu seis vezes no caso Farol 27. A reformulação admite
  // que a casa não entendeu e abre uma saída explícita para quem quer algo que
  // a casa não tem na prateleira. Ver `comercial/pergunta-sem-encaixe.ts`.
  if ((state.perguntasFeitas?.[q.id] ?? 0) >= 1) {
    // `operacao_basica` pede TRÊS coisas, então a reformulação dela não é uma
    // frase fixa: ela nomeia o que a resposta anterior NÃO trouxe. A leitura
    // sai do mesmo lugar que decidiu não preencher o campo, para as duas nunca
    // discordarem sobre o que ficou faltando.
    if (q.id === "operacao_basica") {
      return reformularBasicosOperacionais(lerBasicosOperacionais(ultimaFalaDoCliente(state)));
    }
    const outraFormulacao = reformular(q.id);
    if (outraFormulacao) return outraFormulacao;
  }
  switch (q.id) {
    case "posts_per_week":
      return buildConsultativeFrequencyQuestion(state.scope);
    case "budget_range":
      return buildBudgetQuestion(state.scope, state.estimate);
    default:
      return q.text(state);
  }
}

// ── initProspectConvState ─────────────────────────────────────────────────────

/**
 * O que a pessoa já declarou na PORTA (`LeadNaPorta`), antes de a conversa
 * abrir. `null` é o caminho legítimo de quem clicou "Prefiro não deixar
 * contato agora" — nesse caso nada muda e o SDR pergunta o nome, como sempre.
 */
export type ContatoInicial = { nome?: string; email?: string; whatsapp?: string } | null;

// ── O DADO DA PORTA TEM DE ENTRAR NO ESCOPO ANTES DO PRIMEIRO TURNO ─────────
//
// 23/08/2026, piloto ao vivo: o CEO preencheu nome, e-mail e WhatsApp na porta,
// a conversa abriu e a PRIMEIRA fala da consultora foi *"Para começar, qual é o
// seu nome e o nome do seu negócio?"*. Palavras dele: *"Primeiro erro, já pediu
// o meu nome novamente, se eu dei meu nome na página de entrada."* O painel da
// direita confirmava a causa: "Nome: aguardando…".
//
// A porta capturava e não entregava. `contatoDaPorta` existia em
// `app/briefing/page.tsx` desde 16/08, mas só era lido no ENVIO final do
// briefing — nunca entrava no escopo que abre a conversa. É a "seta faltando"
// que esta casa já conhece (D-003): o dado existe, o consumidor existe, e não
// há ligação entre os dois.
//
// Por que consertar AQUI e não no prompt do SDR: a regra "não perguntar o que
// já foi respondido" já está escrita no prompt — ela não falhou, ela nunca foi
// alimentada. Prompt é aviso; o escopo é a trava. Semeando o escopo, as duas
// telas obedecem de graça: o painel mostra o nome em vez de "aguardando…", e a
// pergunta de identidade (`prospect_name_biz`) passa a pedir SÓ o que falta.
export function initProspectConvState(contatoInicial?: ContatoInicial): ProspectConvState {
  const nome = contatoInicial?.nome?.trim() || undefined;
  const primeiroNome = nome?.split(/\s+/)[0];

  const scope = emptyScope();
  if (nome) scope.prospectName = nome;
  // O WhatsApp desce junto — ele já é campo legítimo do escopo da conversa
  // (`app/api/sdr/chat/route.ts` o mantém; é o `prospectEmail` que ele apaga).
  //
  // ⛔ O E-MAIL NÃO DESCE, e isso é regra da casa, não esquecimento: o escopo
  // inteiro é serializado para dentro do prompt do modelo (`route.ts:118` —
  // "dados já captados") e a doutrina daqui é que e-mail NUNCA trafega pelo
  // caminho do chat. Ele não faz falta: o SDR é proibido de pedir e-mail, e no
  // envio final quem manda é o contato da porta (`app/briefing/page.tsx`).
  // Mandar PII que ninguém vai usar é custo sem contrapartida.
  const whatsapp = contatoInicial?.whatsapp?.trim();
  if (whatsapp) scope.prospectPhone = whatsapp;

  // A saudação é a primeira coisa que a pessoa lê — se ela pedir um dado que
  // acabou de ser dado, nenhuma correção adiante apaga a impressão de que
  // ninguém prestou atenção. Sem nome (porta pulada), o texto original vale.
  const texto = primeiroNome
    ? `Olá, ${primeiroNome}! Seja bem-vindo(a) à Dioli Studio.\n\nSou sua consultora de orçamento. Vou te ajudar a montar uma proposta personalizada para o seu negócio — com estimativa de investimento atualizada em tempo real.\n\n**Para começar, qual é o nome do seu negócio?**`
    : "Olá! Seja bem-vindo(a) à Dioli Studio.\n\nSou sua consultora de orçamento. Vou te ajudar a montar uma proposta personalizada para o seu negócio — com estimativa de investimento atualizada em tempo real.\n\n**Para começar, qual é o seu nome e o nome do seu negócio?**";

  const welcome: ConvMessage = {
    id: "welcome",
    role: "assistant",
    text: texto,
    createdAt: new Date().toISOString(),
  };
  const conv: ConvState = {
    messages: [welcome],
    scope,
    answeredQIds: [],
    isFirstMessage: true,
    estimate: emptyEstimate(),
    canSubmit: false,
  };
  return { conv, sdr: emptySdrState() };
}

// ── processProspectMessage ────────────────────────────────────────────────────

export function processProspectMessage(
  text: string,
  state: ProspectConvState,
  attachmentFileNames?: string[],
): ProspectConvState {
  const { conv, sdr } = state;

  const clientMsg: ConvMessage = {
    id: `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "client",
    text,
    createdAt: new Date().toISOString(),
  };
  const withClient: ConvState = { ...conv, messages: [...conv.messages, clientMsg] };

  // ── Scope parsing ─────────────────────────────────────────────────────────
  let newScope: BriefingScope;
  let newAnswered: string[];
  let negotiationReply: string | null = null;
  let negotiationHappened = false;

  // ── Anexar arquivo não responde pergunta nenhuma ──────────────────────────
  // 16/08/2026: o recado automático de anexo entrava aqui como se fosse frase
  // digitada e virava a resposta da pergunta aberta — o nome de um PDF ocupou o
  // campo Orçamento inteiro na tela do CEO. Ver `anexo-nao-e-resposta.ts`.
  // O escopo fica intacto e a pergunta continua na fila: o conteúdo do
  // documento entra pelo caminho do SDR, que é quem sabe ler documento.
  const avisoDeAnexo = ehAvisoDeAnexo(text);
  // ── E OFERECER O DOCUMENTO TAMBÉM NÃO RESPONDE NADA ─────────────────────
  // 23/08/2026: "Posso te mandar nosso briefing em PDF, ajuda?" foi gravado
  // inteiro no campo `targetAudience` do pedido. O arquivo nem tinha chegado e
  // o público-alvo do cliente já era uma pergunta que ele fez — dado falso
  // descendo calado para a proposta. Ver `anexo-nao-e-resposta.ts`.
  const ofertaDeDocumento = ehOfertaDeDocumento(text);
  const mensagemSemResposta = avisoDeAnexo || ofertaDeDocumento;

  if (mensagemSemResposta) {
    newScope    = conv.scope;
    newAnswered = conv.answeredQIds;
  } else if (conv.isFirstMessage) {
    // ── QUEM JÁ SE IDENTIFICOU NA PORTA NÃO É ADIVINHADO OUTRA VEZ ──────────
    // 23/08/2026: o nome semeado pela porta sobrevivia à saudação e MORRIA na
    // primeira resposta — a linha de baixo partia de `emptyScope()` e jogava
    // fora tudo o que a porta tinha entregado. O painel voltava a "Nome:
    // aguardando…" e a consultora perguntava o nome no segundo turno, que é
    // exatamente o defeito que o CEO viu no primeiro. Meio conserto é conserto
    // que a pessoa ainda sente.
    const jaSabemosONome = Boolean(conv.scope.prospectName);
    const serviceDelta = parseInitialMessage(text);
    let { prospectName, businessName: bizFromText } = parseProspectNameBiz(text);
    // Negócio ≠ Nome: a bare person name (no business keyword) must not be
    // captured as the business — both parsers guess it from a TitleCase string.
    const hasBizSignal = /chamad[ao]|neg[óo]cio|empresa|loja\b|marca\b|restaurante|bar\b|caf[eé]|est[úu]dio|studio|ag[êe]ncia|cl[íi]nica|é\s+(o|a)\s|sou\s+d[aeo]/i.test(text);
    const guessedBiz = bizFromText ?? serviceDelta.businessName;
    // 3+ words with no business keyword reads as a full person name (first +
    // middle + last), not a brand — treat it as the person, ask the business next.
    //
    // ⛔ Só vale quando o nome AINDA é desconhecido. Essa regra nasceu do fato
    // de a saudação pedir o NOME primeiro; com o nome já dado na porta, a
    // saudação pediu o NEGÓCIO — e reinterpretar a resposta como nome de
    // pessoa transformaria "Padaria do João Aurora" em gente, apagando o
    // negócio e o nome verdadeiro de uma vez.
    if (guessedBiz && !prospectName && !hasBizSignal && !jaSabemosONome && guessedBiz.trim().split(/\s+/).length >= 3) {
      prospectName = guessedBiz;
      bizFromText = undefined;
      delete serviceDelta.businessName;
    }
    // Use file-name hint as a weak signal only when text detection finds nothing
    const bizFromFiles = !bizFromText && attachmentFileNames?.length
      ? extractBizFromFileNames(attachmentFileNames)
      : undefined;
    const businessName = bizFromText ?? bizFromFiles;
    // A base é o escopo QUE JÁ EXISTE, não um escopo vazio: sem porta ele é
    // vazio mesmo (nada muda para quem pulou), e com porta ele carrega o que a
    // pessoa declarou. Palpite de parser não sobrescreve declaração explícita —
    // por isso `prospectName` só entra quando ainda não sabemos o nome.
    newScope = mergeScopeDelta(conv.scope, {
      ...serviceDelta,
      ...(prospectName && !jaSabemosONome ? { prospectName } : {}),
      ...(businessName ? { businessName } : {}),
    });
    newAnswered = inferProspectAnsweredQIds(newScope);
  } else {
    const negotiation = detectNegotiation(text, conv);
    if (negotiation) {
      newScope         = mergeScopeDelta(conv.scope, negotiation.scopeDelta);
      newAnswered      = [...new Set([...conv.answeredQIds, ...inferProspectAnsweredQIds(newScope)])];
      negotiationReply = negotiation.replyText;
      negotiationHappened = true;
    } else {
      const currentQ = getNextProspectQuestion(conv);
      if (currentQ) {
        const delta    = currentQ.parse(text, conv);
        newScope       = mergeScopeDelta(conv.scope, delta);
        const inferred = inferProspectAnsweredQIds(newScope);
        const isIdentity = IDENTITY_QUESTIONS.some((q) => q.id === currentQ.id);
        // Identity questions are only marked answered once actually satisfied.
        // This prevents (a) losing the person's name when only the business was
        // parsed, and (b) storing an invalid e-mail/phone as if it were valid.
        // Non-identity questions keep the original "asked = answered" behavior.
        //
        // ── `detect_service` ENTRA NA MESMA REGRA (16/08/2026) ───────────────
        //
        // "Perguntada = respondida" é aceitável para uma pergunta de cor de
        // logo. É catastrófico para a que colhe QUAL SERVIÇO o cliente quer —
        // porque é justamente esse campo que o portão de envio exige
        // (`canSubmitProposal`: `wantsSocialMedia || wantsPaidTraffic ||
        // branding.requested`).
        //
        // O percurso medido, 8 turnos reais no Playwright: à pergunta "gestão de
        // redes, tráfego ou identidade?" o visitante respondeu **"Somos de
        // estética."** — que não nomeia serviço nenhum. A pergunta foi marcada
        // como respondida assim mesmo. No turno seguinte ele disse "Quero social
        // media: 5 posts por semana", mas a pergunta da vez já era outra
        // (`main_objective`), e a frase virou OBJETIVO. Resultado: `services`
        // vazio, escopo sem serviço, e a entrevista seguiu até o fim.
        //
        // No fim, `nextQ === null` (nada mais a perguntar) e o SDR anunciou
        // *"Tenho todas as informações que preciso"* — enquanto o portão
        // respondia "Conte o que você precisa para montarmos seu pedido". O
        // visitante fez o briefing inteiro e ficou sem botão para clicar.
        //
        // A regra desta casa já dizia o que fazer: **ausência de informação não
        // é informação.** Uma pergunta só se fecha quando colhe o dado que ela
        // existe para colher — o `when` dela é quem sabe disso. Repetir a
        // pergunta é barato; perder o lead no último passo, não.
        // ── `operacao_basica` ENTRA NA MESMA REGRA (6ª rodada) ──────────────
        //
        // Ela é OPCIONAL para o portão de envio e continua sendo — não trava o
        // briefing, e isso é ordem do Diretor Geral. O que muda é outra coisa:
        // ela deixa de se fechar por ter sido FEITA. `parse` só devolve
        // `operacao` quando a resposta carrega horário, área ou @ (o mesmo
        // leitor do piso de verdade), então `when` continua verdadeiro e a
        // pergunta volta UMA vez, reformulada, nomeando o que falta.
        //
        // Sem isto o conserto do `parse` seria meio conserto: o campo ficaria
        // corretamente vazio e a pergunta nunca mais voltaria — a casa trocaria
        // "dado errado" por "dado nenhum", calada, que é o mesmo silêncio com
        // outro rótulo.
        const exigeDadoParaFechar =
          isIdentity || currentQ.id === "detect_service" || currentQ.id === "operacao_basica";
        const stillPending = exigeDadoParaFechar && currentQ.when({ ...conv, scope: newScope });

        // ── E A INSISTÊNCIA TEM FIM (24/08/2026) ────────────────────────────
        //
        // O bloco acima nasceu certo e sem freio. "A pergunta só se fecha
        // quando colhe o dado" é a regra correta — mas ela não dizia o que
        // fazer quando o dado NÃO VEM NUNCA, porque o cliente está pedindo algo
        // que a casa não tem. E o que a fila fazia no vazio era perguntar de
        // novo. Medido na Farol 27: a MESMA frase, palavra por palavra, seis
        // turnos seguidos, engolindo objetivo, público, verba de R$ 8.000 e
        // prazo — cada um lido como tentativa de responder à pergunta do
        // serviço e descartado em silêncio ao não encaixar.
        //
        // Ninguém responde seis vezes a mesma pergunta. O escopo errado que os
        // outros defeitos produziam alguém ainda corrige; este produz um
        // cliente que fecha a aba, e a casa nunca fica sabendo por quê.
        //
        // A PROIBIÇÃO e a INSTRUÇÃO GÊMEA andam juntas, e as duas estão aqui:
        // depois de `LIMITE_DE_INSISTENCIA` tentativas a pergunta NÃO é feita
        // outra vez — e, no lugar dela, a resposta crua do cliente é gravada
        // como lacuna e a conversa AVANÇA. Ver `comercial/pergunta-sem-encaixe.ts`.
        //
        // ⚠️ Isto NÃO afrouxa o portão de envio. `canSubmitProposal` continua
        // exigindo serviço no escopo: quem chega ao fim sem serviço lê o que
        // falta, como já lia. O que muda é que ele chega ao fim tendo sido
        // ouvido, com o pedido dele registrado em vez de descartado.
        const vezesJaFeita = conv.perguntasFeitas?.[currentQ.id] ?? 0;
        const insistiuDemais = stillPending && vezesJaFeita >= LIMITE_DE_INSISTENCIA;

        // A RESPOSTA NUNCA É DESCARTADA EM SILÊNCIO — nem na primeira vez que
        // não encaixa. O registro acontece sempre que a casa não entendeu; o
        // que o limite decide é só se ela pergunta de novo ou segue em frente.
        if (stillPending && text.trim()) {
          newScope = {
            ...newScope,
            lacunasDeEscopo: acrescentarRespostaSemEncaixe(
              newScope.lacunasDeEscopo,
              currentQ.id,
              text,
              O_QUE_A_PERGUNTA_COLHE[currentQ.id] ?? "um dado do pedido",
            ),
          };
        }

        if (stillPending && !insistiuDemais) {
          newAnswered = [...new Set([...conv.answeredQIds, ...inferred])];
        } else {
          newAnswered = [...new Set([...conv.answeredQIds, currentQ.id, ...inferred])];
        }
      } else {
        newScope    = conv.scope;
        newAnswered = conv.answeredQIds;
      }
    }
  }

  // ── SDR intelligence layer ─────────────────────────────────────────────────
  // O recado de anexo também não é objeção nem sinal de verba: "…_v1.pdf" tem
  // número dentro, e ler número de nome de arquivo como orçamento do cliente é
  // o mesmo defeito de 16/08 entrando por outra porta.
  const ignoraLeitura  = conv.isFirstMessage || mensagemSemResposta;
  const objectionTypes = ignoraLeitura ? [] : detectObjectionTypes(text);
  const parsedBudget   = ignoraLeitura ? undefined : parseBudgetAmount(text);
  const newEstimate    = computeEstimate(newScope);

  let newSdr: SDRAgentState = { ...sdr };

  // Restaurant detection
  if (isRestaurantSegment(newScope)) newSdr.isRestaurant = true;

  // Budget signal update
  if (parsedBudget !== undefined) {
    const fitStatus = evaluateBudgetFit(parsedBudget, newEstimate);
    newSdr.budgetSignal = {
      raw: text.trim(),
      amount: parsedBudget,
      fitStatus,
      acknowledgedAt: new Date().toISOString(),
    };

    // ═══════════════════════════════════════════════════════════════════════
    // A CASA LEU O NÚMERO — ENTÃO ELA NÃO PERGUNTA O NÚMERO OUTRA VEZ
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Medido no cliente oculto (6ª rodada): a MESMA pergunta de faixa de
    // investimento saiu **três vezes**. A causa não é a fila de perguntas, é a
    // ordem dos ramos lá em cima:
    //
    //   • `detectNegotiation` roda ANTES da pergunta da vez. Uma frase como
    //     "tá caro, meu teto é R$ 2.000" é objeção E é a resposta da verba;
    //   • quando ela casa como negociação, `currentQ.parse` **nunca roda** —
    //     `budgetRange` continua vazio, `when` continua verdadeiro, e a
    //     pergunta volta no turno seguinte. E de novo.
    //
    // Enquanto isso `parseBudgetAmount` — duas linhas acima — já tinha lido
    // R$ 2.000 do mesmo texto e guardado em `budgetSignal`. A casa tinha o
    // dado e perguntava assim mesmo. Não é rigor, é surdez com aparência de
    // método.
    //
    // O conserto é um leitor só: quem leu o número FECHA a pergunta do número.
    // A frase crua é gravada (não o número formatado) porque é ela que o
    // confronto de verba lê — e porque as palavras do cliente valem mais que a
    // nossa interpretação delas.
    //
    // ⚠️ Não afrouxa nada: `budget_range` continua FORA de `OPTIONAL_QIDS`, o
    // portão de envio continua exigindo verba, e quem nunca disse número
    // continua sendo perguntado. O que acabou é perguntar a quem já disse.
    if (!newScope.budgetRange && text.trim()) {
      newScope = mergeScopeDelta(newScope, { budgetRange: text.trim() });
      newAnswered = [...new Set([...newAnswered, "budget_range"])];
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // O CONTATO QUE ELE DEU DE GRAÇA NÃO CAI NO CHÃO (6ª rodada)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Medido: o cliente escreveu o e-mail dele no meio da conversa. A casa não
  // guardou, não usou e não agradeceu — e o briefing terminou sem canal
  // nenhum, porque ele tinha pulado a porta. O SDR é PROIBIDO de PEDIR e-mail
  // (regra do CEO) e isso continua valendo palavra por palavra; proibição de
  // pedir nunca foi licença para ignorar o que foi oferecido.
  //
  // ⛔ E ele NÃO entra no `scope`: o escopo inteiro vai para dentro do prompt
  // do modelo, e e-mail não trafega por ali. Mora no estado do SDR, que não
  // sobe para a rota. Ver `SDRAgentState.contatoOferecido`.
  //
  // ⚠️ SÓ E-MAIL. O telefone tem caminho próprio e MEDIDO (`prospectPhone`, da
  // porta e da pergunta de canal); inventar aqui um segundo leitor de telefone
  // seria criar a divergência que este arquivo passa o tempo todo fechando —
  // e nenhuma medição desta rodada disse que o telefone se perde.
  const emailOferecido = ignoraLeitura ? null : emailNoTexto(text);
  if (emailOferecido) {
    newSdr.contatoOferecido = { ...(newSdr.contatoOferecido ?? {}), email: emailOferecido };
  }

  // Objection state — only price-related objections block submission
  const isPriceObjection = objectionTypes.some((t) =>
    t === "price_too_high" || t === "unsure_budget" || t === "wants_cheaper"
  );
  if (isPriceObjection) {
    newSdr.objection = {
      active: true,
      types: [...new Set([...sdr.objection.types, ...objectionTypes])],
      lastText: text,
      resolvedAt: sdr.objection.resolvedAt,
    };
  }

  // Objection resolution
  if (sdr.objection.active) {
    const clientAccepts = isYes(text) ||
      /pode ser|tá bom|ta bom|aceito|vamos assim|combinado|ótimo|perfeito/i.test(text);
    if (negotiationHappened) {
      const bAmt = newSdr.budgetSignal.amount;
      const newFit: BudgetSignal["fitStatus"] = bAmt !== undefined
        ? evaluateBudgetFit(bAmt, newEstimate)
        : "unknown";
      if (newFit === "fits" || clientAccepts) {
        newSdr.objection = { ...newSdr.objection, active: false, resolvedAt: new Date().toISOString() };
        if (bAmt !== undefined) newSdr.budgetSignal = { ...newSdr.budgetSignal, fitStatus: newFit };
      }
    } else {
      // Also resolve when the prospect answers the objection by stating a budget
      // that FITS the current estimate — no scope change or acceptance word
      // needed. Without this, the confirm CTA stayed wedged behind the objection.
      const bAmt = newSdr.budgetSignal.amount;
      const fits = bAmt !== undefined && evaluateBudgetFit(bAmt, newEstimate) === "fits";
      if (clientAccepts || fits) {
        newSdr.objection = { ...newSdr.objection, active: false, resolvedAt: new Date().toISOString() };
        if (fits) newSdr.budgetSignal = { ...newSdr.budgetSignal, fitStatus: "fits" };
      }
    }
  }

  // ── Build mid ConvState ───────────────────────────────────────────────────
  const mid: ConvState = {
    ...withClient,
    scope: newScope,
    answeredQIds: newAnswered,
    // Anexo não consome a primeira fala. Se o visitante começa a conversa
    // subindo o briefing, quem se apresenta ainda é a mensagem que ele vai
    // digitar — senão a apresentação (nome, negócio, serviço) se perde no
    // recado do arquivo e nunca mais é lida.
    isFirstMessage: mensagemSemResposta ? conv.isFirstMessage : false,
    estimate: newEstimate,
    canSubmit: false,
  };

  const nextQ   = getNextProspectQuestion(mid);
  const allDone = nextQ === null;

  // ── Reply text ────────────────────────────────────────────────────────────
  let replyText: string;

  if (conv.isFirstMessage) {
    const hasService = newScope.wantsSocialMedia || !!newScope.wantsPaidTraffic || !!newScope.branding?.requested;
    let ack = hasService ? buildAcknowledgment(newScope) : "";
    if (ack && newSdr.isRestaurant) {
      ack = ack.replace(
        /Vejo que você quer social media/,
        "Ótimo! Para restaurantes, redes sociais bem feitas fazem uma diferença enorme. Vejo que você quer social media",
      );
    }
    const prefix = ack ? ack + "\n\n" : "";
    replyText = nextQ
      ? `${prefix}${buildSDRQuestionText(nextQ, mid, newSdr)}`
      : `${prefix}Tenho as informações principais! Confira o resumo do seu pedido e confirme para eu preparar seu orçamento.`;

  } else if (newSdr.objection.active) {
    if (negotiationHappened) {
      // Scope adjusted but objection still active — ask for confirmation
      replyText = `${negotiationReply}\n\nIsso está mais próximo do que você tem em mente?`;
    } else {
      replyText = buildPriceObjectionReply(newScope, newEstimate, parsedBudget);
    }

  } else if (negotiationReply) {
    replyText = nextQ && !allDone
      ? `${negotiationReply}\n\n${buildSDRQuestionText(nextQ, mid, newSdr)}`
      : negotiationReply;

  } else if (nextQ) {
    const lastAnswered = newAnswered[newAnswered.length - 1];
    const wasInIdentity = IDENTITY_QUESTIONS.some((q) => q.id === lastAnswered);
    const nextIsService = !IDENTITY_QUESTIONS.some((q) => q.id === nextQ.id);
    if (wasInIdentity && nextIsService && newScope.businessName) {
      replyText = `Ótimo! Agora me conta: o que você está precisando para o **${newScope.businessName}**?\n\n${buildSDRQuestionText(nextQ, mid, newSdr)}`;
    } else {
      replyText = buildSDRQuestionText(nextQ, mid, newSdr);
    }

  } else {
    // ── QUEM DIZ QUE A ENTREVISTA ACABOU É O PORTÃO, NÃO A FALA ─────────────
    //
    // Até 16/08/2026 esta linha anunciava o fim sempre que não sobrava pergunta
    // a fazer (`nextQ === null`). Mas "não tenho mais o que perguntar" e "o
    // pedido está completo" são fatos DIFERENTES, e nesse dia eles se
    // separaram: o SDR dizia *"Tenho todas as informações que preciso. Confira
    // o resumo e confirme"* enquanto `canSubmitProposal` continuava falso — e o
    // CTA de envio, travado por `canSubmit`, nunca aparecia.
    //
    // O visitante lia uma ordem para confirmar e não tinha o que clicar. Fez o
    // briefing inteiro e não virou pedido: o funil arrebentado no último passo,
    // em piloto ao vivo.
    //
    // Duas cabeças respondendo à mesma pergunta discordam — é a lição que esta
    // casa já pagou três vezes no mesmo dia. Aqui a hierarquia é explícita: o
    // **portão** é determinístico e é o dono da verdade; a fala se subordina a
    // ele. O portão NÃO foi afrouxado para destravar a tela — afrouxar trocaria
    // um funil quebrado por um pedido incompleto chegando ao cliente, que é
    // pior e mais caro.
    //
    // E o beco sem saída em silêncio é o pior estado de uma tela: quando o
    // portão está fechado, o visitante lê O QUE FALTA, na frase que
    // `getSubmissionBlockReason` já escrevia — e que até aqui nunca chegava a
    // ele.
    const bloqueio = getSubmissionBlockReason({ ...mid, scope: newScope }, newSdr);
    replyText = bloqueio
      ? `${bloqueio}\n\nMe conta isso e eu já fecho o seu orçamento.`
      : "Perfeito! Tenho todas as informações que preciso. Confira o resumo do seu pedido e confirme para eu preparar seu orçamento personalizado.";
  }

  // ── QUEM MANDA ARQUIVO PRECISA OUVIR QUE ELE CHEGOU ───────────────────────
  //
  // 23/08/2026, cliente falso: depois de o cliente ANEXAR o briefing, a casa
  // devolveu a pergunta anterior palavra por palavra — sem uma sílaba sobre o
  // arquivo. Proteger o escopo do recado de anexo (a trava de 16/08) resolveu
  // metade do problema: o campo parou de ser envenenado e a conversa passou a
  // ignorar o documento.
  //
  // Para quem está do outro lado, mandar material e receber de volta a mesma
  // frase é a prova de que ninguém está lendo. O recado entra ANTES da pergunta
  // e a retomada avisa que a pergunta está voltando de propósito — o cliente lê
  // "ele anotou e continuou", não "falei com uma parede".
  const recado = recadoDeRecebimento(text, attachmentFileNames);
  if (recado) {
    replyText = nextQ
      ? `${recado}\n\n${RETOMADA_DA_PERGUNTA}\n\n${replyText}`
      : `${recado}\n\n${replyText}`;
  }

  // ── O CONTATO OFERECIDO É ACUSADO, EM VOZ ALTA ────────────────────────────
  //
  // Guardar calado seria PII escondida; agradecer sem guardar seria teatro.
  // São as duas coisas — e o aviso vem ANTES da próxima pergunta pelo mesmo
  // motivo do recado do anexo logo acima: quem dá um dado e recebe de volta
  // outra pergunta conclui que ninguém leu.
  //
  // A frase NÃO repete o endereço. Ele já está na tela, escrito por ele, e
  // reescrever PII em cada turno é como o e-mail vira histórico de conversa.
  if (emailOferecido && !mensagemSemResposta) {
    replyText = `Anotei o seu e-mail — é por ele que a proposta chega. 👍\n\n${replyText}`;
  }

  // ── Finalise SDR state ────────────────────────────────────────────────────
  newSdr.negotiationStage = newSdr.objection.active
    ? "objection_handling"
    : allDone
    ? "proposal_ready"
    : detectNegotiationStage(newScope, newSdr, newEstimate);
  newSdr.qualificationScore = computeQualificationScore(newScope, newSdr);

  const assistantMsg: ConvMessage = {
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "assistant",
    text: replyText,
    createdAt: new Date().toISOString(),
  };

  // ── O QUE A CONVERSA JÁ GASTOU ────────────────────────────────────────────
  // Contado aqui, no único lugar que sabe qual pergunta está saindo de verdade
  // nesta resposta. Contar no lugar onde a pergunta é ESCOLHIDA daria números
  // errados: `getNextProspectQuestion` roda mais de uma vez por turno, e nem
  // toda escolha vira fala (objeção e negociação tomam a frente).
  const perguntaQueSaiu = mencionaPergunta(replyText, nextQ, newSdr, mid) ? nextQ?.id : undefined;
  const perguntasFeitas = perguntaQueSaiu
    ? { ...(conv.perguntasFeitas ?? {}), [perguntaQueSaiu]: (conv.perguntasFeitas?.[perguntaQueSaiu] ?? 0) + 1 }
    : conv.perguntasFeitas;

  return {
    conv: {
      ...mid,
      messages: [...mid.messages, assistantMsg],
      estimate: newEstimate,
      canSubmit: canSubmitProposal(mid, newSdr),
      perguntasFeitas,
    },
    sdr: newSdr,
  };
}

/** A pergunta da vez saiu MESMO nesta resposta?
 *
 *  Nem todo turno faz pergunta: quando há objeção de preço ativa, a fala é
 *  outra e a pergunta fica para depois. Contar uma pergunta que não foi feita
 *  gastaria a insistência do cliente sem ele ter lido nada — e o limite passaria
 *  a punir quem negociou preço. */
function mencionaPergunta(
  replyText: string, nextQ: QuestionDef | null, sdr: SDRAgentState, mid: ConvState,
): boolean {
  if (!nextQ) return false;
  if (sdr.objection.active) return false;
  return replyText.includes(buildSDRQuestionText(nextQ, mid, sdr));
}
