// Conversa cliente ↔ equipe.
//   - Cliente autentica por token de portal (?token=) ou cookie httpOnly (A4)
//     — authorRole "client".
//   - Equipe autentica por sessão, abrindo por ?clientId= (a caixa de entrada)
//     ou ?clientRequestId= (as telas de projeto que já existiam).
//
// A THREAD PERTENCE AO CLIENTE, não à solicitação de briefing. Toda a
// resolução de âncora e de filtro mora em `app/api/messages/conversa.ts` —
// leia o cabeçalho de lá antes de mexer aqui.
//
// O GET também marca como lidas as mensagens do OUTRO lado, que é o que apaga
// o badge de não-lidas de cada lado ao abrir a conversa.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { donoConfere } from "@/lib/agency/portal/dono-da-tela";
import { requireSession } from "@/lib/auth/api-guard";
import {
  conversaDoToken,
  conversaDoCliente,
  conversaDaSolicitacao,
  clienteDoWorkspace,
  solicitacaoDoWorkspace,
  type Conversa,
} from "@/app/api/messages/conversa";

interface MessageDTO {
  id: string;
  authorRole: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

function toDTO(
  m: { id: string; authorRole: string; authorName: string; body: string; createdAt: Date },
  viewer: "client" | "team",
): MessageDTO {
  return {
    id: m.id,
    authorRole: m.authorRole,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.authorRole === viewer,
  };
}

type Resolucao =
  | { ok: true; conversa: Conversa; viewer: "client" | "team"; nomeDaSessao: string | null }
  | { ok: false; response: NextResponse }
  // A tela declarou um cliente e a credencial desta requisição resolveu outro.
  // Não é erro de acesso — é confusão de identidade — e a resposta é VAZIA com
  // motivo, nunca a conversa do outro.
  | { ok: false; divergente: true; response: NextResponse };

/**
 * Quem está falando e com qual conversa. Um só lugar para os dois verbos —
 * GET e POST divergirem na resolução foi exatamente o que produziu o defeito
 * (o GET devolvia conversa vazia em silêncio; o POST devolvia 404).
 */
async function resolver(
  request: NextRequest,
  corpo?: { token?: string; clientRequestId?: string; clientId?: string; dono?: string },
): Promise<Resolucao> {
  const { searchParams } = new URL(request.url);
  const requestIdExplicito = corpo ? corpo.clientRequestId : searchParams.get("clientRequestId");
  const clientIdExplicito  = corpo ? corpo.clientId        : searchParams.get("clientId");
  const ladoDaEquipe = Boolean(requestIdExplicito || clientIdExplicito);

  // A4: sem parâmetro do lado da equipe, o cookie httpOnly do portal vale como
  // credencial do cliente.
  const token = ladoDaEquipe ? null : tokenDoPortal(request, corpo?.token ?? searchParams.get("token"));

  if (token) {
    const r = await conversaDoToken(token);
    if (!r.ok) {
      return { ok: false, response: NextResponse.json({ error: "Access denied", reason: r.reason }, { status: r.status }) };
    }

    // ── A CONFERÊNCIA NO SERVIDOR (15/08/2026) ─────────────────────────────
    //
    // O cliente da TELA e o cliente da CONVERSA são resolvidos por caminhos
    // diferentes: a tela pode ter vindo por token no caminho, e o chat em
    // `/portal/access/me` vem pelo cookie `dioli_portal` — que é UM por
    // navegador, para o domínio inteiro, guardando UM cliente por 180 dias.
    // Até aqui **ninguém conferia se os dois eram o mesmo**.
    //
    // `dono` é a identidade OPACA que `/api/portal/vista` devolveu para a tela
    // que está desenhada agora. Ela nunca CONCEDE nada — o dono continua sendo
    // derivado do token/cookie; ela só RECUSA quando os dois lados discordam.
    // Recusa = conversa vazia com motivo. Nunca a conversa do outro.
    const declarado = corpo ? corpo.dono : searchParams.get("dono");
    if (!donoConfere(r.conversa.clientId, declarado)) {
      return {
        ok: false,
        divergente: true,
        response: NextResponse.json({
          messages: [],
          podeEnviar: false,
          motivo: "dono-divergente",
          detalhe:
            "A conversa foi aberta com a credencial de outro cliente. Recarregue o portal pelo link que você recebeu.",
        }),
      };
    }

    return { ok: true, conversa: r.conversa, viewer: "client", nomeDaSessao: null };
  }

  const { session, error } = await requireSession();
  if (error) return { ok: false, response: error };
  const nomeDaSessao = session.name ?? null;

  // Estar logado não é ser dono: toda abertura por id explícito passa pela
  // posse do workspace da sessão.
  if (clientIdExplicito) {
    if (!(await clienteDoWorkspace(clientIdExplicito, session.workspaceId))) {
      return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    }
    return { ok: true, conversa: await conversaDoCliente(clientIdExplicito), viewer: "team", nomeDaSessao };
  }
  if (requestIdExplicito) {
    if (!(await solicitacaoDoWorkspace(requestIdExplicito, session.workspaceId))) {
      return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    }
    return { ok: true, conversa: await conversaDaSolicitacao(requestIdExplicito), viewer: "team", nomeDaSessao };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "clientId ou clientRequestId obrigatório" }, { status: 400 }),
  };
}

