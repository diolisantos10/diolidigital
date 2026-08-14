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
import { recomporPecas, type SelecaoDeRecomposicao } from "@/lib/agency/execution/artes";
import { recomporCarrosseis } from "@/lib/agency/execution/recompor-carrossel";
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

  // `?modo=marca-nova` alcança a peça que foi composta CERTA, só que ANTES de o
  // material de marca do cliente existir. Ela não tem defeito registrado em
  // `lastError`, então o modo antigo nunca a encontraria. Isso apareceu em
  // 09/08: a porta de upload recusava SVG, os logos do CityJobs só entraram
  // depois que ela abriu, e tudo o que foi produzido antes ficou sem marca.
  //
  // O padrão continua `sem-molde`: quem já chamava esta rota continua tendo
  // exatamente o comportamento que conhecia.
  // `?modo=formato-recusado` alcança a peça composta pelo rasterizador ANTIGO,
  // que gravava PNG. Ela não tem defeito em `lastError` e não é mais velha que
  // o logo do cliente — os dois modos acima passam ao lado dela. Quem a denuncia
  // é o `mimeType` do arquivo, medido pela mesma régua da publicação. Medido em
  // produção em 14/08: 6 posts do CityJobs agendados, os 6 barrados no portão de
  // formato, com o rasterizador de hoje já saindo JPEG há uma semana.
  const bruto = request.nextUrl.searchParams.get("modo");
  const modo =
    bruto === "marca-nova" || bruto === "carrossel" || bruto === "formato-recusado"
      ? bruto
      : "sem-molde";

  // `?modo=carrossel` redesenha as TELAS de um carrossel. O modo normal compõe
  // uma arte por peça, e num carrossel o que vai ao ar são as N telas — recompor
  // por lá escrevia capa nova e deixava as telas quebradas.
  const r = modo === "carrossel" ? await recomporCarrosseis(limite) : await recomporPecas(limite, modo as SelecaoDeRecomposicao);
  return NextResponse.json({
    // Conclusão primeiro: quantas peças passaram a ter a marca do cliente.
    quantasRecompostas: r.recompostas.length,
    modo,
    ...r,
    em: new Date().toISOString(),
  });
}
