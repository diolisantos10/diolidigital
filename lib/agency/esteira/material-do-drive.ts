// material-do-drive.ts — DO DRIVE DO CLIENTE ATÉ A MÃO DE QUEM PRODUZ.
//
// Ordem do CEO (07/08/2026): "cada cliente conecta o Google Drive dele ao portal,
// e a agência puxa o material de lá" — "pra poder ter mais acuracidade no que a
// marca tem de material de brand e imagem".
//
// Este arquivo é a ponte. Ele NÃO decide o que pode ser usado (isso é da trava,
// em lib/integrations/google/escolha-de-material.ts) e NÃO fala com o Google
// (isso é de lib/integrations/google/drive.ts). Ele faz três coisas:
//
//   1. IMPORTA o material autorizado para o armazenamento da casa, virando um
//      `MediaAsset` como qualquer arquivo que o cliente sobe pelo portal;
//   2. FECHA o pedido de material que estava aberto — reusando
//      `materialEnviadoPeloCliente`, o mesmo caminho do upload manual. Um
//      segundo caminho divergiria, e o pedido voltaria a ficar aberto para
//      sempre esperando alguém perguntar;
//   3. ENTREGA a quem produz (`materiaisDeMarca`, `logoDoCliente`) o que existe
//      de verdade — e, quando não existe, devolve VAZIO, que é a resposta certa.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, E É O MAIS IMPORTANTE ───────────────────────
//
// Material do Drive é INSUMO, não verdade. Ter a foto do produto não autoriza a
// casa a afirmar nada sobre o negócio do cliente: o piso de verdade
// (lib/agency/execution/piso-de-verdade.ts) continua valendo inteiro. O que muda
// é o que a peça pode MOSTRAR — não o que a peça pode DIZER.
//
// E arquivo ausente vira PERGUNTA, nunca invenção: sem logo no Drive, a peça sai
// declarando que falta o logo, e não com um logo desenhado por IA.

import { prisma } from "@/lib/db/client";
import { guardarArquivo } from "@/lib/agency/media/armazenamento";
import { baixarMaterial } from "@/lib/integrations/google/drive";
import { materialEnviadoPeloCliente } from "@/lib/agency/esteira/materiais";
import {
  materialAutorizado,
  papelValido,
  type Papel,
  type MaterialParaDecidir,
  type ConexaoParaDecidir,
} from "@/lib/integrations/google/escolha-de-material";

export interface ImportacaoDeMaterial {
  ok: boolean;
  mediaAssetId?: string;
  /** O pedido de material que este arquivo fechou, quando fechou. */
  materialRequestId?: string | null;
  /** Em português, sempre. Vai para a tela do cliente ou para a escalação. */
  erro?: string;
}

/**
 * O nome com que o arquivo entra na casa.
 *
 * Prefixado com o papel que **o cliente declarou**. Não é palpite: é a palavra
 * dele, e é o que permite `casarMaterial` fechar o pedido certo pelo critério
 * "nome" — o critério mais forte que aquele casador tem, justamente porque
 * normalmente é o cliente quem escreve o nome do arquivo.
 *
 * Sem isto, "IMG_2831.jpg" chegaria como um arquivo sem história e o pedido de
 * material ficaria aberto — que é exatamente o defeito que estamos fechando.
 */
export function nomeDeEntrada(papel: Papel, nomeNoDrive: string): string {
  const base = (nomeNoDrive || "arquivo").replace(/[/\\]/g, "-").slice(0, 120);
  const palavra: Record<Papel, string> = {
    logo: "logo",
    manual_de_marca: "manual-de-marca",
    foto_produto: "foto-produto",
    foto_equipe: "foto-equipe",
    foto_local: "foto-local",
    captura_de_tela: "captura-de-tela",
    referencia: "referencia",
    outro: "material",
  };
  return `${palavra[papel]}-${base}`;
}

