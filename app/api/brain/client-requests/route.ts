import { NextRequest, NextResponse } from "next/server";
import { createClientRequest, listClientRequests, updateClientRequest, getClientRequest, deleteClientRequest } from "@/lib/agency/persistence/client-request-service";
import { requireSession } from "@/lib/auth/api-guard";
import {
  clienteDoWorkspace,
  naoEncontrado,
  solicitacaoDoWorkspace,
} from "@/lib/auth/posse-de-workspace";
import { runAutoScope } from "@/lib/dioli-brain/run-auto-scope";
import { rateLimited } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { briefingConfirmationEmail } from "@/lib/email/templates";
import { lerContato, montarContato } from "@/lib/agency/comercial/contato-do-lead";

// Fire-and-forget prospect confirmation. O endereço sai do leitor único de
// contato (`lerContato`) — não de um `?.scope?.prospectEmail` reinventado aqui.
//
// ── 16/08/2026 — O SILÊNCIO DEIXA DE SER O CAMINHO PADRÃO ────────────────────
//
// No piloto do CEO, esta função registrou:
//   [client-requests] confirmation e-mail skipped — RESEND_API_KEY not set
//
// **O defeito não é a chave ausente** — a chave é do CEO e não é assunto de
// código. O defeito é que o aviso morria num `console.warn`: o cliente mandava
// briefing e anexos e não recebia sinal nenhum de que chegou, e a equipe não
// tinha onde ver que o canal estava desligado.
//
// Duas coisas mudaram, e nenhuma delas é "avise melhor no log":
//   1. A confirmação passa a ser gravada na CONVERSA DO PORTAL da solicitação
//      (`registrarConfirmacaoNoPortal`, abaixo). Ela não depende de e-mail, não
//      depende de chave e não depende de o prospect já ser cliente — a
//      `PortalMessage` aceita `clientRequestId`, que é justamente a âncora de
//      quem ainda não tem ficha. A mensagem aparece na caixa de entrada da
//      agência na mesma hora, e na tela do cliente quando ele ganha acesso.
//   2. A falta da chave vira ACHADO VISÍVEL em `GET /api/capacidades`
//      (`avisar-cliente-por-email`), que é o registro de "o que esta instância
//      consegue fazer de verdade" — não uma linha de log rotativo.
function sendBriefingConfirmation(body: Record<string, unknown>, briefingJson: unknown): void {
  if (body.source !== "briefing") return;
  const contato = lerContato({ briefingJson, sdrHandoffJson: body.sdrHandoffJson });
  const email = contato.email;
  if (!email) return;

  const scope = (briefingJson as { scope?: Record<string, unknown> } | undefined)?.scope;
  const { subject, html } = briefingConfirmationEmail({
    prospectName: contato.nome ?? undefined,
    businessName: typeof scope?.businessName === "string" ? scope.businessName : undefined,
    services:     Array.isArray(body.services) ? (body.services as string[]) : undefined,
  });

  sendEmail({ to: email, subject, html })
    .then((r) => {
      if (r.skipped) console.warn("[client-requests] confirmation e-mail skipped — RESEND_API_KEY not set");
      else if (!r.ok) console.error("[client-requests] confirmation e-mail failed:", r.error);
    })
    .catch((e) => console.error("[client-requests] confirmation e-mail threw:", e));
}

/**
 * A confirmação que NÃO depende de e-mail: uma mensagem da equipe na conversa
 * do portal daquela solicitação, dizendo o que chegou.
 *
 * Best-effort de propósito: falhar aqui **não pode** derrubar o 201. Perder a
 * confirmação é ruim; perder o briefing inteiro por causa dela seria pior — é o
 * mesmo raciocínio de `falarComOCliente` em `lib/agency/esteira/marcos.ts`, e o
 * `authorName` é o mesmo para a conversa não trocar de voz no meio.
 *
 * O texto NÃO promete retorno quando não há canal de contato: quem sobe sem
 * WhatsApp nem e-mail não pode ler "entramos em contato" — foi essa promessa
 * vazia que produziu os 51 dias do Sushi Cazza.
 */
