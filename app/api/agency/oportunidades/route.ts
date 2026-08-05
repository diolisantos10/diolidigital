// ─── /api/agency/oportunidades ───────────────────────────────────────────────
//
// GET  — a fila de triagem do workspace.
// POST — a PORTA (a) do radar: alguém COLA a URL ou o texto do projeto.
//
// A porta (b) — o e-mail de alerta encaminhado — mora em `./email/route.ts` e
// cai na MESMA função de ingestão. É de propósito: dedup, extração e limite de
// tamanho valem para as duas, sem cópia de regra.
//
// ── POSSE ────────────────────────────────────────────────────────────────────
// Toda consulta filtra por `session.workspaceId`. Id de outro workspace
// responde 404, NUNCA 403: um 403 confirma que o id existe, e isso transforma a
// rota num oráculo de enumeração — dá para varrer ids e descobrir quantas
// oportunidades a agência vizinha tem. "Não encontrado" é a resposta honesta
// para quem não é dono: para ele, aquilo de fato não existe.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import {
  registrarOportunidade,
  ehStatusValido,
  CAMPOS_DE_LEITURA,
  STATUS_VALIDOS,
} from "@/lib/agency/comercial/oportunidade";

/** Teto de itens por página. A fila é para triagem humana, não para exportação;
 *  varredura grande em SQLite segura o único lock de escrita do banco. */
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const statusFiltro = params.get("status");
  const limiteBruto = Number(params.get("limite") ?? LIMITE_PADRAO);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(Math.max(Math.trunc(limiteBruto), 1), LIMITE_MAXIMO)
    : LIMITE_PADRAO;

  // Filtro de status só aceita valor do catálogo fechado. String arbitrária
  // vinda da query nunca vira predicado do banco.
  if (statusFiltro && !ehStatusValido(statusFiltro)) {
    return NextResponse.json(
      { error: `status inválido — use um de: ${STATUS_VALIDOS.join(" | ")}` },
      { status: 400 },
    );
  }

  const oportunidades = await prisma.oportunidade.findMany({
    where: { workspaceId: session.workspaceId, ...(statusFiltro ? { status: statusFiltro } : {}) },
    // Melhor nota primeiro, empate desfeito pela mais recente.
    //
    // No SQLite, NULL é o menor valor: com `desc`, as ainda NÃO AVALIADAS caem
    // para o fim da lista. Isso é uma escolha, não um acidente — e quem inverter
    // a ordenação precisa saber que "nota nula" ≠ "nota zero": a primeira é
    // "ninguém olhou ainda", a segunda é "olhou e reprovou".
    orderBy: [{ nota: "desc" }, { createdAt: "desc" }],
    take: limite,
    select: CAMPOS_DE_LEITURA,
  });

  // `textoBruto` não vai na listagem (não está em CAMPOS_DE_LEITURA): anúncio de
  // marketplace costuma trazer contato de terceiro, que é PII que não pedimos.
  return NextResponse.json({ oportunidades, total: oportunidades.length });
}

interface CorpoDeColagem {
  texto?: unknown;
  url?: unknown;
  plataforma?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  let corpo: CorpoDeColagem;
  try {
    corpo = (await request.json()) as CorpoDeColagem;
  } catch {
    return NextResponse.json({ error: "Corpo inválido — esperado JSON." }, { status: 400 });
  }

  const texto = typeof corpo.texto === "string" ? corpo.texto : "";
  const url = typeof corpo.url === "string" ? corpo.url : null;
  const plataforma = typeof corpo.plataforma === "string" ? corpo.plataforma : null;

  // ⚠️ `texto` é DADO NÃO CONFIÁVEL: veio de um anúncio escrito por um
  // desconhecido. Daqui ele segue só como matéria de extração (regex e corte de
  // string) — nunca como instrução, nunca concatenado em prompt de IA sem
  // delimitação, nunca em log.
  const resultado = await registrarOportunidade({
    workspaceId: session.workspaceId,
    porta: "colar",
    texto,
    url,
    plataforma,
  });

  if ("ok" in resultado && resultado.ok === false) {
    return NextResponse.json({ error: resultado.detalhe, motivo: resultado.motivo }, { status: 400 });
  }

  // 200 quando já existia (nada foi criado), 201 quando entrou de fato. O
  // `jaExistia` é o que a tela usa para dizer "esse projeto já está na fila" em
  // vez de fingir que registrou de novo.
  return NextResponse.json(resultado, { status: resultado.jaExistia ? 200 : 201 });
}
