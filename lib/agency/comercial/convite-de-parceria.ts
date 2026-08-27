// O CONVITE DO PARCEIRO — cunhar e resolver. A verdade vem do token, não da fala.
//
// ═══ O PROBLEMA QUE ELE FECHA (27/08/2026) ══════════════════════════════════
//
// O parceiro não paga, então a pergunta obrigatória da verba não protege
// ninguém e só trava o pedido dele — foi onde a conversa das 13:43 parou. Mas
// para DISPENSAR a pergunta a casa precisa SABER que é parceria, e na sala de
// briefing o visitante é anônimo: só `sessionId`.
//
// As duas fontes tentadoras, e por que as duas estão erradas:
//
//   • `clientRequestId` do corpo → é "um id que qualquer pessoa digita". A
//     própria casa já o declara não-confiável.
//   • o modelo perceber pela conversa → abriria a maior porta desta casa com a
//     chave mais fraca que ela tem: quem digitasse "somos parceiros de vocês"
//     deixaria de ser perguntado sobre verba.
//
// ⚠️ Então a verdade vem de um token que a CASA cunhou. É o molde de
// `PortalAccess` e a regra de 03/08, palavra por palavra: *em qualquer caminho
// público, o `clientId` vem SEMPRE do token — derivação, não comparação*.
//
// ═══ O CONVITE NÃO É A AUTORIZAÇÃO ═════════════════════════════════════════
//
// Ele só APONTA para a `IsencaoDeParceria`, que continua sendo a fonte da
// verdade — e que é conferida **viva a cada uso**, não só na cunhagem. Isso é o
// que faz a revogação funcionar sem caçar link nenhum: venceu ou foi revogada a
// isenção, o convite morre no mesmo instante, ainda que o token continue válido.
//
// ═══ FAIL-CLOSED EM TODO RAMO ══════════════════════════════════════════════
//
// Sem token, token desconhecido, revogado, vencido, sem isenção viva, ou banco
// fora do ar → **`null`**, e `null` significa *visitante anônimo, continua sendo
// perguntada a verba*. Nunca o contrário. Um erro de leitura que dispensasse a
// pergunta transformaria uma queda de banco em porta aberta para todo mundo.

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { parceriaVale, type ParceriaDeclarada } from "./parceria-declarada";

/** Quanto vale um convite quando ninguém diz. Curto de propósito: ver `expiraEm`. */
export const VALIDADE_PADRAO_DIAS = 14;

export type PedidoDeConvite = {
  /** O cliente parceiro. Precisa ter isenção VIVA — senão não há o que convidar. */
  clientId: string;
  /** Quem cunhou. Sai da SESSÃO na rota, nunca do corpo. */
  criadoPor: string;
  /** Prazo próprio do convite. Ausente = `VALIDADE_PADRAO_DIAS`. */
  expiraEm?: Date | string | null;
  observacao?: string | null;
};

export type ResultadoDaCunhagem =
  | { ok: true; token: string; expiraEm: Date; clientId: string }
  | { ok: false; recusa: string; motivo: string };

function recusar(recusa: string, motivo: string): ResultadoDaCunhagem {
  return { ok: false, recusa, motivo };
}