async function registrarConfirmacaoNoPortal(input: {
  clientRequestId: string;
  businessName: string;
  services: string[];
  anexos: number;
  temComoFalar: boolean;
}): Promise<void> {
  const linhas = [
    `Recebemos o briefing do ${input.businessName}. Está tudo aqui com a gente. ✅`,
    "",
    "O que chegou:",
    `• A conversa completa do briefing`,
    ...(input.services.length > 0 ? [`• Serviços pedidos: ${input.services.join(", ")}`] : []),
    ...(input.anexos > 0
      ? [`• ${input.anexos} arquivo(s) anexado(s)`]
      : ["• Nenhum arquivo anexado (se quiser mandar algo, é só responder por aqui)"]),
    "",
    input.temComoFalar
      ? "Vamos montar sua proposta e retornar pelo canal que você informou. Qualquer coisa, responda por aqui mesmo."
      : "Para preparar a proposta precisamos de um WhatsApp ou e-mail seu — sem isso não temos como te enviar nada. Pode deixar aqui na conversa.",
  ];

  const { prisma } = await import("@/lib/db/client");
  await prisma.portalMessage.create({
    data: {
      clientRequestId: input.clientRequestId,
      authorRole: "team",
      authorName: "Gerente de projeto",
      body: linhas.join("\n"),
      // `readByTeam: true` porque a equipe não precisa "ler" a própria mensagem;
      // marcá-la como não lida inflaria o badge da caixa de entrada com o eco
      // do próprio sistema e treinaria a equipe a ignorar o badge.
      readByTeam: true,
    },
  });
}

