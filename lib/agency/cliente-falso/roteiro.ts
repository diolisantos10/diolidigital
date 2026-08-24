// roteiro.ts — QUEM é o cliente falso, o que ele sabe, e como ele responde.
//
// ─── POR QUE O CLIENTE REAGE, EM VEZ DE RECITAR ─────────────────────────────
//
// A primeira versão disto era uma lista fixa de falas, disparadas na ordem
// independentemente do que a casa perguntasse. A primeira rodada (23/08/2026)
// mostrou por que isso não serve: a casa perguntou "quantas postagens por
// semana?" e a lista, na sua vez, respondeu *"Nosso orçamento é de R$ 500 por
// mês"* — e a casa gravou **125 posts por semana** (500 ÷ 4 semanas).
//
// O número saiu errado de verdade. Mas o teste não podia AFIRMAR isso, porque
// nenhuma pessoa responde verba quando lhe perguntam volume. Metade da culpa
// era do instrumento — e instrumento que divide a culpa com o defeito não serve
// para acusar ninguém. É a lição de 17/08: ferramenta que dá falso positivo
// manda a casa consertar o que não quebrou.
//
// Então o cliente falso passou a fazer o que uma pessoa faz: **ler a pergunta e
// responder aquilo.** Ele carrega FATOS sobre o próprio negócio; a cada turno
// procura o fato que responde ao que foi perguntado. Quando nada casa, ele diz
// que não entendeu — como uma pessoa diria — em vez de despejar um dado que
// ninguém pediu.
//
// Efeito colateral que vale ouro: se a casa NUNCA perguntar sobre a verba, o
// cliente nunca fala dela — e o placar mostra a verba vazia. Isso deixa de ser
// "o parser errou" e passa a ser "a casa não perguntou", que é um defeito
// diferente e igualmente caro.
//
// ─── O CASO NÃO É INVENTADO: É O DO CEO ─────────────────────────────────────
//
// "2 posts por dia" e "R$ 500 por mês" são as duas frases exatas do piloto de
// 16/08/2026 que arrebentaram a esteira: o volume chegou ZERADO ao escopo, a
// verba foi ignorada, e o cliente recebeu R$ 1.800–3.400 sem uma palavra sobre
// a diferença. Um roteiro com números redondos e cômodos não pegaria nada
// daquilo. O cliente falso repete o caso que dói.

import { MARCA_DO_CLIENTE_FALSO, DOMINIO_DO_CLIENTE_FALSO } from "./trava-de-saida";

/** O que o cliente está fazendo num turno — as verificações leem isto. */
export type Intencao =
  | "apresenta" | "pede_servico" | "declara_volume" | "declara_publico"
  | "oferece_documento" | "anexa_documento" | "declara_verba" | "declara_prazo"
  | "declara_objetivo" | "responde_livre" | "nao_entendeu";

/**
 * Um fato que o cliente sabe sobre o próprio negócio.
 *
 * `quandoPerguntam` reconhece a pergunta da casa pelo SENTIDO (palavras que a
 * pergunta usa), não pelo texto exato — casar texto exato faria o teste quebrar
 * a cada ajuste de redação, e teste que quebra por redação é teste que o time
 * aprende a ignorar.
 */
export type Fato = {
  id: string;
  quandoPerguntam: RegExp;
  responde: string;
  intencao: Intencao;
};

export type Roteiro = {
  /** Como o pedido aparece na fila de quem olha. Carimbado. */
  nomeDoNegocioNaTela: string;
  /** Como o cliente NOMEIA o negócio falando — sem carimbo: o carimbo dentro da
   *  fala viraria parte do teste do parser, que não é o que se está medindo. */
  nomeDoNegocioNaFala: string;
  contatoDaPorta: { nome: string; email: string; whatsapp: string };
  /** A primeira fala, que ninguém pede: é o cliente se apresentando. */
  aberturaEspontanea: string;
  /** Em que turno o cliente OFERECE o documento por conta própria. */
  turnoDaOfertaDeDocumento: number;
  /** Em que turno ele ANEXA. */
  turnoDoAnexo: number;
  fatos: Fato[];
  /** O que ele diz quando a pergunta não casa com nada que ele saiba. */
  quandoNaoEntende: string;
  declarado: {
    postsPorSemana: number;
    verbaMensal: number;
    fraseDaVerba: string;
    fraseDoVolume: string;
  };
};

