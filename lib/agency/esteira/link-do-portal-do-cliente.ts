// link-do-portal-do-cliente.ts — O LINK QUE O AVISO CARREGA TEM DE ABRIR.
//
// ── 🔴 O DEFEITO, MEDIDO CONTRA O CÓDIGO EM 15/08/2026 ─────────────────────
//
// `avisos.ts` montava o link do portal assim:
//
//     select: { phone: true, portalToken: true }          // Client.portalToken
//     return `${base}/portal/access/${portalToken}`
//
// E TODA porta do portal resolve o token pelo OUTRO lado:
//
//     prisma.portalAccess.findUnique({ where: { token } })
//     // portal-access-service.ts:46 (validatePortalAccess)
//     // → resolvePortalClient → /api/portal/vista, /api/media, /api/portal/*
//
// `Client.portalToken` e `PortalAccess.token` são **duas colunas de duas
// tabelas diferentes**, geradas independentemente (`@default(cuid())` numa,
// `randomBytes(32)` na outra). Nada no repositório copia uma na outra —
// `createPortalAccess` e `levantarLinksDoPortal` sorteiam token novo, e nenhuma
// consulta do repositório procura `client.findUnique({ where: { portalToken } })`.
//
// **Consequência:** todo aviso que a esteira mandou ao cliente carregava um link
// que responde **403 "Acesso negado"**. O aviso saía, o registro ficava de
// comprovante, o painel dizia "enviado" — e o cliente clicava num link morto.
// É a pior forma do defeito que esta casa já catalogou: a ponte existe dos dois
// lados e o meio não liga. Aqui é pior ainda, porque o lado de dentro tem
// comprovante de entrega.
//
// ── A REGRA QUE ESTE MÓDULO CARREGA ────────────────────────────────────────
//
// 1. **Uma leitura, não duas.** Quem precisa do link do portal de um cliente
//    chama aqui. Duas montagens do mesmo link divergem, e foi assim que a que
//    diverge ficou meses apontando para lugar nenhum.
//
// 2. **NÃO EMITE NADA.** Este módulo lê token vivo e só. Emitir credencial de
//    acesso por efeito colateral de "montar um aviso" é como credencial vaza —
//    a mesma decisão declarada em `links-do-portal.ts`. Cliente sem token vivo
//    volta com `link: null` e o MOTIVO escrito.
//
// 3. **Sem link, o aviso não some — ele fica sem link e diz por quê.** Ausência
//    de informação não é informação: mandar o texto sem o endereço é melhor do
//    que mandar um endereço que não abre, e muito melhor do que não mandar nada.

import { prisma } from "@/lib/db/client";
import { HOST_PADRAO, tokenVivo } from "@/lib/agency/esteira/links-do-portal";

export interface LinkDoPortal {
  /** O endereço que ABRE. Nulo sempre que não há token vivo — nunca inferido. */
  link: string | null;
  /** Em português. É o que aparece no lugar do link. */
  motivo: string;
  /** O token usado, para perícia. Nunca vai para tela de cliente. */
  token: string | null;
}

/** A base do link. O host próprio é o que funciona ponta a ponta (é o único
 *  registrado como redirect no Google); o do ambiente vence quando existe,
 *  porque em pré-produção o host próprio apontaria o cliente para a produção. */
export function baseDoPortal(): string {
  const doAmbiente = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim();
  return (doAmbiente || HOST_PADRAO).replace(/\/+$/, "");
}

/**
 * O link de portal VIVO deste cliente.
 *
 * Procura nos dois caminhos de posse que o `PortalAccess` admite — `clientId`
 * direto e via `clientRequestId` —, porque o cliente que nasceu de uma
 * solicitação tem o acesso preso à solicitação, e ler só um dos dois deixaria
 * metade dos clientes sem link com cara de "nunca teve portal".
 *
 * Nunca lança: um banco fora do ar não pode derrubar o aviso que o originou.
 */
export async function linkVivoDoPortal(
  clientId: string,
  agora: Date = new Date(),
): Promise<LinkDoPortal> {
  if (!clientId?.trim()) {
    return { link: null, motivo: "sem cliente não há portal", token: null };
  }
  try {
    const solicitacoes = await prisma.clientRequestDb.findMany({
      where: { clientId },
      select: { id: true },
      take: 50,
    }).catch(() => [] as Array<{ id: string }>);

    const acessos = await prisma.portalAccess.findMany({
      where: {
        OR: [
          { clientId },
          ...(solicitacoes.length > 0
            ? [{ clientRequestId: { in: solicitacoes.map((s) => s.id) } }]
            : []),
        ],
      },
      orderBy: { grantedAt: "desc" },
      take: 50,
    });

    const bom = acessos.find((a) => tokenVivo(a, agora));
    if (!bom) {
      return {
        link: null,
        token: null,
        motivo: acessos.length === 0
          ? "este cliente nunca teve token de portal — nada foi emitido aqui, porque emitir credencial é ato explícito"
          : "todos os tokens de portal deste cliente estão revogados ou vencidos — nada foi emitido aqui",
      };
    }

    return {
      link: `${baseDoPortal()}/portal/access/${bom.token}`,
      token: bom.token,
      motivo: "token de portal vivo, reaproveitado — nada foi gravado",
    };
  } catch (e) {
    // Falha de leitura NUNCA vira "não tem portal": as duas coisas são opostas,
    // e confundi-las faria a fila mandar cliente com portal para o cadastro.
    return {
      link: null,
      token: null,
      motivo: `não consegui ler o portal deste cliente: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}`,
    };
  }
}
