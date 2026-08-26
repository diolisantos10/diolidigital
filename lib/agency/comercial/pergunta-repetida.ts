// pergunta-repetida.ts — o freio da insistência NO CAMINHO QUE ATENDE.
//
// ─── O ACHADO QUE PRODUZIU ESTE ARQUIVO (24/08/2026) ────────────────────────
//
// Em 24/08 a casa consertou o laço da pergunta repetida — e consertou no
// componente errado. `LIMITE_DE_INSISTENCIA` nasceu em `pergunta-sem-encaixe.ts`
// e é lido por UM único arquivo: `lib/agency/prospect-engine.ts`, o motor de
// REGRAS. O motor de regras é o plano B: ele quase nunca atende, porque as
// chaves de IA estão ligadas e quem responde ao prospect é
// `app/api/sdr/chat/route.ts`.
//
//     git diff 37701249 d91cc474 -- app/api/sdr/chat/route.ts
//     (vazio)
//
// O SDR de IA não mudou um byte. Ele até importa `ehPerguntaDeFaixa` de
// `negociacao.ts` — sabe RECONHECER a pergunta da faixa — e mesmo assim nunca
// contou quantas vezes já a fez. A régua ficou verde sobre o motor de regras
// enquanto o motor de IA seguia doente.
//
// Medido contra a rota pública real, 24/08: numa conversa de 20 turnos o
// modelo fez a MESMA pergunta ("a Farol 27 tem Instagram hoje?") em dez turnos,
// seis deles seguidos. A variação entre rodadas (13 → 15 → 6 repetições) nunca
// foi conserto pegando: era o modelo variando. Sem contador no código não há
// garantia, só sorte.
//
// ─── A REGRA (a mesma de `pergunta-sem-encaixe.ts`, não uma segunda) ─────────
//
// `LIMITE_DE_INSISTENCIA` é IMPORTADO daqui de lá, nunca recopiado: verdade
// escrita em dois lugares já está errada em um deles. A régua:
//
//   1ª vez  — a pergunta original, como o modelo a escreveu.
//   2ª vez  — a REFORMULAÇÃO (`reformular`), que admite que a casa não entendeu
//             e oferece uma saída explícita. Nunca a mesma frase duas vezes.
//   3ª vez  — NÃO EXISTE. A resposta crua do cliente vira lacuna e a conversa
//             AVANÇA (`oQueDizerNoLugar`).
//
// ─── PROMPT É AVISO; CÓDIGO É TRAVA ─────────────────────────────────────────
//
// O prompt do SDR já diz *"Se o cliente já disse algo, não repita"* e *"UMA
// pergunta por vez"*. Isso é aviso, e o aviso não pegou: foi medido em
// produção. O freio mora aqui — no servidor, contando sobre o estado da
// conversa, decidindo ANTES de a fala sair. O modelo não é consultado sobre se
// deve obedecer.
//
// ─── TODA PROIBIÇÃO PRECISA DA INSTRUÇÃO GÊMEA ──────────────────────────────
//
// Proibir a repetição sem dizer o que fazer no lugar empurra a máquina para o
// silêncio, que é pior que a repetição: o cliente fica olhando uma conversa que
// parou. Por isso `oQueDizerNoLugar` é obrigatória e nunca devolve vazio —
// reconhece, registra com as palavras dele, e faz a PRÓXIMA pergunta em aberto
// (ou fecha a sondagem, quando não há próxima).

import { ehPerguntaDeFaixa } from "./negociacao";
import { LIMITE_DE_INSISTENCIA, reformular } from "./pergunta-sem-encaixe";

export { LIMITE_DE_INSISTENCIA };

/**
 * O inventário das perguntas que o SDR de IA faz.
 *
 * Os dois primeiros ids são os MESMOS do motor de regras (`prospect_name_biz`,
 * `detect_service`) de propósito: é assim que `reformular` e
 * `O_QUE_A_PERGUNTA_COLHE` — que já existem e já foram escritos com cuidado —
 * servem aos dois motores sem uma segunda cópia. Os demais nomeiam o que só o
 * motor de IA pergunta (o protocolo de descoberta do prompt).
 *
 * A ORDEM É A CLASSIFICAÇÃO. Uma fala cai no PRIMEIRO id cujo padrão casa, e
 * em nenhum outro — um contador só conta se "a mesma pergunta" tiver uma
 * resposta única. Do mais específico para o mais genérico.
 */
