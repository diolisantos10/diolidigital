// reconversao-de-formato.ts — QUAIS PEÇAS AGENDADAS ESTÃO NO FORMATO ERRADO.
// SOMENTE LEITURA.
//
// ─── O BURACO QUE ISTO FECHA (14/08/2026) ───────────────────────────────────
//
// `/api/meta/prontidao` rodou contra produção às 21h43 de 14/08: **6 posts do
// CityJobs agendados, os 6 com `pronto:false`**, e o PRIMEIRO portão que barra
// nos seis é o **Formato do arquivo** — as artes estão gravadas como
// `image/png`, e o Instagram só publica JPEG
// (`lib/integrations/meta/formato-de-midia.ts`, `MIME_DE_IMAGEM_ACEITO`).
//
// E aqui está o detalhe que muda o conserto inteiro: **o código de hoje não
// produz mais PNG.** O rasterizador saiu de PNG para JPEG em 08/08
// (`design/renderizar.ts`, `MIME_DA_PECA_RENDERIZADA`), e a peça composta
// carrega esse MIME até o banco (`artes.ts`, `comporComMolde`). Não há defeito
// de código para consertar: o que sobrou foi **estoque** — peças rasterizadas
// pelo motor velho, ainda penduradas nos posts agendados. Nenhum deploy as
// desbloqueia, porque o arquivo antigo continua sendo o arquivo do post.
//
// ─── POR QUE A PERGUNTA É FEITA AO BANCO DE MÍDIA ───────────────────────────
//
// Estas peças não têm defeito registrado em lugar nenhum. Nasceram certas para
// o motor da época e o logo do cliente já existia — então `sem-molde` (que
// procura uma marca em `lastError`) e `marca-nova` (que compara a data da arte
// com a do material) passam ao lado das seis. A única testemunha é o `mimeType`
// do `MediaAsset` que o `mediaUrl` aponta.
//
// ─── O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO ────────────────────────────────
//
//   • **Não escreve.** Nem no banco, nem em disco, nem na Meta.
//   • **Não publica, não agenda, não reagenda.** Não existe uma chamada de
//     plataforma neste arquivo, e um teste impede que apareça.
//   • **Não reimplementa a régua do formato.** Ele CHAMA
//     `conferirFormatoDeMidia`, a mesma função que o publicador chama para
//     recusar. Uma segunda cópia começaria idêntica e divergiria no primeiro
//     ajuste — e um diagnóstico que discorda do publicador é pior que nenhum,
//     porque ele é acreditado.

import { prisma } from "@/lib/db/client";
import { conferirFormatoDeMidia, MIME_DE_IMAGEM_ACEITO } from "@/lib/integrations/meta/formato-de-midia";

/** Os status em que uma peça ainda vai ao ar. Peça publicada ou arquivada não
 *  se reconverte: o arquivo dela já cumpriu (ou não cumpre mais) o papel. */
export const STATUS_QUE_AINDA_VAO_AO_AR = ["draft", "scheduled", "approved"] as const;

/**
 * Formatos que a reconversão de PEÇA ÚNICA não alcança, e o motivo de cada um:
 *
 *   • **carrossel** — o que vai ao Instagram são as N telas de `mediaUrlsJson`.
 *     Recompor por lá escreveria capa nova e deixaria as telas quebradas. Quem
 *     redesenha as telas é `recomporCarrosseis` (`recompor-carrossel.ts`).
 *   • **reel / vídeo** — os bytes são de vídeo, e `comporComMolde` só compõe
 *     imagem. Rasterizar um MP4 como JPEG não seria conserto: seria trocar a
 *     peça por outra.
 *
 * Ficar de fora daqui NÃO é ficar sem conserto — é o conserto ser de outra mão.
 * Por isso `carrosseisComFormatoRecusado` existe logo abaixo: o relatório diz em
 * voz alta o que esta passada não cobre, em vez de calar e parecer completo.
 */