/**
 * Traz UM material do Drive para dentro da casa.
 *
 * Idempotente: material já importado devolve o mesmo `MediaAsset` sem baixar de
 * novo. Reimportar gastaria cota do Google e duplicaria bytes num volume que
 * divide disco com o banco.
 */
export async function importarMaterialDoDrive(driveMaterialId: string): Promise<ImportacaoDeMaterial> {
  const m = await prisma.driveMaterial.findUnique({ where: { id: driveMaterialId } });
  if (!m) return { ok: false, erro: "material do Drive não encontrado" };
  if (m.mediaAssetId) return { ok: true, mediaAssetId: m.mediaAssetId };

  // `baixarMaterial` já aplica a trava antes da rede. Não repetimos a decisão
  // aqui — duas cópias da mesma regra divergem.
  const r = await baixarMaterial(driveMaterialId);
  if (!r.ok || !r.dados) {
    await prisma.driveMaterial.update({
      where: { id: driveMaterialId },
      data: { erro: (r.erro ?? "não consegui baixar").slice(0, 300) },
    }).catch(() => { /* best-effort */ });
    return { ok: false, erro: r.erro };
  }

  const papel = papelValido(m.papel);
  if (!papel) return { ok: false, erro: "material sem papel declarado pelo cliente" };

  const guardado = await guardarArquivo({
    bytes: r.dados.bytes,
    fileName: nomeDeEntrada(papel, r.dados.nome),
    mimeType: r.dados.mimeType,
    workspaceId: m.workspaceId,
    clientId: m.clientId,
    kind: "inbound",
    uploadedBy: "cliente (Google Drive)",
  });

  if (!guardado.ok) {
    await prisma.driveMaterial.update({
      where: { id: driveMaterialId },
      data: { erro: guardado.motivo.slice(0, 300) },
    }).catch(() => { /* best-effort */ });
    return { ok: false, erro: guardado.motivo };
  }

  await prisma.driveMaterial.update({
    where: { id: driveMaterialId },
    data: { mediaAssetId: guardado.arquivo.id, importadoEm: new Date(), erro: null },
  }).catch(() => { /* best-effort: o arquivo já está guardado */ });

  // ── O PEDIDO DE MATERIAL FECHA SOZINHO ────────────────────────────────────
  // Mesmo caminho do upload manual. Best-effort: o arquivo já está salvo, e
  // falhar aqui não pode transformar uma importação bem-sucedida em erro.
  const envio = await materialEnviadoPeloCliente({
    workspaceId: m.workspaceId,
    clientId: m.clientId,
    arquivo: { fileName: guardado.arquivo.fileName, mimeType: guardado.arquivo.mimeType },
    assetId: guardado.arquivo.id,
  }).catch(() => null);

  return {
    ok: true,
    mediaAssetId: guardado.arquivo.id,
    materialRequestId: envio?.materialRequestId ?? null,
  };
}

export interface ImportacaoEmLote {
  importados: number;
  falhas: Array<{ nome: string; erro: string }>;
  /** Quantos ficaram de fora por falta de declaração do cliente. */
  aguardandoCliente: number;
}

/**
 * Importa tudo o que o cliente já declarou e ainda não foi buscado.
 *
 * Chamada quando o cliente confirma os papéis no portal, e de novo pelo
 * despertador. Sem teto artificial de rodada: são arquivos que o próprio dono
 * escolheu, um por um — não é varredura de conta alheia, que é o padrão que a
 * casa evita desde 03/08/2026.
 */
export async function importarPendentesDoCliente(clientId: string): Promise<ImportacaoEmLote> {
  const saida: ImportacaoEmLote = { importados: 0, falhas: [], aguardandoCliente: 0 };

  const pendentes = await prisma.driveMaterial.findMany({
    where: { clientId, mediaAssetId: null },
    orderBy: { escolhidoEm: "asc" },
    take: 50,
  }).catch(() => []);

  for (const m of pendentes) {
    if (!m.papelConfirmadoEm || !papelValido(m.papel)) {
      saida.aguardandoCliente++;
      continue;
    }
    const r = await importarMaterialDoDrive(m.id);
    if (r.ok) saida.importados++;
    else saida.falhas.push({ nome: m.nome, erro: r.erro ?? "falha desconhecida" });
  }

  return saida;
}

