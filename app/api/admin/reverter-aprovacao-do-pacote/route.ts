// POST /api/admin/reverter-aprovacao-do-pacote — DESFAZER O CLIQUE DE APROVAR.
//
// ── POR QUE ELA EXISTE (15/08/2026) ─────────────────────────────────────────
//
// O CEO abriu o portal da CityJobs procurando os criativos, apertou "Aprovar as
// entregas prontas" e pediu para cancelar. Não havia caminho para cancelar: o
// marco só andava para frente. Esta rota é o caminho de volta.
//
// ── LEITURA PURA POR PADRÃO ─────────────────────────────────────────────────
//
// Sem `?aplicar=1` ela **mostra e não grava**: lista, projeto por projeto e card
// por card, exatamente o que mudaria — e também o que ela se RECUSA a tocar, com
// o motivo. Um "desfazer" que só diz quantas linhas mudou seria o mesmo tipo de
// botão que criou o problema. Mesmo padrão de `?criar=1` em
// `/api/admin/cards-de-aprovacao` e de `?emitir=1` em `/api/admin/links-do-portal`.
//
// ── AUTENTICAÇÃO E VERBO ────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, comparação em tempo constante.
// **Segredo ausente do ambiente → 503, porta FECHADA.** POST, não GET: GET é o
// verbo que proxy, pré-carregador e histórico tratam como inofensivo, e isto
// desfaz a decisão registrada de um cliente.
//
// ── O CORPO NUNCA VAI PARA O LOG ────────────────────────────────────────────
//
// A resposta traz id de projeto, id de card e nome de cliente. O workflow que a
// chama imprime status, PLACAR e VEREDITO — nunca o corpo. Log de CI fica 90
// dias e é copiado para issue sem pensar.
//
// ── PARÂMETROS ──────────────────────────────────────────────────────────────
//
//   • `cliente`  (obrigatório) — o nome. Um por chamada; nome ambíguo RECUSA em
//     vez de escolher, porque desfazer a aprovação do cliente errado apaga a
//     decisão de quem não pediu nada.
//   • `autor`    (obrigatório) — quem está desfazendo. Reversão sem autor tem o
//     mesmo defeito da aprovação sem autor.
//   • `motivo`   (obrigatório) — por quê. Vai para o `ActivityEvent`.
//   • `janela`   — minutos para trás. Padrão 240, teto 7 dias.
//   • `aplicar=1`— grava. Qualquer outra coisa é leitura pura.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não publica.** Nenhuma chamada a Meta, Google ou TikTok.
//   • **Não toca aprovação `client:<nome>`** — a decisão de verdade do cliente —
//     nem carimbo `equipe:<email>`. Só a grafia seca `"cliente"`, e só no mesmo
//     instante do carimbo do projeto.
//   • **Não mexe em peça.** Nenhum `SocialPost` muda de status aqui.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { reverterAprovacaoDoPacote } from "@/lib/agency/esteira/reverter-aprovacao-do-pacote";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Porta FECHADA. Sem segredo no ambiente não há como distinguir quem aperta
    // o botão de qualquer pessoa na internet — e isto desfaz decisão registrada.
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
          "Informe ?cliente=<nome>. Esta rota desfaz a aprovação de UM cliente por chamada, de propósito: " +
          "uma passada que reverte a casa inteira apaga a decisão de quem não pediu nada.",
      },
      { status: 400 },
    );
  }

  const autor = (params.get("autor") ?? "").trim();
  const motivo = (params.get("motivo") ?? "").trim();

  // Aplicar é ação EXPLÍCITA. Qualquer coisa diferente de "1"/"true" é não.
  const pedidoDeAplicar = (params.get("aplicar") ?? "").toLowerCase();
  const aplicar = pedidoDeAplicar === "1" || pedidoDeAplicar === "true";

  const janelaCrua = Number.parseInt(params.get("janela") ?? "", 10);
  const janelaMinutos = Number.isFinite(janelaCrua) ? janelaCrua : undefined;

  const relatorio = await reverterAprovacaoDoPacote({
    cliente, autor, motivo, aplicar,
    ...(janelaMinutos !== undefined ? { janelaMinutos } : {}),
  }).catch((e) => ({ erro: e instanceof Error ? e.message : "falha ao ler o banco" }));

  if ("erro" in relatorio) {
    // Banco fora do ar NÃO vira "nada a reverter": isso leria como afirmação, e
    // ausência de informação não é informação (guardrail 1).
    return NextResponse.json({ error: relatorio.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...relatorio,
    aviso: aplicar
      ? "REVERSÃO APLICADA. Os cards voltaram a PENDENTE, sem autor e sem data, e o projeto voltou a " +
        "esperar a decisão do cliente. A reversão ficou registrada em ActivityEvent, com autor e motivo. " +
        "Nada foi publicado e nenhuma peça mudou de status."
      : "Leitura pura: nada foi gravado. Confira a lista item por item e use ?aplicar=1 para desfazer.",
  });
}
