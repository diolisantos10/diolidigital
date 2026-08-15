import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

export interface CreatePortalAccessInput {
  clientRequestId?: string;
  clientId?: string;
  expiresAt?: Date;
}

// A portal token is the SOLE credential for unauthenticated client access, so
// it must be unguessable. cuid (the schema default) is collision-resistant but
// low-entropy — mint a 256-bit random, URL-safe token instead. Existing cuid
// tokens keep validating (lookup is by value).
export async function createPortalAccess(input: CreatePortalAccessInput) {
  return prisma.portalAccess.create({
    data: {
      token:           randomBytes(32).toString("base64url"),
      clientRequestId: input.clientRequestId,
      clientId:        input.clientId,
      expiresAt:       input.expiresAt,
    },
  });
}

/**
 * O token serve? — conferência SEM efeito colateral.
 *
 * `validatePortalAccess` incrementa `accessCount` e carimba `lastAccessedAt`:
 * é a validação de quem está ABRINDO o portal. Quem só precisa decidir "gravo
 * este cookie?" não pode contar como visita — senão todo acesso vira dois, e a
 * contagem que a agência usa para saber se o cliente entrou passa a mentir.
 */
export async function conferirTokenDoPortal(token: string): Promise<boolean> {
  try {
    const record = await prisma.portalAccess.findUnique({ where: { token } });
    if (!record || record.revokedAt) return false;
    if (record.expiresAt && record.expiresAt < new Date()) return false;
    return true;
  } catch {
    // Banco fora do ar: não grave credencial de 180 dias no escuro.
    return false;
  }
}

export async function validatePortalAccess(token: string) {
  const record = await prisma.portalAccess.findUnique({ where: { token } });
  if (!record) return { valid: false, reason: "not_found" as const };
  if (record.revokedAt) return { valid: false, reason: "revoked" as const };
  if (record.expiresAt && record.expiresAt < new Date()) {
    return { valid: false, reason: "expired" as const };
  }

  await prisma.portalAccess.update({
    where: { token },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  });

  return { valid: true, record };
}

// ── Derivação do DONO a partir do token ──────────────────────────────────────
// Regra da casa (decisão do CEO, 03/08/2026 — modelo de parceria): em qualquer
// caminho público (portal/parceiro), o clientId vem SEMPRE do token — derivação,
// não comparação. Nunca aceite clientId de query/corpo nesses caminhos.
//
// Devolve o cliente e o workspace dele, ou null quando o token é inválido,
// revogado, expirado, ou não está vinculado a nenhum cliente.
// ── O TOKEN CONGELA O DONO NA PRIMEIRA VALIDAÇÃO (15/08/2026, rodada 2) ─────
//
// O furo mais grave da auditoria, e ele NÃO era da conversa: era do PORTAL
// INTEIRO. `resolvePortalClient` e `conversaDoToken` RE-DERIVAVAM o dono a cada
// chamada, lendo `ClientRequestDb.clientId` — um ponteiro MUTÁVEL. Ponteiro
// andou, token antigo passou a valer para o cliente novo.
//
// Probe do `seguranca`: `/api/portal/vista` com o token de um cliente devolveu
// `marca.nome` de OUTRO. O alcance é tudo que pendura no token — marca,
// projetos, métricas, aprovações, pedidos, materiais, conexões, drive e
// `/api/brain/portal-data`. E a conferência de dono da rodada 1 não pegava
// nada disso: a tela e a conversa derivam o MESMO cliente errado e concordam
// entre si.
//
// A regra nova, em uma frase: **o token aponta para um cliente e só; se o
// ponteiro andar depois, o token morre.**
//
//   • `PortalAccess.clientId` nulo + solicitação com dono → CONGELA (grava).
//   • `PortalAccess.clientId` preenchido e diferente do dono atual da
//     solicitação → **recusa** (`ponteiro_andou`). Nunca segue o ponteiro.
//
// Congelar é seguro: só fixa o que aquele token já concedia no primeiro uso.
// O que ele nunca mais faz é MUDAR de dono sozinho.

export type DonoDoToken =
  | { ok: true; clientId: string; workspaceId: string }
  | { ok: false; motivo: "token_invalido" | "sem_dono" | "ponteiro_andou" };

/**
 * O dono de um token de portal — congelado, conferido e único.
 * É o caminho ÚNICO: `resolvePortalClient` e `conversaDoToken` passam por aqui.
 */
