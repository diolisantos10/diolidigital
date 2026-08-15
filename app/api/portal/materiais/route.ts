// GET /api/portal/materiais — o material de marca que o cliente JÁ mandou.
//
// A metade que faltava do envio: `EnvioDeMaterial` mostrava o que subiu no
// estado do React, e recarregar a página apagava a lista. Para quem está do
// outro lado, isso é indistinguível de ter perdido o arquivo.
//
// ── O DONO VEM DO TOKEN. SEMPRE. ────────────────────────────────────────────
//
// Não existe `clientId` de query nem de corpo neste arquivo — nem para ler.
// `resolvePortalClient` deriva cliente E workspace do token do portal, e o
// `where` da consulta é montado com o que ELE devolveu.
//
// Derivar em vez de comparar não é preciosismo: `findMany({ where: { clientId }})`
// com o id derivado não tem como devolver o arquivo de outro cliente, aconteça o
// que acontecer no resto do arquivo. Buscar largo e filtrar depois num `if`
// funciona até alguém acrescentar um `return` antes do `if` — e aí o material de
// um cliente aparece no portal de outro, que é o dano que não se desfaz.
//
// E quando o token não resolve: **401 sem dizer o que existe.** Nenhuma resposta
// desta rota distingue "este cliente não existe" de "não é seu" — a distinção já
// é o vazamento.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import {
  montarMateriaisDaMarca,
  DEPARTAMENTO_DO_BRAND_BOOK,
  type AnaliseGuardada,
} from "@/lib/agency/brand/materiais-da-marca";

export const dynamic = "force-dynamic";

/** Teto de leitura. O portal é uma tela, não um exportador de acervo. */
const TETO = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(req, req.nextUrl.searchParams.get("token")) ?? "";
  if (!token) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 401 });

  // ── "NÃO ACHEI" É DIFERENTE DE "NÃO CONSEGUI OLHAR" ───────────────────────
  // Um `.catch(() => [])` aqui faria uma falha de leitura sair na tela como o
  // fato "você não mandou nada" — e o cliente reenviaria tudo. A falha é
  // nomeada e sobe como indisponibilidade, que é o que ela é.
  let leituraFalhou = false;

  const linhas = await prisma.driveMaterial.findMany({
    // Pasta não é material (ver a trava em escolha-de-material.ts): mostrá-la
    // aqui faria o cliente contar como enviado o que a casa não consegue abrir.
    where: { clientId: dono.clientId, ehPasta: false },
    orderBy: { escolhidoEm: "desc" },
    take: TETO,
  }).catch((e) => {
    console.error("[portal/materiais] não consegui ler os materiais:", e instanceof Error ? e.message : e);
    leituraFalhou = true;
    return [];
  });

  // O estado da análise do brand book mora onde a casa já guarda o que concluiu
  // sobre um cliente. Tabela nova para isto seria a sexta porta que
  // docs/branding-na-ficha-do-cliente.md mandou fechar.
  const analises = await prisma.brainArtifact.findMany({
    where: { clientId: dono.clientId, department: DEPARTAMENTO_DO_BRAND_BOOK },
    orderBy: { createdAt: "desc" },
    take: TETO,
  }).catch((e) => {
    console.error("[portal/materiais] não consegui ler as análises:", e instanceof Error ? e.message : e);
    leituraFalhou = true;
    return [];
  });

  if (leituraFalhou) {
    return NextResponse.json({
      error: "Não consegui listar seus materiais agora. Eles não se perderam — avise a equipe se isto continuar.",
      indisponivel: true,
    }, { status: 503 });
  }

  // Uma análise por material: a mais recente ganha. Ordenado por `createdAt`
  // desc acima, o primeiro que o mapa vê já é o vigente.
  const porMaterial = new Map<string, AnaliseGuardada>();
  for (const a of analises) {
    if (porMaterial.has(a.canvasId)) continue;
    let erro: string | null = null;
    let naoLido: string[] = [];
    try {
      const c = JSON.parse(a.canvasJson || "{}") as { erro?: unknown; naoLido?: unknown };
      if (typeof c.erro === "string") erro = c.erro;
      if (Array.isArray(c.naoLido)) naoLido = c.naoLido.map(String);
    } catch { /* canvas ilegível não pode derrubar a lista do cliente */ }
    porMaterial.set(a.canvasId, {
      materialId: a.canvasId,
      status: a.status,
      erro,
      // O que a casa não conseguiu abrir de dentro do arquivo vai para a tela.
      naoLido,
      atualizadoEm: a.createdAt,
    });
  }

  const materiais = montarMateriaisDaMarca(
    linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      mimeType: l.mimeType,
      tamanhoBytes: l.tamanhoBytes,
      papel: l.papel,
      papelConfirmadoEm: l.papelConfirmadoEm,
      mediaAssetId: l.mediaAssetId,
      erro: l.erro,
      escolhidoEm: l.escolhidoEm,
    })),
    [...porMaterial.values()],
  );

  return NextResponse.json({ ok: true, materiais });
}
