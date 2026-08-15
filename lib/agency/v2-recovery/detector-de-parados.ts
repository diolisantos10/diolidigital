// O DETECTOR DE TAREFA PARADA — por estado e SLA, nunca por impressão.
//
// Marco 6 da V2. "Detector de tarefa parada por estado e SLA": cada estado
// canônico tem um tempo além do qual ficar parado é achado com dono. Estado
// sem SLA declarado NÃO alarma — mas aparece na lista de "sem régua", porque
// silêncio de régua também é informação.

export interface ItemMonitorado {
  id: string;
  entidadeTipo: string;
  estadoCanonico: string | null;
  atualizadoEm: Date;
}

/** Horas paradas toleradas por estado. Régua inicial — ajustável por decisão. */
export const SLA_POR_ESTADO_HORAS: Record<string, number> = {
  intake: 24,
  qualified: 48,
  briefing_incomplete: 72,
  briefing_ready: 48,
  proposal: 96,
  direction_pending: 72,
  production: 72,
  blocked_materials: 96,
  internal_review: 48,
  client_approval: 168, // o prazo corre com o cliente; uma semana antes de alarmar
  revision: 72,
  implementation: 48,
};

export interface ItemParado {
  id: string;
  entidadeTipo: string;
  estadoCanonico: string;
  horasParado: number;
  slaHoras: number;
}

export interface ResultadoDoDetector {
  parados: ItemParado[];
  semRegua: string[]; // estados encontrados sem SLA declarado
}

export function detectarParados(itens: ItemMonitorado[], agora: Date): ResultadoDoDetector {
  const parados: ItemParado[] = [];
  const semRegua = new Set<string>();
  for (const item of itens) {
    if (!item.estadoCanonico) continue; // sem derivação = assunto da leitura dupla, não daqui
    const sla = SLA_POR_ESTADO_HORAS[item.estadoCanonico];
    if (sla === undefined) {
      // Estados terminais e de ciclo não têm régua de propósito; os demais
      // aparecem para ganhar uma.
      if (!["cancelled", "closed", "cycle_closed", "measurement", "negotiation", "accepted", "direction_approved", "direction_revision"].includes(item.estadoCanonico)) {
        semRegua.add(item.estadoCanonico);
      }
      continue;
    }
    const horas = (agora.getTime() - item.atualizadoEm.getTime()) / 3_600_000;
    if (horas > sla) {
      parados.push({
        id: item.id,
        entidadeTipo: item.entidadeTipo,
        estadoCanonico: item.estadoCanonico,
        horasParado: Math.floor(horas),
        slaHoras: sla,
      });
    }
  }
  return { parados, semRegua: [...semRegua].sort() };
}
