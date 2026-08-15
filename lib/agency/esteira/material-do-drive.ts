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
//
// ── ✅ 08/08/2026 — A PONTE EXISTIA DOS DOIS LADOS E FALTAVA O MEIO ─────────
//
// O defeito, medido nos dois lados antes do conserto:
//
//   • `materiaisDeMarca` (abaixo) é a ÚNICA porta de material para dentro de uma
//     peça. Quem consome: `execution/artes.ts` (logo + fotos reais) e
//     `execution/logo.ts`. Não há outra.
//   • Ela lia EXCLUSIVAMENTE material de origem Drive, exigindo as três coisas
//     juntas: `mediaAssetId` + `papelConfirmadoEm` + `GoogleDriveConnection` viva.
//   • E a linha de material nascia em UM ÚNICO lugar no repositório inteiro:
//     `app/api/portal/drive/route.ts` — o caminho do **Google Picker**.
//
// Consequência: o portal do cliente TEM, desde 02/08, uma tela de arrastar e
// soltar (`components/portal/EnvioDeMaterial.tsx` → `POST /api/media`). Ela
// guardava o `MediaAsset`, fechava o `MaterialRequest` e destravava a esteira —
// e **nunca criava linha de material, nem perguntava o papel do arquivo.**
//
// Ou seja: o logo que o cliente (ou o CEO) subia pelo portal chegava ao disco da
// casa, avisava a equipe, destravava a produção — e era **INVISÍVEL para a
// peça**. Os bytes atravessavam; a declaração de PAPEL, não. A peça continuava
// saindo com o nome do cliente escrito em fonte comum, com o arquivo real já
// gravado no volume.
//
// **O conserto: uma ORIGEM no material** (`prisma/schema.prisma`, migration
// `20260808150000_origem_do_material`):
//
//   • `drive`        — exige conexão viva com o Google, exatamente como antes;
//   • `envio_direto` — o portal ou o admin; **não depende do Google para nada**,
//     porque a casa já tem os bytes pelo ato do próprio dono.
//
// A entrada é `registrarMaterialEnviado` (abaixo). O papel é PEDIDO NA HORA DO
// ENVIO, na própria tela — sem papel declarado o arquivo é guardado mas não
// entra em peça nenhuma, e a esteira escala pedindo em vez de engolir em
// silêncio.
//
// ⚠️ **A metade que quase ninguém testa, e é o ponto inteiro da mudança:**
// material de origem `envio_direto` continua valendo com o Google
// DESCONECTADO. Travado em `__tests__/esteira/origem-do-material.test.ts`.

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
 * Chamada quando o cliente confirma os papéis no portal. O material que JÁ foi
 * declarado e falhou é responsabilidade de `reimportarFalhados` (abaixo), que o
 * despertador chama — esta aqui só olha o que nunca foi tentado.
 *
 * Sem teto artificial de rodada: são arquivos que o próprio dono escolheu, um
 * por um — não é varredura de conta alheia, que é o padrão que a casa evita
 * desde 03/08/2026.
 *
 * ⚠️ Este comentário dizia, até 15/08/2026, "e de novo pelo despertador".
 * **Não era verdade**: não havia nenhum chamador no cron — o `PATCH` do portal
 * era o único do repositório. Um arquivo que falhava ficava preso até o cliente
 * declarar o papel de algum outro. Comentário que promete um chamador que não
 * existe é pior que comentário nenhum: alguém lê, acredita, e para de procurar.
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

// ─── O ERRO QUE NÃO ENVELHECE — 15/08/2026 ──────────────────────────────────
//
// ── O QUE O CEO VIU NA TELA, SETE DIAS DEPOIS DO CONSERTO ─────────────────
//
// O portal do CityJobs mostrava, hoje, ao lado de dois logos:
//   "Não aceitamos arquivo SVG enviado de fora. Mande em PNG, JPG ou PDF."
//
// Essa frase **não existe mais no código**. Ela foi apagada em 09/08/2026,
// quando a porta abriu e `limparSvg` passou a higienizar o SVG na entrada
// (`lib/agency/media/armazenamento.ts`). O que o CEO leu foi um `erro` GRAVADO
// no banco (linha 155 acima) numa tentativa antiga, renderizado desde então
// pelo portal (`components/portal/DriveDoCliente.tsx:387`) como se fosse o
// estado de hoje.
//
// ── POR QUE ELE NUNCA SAIU SOZINHO ────────────────────────────────────────
//
// `importarPendentesDoCliente` só era chamada de UM lugar no repositório
// inteiro: o `PATCH /api/portal/drive` (route.ts:269) — ou seja, **só quando o
// cliente declara o papel de algum arquivo**. Quem já tinha declarado tudo não
// tinha mais nenhum gesto capaz de disparar uma nova tentativa. O arquivo ficava
// preso, com um recado falso ao lado, para sempre.
//
// (O comentário de `importarPendentesDoCliente` dizia "e de novo pelo
// despertador". Não dizia a verdade: não havia chamador no cron. Corrigido lá.)
//
// ── A REGRA QUE FICA: TODO "FALHOU" TEM PRAZO ─────────────────────────────
//
// Nenhum estado pode prender um arquivo para sempre. Retentativa precisa de
// **prazo e teto** — sem teto, um erro permanente vira laço infinito contra a
// cota do Google; sem prazo, um erro temporário vira sentença.
//
//   • TETO: `TETO_POR_RODADA` arquivos por chamada. O despertador volta.
//   • PRAZO: a tentativa só se repete depois de `INTERVALO_ENTRE_TENTATIVAS_MS`.
//     Não é enfeite — sem ele, duas rodadas seguidas do cron gastariam cota
//     repetindo a mesma falha permanente em segundos.
//   • E o RECADO ENVELHECE JUNTO: toda tentativa reescreve o `erro` com a data.
//     Um recado ao lado do arquivo passa a ser sempre o da última tentativa, e
//     nunca mais o de uma versão do sistema que já não existe.

