// POST /api/clients/[id]/fundir — junta dois cadastros do mesmo cliente.
//
// O CASO REAL QUE PEDIU ISTO: a lista tinha "City Jobs" (0 projetos, setor
// vazio) e "CityJobs" (1 projeto, setor preenchido) — o mesmo cliente, criado
// duas vezes porque a rota do piloto assistido procurava por nome EXATO e criava
// um novo em silêncio quando não achava. "Camila Pereira" apareceu duas vezes
// pelo mesmo motivo.
//
// POR QUE FUNDIR E NÃO APAGAR: duplicata quase nunca é "uma linha certa e uma
// vazia". Uma tem o projeto, a outra tem a conversa do portal; uma tem o setor,
// a outra tem as aprovações. Apagar escolhe um lado e perde o outro. Fundir move
// TUDO para o sobrevivente e não perde nada.
//
// `[id]` é quem é ABSORVIDO (some no fim). O corpo traz `sobreviventeId`.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { completarCampos, moverVinculos } from "@/lib/agency/persistence/cliente-vinculos";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["master", "project_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: absorvidoId } = await context.params;

  let corpo: { sobreviventeId?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const sobreviventeId = corpo.sobreviventeId?.trim();
  if (!sobreviventeId) {
    return NextResponse.json({ error: "sobreviventeId é obrigatório" }, { status: 400 });
  }
  if (sobreviventeId === absorvidoId) {
    return NextResponse.json({ error: "um cliente não se funde consigo mesmo" }, { status: 400 });
  }

  // Os DOIS conferidos contra o workspace da sessão. Conferir só um deixaria
  // mover o trabalho de um inquilino para dentro de outro — que é a forma mais
  // silenciosa de vazar dado entre clientes.
  const [absorvido, sobrevivente] = await Promise.all([
    prisma.client.findFirst({ where: { id: absorvidoId,    workspaceId: session.workspaceId } }),
    prisma.client.findFirst({ where: { id: sobreviventeId, workspaceId: session.workspaceId } }),
  ]);
  if (!absorvido)    return NextResponse.json({ error: "cliente absorvido não encontrado" },    { status: 404 });
  if (!sobrevivente) return NextResponse.json({ error: "cliente sobrevivente não encontrado" }, { status: 404 });

  // Transação: uma fusão pela metade — metade do trabalho movido e o cadastro
  // ainda de pé — é pior que não ter começado, porque ninguém sabe onde parou.
  const resultado = await prisma.$transaction(async (tx) => {
    const movimento = await moverVinculos(tx, absorvidoId, sobreviventeId);

    const completar = completarCampos(sobrevivente, absorvido);
    if (Object.keys(completar).length > 0) {
      await tx.client.update({ where: { id: sobreviventeId }, data: completar });
    }

    await tx.client.delete({ where: { id: absorvidoId } });
    return { ...movimento, completados: Object.keys(completar) };
  });

  return NextResponse.json({
    ok: true,
    absorvido:    { id: absorvido.id,    name: absorvido.name },
    sobrevivente: { id: sobrevivente.id, name: sobrevivente.name },
    ...resultado,
    // O link antigo do portal deixa de funcionar: o portalToken do absorvido
    // vai embora com ele. Quem estiver com aquele endereço perde o acesso e
    // precisa do link do sobrevivente. Dito aqui para a tela poder avisar.
    aviso: "o link de portal do cliente absorvido deixa de funcionar",
  });
}