export const FORMATOS_FORA_DA_RECONVERSAO = ["carousel", "carrossel", "reel", "video"] as const;

/** Os formatos de carrossel, escritos das duas maneiras que o banco carrega. */
export const FORMATOS_DE_CARROSSEL = ["carousel", "carrossel"] as const;

/**
 * O id do `MediaAsset` dentro de um `mediaUrl` desta casa.
 *
 * Recorte IDÊNTICO ao do publicador e ao do diagnóstico de prontidão
 * (`/api/media/<id>`, cortando a query). Mídia fora desse padrão é arquivo de
 * fora: não sabemos o formato dela, não a medimos e não a tocamos — que é
 * exatamente o que o portão de formato faz com ela.
 */
export function idDaMidiaGuardada(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/api/media/")) return null;
  const id = url.split("/api/media/")[1]?.split("?")[0] ?? "";
  return id.length > 0 ? id : null;
}

/** Uma peça agendada cujo arquivo a plataforma recusa, com a evidência junto —
 *  guardrail 6: alerta que não carrega o caso concreto é ruído. */
export interface PecaEmFormatoRecusado {
  postId: string;
  workspaceId: string;
  clientId: string | null;
  formato: string;
  status: string;
  agendadoPara: string | null;
  /** Os ids de mídia da peça: um no post simples, N num carrossel. */
  midias: Array<{ id: string; mime: string | null }>;
  /** A frase da recusa, escrita pela régua da publicação. */
  motivo: string;
}

/** Uma linha de post, como o Prisma a devolve. */
type PostDaBase = NonNullable<Awaited<ReturnType<typeof prisma.socialPost.findFirst>>>;

function agendadoPara(post: PostDaBase): string | null {
  return post.scheduledFor ? post.scheduledFor.toISOString() : null;
}

async function mimeDe(id: string): Promise<string | null> {
  const asset = await prisma.mediaAsset
    .findUnique({ where: { id }, select: { mimeType: true } })
    .catch(() => null);
  return asset?.mimeType ?? null;
}

/**
 * AS PEÇAS ÚNICAS (post simples, story) cujo arquivo a plataforma recusa.
 *
 * Devolve as LINHAS do post, e não só os ids, porque quem recompõe precisa da
 * linha inteira — e uma segunda consulta pelos mesmos ids abriria a janela em
 * que o diagnóstico e o conserto olham para estados diferentes do banco.
 */
export async function postsComFormatoRecusado(
  limite: number,
): Promise<Array<{ post: PostDaBase; diagnostico: PecaEmFormatoRecusado }>> {
  const candidatas = await prisma.socialPost
    .findMany({
      where: {
        mediaUrl: { not: null },
        status: { in: [...STATUS_QUE_AINDA_VAO_AO_AR] },
        format: { notIn: [...FORMATOS_FORA_DA_RECONVERSAO] },
      },
      orderBy: { scheduledFor: "asc" },
      // Folga sobre o teto: o formato só dá para conferir peça a peça, e sem
      // folga uma leva de peças já em JPEG consumiria a passada inteira.
      take: Math.min(Math.max(limite, 1) * 10, 200),
    })
    .catch(() => []);

  const achadas: Array<{ post: PostDaBase; diagnostico: PecaEmFormatoRecusado }> = [];
  for (const post of candidatas) {
    if (achadas.length >= limite) break;

    const id = idDaMidiaGuardada(post.mediaUrl);
    if (!id) continue;

    const midias = [{ id, mime: await mimeDe(id) }];
    // `ehVideo: false` porque os formatos de vídeo já ficaram de fora da
    // consulta — perguntar com a lista errada devolveria a resposta certa por
    // acaso e a errada no dia em que a lista mudasse.
    const veredito = conferirFormatoDeMidia(midias, false);
    if (veredito.aceita) continue;

    achadas.push({
      post,
      diagnostico: {
        postId: post.id,
        workspaceId: post.workspaceId,
        clientId: post.clientId,
        formato: post.format,
        status: post.status,
        agendadoPara: agendadoPara(post),
        midias,
        motivo: veredito.motivo,
      },
    });
  }
  return achadas;
}

