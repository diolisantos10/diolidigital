// O QUE ESPERA NO PORTÃO — a proposta pronta que a política não deixa sair.
//
// ── O achado que gerou este arquivo (09/08/2026) ────────────────────────────
//
// Três propostas estavam paradas desde junho. O raio-X do dia anterior chamou
// isso de defeito: *"produz proposta e não envia"*. **Estava errado.**
//
// Medindo contra o código: `lib/marketplaces/portao.ts` classifica o envio em
// várias plataformas como **`HUMAN_GATE`** — a política daquela plataforma não
// permite submissão automática, então o sistema **se recusa a mandar sozinho**.
// A proposta parada não é falha: é uma trava funcionando.
//
// **Isso quase custou caro.** O plano dizia "fazer a proposta sair sozinha". Se
// eu tivesse construído aquilo, teria arrancado a proteção que impede a casa de
// violar política de plataforma — o mesmo tipo de erro que restringiu a conta de
// anúncios em 03/08.
//
// ── O QUE FALTAVA DE VERDADE ───────────────────────────────────────────────
//
// Não era automação. Era **visibilidade**: a proposta esperava no portão e
// ninguém era avisado. Uma trava que segura trabalho pronto e não conta a
// ninguém tem o mesmo efeito prático de uma fila morta — a diferença é que esta
// está certa e a outra estava quebrada.
//
// Este arquivo não envia nada, não afrouxa política e não pede exceção. Ele
// **conta**.

import { prisma } from "@/lib/db/client";
import { vereditoDePolitica } from "@/lib/marketplaces/portao";

/** A partir de quantos dias uma proposta parada deixa de ser recente e vira
 *  coisa esquecida. Três dias: menos é ansiedade, mais e o anúncio já foi
 *  fechado por outro. */
export const DIAS_ATE_VIRAR_ESQUECIDA = 3;

export interface NoPortao {
  id: string;
  titulo: string;
  plataforma: string;
  /** Dias parados, CALCULADO — nunca digitado. */
  diasParado: number;
  /** Por que não saiu sozinha. É a frase que a tela mostra. */
  porQue: string;
  /** `true` quando já passou do prazo de virar esquecida. */
  esquecida: boolean;
}

/** A frase por veredito. Diz o CONSERTO, não o sintoma — e deixa claro quando
 *  não há conserto do nosso lado, para ninguém tentar "arrumar a política". */
function porQueNaoSaiu(veredito: string, plataforma: string): string {
  if (veredito === "HUMAN_GATE") {
    return `a política do ${plataforma} não permite envio automático — esta proposta precisa ser enviada por uma pessoa`;
  }
  if (veredito === "BLOCK") {
    return `o ${plataforma} não permite este envio, nem por pessoa. A proposta fica registrada e não vai`;
  }
  return `o envio no ${plataforma} está liberado, mas esta proposta não saiu — isso é defeito, não política`;
}

/**
 * O que está pronto e esperando mão humana.
 *
 * Nunca lança: uma leitura que falha não pode esconder a fila nem derrubar quem
 * a consulta.
 */
export async function oQueEsperaNoPortao(workspaceId: string, agora: Date): Promise<NoPortao[]> {
  const paradas = await prisma.oportunidade.findMany({
    where: {
      workspaceId,
      // Proposta escrita e ainda não decidida. Sem `propostaTexto` não há o que
      // esperar no portão: o trabalho nem chegou a existir.
      propostaTexto: { not: null },
      decididoEm: null,
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  }).catch(() => []);

  return paradas.map((o) => {
    const veredito = vereditoDePolitica(o.plataforma, "enviarProposta");
    const dias = Math.floor((agora.getTime() - o.updatedAt.getTime()) / 86_400_000);
    return {
      id: o.id,
      titulo: o.titulo,
      plataforma: o.plataforma,
      diasParado: dias,
      porQue: porQueNaoSaiu(veredito, o.plataforma),
      esquecida: dias >= DIAS_ATE_VIRAR_ESQUECIDA,
    };
  });
}

/** O resumo que sobe para quem olha a casa. Conclusão primeiro: quantas
 *  esperam, e há quanto tempo espera a mais antiga. */
export async function resumoDoPortao(workspaceId: string, agora: Date): Promise<{
  esperando: number;
  esquecidas: number;
  maisAntigaEmDias: number | null;
}> {
  const fila = await oQueEsperaNoPortao(workspaceId, agora);
  return {
    esperando: fila.length,
    esquecidas: fila.filter((f) => f.esquecida).length,
    // Nulo quando não há nada esperando. NÃO zero: zero diria "a mais antiga
    // espera há zero dias", que é uma afirmação sobre uma fila vazia.
    maisAntigaEmDias: fila.length === 0 ? null : Math.max(...fila.map((f) => f.diasParado)),
  };
}
