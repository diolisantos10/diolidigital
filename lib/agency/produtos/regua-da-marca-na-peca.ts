// regua-da-marca-na-peca.ts — A MARCA DO CLIENTE ESTÁ NOS PIXELS QUE SAÍRAM?
//
// ═══════════════════════════════════════════════════════════════════════════
// O BURACO (Auditor, 4ª rodada, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O critério D do contrato de aceite pede, com todas as letras: **"A régua da
// marca analisa a peça final."** Ela não analisava. O que existia era:
//
//   • o contrato de marca indo ao PRODUTOR (antes de produzir);
//   • o juiz de Qualidade auditando o TEXTO (não a imagem);
//   • o portão de contraste rodando ANTES de produzir, sobre cores declaradas.
//
// Três réguas sobre três coisas que não são o arquivo. Ninguém abria o JPEG e
// perguntava se a marca do cliente estava nele. E a peça pode sair sem a marca
// por caminhos que nenhuma das três alcança: o molde neutro entrando no lugar
// do da marca, uma composição que não pinta a faixa, um fundo que cobre tudo.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA RÉGUA MEDE — e o que ela NÃO pode afirmar
// ═══════════════════════════════════════════════════════════════════════════
//
// Ela mede **a tinta da marca no rodapé da peça final**, nos bytes do arquivo
// que o cliente vai abrir.
//
// Isso é medível porque é mecânico, e não estético: `montarHtmlDaPeca`
// (`design/molde.ts`) pinta o rodapé da peça com a cor PRIMÁRIA do cliente —
// o `scrim` vai de `${molde.primaria}` a 100% na base até transparente a 62%
// da altura, e na composição dividida o campo sólido é a mesma cor. Se a
// primária do cliente não aparece na base do arquivo, o molde da marca dele
// não foi aplicado — e "JPEG 1080×1920 COM A MARCA APLICADA" deixou de ser
// verdade.
//
// **O que ela NÃO afirma, dito com todas as letras:**
//   • que a peça está *bonita* ou *na cara da marca* — isso é juízo, e juízo
//     de imagem esta casa não tem como medir hoje;
//   • que a tipografia da marca foi usada (não é medível em pixel sem OCR);
//   • que o logo REAL do cliente está lá (o piloto assina com monograma —
//     dívida de prova declarada);
//   • nada sobre o miolo da peça, onde a foto manda.
//
// Uma régua estreita e verdadeira vale mais que uma larga e chutada. Esta
// pega o defeito que existe — peça saindo sem o molde do cliente — e não
// finge pegar os outros.

/** O resultado da medição, em números que uma pessoa pode conferir. */
export interface VereditoDaMarcaNaPeca {
  /** A marca do cliente está na peça? */
  ok: boolean;
  /** A cor média medida no rodapé do arquivo, em hexadecimal. */
  corMedidaNoRodape: string;
  /** A cor primária declarada da marca. */
  corDaMarca: string;
  /** A distância entre as duas, na escala 0–441 (diagonal do cubo RGB). */
  distancia: number;
  /** O teto aceito, e a razão dele. */
  tetoAceito: number;
  /** A frase em português, com dono e próxima ação quando reprova. */
  motivo: string;
}

/**
 * O TETO DE DISTÂNCIA, e por que este número.
 *
 * A escala é a distância euclidiana em RGB: 0 = idêntico, ~441 = preto contra
 * branco. O rodapé não é a cor pura — é a cor da marca sobre a foto, achatada
 * pelo JPEG e misturada com o que sobrou do degradê e com o texto branco da
 * assinatura por cima. Medido nas peças reais desta corrente, a média do
 * rodapé fica a algumas dezenas de unidades da primária.
 *
 * 90 é largo o bastante para não reprovar peça boa por causa de compressão, e
 * apertado o bastante para reprovar a peça pintada com OUTRA cor: o cinza
 * neutro da casa (#3F3F46) contra um marrom de padaria (#7A3B12) fica bem
 * acima disto.
 *
 * ⚠️ É um teto medido, não um teto ideal. Ele pega "a marca não foi aplicada".
 * Ele NÃO pega "aplicaram um tom vizinho do certo" — e não promete pegar.
 */
export const DISTANCIA_MAXIMA_DA_MARCA = 90;

/** Quanto do rodapé é medido. A faixa da marca ocupa a base da peça. */
export const FAIXA_DO_RODAPE = 0.12;

function hexParaRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbParaHex(r: number, g: number, b: number): string {
  const p = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase();
}

