// POST /api/v2/assistido — a operação assistida da agência, a um comando.
//
// Ordem do CEO (15/08/2026): allowlist por cliente parceiro, cadeia mínima,
// aprovação humana antes de qualquer coisa sair da casa. Três ações:
//
//   { acao: "ligar",  cliente: "<nome>" }        → garante o Client e vira a
//     chave v2_execucao SÓ no escopo dele (global é recusado em código).
//   { acao: "ligar_agencia" }                    → vira a chave no escopo do
//     WORKSPACE. É a forma que sobrevive ao reset e a cliente novo — ver
//     `lib/agency/esteira-assistida/autorizacao.ts` para o porquê inteiro.
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
import { flagLigada, FLAGS_V2, type ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";
import { virarChaveDoPiloto } from "@/lib/agency/esteira-assistida/piloto";
import { esteiraAutorizada } from "@/lib/agency/esteira-assistida/autorizacao";
import { registrarRecusaVisivel, AUTORIZACAO_DA_ESTEIRA } from "@/lib/agency/esteira-assistida/recusa-visivel";
import { executarCicloAssistido, type DependenciasDoCiclo } from "@/lib/agency/esteira-assistida/cadeia";
import { resumoDoPacote } from "@/lib/agency/esteira-assistida/varredura";
import { realizarComIA } from "@/lib/agency/esteira-assistida/adaptador-de-ia";
import { armazemDeHandoffsNoBanco } from "@/lib/agency/handoff-v2/armazem-prisma";
import { createClientRequest } from "@/lib/agency/persistence/client-request-service";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

export const maxDuration = 300;

interface Corpo {
  acao?: "ligar" | "ligar_agencia" | "ciclo" | "status";
  cliente?: string;
  clienteId?: string;
  solicitacao?: string;
  motivo?: string;
  /** Só em `ligar_agencia`: `false` DESLIGA a esteira da casa (o rollback). */
  ligar?: boolean;
  /** Retomar um ciclo já iniciado (o trabalho pago não se repete). */
  clientRequestId?: string;
}

/**
 * ⚠️ A AUTENTICAÇÃO DEVOLVE A AGÊNCIA, e isso é conserto do G-4.
 *
 * As três ações operavam sobre `agencyWorkspace.findFirst({ orderBy:
 * createdAt asc })` — a agência MAIS ANTIGA DA BASE, não a de quem está
 * logado. Numa base com duas agências, o PM da segunda ligava a esteira da
 * primeira, e a leitura de status mostrava a fila da primeira.
 *
 * O caminho por SEGREDO (a sala de controle) não tem sessão, e por isso ele
 * continua caindo na agência mais antiga — mas agora isso está DECLARADO, e a
 * resposta diz sobre qual agência agiu. Ambiguidade escrita é diferente de
 * ambiguidade silenciosa.
 */
async function autenticar(
  request: NextRequest,
): Promise<{ quem: string; workspaceId: string | null } | { erro: NextResponse }> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const segredo = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  if (segredo && cabecalho === `Bearer ${segredo}`) {
    return { quem: "operacao:sala-de-controle", workspaceId: null };
  }
  const guarda = await exigirAdministracao("/agency/pm-command");
  if (guarda.erro) return { erro: guarda.erro };
  return {
    quem: `direcao:${guarda.acesso.session.userId}`,
    workspaceId: guarda.acesso.session.workspaceId,
  };
}

