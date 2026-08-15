// HEARTBEAT DO RELÓGIO — ausência de batida é achado, não silêncio.
//
// Marco 6 da V2. "Scheduler com heartbeat e alerta por ausência": o relógio
// que roda BATE; quem audita pergunta "quem não bateu?". Ausência de alerta
// não é ausência de problema — por isso o detector devolve também os relógios
// que NUNCA bateram (esperados mas sem linha), não só os atrasados.

export interface BatidaDeRelogio {
  relogio: string;
  ultimaBatida: Date;
}

export interface RelogioAusente {
  relogio: string;
  motivo: "nunca_bateu" | "atrasado";
  atrasoMinutos: number | null;
}

export function detectarAusencias(
  esperados: string[],
  batidas: BatidaDeRelogio[],
  agora: Date,
  toleranciaMinutos: number,
): RelogioAusente[] {
  const porNome = new Map(batidas.map((b) => [b.relogio, b]));
  const ausentes: RelogioAusente[] = [];
  for (const nome of esperados) {
    const batida = porNome.get(nome);
    if (!batida) {
      ausentes.push({ relogio: nome, motivo: "nunca_bateu", atrasoMinutos: null });
      continue;
    }
    const atrasoMs = agora.getTime() - batida.ultimaBatida.getTime();
    if (atrasoMs > toleranciaMinutos * 60_000) {
      ausentes.push({ relogio: nome, motivo: "atrasado", atrasoMinutos: Math.floor(atrasoMs / 60_000) });
    }
  }
  return ausentes;
}

/** Os relógios que a casa espera ver batendo (os crons existentes + o da V2). */
export const RELOGIOS_ESPERADOS = [
  "cron-execute",
  "cron-v2",
] as const;