// ── GET: a conversa ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const r = await resolver(request);
  if (!r.ok) return r.response;
  const { conversa, viewer } = r;

  if (!conversa.filtro) {
    // Token válido, mas sem cliente nem solicitação por trás — acesso mal
    // emitido. Antes isto era `{ messages: [] }` mudo; agora a tela sabe que
    // não é conversa vazia, é conversa que não existe.
    return NextResponse.json({ messages: [], podeEnviar: false, motivo: "sem-dono" });
  }

  try {
    const rows = await prisma.portalMessage.findMany({
      where: conversa.filtro,
      orderBy: { createdAt: "asc" },
    });

    // Ao ver a conversa, o outro lado fica lido para este espectador.
    if (viewer === "client") {
      await prisma.portalMessage.updateMany({
        where: { ...conversa.filtro, authorRole: "team", readByClient: false },
        data: { readByClient: true },
      });
    } else {
      await prisma.portalMessage.updateMany({
        where: { ...conversa.filtro, authorRole: "client", readByTeam: false },
        data: { readByTeam: true },
      });
    }

    return NextResponse.json({ messages: rows.map((m) => toDTO(m, viewer)), podeEnviar: true });
  } catch (e) {
    console.error("[portal/messages] GET error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

// ── POST: enviar ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { token?: string; clientRequestId?: string; clientId?: string; body?: string; authorName?: string; dono?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "message too long" }, { status: 400 });

  const r = await resolver(request, {
    token: body.token,
    clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : undefined,
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    dono: typeof body.dono === "string" ? body.dono : undefined,
  });
  if (!r.ok) {
    // Divergência de dono no ENVIO não pode virar 200 mudo: a mensagem seria
    // gravada na conversa do outro cliente. 409 é o mesmo código que a tela já
    // sabe tratar (acesso sem dono) e o texto explica o que fazer.
    if ("divergente" in r) {
      return NextResponse.json(
        {
          error:
            "Esta conversa foi aberta com a credencial de outro cliente. Recarregue o portal pelo link que você recebeu antes de enviar.",
          motivo: "dono-divergente",
        },
        { status: 409 },
      );
    }
    return r.response;
  }
  const { conversa, viewer } = r;

  const { clientId, clientRequestId } = conversa.ancora;
  if (!clientId && !clientRequestId) {
    // Não é mais o 404 genérico: aqui o acesso realmente não aponta para
    // ninguém, e a mensagem diz o que fazer.
    return NextResponse.json(
      { error: "Este acesso não está ligado a nenhum cliente. Fale com a equipe Dioli para receber um link novo." },
      { status: 409 },
    );
  }

  const authorName =
    viewer === "client"
      ? body.authorName?.trim() || "Cliente"
      : r.nomeDaSessao || "Equipe Dioli";

  try {
    const created = await prisma.portalMessage.create({
      data: {
        // As DUAS chaves quando as duas existem — é o que mantém a conversa
        // única depois que um cliente direto ganha uma solicitação.
        clientId,
        clientRequestId,
        authorRole: viewer,
        authorName,
        body: text,
        // Quem escreve já leu o próprio lado.
        readByTeam:   viewer === "team",
        readByClient: viewer === "client",
      },
    });
    return NextResponse.json(toDTO(created, viewer), { status: 201 });
  } catch (e) {
    console.error("[portal/messages] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}
