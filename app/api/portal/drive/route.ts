// /api/portal/drive — o cartão "Google Drive" do portal do cliente.
//
//   GET   → estado da conexão + os arquivos escolhidos + o que falta declarar
//   POST  → o cliente escolheu arquivos no seletor do Google (grava a escolha)
//   PATCH → o cliente disse O QUE É um arquivo (e aí a casa importa)
//
// Sem sessão de agência: a única credencial é o token do portal, e o dono é
// DERIVADO dele. Nenhum clientId de query ou corpo é olhado em lugar nenhum
// deste arquivo.
//
// ── POR QUE O ESTADO NUNCA DIZ "CONECTADO ✓" SOZINHO ────────────────────────
//
// Conectar não é autorizar. O cliente pode ter conectado e não escolhido nada,
// ou escolhido e não dito o que é. Nos dois casos a casa NÃO tem material — e a
// tela precisa dizer "falta escolher", não "pronto". Tela que diz pronto
// enquanto falta coisa é o que produz peça sem foto do produto.
//
// O retrato vem de `retratoDaEscolha`, o mesmo mecanismo que a esteira usa para
// decidir. Um só, para os dois — dois divergem.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { metadadosDoArquivo, MIME_DE_PASTA } from "@/lib/integrations/google/drive";
import { importarPendentesDoCliente } from "@/lib/agency/esteira/material-do-drive";
import {
  PAPEIS,
  PAPEIS_VALIDOS,
  papelValido,
  retratoDaEscolha,
  sugerirPapel,
  type ConexaoParaDecidir,
} from "@/lib/integrations/google/escolha-de-material";

export const dynamic = "force-dynamic";

/** Teto por chamada. O cliente escolhe no seletor, não em lote de máquina —
 *  e ritmo de máquina no Google é assinatura de abuso (cartilha, item ritmo). */
const MAX_POR_ESCOLHA = 25;

async function donoDoPedido(req: NextRequest) {
  const token = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!token) return null;
  return resolvePortalClient(token);
}

