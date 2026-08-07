// A escolha de provedor de IA POR CLIENTE — a rota que faz a tela mandar.
//
// GET  → todos os clientes do workspace, com o provedor fixado (ou nenhum), e
//        quais provedores TÊM chave conectada. Sem essa segunda parte a tela
//        deixaria fixar um provedor sem chave e a produção daquele cliente
//        pararia — com a tela dizendo que estava tudo configurado.
// PUT  → fixa ou solta um cliente.
//
// Escrever aqui exige MASTER. A escolha decide gasto e decide a qualidade do que
// chega ao cliente pagante; não é ajuste de operação.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { escolhasDoWorkspace, fixarProvedor } from "@/lib/ai/escolha-por-cliente";
import { ALL_PROVIDERS, isAiProvider, resolveProviderKey } from "@/lib/ai/resolve-key";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;
  const { workspaceId } = session;

  const [clientes, escolhas] = await Promise.all([
    prisma.client.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    escolhasDoWorkspace(workspaceId),
  ]);
  const porCliente = new Map(escolhas.map((e) => [e.clientId, e]));

  // Quem tem chave. Só o booleano — a chave nunca sai daqui, nem mascarada:
  // esta rota não é o cofre.
  const conectados: Record<string, boolean> = {};
  for (const p of ALL_PROVIDERS) {
    conectados[p] = (await resolveProviderKey(p, workspaceId)) !== null;
  }

  return NextResponse.json({
    provedores: ALL_PROVIDERS,
    conectados,
    padraoDaCasa: (process.env.BRAIN_AI_PROVIDER ?? "").trim().toLowerCase() || null,
    clientes: clientes.map((c) => {
      const e = porCliente.get(c.id);
      return {
        clientId: c.id,
        nome: c.name,
        provider: e?.provider ?? null,
        model: e?.model ?? null,
        estrito: e?.estrito ?? true,
        motivo: e?.motivo ?? null,
        decididoPor: e?.decididoPor ?? null,
        atualizadoEm: e?.atualizadoEm ?? null,
      };
    }),
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master"]);
  if (error) return error;
  const { workspaceId, userId } = session;

  const body = await request.json().catch(() => ({}));
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  // `null`/vazio = soltar o cliente e devolvê-lo à preferência da casa.
  const bruto = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  if (bruto && !isAiProvider(bruto)) {
    return NextResponse.json({ error: `provedor "${bruto}" não existe nesta casa` }, { status: 400 });
  }
  const provider = bruto ? bruto : null;

  // FAIL-CLOSED no que decide gasto: fixar um provedor sem chave conectada é
  // programar a próxima produção daquele cliente para falhar. A rota recusa
  // ANTES de gravar, e diz o que falta.
  if (provider && (await resolveProviderKey(provider, workspaceId)) === null) {
    return NextResponse.json(
      { error: `"${provider}" não tem chave conectada neste workspace. Conecte a chave em Integrações antes de fixá-lo num cliente.` },
      { status: 409 },
    );
  }

  const r = await fixarProvedor({
    workspaceId,
    clientId,
    provider,
    model: typeof body.model === "string" ? body.model : null,
    // Sem reserva por padrão. Ver `lib/ai/escolha-por-cliente.ts`: reserva calada
    // mede o reserva e entrega ao cliente um padrão diferente do anunciado.
    estrito: body.estrito === false ? false : true,
    motivo: typeof body.motivo === "string" ? body.motivo : null,
    decididoPor: `usuario:${userId ?? "desconhecido"}`,
  });

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