// GET (list) and PATCH (mutate) are internal — session required.
// POST stays public: it is the submit target of the public /briefing form.
// It can only create "new" requests (status/source are service-controlled).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  // Single-record fetch by id.
  //
  // ⚠️ O que este registro carrega: `rawContext`, o transcript do SDR e o
  // `sdrHandoffJson` — a conversa crua do prospect, com nome, telefone e
  // valores falados. Sem a posse, um id de outra agência devolvia tudo isso.
  if (id) {
    try {
      if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();
      const record = await getClientRequest(id);
      if (!record) return naoEncontrado();
      return NextResponse.json(record);
    } catch {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }
  }

  // O `?workspaceId=` da query MORREU: OMITI-LO listava a base inteira, de
  // todas as agências. O escopo da listagem é o da sessão, sempre — não é
  // parâmetro, é fato. (As órfãs continuam aparecendo para o dono real: quem
  // decide é `apenasDoWorkspace`, dentro do serviço.)
  const status      = searchParams.get("status") ?? undefined;
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  try {
    const records = await listClientRequests({
      workspaceId: session.workspaceId,
      status: status as never,
      limit,
    });
    return NextResponse.json(records);
  } catch {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Public + fires the AI auto-scope pipeline — cap it tightly per IP.
  const limited = rateLimited(request, "client-requests", 8, 60_000);
  if (limited) return limited as NextResponse;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { businessName } = body;
  if (!businessName || typeof businessName !== "string") {
    return NextResponse.json({ error: "businessName required" }, { status: 400 });
  }

  // ── O GATE DE CONTATO (08/08/2026) ─────────────────────────────────────────
  //
  // Três interessados entraram por esta rota e ficaram 51, 29 e 28 dias sem que
  // ninguém pudesse falar com eles: o briefing coletava a conversa inteira e
  // nunca perguntava para onde ligar. A trava é aqui, no SERVIDOR, e não na
  // tela: esta rota é pública e um POST direto passa por cima de qualquer
  // `disabled` de botão.
  //
  // AS DUAS METADES, e nenhuma é opcional:
  //   • COM canal  → `new`, `runAutoScope` roda, a proposta nasce.
  //   • SEM canal  → `lead_incompleto`. Não vira proposta **e não se perde**:
  //     a conversa inteira grava, o motivo grava junto, e o raio-x cobra.
  //
  // O que NÃO acontece no caso sem contato: nenhuma inferência. O `rawContext`
  // não é vasculhado atrás de um telefone. Arroba de Instagram no meio da
  // conversa é PISTA para o CEO ler, nunca contato (`pistasDeContato`).
  const contatoDeclarado = montarContato({
    nome:     (body.contato as Record<string, unknown> | undefined)?.nome
              ?? (body.briefingJson as { scope?: Record<string, unknown> } | undefined)?.scope?.prospectName,
    email:    (body.contato as Record<string, unknown> | undefined)?.email
              ?? (body.briefingJson as { scope?: Record<string, unknown> } | undefined)?.scope?.prospectEmail,
    whatsapp: (body.contato as Record<string, unknown> | undefined)?.whatsapp
              ?? (body.briefingJson as { scope?: Record<string, unknown> } | undefined)?.scope?.prospectPhone,
  });

  const briefingJson =
    body.briefingJson != null || contatoDeclarado
      ? { ...(body.briefingJson as object | undefined ?? {}), ...(contatoDeclarado ? { contato: contatoDeclarado } : {}) }
      : undefined;

  const contato = lerContato({ briefingJson, sdrHandoffJson: body.sdrHandoffJson });

  try {
    const record = await createClientRequest({
      status: contato.temComoFalar ? "new" : "lead_incompleto",
      businessName,
      segment:         typeof body.segment        === "string"   ? body.segment          : undefined,
      services:        Array.isArray(body.services)              ? body.services as string[] : [],
      objectives:      Array.isArray(body.objectives)            ? body.objectives as string[] : [],
      rawContext:      typeof body.rawContext      === "string"   ? body.rawContext        : "",
      source:          typeof body.source         === "string"   ? body.source            : "briefing",
      // `workspaceId`/`clientId` do CORPO não entram mais: esta rota é pública
      // (é o submit do formulário /briefing) e aceitá-los deixava qualquer
      // pessoa plantar uma solicitação dentro da caixa de entrada de uma
      // agência escolhida a dedo — e disparar o auto-scope, que gasta a chave
      // de IA DELA. Quem resolve o dono é o servidor
      // (`resolverWorkspacePublico`); a adoção explícita é o PATCH, que tem
      // sessão. Ver a regra da casa: no caminho público, o dono é DERIVADO,
      // nunca informado.
      briefingJson,
      sdrHandoffJson:  body.sdrHandoffJson  != null              ? body.sdrHandoffJson as object : undefined,
      attachmentsJson: Array.isArray(body.attachmentsJson)       ? body.attachmentsJson as object[] : [],
    });

    // ── A CONFIRMAÇÃO QUE SEMPRE ACONTECE ────────────────────────────────────
    //
    // Fora do `if` de propósito: quem sobe SEM contato é justamente quem mais
    // precisa de sinal de que chegou, porque para ele não sai e-mail nenhum por
    // definição. Antes, esse caminho só produzia um `console.warn` e silêncio
    // absoluto do lado de fora.
    if (typeof body.source !== "string" || body.source === "briefing") {
      registrarConfirmacaoNoPortal({
        clientRequestId: record.id,
        businessName,
        services: Array.isArray(body.services) ? (body.services as string[]) : [],
        anexos: Array.isArray(body.attachmentsJson) ? body.attachmentsJson.length : 0,
        temComoFalar: contato.temComoFalar,
      }).catch((e) => {
        console.error("[client-requests] confirmação no portal falhou para", record.id, e);
      });
    }

    if (contato.temComoFalar) {
      // Automatically generate the full scope as soon as the briefing lands —
      // no PM click needed. Fire-and-forget: the 201 returns immediately while
      // the synchronous engine chain runs in the background.
      runAutoScope(record.id).catch((e) => {
        console.error("[client-requests] background auto-scope failed for", record.id, e);
      });

      // Confirmation e-mail to the prospect — fire-and-forget, never blocks the 201.
      sendBriefingConfirmation(body, briefingJson);
    } else {
      // Sem canal não há proposta: `runAutoScope` custa chamadas de IA e produz
      // um documento para ninguém. O lead está gravado inteiro e o raio-x cobra.
      console.warn("[client-requests] lead sem contato — sem proposta:", record.id, contato.motivo);
    }

    return NextResponse.json(
      { ...record, contato: { temComoFalar: contato.temComoFalar, motivo: contato.motivo } },
      { status: 201 },
    );
  } catch (e) {
    console.error("[brain/client-requests] POST error", e);
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();

    // `workspaceId` e `clientId` do corpo eram gravados direto
    // (`client-request-service:149`): dava para TRANSFERIR a solicitação de
    // outra agência para a sua com um PATCH — e, no sentido inverso, empurrar
    // a sua para fora. Adotar a órfã continua permitido (é o caminho legítimo
    // do briefing público), mas só para o SEU workspace, e o cliente apontado
    // tem que ser seu.
    if (typeof body.workspaceId === "string" && body.workspaceId !== session.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId não pode ser trocado por outro" },
        { status: 403 },
      );
    }
    if (typeof body.clientId === "string" && !(await clienteDoWorkspace(body.clientId, session.workspaceId))) {
      return naoEncontrado();
    }

    const record = await updateClientRequest(id, body as never);
    return NextResponse.json(record);
  } catch (e) {
    console.error("[brain/client-requests] PATCH error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // O apagão em cascata (BrainArtifact, ApprovalRequest → ApprovalComment)
    // é o motivo de esta conferência não ser negociável: sem ela, um id
    // digitado destruía o histórico de aprovação de outra agência inteira.
    if (!(await solicitacaoDoWorkspace(id, session.workspaceId))) return naoEncontrado();
    await deleteClientRequest(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[brain/client-requests] DELETE error", e);
    return NextResponse.json({ error: "Not found or DB unavailable" }, { status: 404 });
  }
}
