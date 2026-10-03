// vigia-da-entrada.ts — A VIGIA PERIÓDICA DE "/Entrada de material" (1D-D2, 27/09/2026).
//
// O que falta na conta de serviço de `drive-conta-de-servico.ts`: aquele
// arquivo só lê a pasta SOB PEDIDO (clique do operador em "conferir"/
// "importar"). A subpasta "Entrada de material" é onde o CLIENTE larga
// foto/vídeo com uma frase de instrução ("lançamento X, postar dia Y") — e
// ninguém vai clicar "conferir" toda hora esperando o cliente postar. Este
// arquivo é o relógio que confere sozinho, e entrega o achado à mesma esteira
// que a rota de upload (`app/api/agency/clients/[id]/entrada`, bloco 1D-D1)
// usa: `interpretarFrase` + `encaixarNoCalendario`
// (`lib/agency/esteira/entrada-de-material.ts`).
//
// ── CONTRA O PARECER `google` (27/09/2026, condição 3) ───────────────────────
//
//   • `files.list` com filtro de PASTA e `modifiedTime > cursor`, nunca
//     varredura cheia repetida (`listarFilhos(token, id, { desde })`);
//   • cadência de NO MÍNIMO 30 min por cliente (`INTERVALO_MINIMO_MS`);
//   • ESCALONADO: no máximo `limiteDeClientes` por tique, o mais antigo
//     primeiro — nunca todos os clientes no mesmo tique;
//   • SEM `watch` — só leitura sob pedido do próprio relógio da casa
//     (`despertador.ts`), nunca push notification.
//
// O CURSOR é `Client.entradaDriveVistaEm` (contrato do bloco 1D-D1) — um
// campo, DOIS papéis: (a) a régua dos 30 min ("já vistei este cliente
// recentemente?") e (b) o `modifiedTime` que vai na query. Um campo só,
// porque os dois papéis nascem e morrem juntos: separar em dois campos abriria
// espaço para eles divergirem (cliente "vistado" às 10h mas cursor da query
// ainda em 9h, por exemplo) sem nenhum motivo de negócio para isso acontecer.
//
// ── SEM GOOGLE_SA_JSON, NÃO FAZ NADA — NEM CONSULTA O BANCO ─────────────────
//
// Mesma disciplina de `drive-conta-de-servico.ts`: a credencial é a PRIMEIRA
// coisa conferida, antes de qualquer `prisma`. `credencialAusente: true` no
// resultado é o que o despertador usa para anunciar UMA VEZ (via `estadoDe`,
// que só loga transição) — nunca a cada tique.
//
// ── A FRASE: DESCRIÇÃO > .txt > NOME ────────────────────────────────────────
//
// O cliente não teria como preencher um formulário estruturado direto do
// Google Drive do celular — a "descrição" do arquivo é o campo mais acessível
// (Drive mobile deixa editar em "Detalhes"). Um `.txt` companheiro (mesmo
// nome-base) é o plano B para quem prefere escrever a instrução num arquivo
// de texto solto. O NOME do próprio arquivo é o último recurso — melhor uma
// frase pobre ("foto1.jpg") do que recusar o material inteiro.
//
// ── A LIMPEZA DE FIM DE CONTRATO (pendência do parecer, condição 4) ─────────
//
// `apagarMaterialDoDriveAoEncerrarContrato` existe e está PRONTA, mas só está
// LIGADA a um gatilho: `cancelarAssinatura` (`lib/agency/financeiro/
// assinatura.ts`), quando a assinatura cancelada tem `clientId`. É o único
// "contrato encerrado" que esta casa MARCA como fato (grep por
// encerr/churn/cancel em `lib/agency/financeiro` e em `Client` não achou
// outro estado persistido e inequívoco — ver `docs/pendencias.md` para o
// registro da lacuna que sobra: contratos fechados fora do self-serve, sem
// linha de `AssinaturaRecorrente`, não têm hoje nenhum sinal para prender essa
// limpeza).

import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import {
  guardarArquivo,
  apagarArquivo,
  MAX_BYTES_POR_ARQUIVO,
} from "@/lib/agency/media/armazenamento";
import { duracaoDe } from "@/lib/agency/media/video";
import {
  credencialDaContaDeServico,
  idDaPasta,
  obterAccessToken,
  listarFilhos,
  baixarBytes,
  chaveDePasta,
  resolverFrase,
  SUBPASTA_PRONTOS_PARA_POSTAR,
  SUBPASTA_DE_ENTRADA,
  UPLOADED_BY_DRIVE_DO_CLIENTE,
  type ItemDaPasta,
} from "@/lib/integrations/google/drive-conta-de-servico";

