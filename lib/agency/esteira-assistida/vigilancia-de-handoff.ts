// O GAVIÃO DO RELÓGIO — nada fica parado em silêncio.
//
// ─── A REGRA QUE JÁ ESTAVA ESCRITA E NÃO ERA EXIGIDA (16/08/2026) ──────────
//
// `docs/arquitetura-operacional-v2/03-ESTEIRA-E-HANDOFFS.md` diz, com todas
// as letras: sem aceite do recebedor, a tarefa NÃO some da fila anterior.
// `handoff.ts` cumpre metade — cria a linha como `aguardando_recebimento` e
// só o departamento destino a aceita.
//
// A metade que faltava é esta: NINGUÉM OLHAVA A FILA. Handoff nascia com
// `prazoProximo` opcional (e a cadeia nunca o preenchia), ficava
// `aguardando_recebimento` para sempre, e não havia rotina que perguntasse
// "por que este bastão está no chão há dois dias?".
//
// Este módulo é a pergunta, feita a cada passada do relógio.
//
// ─── O QUE ELE FAZ, E O QUE NÃO FAZ ────────────────────────────────────────
//
// FAZ: nomeia o handoff parado, diz de quem é (o departamento que devia
// receber), diz a idade, e ESCREVE uma linha visível quando o prazo estourou.
//
// NÃO FAZ: não aceita handoff no lugar de ninguém. Aceite automático é o
// oposto exato da regra — se a máquina aceita sozinha, a fila esvazia e o
// trabalho continua sem dono. O gavião cobra; quem recebe é quem recebe.

import { HANDOFF_DA_ESTEIRA, idadeEmHoras, idadeEmPortugues } from "./recusa-visivel";
import { departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

/** Prazo ausente não é prazo infinito. Depois disto, cobra-se do mesmo jeito. */
export const PRAZO_PADRAO_HORAS = 24;

// ⚠️ AQUI HAVIA UMA REGRA QUE EU INVENTEI, e ela foi REMOVIDA (16/08/2026).
//
// A primeira versão desta frente criou `HORAS_ATE_SUBIR_AO_CEO = 48` e um selo
// vermelho "sobe ao CEO". O `experiencia` conferiu contra a fonte:
// `03-ESTEIRA-E-HANDOFFS.md` diz "sem aceite, a tarefa não some da fila
// anterior" e **não diz uma palavra sobre subir ao CEO**. Eu tratei invenção
// minha como contrato da casa — que é o defeito que esta agência já pagou
// caro, com outro nome.
//
// E era escalonamento de mentira: o selo ficava DENTRO da mesma lista de onde
// deveria sair, não virava aviso e nem entrava na frase de resumo do topo.
// Escalonamento que fica na mesma lista é adjetivo, não escalonamento.
//
// O que fica: prazo, dono, idade e cobrança — tudo isso ESTÁ no documento.
// Escalar para o CEO volta como PROPOSTA ao Diretor, não como código.

export interface HandoffParado {
  id: string;
  deDepartamento: string;
  paraDepartamento: string;
  responsavelEntrega: string;
  correlationId: string;
  workspaceId?: string | null;
  prazoProximo: Date | null;
  criadoEm: Date;
}

export interface CobrancaDeHandoff {
  handoffId: string;
  /** De quem é a bola AGORA — quem devia ter aceitado. */
  dono: string;
  deDepartamento: string;
  paraDepartamento: string;
  correlationId: string;
  workspaceId?: string | null;
  idadeHoras: number;
  idade: string;
  /** Estourou o prazo do contrato? */
  atrasado: boolean;
  motivo: string;
}

function nomeDoDepartamento(id: string): string {
  return departamentoV2(id)?.nome ?? id;
}

/**
 * Lê a fila de bastões no chão e devolve a cobrança de cada um, com dono,
 * idade e o motivo escrito em português.
 *
 * Função PURA: recebe as linhas e a hora, devolve a leitura. Quem busca no
 * banco e quem grava é o chamador — a decisão de cobrar não pode depender de
 * um Prisma disponível para ser testável.
 */
export function cobrancasDeHandoff(parados: HandoffParado[], agora: Date): CobrancaDeHandoff[] {
  return parados.map((h) => {
    const idadeHoras = idadeEmHoras(h.criadoEm, agora);
    const prazo = h.prazoProximo ?? new Date(h.criadoEm.getTime() + PRAZO_PADRAO_HORAS * 3_600_000);
    const atrasado = agora.getTime() > prazo.getTime();
    const dono = nomeDoDepartamento(h.paraDepartamento);
    const origem = nomeDoDepartamento(h.deDepartamento);

    const motivo = atrasado
      ? `${origem} entregou para ${dono} e ninguém de ${dono} aceitou o recebimento. ` +
        `O prazo do contrato venceu ${idadeEmPortugues(prazo, agora)} e a tarefa continua na fila de ${origem} — ` +
        `sem aceite ela não sai de lá, por regra.`
      : `${origem} → ${dono}, aguardando recebimento ${idadeEmPortugues(h.criadoEm, agora)}. Dentro do prazo.`;

    return {
      handoffId: h.id,
      dono,
      deDepartamento: h.deDepartamento,
      paraDepartamento: h.paraDepartamento,
      correlationId: h.correlationId,
      workspaceId: h.workspaceId ?? null,
      idadeHoras,
      idade: idadeEmPortugues(h.criadoEm, agora),
      atrasado,
      motivo,
    };
  });
}

export interface DependenciasDoGaviao {
  handoffsAguardando(): Promise<HandoffParado[]>;
  /** Já cobrei este handoff nesta janela? (não se cobra a cada 5 min) */
  cobrancaRecente(correlationId: string, desde: Date): Promise<boolean>;
  registrarCobranca(dados: {
    funcaoId: string;
    motivo: string;
    correlationId: string;
    workspaceId?: string | null;
    em: Date;
  }): Promise<void>;
  agora(): Date;
}

/** Janela de silêncio da cobrança — a mesma lógica da recusa repetida. */
export const JANELA_DA_COBRANCA_HORAS = 12;

export interface ResultadoDoGaviao {
  aguardando: number;
  atrasados: number;
  cobrancas: CobrancaDeHandoff[];
}

export async function cobrarOsBastoesNoChao(deps: DependenciasDoGaviao): Promise<ResultadoDoGaviao> {
  const agora = deps.agora();
  const parados = await deps.handoffsAguardando();
  const cobrancas = cobrancasDeHandoff(parados, agora);
  const atrasadas = cobrancas.filter((c) => c.atrasado);

  const desde = new Date(agora.getTime() - JANELA_DA_COBRANCA_HORAS * 3_600_000);
  for (const c of atrasadas) {
    const correlationId = `handoff:${c.handoffId}`;
    if (await deps.cobrancaRecente(correlationId, desde)) continue;
    await deps.registrarCobranca({
      funcaoId: HANDOFF_DA_ESTEIRA,
      motivo: c.motivo,
      correlationId,
      workspaceId: c.workspaceId,
      em: agora,
    });
  }

  return {
    aguardando: cobrancas.length,
    atrasados: atrasadas.length,
    cobrancas,
  };
}
