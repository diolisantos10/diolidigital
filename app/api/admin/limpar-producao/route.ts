// LIMPAR PRODUÇÃO — apaga o que foi FABRICADO, preserva o que foi PEDIDO.
//
// ── Por que esta rota existe (09/08/2026) ───────────────────────────────────
//
// Ordem do CEO: *"deletar todas as demandas de todos os clientes que estão
// registradas até agora. Só vai deixar os briefings. Mas vai deletar tudo que
// foi pedido pra ser fabricado."*
//
// `/api/admin/reset` NÃO serve para isso, e o motivo é fácil de não enxergar:
// ela apaga `Project`, e **Briefing é filho de Project** — some junto, em
// cascata, nos três modos dela. Usar a ferramenta que existia teria destruído
// exatamente o que o CEO mandou preservar.
//
// ── A FRONTEIRA: FABRICADO × PEDIDO × SABIDO ────────────────────────────────
//
// Três coisas diferentes moram no mesmo banco, e só a primeira sai:
//
//   FABRICADO (apaga) — o que a agência produziu: entregas, posts, artes
//     geradas, pedidos de aprovação e o que o cliente respondeu sobre eles.
//
//   PEDIDO (preserva) — o briefing, a solicitação, o projeto e o cliente. É o
//     que o cliente disse que queria; apagar isso seria apagar o trabalho DELE.
//
//   SABIDO (preserva) — o que a casa aprendeu sobre a marca: o cérebro de
//     marca, as PROIBIÇÕES do cliente (que moram em `BrainArtifact`, no
//     departamento `proibicoes-do-cliente`) e o material que ele enviou.
//     Isto não é produção: é a régua com que a produção futura será julgada.
//     Apagar as proibições devolveria toda marca ao dia zero, e o cliente teria
//     de dizer de novo o que já disse uma vez.
//
// ── AS MÍDIAS: SÓ O QUE A CASA GEROU ────────────────────────────────────────
//
// `MediaAsset` guarda duas coisas com o mesmo formato: o que a agência gerou
// (`kind` "generated"/"deliverable") e o que o CLIENTE mandou (`inbound`). Em
// 09/08 o CEO acabou de subir os seis logos do CityJobs — apagá-los junto seria
// destruir material que ele levou o dia para entregar. Só o gerado sai.
//
// ── OLHAR ANTES DE APAGAR ───────────────────────────────────────────────────
//
// GET  = contagem, não apaga nada. É a conferência.
// POST = apaga, e exige TRÊS coisas ao mesmo tempo: o segredo, a frase de
//        confirmação e a variável de ambiente. Apagar dado de cliente não pode
//        depender de um clique distraído.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FRASE = "APAGAR_O_QUE_FOI_FABRICADO";

/** O departamento em que vivem as proibições do cliente. NUNCA é apagado: é
 *  régua de marca, não produção. Ver `lib/agency/esteira/proibicoes.ts`. */
const DEPARTAMENTO_DAS_PROIBICOES = "proibicoes-do-cliente";

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  return segredoConfere(token, segredo);
}

async function contar() {
  const [entregas, posts, aprovacoes, comentarios, artesGeradas, tarefas] = await Promise.all([
    prisma.deliverable.count(),
    prisma.socialPost.count(),
    prisma.approvalRequest.count(),
    prisma.approvalComment.count(),
    prisma.mediaAsset.count({ where: { kind: { in: ["generated", "deliverable"] } } }),
    prisma.task.count().catch(() => 0),
  ]);
  const [briefings, projetos, clientes, solicitacoes, cerebros, proibicoes, materialDoCliente] = await Promise.all([
    prisma.briefing.count(),
    prisma.project.count(),
    prisma.client.count(),
    prisma.clientRequestDb.count().catch(() => 0),
    prisma.brandBrain.count(),
    prisma.brainArtifact.count({ where: { department: DEPARTAMENTO_DAS_PROIBICOES } }),
    prisma.mediaAsset.count({ where: { kind: "inbound" } }),
  ]);
  return {
    seraApagado: { entregas, posts, aprovacoes, comentarios, artesGeradas, tarefas },
    seraPreservado: { briefings, projetos, clientes, solicitacoes, cerebros, proibicoes, materialDoCliente },
  };
}

/** Conferência: conta o que sairia e o que ficaria. Não apaga nada. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ modo: "conferencia", ...(await contar()) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (process.env.ALLOW_PRODUCTION_RESET !== "true") {
    return NextResponse.json(
      { error: "Desligada. Para permitir, defina ALLOW_PRODUCTION_RESET=true — e remova depois." },
      { status: 503 },
    );
  }

  const corpo = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (corpo.confirm !== FRASE) {
    return NextResponse.json({ error: `Faltou confirmar. Envie {"confirm":"${FRASE}"}.` }, { status: 400 });
  }

  const antes = await contar();

  // Tudo numa transação: apagar metade e falhar deixaria o banco num estado que
  // ninguém sabe descrever — pior do que não ter apagado.
  await prisma.$transaction(async (tx) => {
    // A ordem segue a dependência: filho antes de pai.
    await tx.approvalComment.deleteMany({});
    await tx.approvalRequest.deleteMany({});
    await tx.socialPost.deleteMany({});
    await tx.deliverable.deleteMany({});
    await tx.task.deleteMany({}).catch(() => null);
    // Só a mídia que a CASA gerou. O `inbound` é do cliente e fica.
    await tx.mediaAsset.deleteMany({ where: { kind: { in: ["generated", "deliverable"] } } });
  });

  return NextResponse.json({ modo: "apagado", antes, depois: await contar() });
}
