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
import { emailNoTexto } from "./contato-do-lead";

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

/** O que a pergunta colhe, em português — para a lacuna que GENTE vai ler.
 *  Complementa `O_QUE_A_PERGUNTA_COLHE` (que cobre os ids do motor de regras)
 *  com os ids que só o motor de IA pergunta.
 *
 *  ⚠️ ESTE TEXTO É DA CASA PARA A CASA. Ele fala do cliente em TERCEIRA pessoa
 *  de propósito ("se ele já tem fotos"), porque quem o lê é um colega lendo uma
 *  lacuna sobre um terceiro. Nunca use este texto numa fala que vai para a cara
 *  do cliente — para isso existe `COMO_SE_PERGUNTA_AO_CLIENTE`, logo abaixo. */
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
 * ─── O MESMO TEXTO SERVIA A DUAS PLATEIAS, E UMA DELAS ERA A ERRADA ─────────
 *
 * MEDIDO NO AR na 9ª volta (26/08/2026). A reformulação da casa saiu assim, na
 * cara do cliente:
 *
 *     "Deixa eu tentar de outro jeito: você consegue me dizer se **ele** já tem
 *      fotos, vídeos ou logo prontos?"
 *
 * O SDR falava COM o cliente e SOBRE o cliente na mesma frase — tratando o dono
 * do negócio como um terceiro ausente. Quem está do outro lado lê isso como
 * estar sendo discutido, não atendido.
 *
 * ⚠️ E o "ele" NÃO era do modelo. Era NOSSO: `segundaFormulacao` costurava a
 * frase com `O_QUE_A_PERGUNTA_DE_IA_COLHE`, que é escrito para a LACUNA — um
 * texto da casa para a casa, sobre um terceiro. Uma tabela, duas plateias, e
 * uma delas recebendo a voz errada. É a irmã do defeito que esta casa mais
 * repete ("verdade escrita em dois lugares"), com o sinal trocado: **um texto
 * só usado em duas vozes**.
 *
 * Duas colunas, uma fonte: o que a pergunta COLHE (terceira pessoa, para o
 * colega) e como ela se PERGUNTA (segunda pessoa, para o cliente). O teste
 * abaixo exige que toda pergunta de IA tenha as duas — tabela que cresce pela
 * metade é a que volta a vazar a voz errada.
 */
