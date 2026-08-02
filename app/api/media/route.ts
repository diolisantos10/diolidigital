// POST /api/media — o cliente (ou a agência) manda um arquivo.
//
// Aceita dois portadores de identidade, e a diferença importa:
//   • `token` do portal → é o CLIENTE enviando. O dono do arquivo é derivado do
//     token, nunca do corpo da requisição. Cliente não escolhe de quem é o
//     arquivo que ele manda.
//   • sessão da agência → é a equipe enviando em nome de um cliente.
//
// Sem um dos dois, 401. Não existe upload anônimo: arquivo sem dono é arquivo
// que ninguém consegue apagar quando o cliente pedir exclusão de dados.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { guardarArquivo, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";
import { rateLimited } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Upload é caro (disco + banda). Cap por IP para um envio em massa não
  // encher o volume — que é o mesmo do banco.
  const limited = rateLimited(request, "media-upload", 20, 60_000);
  if (limited) return limited as NextResponse;

  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }

  const arquivo = form.get("file");
  if (!arquivo || !(arquivo instanceof Blob)) {
    return NextResponse.json({ error: "Nenhum arquivo recebido" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES_POR_ARQUIVO) {
    const mb = Math.round(MAX_BYTES_POR_ARQUIVO / 1024 / 1024);
    return NextResponse.json({ error: `Arquivo maior que ${mb} MB` }, { status: 413 });
  }

  const token = typeof form.get("token") === "string" ? String(form.get("token")) : "";

  // ── Quem está enviando, e de quem é o arquivo ──────────────────────────────
  let workspaceId: string | null = null;
  let clientRequestId: string | null = null;
  let clientId: string | null = null;
  let uploadedBy = "cliente";

  if (token) {
    const v = await validatePortalAccess(token);
    if (!v.valid || !v.record) return NextResponse.json({ error: "Acesso inválido ou expirado" }, { status: 401 });
    const acesso = v.record;
    // O DONO VEM DO TOKEN. Se viesse do corpo, um cliente poderia anexar um
    // arquivo à pasta de outro só mudando um campo.
    clientRequestId = acesso.clientRequestId ?? null;
    clientId = acesso.clientId ?? null;
    const req = clientRequestId
      ? await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId }, select: { workspaceId: true } })
      : null;
    workspaceId = req?.workspaceId ?? (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))?.id ?? null;
  } else {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    workspaceId = session.workspaceId;
    uploadedBy = "equipe";
    // Aqui o corpo PODE dizer de quem é: quem manda está autenticado como
    // equipe da agência e tem direito de anexar em nome do cliente.
    const cr = form.get("clientRequestId");
    const cl = form.get("clientId");
    if (typeof cr === "string" && cr) clientRequestId = cr;
    if (typeof cl === "string" && cl) clientId = cl;
  }

  if (!workspaceId) return NextResponse.json({ error: "Workspace não resolvido" }, { status: 409 });

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const nome = (arquivo as File).name || "arquivo";
  const mime = arquivo.type || "application/octet-stream";

  const r = await guardarArquivo({
    bytes, fileName: nome, mimeType: mime,
    workspaceId, clientRequestId, clientId,
    kind: "inbound", uploadedBy,
  });

  if (!r.ok) {
    // O motivo vai em linguagem de gente: quem está do outro lado é a dona do
    // salão, não um desenvolvedor lendo código de erro.
    return NextResponse.json({ error: r.motivo, codigo: r.erro }, { status: 400 });
  }
  return NextResponse.json({ ok: true, arquivo: r.arquivo }, { status: 201 });
}
