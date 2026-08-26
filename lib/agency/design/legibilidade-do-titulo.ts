// legibilidade-do-titulo.ts — O TÍTULO SOBRE FOTOGRAFIA, MEDIDO NO ARQUIVO.
//
// ═══════════════════════════════════════════════════════════════════════════
// A DÍVIDA QUE ESTE ARQUIVO FECHA (Auditor, 4ª e 5ª rodadas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Item 3 do `O_QUE_NAO_FOI_MEDIDO`, escrito pela própria casa contra si mesma:
//
//   "O portão de contraste mede pares de superfície CHAPADA. Na peça que saiu,
//    o título é branco sobre foto de alto ruído, e **ninguém mede esse par**.
//    O portão não reprova porque não olha para lá."
//
// O Auditor abriu a peça e confirmou com os olhos: o título estava no limite da
// ilegibilidade. É a dívida de maior consequência para quem paga — o título é a
// primeira coisa que o cliente do cliente lê, e a única que ele lê se estiver
// com pressa.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO NÃO É UM SEGUNDO `contraste.ts`
// ═══════════════════════════════════════════════════════════════════════════
//
// `contraste.ts` mede um PAR DE CORES: a primária da marca contra a tinta que
// `tintaSobre` escolheu. É a régua certa para superfície chapada — e ele diz,
// com todas as letras, que NÃO mede texto sobre foto, porque ali não há uma cor
// de fundo, há milhões.
//
// Aqui o fundo é medido, não declarado: os PIXELS REAIS do JPEG que saiu, dentro
// da caixa que o título ocupa (`ConferenciaDaLetra.tituloCaixa`, medida no DOM
// depois do encolhimento — que é quando ela é verdade). A fórmula é a MESMA
// (`razaoDeContraste`, WCAG): duas réguas com fórmulas diferentes não se
// conferem, se contradizem.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA RÉGUA AFIRMA — E O QUE ELA AINDA NÃO AFIRMA
// ═══════════════════════════════════════════════════════════════════════════
//
// AFIRMA: o pior pedaço do fundo sob o título tem contraste X com a tinta do
// título. "Pior pedaço" e não "média": a média é a armadilha desta medição —
// um fundo metade preto e metade branco tem média cinza e contraste médio
// aceitável, e o título some justamente na metade clara. A pessoa lê a linha
// inteira, não a média dela.
//
// NÃO AFIRMA: que a peça está bonita, que a tipografia é boa, ou que o título
// é legível a três metros. Legibilidade tipográfica continua não medida, e
// continua declarada.

import { luminancia, corValida } from "./molde";
import { razaoDeContraste, CONTRASTE_MINIMO } from "./contraste";

/**
 * O PISO PARA O TÍTULO, e por que ele NÃO é o mesmo de `contraste.ts`.
 *
 * `CONTRASTE_MINIMO` (4,5:1) é o piso da WCAG AA para texto NORMAL, e lá ele é
 * o certo porque a mesma tinta escreve a assinatura, que é pequena.
 *
 * O título de um story tem 96px em 1920 de altura. A WCAG chama isso de texto
 * grande com folga, e o piso de texto grande é 3:1. Adotar 4,5 aqui reprovaria
 * peças legíveis, e uma régua que reprova o que está bom é abandonada na
 * primeira semana — e aí não protege ninguém.
 *
 * O que NÃO se faz é o contrário: afrouxar abaixo de 3.
 */
export const CONTRASTE_MINIMO_DO_TITULO = 3;