export const COMO_SE_PERGUNTA_AO_CLIENTE: Record<string, string> = {
  budget_range:     "qual faixa de investimento faz sentido para você",
  canais_sociais:   "em quais redes sociais o seu negócio está",
  material_pronto:  "se vocês já têm fotos, vídeos ou logo prontos",
  volume_de_posts:  "quantos posts por semana você quer",
  quem_escreve:     "quem escreve os textos e grava os vídeos aí",
  verba_de_midia:   "quanto você pensa em colocar por mês em anúncios",
  publico_alvo:     "quem é o cliente típico de vocês",
  objetivo:         "qual é o seu objetivo principal agora",
  concorrentes:     "quais concorrentes ou referências você admira",
  prazo:            "para quando você quer isso de pé",
  decisor:          "quem decide a contratação aí",
  canal_de_contato: "por onde você prefere ser respondido",
  modalidade:       "se você quer gestão mensal, projeto pontual ou parceria contínua",
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
  // A VOZ DA FALA É A DO CLIENTE. `O_QUE_A_PERGUNTA_DE_IA_COLHE` fica de fora
  // desta frase de propósito — ver `COMO_SE_PERGUNTA_AO_CLIENTE`. Sem
  // reformulação em segunda pessoa a casa NÃO improvisa com a da lacuna: ela
  // devolve `null`, e quem chama registra e avança. Falta de texto nunca vira
  // licença para falar do cliente na frente dele.
  const colhe = COMO_SE_PERGUNTA_AO_CLIENTE[perguntaId];
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
  // ⛔ SEM O E-MAIL DELE, e este parágrafo é uma dívida minha, não uma
  // precaução teórica.
  //
  // O eco nasceu nesta mesma rodada para acabar com a frase de despedida
  // repetida. Ele foi para produção e, na volta seguinte, a casa respondeu:
  //
  //   EU : "Pode mandar tudo pro marina2.oculta@trattoria-oculta.invalid."
  //   SDR: Anotei: "Pode mandar tudo pro marina2.oculta@trattoria-oculta.invalid."
  //
  // E essa fala vira histórico: ela volta em `messages` a cada turno seguinte,
  // ou seja, **o endereço passou a viajar para dentro do prompt do modelo pela
  // porta que eu abri** — exatamente a doutrina que o resto desta rodada
  // existe para proteger (`aplicarTravasDeEscopo` apaga `prospectEmail`,
  // `pergunta-sem-encaixe` mascara a lacuna, `contatoOferecido` mora fora do
  // escopo). Consertei o cano e abri um segundo, no mesmo dia.
  //
  // A frase continua sendo dele — só o endereço sai. Ele já o escreveu na
  // tela; a casa não precisa devolvê-lo para provar que ouviu.
  const t = semContatoNoEco(fala ?? "").trim().replace(/\s+/g, " ");
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

/**
 * ─── A PERGUNTA QUE O ESCOPO JÁ RESPONDEU (8ª volta, 26/08/2026) ────────────
 *
 * MEDIDO EM PRODUÇÃO: o SDR reperguntou o que o cliente ACABARA de responder.
 * O contador desta casa não pega esse caso — ele conta REPETIÇÕES e só freia na
 * segunda; aqui a pergunta saiu uma vez só, e uma vez já era uma vez demais,
 * porque a resposta estava no escopo do MESMO turno.
 *
 * É a regra da 6ª volta ("quem leu o número FECHA a pergunta do número")
 * generalizada para a fila inteira: o `scope` e a `reply` vêm do MESMO pacote do
 * modelo, então ele pode gravar o dado e perguntar o dado no mesmo fôlego. A
 * fila já sabia responder "isto foi respondido?" — o que faltava era alguém
 * fazer a pergunta antes de a fala sair.
 *
 * `false` para pergunta desconhecida, e isso é deliberado: freio que barra o que
 * não consegue identificar cala o SDR, e SDR calado é pior que SDR repetitivo.
 */
export function perguntaJaRespondida(perguntaId: string, escopo: Record<string, unknown> | undefined): boolean {
  const item = FILA.find((f) => f.id === perguntaId);
  if (!item) return false;
  return item.respondida(escopo ?? {});
}

/**
 * A próxima pergunta em aberto, para quem precisa SUBSTITUIR uma pergunta já
 * respondida. Exportada porque proibir sem dizer o que fazer no lugar empurra a
 * máquina para o silêncio — a instrução gêmea da proibição, como sempre.
 *
 * `null` = a sondagem fechou. Quem chama decide o fecho.
 */
export function proximaPerguntaEmAberto(
  escopo: Record<string, unknown> | undefined,
  jaPerguntadas: readonly string[] = [],
): string | null {
  return proximaEmAberto(escopo, jaPerguntadas);
}

/**
 * ─── "VOCÊ CONSEGUE ME DIZER SE **ELE** JÁ TEM FOTOS?" ──────────────────────
 *
 * Medido na mesma volta. O SDR falava COM o cliente e SOBRE o cliente na mesma
 * frase — tratando o dono do negócio como um terceiro ausente. Quem está do
 * outro lado lê isso como estar sendo discutido, não atendido.
 *
 * A régua é apertada de propósito: só casa PRONOME de terceira pessoa, ou "o
 * cliente", **dentro de uma pergunta**. Um "ele" que se refere ao Instagram, ao
 * post ou ao logo é uso legítimo e comum — por isso o pronome tem de vir colado
 * a um verbo de POSSE ou de VONTADE do dono ("ele já tem", "ele quer", "ele
 * pretende"), que é a forma medida e a que não tem segundo sentido aqui.
 *
 * O que se faz com o `true` é decisão de quem chama. Nesta casa é substituição
 * pela redação canônica da fila — que já é escrita na segunda pessoa —, nunca
 * silêncio: apagar a pergunta deixaria o cliente sem nada para responder.
 */
export function falaSobreOClienteEmTerceiraPessoa(fala: unknown): boolean {
  if (typeof fala !== "string" || !fala.includes("?")) return false;
  for (const trecho of fala.split(/(?<=\?)/)) {
    if (!trecho.includes("?")) continue;
    if (RE_TERCEIRA_PESSOA.test(trecho)) return true;
  }
  return false;
}

/** "ele/ela/o cliente" + um verbo de posse ou vontade DO DONO. É a forma medida
 *  ("você consegue me dizer se ele já tem fotos?") e a que não tem outro
 *  sentido: coisa não "quer" nem "pretende", e "ele já tem" com sujeito-coisa é
 *  raro o bastante para valer o risco — enquanto tratar o cliente como terceiro
 *  é dano garantido em toda ocorrência. */
const RE_TERCEIRA_PESSOA =
  /\b(?:ele|ela|o\s+cliente|a\s+cliente|o\s+dono|a\s+dona)\b\s+(?:j[áa]\s+)?(?:tem|t[êe]m|possui|quer|querem|pretende|precisa|deseja|costuma|trabalha|vende|usa|faz)\b/i;

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


/** O texto sem o CONTATO do cliente. Mesmo motivo e mesmo formato da máscara de
 *  `pergunta-sem-encaixe.ts` — a marca é a MESMA palavra nos dois lugares, para
 *  quem lê o histórico reconhecer o que aconteceu sem ter de adivinhar.
 *
 *  ── POR QUE O TELEFONE ENTROU DEPOIS (27/08/2026) ─────────────────────────
 *
 *  A primeira versão desta função tapava só o e-mail, porque foi o e-mail que
 *  a medição pegou. E era a mesma armadilha que esta rodada já pagou uma vez
 *  com outro nome: **allowlist não é correção**. O cano não era "o e-mail do
 *  cliente" — era "o contato do cliente voltando para dentro do prompt". A
 *  pergunta "como você prefere receber as novidades: e-mail ou WhatsApp?" está
 *  na FILA deste mesmo arquivo, ou seja, a casa PEDE o telefone; a resposta
 *  natural é um número, e o eco o devolvia inteiro.
 *
 *  Tapa-se a CLASSE, não a instância medida.
 *
 *  O piso de 10 dígitos é o mesmo de `whatsappValido` e pelo mesmo motivo:
 *  "3 posts por semana", "18h às 23h" e "R$ 1.500,00" não podem virar
 *  telefone, senão a máscara come a fala do cliente e o eco deixa de ser o
 *  eco dele. */
function semContatoNoEco(texto: string): string {
  let saida = texto;
  for (let i = 0; i < 8; i++) {
    const achado = emailNoTexto(saida);
    if (!achado) break;
    saida = saida.split(achado).join("[e-mail do cliente]");
  }
  return saida.replace(RE_TELEFONE_NO_ECO, (m) => {
    const digitos = m.replace(/\D/g, "");
    return digitos.length >= 10 && digitos.length <= 13 ? "[telefone do cliente]" : m;
  });
}

/** Sequência que PODE ser telefone: dígitos com os separadores usuais. Quem
 *  decide é a contagem de dígitos, dentro do `replace` — a regex só recorta. */
const RE_TELEFONE_NO_ECO = /\+?\d[\d\s().-]{8,}\d/g;
