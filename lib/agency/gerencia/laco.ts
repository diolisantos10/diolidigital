// O LAÇO QUE NÃO PARA — a varredura do Gerente Geral, projeto por projeto.
//
// ── A ORDEM DO CEO (25/08/2026) ─────────────────────────────────────────────
//
//   "É o agente que não para: está sempre checando quem está atrasado e quem
//    não está, preocupado com a entrega, o timing e o SLA. Garante o
//    atendimento de cada cliente: valida se cada projeto está saindo dentro
//    do cronograma."
//
// ── O QUE JÁ EXISTIA, E POR QUE NÃO BASTAVA ─────────────────────────────────
//
// `lib/agency/pm/varredura.ts` (15/08) já achava handoff sem aceite e SLA
// estourado, e o despertador já a chamava a cada 5 minutos. Mas o resultado
// dela terminava em `log("PM cobra → …")`. Linha de log é coisa que só existe
// enquanto alguém está lendo o terminal: não tem dono, não tem prazo, não
// aparece em tela nenhuma e não sobrevive ao reinício do contêiner.
//
// Este módulo é o degrau seguinte: o mesmo julgamento, mas por PROJETO e
// terminando em duas coisas que ocupam espaço —
//
//   1. um BLOQUEIO tipado (`BloqueioV2`), com dono, SLA, evidência e próxima
//      ação. É a tabela que a Central e o painel do PM já leem;
//   2. quando o atraso queima um prazo PROMETIDO ao cliente, um aviso pela
//      voz única.
//
// A regra que separa as duas: **coluna gravada não é cliente informado.**
// Gravar o bloqueio resolve o problema da casa; o cliente continua achando
// que a data está de pé. Por isso o veredito devolve os dois, e o teste
// reprova quem entregar só o primeiro.
//
// Módulo PURO: recebe o retrato, devolve o julgamento. Sem banco, sem relógio.

import { SLA_POR_ESTADO_HORAS } from "@/lib/agency/v2-recovery/detector-de-parados";
import { GERENTE_GERAL, gerenteDe } from "./cadeia";
import { falarComOCliente, type ResultadoDaFala } from "./voz-unica";

/** Depois de avisado, o cliente não é avisado de novo antes disto. */
export const HORAS_ENTRE_AVISOS_AO_CLIENTE = 24;

export interface ProjetoAberto {
  id: string;
  clienteId: string;
  /** Nome do projeto como o cliente o conhece. Nunca id na frase dele. */
  titulo: string;
  /** Departamento canônico com a bola agora. Ausente = ninguém assumiu. */
  departamentoResponsavel?: string | null;
  estadoCanonico: string | null;
  atualizadoEm: Date;
  /** A data que a casa PROMETEU ao cliente. Ausente = nada foi prometido. */
  prazoPrometido?: Date | null;
  /** Última vez que o cliente foi avisado de atraso neste projeto. */
  clienteAvisadoEm?: Date | null;
}

export type Situacao = "no_prazo" | "atrasado" | "sem_dono" | "sem_regua";

export interface Veredicto {
  projetoId: string;
  clienteId: string;
  situacao: Situacao;
  /** De quem é a bola — SEMPRE um gerente, nunca um agente de linha. */
  donoFuncaoId: string;
  departamentoResponsavel: string | null;
  /** Horas além do prazo do estado. Zero quando no prazo. */
  horasDeAtraso: number;
  /** O que fazer agora, em português, com o que destrava. */
  proximaAcao: string;
  /** O prazo prometido ao cliente já queimou? */
  prazoDoClienteQueimado: boolean;
}

export interface Bloqueio {
  entidadeTipo: "Project";
  entidadeId: string;
  /** Um dos 9 motivos canônicos do manifesto. */
  tipo: string;
  donoFuncaoId: string;
  acaoRecomendada: string;
  evidencia: string;
  escalonadoPara: string;
}

