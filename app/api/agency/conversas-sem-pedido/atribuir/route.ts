// POST /api/agency/conversas-sem-pedido/atribuir — A CASA DIZ DE QUEM É UMA
// CONVERSA ÓRFÃ.
//
// ─── POR QUE ESTA ROTA NASCE NO MESMO COMMIT DO MECANISMO ───────────────────
//
// Porque a alternativa já custou caro dez vezes nesta casa: mecanismo pronto,
// testado, provado por mutação, e **nada o chamava**. Uma porta que ninguém
// alcança é a mesma trava sem fechadura. `atribuirRastroAoCliente` existe para
// ser chamada daqui, e daqui ela é chamada.
//
// ─── AS GUARDAS (as MESMAS de `/api/agency/parcerias`) ──────────────────────
//
//   1. Sessão de AGÊNCIA. Sessão de portal (com `clientId`) NÃO entra — o
//      cliente não declara de quem é uma conversa, muito menos de quem é a
//      dele. Esta rota decide quem recebe orçamento isento; sessão de cliente
//      aqui seria o cliente se auto-promovendo a parceiro.
//   2. CSRF: é mutação, e mutação cross-site é barrada.
//   3. `atribuidoPor` sai da SESSÃO, nunca do corpo. Um autor que o próprio
//      operador digita não é testemunha de nada — a mesma lei de
//      `registradaPor` na parceria.
//   4. `workspaceId` sai da SESSÃO. A fronteira de inquilino vale nos dois
//      lados: o rastro e o cliente têm de ser desta casa.
//
// ─── O QUE ELA NÃO FAZ ──────────────────────────────────────────────────────
//
//   • ⛔ **Não deduz nada.** Não olha e-mail, nome de negócio nem texto da
//     conversa. Recebe o `clientId` de um humano com sessão que responde pelo
//     ato. *Declarar não é deduzir* — o porquê por extenso em `dono-do-rastro.ts`.
//   • ⛔ **Não cria pedido.** Ela dá DONO ao rastro. Quem promove é o relógio
//     (`despertador.ts`, perna `conversa-recuperada`), com a régua do #367
//     intacta: parceria VIVA + escopo completo + índice único. Sem parceria
//     viva, atribuir não faz nascer pedido nenhum.
//   • ⛔ **Não cria pagamento.** A isenção continua DERIVADA da
//     `ParceriaDoCliente`. Nenhum R$ 0 falso passa por aqui.
//   • **Não sobrescreve em silêncio.** Rastro já promovido, ou já atribuído a
//     outro cliente → 409 com o motivo. Mesmo cliente → idempotente.

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAgencyRole } from "@/lib/auth/session";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { atribuirRastroAoCliente } from "@/lib/agency/comercial/atribuir-conversa-orfa";

/** Recusas que são CONFLITO (o estado do mundo já é outro), não erro do pedido.
 *  Distinguir importa: 400 diz "você digitou errado" e 409 diz "alguém chegou
 *  antes" — e as duas exigem coisas opostas de quem está do outro lado. */
const CONFLITO = new Set(["ja_virou_pedido", "ja_atribuida_a_outro"]);
/** Falha de infraestrutura. Fail-closed com o código honesto: repetir daqui a
 *  pouco pode funcionar, e um 400 faria o operador procurar erro no que digitou. */
const INDISPONIVEL = new Set(["leitura_falhou", "escrita_falhou"]);

const MAX_TEXTO = 300;
const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXTO) : "");

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Sessão de portal carrega `clientId`. Ela não entra — nem como leitora.
  if (session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (deveBloquearMutacaoCrossSite(req)) {
    return NextResponse.json(
      { ok: false, error: "Origem não confiável para esta ação." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const r = await atribuirRastroAoCliente({
    fio: texto(body.fio),
    clientId: texto(body.clientId),
    // ⛔ DA SESSÃO, e de lugar nenhum mais. Se um dia alguém trocar isto por um
    // campo lido do corpo da requisição, a trilha inteira vira ficção: qualquer
    // operador assinaria o ato com o nome de outro, e a resposta para "quem
    // atribuiu isto?" passaria a ser "quem quer que tenha digitado". Há um teste
    // que lê ESTE arquivo e falha se o autor voltar a sair do corpo.
    atribuidoPor: session.userId,
    workspaceId: session.workspaceId,
  });

  if (!r.ok) {
    const status = CONFLITO.has(r.recusa) ? 409 : INDISPONIVEL.has(r.recusa) ? 503 : 400;
    return NextResponse.json({ ok: false, recusa: r.recusa, error: r.motivo }, { status });
  }

  return NextResponse.json({
    ok: true,
    jaExistia: r.jaExistia,
    atribuicao: r.atribuicao,
    mensagem: r.jaExistia
      ? "Esta conversa já estava atribuída a este cliente. Nada foi alterado — a data do ato original é a que vale."
      : "Conversa atribuída. Se este cliente tiver parceria VIVA e o escopo da conversa já der para orçar, a " +
        "próxima batida do relógio (perna `conversa-recuperada`) transforma a conversa em pedido e a perna " +
        "seguinte entrega o orçamento. Atribuir NÃO cria pedido por si só: sem parceria viva ou com escopo " +
        "incompleto, a conversa segue como parada com dono humano, e o que falta aparece nomeado na rodada.",
  });
}
