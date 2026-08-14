// para-jpeg.ts — TROCA O CONTÊINER DO ARQUIVO, NÃO O CONTEÚDO. SERVER-ONLY.
//
// ─── O BURACO QUE ISTO FECHA (14/08/2026) ───────────────────────────────────
//
// Os 6 carrosséis do CityJobs estão agendados com as 6 telas cada em
// `image/png`, e o Instagram só publica JPEG. A casa já tinha UM conserto para
// isso — `recomporCarrosseis`, que **redesenha** cada tela a partir da foto
// paga. E redesenhar resolve o formato de um jeito caro demais para este caso:
//
//   • ele reescreve a arte. Molde novo, marca nova, texto reposicionado. A peça
//     que sai não é a peça que estava no calendário;
//   • e desde 14/08 **quem aprova uma peça é o cliente dono dela**
//     (`esteira/aprovacao-da-peca.ts`, ordem do CEO). A aprovação fica presa ao
//     `SocialPost` (`ApprovalRequest.sourcePostIdsJson`), **não ao arquivo** —
//     então trocar os pixels de uma peça já aprovada não invalida nada, e o
//     cliente passa a ter aprovado uma imagem que não é mais a que ele viu.
//     Isso é pior que o problema que veio consertar.
//
// Este módulo faz a coisa mínima: **os mesmos pixels, noutro contêiner.** Nada
// é redesenhado, nada é reposicionado, nenhum texto novo entra — logo não há o
// que reaprovar, e a peça que o cliente viu continua sendo a peça que sai.
//
// ─── POR QUE DOIS CAMINHOS, E POR QUE NENHUM DELES ADIVINHA ─────────────────
//
// `sharp` é o caminho barato e exato, e a casa já o usa assim
// (`design/medir-fundo.ts`, com `import()` dinâmico e `catch → null`). Só que
// ele **não é dependência declarada** deste projeto: ele chega de carona no
// `next`. Depender em silêncio de um pacote transitivo é a armadilha que já
// custou dias aqui — foi o `playwright` em `devDependencies` (07/08) e depois o
// `browsers.json` que o `output: "standalone"` não copiava (08/08).
//
// Por isso existe o segundo caminho: o **próprio rasterizador da casa**, que já
// é obrigatório em produção e já sai em JPEG na mesma qualidade
// (`design/renderizar.ts`, `SAIDA_DA_PECA`). Ele desenha a imagem no tamanho
// natural dela e recorta exatamente aquele retângulo — mesmos pixels, sem
// reamostragem.
//
// E se **nenhum dos dois** estiver presente, a porta fecha e diz QUAL metade
// falta. Ausência de ferramenta nunca vira arquivo entregue pela metade.

import { MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";
import { renderizarHtml } from "@/lib/agency/design/renderizar";

/**
 * A qualidade do JPEG. É o MESMO 92 do rasterizador da casa, de propósito: uma
 * tela reconvertida e uma tela recém-desenhada têm de sair com o mesmo peso e o
 * mesmo grão, senão o carrossel fica visivelmente desigual de uma tela para a
 * outra. A razão do número está em `design/renderizar.ts` — abaixo de ~90 o
 * artefato aparece na borda dura entre letra e fundo, que é o layout desta casa.
 */
export const QUALIDADE_DO_JPEG = 92;

/** A assinatura de arquivo, lida dos BYTES. Etiqueta não é evidência — foi
 *  exatamente um `mimeType` mentindo sobre o conteúdo que esta casa nomeou como
 *  o defeito PIOR que o de 08/08. */
const MAGICO_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAGICO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function ehJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes.subarray(0, 3).equals(MAGICO_JPEG);
}

export function ehPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(MAGICO_PNG);
}

/**
 * A largura e a altura REAIS da imagem, lidas do cabeçalho do arquivo.
 *
 * Só o caminho do rasterizador precisa disto: ele tem de abrir a janela no
 * tamanho exato da imagem, porque qualquer divergência vira reamostragem — e
 * reamostrar é mexer no conteúdo, que é justamente o que este módulo não faz.
 *
 * Formato que não sabemos ler devolve `null`, e quem chama recusa. Chutar
 * "provavelmente é 1080×1350" produziria a peça esticada de um cliente pagante.
 */
export function medidasDaImagem(bytes: Buffer): { largura: number; altura: number } | null {
  // PNG: assinatura de 8 bytes, depois o chunk IHDR, cujos dois primeiros
  // campos são largura e altura em big-endian de 32 bits.
  if (ehPng(bytes) && bytes.length >= 24) {
    const largura = bytes.readUInt32BE(16);
    const altura = bytes.readUInt32BE(20);
    if (largura > 0 && altura > 0) return { largura, altura };
    return null;
  }

  // JPEG: percorre os marcadores até um SOF (Start Of Frame). Os SOF de 0xC4
  // (Huffman), 0xC8 (JPEG extendido) e 0xCC (aritmético) NÃO são frames — é o
  // engano clássico de quem escreve este laço de cabeça.
  if (ehJpeg(bytes)) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marcador = bytes[i + 1]!;
      if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; }
      const tamanho = bytes.readUInt16BE(i + 2);
      const ehSof = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
      if (ehSof) {
        const altura = bytes.readUInt16BE(i + 5);
        const largura = bytes.readUInt16BE(i + 7);
        return largura > 0 && altura > 0 ? { largura, altura } : null;
      }
      i += 2 + tamanho;
    }
    return null;
  }

  return null;
}

