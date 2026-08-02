// GET /api/media/[id] — serve um arquivo, conferindo o dono.
//
// A regra de segurança aqui é DERIVAÇÃO, não comparação: o requisitante prova
// quem é (token do portal ou sessão), e a busca no banco já embute o dono. Não
// existe caminho em que um id de arquivo sozinho devolva conteúdo.
//
// E devolve 404 — nunca 403 — quando o arquivo existe mas é de outro dono: 403
// confirmaria que aquele id existe, e isso já é informação demais.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { lerArquivo } from "@/lib/agency/media/armazenamento";

export const dynamic = "force-dynamic";

/** Imagem o navegador pode desenhar na tela. O resto vai como download — um
 *  arquivo servido "inline" do nosso domínio é superfície de ataque. */
const PODE_ABRIR_NA_TELA = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const registro = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── O dono ────────────────────────────────────────────────────────────────
  let autorizado = false;
  if (token) {
    const v = await validatePortalAccess(token);
    if (v.valid && v.record) {
      const acesso = v.record;
      autorizado =
        (!!acesso.clientRequestId && acesso.clientRequestId === registro.clientRequestId) ||
        (!!acesso.clientId && acesso.clientId === registro.clientId);
    }
  } else {
    const session = await getSession();
    // A equipe vê o que é do workspace dela — e só dele.
    if (session) autorizado = session.workspaceId === registro.workspaceId;
  }
  // 404, não 403: negar existência é mais seguro que negar permissão.
  if (!autorizado) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bytes = await lerArquivo(registro.storagePath);
  if (!bytes) {
    // O registro existe e o byte não. É um estado real (volume trocado, restore
    // parcial) e precisa ser dito, não escondido atrás de um 404 genérico.
    return NextResponse.json({ error: "Arquivo indisponível no armazenamento" }, { status: 410 });
  }

  const inline = PODE_ABRIR_NA_TELA.has(registro.mimeType);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": registro.mimeType,
      "Content-Length": String(registro.sizeBytes),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(registro.fileName)}"`,
      // Sem isto, um arquivo com MIME mentiroso vira execução no nosso domínio.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
