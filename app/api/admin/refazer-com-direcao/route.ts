// POST /api/admin/refazer-com-direcao — AS PEÇAS QUE JÁ EXISTEM, REFEITAS COM A
// DIREÇÃO DE ARTE QUE SEMPRE FOI ESCRITA PARA ELAS.
//
// ── POR QUE ESTA ROTA EXISTE (15/08/2026) ───────────────────────────────────
//
// A esteira foi consertada — direção de arte no prompt, composição vinda do
// cérebro da marca, portão de pixel no fundo cru — e **não tem o que mostrar**:
// as peças do cliente foram produzidas ANTES, e já têm `mediaUrl`. A rodada de
// arte procura `mediaUrl: null` e mede "0 peça(s) esperando arte", o que é
// verdade e não é a pergunta. A pergunta é a peça PRONTA PELO CAMINHO ERRADO.
//
// ── A CONTA VEM ANTES DA GRAVAÇÃO ───────────────────────────────────────────
//
// Sem `?aplicar=1` ela **mostra e não gasta**: quantas peças são elegíveis,
// quantas foram barradas e por quê, em quantas a direção estava mesmo no
// entregável, quantas imagens este lote pede e quanto custa pela tabela
// pública. Mesmo padrão de `/api/admin/produzir-pecas`.
//
// O custo é **estimativa de tabela**, e a resposta diz isso onde o número
// aparece. Esta casa não lê o faturamento do provedor.
//
// ── AUTENTICAÇÃO E VERBO ────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, comparação em tempo constante.
// **Segredo ausente do ambiente → 503, porta FECHADA.** POST, não GET: GET é o
// verbo que proxy, pré-carregador e histórico tratam como inofensivo, e isto
// gasta dinheiro.
//
// ── O CORPO NUNCA VAI PARA O LOG ────────────────────────────────────────────
//
// A resposta traz nome de cliente, trecho de legenda e trecho da direção de
// arte. O workflow que a chama imprime placar e motivos — nunca o corpo. Log de
// CI fica 90 dias e é copiado para issue sem pensar.
//
// ── O LOTE É SOBRE TEMPO ────────────────────────────────────────────────────
//
// A passada anterior pediu 10 peças de uma vez, estourou o tempo da requisição,
// e o Actions leu como FALHA depois de o trabalho ter sido feito — falso
// negativo que quase fez a casa pagar duas vezes. O teto por chamada é pequeno
// de propósito (`LOTE_PADRAO`), o placar diz quantas faltam, e a seleção é
// idempotente pelo DADO (a data do fundo), então apertar de novo continua de
// onde parou sem repagar o que já saiu.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não publica.** Nenhuma chamada a Meta, Google ou TikTok, e o
//     interruptor global de publicação orgânica não é lido — há teste de fonte
//     que reprova até a MENÇÃO do nome dele aqui.
//   • **Não mexe na data, no status nem na legenda.** A peça é a mesma; muda o
//     pixel. A única escrita fora da arte é `artDirection`.
//   • **Não refaz peça aprovada pelo cliente.** A aprovação fica presa ao post
//     e não ao arquivo — barrada, com motivo.
//   • **Não inventa direção de arte.** Peça sem Visual/Direção no entregável de
//     origem é barrada, não completada com a legenda.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import {
  refazerComDirecao, LOTE_PADRAO, LOTE_MAXIMO,
} from "@/lib/agency/execution/refazer-com-direcao";

export const dynamic = "force-dynamic";
// Cada peça é uma imagem paga com timeout de 90s no gerador. O lote é pequeno
// para caber aqui com folga — este número é o teto do servidor, não a meta.
export const maxDuration = 600;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Porta FECHADA. Sem segredo no ambiente não há como distinguir quem aperta
    // o botão de qualquer pessoa na internet — e isto gasta dinheiro.
    return NextResponse.json(
      { error: "Rota administrativa não configurada — defina CRON_SECRET" },
      { status: 503 },
    );
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const cliente = (params.get("cliente") ?? "").trim();
  if (!cliente) {
    return NextResponse.json(
      {
        error:
          "Informe ?cliente=<nome>. Esta rota refaz para UM cliente por chamada, de propósito: " +
          "uma passada sem recorte gastaria imagem paga de quem ninguém autorizou.",
      },
      { status: 400 },
    );
  }

  const pedidoDeAplicar = (params.get("aplicar") ?? "").toLowerCase();
  const aplicar = pedidoDeAplicar === "1" || pedidoDeAplicar === "true";

  const loteCru = Number.parseInt(params.get("lote") ?? "", 10);
  const lote = Number.isFinite(loteCru) ? loteCru : LOTE_PADRAO;

  const relatorio = await refazerComDirecao({
    cliente,
    autor: (params.get("autor") ?? "").trim(),
    motivo: (params.get("motivo") ?? "").trim(),
    lote,
    aplicar,
  }).catch((e) => ({ erro: e instanceof Error ? e.message : "falha ao ler o banco" }));

  if ("erro" in relatorio) {
    // Banco fora do ar NÃO vira "nada a refazer": isso leria como afirmação, e
    // ausência de informação não é informação (guardrail 1).
    return NextResponse.json({ error: relatorio.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...relatorio,
    limites: { lotePadrao: LOTE_PADRAO, loteMaximo: LOTE_MAXIMO },
    aviso: aplicar
      ? "REFAZIMENTO APLICADO. Só o pixel mudou: data marcada, status e legenda ficaram como estavam, " +
        "e nada foi publicado. Peça com aprovação do cliente NÃO foi tocada. " +
        "Se faltarem peças, aperte de novo — a seleção olha a data do fundo e não paga duas vezes pela mesma."
      : "Leitura pura: nada foi gravado e nenhuma imagem foi paga. Confira quantas peças têm direção de arte " +
        "no entregável, quantas foram barradas e o custo estimado antes de usar ?aplicar=1.",
  });
}