const PERGUNTAS: { id: string; padrao: RegExp }[] = [
  // A faixa tem detector próprio na casa; ele entra por `identificarPergunta`,
  // não por regex aqui — ver o corpo da função.
  { id: "prospect_name_biz", padrao: /(seu|teu)\s+nome|nome\s+d[oa]\s+(seu\s+)?neg[óo]cio|como\s+(voc[êe]|tu)\s+se\s+chama|nome\s+d[ae]\s+(sua\s+)?(empresa|marca|loja)/i },
  { id: "detect_service",    padrao: /(redes\s*sociais|social).{0,80}(tr[áa]fego|an[úu]ncio).{0,80}(identidade|marca)|qual\s+(dess[ae]s\s+)?(frentes|servi[çc]os)/i },
  { id: "canais_sociais",    padrao: /\b(instagram|tiktok|facebook|linkedin|youtube)\b|quais\s+redes|em\s+quais\s+canais/i },
  { id: "material_pronto",   padrao: /\b(fotos?|v[íi]deos?|imagens|criativos?|logo|brand\s*book|material)\b.{0,60}(pront|j[áa]\s+tem|dispon[íi]ve|do\s+zero)|(j[áa]\s+tem|voc[êe]s?\s+t[êe]m).{0,40}\b(fotos?|v[íi]deos?|logo|criativos?)\b/i },
  { id: "volume_de_posts",   padrao: /quantos?\s+(posts?|stories|reels|v[íi]deos)|posts?\s+por\s+(semana|dia|m[êe]s)|frequ[êe]ncia\s+de\s+post/i },
  { id: "quem_escreve",      padrao: /quem\s+(escreve|redige|grava|edita)|a\s+copy|os?\s+textos?\s+(fic|s[ãa]o|v[êe]m)/i },
  { id: "verba_de_midia",    padrao: /verba\s+(mensal\s+)?(de\s+)?(m[íi]dia|an[úu]ncios?)|quanto.{0,20}an[úu]ncios?/i },
  // ⚠️ `(os\s+)?` COBRIA SÓ O PLURAL e por isso "Quem é o cliente típico de
  // vocês?" — a frase que a produção de fato usa, medida em 24/08 — não casava
  // com nada: a pergunta do público não era contada, e apareceu três vezes na
  // mesma conversa DEPOIS do freio. Um padrão que não reconhece a frase real é
  // um contador que não conta. Artigo singular e plural, os dois.
  // ⚠️ ESTE PADRÃO JÁ ERROU DUAS VEZES, E AS DUAS SAÍRAM EM PRODUÇÃO. Primeiro
  // `(os\s+)?clientes` só cobria o plural e "Quem é o cliente típico de vocês?"
  // não casava. Depois, "qual é o público que você quer atingir?" também não —
  // porque o padrão exigia o hífen de "público-alvo". Cada erro custou UMA
  // aparição extra da mesma pergunta, e nenhum deles apareceu em teste algum
  // até alguém ler a conversa de produção. A palavra `público` sozinha, dentro
  // de uma pergunta do SDR, é a pergunta do público — não há segundo sentido
  // nesta conversa.
  { id: "publico_alvo",      padrao: /\bp[úu]blico\b|quem\s+(s[ãa]o|[ée])\s+(os?\s+|as?\s+)?(seus\s+)?clientes?|cliente\s+(t[íi]pico|ideal)|quem\s+voc[êe]s?\s+(quer|querem|pretend)\w*\s+atingir|para\s+quem\s+voc[êe]s?\s+vend/i },
  { id: "objetivo",          padrao: /objetivo|o\s+que\s+voc[êe]\s+(quer|espera)\s+(alcan[çc]ar|conseguir)|o\s+que\s+seria\s+sucesso|principal\s+meta/i },
  { id: "concorrentes",      padrao: /concorrent|refer[êe]ncias?\s+que|marcas?\s+que\s+voc[êe]\s+admira/i },
  { id: "prazo",             padrao: /\bprazo\b|quando\s+(voc[êe]s?\s+)?(pensa|pretende|quer|gostaria).{0,30}(come[çc]ar|lan[çc]ar)|pr[óo]ximas\s+semanas/i },
  { id: "decisor",           padrao: /quem\s+decide|decis[ãa]o\s+(final|de\s+contrata)|voc[êe]\s+(que\s+)?decide/i },
  { id: "canal_de_contato",  padrao: /(receber|falar).{0,40}(por\s+)?(e-?mail|whats)|prefere\s+(e-?mail|whats)/i },
  { id: "modalidade",        padrao: /mensal.{0,40}(pontual|projeto)|projeto\s+[úu]nico|parceria\s+cont[íi]nua/i },
];

