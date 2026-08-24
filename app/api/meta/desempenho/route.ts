// GET /api/meta/desempenho — A LEITURA ANALÍTICA DO TRÁFEGO PAGO. SÓ LEITURA.
//
// Pedido do CEO em 06/08/2026: "preciso de leitura, analítica dos dados,
// prioridade máxima agora é o que está com campanha na meta rolando."
//
// Devolve, por conta de anúncio ATIVA: campanhas no ar, gasto/impressões/
// alcance/CPM/CPC/CTR/resultados/custo por resultado dos últimos 30 dias, os
// achados (onde queima, onde escala, o que está ligado e não devia) e uma
// recomendação ancorada em número.
//
// ── O QUE ESTA ROTA NÃO FAZ ─────────────────────────────────────────────────
// Não cria, não ativa, não pausa, não edita. As únicas operações declaradas no
// caminho são `listar_contas`, `ler_campanha` e `ler_desempenho` — todas de 1
// ponto no catálogo de `travas.ts`. Só GET: a rota não exporta POST.
//
// ── RITMO ───────────────────────────────────────────────────────────────────
// Custo: 1 chamada para listar as contas + 2 por conta ativa, em SÉRIE. Com 9
// contas ativas, 19 pontos espalhados por 9 baldes — no máximo 2 dos 48 pontos
// de cada conta por janela de 300s (`cota-de-anuncios.ts`). Uma varredura
// paralela seria uma rajada, e foi rajada que restringiu a conta da agência em
// 03/08/2026.
//
// Parâmetros:
//   ?clientId=<id>   qual conexão de usuário usar (default: a da agência)
//   ?desde&ate       AAAA-MM-DD (default: últimos 30 dias fechados em ontem)
//   ?conta=act_x,act_y   limita a leitura a contas específicas
//   ?incluirInativas=1   lê também contas que não veiculam (custa cota à toa)

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { lerPanoramaDaAgencia, ultimos30Dias } from "@/lib/integrations/meta/ads-leitura";
import { medirContaComSerie } from "@/lib/agency/medicao/medir-conta-com-serie";

export const dynamic = "force-dynamic";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A conexão de USUÁRIO — a única que serve para a Marketing API. Token de
 * Página não lê `me/adaccounts` (a Meta responde "(#102) A user access token is
 * required"), e por isso a busca é por `platform: "user"`, nunca por instagram
 * ou facebook.
 */
async function conexaoDeUsuario(workspaceId: string, clientId: string | null): Promise<string | null> {
  const row = await prisma.metaConnection.findFirst({
    where: { workspaceId, platform: "user", status: "connected", ...(clientId ? { clientId } : {}) },
    orderBy: { connectedAt: "desc" },
    select: { id: true },
  }).catch(() => null);
  return row?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const q = request.nextUrl.searchParams;
  const clientId = q.get("clientId");

  // ⚠️ SEM FALLBACK PARA A CONEXÃO DA AGÊNCIA (corrigido em 06/08/2026). Até
  // hoje, pedir o desempenho de um cliente sem conexão devolvia, em silêncio, o
  // desempenho das contas DA AGÊNCIA sob o nome daquele cliente. Relatório
  // errado com cara de certo é pior que relatório ausente.
  const connectionId = await conexaoDeUsuario(session!.workspaceId, clientId);

  if (!connectionId) {
    // Estado, não falha: a tela precisa mostrar "conectar", e "não conectado"
    // é diferente de "conectado e sem dado".
    return NextResponse.json({
      ok: false,
      semConexao: true,
      error: "Nenhum acesso de usuário da Meta conectado neste workspace. Conecte em Integrações → Meta (a Marketing API exige token de usuário).",
    });
  }

  const desde = q.get("desde");
  const ate = q.get("ate");
  if ((desde && !DATA_VALIDA.test(desde)) || (ate && !DATA_VALIDA.test(ate))) {
    return NextResponse.json({ error: "desde/ate devem ser AAAA-MM-DD" }, { status: 400 });
  }
  const periodo = desde && ate ? { desde, ate } : ultimos30Dias();

  const apenasContas = (q.get("conta") ?? "")
    .split(",").map((c) => c.trim()).filter(Boolean);

  const r = await lerPanoramaDaAgencia(session!.workspaceId, connectionId, {
    periodo,
    apenasContas,
    incluirInativas: q.get("incluirInativas") === "1",
  });

  if (!r.ok || !r.dados) {
    // Freio de ritmo não é erro de servidor: é a trava funcionando. Sai 200
    // com o motivo, para a tela dizer "tente daqui a pouco" em vez de "falhou".
    //
    // `sem_autorizacao` idem, e por um motivo mais forte: é o estado NORMAL de
    // uma conexão recém-feita. A tela precisa dizer "falta autorizar quais
    // contas" — nunca mostrar dado, nunca gritar erro de servidor.
    const trava = r.motivo === "ritmo" || r.motivo === "sem_autorizacao";
    return NextResponse.json(
      {
        ok: false,
        motivo: r.motivo,
        ...(r.motivo === "sem_autorizacao" ? { semAutorizacao: true, contas: [] } : {}),
        error: r.erro,
      },
      { status: trava ? 200 : 502 },
    );
  }

  // ── A COMPARAÇÃO ESPERADO × RECEBIDO (24/08/2026) ─────────────────────────
  //
  // Antes desta linha, a rota devolvia os totais e a tela os desenhava. Se um
  // evento de conversão deixasse de chegar, o número saía menor com a mesma
  // cara de um número inteiro. Agora todo panorama carrega a integridade da sua
  // própria medição, e a tela não tem como mostrar o número sem ela — o campo
  // vem sempre, inclusive quando não houve comparação nenhuma ("não medido",
  // que é diferente de "íntegro").
  // ── A SÉRIE (24/08/2026) ──────────────────────────────────────────────────
  //
  // `medirContaComSerie` lê o passado da campanha, mede a integridade contra
  // ele e grava este período para a leitura de amanhã. Sem o passado, "parou de
  // chegar" é um detector desligado — e a conciliação devolve NÃO MEDIDO em vez
  // de fingir integridade.
  const contas = await Promise.all(r.dados.contas.map(async (c) => ({
    ...c,
    integridade: await medirContaComSerie({
      contaId: c.conta.id, periodo: c.periodo, desempenho: c.desempenho, totais: c.totais,
    }),
  })));

  return NextResponse.json({ ok: true, ...r.dados, contas });
}