/**
 * O PISO QUE **BARRA** A PEÇA — e por que ele não é 3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A DECISÃO, TOMADA POR MEDIÇÃO (6ª rodada do cliente oculto)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta que chegou foi: a peça marcada `[titulo ilegivel] 2,61:1` sai
 * declarada ou é barrada? A rodada anterior escolheu DECLARAR, e escreveu o
 * motivo: a medida "erra para o lado seguro", então uma peça no limite podia
 * ser marcada sem estar perdida, e jogar fora peça paga por medida
 * conservadora seria trocar um prejuízo por outro.
 *
 * O raciocínio estava certo. O número era outro. Medido em experimento
 * controlado (`.sonda/vies.mts`, fundos chapados, tinta branca):
 *
 *   VERDADEIRA 7,00:1 → a régua antiga media **2,07** (15% de letra na faixa)
 *   VERDADEIRA 7,00:1 → a régua antiga media **1,00** (30% de letra)
 *   VERDADEIRA 3,45:1 → a régua antiga media **1,64**
 *
 * Não era um erro "para o lado seguro": era um erro de até **86%**, que
 * colapsava em 1,00 assim que a letra ocupava um terço da faixa. Naquele
 * regime o número não descrevia o fundo — descrevia quanta tinta havia na
 * faixa. `2,61:1` podia ser um título de 7:1, e ninguém tinha como saber.
 * Declarar sobre isso era alarme sobre o normal; barrar teria sido jogar fora
 * peça paga e legível. A rodada anterior acertou a decisão com o diagnóstico
 * pela metade — e isto aqui é a outra metade, dita com todas as letras.
 *
 * Com a medição consertada (`piorPedacoReal`), sobre TEXTO DE VERDADE
 * (`.sonda/vies3.mts` — glifos rasterizados, com anti-aliasing real):
 *
 *   VERDADEIRA 7,00 → medida 6,39   (−8,7%)
 *   VERDADEIRA 4,54 → medida 4,00   (−11,9%)
 *   VERDADEIRA 3,45 → medida 3,23   (−6,4%)
 *   VERDADEIRA 2,61 → medida 2,22   (−14,9%)
 *   VERDADEIRA 1,54 → medida 1,33   (−13,6%)
 *
 * Erro residual entre −6% e −15%, sempre na direção segura. AGORA dá para
 * barrar — e a margem sai da medição, não do gosto:
 *
 *   3,00 × (1 − 0,15) = 2,55
 *
 * Abaixo de 2,55 a peça é BARRADA: mesmo no pior erro medido da régua, o fundo
 * real está abaixo do piso de texto grande da WCAG. Não há peça legítima
 * sendo jogada fora nessa faixa — foi medido, não suposto.
 *
 * Entre 2,55 e 3,00 continua a DECLARAÇÃO de sempre: é a faixa em que o erro
 * da régua ainda pode conter uma peça legítima, e ali a casa marca, mostra ao
 * time e deixa passar. Duas respostas porque há duas situações, e chamá-las de
 * uma só foi o que produziu a pergunta.
 *
 * ⚠️ Se `piorPedacoReal` melhorar (erro residual menor), este número desce em
 * direção a 3 — e só com medição nova ao lado. Nunca por gosto.
 */
export const CONTRASTE_QUE_BARRA_O_TITULO = 2.55;

/** A peça tem de ser BARRADA por título ilegível? `null` (não medido) NÃO
 *  barra: ausência de medida não é veredito, e a declaração já cobre o caso. */
export function tituloReprovaAPeca(m: MedidaDaLegibilidade | null | undefined): boolean {
  return m != null && m.razaoNoPior < CONTRASTE_QUE_BARRA_O_TITULO;
}

/** Quanto do bloco é amostrado. Reduzir a leitura não muda a resposta e evita
 *  percorrer ~200 mil pixels por peça. */
const PASSO_DA_AMOSTRA = 3;

/**
 * Em quantas faixas horizontais a caixa é dividida antes de medir.
 *
 * O PIOR PEDAÇO precisa de um pedaço. Medindo a caixa inteira como uma coisa
 * só, o degradê do molde (escuro embaixo, claro em cima) vira uma média que
 * não descreve nenhuma linha do título. Faixa a faixa, a linha que sumiu
 * aparece.
 */