// ─── O QUE QUEM PRODUZ ENXERGA ──────────────────────────────────────────────

export interface MaterialDeMarca {
  papel: Papel;
  /** O id do `MediaAsset` — o arquivo real, no volume da casa. */
  mediaAssetId: string;
  /** A URL interna para servir o arquivo. */
  url: string;
  nome: string;
  mimeType: string;
}

/**
 * O material de marca REAL do cliente, pronto para entrar numa peça.
 *
 * Devolve só o que passou pela trava E já foi importado. Lista vazia significa
 * "o cliente não deu material" — e "não deu" nunca vira "invente".
 */
export async function materiaisDeMarca(clientId: string | null | undefined): Promise<MaterialDeMarca[]> {
  if (!clientId) return [];

  const conexao = await prisma.googleDriveConnection.findFirst({ where: { clientId } }).catch(() => null);
  const decidir: ConexaoParaDecidir | null = conexao
    ? {
        status: conexao.status,
        escopos: conexao.escopos,
        tokenExpiresAt: conexao.tokenExpiresAt,
        temRefresh: !!conexao.refreshTokenEncrypted,
      }
    : null;

  const linhas = await prisma.driveMaterial.findMany({
    where: { clientId, mediaAssetId: { not: null }, papelConfirmadoEm: { not: null } },
    orderBy: { importadoEm: "desc" },
    take: 100,
  }).catch(() => []);

  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: linhas.map((l) => l.mediaAssetId!).filter(Boolean) } },
    select: { id: true, fileName: true, mimeType: true },
  }).catch(() => []);
  const porId = new Map(assets.map((a) => [a.id, a]));

  const saida: MaterialDeMarca[] = [];
  for (const l of linhas) {
    const m: MaterialParaDecidir = {
      fileId: l.fileId, nome: l.nome, ehPasta: l.ehPasta,
      papel: l.papel, papelConfirmadoEm: l.papelConfirmadoEm,
    };
    // A trava roda DE NOVO na leitura. O material foi autorizado no dia da
    // importação; se o cliente revogou depois, ou a conexão morreu, o arquivo
    // não volta a circular por já estar no nosso disco.
    const v = materialAutorizado(decidir, m);
    if (!v.pode || !v.papel) continue;

    const a = porId.get(l.mediaAssetId!);
    if (!a) continue;
    saida.push({
      papel: v.papel,
      mediaAssetId: a.id,
      url: `/api/media/${a.id}`,
      nome: a.fileName,
      mimeType: a.mimeType,
    });
  }
  return saida;
}

/**
 * O logo REAL do cliente, se ele deu um.
 *
 * `null` = não existe. Quem chama tem que tratar `null` como "falta material" e
 * escalar — jamais como licença para desenhar um logo. O logo da Foocci é, hoje,
 * o nome escrito em fonte, e é essa dívida que esta função existe para pagar.
 */
export async function logoDoCliente(clientId: string | null | undefined): Promise<MaterialDeMarca | null> {
  const todos = await materiaisDeMarca(clientId);
  return todos.find((m) => m.papel === "logo") ?? null;
}

/** As fotos reais que podem entrar numa peça — produto, equipe, local, tela. */
export async function fotosReaisDoCliente(clientId: string | null | undefined): Promise<MaterialDeMarca[]> {
  const todos = await materiaisDeMarca(clientId);
  return todos.filter((m) =>
    m.papel === "foto_produto" || m.papel === "foto_equipe" || m.papel === "foto_local" || m.papel === "captura_de_tela",
  );
}