/**
 * A MARCA DO CLIENTE ESTÁ NO ARQUIVO?
 *
 * Recebe os BYTES da peça final — não o caminho, não o registro no banco. É a
 * mesma disciplina de `conferencia-do-arquivo.ts`: estado não vale, o que vale
 * é o que está dentro do arquivo que a rota pública vai servir.
 *
 * `corDaMarca` vem de `Molde.primaria` com `origem: "marca"`. Quando o molde é
 * NEUTRO (o cliente não declarou cor), não há marca para medir e esta régua
 * não é chamada — a ausência já é declarada pela corrente, e reprovar aqui
 * seria cobrar do cliente uma cor que ele nunca deu.
 */
export async function conferirMarcaNaPecaFinal(entrada: {
  bytes: Buffer;
  corDaMarca: string;
  ondeEsta: string;
}): Promise<VereditoDaMarcaNaPeca> {
  const alvo = hexParaRgb(entrada.corDaMarca);
  const base: Omit<VereditoDaMarcaNaPeca, "ok" | "motivo"> = {
    corMedidaNoRodape: "#000000",
    corDaMarca: entrada.corDaMarca,
    distancia: Number.POSITIVE_INFINITY,
    tetoAceito: DISTANCIA_MAXIMA_DA_MARCA,
  };

  if (!alvo) {
    return {
      ...base, ok: false,
      motivo:
        `a cor primária declarada da marca ("${entrada.corDaMarca}") não é um hexadecimal legível, ` +
        "então não há contra o que medir a peça. Dono: a agência. Próxima ação: corrigir a marca do cliente.",
    };
  }

  const { default: sharp } = await import("sharp");

  let medida: { r: number; g: number; b: number };
  try {
    const imagem = sharp(entrada.bytes);
    const meta = await imagem.metadata();
    const largura = meta.width ?? 0;
    const altura = meta.height ?? 0;
    if (largura < 8 || altura < 8) throw new Error(`imagem de ${largura}x${altura}`);

    const alturaDaFaixa = Math.max(2, Math.round(altura * FAIXA_DO_RODAPE));
    // A faixa do RODAPÉ, e só ela. Medir a peça inteira diluiria a marca na
    // foto e daria verde para qualquer coisa — a armadilha de falsificar fundo
    // demais: uma régua que só pode dar verde.
    const rodape = await imagem
      .extract({ left: 0, top: altura - alturaDaFaixa, width: largura, height: alturaDaFaixa })
      .stats();
    const [r, g, b] = rodape.channels;
    if (!r || !g || !b) throw new Error("a imagem não tem três canais de cor");
    medida = { r: r.mean, g: g.mean, b: b.mean };
  } catch (e) {
    return {
      ...base, ok: false,
      motivo:
        `não consegui medir a marca em ${entrada.ondeEsta} (${e instanceof Error ? e.message : "erro desconhecido"}). ` +
        "Ausência de medição não é aprovação. Dono: a agência (produção). Próxima ação: reprocessar a peça.",
    };
  }

  const distancia = Math.sqrt(
    (medida.r - alvo[0]) ** 2 + (medida.g - alvo[1]) ** 2 + (medida.b - alvo[2]) ** 2,
  );
  const corMedidaNoRodape = rgbParaHex(medida.r, medida.g, medida.b);
  const ok = distancia <= DISTANCIA_MAXIMA_DA_MARCA;

  return {
    corMedidaNoRodape,
    corDaMarca: entrada.corDaMarca,
    distancia: Math.round(distancia * 10) / 10,
    tetoAceito: DISTANCIA_MAXIMA_DA_MARCA,
    ok,
    motivo: ok
      ? `a marca do cliente está na peça: o rodapé de ${ondeCurto(entrada.ondeEsta)} mede ${corMedidaNoRodape}, ` +
        `a ${Math.round(distancia)} da primária ${entrada.corDaMarca} (teto ${DISTANCIA_MAXIMA_DA_MARCA}).`
      : `a peça saiu SEM a marca do cliente: o rodapé de ${ondeCurto(entrada.ondeEsta)} mede ${corMedidaNoRodape}, ` +
        `a ${Math.round(distancia)} da primária declarada ${entrada.corDaMarca} — o teto é ${DISTANCIA_MAXIMA_DA_MARCA}. ` +
        "Entregar assim é vender como peça do cliente uma peça com a cara de outra pessoa. " +
        "Dono: a agência (produção). Próxima ação: reprocessar a peça com o molde da marca.",
  };
}

function ondeCurto(onde: string): string {
  return onde.length > 80 ? `${onde.slice(0, 77)}...` : onde;
}
