// /api/meta/ativos — A ESCOLHA DA AGÊNCIA, NA TELA DA AGÊNCIA.
//
// ─── POR QUE ESTA ROTA EXISTE ───────────────────────────────────────────────
//
// Em 06/08/2026 fechamos o fluxo do CLIENTE: o portal pergunta quais contas a
// Dioli pode usar, e nada é gravado sem a marcação dele. A perícia contra o
// banco de PRODUÇÃO, no mesmo dia, mostrou que o dano real veio pela OUTRA
// porta: as 19 conexões de terceiros — Sushi Cazza, Dilee, Kero Shop, Acesso
// Beleza, santioh_, dilix.br, queise, Santioh Europe, Spa da Mente, City Jobs
// SP — entraram em 03/08 às 14:05 pelo TOKEN COLADO da agência, que gravava
// tudo que o token alcançava.
//
// Esta é a metade que faltava: **o operador escolhe o que a agência administra.**
// Mesma regra, mesmo mecanismo (`lib/integrations/meta/escolha-de-ativos.ts`),
// mesma frase de "falta escolher". Um segundo mecanismo divergiria — e o
// incidente voltaria pela porta que ninguém está olhando.
//
// ─── AS TRÊS REGRAS ─────────────────────────────────────────────────────────
//
// 1. **DONO DERIVADO.** Aqui o dono é a própria agência: `clientId = null`,
//    sempre, fixo no código. Esta rota NÃO lê `clientId` de query nem de corpo
//    — quem quiser escolher por um cliente usa o portal DELE. Aceitar um
//    `clientId` aqui seria a agência assinando o consentimento do cliente.
// 2. **FAIL-CLOSED.** Sem marcação não há conexão: `saveConnection` recusa o
//    que não está na lista, para a agência tanto quanto para o cliente.
// 3. **REVOGAR APAGA.** Desmarcar remove a linha da lista **e** a MetaConnection
//    — deixar o token guardado depois de revogado é manter o dano.
//
// Somente leitura na Meta (listar Páginas/contas). POST e DELETE mexem só no
// banco desta casa.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth/api-guard";
import {
  alcanceDoAcesso, marcarAutorizados, aplicarEscolha, type PedidoDeEscolha,
} from "@/lib/integrations/meta/escolha-de-ativos";
import { revogarAtivo, TIPOS_DE_ATIVO } from "@/lib/integrations/meta/ativos-autorizados";

export const dynamic = "force-dynamic";

/** O dono desta rota é a agência, e ponto. Escrito uma vez para nenhuma das
 *  três funções abaixo poder "esquecer" e cair no ramo do cliente. */
const DONO_AGENCIA = null;

/**
 * A conexão de USUÁRIO da própria agência — a credencial colada/autorizada pelo
 * master. Sem ela não há o que listar, e isso é "conecte primeiro".
 *
 * ─── POR QUE O `OR: [null, ""]` SAIU DAQUI (06/08/2026) ────────────────────
 * Ele existia porque "sem cliente" tinha DUAS grafias no banco de produção:
 * `null` (callback do OAuth) e `""` (`/api/meta/token`, que gravou as conexões
 * de nível agência em 03/08). O `where` do Prisma compara o valor CRU, então
 * perguntar só por `null` fazia esta tela dizer "conecte primeiro" para uma
 * agência conectada há três dias.
 *
 * O OR resolvia ESTA consulta e deixava a doença: cada consulta nova precisaria
 * lembrar dele, e a que esquecesse não falharia — responderia errado, em
 * silêncio, sobre DE QUEM É o dado. Foi essa família de defeito que marcou 25
 * de 25 conexões legítimas para exclusão na perícia.
 *
 * A grafia foi normalizada na migration `20260806180000_uma_grafia_so_para_
 * sem_cliente` (linhas antigas viram NULL) e o banco passou a RECUSAR `""` por
 * gatilho. Uma grafia só: aqui pergunta-se por `null`, e ponto.
 */
async function conexaoDeUsuario(workspaceId: string): Promise<string | null> {
  const row = await prisma.metaConnection
    .findFirst({
      where: {
        workspaceId,
        platform: "user",
        status: "connected",
        clientId: null,
      },
      orderBy: { connectedAt: "desc" },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ?? null;
}

// ─── GET: o que o acesso alcança e o que já está marcado ────────────────────

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  const connectionId = await conexaoDeUsuario(session!.workspaceId);
  if (!connectionId) {
    return NextResponse.json({ semConexao: true, ativos: [], liberados: 0, lacunas: [] });
  }

  const { ativos, lacunas } = await alcanceDoAcesso(session!.workspaceId, connectionId);
  await marcarAutorizados(session!.workspaceId, DONO_AGENCIA, ativos);

  return NextResponse.json({
    semConexao: false,
    ativos,
    liberados: ativos.filter((a) => a.autorizado).length,
    lacunas,
  });
}

// ─── POST: o operador marca o que a agência administra ──────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  let body: { ativos?: PedidoDeEscolha[] };
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const pedidos = Array.isArray(body.ativos) ? body.ativos : [];

  const connectionId = await conexaoDeUsuario(session!.workspaceId);
  if (!connectionId) {
    return NextResponse.json(
      { error: "Conecte a conta Meta da agência antes de escolher o que ela administra." },
      { status: 409 },
    );
  }

  const r = await aplicarEscolha({
    workspaceId: session!.workspaceId,
    clientId: DONO_AGENCIA,
    connectionId,
    pedidos,
    autorizadoPor: `master:${session!.userId}`,
  });

  return NextResponse.json({ ok: true, ...r });
}

// ─── DELETE: revogar ────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { error, session } = await requireSession(["master"]);
  if (error) return error;

  const q = req.nextUrl.searchParams;
  const tipo = TIPOS_DE_ATIVO.find((t) => t === q.get("tipo"));
  const externalId = q.get("externalId") ?? "";
  if (!tipo || !externalId) {
    return NextResponse.json({ error: "informe tipo e externalId" }, { status: 400 });
  }

  const r = await revogarAtivo(session!.workspaceId, DONO_AGENCIA, tipo, externalId);
  return NextResponse.json({ ok: true, ...r });
}
