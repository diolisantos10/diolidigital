// POST /api/produto-tecnologia/cadeia — a agência conserta a si mesma, a um comando.
//
// ORDEM DO CEO, 16/08/2026, olhando o organograma: *"olha o tanto de agente que
// tem nesse lugar que pode fazer isso"* — e depois, com todas as letras,
// *"delega isso pro departamento de tecnologia e produto corrigir imediatamente"*.
//
// O 12º departamento tinha sete fichas, sala e permissões desde 15/08 e nada
// que convertesse a saída delas em trabalho. `cadeia-tecnica.ts` construiu o
// motor; esta rota é a chave. Duas ações:
//
//   { acao: "rodar", demanda, contexto, criteriosDeAceite }  → roda a cadeia
//     mínima (orquestrador → arquiteto → engenheiro) e devolve os artefatos e
//     as PROPOSTAS de patch. Nada é aplicado, nada é publicado.
//   { acao: "status" }                                       → as últimas
//     execuções e recusas do departamento, para auditoria.
//
// ─── AS TRAVAS, E NENHUMA DELAS MORA AQUI ───────────────────────────────────
//
// Esta rota não decide nada: ela monta as dependências e chama. Quem recusa é
// o executor V2 (entradas, ferramentas, teto de custo, gatilho humano, timeout)
// e a guarda de patch. Rota que abre exceção é rota que vira a porta dos fundos
// da trava — então aqui não há um único `if` que libere passagem.
//
// ─── HOMOLOGAÇÃO, DECLARADA NA RESPOSTA ─────────────────────────────────────
//
// As sete fichas estão `ativa: false` e o CI reprova quem ligar função fora da
// allowlist do CEO. A cadeia roda em homologação, e a resposta DIZ isso em vez
// de deixar o operador supor que é produção. Piloto que se apresenta como
// pronto é o defeito que custou a noite de 15/08.
//
// Autenticação: direção logada OU o segredo de operação (`Bearer` com
// PILOTO_SECRET/CRON_SECRET). Sem segredo configurado, o caminho por token nem
// abre — ausência de chave nunca vira porta aberta.

import { NextRequest, NextResponse } from "next/server";
import { exigirAdministracao } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import {
  CADEIA_TECNICA_MINIMA,
  executarCadeiaTecnica,
  type DependenciasDaCadeiaTecnica,
} from "@/lib/agency/produto-tecnologia/cadeia-tecnica";
import { realizarTecnicoComIA } from "@/lib/agency/produto-tecnologia/adaptador-tecnico";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Corpo {
  acao?: "rodar" | "status";
  demanda?: string;
  contexto?: string;
  criteriosDeAceite?: string;
  /** Retomar uma demanda já iniciada — trabalho pago uma vez não se paga duas. */
  correlationId?: string;
}

/**
 * O perfil do departamento, não o de um diretor. `podeExecutarFuncao` permite
 * porque `product-technology` é o dono das sete funções — e NEGA qualquer
 * função de outro departamento, que é o ponto: a engenharia não vira atalho
 * para despachar o Social.
 */
const PERFIL_DO_DEPARTAMENTO: PerfilOrganizacional = {
  autoridade: "department_member",
  departamentos: ["product-technology"],
};