const FAIXAS = 6;

/**
 * Quanto da faixa uma cor precisa ocupar para valer como PEDAÇO DE FUNDO.
 *
 * 8% da amostra não-tinta. Abaixo disso é franja anti-aliasing: os pixels a
 * meio caminho entre a letra e o fundo, que existem em toda letra, somam muito
 * no total e pouco em CADA faixa de cor, porque estão espalhados por todo o
 * caminho entre as duas pontas.
 *
 * O número é folgado para o lado seguro. Um pedaço de fundo que de fato engole
 * o título — a metade clara da foto, o buraco no degradê — ocupa dezenas de por
 * cento da faixa; um que ocupe menos de 8% não some com uma linha de texto.
 *
 * Quando NENHUMA faixa alcança a massa (título minúsculo, caixa quase toda
 * borda), a régua devolve `null` para a faixa: ausência de medida, nunca
 * aprovação.
 */
const MASSA_MINIMA_DO_PEDACO = 0.08;

/** Largura da faixa de cor no histograma, por canal. 16 níveis por canal: fino
 *  o bastante para separar o fundo claro do escuro, grosso o bastante para o
 *  ruído de compressão de um JPEG cair todo no mesmo balde. */
const PASSO_DO_HISTOGRAMA = 16;

/**
 * O PIOR PEDAÇO DE FUNDO DE VERDADE — por massa, não por posição na cauda.
 *
 * Junta os pixels de fundo por faixa de cor, joga fora as faixas magras (a
 * franja da letra) e devolve, entre as que sobraram, a de PIOR contraste.
 */
function piorPedacoReal(
  pixels: ReadonlyArray<{ razao: number; cor: string; r: number; g: number; b: number }>,
): { razao: number; cor: string } | null {
  const baldes = new Map<string, { n: number; razao: number; cor: string }>();
  for (const p of pixels) {
    const chave =
      `${Math.floor(p.r / PASSO_DO_HISTOGRAMA)}:` +
      `${Math.floor(p.g / PASSO_DO_HISTOGRAMA)}:` +
      `${Math.floor(p.b / PASSO_DO_HISTOGRAMA)}`;
    const atual = baldes.get(chave);
    // Guarda o PIOR pixel do balde como representante: dentro de um balde as
    // cores são vizinhas, e escolher o pior mantém o erro do lado seguro.
    if (!atual) baldes.set(chave, { n: 1, razao: p.razao, cor: p.cor });
    else {
      atual.n += 1;
      if (p.razao < atual.razao) { atual.razao = p.razao; atual.cor = p.cor; }
    }
  }
  const piso = pixels.length * MASSA_MINIMA_DO_PEDACO;
  let melhor: { razao: number; cor: string } | null = null;
  for (const b of baldes.values()) {
    if (b.n < piso) continue;
    if (!melhor || b.razao < melhor.razao) melhor = { razao: b.razao, cor: b.cor };
  }
  return melhor;
}

/**
 * Este pixel é a própria letra?
 *
 * A letra não é procurada, ela é RECONHECIDA: `tinta` é a cor com que o DOM a
 * pintou. A tolerância existe porque o rasterizador não pinta a letra em cor
 * chapada — há compressão e sub-pixel. É folgada de propósito: sobrar tinta na
 * amostra de fundo puxa a razão para baixo (erro seguro), enquanto engolir
 * fundo escuro por engano a puxaria para cima (erro que aprova ilegível).
 */
function ehTinta(r: number, g: number, b: number, alvo: [number, number, number]): boolean {
  // 24 níveis. A razão de contraste entre duas cores a 24 níveis de distância é
  // ~1,2:1 — ou seja, o fundo que esta tolerância engole por engano já era
  // ilegível de qualquer jeito. E quando ela engole a faixa INTEIRA, o ramo
  // fail-closed acima devolve ~1:1 e barra, em vez de calar.
  const TOLERANCIA = 24;
  return Math.abs(r - alvo[0]) <= TOLERANCIA
      && Math.abs(g - alvo[1]) <= TOLERANCIA
      && Math.abs(b - alvo[2]) <= TOLERANCIA;
}