/** Quantos arquivos falhados uma rodada tenta. O despertador volta. */
export const TETO_POR_RODADA = 20;

/** O prazo entre duas tentativas do MESMO arquivo. Uma hora: curto o bastante
 *  para o cliente não esperar um dia, longo o bastante para uma falha
 *  permanente não queimar cota do Google em laço. */
export const INTERVALO_ENTRE_TENTATIVAS_MS = 60 * 60_000;

export interface Reimportacao {
  /** Quantos passaram a existir no disco nesta rodada. */
  recuperados: number;
  /** Quantos continuam falhando, com o motivo ATUAL — nunca o antigo. */
  aindaFalhando: Array<{ nome: string; erro: string }>;
  /** Quantos ficaram para a próxima rodada por causa do prazo ou do teto. */
  adiados: number;
}

/**
 * Tenta de novo o material que o cliente JÁ DECLAROU e que não chegou ao disco.
 *
 * Não depende de o cliente clicar em nada — é esse o ponto. E não apaga o `erro`
 * antes de tentar: apagar primeiro deixaria o arquivo sem explicação nenhuma na
 * tela durante a janela da tentativa, que é pior que uma explicação velha.
 */
export async function reimportarFalhados(
  clientId: string,
  agora: Date = new Date(),
): Promise<Reimportacao> {
  const saida: Reimportacao = { recuperados: 0, aindaFalhando: [], adiados: 0 };

  const candidatos = await prisma.driveMaterial.findMany({
    where: {
      clientId,
      mediaAssetId: null,
      papelConfirmadoEm: { not: null },
    },
    orderBy: { updatedAt: "asc" },
    take: TETO_POR_RODADA,
  }).catch(() => []);

  for (const m of candidatos) {
    // O PRAZO. `updatedAt` é reescrito por toda tentativa (o `update` do erro),
    // então ele é a data da última — não a da escolha.
    const desdeUltima = agora.getTime() - new Date(m.updatedAt).getTime();
    if (m.erro && desdeUltima < INTERVALO_ENTRE_TENTATIVAS_MS) {
      saida.adiados++;
      continue;
    }

    const r = await importarMaterialDoDrive(m.id);
    if (r.ok) {
      saida.recuperados++;
      continue;
    }

    const motivo = r.erro ?? "não consegui buscar este arquivo";
    saida.aindaFalhando.push({ nome: m.nome, erro: motivo });
    // O recado envelhece junto com a tentativa. `importarMaterialDoDrive` já
    // grava o motivo; o que se acrescenta aqui é a DATA, para que ninguém volte
    // a ler no portal uma frase de uma versão do sistema que não existe mais.
    await prisma.driveMaterial.update({
      where: { id: m.id },
      data: { erro: `${motivo} (última tentativa: ${agora.toLocaleDateString("pt-BR")})`.slice(0, 300) },
    }).catch(() => { /* best-effort: a tentativa é o que importa */ });
  }

  return saida;
}

// ─── O ENVIO DIRETO — O MEIO DA PONTE, FECHADO EM 08/08/2026 ────────────────

export interface RegistroDeEnvioDireto {
  ok: boolean;
  driveMaterialId?: string;
  papel?: Papel;
  /** Em português. Vai para a tela de quem enviou. */
  erro?: string;
}