export interface ResultadoDoLaco {
  vereditos: Veredicto[];
  /** O que vira linha com dono na tabela de bloqueios. */
  bloqueios: Bloqueio[];
  /** O que o Gerente Geral diz ao cliente. Vazio quando nada foi prometido. */
  avisosAoCliente: ResultadoDaFala[];
  /** Estados sem prazo declarado: lugar onde trabalho dorme para sempre. */
  estadosSemRegua: string[];
}

function horasEntre(depois: Date, antes: Date): number {
  return (depois.getTime() - antes.getTime()) / 3_600_000;
}

/**
 * A varredura. Um veredito por projeto aberto — inclusive os que estão bem,
 * porque "está no prazo" também é resposta, e é a que prova que o laço olhou.
 */
export function varrerOsProjetos(projetos: ProjetoAberto[], agora: Date): ResultadoDoLaco {
  const vereditos: Veredicto[] = [];
  const bloqueios: Bloqueio[] = [];
  const avisosAoCliente: ResultadoDaFala[] = [];
  const estadosSemRegua = new Set<string>();

  for (const p of projetos) {
    const dep = p.departamentoResponsavel ?? null;
    const gerente = dep ? gerenteDe(dep) : undefined;
    const sla = p.estadoCanonico ? SLA_POR_ESTADO_HORAS[p.estadoCanonico] : undefined;
    const horasNoEstado = horasEntre(agora, p.atualizadoEm);
    const prazoQueimado = Boolean(p.prazoPrometido && p.prazoPrometido.getTime() < agora.getTime());

    // ── 1. Sem dono é pior que atrasado ────────────────────────────────────
    // Atrasado alguém empurra; sem dono ninguém. A bola volta para o Gerente
    // Geral, que é justamente quem nomeia o gerente — não fica órfã.
    if (!dep || !gerente) {
      const v: Veredicto = {
        projetoId: p.id,
        clienteId: p.clienteId,
        situacao: "sem_dono",
        donoFuncaoId: GERENTE_GERAL,
        departamentoResponsavel: dep,
        horasDeAtraso: Math.floor(horasNoEstado),
        proximaAcao: `Nomear o departamento e o gerente de "${p.titulo}" agora. O projeto está há ${Math.floor(horasNoEstado)}h sem ninguém responsável — trabalho sem dono não anda sozinho.`,
        prazoDoClienteQueimado: prazoQueimado,
      };
      vereditos.push(v);
      bloqueios.push(bloqueioDe(v, "technical_failure", p, agora));
      empurrarAviso(avisosAoCliente, v, p, agora);
      continue;
    }

    // ── 2. Estado sem régua: achado declarado, nunca cobrança inventada ────
    if (p.estadoCanonico && sla === undefined) {
      estadosSemRegua.add(p.estadoCanonico);
      vereditos.push({
        projetoId: p.id,
        clienteId: p.clienteId,
        situacao: "sem_regua",
        donoFuncaoId: gerente,
        departamentoResponsavel: dep,
        horasDeAtraso: 0,
        proximaAcao: `O estado "${p.estadoCanonico}" não tem prazo declarado na régua da casa. Enquanto não tiver, este projeto pode dormir sem ninguém notar — dar prazo a ele é do Gerente Geral.`,
        prazoDoClienteQueimado: prazoQueimado,
      });
      continue;
    }

    // ── 3. Atrasado ────────────────────────────────────────────────────────
    const estourouSla = sla !== undefined && horasNoEstado > sla;
    if (estourouSla || prazoQueimado) {
      const v: Veredicto = {
        projetoId: p.id,
        clienteId: p.clienteId,
        situacao: "atrasado",
        donoFuncaoId: gerente,
        departamentoResponsavel: dep,
        horasDeAtraso: Math.floor(estourouSla ? horasNoEstado - sla! : 0),
        proximaAcao: estourouSla
          ? `${gerente}: "${p.titulo}" está em "${p.estadoCanonico}" há ${Math.floor(horasNoEstado)}h, e o prazo desse estado é ${sla}h. Entregue, ou diga com nome e data o que está travando.`
          : `${gerente}: a data prometida ao cliente em "${p.titulo}" já passou. Diga hoje a data nova e o que falta — o Gerente Geral avisa o cliente.`,
        prazoDoClienteQueimado: prazoQueimado,
      };
      vereditos.push(v);
      bloqueios.push(bloqueioDe(v, estourouSla ? "technical_failure" : "client_decision_pending", p, agora));
      empurrarAviso(avisosAoCliente, v, p, agora);
      continue;
    }

    // ── 4. No prazo ────────────────────────────────────────────────────────
    vereditos.push({
      projetoId: p.id,
      clienteId: p.clienteId,
      situacao: "no_prazo",
      donoFuncaoId: gerente,
      departamentoResponsavel: dep,
      horasDeAtraso: 0,
      proximaAcao: `${gerente} segue com "${p.titulo}". Nada a cobrar nesta rodada.`,
      prazoDoClienteQueimado: false,
    });
  }

  // O mais atrasado primeiro: é a fila do Gerente Geral, não uma lista.
  vereditos.sort((a, b) => b.horasDeAtraso - a.horasDeAtraso);

  return { vereditos, bloqueios, avisosAoCliente, estadosSemRegua: [...estadosSemRegua] };
}

