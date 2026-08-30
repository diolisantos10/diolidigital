// ─── O LIMITADOR DE RITMO — para a conta não ser banida por parecer robô ───
//
// Item obrigatório da ordem do CEO de 30/08/2026.
//
// ── O INCIDENTE QUE PRODUZIU ESTA PEÇA, E ELE NÃO É DO 99FREELAS ──────────
// Em 03/08/2026, dia do lançamento da Foocci, a Meta restringiu a conta de
// anúncios da agência por "automação que não segue as regras" — operação por
// API em ritmo de máquina, sem ninguém no papel de dizer "isso vai dar ban".
// Foi esse incidente que criou a regra da trava de plataforma desta casa.
//
// Aqui o risco é pior, e a diferença é quem paga: a conta do 99Freelas é a
// PESSOAL do CEO, e as Sanções da plataforma dizem que o banimento **alcança
// outras contas do mesmo usuário**. Errar para o lado de ir devagar custa
// tempo. Errar para o outro custa o canal inteiro e a conta do dono da casa.
//
// ── OS NÚMEROS NÃO MORAM AQUI, E ISSO É DE PROPÓSITO ──────────────────────
// Eles vêm de `docs/plataformas/99freelas/policy.json` → `ritmo_de_operacao`,
// que é a Matriz de Regras por Canal. Número no código é número que ninguém
// audita e que diverge da política em três meses. Além disso, o arquivo de
// política registra a PROCEDÊNCIA de cada número: os desta seção são REGRA DA
// CASA, não do 99Freelas — a plataforma não publica limite de requisições, e
// `anti_bot.rate_limit` é `null`. Ausência de informação não é informação.
//
// ── POR QUE ADIAR E NÃO DESCARTAR ─────────────────────────────────────────
// Exceder o ritmo não é erro do operador: é o freio funcionando. A ação volta
// para a fila com um horário, e fica registrada. Descartar em silêncio é como
// esta casa descobriu, um mês depois, que a conexão de um cliente estava morta.

import politica from "@/docs/plataformas/99freelas/policy.json";

/** O que o limitador precisa saber sobre o que já aconteceu. Vem de quem
 *  persiste — este módulo não lê banco, para poder ser testado sem ele. */
export interface HistoricoDeRitmo {
  /** Quando foi a última ação. `null` = nunca agiu. */
  ultimaAcaoEm: Date | null;
  /** Quantas ações na última hora. */
  acoesNaUltimaHora: number;
  /** Quantas ações no dia corrente. */
  acoesNoDia: number;
}

export interface ConfiguracaoDeRitmo {
  intervaloMinimoSegundos: number;
  maximoPorHora: number;
  maximoPorDia: number;
}

/**
 * Lê a configuração da política, FAIL CLOSED.
 *
 * Qualquer campo ausente, não numérico, negativo ou zero derruba a leitura
 * inteira — e ficar sem configuração **bloqueia toda ação**, nunca libera.
 * É o inverso do default silencioso: um `?? 0` aqui viraria "intervalo mínimo
 * zero", ou seja, ritmo de máquina, que é exatamente o que derrubou a conta na
 * Meta.
 */
export function configuracaoDeRitmo(fonte: unknown = politica): ConfiguracaoDeRitmo | null {
  const raiz = (fonte as Record<string, unknown> | null)?.["ritmo_de_operacao"];
  if (raiz === null || typeof raiz !== "object") return null;
  const r = raiz as Record<string, unknown>;

  const n = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

  const intervalo = n(r["intervalo_minimo_entre_acoes_segundos"]);
  const hora = n(r["maximo_de_acoes_por_hora"]);
  const dia = n(r["maximo_de_acoes_por_dia"]);
  if (intervalo === null || hora === null || dia === null) return null;

  return { intervaloMinimoSegundos: intervalo, maximoPorHora: hora, maximoPorDia: dia };
}

export type RegraDeRitmo =
  | "sem_configuracao"
  | "cedo_demais"
  | "teto_da_hora"
  | "teto_do_dia"
  | "historico_ilegivel";