export type ResultadoDaConversao =
  | { ok: true; bytes: Buffer; mime: string; por: "ja-era-jpeg" | "sharp" | "rasterizador" }
  | { ok: false; motivo: string };

/**
 * OS MESMOS PIXELS, EM JPEG.
 *
 * Nunca lança. Nunca redesenha. Nunca acrescenta uma letra.
 *
 * Já é JPEG? Devolve os bytes como estão e diz isso — a passada tem de ser
 * idempotente, e reconverter um JPEG em JPEG seria perder qualidade de graça
 * cada vez que alguém apertasse o botão duas vezes.
 */
export async function paraJpeg(bytes: Buffer): Promise<ResultadoDaConversao> {
  if (bytes.length === 0) return { ok: false, motivo: "o arquivo chegou vazio — não há o que converter." };
  if (ehJpeg(bytes)) return { ok: true, bytes, mime: MIME_DE_IMAGEM_ACEITO, por: "ja-era-jpeg" };

  const porSharp = await comSharp(bytes);
  if (porSharp.ok) return porSharp;

  const porNavegador = await comRasterizador(bytes);
  if (porNavegador.ok) return porNavegador;

  // A recusa nomeia as DUAS metades que faltaram. "Não consegui converter" sem
  // dizer qual ferramenta some manda o operador procurar no lugar errado, que é
  // como se perdeu o dia 08/08.
  return {
    ok: false,
    motivo:
      `não consegui trocar o contêiner deste arquivo para JPEG por nenhum dos dois caminhos. ` +
      `sharp: ${porSharp.motivo} · rasterizador: ${porNavegador.motivo}`,
  };
}

/** O caminho barato. `sharp` é transitivo (vem do `next`) — ausência dele é
 *  esperada e não é erro, é o outro caminho assumindo. */
async function comSharp(bytes: Buffer): Promise<ResultadoDaConversao> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { ok: false, motivo: "não está instalado neste ambiente (ele é transitivo, vem do next)" };
  }
  try {
    const convertido = await sharp(bytes)
      // JPEG não tem canal alfa. Imagem com transparência PRECISA de um fundo,
      // e escolher branco é decisão declarada — o padrão da biblioteca é preto,
      // e um rodapé transparente viraria uma tarja preta na peça do cliente.
      // Em imagem opaca (que é o caso das telas do rasterizador) isto não
      // altera um pixel.
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      // `4:4:4` porque a peça é TIPOGRAFIA sobre foto: a subamostragem de croma
      // padrão (4:2:0) borra exatamente a borda colorida de uma letra.
      .jpeg({ quality: QUALIDADE_DO_JPEG, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (!ehJpeg(convertido)) {
      return { ok: false, motivo: "devolveu bytes que não começam com a assinatura de JPEG" };
    }
    return { ok: true, bytes: convertido, mime: MIME_DE_IMAGEM_ACEITO, por: "sharp" };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 160) : "falhou" };
  }
}

/**
 * O caminho do rasterizador que a casa já tem de ter de pé.
 *
 * Desenha a imagem no tamanho natural dela, numa janela do mesmo tamanho, e
 * recorta exatamente aquele retângulo. Sem escala, sem `object-fit`, sem
 * margem: qualquer um dos três reamostraria a imagem, e reamostrar é mexer no
 * conteúdo.
 */
async function comRasterizador(bytes: Buffer): Promise<ResultadoDaConversao> {
  const medidas = medidasDaImagem(bytes);
  if (!medidas) {
    return {
      ok: false,
      motivo: "não sei ler a largura e a altura deste formato de arquivo, e abrir a janela no tamanho errado esticaria a peça",
    };
  }

  const fonte = `data:${ehPng(bytes) ? "image/png" : "application/octet-stream"};base64,${bytes.toString("base64")}`;
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;background:#fff}` +
    `img{display:block;width:${medidas.largura}px;height:${medidas.altura}px}</style></head>` +
    `<body><img src="${fonte}"></body></html>`;

  const r = await renderizarHtml({
    html,
    largura: medidas.largura,
    altura: medidas.altura,
    // NENHUM texto esperado: não há texto nesta página, e não há letra a
    // conferir. A trava da letra existe para o que a casa ESCREVE — aqui a casa
    // não escreve nada, só reembala o que já estava aprovado.
    textosEsperados: [],
  });
  if (!r.ok) return { ok: false, motivo: `${r.motivo} — ${r.erro.slice(0, 160)}` };
  if (!ehJpeg(r.bytes)) {
    return { ok: false, motivo: "o rasterizador devolveu bytes que não são JPEG" };
  }
  return { ok: true, bytes: r.bytes, mime: MIME_DE_IMAGEM_ACEITO, por: "rasterizador" };
}
