// A VARREDURA DO PM — o cargo que persegue, e não o que espera ser chamado.
//
// ── O DEFEITO, NAS PALAVRAS DO CEO (15/08/2026) ────────────────────────────
//
//   "O PM está muito deixando a desejar. Ele era o que deveria estar mais
//    correndo entre os departamentos, está parado."
//
// Estava mesmo, e por três razões que se somavam:
//
//  1. A ficha da linha só tinha entrada REATIVA ("pedido com aceite comercial
//     OU evento de esteira"). Sem pedido chegando, o PM não tinha o que fazer.
//  2. A métrica cobrava "zero pedidos parados sem despacho" — mas a ficha não
//     dava a ele nenhum meio de DESCOBRIR um pedido parado. Cobrar resultado
//     sem dar instrumento é desenho ruim, não indisciplina do agente.
//  3. O relógio da casa batia a cada 5 minutos fazendo uma dúzia de coisas, e
//     não chamava o PM em nenhuma delas.
//
// Este módulo é a resposta às três. Ele não produz nada e não decide nada: ele
// OLHA e diz o que está parado, com nome, tempo e o que fazer. É o instrumento
// que faltava — puro, testável, sem banco e sem rede.
//
// A doutrina que ele obedece: ausência de alerta não é ausência de problema.
// Handoff entregue e nunca aceito é o caso clássico — para o remetente "já
// entreguei", para o destinatário "não chegou", e a esteira para no meio sem
// ninguém sentir falta. Aqui ele aparece.

import { SLA_POR_ESTADO_HORAS } from "@/lib/agency/v2-recovery/detector-de-parados";

/** Quantas horas um handoff pode ficar sem aceite antes de virar cobrança. */
export const HORAS_ATE_COBRAR_HANDOFF = 4;

/** Depois de cobrar, quanto tempo se espera antes de cobrar de novo. */
export const HORAS_ENTRE_COBRANCAS = 12;

export interface HandoffPendente {
  id: string;
  deDepartamento: string;
  paraDepartamento: string;
  responsavelEntrega: string;
  criadoEm: Date;
  /** Última cobrança registrada, se já houve alguma. */
  cobradoEm?: Date | null;
}

export interface TrabalhoMonitorado {
  id: string;
  entidadeTipo: string;
  estadoCanonico: string | null;
  atualizadoEm: Date;
  /** De quem é a bola hoje; ausente = ninguém assumiu, que é pior. */
  donoDepartamento?: string | null;
}

export type MotivoDaCobranca =
  /** Bastão entregue e nunca aceito — a esteira parou no meio. */
  | "handoff_sem_aceite"
  /** O estado passou do prazo da régua da casa. */
  | "sla_estourado"
  /** Trabalho andando sem dono declarado — ninguém vai puxar. */
  | "sem_dono";

export interface Cobranca {
  motivo: MotivoDaCobranca;
  /** Quem o PM vai cobrar. */
  departamento: string;
  /** O que exatamente está parado. */
  referencia: string;
  horasParado: number;
  /** A frase que o PM diz — em português, com o que fazer. Nunca "deu problema". */
  pedido: string;
  /** Já foi cobrado antes e continua parado? Isso muda o tom e vira escalada. */
  reincidente: boolean;
}

export interface ResultadoDaVarredura {
  cobrancas: Cobranca[];
  /** Some tudo o que o PM encontrou parado, para o consolidado dele. */
  totalParado: number;
  /**
   * O que ele encontrou e NÃO soube cobrar — estado sem régua de SLA. Sobe
   * declarado, porque um estado sem prazo é um lugar onde trabalho pode
   * dormir para sempre sem ninguém notar.
   */
  estadosSemRegua: string[];
}

function horasEntre(depois: Date, antes: Date): number {
  return (depois.getTime() - antes.getTime()) / 3_600_000;
}

/**
 * A varredura. Pura de propósito: recebe o retrato, devolve o que cobrar.
 *
 * Quem lê o banco e quem escreve a cobrança são outros — aqui mora só o
 * julgamento, que é a parte que precisa de teste e que precisa ser a mesma
 * toda vez.
 */
