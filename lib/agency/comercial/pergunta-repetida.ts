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
  { id: "publico_alvo",      padrao: /p[úu]blico[-\s]*alvo|quem\s+(s[ãa]o|[ée])\s+(os\s+)?(seus\s+)?clientes?|cliente\s+ideal|para\s+quem\s+voc[êe]s?\s+vend/i },
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

  // A faixa vem do detector da casa, não de uma regex nova: é o MESMO
  // `ehPerguntaDeFaixa` que a rota já usa para abrir exceção no guarda de
  // preço. Se um dia a régua de faixas mudar, muda num lugar só.
  if (ehPerguntaDeFaixa(fala)) return "budget_range";
  // A pergunta da faixa ABREVIADA (o modelo cita dois degraus em vez de três)
  // não fecha `ehPerguntaDeFaixa` — e ainda assim é a mesma pergunta, e é
  // exatamente a que mais se repetiu na medição. Um contador que não a conta
  // não conta o caso que existe para contar.
  if (/investir|investimento|or[çc]amento|verba|faixa\s+de/i.test(fala)) return "budget_range";

  for (const p of PERGUNTAS) if (p.padrao.test(fala)) return p.id;
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
): string {
  const nome = primeiroNome(escopo);
  const abertura = nome
    ? `Entendi, ${nome} — e tudo bem. Anotei isso do seu jeito e vou seguir sem esse dado por enquanto; a equipe confirma com você depois. `
    : "Entendi — e tudo bem. Anotei isso do seu jeito e vou seguir sem esse dado por enquanto; a equipe confirma com você depois. ";

  const proxima = proximaEmAberto(escopo, [...jaPerguntadas, perguntaId]);
  if (proxima) return abertura + proxima;

  return (
    abertura +
    "Já tenho o essencial aqui. Dá uma conferida no resumo do seu pedido, ao lado — " +
    "se estiver tudo certo, é só confirmar que eu preparo seu orçamento personalizado."
  );
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
