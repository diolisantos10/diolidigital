// proposta-parada.ts — a proposta ESCRITA que nunca chegou ao cliente.
//
// ═══ O CASO, COM HORA E NÚMERO (8ª volta, 26/08/2026) ════════════════════════
//
// A solicitação do cliente oculto ficou **27 minutos** em `proposal_pending`
// com a proposta pronta — 6 artefatos escritos — e produziu, nesse período:
// **zero cards de aprovação, zero eventos**. O portal dele dizia "Conhecendo o
// seu negócio · 0%". Foi preciso empurrar à mão
// (`POST /api/admin/reset-request {action:"send-proposal"}`) — o ÚNICO empurrão
// por defeito da volta inteira.
//
// ═══ O QUE FALTAVA NÃO ERA A PERNA. ERA O OLHO ═══════════════════════════════
//
// A casa tem perna para o "pronto e parado" um degrau ADIANTE: o pacote de
// entregas que ficou pronto e não foi apresentado tem varredura, tem dono e é
// apresentado sozinho pelo relógio (`apresentacao-de-pacote-pronto`). Uma etapa
// antes, no funil comercial, **nenhuma consulta desta casa procurava por isto**.
// A solicitação não aparecia em varredura nenhuma porque ela não estava
// FALHANDO: estava num estado válido, quieta, com o número certo dentro.
//
// A regra da casa é: **nada pronto pode ficar parado sem dono e sem próxima
// ação**. Um estado terminal silencioso é a forma mais cara de defeito que esta
// casa conhece — foi assim que o Sushi Cazza esperou 51 dias.
//
// ═══ O QUE ESTE MÓDULO FAZ, E O QUE ELE DELIBERADAMENTE NÃO FAZ ══════════════
//
// Ele OLHA. Não escreve proposta, não manda e-mail, não cria card, não muda
// status. A perna que age lê daqui (`despertador.ts`) — e a separação é o que
// permite a mesma leitura servir ao Pulso, à varredura e a quem for depurar,
// sem que nenhum deles precise ter permissão de escrever.
//
// E ele não INVENTA a espera: o relógio da paciência começa no `updatedAt`, que
// é o último momento em que alguma coisa de fato aconteceu com a solicitação.

import { prisma } from "@/lib/db/client";
import { temNumero } from "./orcamento-do-briefing";

/**
 * Quanto tempo uma proposta pronta pode ficar quieta antes de virar notícia.
 *
 * Vinte minutos, e o número tem origem: a parada medida durou 27 e ninguém a
 * viu. O limite tem de ser MENOR que o dano medido, senão a leitura nova teria
 * deixado passar o próprio caso que a produziu. E não pode ser tão curto que
 * transforme a operação normal em alarme — a entrega do orçamento e o aceite do
 * cliente levam minutos, não segundos.
 */
export const MINUTOS_DE_PACIENCIA = 20;

/** Os estados em que a proposta JÁ deveria estar na mão do cliente. */
export const ESTADOS_COM_PROPOSTA = ["proposal_pending", "proposal", "quoted", "proposal_sent"] as const;

/** Quantas paradas se lê por rodada. Fila que se lê inteira é a próxima parada
 *  desta casa quando o banco crescer — dívida declarada, com dono. */
const JANELA = 40;

export interface PropostaParada {
  clientRequestId: string;
  negocio: string;
  status: string;
  /** Há quantos minutos nada acontece com esta solicitação. */
  paradaHaMinutos: number;
  /** A solicitação tem número calculado? Proposta sem número não é proposta
   *  escrita — é briefing esperando, e ESSA fila já tem dono (`orcamento`). */
  temEstimativa: boolean;
  /** O cliente chegou a receber alguma coisa da casa? */
  mensagensParaOCliente: number;
  /** Existe porta de aceite aberta para ele decidir? Sem ela, o cliente não tem
   *  como responder nem que queira — e cobrar resposta de quem não tem botão é
   *  a mesma mentira de cobrar material que nunca foi pedido. */
  temPortaDeAceite: boolean;
  /** Quem tem a bola. */
  dono: "sdr" | "cliente";
  /** A próxima ação, em português, para gente ler e agir. */
  proximaAcao: string;
}

