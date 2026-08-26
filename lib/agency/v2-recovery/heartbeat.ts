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

/**
 * CADA RELÓGIO TEM A TOLERÂNCIA DELE — e ela sai de medida, não de gosto.
 *
 * ── Por que deixou de ser um número só (26/08/2026) ────────────────────────
 *
 * Era 30 minutos para todos. `cron-v2` é chamado pelo despertador, que bate de
 * 5 em 5 min dentro do servidor: 30 min é folgado e certo. `cron-execute` é
 * chamado por um workflow do GitHub Actions, e `schedule` do GitHub é
 * best-effort — o próprio `.github/workflows/cron-execute.yml` já dizia isso,
 * com números medidos em 06/08/2026.
 *
 * Medido de novo em 26/08/2026, sobre os 30 disparos reais das últimas 20h:
 * intervalo mediano **41,6 min**, p90 **57,6 min**, máximo **67,8 min** — o
 * cron de dez em dez minutos do arquivo nunca foi de 10 em 10. Ou seja: com 30 min, o alarme de
 * "atrasado" dispararia na METADE das janelas de um relógio que está
 * funcionando. Alarme que grita sobre o normal é alarme que ensina a ignorar
 * alarme — a lição que esta casa já registrou em `instrumentation.ts`.
 *
 * 180 min é ~2,6× o pior intervalo observado: não grita sobre o normal e ainda
 * pega um relógio morto de verdade (três janelas perdidas seguidas).
 */
export const TOLERANCIA_POR_RELOGIO: Record<string, number> = {
  // Dentro do servidor, a cada 5 min.
  "cron-v2": 30,
  // GitHub Actions `schedule`: best-effort, medido em 41,6 min de mediana.
  "cron-execute": 180,
};

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
    // O argumento continua sendo o PISO para quem não tem tolerância própria:
    // relógio novo não passa a ter alarme frouxo por omissão.
    const tolerancia = TOLERANCIA_POR_RELOGIO[nome] ?? toleranciaMinutos;
    const atrasoMs = agora.getTime() - batida.ultimaBatida.getTime();
    if (atrasoMs > tolerancia * 60_000) {
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