/**
 * Que pergunta esta fala do SDR está fazendo — ou `null` quando não é pergunta.
 *
 * `null` NÃO é falha e não vira licença para nada: uma fala que não pergunta
 * nada não repete pergunta nenhuma, e uma pergunta que a casa não sabe nomear
 * segue passando (o freio nunca barra o que não consegue identificar — barrar
 * no escuro calaria o SDR, que é o defeito pior).
 */
export function identificarPergunta(fala: unknown): string | null {
  if (typeof fala !== "string" || !fala.includes("?")) return null;

  // ── O CLASSIFICADOR LÊ AS PERGUNTAS, NÃO A FALA INTEIRA (6ª rodada) ───────
  //
  // Ele testava a string TODA. Isso bastava enquanto a fala do SDR era só a
  // pergunta — e quebrou no minuto em que o fecho passou a ECOAR o cliente
  // (ver `oQueDizerNoLugar`): a frase *"Anotei: «Ainda não sei quanto posso
  // investir». Qual é o objetivo do negócio?"* era classificada como a
  // PERGUNTA DA FAIXA, porque a palavra "investir" — dita pelo CLIENTE —
  // casava a regra da linha de baixo.
  //
  // A consequência não é cosmética: `vezesJaPerguntada` contaria o eco como
  // mais uma insistência da casa, e o freio da repetição passaria a se
  // disparar sozinho contra a própria fala. Pego por régua
  // (`laco-do-sdr-de-ia.test.ts`) antes de subir.
  //
  // A regra certa é a que o nome da função sempre disse: só as frases que SÃO
  // pergunta descrevem o que a casa perguntou. Uma citação nunca é pergunta da
  // casa, e nem toda frase com "?" no texto é dela — mas as que não têm "?"
  // seguramente não são.
  const soAsPerguntas = fala
    .split(/(?<=[?!.])\s+|\n+/)
    .filter((t) => t.includes("?"))
    .join(" ");
  if (!soAsPerguntas.trim()) return null;
  const texto = soAsPerguntas;

  // A faixa vem do detector da casa, não de uma regex nova: é o MESMO
  // `ehPerguntaDeFaixa` que a rota já usa para abrir exceção no guarda de
  // preço. Se um dia a régua de faixas mudar, muda num lugar só.
  if (ehPerguntaDeFaixa(texto)) return "budget_range";
  // A pergunta da faixa ABREVIADA (o modelo cita dois degraus em vez de três)
  // não fecha `ehPerguntaDeFaixa` — e ainda assim é a mesma pergunta, e é
  // exatamente a que mais se repetiu na medição. Um contador que não a conta
  // não conta o caso que existe para contar.
  if (/investir|investimento|or[çc]amento|verba|faixa\s+de/i.test(texto)) return "budget_range";

  for (const p of PERGUNTAS) if (p.padrao.test(texto)) return p.id;
  return null;
}

/**
 * Quantas vezes esta pergunta já foi feita nas falas ANTERIORES do SDR.
 *
 * `falasDoSdr` é a história — as falas que o SDR já disse nesta conversa, da
 * mais antiga para a mais nova, sem a fala da vez.
 */
export function vezesJaPerguntada(falasDoSdr: readonly string[], perguntaId: string): number {
  let n = 0;
  for (const f of falasDoSdr) if (identificarPergunta(f) === perguntaId) n += 1;
  return n;
}

/** O que a pergunta colhe, em português — para a lacuna que gente vai ler.
 *  Complementa `O_QUE_A_PERGUNTA_COLHE` (que cobre os ids do motor de regras)
 *  com os ids que só o motor de IA pergunta. */
export const O_QUE_A_PERGUNTA_DE_IA_COLHE: Record<string, string> = {
  budget_range:     "a faixa de investimento",
  canais_sociais:   "em quais redes sociais o negócio está",
  material_pronto:  "se ele já tem fotos, vídeos ou logo prontos",
  volume_de_posts:  "quantos posts por semana ele quer",
  quem_escreve:     "quem escreve os textos e grava os vídeos",
  verba_de_midia:   "a verba mensal de anúncios",
  publico_alvo:     "quem é o público do negócio",
  objetivo:         "qual é o objetivo principal dele",
  concorrentes:     "concorrentes ou referências que ele admira",
  prazo:            "o prazo para começar",
  decisor:          "quem decide a contratação",
  canal_de_contato: "por onde ele prefere ser respondido",
  modalidade:       "se é gestão mensal, projeto pontual ou parceria contínua",
};

/**
 * A SEGUNDA formulação da pergunta — nunca a mesma frase duas vezes.
 *
 * Para os dois ids do motor de regras vale a reformulação que já existe
 * (`pergunta-sem-encaixe.reformular`): ela já admite que a casa não entendeu e
 * já oferece a saída. Para os ids de IA a reformulação é montada aqui com a
 * MESMA forma — admitir + oferecer saída —, porque uma reformulação que só
 * troca as palavras repete o problema com sinônimos.
 */
