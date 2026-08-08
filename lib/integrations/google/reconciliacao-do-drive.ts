// reconciliacao-do-drive.ts — TRAZER PARA DENTRO O QUE O GOOGLE JÁ CONCEDEU.
//
// ── POR QUE ISTO EXISTE (08/08/2026) ────────────────────────────────────────
//
// O diagnóstico de conexões já sabia DETECTAR o furo: ele põe lado a lado
// "quantos arquivos o Google diz que o app alcança" e "quantas linhas a casa
// tem", e levanta `escolhaPerdida` quando o primeiro é maior. Na Foocci o
// número foi **1 no Google, 0 na casa** — o CEO escolheu o material no seletor,
// o Google concedeu o acesso, e a escolha morreu no caminho.
//
// Detectar não conserta. Este arquivo é a outra metade: para cada arquivo que o
// app alcança e a casa não guardou, ele cria a linha que faltava.
//
// ── O QUE ELE NÃO FAZ, E É O PONTO ──────────────────────────────────────────
//
// **Não inventa o papel do arquivo.** A linha nasce com `papel` e
// `papelConfirmadoEm` NULOS — pendente de triagem. Um PNG chamado
// "ChatGPT Image ....png" não vira logo porque seria conveniente: quem declara
// o que um arquivo é continua sendo o cliente, no portal. Carimbar "logo" aqui
// poria a imagem errada dentro de uma peça entregue, que é o defeito pior.
//
// `papelSugerido` é preenchido pelo mesmo `sugerirPapel` do caminho normal —
// palpite para a tela já vir marcada, e nada além disso. Ele não autoriza uso.
//
// SÓ LEITURA no Google. Nada é escrito no Drive de ninguém.

import { prisma } from "@/lib/db/client";
import { exercitarDrive } from "./verificacao-do-drive";
import { MIME_DE_PASTA } from "./drive";
import { sugerirPapel } from "./escolha-de-material";

export interface ReconciliacaoDoDrive {
  connectionId: string;
  clientId: string;
  /** Quantos arquivos o Google diz que o app alcança. `null` = não contei. */
  alcancadosNoGoogle: number | null;
  /** Quantos já existiam no banco. */
  jaTinha: number;
  /** As linhas criadas agora, todas pendentes de triagem. */
  trazidos: Array<{ fileId: string; nome: string; papelSugerido: string | null }>;
  /** O que não deu para trazer, com o motivo. Nunca vazio por engano. */
  falhas: Array<{ fileId: string; nome: string; motivo: string }>;
  /** Quando o Google não deixou nem olhar. */
  indisponivel: string | null;
}

/**
 * Reconcilia UMA conexão de Drive.
 *
 * Fail-loud: se não deu para listar no Google, devolve `indisponivel` com a
 * frase crua — nunca uma lista vazia, que leria como "não havia nada a trazer".
 * Ausência de informação não é informação.
 */
export async function reconciliarDrive(connectionId: string): Promise<ReconciliacaoDoDrive> {
  const conexao = await prisma.googleDriveConnection
    .findUnique({ where: { id: connectionId }, select: { id: true, workspaceId: true, clientId: true } })
    .catch(() => null);

  if (!conexao) {
    return {
      connectionId, clientId: "", alcancadosNoGoogle: null, jaTinha: 0,
      trazidos: [], falhas: [], indisponivel: "conexão de Drive não encontrada no banco",
    };
  }

  const base = { connectionId, clientId: conexao.clientId };

  const exame = await exercitarDrive(connectionId);
  if (!exame.ok || !exame.arquivos) {
    return {
      ...base, alcancadosNoGoogle: exame.alcancadosNoGoogle ?? null, jaTinha: 0,
      trazidos: [], falhas: [],
      indisponivel: exame.ok
        ? "o Google respondeu, mas não consegui listar os arquivos — nada foi afirmado sobre o material deste cliente"
        : (exame.mensagem ?? "o Google recusou a listagem"),
    };
  }

  const existentes = await prisma.driveMaterial
    .findMany({ where: { connectionId }, select: { fileId: true } })
    .catch(() => null);
  if (existentes === null) {
    return {
      ...base, alcancadosNoGoogle: exame.alcancadosNoGoogle ?? null, jaTinha: 0,
      trazidos: [], falhas: [],
      indisponivel: "não consegui ler o material já guardado — não trago nada sem saber o que já existe",
    };
  }

  const jaGuardados = new Set(existentes.map((m) => m.fileId));
  const trazidos: ReconciliacaoDoDrive["trazidos"] = [];
  const falhas: ReconciliacaoDoDrive["falhas"] = [];

  for (const a of exame.arquivos) {
    if (jaGuardados.has(a.id)) continue;

    const ehPasta = a.mimeType === MIME_DE_PASTA;
    const sugerido = ehPasta ? null : sugerirPapel(a.nome, a.mimeType);

    const linha = await prisma.driveMaterial
      .create({
        data: {
          workspaceId: conexao.workspaceId,
          clientId: conexao.clientId,
          connectionId,
          origem: "drive",
          fileId: a.id,
          nome: a.nome,
          mimeType: a.mimeType,
          tamanhoBytes: a.tamanhoBytes,
          ehPasta,
          papelSugerido: sugerido,
          // `papel` e `papelConfirmadoEm` NULOS: pendente de triagem, e a trava
          // de `materialAutorizado` continua recusando o arquivo até o cliente
          // dizer o que ele é. Trazer para dentro não é liberar para uso.
        },
      })
      .catch((e) => {
        console.error(`[reconciliacao-drive] não criei ${a.id} do cliente ${conexao.clientId}:`, e instanceof Error ? e.message : e);
        return null;
      });

    if (linha) trazidos.push({ fileId: a.id, nome: a.nome, papelSugerido: sugerido });
    else falhas.push({ fileId: a.id, nome: a.nome, motivo: "não consegui gravar a linha nesta casa" });
  }

  return {
    ...base,
    alcancadosNoGoogle: exame.alcancadosNoGoogle ?? null,
    jaTinha: jaGuardados.size,
    trazidos,
    falhas,
    indisponivel: null,
  };
}
