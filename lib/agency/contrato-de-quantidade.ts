// contrato-de-quantidade.ts — A FONTE ÚNICA DO QUANTO E DO ONDE.
//
// ═══ O DEFEITO QUE PRODUZIU ESTE ARQUIVO ════════════════════════════════════
//
// Medido em produção na rodada 5 do case Farol 27 (25/08/2026). A cliente pediu
// no briefing 4 posts/semana, ZERO stories e 6 reels/mês. A proposta que saiu
// prometeu "5 posts + 7 stories/semana · 4 reels/mês". O contrato interno da
// casa (`MISTURA_DE_FORMATOS`, em `execution/especialistas.ts`) admite no
// MÁXIMO 3 stories. O especialista obedecia à proposta, o contrato recusava,
// três tentativas, `blocked`.
//
// Nenhuma mão destravava isso, e não é falta de zelo: era impasse por
// CONSTRUÇÃO. A proposta prometia o que o contrato proíbe, e as duas verdades
// viviam em arquivos diferentes. **Verdade escrita em dois lugares já está
// errada em um deles** — a única pergunta é quando alguém descobre.
//
// ═══ O QUE ESTE ARQUIVO É ═══════════════════════════════════════════════════
//
// O lugar ÚNICO onde a casa declara quanto ela entrega de cada formato e em
// quais canais ela trabalha. Quem VENDE (`live-calculator.computeEstimate`, a
// proposta que o cliente lê) e quem CONFERE (`contratoDasLegendas`, o contrato
// da produção) leem daqui — o mesmo objeto, não duas cópias que combinam hoje.
//
// A prova de que é uma fonte só está em teste por IDENTIDADE de objeto:
// `expect(MISTURA_DE_FORMATOS).toBe(LIMITES_POR_FORMATO)`. Igualdade de valor
// passaria com duas tabelas gêmeas — que é exatamente o defeito.
//
// ═══ O QUE ESTE ARQUIVO NÃO FAZ ═════════════════════════════════════════════
//
// • **Não afrouxa nada.** Os números são os que a produção já cobrava. O
//   conserto do impasse é a proposta parar de prometer acima deles — nunca a
//   régua descer até a promessa.
// • **Não decide preço.** Faixa de preço continua em `live-calculator`.
// • **Não inventa canal.** Quem sabe se um canal existe é o registro de
//   guardiões da mídia, e é dele que se lê.

import { GUARDIOES, type CanalDeMidia } from "@/lib/integrations/midia/guardioes";

/**
 * A MISTURA DE FORMATOS — quantas peças de cada formato cabem numa entrega.
 *
 * Veio de `execution/especialistas.ts`, onde nasceu, sem um número alterado.
 * Está aqui porque quem escreve a proposta também precisa dela, e ir buscá-la
 * dentro do motor de produção arrastaria a produção inteira para a sala de
 * briefing (que roda no navegador).
 */
export const LIMITES_POR_FORMATO = { carrossel: [1, 2], story: [2, 3], feed: [2, 3] } as const;

export type FormatoComLimite = keyof typeof LIMITES_POR_FORMATO;

/** O teto de um formato — o número que a proposta não pode passar. */
export function tetoDoFormato(f: FormatoComLimite): number {
  return LIMITES_POR_FORMATO[f][1];
}

/** O piso de um formato, quando ele está no escopo. */
export function pisoDoFormato(f: FormatoComLimite): number {
  return LIMITES_POR_FORMATO[f][0];
}

/**
 * ── O TETO SEMANAL DA CASA (25/08/2026) ────────────────────────────────────
 *
 * Até hoje o teto da proposta era o teto da MISTURA — 3 stories, 3 posts — e
 * eles eram a forma de um lote de 12 peças, não a capacidade da casa. Com a
 * capacidade em levas, a capacidade é `TETO_MENSAL` peças por mês, e o que a
 * proposta não pode passar é ISSO, repartido por semana.
 *
 * É derivado, nunca digitado: quem mudar `ENTREGAS_POR_MES` ou o teto por
 * passada move este número junto. Um teto de venda escrito à mão ao lado de um
 * teto de produção é a família de defeito que este arquivo inteiro existe para
 * não repetir.
 *
 * ⚠️ O teto por passada mora em `execution/escopo-do-cliente.ts` e vale 12; ele
 * NÃO é importado aqui porque este arquivo é lido pela sala de briefing, que
 * roda no navegador, e aquele módulo arrasta a produção junto. O valor é
 * repetido como constante local e o teste
 * `a-vitrine-nao-promete-acima-do-teto` prova que os dois são o mesmo número —
 * é a mesma prova por identidade que guarda a mistura.
 */
