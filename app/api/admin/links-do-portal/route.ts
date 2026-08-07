// GET /api/admin/links-do-portal — os links de portal, de dentro da produção.
//
// ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
//
// `scripts/links-do-portal.mts` funciona e é a mesma regra — mas exige o banco
// de PRODUÇÃO, e ninguém alcança o banco de produção: o SQLite mora num volume
// dentro do contêiner do Railway. Resultado medido em 07/08/2026: o CEO pediu
// três links e a casa não conseguiu responder.
//
// Uma rota resolve porque ela RODA ONDE O BANCO ESTÁ. A regra não foi
// reescrita: ela mora em `lib/agency/esteira/links-do-portal.ts` e é a mesma
// que o script chama. Duas implementações da mesma regra divergem — e a que
// diverge aqui emite credencial de 180 dias com critério diferente da outra.
//
// ── AUTENTICAÇÃO: O MESMO SEGREDO DAS ROTAS DE CRON, NO MESMO FORMATO ───────
//
// `Authorization: Bearer <CRON_SECRET>`, conferido por `segredoConfere`
// (comparação em tempo constante). Esquema novo seria mais uma credencial para
// girar, mais um lugar para vazar e mais um caminho para auditar.
//
// **Segredo ausente do ambiente → PORTA FECHADA (503), nunca aberta.** É a
// regra da casa "configuração faltando = porta fechada": uma rota que se abre
// sozinha quando a variável some é uma rota sem trava nenhuma, e esta devolve
// credenciais de acesso ao portal de clientes pagantes.
//
// ── POR QUE UM GET NÃO EMITE TOKEN ─────────────────────────────────────────
//
// `?emitir=1` é obrigatório para gerar qualquer coisa. Sem ele é leitura pura:
// cliente sem token aparece com o MOTIVO em vez de sumir, e nada é gravado.
// GET é o verbo que qualquer um trata como inofensivo — pré-carregador de link,
// histórico de navegador, retry de proxy. Emitir credencial de 180 dias por
// efeito colateral de uma consulta é como credencial vaza.
//
// E NADA é revogado, em nenhum caminho: um token vivo pode estar no WhatsApp do
// cliente, e trocá-lo quebraria em silêncio o link que ele já tem.

import { NextRequest, NextResponse } from "next/server";
import { segredoConfere } from "@/lib/security/crypto";
import { levantarLinksDoPortal } from "@/lib/agency/esteira/links-do-portal";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Porta FECHADA. Sem segredo no ambiente não há como distinguir o CEO de
    // qualquer pessoa na internet — e a resposta é uma lista de credenciais.
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

  const url = new URL(request.url);
  // Emitir é ação EXPLÍCITA. Qualquer coisa diferente de "1"/"true" é não.
  const pedidoDeEmissao = (url.searchParams.get("emitir") ?? "").toLowerCase();
  const emitir = pedidoDeEmissao === "1" || pedidoDeEmissao === "true";

  const clientes = (url.searchParams.get("clientes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const relatorio = await levantarLinksDoPortal({
    clientes,
    host: url.searchParams.get("host"),
    emitir,
  }).catch((e) => {
    return { erro: e instanceof Error ? e.message : "falha ao ler o banco" } as const;
  });

  if ("erro" in relatorio) {
    // Banco fora do ar não vira lista vazia: lista vazia leria como "nenhum
    // cliente tem link", que é uma afirmação, e ausência de informação não é
    // informação.
    return NextResponse.json({ error: relatorio.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...relatorio,
    // Dito com todas as letras na resposta para que quem lê o JSON saiba o que
    // acabou de acontecer, sem precisar reler a documentação da rota.
    aviso: emitir
      ? "EMISSÃO LIGADA: tokens novos foram criados para quem não tinha nenhum vivo. Nenhum token anterior foi revogado."
      : "Leitura pura: nada foi gravado. Use ?emitir=1 para gerar o que falta.",
  });
}
