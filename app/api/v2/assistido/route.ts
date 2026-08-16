// POST /api/v2/assistido — a operação assistida da agência, a um comando.
//
// Ordem do CEO (15/08/2026): allowlist por cliente parceiro, cadeia mínima,
// aprovação humana antes de qualquer coisa sair da casa. Três ações:
//
//   { acao: "ligar",  cliente: "<nome>" }        → garante o Client e vira a
//     chave v2_execucao SÓ no escopo dele (global é recusado em código).
//   { acao: "ciclo",  clienteId, solicitacao }   → roda a cadeia assistida
//     inteira e termina em card de APROVAÇÃO HUMANA — nada é publicado.
//   { acao: "status" }                           → chaves viradas + últimas
//     execuções e recusas (auditoria).
//
// Autenticação: direção logada (mesmo portão do rollout) OU o segredo de
// operação (`Bearer` com PILOTO_SECRET/CRON_SECRET) — o caminho do operador
// da sala de controle. Sem segredo configurado, o caminho por token nem abre.

import { NextRequest, NextResponse } from "next/server";
import { exigirAdministracao } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { flagLigada, FLAGS_V2, type ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";
import { virarChaveDoPiloto } from "@/lib/agency/esteira-assistida/piloto";
import { executarCicloAssistido, type DependenciasDoCiclo } from "@/lib/agency/esteira-assistida/cadeia";
import { realizarComIA } from "@/lib/agency/esteira-assistida/adaptador-de-ia";
import { armazemDeHandoffsNoBanco } from "@/lib/agency/handoff-v2/armazem-prisma";
import { createClientRequest } from "@/lib/agency/persistence/client-request-service";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

export const maxDuration = 300;

interface Corpo {
  acao?: "ligar" | "ciclo" | "status";
  cliente?: string;
  clienteId?: string;
  solicitacao?: string;
  motivo?: string;
  /** Retomar um ciclo já iniciado (o trabalho pago não se repete). */
  clientRequestId?: string;
}

async function autenticar(request: NextRequest): Promise<{ quem: string } | { erro: NextResponse }> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const segredo = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  // ⚠️ Era `cabecalho === \`Bearer ${segredo}\`` — comparação por `===` sai no
  // primeiro byte diferente e vaza o segredo por medição de tempo, byte a
  // byte (o mesmo "PIOR DOS SEIS" já corrigido em admin/reset-request e nos
  // demais pontos de PILOTO_SECRET/CRON_SECRET). `segredoConfere` compara o
  // hash em tempo constante — mesmo padrão de produto-tecnologia/cadeia e
  // agency/avisos-de-orcamento, que já protegem o MESMO par de segredos.
  const doHeader = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : null;
  if (segredo && segredoConfere(doHeader, segredo)) {
    return { quem: "operacao:sala-de-controle" };
  }
  const guarda = await exigirAdministracao("/agency/pm-command");
  if (guarda.erro) return { erro: guarda.erro };
  // FAIXA 1 do CSRF: só no caminho de SESSÃO (cookie). O caminho por segredo,
  // acima, não tem cookie — sem cookie não há CSRF a barrar.
  if (deveBloquearMutacaoCrossSite(request)) {
    return { erro: NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 }) };
  }
  return { quem: `direcao:${guarda.acesso.session.userId}` };
}

function armazemDeFlags(): ArmazemDeFlags {
  return {
    async buscar(chave, escopos) {
      const linhas = await prisma.flagV2.findMany({ where: { chave, escopo: { in: escopos } } });
      return linhas.map((l) => ({ chave: l.chave, escopo: l.escopo, ligada: l.ligada }));
    },
  };
}

