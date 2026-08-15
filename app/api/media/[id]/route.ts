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
import { escopoDoToken } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerArquivo, assinaturaValida } from "@/lib/agency/media/armazenamento";

export const dynamic = "force-dynamic";

/** Imagem o navegador pode desenhar na tela. O resto vai como download — um
 *  arquivo servido "inline" do nosso domínio é superfície de ataque.
 *
 *  `image/svg+xml` está fora DE PROPÓSITO, mesmo sendo imagem e mesmo sendo
 *  gerado por nós: SVG é XML com `<script>` permitido. Baixado, é um arquivo
 *  que o cliente abre no Illustrator; aberto inline, seria script executando
 *  com a nossa origem e a sessão do usuário logado. */
const PODE_ABRIR_NA_TELA = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token")) ?? "";

  const registro = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── O dono ────────────────────────────────────────────────────────────────
  let autorizado = false;

  // Link assinado: o único caminho sem sessão nem token de portal. Existe porque
  // a Meta busca a mídia com os servidores DELA, e não tem como carregar um
  // token nosso. É assinado e expira em minutos — não é arquivo aberto ao mundo.
  const exp = request.nextUrl.searchParams.get("exp");
  const sig = request.nextUrl.searchParams.get("sig");
  if (sig && assinaturaValida(id, exp, sig)) {
    autorizado = true;
  } else if (token) {
    // 🔴 RODADA 3: casava por `acesso.clientRequestId` — o ponteiro cru. Com a
    // solicitação re-apontada, o probe do `seguranca` recebeu 410 ("arquivo
    // indisponível no armazenamento") em vez de 403 — ou seja, **AUTORIZOU** o
    // arquivo de outro cliente; só faltou o byte no disco do fixture.
    const escopo = await escopoDoToken(token);
    if (escopo.ok) {
      autorizado =
        escopo.clientId === registro.clientId ||
        (!!registro.clientRequestId && escopo.clientRequestIds.includes(registro.clientRequestId));
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
