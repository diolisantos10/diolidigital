// reconverter-arquivos.ts — SÓ O ARQUIVO MUDA. A PEÇA CONTINUA A MESMA.
//
// ─── O QUE FOI MEDIDO EM PRODUÇÃO (14/08/2026) ──────────────────────────────
//
// Duas passadas contra produção, pelo workflow à mão:
//
//   • `?modo=formato-recusado` → 0 recompostas. As 6 peças do CityJobs são
//     CARROSSÉIS, e aquele modo lê `mediaUrl` (peça única). Passou ao lado.
//   • `?modo=carrossel&limite=6` → achou as 6 e **falhou nas 6**, sem
//     `semFundo`. A foto paga está lá; o que falta é outra coisa.
//
// ─── POR QUE ESTE CONSERTO É DIFERENTE DO IRMÃO ─────────────────────────────
//
// `recomporCarrosseis` **redesenha** cada tela: lê a foto paga, aplica o molde
// de novo e escreve uma arte nova. Isso resolve o formato — e cobra caro por
// isso, em duas moedas:
//
//   1. **Ele precisa do roteiro.** Sem `scenesJson` não há descrição de tela, e
//      sem descrição ele não tem o que escrever na arte: para antes de tocar em
//      arquivo ("o carrossel não tem telas descritas").
//   2. **Ele muda a peça.** Molde novo, texto reposicionado. E desde 14/08 quem
//      aprova uma peça é o cliente dono dela (`esteira/aprovacao-da-peca.ts`,
//      ordem do CEO) — sendo que a aprovação fica presa ao `SocialPost`, e
//      **não ao arquivo**. Trocar os pixels de uma peça já aprovada não
//      invalida a aprovação: ela simplesmente passa a valer para uma imagem que
//      o cliente nunca viu.
//
// Este módulo faz o mínimo que resolve o problema medido: **troca o contêiner
// do arquivo e mais nada.** Mesmos pixels, mesma composição, mesmo texto. Não
// precisa de `scenesJson`, porque não escreve nada; e não cria nada para
// reaprovar, porque a imagem é a mesma.
//
// ─── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
//
//   • **Não publica.** Nenhuma chamada de plataforma, e `PUBLICACAO_ORGANICA`
//     não é lida. Há teste que reprova se qualquer uma das duas aparecer.
//   • **Não reagenda.** `scheduledFor` e `status` não são tocados: a escrita no
//     post tem EXATAMENTE `mediaUrl` e, no carrossel, `mediaUrlsJson`.
//   • **Não compra imagem.** Não há `generateDesign` nem download aqui.
//   • **Não redesenha.** Nenhuma chamada a `comporComMolde`.
//   • **Não conserta peça sem arte.** Peça cujo arquivo não está no
//     armazenamento não tem contêiner para trocar — ela é declarada, não
//     inventada.

