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
import { type ParceriaDeclarada } from "./parceria-declarada";
import { parceriaVivaDoCliente } from "@/lib/agency/financeiro/parceria-do-parceiro";

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
 * A AUTORIZAÇÃO VIVA deste parceiro — a fonte da verdade, lida agora.
 *
 * ⚠️ ANTES ISTO LIA `IsencaoDeParceria`, E ERA O NÓ (27/08/2026).
 *
 * A isenção é POR PEDIDO (`conceder-isencao.ts`: *"isenção sem pedido não
 * isenta nada"*). Como o pedido nasce do briefing, e o briefing do parceiro só
 * corre liso com o convite, o resultado era um círculo fechado:
 *
 *     convite → isenção → pedido → briefing → (convite)
 *
 * Não havia como cunhar o link do PRIMEIRO parceiro. A porta existia e não
 * podia ser aberta a primeira vez.
 *
 * Agora a fonte é `ParceriaDoCliente`, que vive no nível do PARCEIRO e existe
 * ANTES de qualquer pedido — e o círculo se rompe no elo certo, sem afrouxar
 * nada: a autorização continua nominal, com validade e com teto.
 *
 * Separada de propósito: é a MESMA leitura na cunhagem e no uso. Fossem duas,
 * um dia divergiriam e o convite passaria a valer mais que a parceria que ele
 * representa.
 */
async function autorizacaoViva(clientId: string, agora: Date): Promise<ParceriaDeclarada | null> {
  const p = await parceriaVivaDoCliente(clientId, agora);
  return p ? { autorizadaPor: p.autorizadaPor, validaAte: p.validaAte } : null;
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
    const isencao = await autorizacaoViva(clientId, agora);
    if (!isencao) {
      return recusar(
        "sem_parceria_viva",
        "Este cliente não tem parceria viva. Autorize a parceria primeiro " +
          "(POST /api/agency/parcerias) — o convite só aponta para ela, e não a cria.",
      );
    }
    // ⚠️ O CONVITE NUNCA SOBREVIVE À PARCERIA. Sem esta trava, um convite de 90
    // dias sobre uma isenção de 30 daria 60 dias de parceria que ninguém
    // autorizou — parceria eterna pela porta dos fundos continua sendo parceria
    // eterna, e foi para matar isso que `validaAte` é obrigatória na isenção.
    if (expiraEm.getTime() > isencao.validaAte.getTime()) {
      return recusar(
        "passa_da_parceria",
        `O convite não pode valer além da parceria, que vence em ${isencao.validaAte.toISOString()}.`,
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
/**
 * POR QUE um convite não virou parceria.
 *
 * `null` significa que virou — resolveu. Todo o resto é uma recusa, e cada
 * recusa tem nome próprio. Antes disto os cinco caminhos devolviam o mesmo
 * `null` indistinguível: o parceiro virava visitante anônimo, era cobrado, e a
 * casa não tinha como saber que isso havia acontecido. *Mecanismo cuja falha é
 * invisível não é mecanismo seguro — é mecanismo mudo.*
 *
 * `sem_token` é o único que NÃO é anormal: é o visitante que chegou sem link,
 * que é a maioria. Os outros cinco nunca são normais.
 */
export type MotivoDaRecusaDoConvite =
  | "sem_token"
  | "token_desconhecido"
  | "revogado"
  | "vencido"
  | "parceria_nao_esta_viva"
  | "erro_de_banco";

export type ConviteExaminado = {
  convite: ConviteResolvido | null;
  motivo: MotivoDaRecusaDoConvite | null;
};

/**
 * O mesmo exame de sempre, mas ele DIZ o que decidiu.
 *
 * A decisão é byte a byte a de antes — fail-closed em todo ramo. O que muda é
 * que a recusa deixa de ser muda.
 */
export async function examinarConviteDeParceria(
  token: unknown,
  agora: Date = new Date(),
): Promise<ConviteExaminado> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return { convite: null, motivo: "sem_token" };
  try {
    const convite = await prisma.conviteDeParceria.findUnique({
      where: { token: t },
      select: { id: true, clientId: true, expiraEm: true, revogadoEm: true },
    });
    if (!convite) return { convite: null, motivo: "token_desconhecido" };
    if (convite.revogadoEm) return { convite: null, motivo: "revogado" };
    if (convite.expiraEm.getTime() <= agora.getTime()) return { convite: null, motivo: "vencido" };

    // A PARCERIA É CONFERIDA AGORA, não na cunhagem. É isto que faz revogar a
    // parceria matar o convite no mesmo instante, sem caçar link nenhum.
    const parceria = await autorizacaoViva(convite.clientId, agora);
    if (!parceria) return { convite: null, motivo: "parceria_nao_esta_viva" };

    // Trilha, depois da decisão e sem poder derrubá-la.
    void prisma.conviteDeParceria
      .update({ where: { id: convite.id }, data: { usos: { increment: 1 }, ultimoUsoEm: agora } })
      .catch(() => { /* trilha não barra parceiro legítimo */ });

    return { convite: { clientId: convite.clientId, parceria }, motivo: null };
  } catch {
    // Banco fora do ar = "não sei se é parceria" = CONTINUA PERGUNTANDO.
    return { convite: null, motivo: "erro_de_banco" };
  }
}

/**
 * RESOLVE um convite: token → cliente → isenção viva.
 *
 * Devolve `null` em TODO caminho que não seja "este token é bom E a parceria
 * está viva agora". Quem chama trata `null` como *visitante anônimo* — que é o
 * comportamento de sempre, e o seguro.
 *
 * ⚠️ **Recusa com token na mão nunca é silenciosa.** Quando alguém APRESENTOU
 * um token e ele não valeu, isto grita no log com marcador estável. É a
 * diferença entre "ninguém tinha convite" e "um parceiro foi tratado como
 * estranho" — e foi exatamente essa diferença que a casa não soube ver quando
 * um parceiro recebeu cobrança na tela.
 */
export async function resolverConviteDeParceria(
  token: unknown,
  agora: Date = new Date(),
): Promise<ConviteResolvido | null> {
  const { convite, motivo } = await examinarConviteDeParceria(token, agora);
  if (motivo && motivo !== "sem_token") {
    // Não vaza o token: ele é credencial. Só o motivo e um prefixo curto para
    // casar com o link que a pessoa diz ter usado.
    const t = typeof token === "string" ? token.trim() : "";
    console.warn(
      `[CONVITE-RECUSADO] motivo=${motivo} prefixo=${t.slice(0, 8)}… ` +
      `— alguem apresentou um convite e foi tratado como visitante anonimo`,
    );
  }
  return convite;
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