export const ROTEIRO_PADRAO: Roteiro = {
  nomeDoNegocioNaTela: `Cantina da Prova ${MARCA_DO_CLIENTE_FALSO}`,
  nomeDoNegocioNaFala: "Cantina da Prova",
  contatoDaPorta: {
    // ── O CARIMBO VAI NO FIM, e a primeira rodada ensinou por quê ───────────
    // Com o carimbo na frente, a saudação da casa saía *"Olá, [TESTE]!"* — ela
    // usa o PRIMEIRO nome. O placar ficava ilegível e, pior, escondia se a casa
    // tinha acertado o nome ou não. Carimbo tem de marcar o dado sem se
    // disfarçar de dado.
    nome: `Marina Prova ${MARCA_DO_CLIENTE_FALSO}`,
    // `.invalid` é reservado pela RFC 2606: não existe e nunca existirá. A trava
    // de saída barra o domínio inteiro mesmo com o modo de teste desligado.
    email: `marina.prova@${DOMINIO_DO_CLIENTE_FALSO}`,
    // 55 + DDD 11 + 9 dígitos, em faixa que não é atribuída a celular no Brasil.
    whatsapp: "5511900000001",
  },
  aberturaEspontanea: "Oi! Somos a Cantina da Prova, um restaurante italiano em Pinheiros.",
  turnoDaOfertaDeDocumento: 5,
  turnoDoAnexo: 6,
  quandoNaoEntende: "Desculpa, não entendi a pergunta. Pode explicar de outro jeito?",
  fatos: [
    { id: "nome_do_negocio", intencao: "apresenta",
      quandoPerguntam: /nome do seu neg[óo]cio|nome da (sua )?empresa|qual (é|e) o nome/i,
      responde: "O restaurante se chama Cantina da Prova." },

    { id: "servico", intencao: "pede_servico",
      quandoPerguntam: /gest[ãa]o de redes sociais, tr[áa]fego pago|est[áa] precisando|buscando gest[ãa]o/i,
      responde: "Quero gestão de redes sociais para o Instagram." },

    { id: "objetivo", intencao: "declara_objetivo",
      quandoPerguntam: /principal objetivo|o que voc[êe] quer alcan[çc]ar/i,
      responde: "Vender mais no almoço de segunda a sexta." },

    { id: "publico", intencao: "declara_publico",
      quandoPerguntam: /p[úu]blico-?alvo|cliente ideal/i,
      responde: "Famílias do bairro, gente que almoça fora durante a semana." },

    { id: "modo", intencao: "responde_livre",
      quandoPerguntam: /contrato mensal|campanha pontual/i,
      responde: "É contrato mensal mesmo, gestão contínua." },

    { id: "canais", intencao: "responde_livre",
      quandoPerguntam: /quais canais|instagram, facebook, tiktok/i,
      responde: "Só Instagram." },

    // ⚠️ O FATO QUE JÁ QUEBROU A CASA DUAS VEZES. A resposta é a frase LITERAL
    // do CEO no piloto de 16/08 — "2 posts por dia" —, com a unidade que ele
    // usou. Trocar para "14 por semana" tornaria o teste cômodo e apagaria
    // exatamente a conversão que falhou.
    { id: "volume", intencao: "declara_volume",
      quandoPerguntam: /quantas postagens por semana|quantas vezes por semana|publicar no feed|ritmo/i,
      responde: "2 posts por dia" },

    { id: "stories", intencao: "responde_livre",
      quandoPerguntam: /stories/i,
      responde: "Stories sim, uns 5 por semana." },

    { id: "reels", intencao: "responde_livre",
      quandoPerguntam: /reels ou v[íi]deos|quantos por m[êe]s/i,
      responde: "Reels não, por enquanto só post e stories." },

    { id: "video", intencao: "responde_livre",
      quandoPerguntam: /gravar e editar|produ[çc][ãa]o do v[íi]deo/i,
      responde: "Não temos ninguém para gravar, mas também não vamos fazer vídeo agora." },

    { id: "fotos", intencao: "responde_livre",
      quandoPerguntam: /fotos|banco de imagens|material visual/i,
      responde: "Temos fotos boas dos pratos, tiradas por um fotógrafo." },

    { id: "copy", intencao: "responde_livre",
      quandoPerguntam: /textos \(copy\)|criar os textos|fornecer o conte[úu]do/i,
      responde: "Preciso que vocês escrevam os textos." },

    { id: "trafego", intencao: "responde_livre",
      quandoPerguntam: /tr[áa]fego pago.*(quer|incluir)|an[úu]ncios no instagram, facebook ou google/i,
      responde: "Anúncios não, agora não." },

    // ── AS DUAS PERGUNTAS DE ANÚNCIO QUE VÊM DEPOIS DO "NÃO" ────────────────
    // A primeira rodada com cliente reativo (23/08/2026) mostrou a casa
    // seguindo o roteiro de tráfego pago DEPOIS de o cliente dizer "anúncios
    // não": ela perguntou a plataforma e a verba de anúncios assim mesmo.
    //
    // Estes dois fatos existem para que o cliente falso NÃO empreste a verba da
    // gestão à pergunta errada. Sem eles, o "R$ 500 por mês" caía na verba de
    // ANÚNCIOS, o campo `budgetRange` ficava vazio, e o placar acusava "a casa
    // perdeu a verba" quando a verdade era "o teste respondeu outra pergunta".
    // Culpa dividida entre instrumento e defeito não acusa ninguém.
    { id: "plataforma_anuncios", intencao: "responde_livre",
      quandoPerguntam: /an[úu]ncios seriam em qual plataforma|meta \(instagram\/facebook\)/i,
      responde: "Nenhuma — eu disse que não quero anúncios agora." },

    { id: "verba_anuncios", intencao: "responde_livre",
      quandoPerguntam: /verba mensal dispon[íi]vel para os an[úu]ncios|vai direto para o google/i,
      responde: "Zero, não vou investir em anúncios agora." },

    // ── OS BÁSICOS OPERACIONAIS (24/08/2026) ─────────────────────────────
    // A casa passou a PERGUNTAR o @ do Instagram, o horário e a área atendida
    // — os três fatos que a Qualidade cobrou nas cinco peças que barrou. O
    // cliente falso responde porque um cliente de verdade responderia: são
    // dados públicos do comércio dele, que ele dá sem pensar.
    //
    // ⚠️ ESTA RESPOSTA SÓ EXISTE PORQUE A PERGUNTA EXISTE. Enfiar estes fatos
    // no roteiro sem a casa perguntar seria alimentar dado por um canal que a
    // produção real não tem — o mesmo pecado de escrever `directionApprovedAt`
    // no banco. A pergunta veio primeiro; a resposta veio depois.
    //
    // ⚠️ A ORDEM IMPORTA, e ela é o conserto de uma medição: este fato vem
    // ANTES de `area` de propósito. `area` casa com /cidade/ e a pergunta em
    // bloco fala em "bairros ou cidades" — na primeira volta ela respondeu só a
    // área e engoliu o Instagram e o horário. Fato mais específico primeiro.
    //
    // ⚠️ SEM NÚMERO DE TELEFONE, de propósito: `semPii` apaga sequências de 8+
    // dígitos antes de o texto chegar ao modelo. A peça precisa saber que o
    // negócio ATENDE por WhatsApp, não o número dele.
    { id: "operacao_basica", intencao: "responde_livre",
      quandoPerguntam: /@ do seu instagram|hor[áa]rio e dias|bairros ou cidades/i,
      responde:
        "Nosso Instagram é @cantinadaprova. Abrimos de terça a domingo, das 11h30 às 15h "
        + "e das 18h30 às 23h. Atendemos Pinheiros e Vila Madalena, e sim, atendemos por WhatsApp." },

    { id: "area", intencao: "responde_livre",
      quandoPerguntam: /onde est[ãa]o os clientes|cidade|raio/i,
      responde: "São Paulo, aqui no bairro mesmo — uns 3 km." },

    { id: "identidade", intencao: "responde_livre",
      quandoPerguntam: /identidade visual|j[áa] tem logo|logo\/identidade/i,
      responde: "Já temos logo, não precisa criar." },

    { id: "referencias", intencao: "responde_livre",
      quandoPerguntam: /concorrentes ou refer[êe]ncias|inspira[çc][ãa]o/i,
      responde: "Gosto do perfil do Bráz e do Carlos Pizza." },

    // ⚠️ O SEGUNDO FATO QUE JÁ QUEBROU A CASA. A frase é a do CEO.
    // ⚠️ O MATCHER É ESTREITO DE PROPÓSITO. Ele casa SÓ com a pergunta da faixa
    // de orçamento da GESTÃO (`budget_range`), nunca com a verba de anúncios —
    // ver o comentário dos dois fatos de anúncio acima.
    { id: "verba", intencao: "declara_verba",
      quandoPerguntam: /faixa de or[çc]amento|or[çc]amento mensal voc[êe] tem em mente|investimento mensal para a gest/i,
      responde: "Nosso orçamento é de R$ 500 por mês." },

    { id: "prazo", intencao: "declara_prazo",
      quandoPerguntam: /para quando voc[êe] quer come[çc]ar|prazo/i,
      responde: "Queremos começar no mês que vem." },
  ],
  declarado: {
    postsPorSemana: 14, // "2 posts por dia" × 7
    verbaMensal: 500,
    fraseDaVerba: "R$ 500 por mês",
    fraseDoVolume: "2 posts por dia",
  },
};

export const ARQUIVO_DO_CLIENTE_FALSO = "briefing-cantina-da-prova.pdf";

/** A oferta de documento — dita por vontade própria, não em resposta a nada. */
export const OFERTA_DE_DOCUMENTO = "Posso te mandar nosso briefing em PDF, ajuda?";

/**
 * O cérebro do cliente falso: dada a pergunta da casa, qual fato responde?
 *
 * `jaUsados` existe porque pessoa não repete a mesma informação — se a casa
 * pergunta duas vezes a mesma coisa, o cliente falso NÃO responde de novo em
 * silêncio: ele cai no "não entendi", e o placar registra a repetição. Repetir
 * a resposta esconderia a pergunta repetida, que é um dos defeitos do CEO.
 */
export function fatoQueResponde(
  perguntaDaCasa: string, roteiro: Roteiro, jaUsados: Set<string>,
): Fato | null {
  for (const f of roteiro.fatos) {
    if (jaUsados.has(f.id)) continue;
    if (f.quandoPerguntam.test(perguntaDaCasa)) return f;
  }
  return null;
}