import { prisma } from "@/lib/db/client";
import { guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";
import { paraJpeg } from "@/lib/agency/media/para-jpeg";
import { nomeDaArte, nomeDaTelaDoCarrossel } from "@/lib/agency/execution/artes";
import { conferirPilar } from "@/lib/agency/execution/pilares-bloqueados";
import { conferirFormatoDeMidia } from "@/lib/integrations/meta/formato-de-midia";
import {
  postsComFormatoRecusado,
  carrosseisComFormatoRecusado,
  telasDoCarrossel,
  type PecaEmFormatoRecusado,
} from "@/lib/agency/execution/reconversao-de-formato";

/** Teto por passada. Mesmo número dos consertos irmãos, e pela mesma razão. */
const TETO = 20;

export interface ReconversaoDeArquivos {
  /** As peças cujo arquivo passou a ser JPEG. */
  convertidas: string[];
  /** Peças cujo arquivo não está mais no armazenamento — não há contêiner para
   *  trocar, e inventar um seria produzir peça nova. */
  semArquivo: string[];
  /** Pilar bloqueado: não se dá acabamento no que não pode sair. */
  bloqueadas: string[];
  falhas: Array<{ postId: string; erro: string }>;
  /** Quantos ARQUIVOS foram reescritos ao todo (um carrossel são N). */
  arquivosNovos: number;
  /**
   * Por qual ferramenta a conversão saiu, sem repetir. É evidência de qual das
   * duas o contêiner de produção realmente tem — e ela não cabe em lugar
   * nenhum senão aqui: `sharp` é transitivo e pode sumir num build; o
   * rasterizador depende do Chromium chegar inteiro.
   */
  caminhos: string[];
}

function vazio(): ReconversaoDeArquivos {
  return { convertidas: [], semArquivo: [], bloqueadas: [], falhas: [], arquivosNovos: 0, caminhos: [] };
}

/** O arquivo de uma tela, do jeito que o armazenamento o guarda. */
interface ArquivoDaTela {
  id: string;
  storagePath: string;
  mimeType: string;
  workspaceId: string;
}

async function arquivoDe(id: string): Promise<ArquivoDaTela | null> {
  const a = await prisma.mediaAsset
    .findUnique({ where: { id }, select: { id: true, storagePath: true, mimeType: true, workspaceId: true } })
    .catch(() => null);
  return a ?? null;
}

/**
 * Troca o contêiner de UMA peça — uma tela ou N — e devolve as urls novas.
 *
 * ── TUDO OU NADA, e a razão é do produto ────────────────────────────────────
 * Herdada de `recomporCarrosseis`, que a herdou de `montarCarrossel`: se UMA
 * tela não puder ser convertida, o post inteiro fica como está. Publicar uma
 * sequência com metade das telas trocadas é pior do que não publicar.
 */
async function converterAsTelas(
  post: { id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null },
  ids: string[],
  ehCarrossel: boolean,
  saida: ReconversaoDeArquivos,
): Promise<{ ok: true; urls: string[]; mimes: string[] } | { ok: false; semArquivo?: true; erro?: string }> {
  const urls: string[] = [];
  const mimes: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const arquivo = await arquivoDe(id);
    if (!arquivo) return { ok: false, semArquivo: true };

    // Arquivo de OUTRO workspace não vira peça deste. Converter aqui copiaria o
    // arquivo de um inquilino para dentro de outro — e a conversão pareceria um
    // conserto enquanto fazia isso.
    if (arquivo.workspaceId !== post.workspaceId) {
      return { ok: false, erro: "uma das telas aponta para arquivo de outro workspace — não converti nada" };
    }

    const bytes = await lerArquivo(arquivo.storagePath).catch(() => null);
    if (!bytes || bytes.length === 0) return { ok: false, semArquivo: true };

    const convertido = await paraJpeg(Buffer.from(bytes));
    if (!convertido.ok) return { ok: false, erro: convertido.motivo };

    if (!saida.caminhos.includes(convertido.por)) saida.caminhos.push(convertido.por);

    // ── JÁ ERA JPEG: mantém o arquivo que está lá ──────────────────────────
    // Regravar bytes idênticos com id novo é sujar o armazenamento e a cota do
    // cliente por nada — e faria a passada nunca ser idempotente.
    if (convertido.por === "ja-era-jpeg") {
      urls.push(`/api/media/${id}`);
      mimes.push(arquivo.mimeType);
      continue;
    }

    const guardado = await guardarArquivo({
      bytes: convertido.bytes,
      // O nome segue o MIME REAL dos bytes, sempre. Um `.png` sobre bytes de
      // JPEG manda quem investiga procurar o defeito no lugar errado.
      fileName: ehCarrossel
        ? nomeDaTelaDoCarrossel(post.id, i + 1, convertido.mime)
        : nomeDaArte(post.id, convertido.mime),
      mimeType: convertido.mime,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!guardado.ok) return { ok: false, erro: guardado.motivo };

    urls.push(`/api/media/${guardado.arquivo.id}`);
    mimes.push(convertido.mime);
    saida.arquivosNovos++;
  }

  return { ok: true, urls, mimes };
}

/**
 * A PASSADA. Troca o contêiner das peças agendadas cujo arquivo a plataforma
 * recusa — carrosséis e peças únicas. Nunca lança e nunca publica.
 */
export async function reconverterArquivosParaJpeg(limite = TETO): Promise<ReconversaoDeArquivos> {
  const saida = vazio();
  const teto = Math.min(Math.max(limite, 1), TETO);

  const carrosseis = await carrosseisComFormatoRecusado(teto);
  const unicas = (await postsComFormatoRecusado(teto)).map((x) => x.diagnostico);

  for (const peca of [...carrosseis, ...unicas]) {
    if (saida.convertidas.length + saida.falhas.length + saida.semArquivo.length >= teto) break;
    await converterUma(peca, saida);
  }

  return saida;
}

async function converterUma(peca: PecaEmFormatoRecusado, saida: ReconversaoDeArquivos): Promise<void> {
  const post = await prisma.socialPost.findUnique({ where: { id: peca.postId } }).catch(() => null);
  if (!post) {
    saida.falhas.push({ postId: peca.postId, erro: "a peça sumiu do banco entre a medição e a conversão" });
    return;
  }

  // A trava de pilar vale aqui como vale nos irmãos: peça de pilar bloqueado
  // não recebe trabalho, porque ela não pode sair de qualquer forma.
  if (conferirPilar(post.pillar).bloqueado) {
    saida.bloqueadas.push(post.id);
    return;
  }

  const ehCarrossel = post.format === "carousel" || post.format === "carrossel";
  const ids = ehCarrossel
    ? telasDoCarrossel(post.mediaUrlsJson)
    : peca.midias.map((m) => m.id);

  if (ids.length === 0) {
    saida.falhas.push({ postId: post.id, erro: "a peça não tem arquivo guardado nesta casa — não há contêiner para trocar" });
    return;
  }

  const r = await converterAsTelas(post, ids, ehCarrossel, saida);
  if (!r.ok) {
    if (r.semArquivo) saida.semArquivo.push(post.id);
    else saida.falhas.push({ postId: post.id, erro: r.erro ?? "não consegui converter todas as telas" });
    return;
  }

  // ── O CONSERTO PASSA NA MESMA RÉGUA QUE REPROVOU O DEFEITO ────────────────
  // Antes de gravar, a peça nova é medida pela função que o PUBLICADOR usa para
  // recusar. Um conserto que se declara pronto sem se medir é o portão de
  // decoração que esta casa já nomeou: existe, não roda, e cria confiança falsa.
  const veredito = conferirFormatoDeMidia(
    r.urls.map((u, i) => ({ id: u, mime: r.mimes[i] ?? null })),
    false,
  );
  if (!veredito.aceita) {
    saida.falhas.push({
      postId: post.id,
      erro: `a peça convertida continua em formato que a plataforma recusa — NADA foi gravado. ${veredito.motivo}`,
    });
    return;
  }

  // ── A ESCRITA MÍNIMA ──────────────────────────────────────────────────────
  // Só o arquivo. `scheduledFor` e `status` não aparecem porque reconverter não
  // é reagendar. `lastError` também não: ele é o registro do que aconteceu com
  // esta peça, e apagá-lo aqui apagaria a única testemunha de um defeito que
  // esta passada não trata.
  const escrita = ehCarrossel
    ? { mediaUrlsJson: JSON.stringify(r.urls), mediaUrl: r.urls[0]! }
    : { mediaUrl: r.urls[0]! };

  const gravou = await prisma.socialPost
    .update({ where: { id: post.id }, data: escrita })
    .then(() => true)
    .catch(() => false);

  if (!gravou) {
    saida.falhas.push({ postId: post.id, erro: "converti os arquivos mas o banco recusou a gravação do post" });
    return;
  }
  saida.convertidas.push(post.id);
}