/** Levas de produção por ciclo. TRÊS — ver `PLANO_DE_LEVAS` em
 *  `execution/escopo-do-cliente.ts` para o porquê do número e do ritmo.
 *  O teto mensal da casa é este número vezes `TETO_DE_PECAS_POR_ENTREGA`. */
export const ENTREGAS_POR_MES = 3;

export const TETO_DE_PECAS_POR_PASSADA_ESPELHO = 12;

/** O que a casa entrega num mês, pelo que o código faz. */
export const TETO_MENSAL = TETO_DE_PECAS_POR_PASSADA_ESPELHO * ENTREGAS_POR_MES;

/** O que a proposta pode prometer por semana, somando TODOS os formatos.
 *  Quatro semanas por mês (e não 4,33): o calendário do cliente é mensal. */
export const TETO_SEMANAL_DA_CASA = Math.floor(TETO_MENSAL / 4);

/**
 * O que a casa PODE oferecer de um formato, dado o que o cliente pediu.
 *
 * ── AS TRÊS RESPOSTAS, E NENHUMA É SILENCIOSA ──────────────────────────────
 *
 *   • Pediu ZERO (ou não pediu): oferece zero. **Zero é resposta**, não campo
 *     vazio — foi o cliente que escreveu. A proposta não inventa volume, e o
 *     contrato de produção não cobra formato que ele recusou.
 *   • Pediu dentro do teto: oferece exatamente o que ele pediu.
 *   • Pediu acima do teto: oferece o TETO e devolve a recusa POR ESCRITO, com
 *     a instrução gêmea — toda proibição diz também o que é possível. Recusar
 *     12 posts sem dizer "até 9 por semana" é mandar o cliente adivinhar.
 *
 * Devolver a recusa como DADO, e não como texto solto, é o ponto: quem chama
 * não tem como esquecer de mostrá-la, porque ela vem junto do número.
 */
export interface QuantidadeQueCabe {
  /** O que a proposta pode prometer. Nunca acima do teto da casa. */
  oferecido: number;
  /** Preenchido só quando o pedido do cliente passou do que a casa faz. */
  recusa: {
    pedido: number;
    teto: number;
    /** Uma frase, para o cliente ler. Já contém a instrução gêmea. */
    frase: string;
  } | null;
}

const NOME_NO_PLURAL: Record<FormatoComLimite, string> = {
  carrossel: "carrosséis",
  story: "stories",
  feed: "posts",
};

function pedidoLegivel(pedidoPorSemana: number | undefined): number {
  if (typeof pedidoPorSemana !== "number" || !Number.isFinite(pedidoPorSemana) || pedidoPorSemana <= 0) return 0;
  return Math.floor(pedidoPorSemana);
}

function recusaDe(formato: FormatoComLimite, pedido: number, teto: number): QuantidadeQueCabe["recusa"] {
  const nome = NOME_NO_PLURAL[formato];
  return {
    pedido,
    teto,
    frase:
      `Você pediu ${pedido} ${nome} por semana e a nossa entrega vai até ${teto} por semana — ` +
      `é o que a produção fecha com a qualidade que a gente assina. ` +
      `A proposta está montada com ${teto} ${nome}/semana; ` +
      `se ${pedido} for essencial pra você, a gente conversa sobre uma segunda frente antes de fechar.`,
  };
}

export function quantidadeQueCabe(
  formato: FormatoComLimite,
  pedidoPorSemana: number | undefined,
): QuantidadeQueCabe {
  const pedido = pedidoLegivel(pedidoPorSemana);
  if (pedido === 0) return { oferecido: 0, recusa: null };
  if (pedido <= TETO_SEMANAL_DA_CASA) return { oferecido: pedido, recusa: null };
  return { oferecido: TETO_SEMANAL_DA_CASA, recusa: recusaDe(formato, pedido, TETO_SEMANAL_DA_CASA) };
}