/** Os ids de mídia guardados em `mediaUrlsJson`. JSON quebrado devolve vazio —
 *  e vazio, aqui, é recusado pela própria régua ("a peça não tem nenhum arquivo
 *  de mídia"), nunca aprovado por silêncio. */
export function telasDoCarrossel(mediaUrlsJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(mediaUrlsJson ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .map((u) => (typeof u === "string" ? idDaMidiaGuardada(u) : null))
      .filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

/**
 * OS CARROSSÉIS cujas telas a plataforma recusa.
 *
 * Esta passada NÃO os conserta — quem redesenha tela de carrossel é
 * `recomporCarrosseis`. Eles aparecem no relatório justamente para que o
 * operador não leia "0 peças a reconverter" e conclua que está tudo certo
 * enquanto três carrosséis seguem barrados. Escondê-los seria transformar um
 * diagnóstico honesto numa falsa liberação.
 */
export async function carrosseisComFormatoRecusado(limite: number): Promise<PecaEmFormatoRecusado[]> {
  const candidatos = await prisma.socialPost
    .findMany({
      where: {
        format: { in: [...FORMATOS_DE_CARROSSEL] },
        status: { in: [...STATUS_QUE_AINDA_VAO_AO_AR] },
      },
      orderBy: { scheduledFor: "asc" },
      take: Math.min(Math.max(limite, 1) * 10, 200),
    })
    .catch(() => []);

  const achados: PecaEmFormatoRecusado[] = [];
  for (const post of candidatos) {
    if (achados.length >= limite) break;

    const ids = telasDoCarrossel(post.mediaUrlsJson);
    if (ids.length === 0) continue; // carrossel sem tela é outro defeito, e tem outro dono

    const midias: Array<{ id: string; mime: string | null }> = [];
    for (const id of ids) midias.push({ id, mime: await mimeDe(id) });

    const veredito = conferirFormatoDeMidia(midias, false);
    if (veredito.aceita) continue;

    achados.push({
      postId: post.id,
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      formato: post.format,
      status: post.status,
      agendadoPara: agendadoPara(post),
      midias,
      motivo: veredito.motivo,
    });
  }
  return achados;
}

/** O retrato inteiro, para o relatório de operação. Somente leitura. */
export interface RetratoDoFormato {
  medidoEm: string;
  /** Peças únicas que ESTA passada reconverte. */
  posts: PecaEmFormatoRecusado[];
  /** Carrosséis que só o modo `carrossel` alcança. */
  carrosseis: PecaEmFormatoRecusado[];
  /** A frase única, para quem não vai ler a tabela. */
  veredito: string;
}

export async function retratoDoFormato(limite = 20): Promise<RetratoDoFormato> {
  const posts = (await postsComFormatoRecusado(limite)).map((x) => x.diagnostico);
  const carrosseis = await carrosseisComFormatoRecusado(limite);
  const total = posts.length + carrosseis.length;

  const veredito =
    total === 0
      ? `Nenhuma peça agendada está num formato que a plataforma recusa — todas as que medi já estão em ${MIME_DE_IMAGEM_ACEITO}. ` +
        "Isto NÃO quer dizer que elas publicam: o formato é um portão de doze. Rode `scripts/prontidao-de-publicacao.mts` para a fila inteira."
      : `${total} peça(s) agendada(s) com arquivo que a plataforma recusa: ` +
        `${posts.length} peça(s) única(s) (reconverte com --aplicar) e ${carrosseis.length} carrossel(éis) ` +
        "(reconverte com --aplicar --carrosseis, que é outra função e redesenha as N telas).";

  return { medidoEm: new Date().toISOString(), posts, carrosseis, veredito };
}