export async function donoDoToken(token: string): Promise<DonoDoToken> {
  const acesso = await validatePortalAccess(token);
  if (!acesso.valid || !acesso.record) return { ok: false, motivo: "token_invalido" };
  const registro = acesso.record;

  // Quem a solicitação diz ser o dono AGORA.
  let daSolicitacao: string | null = null;
  if (registro.clientRequestId) {
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: registro.clientRequestId },
      select: { clientId: true },
    });
    daSolicitacao = solicitacao?.clientId ?? null;
  }

  const congelado = registro.clientId ?? null;

  if (congelado && daSolicitacao && congelado !== daSolicitacao) {
    // O ponteiro andou debaixo de um token já emitido. Não existe leitura
    // segura aqui: nem o dono antigo (que pode ter perdido a solicitação) nem
    // o novo (que nunca recebeu ESTE link). Fecha, e deixa rastro.
    const relato =
      `[portal] token recusado: ponteiro andou — solicitação ${registro.clientRequestId} `
      + `saiu do cliente ${congelado} para ${daSolicitacao}. PortalAccess ${registro.id}.`;
    console.error(relato);
    // ── NEGA **E REGISTRA** — e registra NO BANCO ──────────────────────────
    // A constituição dos Essenciais manda negar e registrar. Log de contêiner
    // não é registro: o Railway rotaciona, e a pergunta forense desta casa
    // ("algum cliente viu o que não era dele?") já terminou uma vez em "não há
    // como saber" por falta exatamente disto. `ActivityEvent` é consultável.
    await prisma.client.findUnique({ where: { id: congelado }, select: { workspaceId: true } })
      .then((c) => c && prisma.activityEvent.create({
        data: {
          workspaceId: c.workspaceId,
          clientId: congelado,
          type: "portal_ponteiro_andou",
          message: relato,
        },
      }))
      .catch(() => { /* o registro é best-effort; a RECUSA não é */ });
    return { ok: false, motivo: "ponteiro_andou" };
  }

  // ── 🔴 RODADA 4: `congelado ?? daSolicitacao` ERA O SINTOMA RESSUSCITADO ──
  //
  // Um `PortalAccess` LEGADO (clientId nulo) cuja solicitação já andou
  // congelava no dono **NOVO**. Probe: `/api/portal/vista` com o link legado
  // do ALFA devolveu `marca.nome = "Loja BETA"`.
  //
  // E o furo era estrutural, não de borda: **o congelamento só protege token
  // validado depois do deploy, e todo token em produção é anterior a ele.**
  // Era, outra vez, defesa que depende de dado que só existe no futuro.
  //
  // A inversão: **`PortalAccess.clientId` é a ÚNICA prova de pertencimento de
  // um token.** Sem ela não se DERIVA dono nenhum — derivar do ponteiro é
  // adivinhar, e adivinhar é o que produziu o incidente. O token sem prova é
  // recusado, e a agência emite um novo (`/api/admin/links-do-portal`).
  //
  // O caso do PROSPECT (solicitação que ainda não tem cliente) continua
  // valendo e é tratado em `escopoDoToken`: lá a identidade É a solicitação,
  // e não há cliente para confundir com outro.
  const clientId = congelado;
  if (!clientId) return { ok: false, motivo: "sem_dono" };

  const cliente = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true },
  });
  if (!cliente) return { ok: false, motivo: "sem_dono" };

  return { ok: true, clientId: cliente.id, workspaceId: cliente.workspaceId };
}

export async function resolvePortalClient(
  token: string,
): Promise<{ clientId: string; workspaceId: string } | null> {
  const dono = await donoDoToken(token);
  return dono.ok ? { clientId: dono.clientId, workspaceId: dono.workspaceId } : null;
}

// ── O ESCOPO CONGELADO (15/08/2026, rodada 3) ───────────────────────────────
//
// A lição da rodada 3, nas palavras do `seguranca`: **"a trava vai onde o id é
// USADO — converter a função central não converte quem não a chama."**
//
// A rodada 2 congelou o dono em `donoDoToken` e converteu 5 rotas. Ficaram 4
// lendo `access.record.clientRequestId` direto do registro do token — o
// ponteiro cru — e nelas o furo continuou aberto. Uma delas, `/api/portal/
// approvals`, **não é leitura: o probe APROVOU uma entrega de outro cliente**.
// E o cabeçalho do próprio conserto da rodada 2 citava `portal-data` como
// parte do alcance, sem convertê-la.
//
// Por isso isto aqui não devolve só o dono: devolve **o escopo inteiro** que
// uma rota de portal pode precisar — cliente, workspace e as solicitações DELE.
// Rota que precise de `clientRequestId` tira daqui, e não do registro do token.
// Assim o id que a rota USA já nasce congelado e conferido.