export type VereditoDeRitmo =
  | { pode: true }
  | { pode: false; regra: RegraDeRitmo; motivo: string; tentarDeNovoEm: Date | null };

/**
 * Pode agir agora?
 *
 * A ordem das checagens não é estética: o teto do DIA vem antes do teto da
 * HORA, e os dois antes do intervalo. Assim a resposta de "tentar de novo em"
 * é a mais LONGA que se aplica — dizer "tente em 45 segundos" a quem já bateu
 * o teto do dia faria o chamador voltar 80 vezes até descobrir a verdade, e
 * cada volta é uma batida a mais na porta da plataforma.
 */
export function avaliarRitmo(
  historico: HistoricoDeRitmo,
  agora: Date,
  config: ConfiguracaoDeRitmo | null = configuracaoDeRitmo(),
): VereditoDeRitmo {
  if (config === null) {
    return {
      pode: false,
      regra: "sem_configuracao",
      motivo:
        "sem configuração de ritmo legível em policy.json → ritmo_de_operacao. " +
        "Sem freio declarado, NADA age: ausência de limite não é permissão de correr.",
      tentarDeNovoEm: null,
    };
  }

  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) {
    return { pode: false, regra: "historico_ilegivel", motivo: "instante atual inválido.", tentarDeNovoEm: null };
  }

  const contagem = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

  const naHora = contagem(historico?.acoesNaUltimaHora);
  const noDia = contagem(historico?.acoesNoDia);
  if (naHora === null || noDia === null) {
    return {
      pode: false,
      regra: "historico_ilegivel",
      motivo:
        "histórico de ritmo ilegível (contagem ausente ou negativa). " +
        "Não saber quantas ações houve é o mesmo que não ter freio — bloqueia.",
      tentarDeNovoEm: null,
    };
  }

  if (noDia >= config.maximoPorDia) {
    return {
      pode: false,
      regra: "teto_do_dia",
      motivo: `teto do dia atingido (${noDia}/${config.maximoPorDia}).`,
      tentarDeNovoEm: proximaMeiaNoite(agora),
    };
  }

  if (naHora >= config.maximoPorHora) {
    return {
      pode: false,
      regra: "teto_da_hora",
      motivo: `teto da hora atingido (${naHora}/${config.maximoPorHora}).`,
      tentarDeNovoEm: new Date(agora.getTime() + 60 * 60 * 1000),
    };
  }

  const ultima = historico?.ultimaAcaoEm ?? null;
  if (ultima !== null) {
    if (!(ultima instanceof Date) || Number.isNaN(ultima.getTime())) {
      return {
        pode: false,
        regra: "historico_ilegivel",
        motivo: "data da última ação ilegível — não se calcula intervalo sobre data inválida.",
        tentarDeNovoEm: null,
      };
    }
    const decorridoMs = agora.getTime() - ultima.getTime();
    const minimoMs = config.intervaloMinimoSegundos * 1000;

    // Última ação NO FUTURO é relógio torto ou dado corrompido. Não se
    // "aproveita" isso como se muito tempo tivesse passado: bloqueia.
    if (decorridoMs < 0) {
      return {
        pode: false,
        regra: "historico_ilegivel",
        motivo: "última ação registrada no futuro — relógio ou registro corrompido.",
        tentarDeNovoEm: null,
      };
    }

    if (decorridoMs < minimoMs) {
      return {
        pode: false,
        regra: "cedo_demais",
        motivo:
          `cedo demais: ${Math.floor(decorridoMs / 1000)}s desde a última ação, ` +
          `mínimo ${config.intervaloMinimoSegundos}s. Ritmo de máquina é o que derrubou ` +
          `a conta de anúncios da casa na Meta em 03/08/2026.`,
        tentarDeNovoEm: new Date(ultima.getTime() + minimoMs),
      };
    }
  }

  return { pode: true };
}

function proximaMeiaNoite(agora: Date): Date {
  const d = new Date(agora.getTime());
  d.setUTCHours(24, 0, 0, 0);
  return d;
}