function comoData(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A isenção VIVA deste cliente — a fonte da verdade, lida agora.
 *
 * Separada de propósito: é a MESMA leitura na cunhagem e no uso. Fossem duas,
 * um dia divergiriam e o convite passaria a valer mais que a parceria que ele
 * representa.
 */
async function isencaoViva(clientId: string, agora: Date): Promise<ParceriaDeclarada | null> {
  const linha = await prisma.isencaoDeParceria.findFirst({
    where: { clientId, validaAte: { gte: agora } },
    orderBy: { validaAte: "desc" },
    select: { autorizadaPor: true, validaAte: true },
  });
  if (!linha) return null;
  const p = { autorizadaPor: linha.autorizadaPor, validaAte: linha.validaAte };
  return parceriaVale(p, agora) ? p : null;
}

/**
 * CUNHA um convite. Recusa antes de escrever, sempre.
 *
 * ⚠️ Não se cunha convite para quem não tem parceria viva. Deixar cunhar "para
 * quando a isenção sair" criaria uma credencial que espera autorização — e
 * credencial que espera autorização é credencial sem autorização.
 */
export async function cunharConviteDeParceria(
  pedido: PedidoDeConvite,
  agora: Date = new Date(),
): Promise<ResultadoDaCunhagem> {
  const clientId = (pedido.clientId ?? "").trim();
  const criadoPor = (pedido.criadoPor ?? "").trim();
  if (!clientId) return recusar("sem_cliente", "Informe o cliente parceiro.");
  // Dono na linha, e obrigatório: convite sem dono é buraco — daqui a seis
  // meses ninguém sabe quem entregou a chave.
  if (!criadoPor) return recusar("sem_dono", "Convite sem dono não se cunha: informe quem está criando.");

  const pedida = comoData(pedido.expiraEm);
  if (pedido.expiraEm && !pedida) {
    return recusar("data_invalida", "A validade do convite não é uma data legível.");
  }
  const expiraEm = pedida ?? new Date(agora.getTime() + VALIDADE_PADRAO_DIAS * 24 * 3600_000);
  if (expiraEm.getTime() <= agora.getTime()) {
    return recusar("ja_vencido", "Um convite que já nasce vencido não é convite.");
  }

  try {
    const isencao = await isencaoViva(clientId, agora);
    if (!isencao) {
      return recusar(
        "sem_isencao_viva",
        "Este cliente não tem isenção de parceria viva. Conceda a isenção primeiro " +
          "(POST /api/admin/isencoes-de-parceria) — o convite só aponta para ela.",
      );
    }
    // ⚠️ O CONVITE NUNCA SOBREVIVE À PARCERIA. Sem esta trava, um convite de 90
    // dias sobre uma isenção de 30 daria 60 dias de parceria que ninguém
    // autorizou — parceria eterna pela porta dos fundos continua sendo parceria
    // eterna, e foi para matar isso que `validaAte` é obrigatória na isenção.
    if (expiraEm.getTime() > isencao.validaAte.getTime()) {
      return recusar(
        "passa_da_isencao",
        `O convite não pode valer além da isenção, que vence em ${isencao.validaAte.toISOString()}.`,
      );
    }

    const criado = await prisma.conviteDeParceria.create({
      data: {
        token: randomBytes(32).toString("base64url"),
        clientId,
        criadoPor,
        expiraEm,
        observacao: (pedido.observacao ?? "")?.trim() || null,
      },
      select: { token: true, expiraEm: true, clientId: true },
    });
    return { ok: true, token: criado.token, expiraEm: criado.expiraEm, clientId: criado.clientId };
  } catch (err) {
    return recusar("erro", err instanceof Error ? err.message : String(err));
  }
}

export type ConviteResolvido = {
  clientId: string;
  parceria: ParceriaDeclarada;
};

/**
 * RESOLVE um convite: token → cliente → isenção viva.
 *
 * Devolve `null` em TODO caminho que não seja "este token é bom E a parceria
 * está viva agora". Quem chama trata `null` como *visitante anônimo* — que é o
 * comportamento de sempre, e o seguro.
 *
 * `registrarUso` fica de fora do caminho de decisão de propósito: a trilha não
 * pode ser o que decide o acesso, e uma escrita que falha não pode barrar um
 * parceiro legítimo.
 */
export async function resolverConviteDeParceria(
  token: unknown,
  agora: Date = new Date(),
): Promise<ConviteResolvido | null> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return null;
  try {
    const convite = await prisma.conviteDeParceria.findUnique({
      where: { token: t },
      select: { id: true, clientId: true, expiraEm: true, revogadoEm: true },
    });
    if (!convite) return null;
    if (convite.revogadoEm) return null;
    if (convite.expiraEm.getTime() <= agora.getTime()) return null;

    // A ISENÇÃO É CONFERIDA AGORA, não na cunhagem. É isto que faz revogar a
    // parceria matar o convite no mesmo instante, sem caçar link nenhum.
    const parceria = await isencaoViva(convite.clientId, agora);
    if (!parceria) return null;

    // Trilha, depois da decisão e sem poder derrubá-la.
    void prisma.conviteDeParceria
      .update({ where: { id: convite.id }, data: { usos: { increment: 1 }, ultimoUsoEm: agora } })
      .catch(() => { /* trilha não barra parceiro legítimo */ });

    return { clientId: convite.clientId, parceria };
  } catch {
    // Banco fora do ar = "não sei se é parceria" = CONTINUA PERGUNTANDO.
    return null;
  }
}

/** Revoga um convite (o link que vazou). Idempotente. */
export async function revogarConviteDeParceria(token: string, agora: Date = new Date()): Promise<boolean> {
  try {
    const r = await prisma.conviteDeParceria.updateMany({
      where: { token: token.trim(), revogadoEm: null },
      data: { revogadoEm: agora },
    });
    return r.count > 0;
  } catch {
    return false;
  }
}
