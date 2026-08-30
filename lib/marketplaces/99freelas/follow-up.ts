// ─── FOLLOW-UP — a trava contra a sanção de "não responder a tempo" ─────────
//
// ── POR QUE ISTO NÃO É "FASE 11" ────────────────────────────────────────────
// "Não responder o cliente a tempo" é motivo DECLARADO de Violação no
// 99Freelas: ícone de alerta no perfil e 30 dias com as propostas rebaixadas
// para o fim da fila. Um sistema que envia propostas e não acompanha respostas
// constrói exatamente esse cenário — e o custo não aparece em relatório nenhum,
// porque a punição é uma posição pior numa fila que ninguém mede.
//
// ── O NÚMERO É DA CASA, NÃO DA PLATAFORMA. E ISSO ESTÁ ESCRITO ─────────────
// O 99Freelas não publica quantas horas são "a tempo". Então o prazo aqui é
// REGRA DA DIOLI (12 h), declarada como tal na política, e apertada de
// propósito: errar respondendo cedo custa uma mensagem; errar para o outro lado
// custa 30 dias de propostas rebaixadas.
//
// ── 🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA ──────────────────────────────────
// O chat do 99Freelas fica ATRÁS DO LOGIN, e login é BLOCK nesta rodada. Logo
// esta fila NÃO se alimenta sozinha: alguém informa as conversas, ou o e-mail
// de notificação da plataforma é encaminhado. Enquanto for assim, o mecanismo
// existe e a ENTRADA dele não — e isso é risco aberto, não recurso pronto.
//
// Esta ausência é DÍVIDA DECLARADA, não comentário perdido: registro em
// `lib/agency/celula/divida-declarada.ts`, id
// "entrada-de-acompanhamentos-ja-enviados", com dono, prazo e um teste que
// GRITA sozinho quando o prazo vence
// (`__tests__/celula/divida-da-entrada-do-m14.test.ts`). Ver
// docs/celula-prospeccao/despachos/ONDA-4A-C-divida-do-m14.md.

import { politicaDe } from "@/lib/marketplaces/politica";

export interface Conversa {
  /** O projeto/proposta a que a conversa pertence. */
  referencia: string;
  /** Quando o CLIENTE falou pela última vez. */
  ultimaMensagemDoClienteEm: Date;
  /** Quando a AGÊNCIA respondeu pela última vez. `null` = nunca respondeu. */
  ultimaRespostaDaAgenciaEm: Date | null;
}

export type Urgencia = "em_dia" | "atencao" | "vencido";

export interface Pendencia {
  referencia: string;
  urgencia: Urgencia;
  horasSemResposta: number;
  prazoDaCasaHoras: number;
  motivo: string;
}

export interface PrazosDeFollowUp {
  prazoHoras: number;
  alertaHoras: number;
  /** `true` quando o número é da CASA e não da plataforma. */
  ehRegraDaCasa: boolean;
}

export function prazosDeFollowUp(plataforma = "99freelas"): PrazosDeFollowUp {
  const politica = politicaDe(plataforma);
  const f = (politica.cru.follow_up ?? {}) as Record<string, unknown>;
  const daPlataforma = typeof f.prazo_da_plataforma_horas === "number" ? f.prazo_da_plataforma_horas : null;
  const daCasa = typeof f.prazo_da_casa_horas === "number" ? f.prazo_da_casa_horas : 12;
  const alerta = typeof f.alerta_da_casa_horas === "number" ? f.alerta_da_casa_horas : Math.floor(daCasa / 2);
  return {
    prazoHoras: daPlataforma ?? daCasa,
    alertaHoras: alerta,
    ehRegraDaCasa: daPlataforma === null,
  };
}

/**
 * Quem está esperando resposta, e há quanto tempo.
 *
 * Conversa em que o cliente falou por último e a agência não respondeu é a
 * única que conta. Se a agência respondeu DEPOIS da última fala do cliente, a
 * bola está com o cliente e o relógio da sanção não corre.
 */
export function pendenciasDeResposta(conversas: Conversa[], agora = new Date(), plataforma = "99freelas"): Pendencia[] {
  const { prazoHoras, alertaHoras, ehRegraDaCasa } = prazosDeFollowUp(plataforma);
  const origem = ehRegraDaCasa
    ? "prazo da CASA (a plataforma não publica o dela)"
    : "prazo publicado pela plataforma";

  return conversas
    .filter((c) => {
      const resposta = c.ultimaRespostaDaAgenciaEm;
      return resposta === null || resposta.getTime() < c.ultimaMensagemDoClienteEm.getTime();
    })
    .map((c) => {
      const horas = (agora.getTime() - c.ultimaMensagemDoClienteEm.getTime()) / 3_600_000;
      const arredondado = Math.max(0, Math.round(horas * 10) / 10);
      const urgencia: Urgencia = arredondado >= prazoHoras ? "vencido" : arredondado >= alertaHoras ? "atencao" : "em_dia";
      return {
        referencia: c.referencia,
        urgencia,
        horasSemResposta: arredondado,
        prazoDaCasaHoras: prazoHoras,
        motivo:
          urgencia === "vencido"
            ? `O cliente está sem resposta há ${arredondado} h — passou do ${origem} de ${prazoHoras} h. "Não responder o cliente a tempo" é motivo de Violação: 30 dias com as propostas rebaixadas para o fim da fila.`
            : urgencia === "atencao"
              ? `Sem resposta há ${arredondado} h. Faltam ${Math.max(0, Math.round((prazoHoras - arredondado) * 10) / 10)} h para o ${origem}.`
              : `Sem resposta há ${arredondado} h — dentro do prazo.`,
      };
    })
    .sort((a, b) => b.horasSemResposta - a.horasSemResposta);
}

/**
 * O freio: a agência pode enviar MAIS propostas agora?
 *
 * NÃO, enquanto houver conversa vencida. É a trava que impede o cenário exato
 * do parecer — um robô que envia e não responde, construindo a sanção enquanto
 * parece produtivo. Enviar mais com cliente esperando é acelerar em direção à
 * punição.
 */
export function podeEnviarMaisPropostas(conversas: Conversa[], agora = new Date()): { pode: boolean; motivo: string } {
  const vencidas = pendenciasDeResposta(conversas, agora).filter((p) => p.urgencia === "vencido");
  if (vencidas.length === 0) {
    return { pode: true, motivo: "Nenhum cliente esperando além do prazo." };
  }
  return {
    pode: false,
    motivo: `${vencidas.length} cliente(s) esperando resposta além do prazo (${vencidas.map((v) => v.referencia).join(", ")}). Enviar mais propostas com cliente esperando é construir a sanção de Violação enquanto se parece produtivo. Responda antes.`,
  };
}