/**
 * O QUE CABE NA SEMANA, LIDO EM BLOCO — porque o teto é do TOTAL.
 *
 * ── O buraco que uma leitura formato a formato deixa ────────────────────────
 *
 * `quantidadeQueCabe` sozinha responde por UM formato. Chamada duas vezes, ela
 * aprova 9 posts E 9 stories: 18 peças por semana, 72 por mês, contra uma casa
 * que entrega 36. Cada resposta certa, a soma errada — é a mesma
 * junta que arrebentou no case Farol 27, onde cada peça passava no seu teste.
 *
 * Aqui o teto é aplicado ao TOTAL. Quando o pedido inteiro cabe, cada formato
 * sai exatamente como o cliente pediu. Quando não cabe, o corte é proporcional
 * ao que ele pediu (quem pediu mais cede mais), nunca zerando um formato que
 * ele pediu enquanto sobra espaço — e cada formato cortado volta com a recusa
 * escrita, com o que cabe no lugar.
 */
export function quantidadesQueCabemNaSemana(
  pedidos: Partial<Record<FormatoComLimite, number | undefined>>,
): Record<FormatoComLimite, QuantidadeQueCabe> {
  const fs = ["carrossel", "story", "feed"] as const;
  const pedido: Record<FormatoComLimite, number> = {
    carrossel: pedidoLegivel(pedidos.carrossel),
    story: pedidoLegivel(pedidos.story),
    feed: pedidoLegivel(pedidos.feed),
  };
  const total = fs.reduce((s2, f) => s2 + pedido[f], 0);

  const resposta = {} as Record<FormatoComLimite, QuantidadeQueCabe>;
  if (total <= TETO_SEMANAL_DA_CASA) {
    for (const f of fs) resposta[f] = { oferecido: pedido[f], recusa: null };
    return resposta;
  }

  // Corte proporcional, pelo maior resto — a soma bate com o teto, sempre.
  const exatos = fs.map((f) => ({ f, exato: (pedido[f] * TETO_SEMANAL_DA_CASA) / total }));
  const oferta: Record<FormatoComLimite, number> = { carrossel: 0, story: 0, feed: 0 };
  for (const { f, exato } of exatos) oferta[f] = Math.floor(exato);
  let sobra = TETO_SEMANAL_DA_CASA - fs.reduce((s2, f) => s2 + oferta[f], 0);
  for (const { f } of [...exatos].sort((a, b) => (b.exato % 1) - (a.exato % 1))) {
    if (sobra <= 0) break;
    if (pedido[f] === 0) continue;
    oferta[f] += 1;
    sobra -= 1;
  }

  for (const f of fs) {
    resposta[f] = pedido[f] > oferta[f]
      ? { oferecido: oferta[f], recusa: recusaDe(f, pedido[f], oferta[f]) }
      : { oferecido: oferta[f], recusa: null };
  }
  return resposta;
}

// ═══ OS CANAIS ══════════════════════════════════════════════════════════════
//
// A proposta do Farol 27 mandava a verba para "Google/Meta" — texto fixo, no
// código — quando a cliente tinha pedido **Meta e TikTok**. Inventar um canal
// que ela não pediu e apagar um que ela pediu é, para quem lê, a prova de que
// ninguém escutou. E trocar o TikTok pelo Meta em silêncio seria pior ainda:
// ela descobriria depois de pagar.
//
// Quem sabe se um canal existe nesta casa é o registro de guardiões da mídia
// (`lib/integrations/midia/guardioes.ts`), que é a mesma régua que barra a
// verba na hora de criar campanha. Uma lista nova aqui seria a segunda régua —
// exatamente o defeito que este arquivo existe para não repetir.

export interface CanalPedido {
  /** Como o cliente escreveu. */
  comoOClientePediu: string;
  /** O canal do registro, quando dá para reconhecer. */
  canal: CanalDeMidia | null;
  /** A casa entrega neste canal hoje? Desconhecido é NÃO (falha fechada). */
  atendido: boolean;
  /** Preenchido quando não atende: a frase que o cliente lê. */
  frase?: string;
}

/** As formas como gente escreve o nome do canal. Meta cobre Instagram e
 *  Facebook porque é literalmente a mesma integração (`meta/client.ts`). */
const APELIDOS: { padrao: RegExp; canal: CanalDeMidia }[] = [
  { padrao: /instagram|\binsta\b|facebook|\bface\b|\bmeta\b/i, canal: "meta_ads" },
  { padrao: /tik\s*tok/i, canal: "tiktok_ads" },
  { padrao: /google|\bads?\s+do\s+google\b/i, canal: "google_ads" },
  { padrao: /youtube|\byt\b/i, canal: "youtube_ads" },
  { padrao: /linked\s*in/i, canal: "linkedin_ads" },
];