// ── POR QUE ISTO É UMA UNIÃO DISCRIMINADA, E NÃO UM `clientId: string | null`
//
// 🔴 A REGRESSÃO DA RODADA 3, e ela deixou o PR PIOR que não mesclar.
// `app/api/media/[id]` fazia `escopo.clientId === registro.clientId`. No ramo
// do PROSPECT `escopo.clientId` é nulo; todo `MediaAsset` legado tem
// `clientId` nulo. **`null === null` → autorizado**, e o probe atravessou
// WORKSPACE: inquilino 1 lendo arquivo do inquilino 2. A base tinha o `!!` que
// eu removi.
//
// Consertar aquela linha não bastava: é uma CLASSE de defeito, e o mesmo
// `null === null` já tinha aparecido em `posse-da-aprovacao` na rodada
// anterior. Enquanto o tipo permitir `clientId: null`, todo chamador novo pode
// repeti-lo, e nenhum teste que eu escreva cobre o chamador que ainda não
// existe.
//
// Com a união, **o campo `clientId` NÃO EXISTE no ramo do prospect**: comparar
// não compila. A trava passa a ser o compilador, não a disciplina de quem lê.
export type EscopoDoToken =
  | {
      ok: true;
      tipo: "cliente";
      clientId: string;
      workspaceId: string;
      /** As solicitações que pertencem a este cliente HOJE. */
      clientRequestIds: string[];
    }
  | {
      ok: true;
      tipo: "prospect";
      /** Solicitação de briefing que ainda não virou cliente. Não há
       *  `clientId` — e é justamente por isso que ele não existe aqui. */
      clientRequestId: string;
      workspaceId: string | null;
    }
  | { ok: false; motivo: "token_invalido" | "sem_dono" | "ponteiro_andou" };

export async function escopoDoToken(token: string): Promise<EscopoDoToken> {
  const dono = await donoDoToken(token);

  // ── O PROSPECT (rodada 3) ────────────────────────────────────────────────
  // Solicitação de briefing que ainda NÃO virou cliente tem portal legítimo —
  // é por ele que a proposta é lida e aprovada. `donoDoToken` devolve
  // `sem_dono` nesse caso, e tratar isso como recusa quebraria a porta de
  // entrada comercial inteira. O escopo dele é a PRÓPRIA solicitação, e só
  // vale enquanto ela continuar sem dono: no instante em que ganha um cliente,
  // o caminho de cima assume e o congelamento passa a valer.
  if (!dono.ok) {
    if (dono.motivo !== "sem_dono") return dono;
    const registro = await prisma.portalAccess.findUnique({
      where: { token }, select: { clientRequestId: true },
    }).catch(() => null);
    if (!registro?.clientRequestId) return dono;
    const solicitacao = await prisma.clientRequestDb.findUnique({
      where: { id: registro.clientRequestId }, select: { id: true, clientId: true, workspaceId: true },
    }).catch(() => null);
    if (!solicitacao || solicitacao.clientId) return dono;
    return {
      ok: true,
      tipo: "prospect",
      clientRequestId: solicitacao.id,
      workspaceId: solicitacao.workspaceId ?? null,
    };
  }

  // As solicitações saem do CLIENTE congelado — nunca do registro do token.
  // É esta linha que impede o ponteiro andado de continuar valendo.
  const solicitacoes = await prisma.clientRequestDb.findMany({
    where: { clientId: dono.clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  }).catch(() => []);

  return {
    ok: true,
    tipo: "cliente",
    clientId: dono.clientId,
    workspaceId: dono.workspaceId,
    clientRequestIds: solicitacoes.map((s) => s.id),
  };
}

export async function revokePortalAccess(token: string) {
  return prisma.portalAccess.update({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function getPortalAccessForRequest(clientRequestId: string) {
  return prisma.portalAccess.findMany({
    where: { clientRequestId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}