function paraDecidir(c: {
  status: string; escopos: string; tokenExpiresAt: Date | null; refreshTokenEncrypted: string | null;
} | null): ConexaoParaDecidir | null {
  return c ? { status: c.status, escopos: c.escopos, tokenExpiresAt: c.tokenExpiresAt, temRefresh: !!c.refreshTokenEncrypted } : null;
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const dono = await donoDoPedido(req);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  // ── "NÃO ACHEI" É DIFERENTE DE "NÃO CONSEGUI OLHAR" ───────────────────────
  //
  // Isto era `.catch(() => null)`, e o null virava `conectado: false` — ou seja,
  // uma falha de LEITURA saía na tela como o fato "você não conectou". Em
  // 07/08/2026 foi metade do que o CEO viu: as tabelas do Drive não existiam em
  // produção, toda consulta lançava, e o cartão dizia com todas as letras
  // "Drive não conectado." para um cliente que tinha acabado de conectar.
  //
  // Ausência de informação não é informação. Agora a falha é NOMEADA e sobe
  // para a tela como indisponibilidade — que é o que ela é.
  let leituraFalhou = false;
  const conexao = await prisma.googleDriveConnection.findUnique({
    where: { workspaceId_clientId: { workspaceId: dono.workspaceId, clientId: dono.clientId } },
  }).catch((e) => {
    console.error("[portal/drive] não consegui ler a conexão:", e instanceof Error ? e.message : e);
    leituraFalhou = true;
    return null;
  });

  const materiais = await prisma.driveMaterial.findMany({
    where: { clientId: dono.clientId },
    orderBy: { escolhidoEm: "desc" },
    take: 100,
  }).catch((e) => {
    console.error("[portal/drive] não consegui ler os materiais:", e instanceof Error ? e.message : e);
    leituraFalhou = true;
    return [];
  });

  if (leituraFalhou) {
    // 503, e não um 200 com `conectado: false`: o cliente não pode receber uma
    // afirmação sobre o estado dele que a casa não conseguiu conferir.
    return NextResponse.json({
      error: "Não consegui consultar seu Google Drive agora. Avise a equipe — não é problema da sua conta.",
      indisponivel: true,
    }, { status: 503 });
  }

  const retrato = retratoDaEscolha(
    paraDecidir(conexao),
    materiais.map((m) => ({
      fileId: m.fileId, nome: m.nome, ehPasta: m.ehPasta,
      papel: m.papel, papelConfirmadoEm: m.papelConfirmadoEm,
    })),
  );

  // O seletor do Google roda no navegador e precisa de chave de API e do número
  // do projeto. Faltando qualquer um, a tela diz que a escolha está indisponível
  // — em vez de mostrar um botão que abre uma janela em branco.
  const apiKey = process.env.GOOGLE_PICKER_API_KEY?.trim() ?? "";
  const appId = process.env.GOOGLE_PROJECT_NUMBER?.trim() ?? "";

  return NextResponse.json({
    conectado: !!conexao && conexao.status !== "revoked",
    status: conexao?.status ?? "sem_conexao",
    conta: conexao?.contaHint ?? "",
    // Nenhum token sai aqui. O token do seletor tem rota própria e é o token do
    // PRÓPRIO cliente, para o Drive dele — ver /api/portal/drive/token-do-seletor.
    retrato,
    papeis: PAPEIS_VALIDOS.map((p) => ({ valor: p, rotulo: PAPEIS[p].rotulo, ajuda: PAPEIS[p].ajuda })),
    seletor: { disponivel: !!apiKey && !!appId, apiKey, appId },
    materiais: materiais.map((m) => ({
      id: m.id,
      nome: m.nome,
      mimeType: m.mimeType,
      ehPasta: m.ehPasta,
      papel: m.papel,
      papelSugerido: m.papelSugerido,
      declarado: !!m.papelConfirmadoEm,
      importado: !!m.mediaAssetId,
      erro: m.erro,
    })),
  });
}