/** Um cliente só é vistado de novo depois disso — a régua de cadência do
 *  parecer (15–60 min "por cliente"; 30 min é o meio-termo: rápido o
 *  suficiente para o cliente não esperar meio dia pela peça, longe o
 *  bastante da rajada que restringiu a conta de anúncios em 03/08/2026). */
export const INTERVALO_MINIMO_MS = 30 * 60_000;

/** Nunca todos os clientes no mesmo tique — é o ESCALONAMENTO que o parecer
 *  exige. 5 é pequeno o bastante para uma passada de 5 em 5 min (a cadência do
 *  despertador) nunca virar rajada, mesmo com a casa cheia de clientes. */
export const LIMITE_PADRAO_DE_CLIENTES = 5;

/** Só isto conta como "arquivo de entrada de material" — imagem ou vídeo.
 *  PDF (que a importação manual aceita) fica de fora de propósito: a esteira
 *  de peça de social não sabe fazer post de PDF. */
function ehMidiaDeEntrada(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

/**
 * Duração real do vídeo já baixado do Drive — a MESMA função (`ffprobe`/
 * `duracaoDe`) que `app/api/agency/clients/[id]/entrada/route.ts` usa no
 * upload manual (`medirDuracaoDoVideo`, ali dentro da rota). Sem isto, todo
 * vídeo do Drive ia para `interpretarFrase` sem `duracaoS` — e
 * `videoServeParaReel` (que trata duração DESCONHECIDA como "ok, segue",
 * de propósito, para o caso "ainda não medimos") deixava passar como reels
 * um vídeo de QUALQUER duração vindo do Drive. Achado da `qualidade`, D5,
 * 28/09/2026.
 */
async function medirDuracaoDoVideoBaixado(bytes: Buffer): Promise<number | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "dioli-vigia-entrada-"));
  try {
    const caminho = path.join(dir, "bruto");
    await writeFile(caminho, bytes);
    return await duracaoDe(caminho);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}

interface ClienteElegivel {
  id: string;
  workspaceId: string;
  pastaDriveUrl: string;
  entradaDriveVistaEm: Date | null;
}

/** O que o D1 exportou — usado só pela ASSINATURA de tipo aqui; a resolução
 *  real acontece em runtime, via `import()` dinâmico logo abaixo, para este
 *  arquivo carregar mesmo num ambiente onde o módulo do D1 ainda não subiu
 *  (o despertador chama esta vigia inteira dentro de um `try`/`catch` e de um
 *  `import()` próprio — ver `despertador.ts`). */
type ModuloDeEntrada = typeof import("@/lib/agency/esteira/entrada-de-material");

