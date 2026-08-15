// POST /api/admin/produzir-pecas — MANDAR A ESTEIRA PRODUZIR, COM A CONTA NA FRENTE.
//
// ── POR QUE ELA EXISTE (15/08/2026) ─────────────────────────────────────────
//
// Ordem do CEO: *"produz as peças"*. Medido o caminho, **não havia porta**: a
// parte PAGA da produção (`produzirArtesPendentes`, o gerador de imagem) tinha
// zero chamadores fora do relógio interno — nenhuma rota, nenhum workflow,
// nenhum script. `/api/cron/execute`, que foi o botão apertado, chama só o motor
// de TEXTO, e só para projeto `running` travado ou `failed`. Quem apertou
// esperando criativo apertou um botão que não passa perto do gerador de imagem.
//
// ── A CONTA VEM ANTES DA GRAVAÇÃO ───────────────────────────────────────────
//
// Sem `?aplicar=1` ela **mostra e não gasta**: quantas peças esperam arte,
// quantas imagens elas pedem, quanto isso custa pela tabela pública, qual é o
// teto do dia e quanto dele já foi usado. Mesmo padrão de `?criar=1` em
// `/api/admin/cards-de-aprovacao` e de `?aplicar=1` em
// `/api/admin/reverter-aprovacao-do-pacote`.
//
// O custo é **estimativa de tabela**, e a resposta diz isso em todo lugar onde o
// número aparece. Esta casa não lê o faturamento do provedor.
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
// A resposta traz nome de cliente, nome de projeto e trecho de legenda das
// peças. O workflow que a chama imprime placar e veredito — nunca o corpo. Log
// de CI fica 90 dias e é copiado para issue sem pensar.
//
// ── PARÂMETROS ──────────────────────────────────────────────────────────────
//
//   • `cliente`  (obrigatório) — o nome. Um por chamada; nome ambíguo RECUSA em
//     vez de escolher, porque produzir para o cliente errado gasta o dinheiro
//     dele e mostra o trabalho de um a outro.
//   • `autor`    (obrigatório com `aplicar`) — quem mandou produzir.
//   • `motivo`   (obrigatório com `aplicar`) — por quê. Vai para o `ActivityEvent`.
//   • `teto`     — imagens nesta passada. Padrão 40, teto do teto 200. O teto
//     DIÁRIO por cliente (40, em `artes.ts`) continua valendo por baixo e é ele
//     quem tem a última palavra.
//   • `aplicar=1`— produz de verdade. Qualquer outra coisa é leitura pura.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não publica.** Nenhuma chamada a Meta, Google ou TikTok. A peça criada
//     nasce `draft` — data proposta, sem aval do cliente.
//   • **Não aprova nada.** Nenhum `ApprovalRequest` muda de status.
//   • **Não pula portão.** Sem aprovação de direção, o motor recusa e a resposta
//     diz que recusou. Escada, Qualidade e pilar bloqueado continuam mandando.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import {
  produzirAgora, TETO_PADRAO_DA_PASSADA, TETO_MAXIMO_DA_PASSADA,
} from "@/lib/agency/execution/produzir-agora";

export const dynamic = "force-dynamic";
// Produzir um lote de imagens é lento por natureza: cada uma é uma chamada de
// modelo com timeout de 90s. Sem isto, a passada morre no meio e o operador não
// sabe se pagou.
export const maxDuration = 800;

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
          "Informe ?cliente=<nome>. Esta rota produz para UM cliente por chamada, de propósito: " +
          "a rodada de arte da casa é global, e uma passada sem recorte gastaria imagem paga de quem ninguém autorizou.",
      },
      { status: 400 },
    );
  }

  const pedidoDeAplicar = (params.get("aplicar") ?? "").toLowerCase();
  const aplicar = pedidoDeAplicar === "1" || pedidoDeAplicar === "true";

  const tetoCru = Number.parseInt(params.get("teto") ?? "", 10);
  const teto = Number.isFinite(tetoCru) ? tetoCru : TETO_PADRAO_DA_PASSADA;

  const relatorio = await produzirAgora({
    cliente,
    autor: (params.get("autor") ?? "").trim(),
    motivo: (params.get("motivo") ?? "").trim(),
    teto,
    aplicar,
  }).catch((e) => ({ erro: e instanceof Error ? e.message : "falha ao ler o banco" }));

  if ("erro" in relatorio) {
    // Banco fora do ar NÃO vira "nada a produzir": isso leria como afirmação, e
    // ausência de informação não é informação (guardrail 1).
    return NextResponse.json({ error: relatorio.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...relatorio,
    limites: { tetoPadrao: TETO_PADRAO_DA_PASSADA, tetoMaximo: TETO_MAXIMO_DA_PASSADA },
    aviso: aplicar
      ? "PRODUÇÃO APLICADA. As peças criadas estão em RASCUNHO, com data proposta e sem aval do cliente. " +
        "Nada foi publicado, nenhuma plataforma foi chamada e nenhuma aprovação mudou de estado. " +
        "A passada ficou registrada em ActivityEvent, com autor, motivo e placar."
      : "Leitura pura: nada foi gravado e nenhuma imagem foi paga. Confira o número de imagens e o custo " +
        "estimado antes de usar ?aplicar=1.",
  });
}