const PERFIL_DA_ESTEIRA: PerfilOrganizacional = {
  autoridade: "director",
  departamentos: [],
} as PerfilOrganizacional;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await autenticar(request);
  if ("erro" in auth) return auth.erro;

  let corpo: Corpo;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (corpo.acao === "ligar") {
    const nome = corpo.cliente?.trim();
    if (!nome) return NextResponse.json({ error: "cliente é obrigatório" }, { status: 400 });
    const workspace = await prisma.agencyWorkspace.findFirst({ orderBy: { createdAt: "asc" } });
    if (!workspace) return NextResponse.json({ error: "nenhum workspace na base — a casa não abriu ainda" }, { status: 409 });
    let cliente = await prisma.client.findFirst({ where: { workspaceId: workspace.id, name: nome } });
    if (!cliente) {
      cliente = await prisma.client.create({ data: { workspaceId: workspace.id, name: nome } });
    }
    const resultado = await virarChaveDoPiloto(
      {
        escopo: cliente.id,
        motivo: corpo.motivo?.trim() || `Piloto assistido — ordem do CEO de 15/08/2026 (cliente parceiro: ${nome})`,
        decididoPor: auth.quem,
        ligar: true,
      },
      {
        async gravar(chave, escopo, ligada, motivo, decididoPor) {
          await prisma.flagV2.upsert({
            where: { chave_escopo: { chave, escopo } },
            update: { ligada, motivo, decididoPor, em: new Date() },
            create: { chave, escopo, ligada, motivo, decididoPor },
          });
        },
      },
    );
    if (!resultado.ok) return NextResponse.json({ error: resultado.motivo }, { status: 400 });
    return NextResponse.json({ ok: true, clienteId: cliente.id, cliente: cliente.name, workspaceId: workspace.id });
  }

  if (corpo.acao === "ciclo") {
    const clienteId = corpo.clienteId?.trim();
    const solicitacao = corpo.solicitacao?.trim();
    if (!clienteId || !solicitacao) {
      return NextResponse.json({ error: "clienteId e solicitacao são obrigatórios" }, { status: 400 });
    }
    const cliente = await prisma.client.findUnique({ where: { id: clienteId } });
    if (!cliente) return NextResponse.json({ error: "cliente não existe — ligue o piloto primeiro" }, { status: 404 });

    // A chave TEM que estar virada no escopo do cliente — a cadeia não abre exceção.
    const chave = await flagLigada(FLAGS_V2.execucao, [clienteId], armazemDeFlags());
    if (!chave) {
      return NextResponse.json({ error: `v2_execucao desligada para ${cliente.name} — allowlist primeiro` }, { status: 403 });
    }

    // A solicitação entra pelo caminho oficial (rastro desde a porta) — ou
    // retoma a que já entrou, quando o operador está continuando um ciclo.
    const registroDeEntrada = corpo.clientRequestId
      ? { id: corpo.clientRequestId }
      : await createClientRequest({
          workspaceId: cliente.workspaceId,
          clientId: cliente.id,
          businessName: cliente.name,
          rawContext: solicitacao,
          source: "esteira-assistida",
          status: "new",
        });

    const correlationId = `assistido:${cliente.id}:${registroDeEntrada.id}`;

    // O que já foi pago neste ciclo volta do registro, não do provedor.
    const jaGravadas = await prisma.execucaoV2.findMany({
      where: { correlationId, resultado: { not: null } },
      orderBy: { inicio: "asc" },
      select: { funcaoId: true, resultado: true },
    });
    const jaFeitos: Record<string, string> = {};
    for (const linha of jaGravadas) {
      if (linha.resultado) jaFeitos[linha.funcaoId] = linha.resultado;
    }
    const deps: DependenciasDoCiclo = {
      executor: {
        flagLigada: (chaveFlag, escopos) => flagLigada(chaveFlag, escopos, armazemDeFlags()),
        async gravarExecucao(registro) {
          await prisma.execucaoV2.create({
            data: {
              ator: registro.ator,
              usuarioId: registro.usuarioId,
              modelo: registro.modelo,
              versaoModelo: registro.versaoModelo,
              custoUsd: registro.custoUsd,
              funcaoId: registro.funcaoId,
              departamentoId: registro.departamentoId,
              ferramentas: JSON.stringify(registro.ferramentas),
              correlationId: registro.correlationId,
              inicio: registro.inicio,
              fim: registro.fim,
              resultado: registro.resultado,
              clienteId: registro.clienteId,
              entradas: registro.entradas ? JSON.stringify(registro.entradas) : null,
            },
          });
        },
        async gravarRecusa(recusa) {
          await prisma.recusaV2.create({
            data: {
              funcaoId: recusa.funcaoId,
              motivo: recusa.motivo,
              correlationId: recusa.correlationId,
              clienteId: recusa.clienteId,
              em: recusa.em,
            },
          });
        },
        realizar: realizarComIA({ workspaceId: cliente.workspaceId, clienteId: cliente.id }),
        agora: () => new Date(),
      },
      handoffs: armazemDeHandoffsNoBanco(prisma),
      perfil: PERFIL_DA_ESTEIRA,
      agora: () => new Date(),
    };

    const ciclo = await executarCicloAssistido(
      {
        clienteId: cliente.id,
        workspaceId: cliente.workspaceId,
        solicitacao,
        nomeDoCliente: cliente.name,
        correlationId,
        jaFeitos,
      },
      deps,
    );

    let approvalId: string | null = null;
    if (ciclo.ok) {
      // O fim da cadeia é GENTE: card de aprovação humana, nada publica sozinho.
      const resumo = ciclo.passos
        .map((p) => `${p.departamentoId}/${p.funcaoId}: ${p.decisao} ($${(p.custoUsd ?? 0).toFixed(4)})`)
        .join(" · ");
      const approval = await createApprovalRequest({
        clientId: cliente.id,
        department: "design",
        requestedBy: "esteira-assistida",
        clientVisible: true,
        reviewNote: `Ciclo assistido ${correlationId} — pacote da cadeia completa aguardando aprovação humana. ${resumo}`,
      });
      approvalId = approval.id;
      await prisma.clientRequestDb
        .update({ where: { id: registroDeEntrada.id }, data: { status: "in_progress" } })
        .catch(() => undefined); // status é rastro, não portão: falha aqui não derruba o ciclo
    }

    return NextResponse.json({
      ok: ciclo.ok,
      correlationId,
      clientRequestId: registroDeEntrada.id,
      passos: ciclo.passos,
      custoTotalUsd: ciclo.custoTotalUsd,
      approvalRequestId: approvalId,
      parouEm: ciclo.parouEm ?? null,
      artefatos: Object.fromEntries(
        Object.entries(ciclo.artefatos).map(([f, saida]) => [f, saida.length > 900 ? `${saida.slice(0, 900)}…` : saida]),
      ),
    });
  }

  if (corpo.acao === "status") {
    const chaves = await prisma.flagV2.findMany({ where: { chave: FLAGS_V2.execucao } });
    const execucoes = await prisma.execucaoV2.findMany({ orderBy: { inicio: "desc" }, take: 20 });
    const recusas = await prisma.recusaV2.findMany({ orderBy: { em: "desc" }, take: 20 });
    const handoffs = await prisma.handoffV2.findMany({ orderBy: { criadoEm: "desc" }, take: 20 });
    return NextResponse.json({
      chaves: chaves.map((c) => ({ escopo: c.escopo, ligada: c.ligada, motivo: c.motivo, decididoPor: c.decididoPor })),
      execucoes: execucoes.map((e) => ({
        funcaoId: e.funcaoId,
        clienteId: e.clienteId,
        ator: e.ator,
        modelo: e.modelo,
        custoUsd: e.custoUsd,
        correlationId: e.correlationId,
        inicio: e.inicio,
      })),
      recusas: recusas.map((r) => ({ funcaoId: r.funcaoId, motivo: r.motivo, clienteId: r.clienteId, em: r.em })),
      handoffs: handoffs.map((h) => ({
        de: h.deDepartamento,
        para: h.paraDepartamento,
        status: h.status,
        correlationId: h.correlationId,
      })),
    });
  }

  return NextResponse.json({ error: 'acao deve ser "ligar", "ciclo" ou "status"' }, { status: 400 });
}