async function processarUmCliente(a: {
  token: string;
  cliente: ClienteElegivel;
  agora: Date;
  entradaModule: ModuloDeEntrada;
}): Promise<{
  arquivosNovos: number;
  entradasCriadas: number;
  encaixadas: number;
  ambiguas: number;
  duplicadas: number;
  falha?: string;
}> {
  const vazio = { arquivosNovos: 0, entradasCriadas: 0, encaixadas: 0, ambiguas: 0, duplicadas: 0 };

  const pastaId = idDaPasta(a.cliente.pastaDriveUrl);
  if (!pastaId) return { ...vazio, falha: "o link da pasta do Drive não parece válido" };

  const raiz = await listarFilhos(a.token, pastaId);
  if (!raiz.ok) return { ...vazio, falha: raiz.motivo };

  // DUAS pastas vigiadas (03/10/2026): "Entrada de material" (novidade com
  // instrução) e "Prontos para postar" (arte pronta do cliente, publicada como
  // veio). Basta uma existir; faltar as duas é o único caso de falha.
  const acharPasta = (nome: string) =>
    raiz.itens.find((i) => i.ehPasta && chaveDePasta(i.nome) === chaveDePasta(nome));
  const pastasVigiadas = [
    { pasta: acharPasta(SUBPASTA_DE_ENTRADA), prontoParaPostar: false },
    { pasta: acharPasta(SUBPASTA_PRONTOS_PARA_POSTAR), prontoParaPostar: true },
  ].filter((p): p is { pasta: ItemDaPasta; prontoParaPostar: boolean } => !!p.pasta);
  if (pastasVigiadas.length === 0) {
    return {
      ...vazio,
      falha: `as subpastas "${SUBPASTA_DE_ENTRADA}" e "${SUBPASTA_PRONTOS_PARA_POSTAR}" não foram encontradas dentro da pasta da marca`,
    };
  }

  const cursorIso = a.cliente.entradaDriveVistaEm ? a.cliente.entradaDriveVistaEm.toISOString() : undefined;
  const candidatosComOrigem: Array<{ item: ItemDaPasta; prontoParaPostar: boolean; itensDaPasta: ItemDaPasta[] }> = [];
  for (const v of pastasVigiadas) {
    const novosR = await listarFilhos(a.token, v.pasta.id, { desde: cursorIso });
    if (!novosR.ok) return { ...vazio, falha: novosR.motivo };
    const novos = novosR.itens.filter((i) => !i.ehPasta && ehMidiaDeEntrada(i.mimeType));
    if (novos.length === 0) continue;
    // Listagem SEM filtro de data, só para achar o `.txt` companheiro — ele pode
    // ter sido criado antes do cursor.
    const todosR = await listarFilhos(a.token, v.pasta.id);
    const itensDaPasta = todosR.ok ? todosR.itens : [];
    for (const item of novos) candidatosComOrigem.push({ item, prontoParaPostar: v.prontoParaPostar, itensDaPasta });
  }
  const candidatos = candidatosComOrigem.map((c) => c.item);
  if (candidatos.length === 0) return vazio;

  let entradasCriadas = 0;
  let encaixadas = 0;
  let ambiguas = 0;
  let duplicadas = 0;

  for (const { item, prontoParaPostar, itensDaPasta } of candidatosComOrigem) {
    if (item.tamanhoBytes > MAX_BYTES_POR_ARQUIVO) continue;

    // IDEMPOTÊNCIA POR driveFileId — o mesmo arquivo nunca vira uma segunda
    // EntradaDeMaterial, mesmo que o cursor não tenha avançado (crash no meio
    // do processamento anterior faria o próximo tique reencontrar este item).
    const jaExiste = await prisma.entradaDeMaterial.findFirst({
      where: { clientId: a.cliente.id, driveFileId: item.id },
      select: { id: true },
    });
    if (jaExiste) continue;

    const baixado = await baixarBytes(a.token, item.id);
    if (!baixado.ok) continue;

    // DURAÇÃO DO VÍDEO — achado nº1 da `qualidade` (D5, 28/09/2026). Os bytes
    // JÁ estão baixados; medir agora é o mesmo custo de medir depois, e sem
    // isto todo vídeo do Drive ia para `interpretarFrase` sem `duracaoS`.
    const eVideo = item.mimeType.startsWith("video/");
    const duracaoS = eVideo ? await medirDuracaoDoVideoBaixado(baixado.bytes).catch(() => null) : null;
    // Diferente de "nunca medimos" (imagem, ou vídeo cujos bytes ainda não
    // chegaram): aqui os bytes JÁ estavam em mãos, e o `ffprobe` não
    // conseguiu ler mesmo assim — o `videoServeParaReel` compartilhado trata
    // duração desconhecida como "ok, segue" (ausência de informação não é
    // informação, para o caso comum de "ainda não medimos"), mas ISTO é
    // "medimos e falhou": sinal mais forte, tratado abaixo como formato a
    // confirmar em vez de deixar passar como reels às cegas.
    const medicaoDeVideoFalhou = eVideo && duracaoS === null;

    const sha256 = createHash("sha256").update(baixado.bytes).digest("hex");
    const existenteAsset = await prisma.mediaAsset.findFirst({
      where: { workspaceId: a.cliente.workspaceId, clientId: a.cliente.id, sha256 },
      select: { id: true },
    });

    let mediaAssetId: string;
    if (existenteAsset) {
      mediaAssetId = existenteAsset.id;
    } else {
      const guardado = await guardarArquivo({
        bytes: baixado.bytes,
        fileName: item.nome,
        mimeType: item.mimeType,
        workspaceId: a.cliente.workspaceId,
        clientId: a.cliente.id,
        kind: "inbound",
        uploadedBy: UPLOADED_BY_DRIVE_DO_CLIENTE,
        duracaoS,
      });
      if (!guardado.ok) continue;
      mediaAssetId = guardado.arquivo.id;
    }

    // DEDUPE — achado nº2 da `qualidade` (D5, 28/09/2026): a mesma foto pode
    // já ter entrado pelo upload manual (ou por outra passada desta mesma
    // vigia, com sha256 igual mas driveFileId diferente — ex.: o cliente
    // copiou o arquivo dentro da pasta). Não cria uma segunda entrada; marca
    // "recusada" com o motivo apontando para a entrada existente, mas AINDA
    // grava a linha (com `driveFileId`), para este arquivo do Drive não ser
    // reprocessado no próximo tique.
    const duplicataDe = await a.entradaModule.entradaExistenteParaMedia({
      workspaceId: a.cliente.workspaceId,
      clientId: a.cliente.id,
      mediaAssetId,
    });

    const frase = await resolverFrase({ token: a.token, item, itensDaPasta });

    const entrada = await prisma.entradaDeMaterial.create({
      data: {
        workspaceId: a.cliente.workspaceId,
        clientId: a.cliente.id,
        origem: "drive",
        frase,
        mediaAssetIdsJson: JSON.stringify([mediaAssetId]),
        status: duplicataDe ? "recusada" : "recebida",
        motivo: duplicataDe
          ? `este material já entrou antes (entrada ${duplicataDe.id}) — não criei um segundo post para a mesma mídia`
          : null,
        driveFileId: item.id,
      },
    });
    entradasCriadas++;

    if (duplicataDe) {
      duplicadas++;
      continue;
    }

    const interpretado = await a.entradaModule.interpretarFrase({
      workspaceId: a.cliente.workspaceId,
      clientId: a.cliente.id,
      frase,
      hoje: a.agora,
      midias: [{ mime: item.mimeType, duracaoS }],
    });

    // ── PRONTOS PARA POSTAR (CEO, 03/10/2026) ───────────────────────────────
    // Arquivo na pasta "Prontos para postar" = arte já pronta, com logo: vira UM story, com
    // a mídia como veio (a arte só é desenhada para peça SEM `mediaUrl`), e a
    // IA não decide o formato. Se a IA nem responder, o story entra mesmo assim
    // na próxima data livre — nada trava. A aprovação segue o modo da marca
    // (na primeira semana, a do CEO).
    const storyPronto = prontoParaPostar;
    if (!interpretado.ok && !storyPronto) {
      await prisma.entradaDeMaterial
        .update({ where: { id: entrada.id }, data: { status: "recusada", motivo: interpretado.motivo } })
        .catch(() => { /* best-effort: a entrada já ficou registrada */ });
      continue;
    }
    const interpretadoOuPadrao = interpretado.ok
      ? interpretado.interpretacao
      : {
          intencao: "produto" as const,
          resumo: "Story pronto do cliente",
          dataAlvo: null,
          horarioAlvo: null,
          dataAmbigua: false,
          motivoDaAmbiguidade: null,
          formatos: ["stories" as const],
          quantidade: 1,
        };
    const interpretacaoBase = storyPronto
      ? { ...interpretadoOuPadrao, formatos: ["stories" as const], quantidade: 1 }
      : interpretadoOuPadrao;

    // A MESMA função (`videoServeParaReel`) bypassa quando a duração é
    // desconhecida — correto para "nunca medimos". Mas se medimos e FALHAMOS
    // (`medicaoDeVideoFalhou`) e o pedido inclui "reels", isto não pode virar
    // reels sem confirmação: soma a ambiguidade em vez de deixar passar.
    const interpretacao =
      medicaoDeVideoFalhou && interpretacaoBase.formatos.includes("reels") && !interpretacaoBase.dataAmbigua
        ? {
            ...interpretacaoBase,
            dataAmbigua: true,
            motivoDaAmbiguidade: "não consegui medir a duração deste vídeo do Drive — confirme o formato antes de virar reels",
          }
        : interpretacaoBase;

    const ambigua = interpretacao.dataAmbigua;
    await prisma.entradaDeMaterial
      .update({
        where: { id: entrada.id },
        data: {
          status: ambigua ? "preciso_confirmar" : "interpretada",
          interpretacaoJson: JSON.stringify(interpretacao),
          motivo: ambigua ? interpretacao.motivoDaAmbiguidade : null,
        },
      })
      .catch(() => { /* best-effort */ });

    if (ambigua) {
      ambiguas++;
      continue;
    }

    const encaixado = await a.entradaModule.encaixarNoCalendario({
      workspaceId: a.cliente.workspaceId,
      clientId: a.cliente.id,
      entradaId: entrada.id,
      agora: a.agora,
    });

    if (encaixado.ok && storyPronto) {
      // A marca que diz "publique como veio" — quem olhar a peça sabe que a
      // arte é do cliente, não da casa.
      for (const postId of encaixado.socialPostIds) {
        const post = await prisma.socialPost.findUnique({ where: { id: postId }, select: { scriptJson: true } }).catch(() => null);
        let o: Record<string, unknown> = {};
        try { o = post?.scriptJson ? (JSON.parse(post.scriptJson) as Record<string, unknown>) : {}; } catch { o = {}; }
        await prisma.socialPost
          .update({ where: { id: postId }, data: { scriptJson: JSON.stringify({ ...o, storyPronto: true }) } })
          .catch(() => { /* best-effort */ });
      }
    }

    if (encaixado.ok) {
      await prisma.entradaDeMaterial
        .update({
          where: { id: entrada.id },
          data: { status: "encaixada", socialPostIdsJson: JSON.stringify(encaixado.socialPostIds) },
        })
        .catch(() => { /* best-effort */ });
      encaixadas++;
    } else {
      await prisma.entradaDeMaterial
        .update({ where: { id: entrada.id }, data: { motivo: encaixado.motivo } })
        .catch(() => { /* best-effort */ });
    }
  }

  return { arquivosNovos: candidatos.length, entradasCriadas, encaixadas, ambiguas, duplicadas };
}

