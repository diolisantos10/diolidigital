// POST /api/integracoes/cityjobs/posts — o endpoint do contrato §3.
//
// Auth = HMAC (contrato §1), NUNCA sessão — é servidor-a-servidor, sem
// navegador, sem CSRF a conferir. Rate limit por FONTE (§9: 60/min), não por
// IP — a mesma origem chama sempre, e um IP compartilhado (proxy do City
// Jobs) não pode diluir o teto de quem realmente é dono da credencial.
//
// ── A ORDEM DAS CONFERÊNCIAS, E POR QUE ESTA ORDEM ──────────────────────────
//
//   1. corpo BRUTO capturado como texto, COM TETO (contrato §9: 256 KB) —
//      ANTES de qualquer JSON.parse (a assinatura é sobre os bytes exatos,
//      contrato §1.2) e ANTES de bufferizar mais do que o teto permite (ver
//      `lib/security/corpo-limitado.ts` — sem isto, um corpo arbitrariamente
//      grande gastava memória/CPU do processo antes de qualquer conferência,
//      inclusive antes do rate limit abaixo);
//   2. rate limit — barato, e barra abuso antes de gastar CPU com HMAC;
//   3. assinatura HMAC — nunca aceita nada sem ela, mesmo que o corpo seja
//      válido; sem segredo configurado → 503 (nunca 401: a rota está mal
//      configurada, o City Jobs não errou);
//   4. Content-Type — só então vale a pena olhar o que tem dentro;
//   5. `CITYJOBS_CLIENT_ID` — a MARCA vem do AMBIENTE, nunca do campo
//      `marca` do corpo. Confiar no corpo para escolher o cliente de
//      destino permitiria a qualquer chamador que soubesse o segredo (ou
//      pior, um segredo vazado) publicar na conta de OUTRO cliente da casa
//      só mudando uma string — a mesma classe de furo que a trava de
//      publicação (`trava-de-publicacao.ts`) já fecha para o resto da
//      esteira. Aqui ela é fechada na porta de entrada.
//   6. só então `receberPost` (idempotência, mídia, agendamento, aprovação).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { conferirAssinatura } from "@/lib/integracoes/cityjobs/assinatura";
import { rateLimit } from "@/lib/security/rate-limit";
import { lerCorpoComTeto } from "@/lib/security/corpo-limitado";
import { receberPost } from "@/lib/integracoes/cityjobs/posts";

export const dynamic = "force-dynamic";

/** Contrato §9: "Requisições por minuto por credencial". O GET de consulta
 *  (`[idExterno]/route.ts`) duplica o mesmo número — é a MESMA credencial, o
 *  teto é por ela, não por endpoint (ver o comentário lá sobre por que não
 *  é importado em vez de duplicado). */
const LIMITE_POR_MINUTO = 60;
const JANELA_DO_LIMITE_MS = 60_000;

/** Contrato §9: "Corpo JSON (sem mídia embutida): 256 KB". Aplicado ANTES de
 *  bufferizar — ver `lib/security/corpo-limitado.ts`. */
const LIMITE_DO_CORPO_BYTES = 256 * 1024;

function envelope(erro: string, motivo: string, idExterno?: string) {
  return { erro, motivo, ...(idExterno ? { idExterno } : {}) };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. O corpo BRUTO, antes de qualquer parse — com TETO (contrato §9),
  // aplicado ANTES de bufferizar (nunca depois de já ter lido tudo).
  const lido = await lerCorpoComTeto(req, LIMITE_DO_CORPO_BYTES);
  if (!lido.ok) {
    return NextResponse.json(
      envelope("corpo_grande_demais", `o corpo excede o teto de ${LIMITE_DO_CORPO_BYTES} bytes (contrato §9): ${lido.motivo}`),
      { status: 413 },
    );
  }
  const corpoBruto = lido.texto;

  // 2. Rate limit — por credencial (fonte fixa "cityjobs" nesta leva).
  const limite = rateLimit("cityjobs:posts", LIMITE_POR_MINUTO, JANELA_DO_LIMITE_MS);
  if (!limite.allowed) {
    return NextResponse.json(
      envelope("requisicoes_por_minuto", `mais de ${LIMITE_POR_MINUTO} requisições por minuto para esta credencial`),
      { status: 429, headers: { "Retry-After": String(limite.retryAfter) } },
    );
  }

  // 3. HMAC — contrato §1.
  const veredito = conferirAssinatura({
    timestampHeader: req.headers.get("x-dioli-timestamp"),
    corpoBruto,
    assinaturaHeader: req.headers.get("x-dioli-assinatura"),
  });
  if (!veredito.ok) {
    if (veredito.motivo === "sem_segredo_configurado") {
      // Config ausente na CASA, não erro do City Jobs — 503, não 401.
      return NextResponse.json(
        envelope("hmac_nao_configurado", "CITYJOBS_HMAC_SEGREDO não está configurado nesta instância — não posso conferir nenhuma assinatura"),
        { status: 503 },
      );
    }
    const status = 401;
    return NextResponse.json(envelope(veredito.motivo, mensagemDaRecusaDeAssinatura(veredito.motivo)), { status });
  }

  // 4. Content-Type — multipart ainda não implementado nesta leva (ver o
  // relato final: gap declarado, não escondido).
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json(
      envelope(
        "content_type_nao_suportado",
        contentType?.startsWith("multipart/form-data")
          ? "upload multipart ainda não está implementado nesta leva — envie midia.tipo = \"url\""
          : `Content-Type "${contentType || "ausente"}" não é suportado — use application/json`,
      ),
      { status: 415 },
    );
  }

  let corpoJson: unknown;
  try {
    corpoJson = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json(envelope("campo_invalido", "corpo não é um JSON válido"), { status: 400 });
  }

  // 5. A MARCA vem do AMBIENTE — nunca do corpo. Ver o cabeçalho.
  const cityJobsClientId = (process.env.CITYJOBS_CLIENT_ID ?? "").trim();
  if (!cityJobsClientId) {
    return NextResponse.json(
      envelope("cityjobs_client_id_nao_configurado", "CITYJOBS_CLIENT_ID não está configurado — não sei em qual cliente publicar"),
      { status: 503 },
    );
  }
  const cliente = await prisma.client.findUnique({ where: { id: cityJobsClientId }, select: { id: true, workspaceId: true } });
  if (!cliente) {
    return NextResponse.json(
      envelope("cityjobs_client_id_nao_configurado", "o CITYJOBS_CLIENT_ID configurado não corresponde a nenhum cliente"),
      { status: 503 },
    );
  }

  // 6. A orquestração.
  const resultado = await receberPost({ corpoBruto: corpoJson, workspaceId: cliente.workspaceId, clientId: cliente.id });
  return NextResponse.json(resultado.corpo, { status: resultado.http });
}

function mensagemDaRecusaDeAssinatura(motivo: "timestamp_fora_da_janela" | "assinatura_invalida"): string {
  return motivo === "timestamp_fora_da_janela"
    ? "X-Dioli-Timestamp fora da janela de 5 minutos"
    : "a assinatura não bateu com nenhum segredo vigente";
}