// ─── POST: o cliente escolheu no seletor ────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const dono = await donoDoPedido(req);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const conexao = await prisma.googleDriveConnection.findUnique({
    where: { workspaceId_clientId: { workspaceId: dono.workspaceId, clientId: dono.clientId } },
  }).catch(() => null);
  if (!conexao || conexao.status === "revoked") {
    return NextResponse.json({ error: "Conecte seu Google Drive antes de escolher arquivos." }, { status: 409 });
  }
  if (conexao.status === "expired") {
    return NextResponse.json({ error: "O acesso ao seu Drive expirou. Reconecte para escolher arquivos." }, { status: 409 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { escolhas?: Array<{ fileId?: string; nome?: string; mimeType?: string }> };
  const escolhas = (corpo.escolhas ?? []).filter((e) => typeof e?.fileId === "string" && e.fileId.length > 0).slice(0, MAX_POR_ESCOLHA);
  if (escolhas.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo veio na escolha." }, { status: 400 });
  }

  const gravados: Array<{ id: string; nome: string; papelSugerido: string | null; ehPasta: boolean }> = [];
  const recusados: Array<{ nome: string; motivo: string }> = [];

  for (const e of escolhas) {
    // O navegador é do cliente: o que ele manda é pista, não fato. Confirmamos
    // nome e tipo com o Google — e a confirmação também PROVA que o app tem
    // acesso, que é o ponto do escopo por arquivo.
    const meta = await metadadosDoArquivo(conexao.id, e.fileId!);
    if (!meta.ok || !meta.dados) {
      recusados.push({ nome: e.nome ?? e.fileId!, motivo: meta.erro ?? "não consegui confirmar este arquivo com o Google" });
      continue;
    }

    const ehPasta = meta.dados.ehPasta || meta.dados.mimeType === MIME_DE_PASTA;
    const sugerido = ehPasta ? null : sugerirPapel(meta.dados.nome, meta.dados.mimeType);

    const linha = await prisma.driveMaterial.upsert({
      where: { connectionId_fileId: { connectionId: conexao.id, fileId: meta.dados.fileId } },
      update: { nome: meta.dados.nome, mimeType: meta.dados.mimeType, tamanhoBytes: meta.dados.tamanhoBytes, ehPasta, erro: null },
      create: {
        workspaceId: dono.workspaceId,
        clientId: dono.clientId,
        connectionId: conexao.id,
        fileId: meta.dados.fileId,
        nome: meta.dados.nome,
        mimeType: meta.dados.mimeType,
        tamanhoBytes: meta.dados.tamanhoBytes,
        ehPasta,
        papelSugerido: sugerido,
        // `papel` e `papelConfirmadoEm` ficam NULOS de propósito: a sugestão
        // não declara nada. Quem declara é o cliente, no PATCH.
      },
    }).catch(() => null);

    if (linha) gravados.push({ id: linha.id, nome: linha.nome, papelSugerido: linha.papelSugerido, ehPasta: linha.ehPasta });
    else recusados.push({ nome: meta.dados.nome, motivo: "não consegui guardar a escolha" });
  }

  return NextResponse.json({
    gravados,
    recusados,
    // A frase que a tela mostra: escolher NÃO é declarar.
    proximoPasso: gravados.some((g) => !g.ehPasta)
      ? "Agora diga o que é cada arquivo — sem isso a equipe não usa nenhum deles."
      : "Você escolheu apenas pastas. Abra a pasta no seletor e escolha os arquivos de dentro.",
  });
}

// ─── PATCH: o cliente disse o que é ─────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const dono = await donoDoPedido(req);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const corpo = (await req.json().catch(() => ({}))) as { id?: string; papel?: string };
  const papel = papelValido(corpo.papel);
  if (!corpo.id || !papel) {
    return NextResponse.json({ error: "Escolha o que este arquivo é." }, { status: 400 });
  }

  // Escopo do dono no próprio `where`: nunca buscar e comparar depois.
  const alvo = await prisma.driveMaterial.findFirst({
    where: { id: corpo.id, clientId: dono.clientId, workspaceId: dono.workspaceId },
  }).catch(() => null);
  if (!alvo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  if (alvo.ehPasta) {
    return NextResponse.json({
      error: "Isto é uma pasta. Abra a pasta no seletor do Google e escolha os arquivos de dentro dela.",
    }, { status: 409 });
  }

  await prisma.driveMaterial.update({
    where: { id: alvo.id },
    data: { papel, papelConfirmadoEm: new Date(), erro: null },
  });

  // Declarou → a casa busca. E o pedido de material que estava aberto fecha
  // sozinho lá dentro, pelo mesmo caminho do upload manual.
  const lote = await importarPendentesDoCliente(dono.clientId).catch(() => null);

  return NextResponse.json({
    ok: true,
    importados: lote?.importados ?? 0,
    aguardandoCliente: lote?.aguardandoCliente ?? 0,
    falhas: lote?.falhas ?? [],
  });
}

// ─── DELETE: o cliente tirou um arquivo do alcance da agência ───────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const dono = await donoDoPedido(req);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const alvo = await prisma.driveMaterial.findFirst({
    where: { id, clientId: dono.clientId, workspaceId: dono.workspaceId },
  }).catch(() => null);
  if (!alvo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  // A escolha some — mas a cópia já importada NÃO é apagada aqui, e a tela diz
  // isso. Apagar em silêncio um arquivo que já foi para uma peça entregue seria
  // quebrar entregável sem avisar ninguém.
  await prisma.driveMaterial.delete({ where: { id: alvo.id } }).catch(() => null);

  return NextResponse.json({
    ok: true,
    aviso: alvo.mediaAssetId
      ? "Tiramos este arquivo da lista. A cópia que já foi usada em peças continua guardada — peça à equipe se quiser removê-la."
      : "Tiramos este arquivo da lista.",
  });
}
