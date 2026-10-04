import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { inventarioDoCliente } from "@/lib/agency/persistence/cliente-vinculos";
import { camposDoCadastro, type FaixaDePreco } from "@/lib/agency/clients/cadastro";
import { parceriaDoCliente } from "@/lib/agency/comercial/parceria-do-cliente";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const client = await prisma.client.findFirst({
    where: { id, workspaceId: session.workspaceId },
    include: { brandBrain: true },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Faixa de preço DERIVADA da parceria vigente — não é coluna (uma verdade só).
  const faixaDePreco: FaixaDePreco = (await parceriaDoCliente(client.id)) ? "parceiro" : "normal";
  return NextResponse.json({ ...client, faixaDePreco });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  // Ensure client belongs to workspace
  const existing = await prisma.client.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const cadastro = camposDoCadastro(body as Record<string, unknown>);
  if (!cadastro.ok) return NextResponse.json({ error: cadastro.erro }, { status: 400 });
  // O responsável tem de ser da EQUIPE deste workspace — id de outro lugar
  // (ou de usuário do portal) é recusado, não gravado.
  if (cadastro.dados.responsavelUserId) {
    const daEquipe = await prisma.user.findFirst({
      where: { id: cadastro.dados.responsavelUserId, workspaceId: session.workspaceId, clientId: null },
      select: { id: true },
    });
    if (!daEquipe) return NextResponse.json({ error: "responsável não é da equipe" }, { status: 400 });
  }
  const client = await prisma.client.update({
    where: { id },
    data: {
      name:     body.name     ?? existing.name,
      industry: body.industry ?? existing.industry,
      email:    body.email    ?? existing.email,
      phone:    body.phone    ?? existing.phone,
      website:  body.website  ?? existing.website,
      descricao: typeof body.description === "string" ? body.description : existing.descricao,
      status:    typeof body.status === "string" ? body.status : existing.status,
      // Centro de custo da Control Room (04/10/2026). Vazio apaga — o gasto
      // volta a cair no centro da casa, e o log diz isso.
      centroCustoId: typeof body.centroCustoId === "string"
        ? (body.centroCustoId.trim().slice(0, 120) || null)
        : existing.centroCustoId,
      // Raio-x de 03/10 (04/10/2026): tipo, responsável e meta da conta.
      ...cadastro.dados,
    },
  });
  return NextResponse.json(client);
}

// ── APAGAR CLIENTE ───────────────────────────────────────────────────────────
// Não existia, e por isso a lista ficou com duplicata que ninguém conseguia
// tirar ("City Jobs" e "CityJobs", "Camila Pereira" duas vezes).
//
// A REGRA, e ela é deliberada: só apaga cliente VAZIO. Com qualquer coisa
// pendurada — projeto, aprovação, mensagem, mídia — a rota RECUSA e manda
// fundir. O motivo é o schema: só cinco modelos caem por cascade; mais de vinte
// carregam `clientId` solto e ficariam órfãos, sumindo da tela e continuando no
// banco. Recusar é barato; apagar dado de cliente é irreversível.
//
// `GET /api/clients/[id]/vinculos` devolve o inventário sem apagar nada — é o
// que a tela usa para o aviso ser específico ("3 projetos, 12 mensagens") em
// vez de um "tem certeza?" genérico.
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<Params> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  // Posse conferida aqui, não uma camada abaixo: rota que apaga sem provar de
  // quem é o registro é furo, não funcionalidade.
  const existing = await prisma.client.findFirst({ where: { id, workspaceId: session.workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inventario = await inventarioDoCliente(prisma, id);
  if (!inventario.podeApagar) {
    return NextResponse.json(
      {
        error: "cliente tem trabalho pendurado — funda em vez de apagar",
        motivo: "apagar deixaria órfão o que não cai por cascade",
        inventario,
      },
      { status: 409 },
    );
  }

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true, apagado: { id, name: existing.name } });
}