function bloqueioDe(v: Veredicto, tipo: string, p: ProjetoAberto, agora: Date): Bloqueio {
  return {
    entidadeTipo: "Project",
    entidadeId: v.projetoId,
    tipo,
    donoFuncaoId: v.donoFuncaoId,
    acaoRecomendada: v.proximaAcao,
    evidencia: `estado=${p.estadoCanonico ?? "sem estado"} · parado há ${Math.floor(
      horasEntre(agora, p.atualizadoEm),
    )}h · situação=${v.situacao}`,
    // Toda cobrança sobe para o mesmo lugar: quem cobra é o Gerente Geral.
    escalonadoPara: GERENTE_GERAL,
  };
}

/**
 * O aviso ao cliente. Só quando havia PROMESSA e a promessa queimou — atraso
 * interno que ainda cabe na data não é assunto do cliente, e transformá-lo em
 * mensagem seria ansiedade terceirizada.
 *
 * Silêncio depois de avisar também tem régua: 24h. Avisar de 5 em 5 minutos
 * (que é o ritmo do relógio) transformaria a honestidade em spam.
 */
function empurrarAviso(destino: ResultadoDaFala[], v: Veredicto, p: ProjetoAberto, agora: Date): void {
  if (!v.prazoDoClienteQueimado) return;
  if (p.clienteAvisadoEm && horasEntre(agora, p.clienteAvisadoEm) < HORAS_ENTRE_AVISOS_AO_CLIENTE) return;
  destino.push(
    falarComOCliente(GERENTE_GERAL, {
      clienteId: v.clienteId,
      corpo: `Sobre "${p.titulo}": a data que combinamos já passou e eu prefiro te contar antes de você perguntar. O trabalho está comigo e com a equipe responsável, e eu volto com a data nova assim que fechar com eles — hoje mesmo.`,
      correlationId: `gg-atraso:${v.projetoId}`,
    }),
  );
}

/** O consolidado em uma frase. Conclusão primeiro, e o vazio explicando o vazio. */
export function fraseDoLaco(r: ResultadoDoLaco): string {
  const total = r.vereditos.length;
  if (total === 0) return "Nenhum projeto aberto nesta rodada — não há cronograma a validar.";
  const atrasados = r.vereditos.filter((v) => v.situacao === "atrasado").length;
  const semDono = r.vereditos.filter((v) => v.situacao === "sem_dono").length;
  if (atrasados === 0 && semDono === 0) {
    return `${total} projeto(s) aberto(s), todos dentro do cronograma e com gerente responsável.`;
  }
  const pior = r.vereditos[0]!;
  return `${total} projeto(s) aberto(s): ${atrasados} atrasado(s), ${semDono} sem dono. O pior está com ${pior.donoFuncaoId} há ${pior.horasDeAtraso}h além do prazo. ${r.avisosAoCliente.length} cliente(s) a avisar.`;
}