export function varrerOQueEstaParado(
  entrada: { handoffs: HandoffPendente[]; trabalhos: TrabalhoMonitorado[] },
  agora: Date,
): ResultadoDaVarredura {
  const cobrancas: Cobranca[] = [];
  const estadosSemRegua = new Set<string>();

  // ── 1. O bastão que ninguém pegou ────────────────────────────────────────
  for (const h of entrada.handoffs) {
    const horas = horasEntre(agora, h.criadoEm);
    if (horas < HORAS_ATE_COBRAR_HANDOFF) continue;
    // Já cobrado há pouco: cobrar de novo agora seria ruído, não gestão.
    if (h.cobradoEm && horasEntre(agora, h.cobradoEm) < HORAS_ENTRE_COBRANCAS) continue;

    const reincidente = Boolean(h.cobradoEm);
    cobrancas.push({
      motivo: "handoff_sem_aceite",
      departamento: h.paraDepartamento,
      referencia: h.id,
      horasParado: Math.floor(horas),
      reincidente,
      pedido: reincidente
        ? `${h.paraDepartamento}: o trabalho que ${h.responsavelEntrega} (${h.deDepartamento}) entregou continua sem aceite há ${Math.floor(horas)}h, e já foi cobrado uma vez. Aceite agora ou diga o que impede — sem resposta, isto sobe como bloqueio.`
        : `${h.paraDepartamento}: ${h.responsavelEntrega} (${h.deDepartamento}) entregou há ${Math.floor(horas)}h e ninguém aceitou. Confira os critérios e aceite, ou devolva dizendo o que falta.`,
    });
  }

  // ── 2. O trabalho que passou do prazo ────────────────────────────────────
  for (const t of entrada.trabalhos) {
    if (!t.estadoCanonico) continue; // sem estado derivado: assunto da leitura dupla
    const sla = SLA_POR_ESTADO_HORAS[t.estadoCanonico];
    const horas = horasEntre(agora, t.atualizadoEm);

    if (sla === undefined) {
      // Estado sem régua não vira cobrança inventada — vira achado declarado.
      estadosSemRegua.add(t.estadoCanonico);
      continue;
    }
    if (horas <= sla) continue;

    // Sem dono é pior que atrasado: atrasado alguém empurra, sem dono ninguém.
    if (!t.donoDepartamento) {
      cobrancas.push({
        motivo: "sem_dono",
        departamento: "project-management",
        referencia: `${t.entidadeTipo}:${t.id}`,
        horasParado: Math.floor(horas),
        reincidente: false,
        pedido: `Sem dono: ${t.entidadeTipo} ${t.id} está em "${t.estadoCanonico}" há ${Math.floor(horas)}h e ninguém assumiu. O PM define o dono agora — trabalho sem dono não anda sozinho.`,
      });
      continue;
    }

    cobrancas.push({
      motivo: "sla_estourado",
      departamento: t.donoDepartamento,
      referencia: `${t.entidadeTipo}:${t.id}`,
      horasParado: Math.floor(horas),
      reincidente: false,
      pedido: `${t.donoDepartamento}: ${t.entidadeTipo} ${t.id} está em "${t.estadoCanonico}" há ${Math.floor(horas)}h, e o prazo desse estado é ${sla}h. Entregue, ou diga o que está travando com nome e próxima ação.`,
    });
  }

  // O que está parado há mais tempo vem primeiro: é a fila do PM, não uma lista.
  cobrancas.sort((a, b) => b.horasParado - a.horasParado);

  return {
    cobrancas,
    totalParado: cobrancas.length,
    estadosSemRegua: [...estadosSemRegua],
  };
}

/**
 * O consolidado em uma frase — o jeito que esta casa reporta: conclusão
 * primeiro, e o vazio explicando o próprio vazio.
 */
export function frazeDaVarredura(r: ResultadoDaVarredura): string {
  if (r.totalParado === 0) {
    return "Nada parado além do prazo: todo handoff foi aceito e nenhum trabalho estourou o SLA do estado em que está.";
  }
  const porMotivo = new Map<MotivoDaCobranca, number>();
  for (const c of r.cobrancas) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
  const partes: string[] = [];
  const rotulos: Record<MotivoDaCobranca, string> = {
    handoff_sem_aceite: "entrega(s) sem aceite",
    sla_estourado: "prazo(s) estourado(s)",
    sem_dono: "sem dono",
  };
  for (const [motivo, n] of porMotivo) partes.push(`${n} ${rotulos[motivo]}`);
  const pior = r.cobrancas[0]!;
  return `${r.totalParado} ponto(s) parado(s): ${partes.join(" · ")}. O mais antigo está há ${pior.horasParado}h com ${pior.departamento}.`;
}