/** A tinta declarada, em canais. `null` só se `corValida` já tiver reprovado. */
function canaisDaTinta(tinta: string): [number, number, number] | null {
  const t = tinta.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(t) ?? /^#?([0-9a-f]{3})$/i.exec(t);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split("").map((ch) => ch + ch).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export interface MedidaDaLegibilidade {
  /** A razão do PIOR pedaço do fundo sob o título. É esta que decide. */
  razaoNoPior: number;
  /** A razão do fundo médio — só para o registro de oficina. Nunca decide. */
  razaoNaMedia: number;
  /** A tinta do título, como o DOM a computou. */
  tinta: string;
  /** A cor do pior pedaço do fundo, em `#rrggbb`. */
  fundoNoPior: string;
  suficiente: boolean;
}

export interface CaixaDoTitulo {
  x: number; y: number; largura: number; altura: number;
}

/**
 * MEDE A LEGIBILIDADE DO TÍTULO NO ARQUIVO QUE SAIU.
 *
 * Nunca lança: imagem que não decodifica, caixa fora do quadro ou tinta
 * inválida devolvem `null`. E **`null` não é aprovação** — quem chama trata a
 * ausência de medida como ausência de medida (guardrail 1). Afirmar
 * legibilidade sem medir é exatamente o que este arquivo veio acabar.
 */
