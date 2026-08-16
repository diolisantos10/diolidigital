// /api/admin/backfill-de-carimbo — O CONSERTO, RODANDO ONDE O BANCO ESTÁ.
//
// ── Por que esta rota existe (16/08/2026, rodada 9) ─────────────────────────
//
// `scripts/backfill-carimbo-do-portal.mts` é a mesma regra e funciona — para
// quem alcança o banco. **E ninguém alcança o banco de produção:** o SQLite
// mora num volume DENTRO do contêiner do Railway. É exatamente o buraco que
// já custou um dia em 07/08 com os links do portal: script pronto, banco
// inalcançável, CEO parado.
//
// Escrever no texto do CEO "rode o backfill antes de subir" sem esta rota
// seria mandá-lo executar um comando que não existe para ele. O backfill é
// **pré-requisito de deploy**; um pré-requisito que não roda não é requisito,
// é intenção.
//
// A regra NÃO foi reescrita aqui: ela mora em
// `lib/agency/portal/backfill-de-carimbo.ts` e é a mesma que o script chama.
// Duas implementações do mesmo carimbo retroativo divergiriam — e a que
// divergisse aqui gravaria dono em linha de cliente pagante com critério
// diferente da outra.
//
// ── AS DUAS PORTAS, E POR QUE O VERBO IMPORTA ──────────────────────────────
//
//   GET  → ENSAIO. Lê, decide, relata. **Não grava nada.** É o passo 1 do
//          plano: é aqui que sai o número que faltava (quantas solicitações
//          ficam de fora, e por quê).
//   POST → APLICA. Grava o carimbo nas linhas órfãs que passaram nos três
//          critérios de prova.
//
// Um GET que grava é como credencial vaza: pré-carregador de link, histórico
// de navegador e retry de proxy tratam GET como inofensivo. Aqui o efeito
// seria carimbar dono em linha de cliente — irreversível sem perícia.
//
// ── AUTENTICAÇÃO ───────────────────────────────────────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>` (comparação em tempo constante), ou
// sessão `master`. **Segredo ausente do ambiente e sem sessão → porta
// fechada.** Rota que se abre sozinha quando a variável some não tem trava.

import { NextRequest, NextResponse } from "next/server";
import { backfillDeCarimbo } from "@/lib/agency/portal/backfill-de-carimbo";
import { requireSession } from "@/lib/auth/api-guard";
import { segredoConfere } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

function segredoDeCronConfere(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  return segredoConfere(token, cronSecret);
}

async function autorizado(request: NextRequest): Promise<NextResponse | null> {
  if (segredoDeCronConfere(request)) return null;
  const { error } = await requireSession(["master"]);
  return error ?? null;
}

async function responder(request: NextRequest, aplicar: boolean): Promise<NextResponse> {
  const barrado = await autorizado(request);
  if (barrado) return barrado;

  try {
    const relatorio = await backfillDeCarimbo(aplicar);
    return NextResponse.json({
      ok: true,
      ...relatorio,
      leiaAssim: {
        numeroPrincipal: "deixadasDeFora",
        oQueEle:
          "Quantas solicitações o backfill NÃO conseguiu provar de quem são. Cada uma tem o"
          + " motivo escrito na própria linha. É este o trabalho humano que sobra — e o único.",
        cuidado:
          "`carimbadas` não é 'consertadas': é 'religadas com prova'. O que ficou de fora"
          + " continua no banco e continua invisível no portal até alguém decidir.",
        antesDeAplicar:
          "Leia as linhas com `atencao` (`comAtencao`): são as solicitações que já serviram"
          + " um portal SEM dono escrito — a forma do incidente. Elas SERÃO carimbadas com o"
          + " dono atual; se algum desses donos estiver errado, é aqui que se pega, e só aqui.",
        comoAplicar: aplicar
          ? "APLICADO. Rodar de novo é inofensivo: o WHERE exige `clientId` nulo."
          : "ENSAIO — nada foi gravado. Repita a chamada com POST para aplicar.",
      },
    });
  } catch (e) {
    // Falha de leitura NÃO vira relatório vazio: "não consegui apurar" e "não
    // há nada para carimbar" são fatos opostos, e o segundo liberaria o deploy
    // por engano. Ausência de informação não é informação.
    console.error("[backfill-carimbo] falhei", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao apurar o backfill" },
      { status: 500 },
    );
  }
}

/** ENSAIO — somente leitura. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return responder(request, false);
}

/** APLICA — grava o carimbo. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return responder(request, true);
}