/**
 * Lê um canal escrito por gente e diz se a casa o atende.
 *
 * FALHA FECHADA: canal que não dá para reconhecer volta como NÃO atendido, com
 * a frase pedindo confirmação. Ausência de informação não é informação — e
 * dizer "sim" a um canal desconhecido é vender o que não se produz.
 */
export function lerCanal(comoOClientePediu: string): CanalPedido {
  const bruto = (comoOClientePediu ?? "").trim();
  const achado = APELIDOS.find((a) => a.padrao.test(bruto));

  if (!achado) {
    return {
      comoOClientePediu: bruto,
      canal: null,
      atendido: false,
      frase:
        `${bruto}: não conseguimos confirmar que atendemos este canal hoje — ` +
        "antes de fechar, a gente confirma com você em vez de prometer.",
    };
  }

  const g = GUARDIOES[achado.canal];
  if (g.temIntegracaoDeEscrita) {
    return { comoOClientePediu: bruto, canal: achado.canal, atendido: true };
  }
  return {
    comoOClientePediu: bruto,
    canal: achado.canal,
    atendido: false,
    frase:
      `${g.rotulo}: **a casa não entrega neste canal hoje** — não temos integração com ele, ` +
      "e por isso ele não entra na proposta. Estamos dizendo isso agora, e não depois: " +
      "o que está aqui dentro é só o que a gente produz de verdade.",
  };
}

