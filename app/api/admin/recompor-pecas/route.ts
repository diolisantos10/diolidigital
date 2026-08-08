// POST /api/admin/recompor-pecas — A CAMADA DE MARCA NAS PEÇAS QUE NASCERAM SEM ELA.
//
// ── POR QUE ESTA ROTA EXISTE (08/08/2026) ───────────────────────────────────
//
// Enquanto o `playwright` chegava quebrado ao contêiner, as peças foram
// gravadas como a FOTO CRUA da IA — sem título, sem a cor da marca, sem selo e
// sem assinatura — e com `mediaUrl` preenchido. É esse `mediaUrl` que as torna
// invisíveis para o conserto automático: `produzirArtesPendentes` só olha
// `mediaUrl: null`, então elas NUNCA voltariam à fila do despertador. Ficariam
// no banco para sempre, com aparência de entregue e conteúdo de rascunho.
//
// ── POR QUE UMA ROTA, E NÃO O DESPERTADOR ───────────────────────────────────
//
// Isto é conserto de um estrago datado, não rotina. Rotina que reescreve arte
// de peça já gravada é uma máquina apontada para o trabalho entregue ao
// cliente, rodando a cada 5 minutos sem ninguém olhando. A passada é à mão,
// tem teto por chamada e é idempotente: peça já recomposta perde a marca no
// `lastError` e não é vista de novo.
//
// ── AUTENTICAÇÃO E VERBO ────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, tempo constante. **Segredo ausente do
// ambiente → 503**, nunca aberta. **POST**, não GET: GET é o verbo que proxy,
// pré-carregador e histórico tratam como inofensivo, e isto escreve.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não gera imagem nenhuma, e portanto não custa.** A foto paga já está no
//     armazenamento como `fundo-<postId>.png`. Recompor é rasterização local.
//   • **Não publica nada.** Nenhuma chamada a Meta, Google ou TikTok — a trava
//     de plataforma de 03/08 continua inteira. O calendário não é tocado.
//   • **Não afrouxa trava.** Pilar bloqueado continua bloqueado; o título
//     continua tendo de ser trecho literal da legenda já auditada.

import { NextRequest, NextResponse } from "next/server";
import { recomporPecasSemMolde } from "@/lib/agency/execution/artes";
import { segredoConfere } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Teto duro por chamada. Uma passada que reescreve 200 artes de uma vez é o
 *  problema se disfarçando de conserto. */
const TETO = 20;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
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

  const pedido = Number(request.nextUrl.searchParams.get("limite"));
  const limite = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, TETO) : TETO;

  const r = await recomporPecasSemMolde(limite);
  return NextResponse.json({
    // Conclusão primeiro: quantas peças passaram a ter a marca do cliente.
    quantasRecompostas: r.recompostas.length,
    ...r,
    em: new Date().toISOString(),
  });
}