export function segundaFormulacao(perguntaId: string): string | null {
  const daCasa = reformular(perguntaId);
  if (daCasa) return daCasa;
  const colhe = O_QUE_A_PERGUNTA_DE_IA_COLHE[perguntaId];
  if (!colhe) return null;
  // ⚠️ A REFORMULAÇÃO PRECISA CONTINUAR SENDO RECONHECÍVEL COMO A MESMA
  // PERGUNTA — pego por teste, e o defeito era silencioso e caro. A primeira
  // versão deste texto era afirmativa ("eu ainda não consegui entender X"), sem
  // ponto de interrogação. `identificarPergunta` exige "?" para classificar uma
  // fala, então a reformulação NÃO ERA CONTADA: o contador via 1 no terceiro
  // turno, reformulava outra vez, e a régua de duas viravam infinitas
  // reformulações — o mesmo laço, com roupa nova. A fala que faz a pergunta de
  // novo tem de PARECER a pergunta de novo, para a contagem e para o cliente.
  return (
    "Desculpa, acho que não fui claro — a culpa é minha. " +
    `Deixa eu tentar de outro jeito: você consegue me dizer ${colhe}? ` +
    "Se não souber ou preferir não dizer agora, é só falar \"não sei\" " +
    "que eu registro assim mesmo e a gente segue."
  );
}

/**
 * ⛔ A TERCEIRA VEZ NÃO EXISTE — e esta é a instrução gêmea da proibição.
 *
 * Nunca devolve vazio. A conversa não pode parar: proibir a repetição e não
 * dizer o que fazer no lugar troca um cliente irritado por um cliente diante de
 * uma tela muda, que é pior.
 *
 * O que faz, nesta ordem: reconhece que ouviu, diz com todas as letras que
 * anotou e que segue sem esse dado (honestidade — a casa não finge que
 * entendeu), e faz a PRÓXIMA pergunta ainda em aberto. Quando não há próxima,
 * fecha a sondagem — que é o desfecho legítimo, não uma desistência.
 */
export function oQueDizerNoLugar(
  perguntaId: string,
  escopo: Record<string, unknown> | undefined,
  jaPerguntadas: readonly string[],
  /**
   * O QUE O CLIENTE ACABOU DE DIZER, e a fala anterior da casa.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * POR QUE ESTE PARÂMETRO EXISTE (cliente oculto, 6ª rodada)
   * ═══════════════════════════════════════════════════════════════════════
   *
   * MEDIDO EM PRODUÇÃO: o fecho desta função — a máquina que existe para
   * acabar com a frase repetida — saiu **nove turnos seguidos, palavra por
   * palavra**. Quando a sondagem já fechou, `proximaEmAberto` devolve `null`
   * e o texto abaixo é sempre o mesmo; o guarda dispara a cada turno em que o
   * modelo repete a pergunta, e reemite o mesmo fecho para sempre.
   *
   * E ele saiu nos turnos em que o cliente ESTAVA RESPONDENDO — o e-mail
   * dele, o horário de funcionamento, a área atendida. A casa disse nove
   * vezes *"vou seguir sem esse dado"* sobre dados que acabara de receber.
   * Pior que a pergunta repetida: a pergunta admite que quer algo; isto
   * afirma que desistiu.
   *
   * ── A CORREÇÃO, E POR QUE NÃO FOI SIMPLESMENTE "NÃO SUBSTITUIR" ─────────
   *
   * A primeira tentativa foi deixar a fala do MODELO passar quando o fecho já
   * tivesse saído. Ela derrubou a trava irmã na hora
   * (`laco-do-sdr-de-ia.test.ts`): sem a substituição, a MESMA PERGUNTA do
   * modelo chegava ao cliente três vezes — exatamente o defeito que este
   * módulo nasceu para matar. As duas regras estão certas e não se escolhe
   * entre elas.
   *
   * O que estava errado era o fecho ser um TEXTO FIXO. A partir da segunda
   * vez ele passa a carregar **as palavras que o cliente acabou de dizer** —
   * então ele nunca é a mesma frase duas vezes, por construção, e nunca mais
   * afirma que a casa está ignorando o que ela acabou de ouvir.
   */
  falaDoCliente?: string,
): string {
  const nome = primeiroNome(escopo);

  // ── A ABERTURA ECOA O CLIENTE A PARTIR DA SEGUNDA VEZ ────────────────────
  //
  // `falaDoCliente` presente ⇒ o chamador já viu este fecho sair antes neste
  // fio (é ele quem sabe). Aí a abertura deixa de ser o texto fixo e passa a
  // carregar as palavras que ele acabou de dizer: nunca a mesma frase duas
  // vezes, por construção — e nunca mais "sigo sem esse dado" para quem está,
  // justamente, falando.
  const eco = trechoDoCliente(falaDoCliente);
  const abertura = eco
    ? `Anotei: "${eco}". `
    : nome
    ? `Entendi, ${nome} — e tudo bem. Anotei isso do seu jeito e vou seguir sem esse dado por enquanto; a equipe confirma com você depois. `
    : "Entendi — e tudo bem. Anotei isso do seu jeito e vou seguir sem esse dado por enquanto; a equipe confirma com você depois. ";

  // A conversa AVANÇA — a pergunta seguinte em aberto sai junto. É a instrução
  // gêmea da proibição, e ela vale nas duas aberturas.
  const proxima = proximaEmAberto(escopo, [...jaPerguntadas, perguntaId]);
  if (proxima) return abertura + proxima;

  return (
    abertura +
    (eco
      ? "Já tenho o essencial do seu pedido — está tudo no resumo, ao lado. Quando estiver certo, é só enviar que eu preparo o seu orçamento."
      : "Já tenho o essencial aqui. Dá uma conferida no resumo do seu pedido, ao lado — se estiver tudo certo, é só confirmar que eu preparo seu orçamento personalizado.")
  );
}