export interface ResultadoDaVigia {
  /** `GOOGLE_SA_JSON` ausente — a vigia recusou ANTES de tocar o banco. Não é
   *  falha: é o estado normal até o CEO provisionar a credencial. */
  credencialAusente: boolean;
  clientesVarridos: number;
  arquivosNovos: number;
  entradasCriadas: number;
  encaixadas: number;
  ambiguas: number;
  /** A mesma mídia já tinha entrado por outro caminho (upload manual, ou
   *  outro arquivo do Drive com o mesmo sha256) — não virou um segundo post.
   *  Achado nº2 da `qualidade`, D5, 28/09/2026. */
  duplicadas: number;
  falhas: { clientId: string; motivo: string }[];
}

/**
 * Uma passada da vigia. Chamada pelo `despertador.ts`, 1 vez por tique, com
 * `limiteDeClientes` pequeno — nunca varre a casa inteira de uma vez.
 *
 * Nunca lança: cada cliente é isolado, e o resultado é sempre um objeto com
 * contadores + a lista do que falhou (com o cliente e o motivo, nunca
 * silêncio).
 */
export async function vigiarEntradaDeMaterial(
  a: { agora?: Date; limiteDeClientes?: number } = {},
): Promise<ResultadoDaVigia> {
  const agora = a.agora ?? new Date();
  const limite = a.limiteDeClientes ?? LIMITE_PADRAO_DE_CLIENTES;

  const resultado: ResultadoDaVigia = {
    credencialAusente: false,
    clientesVarridos: 0,
    arquivosNovos: 0,
    entradasCriadas: 0,
    encaixadas: 0,
    ambiguas: 0,
    duplicadas: 0,
    falhas: [],
  };

  // A TRAVA VEM ANTES DE QUALQUER `prisma` — mesma disciplina de
  // `conferirPastaDaMarca`/`importarMaterialDaPasta`: sem credencial, a vigia
  // "não faz nada", e "nada" inclui não consultar quem seriam os candidatos.
  const cred = credencialDaContaDeServico();
  if (!cred.ok) {
    resultado.credencialAusente = true;
    return resultado;
  }

  const candidatos = await prisma.client
    .findMany({
      where: { pastaDriveUrl: { not: null }, autorizacaoDriveEm: { not: null } },
      select: { id: true, workspaceId: true, pastaDriveUrl: true, entradaDriveVistaEm: true },
    })
    .catch(() => [] as Array<{ id: string; workspaceId: string; pastaDriveUrl: string | null; entradaDriveVistaEm: Date | null }>);

  const limiar = agora.getTime() - INTERVALO_MINIMO_MS;
  const elegiveis = candidatos
    .filter((c) => !c.entradaDriveVistaEm || c.entradaDriveVistaEm.getTime() <= limiar)
    // Nunca visto (`-Infinity`) vem antes de qualquer data real — o
    // ESCALONAMENTO prioriza quem espera há mais tempo, e "nunca" é o maior
    // tempo de espera que existe.
    .sort((x, y) => {
      const tx = x.entradaDriveVistaEm ? x.entradaDriveVistaEm.getTime() : -Infinity;
      const ty = y.entradaDriveVistaEm ? y.entradaDriveVistaEm.getTime() : -Infinity;
      return tx - ty;
    })
    .slice(0, limite);

  if (elegiveis.length === 0) return resultado;

  // Um token só, reaproveitado pelos até `limite` clientes desta passada — a
  // conta de serviço é a mesma para todos, e assinar um JWT por cliente seria
  // trabalho repetido sem motivo.
  const tokenR = await obterAccessToken();
  if (!tokenR.ok) {
    resultado.falhas.push({ clientId: "*", motivo: tokenR.motivo });
    return resultado;
  }

  // Import DINÂMICO, de propósito: se o contrato do D1
  // (`lib/agency/esteira/entrada-de-material.ts`) ainda não existir no
  // ambiente que rodar isto, a falha vira UMA entrada em `falhas`, não uma
  // exceção que derruba o processo inteiro nem uma falha de carregamento
  // deste módulo inteiro (`vigia-da-entrada.ts` continua importável mesmo
  // sem o D1 no ar).
  let entradaModule: ModuloDeEntrada;
  try {
    entradaModule = await import("@/lib/agency/esteira/entrada-de-material");
  } catch (err) {
    resultado.falhas.push({
      clientId: "*",
      motivo: `contrato de entrada de material indisponível: ${err instanceof Error ? err.message : "erro desconhecido"}`,
    });
    return resultado;
  }

  for (const c of elegiveis) {
    resultado.clientesVarridos++;
    try {
      const r = await processarUmCliente({
        token: tokenR.token,
        cliente: { id: c.id, workspaceId: c.workspaceId, pastaDriveUrl: c.pastaDriveUrl!, entradaDriveVistaEm: c.entradaDriveVistaEm },
        agora,
        entradaModule,
      });
      resultado.arquivosNovos += r.arquivosNovos;
      resultado.entradasCriadas += r.entradasCriadas;
      resultado.encaixadas += r.encaixadas;
      resultado.ambiguas += r.ambiguas;
      resultado.duplicadas += r.duplicadas;
      if (r.falha) resultado.falhas.push({ clientId: c.id, motivo: r.falha });
    } catch (err) {
      resultado.falhas.push({ clientId: c.id, motivo: err instanceof Error ? err.message : "erro desconhecido" });
    } finally {
      // O CURSOR SÓ AVANÇA DEPOIS DE PROCESSAR — mesmo quando este cliente
      // falhou: retentar o mesmo cliente quebrado a cada 5 minutos (o tique do
      // despertador) ignoraria a própria régua de 30 min que esta vigia impõe
      // para todo mundo. Best-effort: se o carimbo falhar, a varredura em si já
      // aconteceu e não se perde.
      await prisma.client
        .update({ where: { id: c.id }, data: { entradaDriveVistaEm: agora } })
        .catch(() => { /* best-effort */ });
    }
  }

  return resultado;
}

