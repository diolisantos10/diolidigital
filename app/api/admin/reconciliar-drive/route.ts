// POST /api/admin/reconciliar-drive — O ARQUIVO CONCEDIDO QUE FICOU DE FORA.
//
// O par do `/api/admin/diagnostico-de-conexoes`: ele DETECTA (`escolhaPerdida`),
// este CONSERTA. Para cada arquivo que o Google diz que o app alcança e que não
// tem linha nesta casa, cria a linha faltante — **pendente de triagem**, com o
// papel NULO. Ver `lib/integrations/google/reconciliacao-do-drive.ts`.
//
// ── POR QUE POST, E NÃO UM `?parametro=1` NUM GET ───────────────────────────
//
// Isto ESCREVE no banco. GET é o verbo que proxy, pré-carregador e histórico de
// navegador tratam como inofensivo e repetem por conta própria. A rota irmã de
// diagnóstico exige `?carimbar=1` justamente por não ter essa opção; aqui tem.
//
// Autenticação: `Authorization: Bearer <CRON_SECRET>`, tempo constante.
// Segredo ausente do ambiente → PORTA FECHADA (503), nunca aberta.
//
// Nada é escrito no Google. Nenhum token sai daqui.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { reconciliarDrive } from "@/lib/integrations/google/reconciliacao-do-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Teto duro por chamada. Reconciliação não é varredura da casa inteira. */
const MAX_CONEXOES = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Rota administrativa não configurada — defina CRON_SECRET" }, { status: 503 });
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filtro = (new URL(request.url).searchParams.get("cliente") ?? "").trim().toLowerCase();

  const clientes = await prisma.client.findMany({ select: { id: true, name: true } }).catch(() => null);
  if (clientes === null) {
    return NextResponse.json({ error: "não consegui ler os clientes" }, { status: 500 });
  }
  const nomePorId = new Map(clientes.map((c) => [c.id, c.name]));

  const conexoes = await prisma.googleDriveConnection.findMany({ select: { id: true, clientId: true } }).catch(() => null);
  if (conexoes === null) {
    return NextResponse.json({ error: "não consegui ler as conexões do Drive" }, { status: 500 });
  }

  const alvos = conexoes
    .filter((c) => {
      if (!filtro) return true;
      const nome = (nomePorId.get(c.clientId) ?? "").toLowerCase();
      return c.clientId.toLowerCase() === filtro || nome.includes(filtro);
    })
    .slice(0, MAX_CONEXOES);

  const resultado = [];
  for (const c of alvos) {
    const r = await reconciliarDrive(c.id);
    resultado.push({ ...r, cliente: nomePorId.get(c.clientId) ?? c.clientId });
  }

  return NextResponse.json({
    ok: true,
    em: new Date().toISOString(),
    conexoesExaminadas: alvos.length,
    aviso: "Todo arquivo trazido entra PENDENTE DE TRIAGEM: papel nulo, e a trava continua recusando o uso até o cliente declarar o que ele é.",
    resultado,
  });
}