export async function medirLegibilidadeDoTitulo(
  bytes: Buffer,
  caixa: CaixaDoTitulo,
  tinta: string,
): Promise<MedidaDaLegibilidade | null> {
  if (!corValida(tinta)) return null;
  if (caixa.largura < 4 || caixa.altura < 4) return null;

  let dados: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    const { default: sharp } = await import("sharp");
    dados = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }

  const { data, info } = dados;
  const { width: w, height: h, channels: c } = info;

  // A caixa recortada ao quadro. Caixa que sai do quadro não é caixa: medir o
  // que não existe devolveria preto e um contraste ótimo de mentira.
  const x0 = Math.max(0, Math.min(caixa.x, w - 1));
  const y0 = Math.max(0, Math.min(caixa.y, h - 1));
  const x1 = Math.max(x0 + 1, Math.min(caixa.x + caixa.largura, w));
  const y1 = Math.max(y0 + 1, Math.min(caixa.y + caixa.altura, h));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;

  // A tinta em canais, uma vez só. `null` aqui é ausência de medida, nunca
  // aprovação: sem saber a cor da letra não há como separá-la do fundo, e medir
  // o par errado com ar de precisão é o que este arquivo existe para não fazer.
  const alvo = canaisDaTinta(tinta);
  if (!alvo) return null;

  const alturaDaFaixa = Math.max(1, Math.floor((y1 - y0) / FAIXAS));

  let piorRazao = Infinity;
  let piorCor = "#000000";
  let somaR = 0, somaG = 0, somaB = 0, totalGeral = 0;

  for (let faixa = 0; faixa < FAIXAS; faixa++) {
    const fy0 = y0 + faixa * alturaDaFaixa;
    const fy1 = faixa === FAIXAS - 1 ? y1 : Math.min(y1, fy0 + alturaDaFaixa);
    if (fy1 - fy0 < 1) continue;

    let r = 0, g = 0, b = 0, n = 0;
    // A razão de CADA pixel de fundo desta faixa, para a estatística abaixo.
    const razoesDoFundo: Array<{ razao: number; cor: string; r: number; g: number; b: number }> = [];
    for (let y = fy0; y < fy1; y += PASSO_DA_AMOSTRA) {
      for (let x = x0; x < x1; x += PASSO_DA_AMOSTRA) {
        const i = (y * w + x) * c;
        const pr = data[i]!, pg = data[i + 1]!, pb = data[i + 2]!;
        r += pr; g += pg; b += pb;
        n++;
        // O pixel que É a tinta não descreve o fundo. Ver `ehTinta`.
        if (ehTinta(pr, pg, pb, alvo)) continue;
        const cor = hex(pr, pg, pb);
        const razao = razaoDeContraste(cor, tinta);
        if (razao !== null) razoesDoFundo.push({ razao, cor, r: pr, g: pg, b: pb });
      }
    }
    if (n === 0) continue;
    somaR += r; somaG += g; somaB += b; totalGeral += n;

    // ═══════════════════════════════════════════════════════════════════════
    // POR QUE ISTO DEIXOU DE SER A MÉDIA DA FAIXA (6ª rodada, com medição)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Aqui a razão saía da MÉDIA de todos os pixels da faixa, com os pixels da
    // própria letra dentro. O comentário antigo dizia que isso "erra para o
    // lado seguro: pode reprovar um título que estava no limite, nunca aprovar
    // um ilegível". A frase estava certa na direção e errada na ORDEM DE
    // GRANDEZA — e a diferença é a fronteira entre uma régua e um ruído.
    //
    // Experimento controlado (fundos chapados, tinta branca, cobertura de letra
    // variando, `.sonda/vies.mts`):
    //
    //   fundo #595959, razão VERDADEIRA 7,00:1  →  medida 2,07:1  (15% de letra)
    //   fundo #595959, razão VERDADEIRA 7,00:1  →  medida 1,00:1  (30% de letra)
    //   fundo #8a8a8a, razão VERDADEIRA 3,45:1  →  medida 1,64:1  (15% de letra)
    //
    // Um título com SETE de contraste — o dobro do piso, legível a metros —
    // era medido em 2,07 e declarado ilegível. A partir de ~30% de cobertura a
    // medida colapsa em 1,00 para QUALQUER fundo: nesse regime o número não
    // descreve o fundo, descreve quanta tinta há na faixa.
    //
    // Foi por isso que a rodada anterior, corretamente, se recusou a BARRAR com
    // este número — e foi por isso que a marca `[titulo ilegivel] 2,61:1` saiu
    // declarada sem que ninguém pudesse dizer se a peça estava mesmo ruim. Uma
    // declaração que dispara sobre 7:1 não é cautela: é alarme sobre o normal,
    // a mesma doença do relógio, dentro do arquivo que produz a peça.
    //
    // ── O CONSERTO, E POR QUE ELE NÃO É "SEGMENTAR O GLIFO" ────────────────
    //
    // Não se procura a letra: a letra já se declarou. `tinta` é a cor com que o
    // DOM a pintou, então o pixel que É a tinta é reconhecível sem adivinhação
    // (`ehTinta`). O que sobra é fundo.
    //
    // E do fundo NÃO se tira a média nem o mínimo: procura-se o PEDAÇO, com
    // histograma (`piorPedacoReal`). Duas tentativas anteriores caíram, e as
    // duas estão registradas porque a próxima pessoa vai pensar nelas:
    //
    //   • o MÍNIMO cru devolve a borda anti-aliasing — os pixels a meio caminho
    //     entre a letra e o fundo, que não são fundo nenhum. Volta a dar ~1,00
    //     sempre: um viés trocado por outro;
    //   • o PERCENTIL BAIXO (tentei 5%) resiste a pouca franja e cai com muita.
    //     Medido em `.sonda/vies2.mts`, com a letra borrada: fundo de razão
    //     VERDADEIRA 7,00 medido em 1,88 e depois 1,25 conforme o borrão cresce.
    //     Texto de verdade é quase todo borda — o percentil não serve.
    //
    // O que separa fundo de franja não é a posição na cauda, é a MASSA. Um
    // pedaço de fundo real — a metade clara da foto, o buraco no degradê —
    // ocupa milhares de pixels da MESMA cor. A franja tem tantos pixels quanto
    // o fundo, mas espalhados por todo o caminho entre a tinta e o fundo: em
    // qualquer faixa de cor, poucos. Então se conta por faixa de cor e se
    // descarta a faixa magra (`MASSA_MINIMA_DO_PEDACO`).
    //
    // A régua continua conservadora — olha a cauda ruim, não a média — mas
    // agora ela é conservadora por DECISÃO, com o erro medido, e não por um
    // artefato de quanta tinta coube na faixa.
    // ── QUANDO NÃO SOBRA FUNDO, O FUNDO **É** A TINTA (fail-closed) ────────
    //
    // Achado pela régua antiga desta casa, que este conserto quebrou antes de
    // consertar — e é o erro exato contra o qual `ehTinta` já avisava no
    // próprio comentário: *"engolir fundo escuro por engano puxaria a razão
    // para cima (erro que aprova ilegível)"*. Foi o que aconteceu, pelo lado
    // claro: um fundo `#ebebeb` sob tinta branca cai DENTRO da tolerância da
    // tinta, era excluído como se fosse letra, e a faixa ficava sem nenhum
    // pixel de fundo. A versão intermediária deste arquivo devolvia `null`
    // ("não medi") para um título branco sobre fundo branco.
    //
    // "Não sobrou fundo" não é ausência de medida: é a MEDIDA. Significa que
    // toda a faixa tem a cor da letra — ou porque o fundo é da cor da letra
    // (título invisível), ou porque a letra cobre a faixa inteira. Nos dois
    // casos o cliente do cliente não lê nada ali.
    //
    // Então a faixa devolve a razão da própria cor média contra a tinta, que
    // fica em torno de 1:1 e BARRA. Errar para "ilegível" quando a faixa
    // inteira tem a cor da letra é o lado certo de errar.
    const pior = razoesDoFundo.length > 0 ? piorPedacoReal(razoesDoFundo) : null;
    if (pior) {
      if (pior.razao < piorRazao) { piorRazao = pior.razao; piorCor = pior.cor; }
    } else {
      const cor = hex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
      const razao = razaoDeContraste(cor, tinta);
      if (razao !== null && razao < piorRazao) { piorRazao = razao; piorCor = cor; }
    }
  }

  if (!Number.isFinite(piorRazao) || totalGeral === 0) return null;

  const corMedia = hex(
    Math.round(somaR / totalGeral), Math.round(somaG / totalGeral), Math.round(somaB / totalGeral),
  );
  const razaoNaMedia = razaoDeContraste(corMedia, tinta) ?? 0;

  return {
    razaoNoPior: piorRazao,
    razaoNaMedia,
    tinta,
    fundoNoPior: piorCor,
    suficiente: piorRazao >= CONTRASTE_MINIMO_DO_TITULO,
  };
}

/** A frase da recusa, COM O NÚMERO. Placar sem número não é prova, e quem vai
 *  consertar o molde precisa saber de quanto para quanto. */
export function motivoDaLegibilidade(m: MedidaDaLegibilidade): string {
  return (
    `o título saiu com contraste de ${m.razaoNoPior}:1 contra o pedaço mais difícil do fundo ` +
    `(${m.fundoNoPior}, tinta ${m.tinta}), e o mínimo para título é ${CONTRASTE_MINIMO_DO_TITULO}:1. ` +
    "Nessa faixa a primeira linha que o cliente do cliente lê é a que ele não consegue ler. " +
    "Dono: a agência (produção). Próxima ação: escurecer o degradê sob o título ou trocar a foto de fundo."
  );
}

function hex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

/** Reexportado para quem mede: o piso de superfície chapada continua sendo o
 *  de `contraste.ts`, e os dois números não podem ser confundidos. */
export { CONTRASTE_MINIMO, luminancia };
