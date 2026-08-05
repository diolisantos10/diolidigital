// Reconciliar telas dos carrosséis — a versão clicável do
// `scripts/backfill-carrossel-foocci.mjs`.
//
// Por que existe: as telas dos carrosséis estão nos Arquivos do cliente, mas
// nenhum dado liga tela a post (`SocialPost.mediaUrlsJson = "[]"`), então o
// portal mostra só a capa. O script resolve — mas exige acesso ao banco de
// produção pela linha de comando. Isto põe o mesmo plano atrás de um botão.
//
// GET  ?clientId=...  → ENSAIO (dry-run). NÃO ESCREVE NADA.
// POST { clientId, confirmar: "APLICAR" } → aplica, em transação.
//
// ── O que esta rota NÃO faz, de propósito ───────────────────────────────────
//  • `--por-ordem` (casamento posicional) não é exposto: monta carrossel com
//    logo e material bruto. A auditoria de 04/08/2026 exigiu decisão humana com
//    dry-run próprio — quem precisar roda o script à mão.
//  • `--force` não é exposto: a tela nunca sobrescreve telas já ligadas.
//
// A REGRA que mantém isto honesto: o POST **recalcula o plano do zero no
// servidor**. Nada do que o navegador manda vira escrita — o corpo só carrega o
// cliente e a confirmação. Se o mundo mudou entre o ensaio e o clique, o POST
// enxerga o mundo novo.
//
// A lógica de casamento vive em `lib/agency/media/backfill-carrossel.mjs`
// (29 testes). Aqui só há: guarda de sessão, leitura do banco e escrita.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { postsParaGravar } from "@/lib/agency/media/backfill-carrossel.mjs";
import type { Plano } from "@/lib/agency/media/backfill-carrossel.mjs";
import {
  montarPlanoDoCliente,
  type ContextoDoBackfill,
} from "@/lib/agency/media/backfill-contexto";
import { avaliarPlano, explicarErro } from "./plano";

const CONFIRMACAO = "APLICAR";

async function requireMaster() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "master")
    return { error: NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 }) };
  return { session };
}

// A leitura do mundo mora em `lib/agency/media/backfill-contexto.ts`: a tarefa
// de boot (que roda quando ninguém pode clicar) aplica o MESMO plano, e dois
// leitores do banco divergiriam com o tempo.
const montarPlano = montarPlanoDoCliente;
type Contexto = ContextoDoBackfill;

/** O cliente como a TELA o vê — sem o workspace, que é da leitura interna. */
function semWorkspace(c: Contexto["cliente"]): { id: string; nome: string } {
  return { id: c.id, nome: c.nome };
}

/** A resposta comum ao ensaio e ao pós-aplicação. */
function corpoDoEnsaio(ctx: Contexto) {
  const { plano } = ctx;
  const avaliacao = avaliarPlano(plano);
  return {
    ok: true as const,
    // Só id e nome: `workspaceId` é da leitura interna e não desce para a tela.
    cliente: semWorkspace(ctx.cliente),
    resumo: {
      carrosseis: plano.posts.length,
      imagens: ctx.imagens,
      midiasComDono: ctx.midiasComDono,
      postsQueSeraoAtualizados: avaliacao.postsQueSeraoAtualizados,
      postsJaComTelas: avaliacao.postsJaComTelas,
      postsSemTelasSuficientes: avaliacao.postsSemTelasSuficientes,
      telasCasadas: avaliacao.telasCasadas,
      telasQueSeraoLigadas: avaliacao.telasQueSeraoLigadas,
      excluidas: plano.excluidos.length,
      semCasar: plano.naoCasados.length,
    },
    posts: avaliacao.postsNaTela,
    excluidos: plano.excluidos,
    naoCasados: plano.naoCasados.map((a) => ({
      assetId: a.assetId,
      fileName: a.fileName,
      createdAt: a.createdAt == null ? null : String(a.createdAt),
    })),
    temCasamentoPorOrdem: avaliacao.temCasamentoPorOrdem,
    aplicavel: avaliacao.aplicavel,
    motivoNaoAplicavel: avaliacao.motivoNaoAplicavel,
  };
}

function corpoDoErro(erro: NonNullable<Plano["erro"]>, cliente: { id: string; nome: string }) {
  return {
    ok: false as const,
    codigo: erro.codigo,
    cliente,
    ...explicarErro(erro),
    semData: erro.semData ?? [],
  };
}

// ─── ENSAIO (dry-run) — não escreve nada ─────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requireMaster();
  if (guard.error) return guard.error;

  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  }

  const ctx = await montarPlano(clientId);
  if (!ctx) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (ctx.plano.erro) {
    // Aborto de DOMÍNIO (falta data, não há carrossel) não é falha de HTTP: a
    // tela precisa do texto explicativo, não de um erro cru.
    return NextResponse.json(corpoDoErro(ctx.plano.erro, semWorkspace(ctx.cliente)));
  }
  return NextResponse.json({ ...corpoDoEnsaio(ctx), acao: "ensaio" });
}

// ─── APLICAÇÃO — em transação, tudo ou nada ──────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guard = await requireMaster();
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  }
  if (body.confirmar !== CONFIRMACAO) {
    return NextResponse.json(
      { error: `confirmação explícita necessária: { confirmar: "${CONFIRMACAO}" }` },
      { status: 400 },
    );
  }

  // Recalcula do zero: o navegador não manda plano, manda intenção.
  const ctx = await montarPlano(clientId);
  if (!ctx) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }
  if (ctx.plano.erro) {
    return NextResponse.json(corpoDoErro(ctx.plano.erro, semWorkspace(ctx.cliente)), { status: 409 });
  }

  const avaliacao = avaliarPlano(ctx.plano);
  if (!avaliacao.aplicavel) {
    return NextResponse.json(
      { ...corpoDoEnsaio(ctx), acao: "recusado", error: avaliacao.motivoNaoAplicavel },
      { status: 409 },
    );
  }

  const aGravar = postsParaGravar(ctx.plano.posts, { force: false });
  const capaAtual = new Map(ctx.plano.posts.map((p) => [p.id, p.mediaUrl]));

  // Tudo ou nada: sem transação, uma falha no meio deixa metade dos carrosséis
  // ligados e o relatório anuncia um total que não existe no banco.
  await prisma.$transaction(
    aGravar.map((post) =>
      prisma.socialPost.update({
        where: { id: post.id },
        data: {
          mediaUrlsJson: JSON.stringify(post.urls),
          // A capa só é preenchida se estiver vazia — capas postas à mão ficam.
          ...(capaAtual.get(post.id) ? {} : { mediaUrl: post.urls[0] }),
        },
      }),
    ),
  );

  // Relê o mundo para o relatório: o número que a tela mostra é o do banco.
  const depois = await montarPlano(clientId);
  return NextResponse.json({
    ok: true,
    acao: "aplicado",
    cliente: semWorkspace(ctx.cliente),
    postsAtualizados: aGravar.length,
    telasLigadas: aGravar.reduce((s, p) => s + p.urls.length, 0),
    detalhe: aGravar.map((p) => ({ id: p.id, telas: p.urls.length })),
    ...(depois && !depois.plano.erro ? { depois: corpoDoEnsaio(depois) } : {}),
  });
}