/**
 * O arquivo que o cliente arrastou no portal (ou que o operador subiu pelo
 * admin) vira MATERIAL DE MARCA — visível para a peça.
 *
 * ── POR QUE ISTO PRECISA EXISTIR ──────────────────────────────────────────
 *
 * `POST /api/media` já guardava o `MediaAsset`, fechava o `MaterialRequest` e
 * destravava a esteira. O que ele NUNCA fez foi criar a linha de material — e
 * `materiaisDeMarca` só lê material. Os bytes atravessavam; a declaração de
 * PAPEL, não. Resultado: o logo chegava ao disco e a peça continuava saindo com
 * o nome do cliente escrito em fonte comum.
 *
 * ── SEM PAPEL, NÃO ENTRA. E ISSO NÃO É UM BUG ─────────────────────────────
 *
 * Papel ausente devolve `ok: false` e NÃO grava linha nenhuma. A casa não
 * adivinha se "IMG_2831.jpg" é o produto, a fachada ou o cachorro do dono —
 * peça com a foto errada é pior que peça sem foto, porque parece que alguém
 * olhou e escolheu aquilo. Ausência de informação não é informação.
 *
 * O arquivo NÃO se perde nesse caso: o `MediaAsset` continua guardado e o
 * pedido de material continua fechado. O que não acontece é ele entrar numa
 * peça sem alguém ter dito o que ele é.
 *
 * ── NÃO DEPENDE DO GOOGLE PARA NADA ───────────────────────────────────────
 *
 * `origem: "envio_direto"` e `connectionId: null`. Nenhuma leitura de
 * `GoogleDriveConnection` acontece aqui, nem na hora de usar o material. É o
 * ponto inteiro da mudança.
 *
 * Idempotente por `@@unique([clientId, mediaAssetId])`: reenviar o mesmo
 * arquivo atualiza a linha em vez de duplicar o material da peça.
 */
export async function registrarMaterialEnviado(entrada: {
  workspaceId: string;
  clientId: string | null | undefined;
  mediaAssetId: string;
  fileName: string;
  mimeType: string;
  tamanhoBytes?: number;
  /** O papel DECLARADO por quem enviou. Sem ele não há material. */
  papel: unknown;
}): Promise<RegistroDeEnvioDireto> {
  // Material é sempre DE UM CLIENTE. Arquivo sem dono não tem em que peça
  // entrar, e adivinhar o dono é como o arquivo de um cliente aparece no
  // portal de outro.
  if (!entrada.clientId) {
    return { ok: false, erro: "arquivo sem cliente dono — não vira material de marca" };
  }

  const papel = papelValido(entrada.papel);
  if (!papel) {
    return {
      ok: false,
      erro: "não sabemos o que é este arquivo — quem enviou precisa dizer se é logo, foto de produto, foto do local, prova ou referência",
    };
  }

  const agora = new Date();
  try {
    const linha = await prisma.driveMaterial.upsert({
      where: { clientId_mediaAssetId: { clientId: entrada.clientId, mediaAssetId: entrada.mediaAssetId } },
      create: {
        workspaceId: entrada.workspaceId,
        clientId: entrada.clientId,
        origem: "envio_direto",
        // NULO de propósito: não existe conexão com o Google neste caminho, e
        // inventar uma (ou codificar "envio_direto" dentro deste campo como
        // texto) esconderia o modelo dentro de uma string.
        connectionId: null,
        // Na origem "envio_direto" o identificador estável do arquivo é o
        // próprio `MediaAsset` — é dele que os bytes vêm.
        fileId: entrada.mediaAssetId,
        nome: entrada.fileName,
        mimeType: entrada.mimeType,
        tamanhoBytes: entrada.tamanhoBytes ?? 0,
        ehPasta: false,
        papel,
        // Quem envia declarando o papel ESTÁ confirmando. Não há segunda tela
        // de confirmação neste caminho (diferente do Picker, onde o cliente
        // escolhe primeiro e diz o que é depois).
        papelConfirmadoEm: agora,
        mediaAssetId: entrada.mediaAssetId,
        // Já está no disco da casa: não há o que importar depois.
        importadoEm: agora,
        erro: null,
      },
      update: { papel, papelConfirmadoEm: agora, nome: entrada.fileName, mimeType: entrada.mimeType, erro: null },
    });
    return { ok: true, driveMaterialId: linha.id, papel };
  } catch (e) {
    console.error("[material] envio direto não virou material de marca", e);
    return { ok: false, erro: "não consegui registrar este arquivo como material de marca" };
  }
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
      // ── 08/08/2026: SEM ESTA LINHA A MUDANÇA INTEIRA NÃO VALE NADA ────────
      // Omitir `origem` aqui faria a trava tratar todo material como se fosse
      // do Drive, e o arquivo que o cliente arrastou no portal seria recusado
      // por falta de uma conexão com o Google que ele nunca precisou ter.
      origem: l.origem,
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
