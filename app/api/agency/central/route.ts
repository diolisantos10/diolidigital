// GET /api/agency/central — a leitura da Central de Trabalho, vinda do BANCO.
//
// ── Por que esta rota existe, e não uma leitura do store do navegador ───────
//
// O contrato do CEO tem uma linha que decide isto: "substituir todos os dados
// demonstrativos por dados reais ou estados vazios honestos". O store do
// Zustand é hidratado no navegador e guarda resíduo em `localStorage` — a
// mesma tela mostraria números diferentes em dois computadores, e resíduo de
// piloto apareceria como se fosse cliente. Aqui a origem é o Postgres, escopado
// ao workspace da SESSÃO.
//
// ── As duas travas ─────────────────────────────────────────────────────────
//
// 1. `exigirApiInterna("/agency/dashboard")` — sessão válida E rota permitida.
//    Cliente e anônimo levam 403/401 mesmo chamando com `curl`; a permissão da
//    API está presa à MESMA linha do inventário que a permissão da tela.
// 2. `workspaceId` vem da sessão, NUNCA da querystring. Aceitar id de inquilino
//    de quem chama é como se vaza dado entre clientes.
//
// A montagem em si é `montarLeitura()`, a mesma função que os testes exercitam
// — a rota é casca fina de propósito.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { montarLeitura, type DadosDaCentral } from "@/components/agency/central/dados";
import {
  dbActivityEventToMock,
  dbBrandUpdateToMock,
  dbClientToMock,
  dbDeliverableToMock,
  dbMaterialRequestToMock,
  dbProjectToMock,
  dbStrategyRoomToMock,
  dbTaskToMock,
} from "@/lib/db/adapters";
import type { StrategyRoom } from "@/lib/agency/mock-data";

export const dynamic = "force-dynamic";

/** Quantos eventos de atividade entram na faixa de handoffs. */
const JANELA_DE_ATIVIDADE = 40;

export async function GET(): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/dashboard");
  if (erro) return erro;
  const { session, perfil } = acesso;
  const workspaceId = session.workspaceId;

  try {
    const clientesDb = await prisma.client.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    const idsDeCliente = clientesDb.map((c) => c.id);

    // Sem cliente no workspace não há o que buscar — e devolver a leitura vazia
    // é MELHOR que devolver erro: a tela tem estado vazio honesto para isso.
    const projetosDb = idsDeCliente.length
      ? await prisma.project.findMany({ where: { clientId: { in: idsDeCliente } } })
      : [];
    const idsDeProjeto = projetosDb.map((p) => p.id);

    const [tarefasDb, entregasDb, materiaisDb, salasDb, marcaDb, atividadeDb] = await Promise.all([
      idsDeProjeto.length ? prisma.task.findMany({ where: { projectId: { in: idsDeProjeto } } }) : [],
      idsDeProjeto.length ? prisma.deliverable.findMany({ where: { projectId: { in: idsDeProjeto } } }) : [],
      idsDeProjeto.length ? prisma.materialRequest.findMany({ where: { projectId: { in: idsDeProjeto } } }) : [],
      idsDeProjeto.length ? prisma.strategyRoom.findMany({ where: { projectId: { in: idsDeProjeto } } }) : [],
      idsDeCliente.length ? prisma.brandUpdate.findMany({ where: { clientId: { in: idsDeCliente } } }) : [],
      prisma.activityEvent.findMany({
        where: { workspaceId },
        orderBy: { timestamp: "desc" },
        take: JANELA_DE_ATIVIDADE,
      }),
    ]);

    const projetoParaCliente = new Map(projetosDb.map((p) => [p.id, p.clientId]));

    const dados: DadosDaCentral = {
      clients: clientesDb.map(dbClientToMock),
      projects: projetosDb.map(dbProjectToMock),
      tasks: tarefasDb.map(dbTaskToMock),
      deliverables: entregasDb.map(dbDeliverableToMock),
      materialRequests: materiaisDb.map((m) =>
        dbMaterialRequestToMock(m, projetoParaCliente.get(m.projectId) ?? ""),
      ),
      strategyRooms: salasDb
        .map(dbStrategyRoomToMock)
        .filter((s): s is StrategyRoom => s !== null),
      brandUpdates: marcaDb.map(dbBrandUpdateToMock),
      activity: atividadeDb.map(dbActivityEventToMock),
    };

    return NextResponse.json({
      leitura: montarLeitura(dados, perfil, Date.now()),
      perfil,
      usuario: { nome: session.name, papel: session.role },
    });
  } catch (err) {
    // O alerta carrega a evidência — guardrail 6. "Falhou" sem o caso concreto
    // é ruído que ninguém investiga.
    console.error("[api/agency/central] falha ao montar a leitura:", err);
    return NextResponse.json(
      { error: "Não foi possível carregar a leitura da operação." },
      { status: 503 },
    );
  }
}