/** A fala do cliente, curta o bastante para caber numa frase e longa o
 *  bastante para ele se reconhecer nela. Corta na palavra, não no meio dela —
 *  eco cortado no meio de uma palavra parece defeito, e defeito na fala é o
 *  que faz a pessoa desconfiar do resto. */
function trechoDoCliente(fala: string | undefined): string | null {
  const t = (fala ?? "").trim().replace(/\s+/g, " ");
  if (t.length < 3) return null;
  if (t.length <= 120) return t;
  const corte = t.slice(0, 120);
  const ate = corte.lastIndexOf(" ");
  return `${(ate > 40 ? corte.slice(0, ate) : corte).trim()}…`;
}

/** A fila do protocolo de descoberta, na ordem do prompt. Cada item sabe se já
 *  foi respondido OLHANDO O ESCOPO — nunca "foi perguntado, então está
 *  respondido", que é o defeito de 16/08 que o motor de regras já pagou. */
const FILA: { id: string; respondida: (e: Record<string, unknown>) => boolean; pergunta: string }[] = [
  { id: "objetivo",         respondida: (e) => temLista(e.objectives),        pergunta: "Me conta: qual é o objetivo principal do negócio agora — trazer cliente novo, vender mais para quem já é cliente, ou aparecer mais?" },
  { id: "publico_alvo",     respondida: (e) => temTexto(e.targetAudience),    pergunta: "Quem é o cliente típico de vocês? Me descreve em uma frase." },
  { id: "canais_sociais",   respondida: (e) => temLista((e.social as Record<string, unknown> | undefined)?.platforms), pergunta: "Em quais redes vocês estão hoje — Instagram, Facebook, TikTok?" },
  { id: "material_pronto",  respondida: (e) => (e.social as Record<string, unknown> | undefined)?.hasPhotos !== undefined, pergunta: "Vocês já têm fotos e vídeos do negócio, ou a gente produz do zero?" },
  { id: "prazo",            respondida: (e) => temTexto(e.deadline),          pergunta: "E para quando você quer isso de pé — próximas semanas, este mês, sem pressa?" },
  { id: "decisor",          respondida: (e) => typeof e.decisionMaker === "boolean", pergunta: "Só para eu me organizar: a decisão de contratar é sua, ou tem mais alguém junto?" },
  { id: "canal_de_contato", respondida: (e) => temTexto(e.prospectPhone) || temTexto(e.preferredChannel), pergunta: "Como você prefere receber as novidades do seu projeto: por e-mail ou WhatsApp?" },
];

function proximaEmAberto(escopo: Record<string, unknown> | undefined, jaPerguntadas: readonly string[]): string | null {
  const e = escopo ?? {};
  for (const item of FILA) {
    if (jaPerguntadas.includes(item.id)) continue;
    if (item.respondida(e)) continue;
    return item.pergunta;
  }
  return null;
}

function temTexto(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
function temLista(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}
function primeiroNome(escopo: Record<string, unknown> | undefined): string | null {
  const n = escopo?.prospectName;
  if (typeof n !== "string" || !n.trim()) return null;
  return n.trim().split(/\s+/)[0];
}