async function autenticar(request: NextRequest): Promise<{ quem: string } | { erro: NextResponse }> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const segredo = process.env.PILOTO_SECRET || process.env.CRON_SECRET;
  const doHeader = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : null;
  if (segredo && segredoConfere(doHeader, segredo)) {
    return { quem: "operacao:sala-de-controle" };
  }
  const guarda = await exigirAdministracao("/agency/produto-tecnologia");
  if (guarda.erro) return { erro: guarda.erro };
  return { quem: `direcao:${guarda.acesso.session.userId}` };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await autenticar(request);
  if ("erro" in auth) return auth.erro;

  let corpo: Corpo;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (corpo.acao === "status") {
    const [execucoes, recusas] = await Promise.all([
      prisma.execucaoV2.findMany({
        where: { departamentoId: "product-technology" },
        orderBy: { inicio: "desc" },
        take: 30,
        select: { funcaoId: true, ator: true, modelo: true, custoUsd: true, correlationId: true, inicio: true, fim: true },
      }),
      prisma.recusaV2.findMany({ orderBy: { em: "desc" }, take: 30 }),
    ]);
    return NextResponse.json({
      modo: "homologacao",
      cadeia: CADEIA_TECNICA_MINIMA,
      execucoes,
      // A recusa não tem departamento na tabela; filtrar por função da cadeia é
      // o que dá para fazer sem migração — e migração não é assunto desta peça.
      recusas: recusas.filter((r) => CADEIA_TECNICA_MINIMA.includes(r.funcaoId)),
    });
  }

  if (corpo.acao !== "rodar") {
    return NextResponse.json({ error: 'acao deve ser "rodar" ou "status"' }, { status: 400 });
  }

  const demanda = corpo.demanda?.trim() ?? "";
  const contexto = corpo.contexto?.trim() ?? "";
  const criteriosDeAceite = corpo.criteriosDeAceite?.trim() ?? "";
  if (!demanda || !contexto || !criteriosDeAceite) {
    return NextResponse.json(
      { error: "demanda, contexto e criteriosDeAceite são obrigatórios — sem critério de aceite a ficha recusa, e deve" },
      { status: 400 },
    );
  }

  // O correlationId é o fio do rastro: mesmo id = mesma demanda, e o que já foi
  // pago volta do banco em vez de ser pago de novo.
  const correlationId = corpo.correlationId?.trim() || `tecnica:${Date.now()}`;
  const jaGravadas = await prisma.execucaoV2.findMany({
    where: { correlationId, resultado: { not: null } },
    orderBy: { inicio: "asc" },
    select: { funcaoId: true, resultado: true },
  });
  const jaFeitos: Record<string, string> = {};
  for (const linha of jaGravadas) {
    if (linha.resultado) jaFeitos[linha.funcaoId] = linha.resultado;
  }

  const workspace = await prisma.agencyWorkspace.findFirst({ orderBy: { createdAt: "asc" } });

  const deps: DependenciasDaCadeiaTecnica = {
    perfil: PERFIL_DO_DEPARTAMENTO,
    agora: () => new Date(),
    executor: {
      // Homologação não consulta flag. Fica `false` de propósito: se um dia
      // alguém trocar o modo para produção sem decisão registrada, a cadeia
      // recusa em vez de rodar por acidente.
      flagLigada: async () => false,
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
      realizar: realizarTecnicoComIA({ workspaceId: workspace?.id }),
      agora: () => new Date(),
    },
  };

  const resultado = await executarCadeiaTecnica(
    { demanda, contexto, criteriosDeAceite, correlationId, jaFeitos },
    deps,
  );

  return NextResponse.json({
    ok: resultado.ok,
    // Declarado, não subentendido: isto é ensaio, e as fichas seguem desligadas.
    modo: "homologacao",
    aviso: "as sete fichas estão `ativa: false` — ligar em produção é decisão registrada do dono, nunca efeito de deploy",
    correlationId,
    pedidoPor: auth.quem,
    passos: resultado.passos,
    custoTotalUsd: resultado.custoTotalUsd,
    parouEm: resultado.parouEm ?? null,
    // A proposta vai INTEIRA: patch cortado não se revisa nem se aplica.
    propostas: resultado.propostas.map((p) => ({
      funcaoId: p.funcaoId,
      arquivos: p.guarda.arquivos,
      avisos: p.guarda.avisos,
      patch: p.patch,
      aplicado: false,
    })),
    artefatos: Object.fromEntries(
      Object.entries(resultado.artefatos).map(([f, saida]) => [f, saida.length > 4000 ? `${saida.slice(0, 4000)}…` : saida]),
    ),
  });
}
