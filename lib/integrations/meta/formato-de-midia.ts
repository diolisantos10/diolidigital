// formato-de-midia.ts — O INSTAGRAM SÓ ACEITA JPEG. SERVER-ONLY.
//
// ─── O BURACO QUE ISTO FECHA (08/08/2026) ───────────────────────────────────
//
// Medido em produção em 08/08/2026, às 17h:
//
//   • `PUBLICACAO_ORGANICA=liberada` — o CEO virou o interruptor às ~16h44;
//   • os 6 carrosséis da Foocci estavam `scheduled`, com as 6 telas cada;
//   • **0 posts publicados.** Os 2 já vencidos falhavam, e falhavam desde o
//     primeiro minuto, com a mesma frase da Meta:
//
//         "Only photo or video can be accepted as media type."
//
//   • as 36 telas são `image/png` (conferido pelo `content-type` que
//     `/api/media/<id>` devolve em produção).
//
// A causa não estava no interruptor, no token, na lista de ativos nem na
// conexão. Estava no FORMATO DO ARQUIVO, e a biblioteca capturada já dizia:
//
//     "O único formato de imagem compatível é o JPEG. Não há compatibilidade
//      com formatos derivados de JPEG, como MPO e JPS."
//     (fonte: docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md,
//      linha 82)
//
// ─── POR QUE ISTO É TRAVA, E NÃO UM `catch` MAIS BONITO ─────────────────────
//
// Sem esta conferência a casa **descobria o formato errado perguntando à
// Meta** — e o despertador roda a cada 5 minutos, para sempre, porque um post
// que falha continua `scheduled` de propósito (a causa quase sempre é externa
// e temporária; ver `esteira/publicacao.ts`). O resultado medido: uma rajada
// permanente de criações de container recusadas, contra a conta de um
// CLIENTE, com o app `Dioli Digital Studio` sem App Review — isto é, em acesso
// PADRÃO, que não alcança perfil de terceiro.
// (11/08/2026: este trecho dizia "em modo de desenvolvimento". App do tipo
//  Business não tem modo, só nível de acesso — a correção e a fonte estão em
//  `trava-de-publicacao.ts`.)
//
// Isso é, letra por letra, o padrão que restringiu a conta de anúncios da
// agência em 03/08/2026: "conta usada com uma automação que não segue nossas
// regras". A Meta audita a ATIVIDADE do app e pune o APP — tentativa recusada
// conta como tentativa (fonte: fontes/termos-da-plataforma.md).
//
// Por isso a recusa acontece AQUI, antes de qualquer byte sair, e por isso ela
// é uma trava e não um aviso: aviso em log não teria segurado 288 rodadas por
// dia.
//
// ─── E POR QUE ELA DIZ *QUAL* METADE FALTA ──────────────────────────────────
//
// A regra da casa (mapa de 08/08, `docs/ESTADO-REAL-08-08.md`): toda tela
// mostra o estado dos DOIS lados do interruptor, e faltando a outra metade ela
// diz QUAL e ONDE. O CEO virou o interruptor e nada aconteceu; a tela dizia
// apenas "não foi ao ar". `motivoDeFormato` existe para a frase nomear o
// arquivo, o formato que ele tem, o formato que a Meta exige e o que fazer.

/** O único formato de imagem que o Instagram aceita na publicação por API.
 *  (fontes/instagram-publicacao-de-conteudo.md, linha 82) */
export const MIME_DE_IMAGEM_ACEITO = "image/jpeg";

/** Os MIMEs de vídeo que a publicação aceita. O Instagram processa MP4/MOV;
 *  qualquer outro contêiner é recusado do mesmo jeito que um PNG. */
export const MIMES_DE_VIDEO_ACEITOS = new Set(["video/mp4", "video/quicktime"]);

/** Uma tela conferida: o id da mídia e o MIME que ela realmente tem. */
export interface MidiaConferida {
  /** O id do `MediaAsset` — entra na frase para alguém conseguir achar o arquivo. */
  id: string;
  /** O `mimeType` gravado no banco. `null` quando a mídia não foi encontrada. */
  mime: string | null;
}

export type VereditoDeFormato =
  | { aceita: true }
  | { aceita: false; motivo: string };

/**
 * A peça pode ir ao Instagram, do ponto de vista de FORMATO DE ARQUIVO?
 *
 * `ehVideo` decide qual lista vale: um reel é vídeo, um post e um carrossel
 * são imagem. Mídia ausente do banco (`mime: null`) é recusada — ausência de
 * informação não é informação, e "provavelmente é JPEG" é exatamente o tipo de
 * palpite que produz uma chamada recusada pela Meta.
 */
export function conferirFormatoDeMidia(
  midias: MidiaConferida[],
  ehVideo: boolean,
): VereditoDeFormato {
  if (midias.length === 0) {
    return { aceita: false, motivo: "a peça não tem nenhum arquivo de mídia." };
  }

  const aceito = (m: string | null): boolean =>
    m !== null && (ehVideo ? MIMES_DE_VIDEO_ACEITOS.has(m) : m === MIME_DE_IMAGEM_ACEITO);

  const recusadas = midias.filter((m) => !aceito(m.mime));
  if (recusadas.length === 0) return { aceita: true };

  return { aceita: false, motivo: motivoDeFormato(recusadas, midias.length, ehVideo) };
}

/**
 * A frase da recusa. Nomeia as DUAS metades: o que o arquivo é e o que a Meta
 * exige — mais o caminho da correção, que é reconverter a arte, não reconectar
 * a conta. Sem isso, o operador procura defeito na conexão (foi o que
 * aconteceu em 08/08: o interruptor foi virado e o problema não era ele).
 */
export function motivoDeFormato(
  recusadas: MidiaConferida[],
  total: number,
  ehVideo: boolean,
): string {
  const exigido = ehVideo
    ? `vídeo MP4 ou MOV (${[...MIMES_DE_VIDEO_ACEITOS].join(" ou ")})`
    : `JPEG (${MIME_DE_IMAGEM_ACEITO})`;

  const semMime = recusadas.filter((m) => m.mime === null);
  const comMime = recusadas.filter((m) => m.mime !== null);

  const partes: string[] = [];
  if (comMime.length > 0) {
    const lista = comMime.slice(0, 3).map((m) => `${m.id} é ${m.mime}`).join(", ");
    const resto = comMime.length > 3 ? ` (e mais ${comMime.length - 3})` : "";
    partes.push(`${lista}${resto}`);
  }
  if (semMime.length > 0) {
    const lista = semMime.slice(0, 3).map((m) => m.id).join(", ");
    partes.push(`${lista} não está no banco de mídia`);
  }

  return (
    `${recusadas.length} de ${total} arquivo(s) desta peça o Instagram NÃO aceita: ${partes.join("; ")}. ` +
    `O Instagram só publica ${exigido} — é regra da plataforma, não limite desta casa ` +
    `(docs/plataformas/meta/fontes/instagram-publicacao-de-conteudo.md). ` +
    `O que falta NÃO é conexão nem autorização: é reconverter a arte para ${ehVideo ? "MP4" : "JPEG"} e reagendar.`
  );
}
