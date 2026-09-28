// GET /api/integracoes/cityjobs/posts/{idExterno} — contrato §3.
//
// Mesmo esquema de auth do POST (HMAC, §1) — o GET assina o CORPO VAZIO:
// `<timestamp>.` (string assinada com corpo = string vazia), exatamente
// como o contrato pede. `idExterno` vem da URL, nunca do corpo (não há
// corpo).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { conferirAssinatura } from "@/lib/integracoes/cityjobs/assinatura";
import { rateLimit } from "@/lib/security/rate-limit";
import { consultarPost } from "@/lib/integracoes/cityjobs/posts";

export const dynamic = "force-dynamic";
/** Mesmo teto do POST (`../route.ts`, `LIMITE_POR_MINUTO`) — é a MESMA
 *  credencial, o teto é por ela, não por endpoint. Duplicado aqui (em vez de
 *  importado) de propósito: um `route.ts` só deveria exportar os métodos
 *  HTTP e a config de rota — importar um valor de outro `route.ts` acopla os
 *  dois arquivos a uma convenção que o App Router não garante. */
const LIMITE_POR_MINUTO = 60;
const JANELA_DO_LIMITE_MS = 60_000;

function envelope(erro: string, motivo: string, idExterno?: string) {
  return { erro, motivo, ...(idExterno ? { idExterno } : {}) };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ idExterno: string }> },
): Promise<NextResponse> {
  const { idExterno } = await context.params;

  const limite = rateLimit("cityjobs:posts", LIMITE_POR_MINUTO, JANELA_DO_LIMITE_MS);
  if (!limite.allowed) {
    return NextResponse.json(
      envelope("requisicoes_por_minuto", `mais de ${LIMITE_POR_MINUTO} requisições por minuto para esta credencial`, idExterno),
      { status: 429, headers: { "Retry-After": String(limite.retryAfter) } },
    );
  }

  // GET assina o corpo VAZIO — contrato §3.
  const veredito = conferirAssinatura({
    timestampHeader: req.headers.get("x-dioli-timestamp"),
    corpoBruto: "",
    assinaturaHeader: req.headers.get("x-dioli-assinatura"),
  });
  if (!veredito.ok) {
    if (veredito.motivo === "sem_segredo_configurado") {
      return NextResponse.json(
        envelope("hmac_nao_configurado", "CITYJOBS_HMAC_SEGREDO não está configurado nesta instância", idExterno),
        { status: 503 },
      );
    }
    const mensagem = veredito.motivo === "timestamp_fora_da_janela"
      ? "X-Dioli-Timestamp fora da janela de 5 minutos"
      : "a assinatura não bateu com nenhum segredo vigente";
    return NextResponse.json(envelope(veredito.motivo, mensagem, idExterno), { status: 401 });
  }

  const cityJobsClientId = (process.env.CITYJOBS_CLIENT_ID ?? "").trim();
  if (!cityJobsClientId) {
    return NextResponse.json(
      envelope("cityjobs_client_id_nao_configurado", "CITYJOBS_CLIENT_ID não está configurado", idExterno),
      { status: 503 },
    );
  }
  const cliente = await prisma.client.findUnique({ where: { id: cityJobsClientId }, select: { id: true } });
  if (!cliente) {
    return NextResponse.json(
      envelope("cityjobs_client_id_nao_configurado", "o CITYJOBS_CLIENT_ID configurado não corresponde a nenhum cliente", idExterno),
      { status: 503 },
    );
  }

  const post = await consultarPost(cliente.id, idExterno);
  if (!post) {
    return NextResponse.json(envelope("nao_encontrado", "nenhum post com esta idExterno para este cliente", idExterno), { status: 404 });
  }
  return NextResponse.json(post, { status: 200 });
}