/** Os canais pedidos, lidos em bloco. Preserva a ordem em que o cliente falou. */
export function lerCanais(pedidos: readonly string[] | undefined): CanalPedido[] {
  return (pedidos ?? [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .map(lerCanal);
}

// ═══ O TETO MENSAL — A DÍVIDA FOI PAGA PELA CAPACIDADE (25/08/2026) ════════
//
// ── O QUE ESTE BLOCO DIZIA ATÉ HOJE ─────────────────────────────────────────
//
// Dizia que a casa entregava UMA passada por mês, de 12 peças, e que a tabela
// de planos anunciava de 2,8× a 13,3× isso. Nenhum plano cabia. A escolha
// estava escalada ao CEO em dois consertos opostos: baixar a vitrine até 12, ou
// fazer a PRODUÇÃO entregar mais.
//
// ── O QUE MUDOU, E POR QUE É (b) ────────────────────────────────────────────
//
// O CEO bateu o martelo em (b), com o número que dissolveu o dilema: **cada
// peça custa à casa ~R$ 1,30** entre texto e imagem. 32 peças custam ~R$ 45
// contra um plano de R$ 1.790. O limite de 12 nunca foi de dinheiro — era de
// SOFTWARE: `retomarProducao` rodava uma vez por ciclo e a idempotência do
// motor era por especialista DENTRO DO CICLO, então a segunda passada do mês
// não tinha como existir.
//
// A capacidade passou a ser entregue em LEVAS dentro do mesmo ciclo (ver
// `lib/agency/esteira/levas.ts` e `execution/escopo-do-cliente.ts`): três
// levas, uma a cada dez dias, cada uma limitada pelo mesmo
// `TETO_DE_PECAS_POR_ENTREGA` de sempre. Nenhum teto foi afrouxado; o que
// mudou é quantas vezes ele é aplicado no mês.
//
// ⚠️ **Nenhum relógio novo foi criado.** As levas pegam carona no despertador
// que já bate a cada 5 minutos — a mesma perna que já retomava produção parada.
// Esta casa perdeu dez dias com um cron que morreu em silêncio com o painel
// verde; um segundo agendador seria o mesmo defeito com outra roupa.
//
// ── A CATRACA CONTINUA, E AGORA MORDE NO ZERO ───────────────────────────────
//
// `DIVIDA_DA_VITRINE` está VAZIO, e é isso que o registro tem de mostrar:
// dívida paga sai do registro. O teste
// `__tests__/comercial/a-vitrine-nao-promete-acima-do-teto` passou a exigir que
// TODO plano caiba em `TETO_MENSAL` — plano novo acima do teto quebra o build,
// e plano existente que suba acima dele também. A catraca não afrouxou: ela
// girou para o lado bom e travou lá.


/**
 * A DÍVIDA DA VITRINE — vazia desde 25/08/2026.
 *
 * Era o registro dos planos que prometiam mais do que a casa entregava. Fica
 * declarado como registro VAZIO, e não apagado: o teste lê este objeto para
 * dizer "plano que não cabe no teto precisa entrar aqui com o número medido, e
 * aí a dívida da casa cresceu e alguém tem de saber".
 */
export const DIVIDA_DA_VITRINE: Record<string, number> = {};

// ═══ A MISTURA DE UM LOTE — proporção, e não número absoluto ════════════════
//
// ── POR QUE A MISTURA PRECISOU DEIXAR DE SER ABSOLUTA ───────────────────────
//
// `LIMITES_POR_FORMATO` descreve a forma de um lote de 12 peças, e o que sobrava
// ia para REEL — o único formato sem teto na mistura. Duas coisas quebraram esse
// arranjo no mesmo dia:
//
//   1. **Reel saiu da casa.** A Dioli não edita vídeo, e vender reel é a mesma
//      dívida que saiu da vitrine em D-0A3: promessa sem produtor. Sem reel, o
//      excedente não tem para onde ir e a régua reprova o lote inteiro.
//   2. **Os lotes deixaram de ter 12 peças.** Com levas, o Essencial entrega
//      lotes de 4 — e a mistura absoluta pede no MÍNIMO 1+2+2 = 5. Ou seja, a
//      régua antiga já era impossível para o lote pequeno, não só para o grande.
//
// Então a mistura vira PROPORÇÃO: os pesos são os tetos históricos de cada
// formato (carrossel 2, story 3, feed 3 — a mesma tabela, sem um número novo), e
// o lote é repartido entre os formatos CONTRATADOS na razão desses pesos.
//
// Isto não afrouxa: a variedade continua exigida (nenhum formato do escopo fica
// em zero quando o lote comporta), e o total continua sendo o que o cliente
// comprou. O que deixou de existir é o teto absoluto que só fazia sentido para
// um lote de 12 com reel absorvendo a sobra.

/** Quanto a régua tolera para cima e para baixo do número exato da receita.
 *  UMA peça: o suficiente para o especialista não ser reprovado por um
 *  arredondamento, e pouco o bastante para o mês não sair todo num formato. */
export const TOLERANCIA_DA_MISTURA = 1;

export type ReceitaDeLote = Record<FormatoComLimite, number>;

/**
 * A RECEITA EXATA de um lote: quantas peças de cada formato contratado.
 *
 * Reparte `lote` entre `permitidos` na razão dos tetos de `LIMITES_POR_FORMATO`,
 * pelo método do maior resto — que é o único que garante que a soma bate com o
 * lote sem sobrar aritmética para o modelo. Aritmética deixada para o modelo é
 * aritmética que uma hora sai errada.
 *
 * `permitidos` é o que o CLIENTE comprou. Formato fora do escopo não entra na
 * receita nem com peso zero: ele não existe para este cliente.
 */
export function receitaDoLote(
  lote: number,
  permitidos: readonly FormatoComLimite[],
): ReceitaDeLote {
  const vazia = { carrossel: 0, story: 0, feed: 0 } as ReceitaDeLote;
  const fs = (["carrossel", "story", "feed"] as const).filter((f) => permitidos.includes(f));
  if (fs.length === 0 || !Number.isFinite(lote) || lote <= 0) return vazia;

  const pesoTotal = fs.reduce((s, f) => s + tetoDoFormato(f), 0);
  const exatos = fs.map((f) => ({ f, exato: (lote * tetoDoFormato(f)) / pesoTotal }));
  const receita = { ...vazia };
  for (const { f, exato } of exatos) receita[f] = Math.floor(exato);

  // O maior resto leva as peças que a divisão inteira deixou na mesa.
  let sobra = lote - fs.reduce((s, f) => s + receita[f], 0);
  const porResto = [...exatos].sort((a, b) => (b.exato % 1) - (a.exato % 1));
  for (let i = 0; sobra > 0; i++, sobra--) receita[porResto[i % porResto.length]!.f] += 1;

  return receita;
}

/** A RÉGUA de um lote: a receita com a tolerância de uma peça para cada lado.
 *  É esta faixa que o contrato de saída confere, e é ela que o pedido do
 *  especialista recita — os dois saem da MESMA função, para não existir a
 *  segunda tabela que envelhece sozinha. */
export function misturaDoLote(
  lote: number,
  permitidos: readonly FormatoComLimite[],
): Record<FormatoComLimite, readonly [number, number]> {
  const r = receitaDoLote(lote, permitidos);
  const faixa = (n: number): readonly [number, number] =>
    [Math.max(0, n - TOLERANCIA_DA_MISTURA), n + TOLERANCIA_DA_MISTURA] as const;
  return { carrossel: faixa(r.carrossel), story: faixa(r.story), feed: faixa(r.feed) };
}