/** A agência de quem pediu. Sessão manda; segredo cai na mais antiga, declarado. */
async function agenciaDoPedido(auth: { workspaceId: string | null }) {
  if (auth.workspaceId) return prisma.agencyWorkspace.findUnique({ where: { id: auth.workspaceId } });
  return prisma.agencyWorkspace.findFirst({ orderBy: { createdAt: "asc" } });
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
    const workspace = await agenciaDoPedido(auth);
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

  // ─── LIGAR A ESTEIRA DA AGÊNCIA INTEIRA ──────────────────────────────────
  //
  // A allowlist por `clientId` quebrava a cada reset e a cada cliente novo, e
  // quebrava CALADA: o CityJobs foi recadastrado com id novo, nasceu fora da
  // lista e o motor recusou em silêncio. O escopo do WORKSPACE sobrevive ao
  // ciclo de vida do cliente — o reset não apaga `AgencyWorkspace` nem
  // `FlagV2`. O motivo completo mora em `esteira-assistida/autorizacao.ts`.
  if (corpo.acao === "ligar_agencia") {
    const workspace = await agenciaDoPedido(auth);
    if (!workspace) return NextResponse.json({ error: "nenhum workspace na base — a casa não abriu ainda" }, { status: 409 });
    const resultado = await virarChaveDoPiloto(
      {
        escopo: workspace.id,
        motivo: corpo.motivo?.trim() || "Esteira automática da agência ligada — a autorização passa a ser por agência (16/08/2026)",
        decididoPor: auth.quem,
        ligar: corpo.ligar === false ? false : true,
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
    return NextResponse.json({ ok: true, escopo: "agencia", workspaceId: workspace.id, ligada: corpo.ligar !== false });
  }

  if (corpo.acao === "ciclo") {
    const clienteId = corpo.clienteId?.trim();
    const solicitacao = corpo.solicitacao?.trim();
    if (!clienteId || !solicitacao) {
      return NextResponse.json({ error: "clienteId e solicitacao são obrigatórios" }, { status: 400 });
    }
    const cliente = await prisma.client.findUnique({ where: { id: clienteId } });
    // POSSE, não só existência (G-4): um `clienteId` de outra agência rodava a
    // cadeia inteira — gasto de IA numa base alheia e um card lá dentro. Erro
    // idêntico ao de cliente inexistente, de propósito: dizer "existe, mas não
    // é seu" confirma para quem sondou que o id é válido.
    if (!cliente || (auth.workspaceId && cliente.workspaceId !== auth.workspaceId)) {
      return NextResponse.json({ error: "cliente não existe — ligue o piloto primeiro" }, { status: 404 });
    }

    // A chave TEM que estar virada — no cliente OU na agência. A cadeia não
    // abre exceção; o que mudou é o ESCOPO que vale (16/08/2026).
    //
    // ⚠️ E a recusa DEIXOU DE SER MUDA. Antes, este 403 devolvia HTTP e não
    // gravava nada: o sistema sabia exatamente o motivo e não contava a
    // ninguém. Custou meia hora do CEO achando que era defeito do produto.
    const autorizacao = await esteiraAutorizada(
      { clienteId, workspaceId: cliente.workspaceId, nomeDoCliente: cliente.name },
      armazemDeFlags(),
    );
    if (!autorizacao.autorizada) {
      await registrarRecusaVisivel(
        { criar: (dados) => prisma.recusaV2.create({ data: { ...dados, clienteId: dados.clienteId ?? null } }) },
        {
          funcaoId: AUTORIZACAO_DA_ESTEIRA,
          motivo: autorizacao.motivo,
          correlationId: `porta:${clienteId}`,
          clienteId,
          workspaceId: cliente.workspaceId,
          em: new Date(),
        },
      );
      return NextResponse.json({ error: autorizacao.motivo }, { status: 403 });
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
      // Mesmo conserto do caminho automático (B-1/G-1): o pacote para num
      // humano DA AGÊNCIA, e a nota não leva custo nem id interno. Este
      // caminho também levava o `correlationId` para dentro do card.
      const approval = await createApprovalRequest({
        clientId: cliente.id,
        department: "design",
        requestedBy: "esteira-assistida",
        clientVisible: false,
        reviewNote: `Esteira assistida — pacote aguardando revisão da AGÊNCIA antes de ir ao cliente. ${resumoDoPacote(ciclo.passos)}`,
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
    // ESCOPADO (G-5): o motivo de uma recusa carrega o nome do negócio do lead.
    // Sem filtro, esta rota entregava a fila comercial de todas as agências da
    // base a quem tivesse sessão em qualquer uma delas.
    const ws = auth.workspaceId;
    const doEscopo = ws ? { workspaceId: ws } : {};
    const chaves = await prisma.flagV2.findMany({
      where: { chave: FLAGS_V2.execucao, ...(ws ? { escopo: ws } : {}) },
    });
    const idsDaCasa = ws
      ? (await prisma.client.findMany({ where: { workspaceId: ws }, select: { id: true } })).map((c) => c.id)
      : null;
    const execucoes = await prisma.execucaoV2.findMany({
      where: idsDaCasa ? { clienteId: { in: idsDaCasa } } : {},
      orderBy: { inicio: "desc" }, take: 20,
    });
    const recusas = await prisma.recusaV2.findMany({ where: doEscopo, orderBy: { em: "desc" }, take: 20 });
    const handoffs = await prisma.handoffV2.findMany({ where: doEscopo, orderBy: { criadoEm: "desc" }, take: 20 });
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
