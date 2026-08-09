// A FILA QUE SE COBRA — o aviso parado deixa de esperar alguém olhar.
//
// ── O defeito, medido em 09/08/2026 ─────────────────────────────────────────
//
// A esteira envia sozinha. O que não sai cai numa fila de exceção, com o motivo
// registrado (`avisos.ts` → `porQueNaoSaiuSozinho`). Até aqui, certo.
//
// O erro estava no que acontece DEPOIS: nada. O aviso ficava parado até alguém
// abrir o painel e reparar nele. Havia um cliente esperando **7 dias** para
// aprovar uma direção — com o texto pronto o tempo todo, e o motivo dizendo
// exatamente o que faltava.
//
// **Fila de exceção que não se cobra é uma caixa de entrada que ninguém abre.**
//
// ── AS DUAS COISAS QUE ELA FAZ, e por que são diferentes ────────────────────
//
//   1. **Reenvia** o que falhou por motivo TEMPORÁRIO — canal fora do ar, janela
//      da plataforma fechada, erro de rede. Esses voltam sozinhos, e insistir é
//      barato e correto.
//
//   2. **Grita** o que falhou por motivo PERMANENTE — cliente sem telefone,
//      nenhuma conexão configurada. Insistir aqui é inútil: nenhuma tentativa
//      número 40 vai inventar um telefone que ninguém cadastrou. O que resolve é
//      **cadastro**, que é trabalho de gente, e o alerta tem de dizer isso com
//      todas as letras em vez de repetir a tentativa.
//
// Tratar os dois do mesmo jeito é o que produz 288 tentativas por dia contra um
// número que não existe — e faz o painel ensinar a ser ignorado.

import { prisma } from "@/lib/db/client";

/** Depois de quanto tempo um aviso parado deixa de ser "recente" e vira
 *  cobrança. Um dia: menos que isso é ansiedade, mais que isso é o cliente
 *  achando que ninguém o procurou. */
export const HORAS_ATE_COBRAR = 24;

/** Teto de reenvios automáticos por aviso. Depois disto, insistir sozinho vira
 *  a rajada que a casa já pagou caro — o problema deixa de ser o canal e passa
 *  a ser a insistência. */
export const MAX_REENVIOS = 3;

/** Motivos que voltam sozinhos. Tudo que NÃO casa aqui é tratado como
 *  permanente — default-deny, porque insistir contra um defeito permanente é o
 *  erro mais caro dos dois. */
const TEMPORARIO = /janela|24h|rede|timeout|tempo esgotado|indispon|recusou o envio|rate|limite de envio/i;

/** Motivos que só cadastro resolve. Nomeados, porque o alerta tem de dizer o
 *  conserto e não o sintoma. */
const FALTA_CADASTRO = /sem telefone|nenhuma conex/i;

export interface Cobranca {
  reenviados: string[];
  /** Avisos que só cadastro resolve, com o que exatamente falta. */
  precisamDeCadastro: Array<{ avisoId: string; cliente: string; oQueFalta: string }>;
  /** Avisos que esgotaram o teto de reenvio. Param de tentar e viram trabalho
   *  de gente — declarados, nunca abandonados em silêncio. */
  desistidos: string[];
}

function oQueFalta(motivo: string): string {
  if (/sem telefone/i.test(motivo)) return "o telefone do cliente não está cadastrado";
  if (/nenhuma conex/i.test(motivo)) return "não há WhatsApp conectado neste workspace";
  return motivo;
}

/**
 * Olha a fila de exceção e age: reenvia o que é temporário, grita o que é
 * cadastro, e desiste (declarando) do que já insistiu demais.
 *
 * Nunca lança: uma rodada que falha não pode derrubar o relógio da casa.
 */
export async function cobrarAFila(workspaceId: string, agora: Date): Promise<Cobranca> {
  const saida: Cobranca = { reenviados: [], precisamDeCadastro: [], desistidos: [] };

  const limite = new Date(agora.getTime() - HORAS_ATE_COBRAR * 60 * 60 * 1000);
  const parados = await prisma.clientNotice.findMany({
    where: { workspaceId, status: "pendente", createdAt: { lte: limite } },
    orderBy: { createdAt: "asc" },
    take: 50,
  }).catch(() => []);

  for (const aviso of parados) {
    const motivo = aviso.failReason ?? "";
    const tentativas = aviso.retryCount ?? 0;

    if (FALTA_CADASTRO.test(motivo)) {
      // Não reenvia. Nenhuma tentativa inventa um telefone que ninguém
      // cadastrou — e o alerta carrega o conserto, não o sintoma.
      const cliente = await prisma.client.findUnique({
        where: { id: aviso.clientId ?? "" },
        select: { name: true },
      }).catch(() => null);
      saida.precisamDeCadastro.push({
        avisoId: aviso.id,
        cliente: cliente?.name ?? "cliente",
        oQueFalta: oQueFalta(motivo),
      });
      continue;
    }

    if (!TEMPORARIO.test(motivo)) {
      // Motivo que a casa não reconhece: NÃO reenvia. Default-deny — insistir
      // contra um defeito desconhecido é como se descobre, tarde, que ele era
      // permanente.
      saida.precisamDeCadastro.push({
        avisoId: aviso.id,
        cliente: "—",
        oQueFalta: motivo || "o motivo da falha não foi registrado",
      });
      continue;
    }

    if (tentativas >= MAX_REENVIOS) {
      saida.desistidos.push(aviso.id);
      await prisma.clientNotice.update({
        where: { id: aviso.id },
        data: { failReason: `${motivo} — parei de tentar depois de ${MAX_REENVIOS} vezes; precisa de gente` },
      }).catch(() => null);
      continue;
    }

    // Reenvio de verdade: o motivo era temporário e pode ter passado.
    const { avisarCliente } = await import("@/lib/agency/esteira/avisos");
    const r = await avisarCliente({
      workspaceId,
      clientId: aviso.clientId ?? "",
      tipo: (aviso.kind as "direcao" | "material" | "entrega" | "ciclo" | "recompra") ?? "material",
      texto: aviso.body,
      ...(aviso.projectId ? { projectId: aviso.projectId } : {}),
    }).catch(() => null);

    await prisma.clientNotice.update({
      where: { id: aviso.id },
      data: { retryCount: tentativas + 1, ...(r?.enviadoAutomaticamente ? { status: "substituido" } : {}) },
    }).catch(() => null);

    if (r?.enviadoAutomaticamente) saida.reenviados.push(aviso.id);
  }

  return saida;
}
