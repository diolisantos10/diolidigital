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

// ── 15/08/2026 — O FREIO, E A CLASSIFICAÇÃO QUE ESTAVA ERRADA ───────────────
//
// Esta é a SEGUNDA perna que dispara WhatsApp para cliente real na mesma batida
// do relógio (a primeira é `lib/integrations/meta/notifications.ts`): 50 lá + 50
// aqui = 100 mensagens no mesmo minuto depois de dias de silêncio. As duas
// passaram a ler o MESMO freio, `WHATSAPP_SAIDA`, fechado por padrão — ver
// `lib/agency/freios-de-saida.ts`.
//
// 🔴 E o parecer do especialista `meta` achou um defeito no coração deste
//    arquivo: a régua do "temporário" casava `janela|24h`. Ou seja, a casa
//    tratava **"a plataforma disse não"** como **"a rede caiu"** e re-tentava
//    até 3× contra uma REGRA DE POLÍTICA. Fora da janela de 24h a Meta recusa
//    texto livre por regra, não por instabilidade: nenhuma tentativa número 3
//    abre uma janela que a política fechou — e insistir contra a regra é
//    exatamente o que a Meta chama de automação fora das regras, que já custou
//    a conta de anúncios desta casa em 03/08/2026.
//
//    Recusa por política virou classe PRÓPRIA: não reenvia, aparece com o
//    conserto escrito, e o conserto é template aprovado ou mão humana.

import { prisma } from "@/lib/db/client";
import { whatsappLiberado, freioDoWhatsapp, type FreioPuxado } from "@/lib/agency/freios-de-saida";

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
 *  erro mais caro dos dois.
 *
 *  ⚠️ `janela`, `24h` e `recusou o envio` SAÍRAM daqui em 15/08/2026 e foram
 *  para `POLITICA`. Ver o cabeçalho. */
const TEMPORARIO = /rede|timeout|tempo esgotado|indispon|rate|limite de envio/i;

/** A PLATAFORMA DISSE NÃO. Não é o canal que caiu — é a regra. Re-tentar aqui
 *  não é insistência inútil como no caso do cadastro: é infração, e a punição é
 *  no app, não na mensagem. Conferido ANTES de `TEMPORARIO`, porque o texto de
 *  uma recusa de política pode conter palavra que a outra régua reconheceria. */
const POLITICA = /janela|24h|template|opt-?in|recusou o envio|n[ãa]o autorizad|pol[íi]tica|policy|#13\d/i;

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
  /** Avisos que a PLATAFORMA recusou por regra. Não se re-tenta regra. */
  barradosPorPolitica: Array<{ avisoId: string; motivo: string; oQueFazer: string }>;
  /** Ficaram na fila porque o freio da saída de WhatsApp está fechado. NÃO
   *  foram consumidos: nada enviado, nada marcado, nada escrito. */
  retidos: number;
  /** O freio que segurou esta rodada, ou `null` quando ele está solto. */
  freio: FreioPuxado | null;
}

/** O que fazer com uma recusa de política. É o conserto, não o sintoma — e é
 *  trabalho de gente, porque template aprovado leva dias e opt-in é do cliente. */
const O_QUE_FAZER_COM_POLITICA =
  "a plataforma recusou por REGRA, não por instabilidade — re-tentar é infração, não insistência. " +
  "Fora da janela de 24h só sai template aprovado, e esta casa manda texto livre. " +
  "Resolve-se com template aprovado ou com alguém mandando à mão.";

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
  const saida: Cobranca = {
    reenviados: [], precisamDeCadastro: [], desistidos: [],
    barradosPorPolitica: [], retidos: 0, freio: null,
  };

  const limite = new Date(agora.getTime() - HORAS_ATE_COBRAR * 60 * 60 * 1000);
  const parados = await prisma.clientNotice.findMany({
    where: { workspaceId, status: "pendente", createdAt: { lte: limite } },
    orderBy: { createdAt: "asc" },
    take: 50,
  }).catch(() => []);

  // ── O FREIO, DEPOIS DE MEDIR E ANTES DE AGIR ──────────────────────────────
  // Fechado, a rodada termina aqui: não reenvia, não marca `retryCount`, não
  // escreve `failReason`, não desiste de ninguém. A fila fica IDÊNTICA ao que
  // era — inclusive o contador de tentativas, porque uma tentativa que não
  // aconteceu não pode gastar uma das três que o aviso tem.
  //
  // O que sobra é a contagem, e ela sobe ao pulso: freio silencioso vira fila
  // morta invisível, que é a cicatriz que esta casa já tem.
  if (!whatsappLiberado()) {
    saida.retidos = parados.length;
    saida.freio = freioDoWhatsapp(parados.length);
    return saida;
  }

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

    // A PLATAFORMA DISSE NÃO — antes da régua do temporário, de propósito.
    // Não reenvia e não escreve nada: a recusa por regra não é tentativa
    // gasta, e carimbar o registro a cada 5 minutos só encheria o painel de
    // ruído sobre um fato que não mudou.
    if (POLITICA.test(motivo)) {
      saida.barradosPorPolitica.push({
        avisoId: aviso.id,
        motivo,
        oQueFazer: O_QUE_FAZER_COM_POLITICA,
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