/**
 * As propostas prontas que estão paradas — e, para cada uma, de quem é a bola.
 *
 * ⚠️ **A distinção que faz esta leitura valer alguma coisa**: parada com o
 * CLIENTE e parada com a CASA são fatos opostos e não cabem no mesmo balde.
 *
 *   • a casa escreveu a proposta e o cliente NÃO RECEBEU nada (nem mensagem,
 *     nem porta de aceite) → a bola é da CASA. É o caso medido, e é defeito;
 *   • o cliente recebeu e ainda não respondeu → a bola é dele. Não é defeito, é
 *     a espera legítima do funil — e mesmo assim ela é NOMEADA, porque proposta
 *     que envelhece calada é venda que morre sem ninguém saber.
 *
 * Nunca lança: leitura que derruba a rodada das outras pernas é pior do que
 * leitura que falta. Falha vira lista vazia — e lista vazia aqui é "não medido",
 * não "não há". Quem chama declara a diferença.
 */
export async function propostasParadas(agora: Date = new Date()): Promise<PropostaParada[]> {
  const corte = new Date(agora.getTime() - MINUTOS_DE_PACIENCIA * 60_000);

  const candidatas = await prisma.clientRequestDb
    .findMany({
      where: { status: { in: [...ESTADOS_COM_PROPOSTA] }, updatedAt: { lt: corte } },
      orderBy: { updatedAt: "asc" },
      take: JANELA,
      select: { id: true, businessName: true, status: true, updatedAt: true, briefingJson: true },
    })
    .catch(() => []);
  if (candidatas.length === 0) return [];

  const ids = candidatas.map((c) => c.id);
  const [mensagens, portas] = await Promise.all([
    prisma.portalMessage
      .groupBy({ by: ["clientRequestId"], where: { clientRequestId: { in: ids }, authorRole: "team" }, _count: { _all: true } })
      .catch(() => [] as Array<{ clientRequestId: string | null; _count: { _all: number } }>),
    prisma.portalAccess
      .findMany({ where: { clientRequestId: { in: ids } }, select: { clientRequestId: true } })
      .catch(() => [] as Array<{ clientRequestId: string | null }>),
  ]);

  const quantasMensagens = new Map<string, number>();
  for (const m of mensagens) if (m.clientRequestId) quantasMensagens.set(m.clientRequestId, m._count._all);
  const comPorta = new Set(portas.map((p) => p.clientRequestId).filter((x): x is string => !!x));

  return candidatas.map((c) => {
    const mensagensParaOCliente = quantasMensagens.get(c.id) ?? 0;
    const temPortaDeAceite = comPorta.has(c.id);
    const chegouAoCliente = mensagensParaOCliente > 0 && temPortaDeAceite;
    const paradaHaMinutos = Math.floor((agora.getTime() - c.updatedAt.getTime()) / 60_000);
    const negocio = c.businessName.trim() || "(negócio não informado)";
    return {
      clientRequestId: c.id,
      negocio,
      status: c.status,
      paradaHaMinutos,
      temEstimativa: temNumero(c.briefingJson),
      mensagensParaOCliente,
      temPortaDeAceite,
      dono: chegouAoCliente ? "cliente" : "sdr",
      proximaAcao: chegouAoCliente
        ? `Fazer o follow-up com ${negocio} — a proposta está com ele há ${paradaHaMinutos} min sem resposta.`
        : `ENTREGAR a proposta de ${negocio}: ${!temPortaDeAceite ? "não existe porta de aceite" : "o cliente não recebeu nenhuma mensagem"}. ` +
          "Sem isso ele não tem como responder nem que queira.",
    } satisfies PropostaParada;
  });
}

/** As que são DEFEITO da casa: escritas e nunca entregues. É a lista que vira
 *  alarme; a outra vira estado. Fatos opostos, baldes opostos. */
export function apenasNaoEntregues(paradas: readonly PropostaParada[]): PropostaParada[] {
  return paradas.filter((p) => p.dono === "sdr");
}

/** Uma frase por parada, para o log e para o Pulso. Batida sem placar não se
 *  audita. */
export function fraseDaParada(p: PropostaParada): string {
  return `${p.negocio} (${p.clientRequestId}): ${p.status} há ${p.paradaHaMinutos} min` +
    `${p.temEstimativa ? " COM número calculado" : " sem número"} — ` +
    `${p.mensagensParaOCliente} mensagem(ns) ao cliente, porta de aceite ${p.temPortaDeAceite ? "aberta" : "AUSENTE"}. ` +
    `Dono: ${p.dono === "sdr" ? "Atendimento" : "cliente"}. Próxima ação: ${p.proximaAcao}`;
}