/**
 * APAGA o material que a agência importou da PASTA DO CLIENTE (upload +
 * vigia), quando o contrato dele encerra — condição 4 do parecer `google`
 * (27/09/2026): "guardar só o que a esteira usa; apagar no fim do contrato".
 *
 * Só apaga `MediaAsset` com `uploadedBy === UPLOADED_BY_DRIVE_DO_CLIENTE` —
 * arte GERADA pela casa, upload manual do operador e qualquer outra origem
 * do mesmo cliente ficam intactos. Confundir origem apagaria material que a
 * casa produziu, não o que o cliente emprestou.
 *
 * ⚠️ Gatilho: hoje só `cancelarAssinatura`
 * (`lib/agency/financeiro/assinatura.ts`) chama esta função, e só quando a
 * assinatura cancelada tem `clientId`. Contrato fechado por outro caminho
 * (venda direta sem `AssinaturaRecorrente`, ou assinatura sem `clientId`
 * preenchido) NÃO dispara isto sozinho — é a lacuna registrada em
 * `docs/pendencias.md`, não inventada aqui.
 */
export async function apagarMaterialDoDriveAoEncerrarContrato(clientId: string): Promise<{ apagados: number }> {
  const itens = await prisma.mediaAsset.findMany({
    where: { clientId, uploadedBy: UPLOADED_BY_DRIVE_DO_CLIENTE },
    select: { id: true },
  });

  let apagados = 0;
  for (const item of itens) {
    const ok = await apagarArquivo(item.id).catch(() => false);
    if (ok) apagados++;
  }
  return { apagados };
}
