// O DESPACHO DO DIOLI CONNECT — e a regra de que quem executou é que carimba.
//
// ─── A MEDIÇÃO QUE ORIGINOU ESTE ARQUIVO ───────────────────────────────────
//
// Medido em 30/08/2026 pelo Diretor Geral, no mecanismo de acionamento da
// plataforma: **ele devolve "sucesso" e não entrega nada.** Um despachante que
// responde 200 por ter conseguido POSTAR é um despachante que mente sobre o
// mundo — e quem lê a resposta não tem como saber.
//
// Determinação literal, e é o coração desta porta:
//
//   "O despachante disse ok é proibido como prova. Quem executou é que carimba."
//
// Então esta função NÃO deriva o resultado do que ela mesma fez. Ela chama o
// executor de verdade (`executarFuncao`), e depois **relê do banco** a linha de
// `ExecucaoV2` que o executor mandou gravar. O identificador que volta na
// resposta é o id daquela linha, lido de volta — não um id que esta função
// inventou, não um booleano que ela deduziu.
//
// ─── OS TRÊS ESTADOS, E O TERCEIRO NUNCA PASSA POR VERDE ───────────────────
//
//   executado        → há linha em ExecucaoV2, com início, fim e artefato.
//   recusado         → o motor disse não, com o motivo (ficha desligada, modo
//                      errado, entrada faltando, gatilho humano…).
//   nao_verificavel  → tudo o mais: o motor estourou, o trabalho falhou nas
//                      tentativas, ou a linha não voltou do banco. NUNCA vira
//                      sucesso, e o motivo vem junto.
//
// A ordem dos testes importa: `executado` só é devolvido DEPOIS da releitura.
// Se a releitura falhar ou vier vazia, o estado cai para `nao_verificavel`
// mesmo com o executor tendo dito "executado" — fail-closed até o fim.

import { randomUUID } from "node:crypto";
import { specDaFuncao, type ResultadoDeSpec } from "@/lib/agency/catalogo-v2/specs";
import {
  executarFuncao,
  type AtorDaExecucao,
  type ContextoDeExecucao,
  type DependenciasDoExecutor,
  type ResultadoDaExecucao,
  type PacoteDeEscalada,
} from "@/lib/agency/execucao-v2/executor";
import type { RegistroDeExecucao } from "@/lib/agency/execucao-v2/registro";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import {
  CHAVE_CLIENTE,
  CHAVE_COBRANCAS,
  CHAVE_HISTORICO,
  CHAVE_PERGUNTA,
  realizarSinteticoDoConnect,
} from "./realizar-sintetico";
import { MODO_EXIGIDO, type PedidoConferido } from "./contrato";

/** Quem assina a execução. Não é humano, e não é modelo de IA: é o motor de
 *  regras determinístico da homologação — e o rastro diz isso com estas
 *  palavras, porque registro que mente sobre o autor não serve de prova. */
export const ATOR_DO_CONNECT: AtorDaExecucao = {
  ator: "ia",
  modelo: "rule-based-sintetico",
  versaoModelo: "connect-v1",
};

/** A linha de execução como ela volta do banco — a prova relida. */
export interface LinhaDeExecucaoLida {
  id: string;
  funcaoId: string;
  departamentoId: string;
  correlationId: string;
  inicio: Date;
  fim: Date | null;
  resultado: string | null;
  ator: string;
  modelo: string | null;
  custoUsd: number | null;
}

/**
 * O armazém do Connect. Injetado de propósito: `despachar` não conhece Prisma,
 * e o teste que PROVA a execução usa a implementação de banco de verdade num
 * SQLite descartável (`armazem-prisma.ts`).
 */
export interface ArmazemDoConnect {
  gravarExecucao(registro: RegistroDeExecucao): Promise<{ id: string }>;
  gravarRecusa(recusa: {
    funcaoId: string;
    motivo: string;
    correlationId: string;
    clienteId?: string;
    em: Date;
  }): Promise<{ id: string }>;
  /** A RELEITURA. É esta chamada que transforma "eu gravei" em prova. */
  relerExecucao(id: string): Promise<LinhaDeExecucaoLida | null>;
  /** O fio: as execuções que já aconteceram sob o mesmo correlationId. */
  antecedentes(correlationId: string): Promise<LinhaDeExecucaoLida[]>;
}

export interface DependenciasDoDespacho {
  armazem: ArmazemDoConnect;
  perfil: PerfilOrganizacional;
  agora(): Date;
  /** Injetável só para PROVAR que o corte do acionamento vira nao_verificavel. */
  realizar?: DependenciasDoExecutor["realizar"];
  /** Injetável só para teste; o padrão é o executor de verdade. */
  executar?: typeof executarFuncao;
  specDe?: (funcaoId: string) => ResultadoDeSpec;
}

export interface ProvaDaExecucao {
  /** Onde a prova mora, e que ela foi LIDA de volta — não deduzida. */
  tabela: "ExecucaoV2";
  relido_do_banco: true;
  execucaoId: string;
  inicio: string;
  fim: string;
  duracaoMs: number;
  ator: string;
  modelo: string | null;
  custoUsd: number | null;
}

export type ResultadoDoDespacho =
  | {
      estado: "executado";
      funcao: string;
      correlationId: string;
      turno: number;
      execucaoId: string;
      prova: ProvaDaExecucao;
      artefato: string;
    }
  | {
      estado: "recusado";
      funcao: string;
      correlationId: string;
      turno: number;
      motivo: string;
      recusaId: string | null;
      escalada?: PacoteDeEscalada;
      entradas_exigidas_pela_ficha?: string[];
    }
  | {
      estado: "nao_verificavel";
      funcao: string;
      correlationId: string;
      turno: number;
      motivo: string;
      execucaoId: null;
    };

function fioNovo(cliente: string): string {
  const apelido = cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente";
  return `connect:${apelido}:${randomUUID()}`;
}

function entradasDoDespacho(pedido: PedidoConferido, antecedentes: LinhaDeExecucaoLida[]): Record<string, string> {
  const entradas: Record<string, string> = { ...pedido.dossie };
  entradas[CHAVE_CLIENTE] = pedido.cliente;
  entradas[CHAVE_PERGUNTA] = pedido.pergunta;

  // O fio tem duas fontes e as duas entram: o que o chamador mandou e o que o
  // BANCO já sabe sobre este correlationId. A segunda é a que sobrevive a um
  // chamador que perdeu o próprio histórico.
  const linhas: string[] = [];
  for (const t of pedido.historico) linhas.push(`${t.de}: ${t.texto}`);
  for (const a of antecedentes) {
    linhas.push(`execucao-anterior(${a.id}) em ${a.inicio.toISOString()}: ${a.funcaoId}`);
  }
  if (linhas.length > 0) entradas[CHAVE_HISTORICO] = linhas.join("\n");
  if (pedido.cobrancas.length > 0) entradas[CHAVE_COBRANCAS] = JSON.stringify(pedido.cobrancas);
  return entradas;
}

/**
 * Escalada técnica x escalada por regra — e por que a distinção decide o estado.
 *
 * O executor usa `escalado` para DUAS coisas muito diferentes: o gatilho humano
 * da ficha (regra, com gatilhos nomeados) e a falha técnica depois de esgotadas
 * as tentativas (sem gatilho nenhum). A primeira é um "não" com motivo — é
 * `recusado`. A segunda é o acionamento que NÃO aconteceu — e essa jamais pode
 * sair como sucesso: é `nao_verificavel`.
 *
 * A discriminação usa as duas evidências disponíveis (lista de gatilhos vazia E
 * a frase que o executor escreve), e o padrão em caso de dúvida é o mais
 * severo: sem gatilho declarado, é falha técnica.
 */
export function escaladaEFalhaTecnica(pacote: PacoteDeEscalada): boolean {
  return pacote.gatilhos.length === 0 || /^falha t[ée]cnica/i.test(pacote.motivo);
}

export async function despachar(
  pedido: PedidoConferido,
  deps: DependenciasDoDespacho,
): Promise<ResultadoDoDespacho> {
  const correlationId = pedido.correlationId ?? fioNovo(pedido.cliente);
  const especificacao = (deps.specDe ?? specDaFuncao)(pedido.funcao);
  const exigidas = especificacao.ok ? especificacao.spec.entradas_obrigatorias : undefined;

  let antecedentes: LinhaDeExecucaoLida[] = [];
  try {
    antecedentes = await deps.armazem.antecedentes(correlationId);
  } catch {
    // O fio é CONTEXTO, não portão: perdê-lo não pode derrubar o despacho. E o
    // efeito não some em silêncio — sem antecedentes o artefato sai com
    // `fio.turnos_anteriores: 0`, que é o que quem lê precisa ver.
    antecedentes = [];
  }
  const turno = antecedentes.length + 1;

  const contexto: ContextoDeExecucao = {
    modo: MODO_EXIGIDO,
    sintetico: true,
    entradas: entradasDoDespacho(pedido, antecedentes),
    // Nenhuma ferramenta é prevista: esta porta não toca o mundo, e ferramenta
    // não pedida é ferramenta que a ficha não precisa autorizar.
    ferramentasPrevistas: [],
    gatilhosDetectados: pedido.gatilhos,
    // `informar` é o MENOR efeito que existe. A porta corporativa consulta e
    // devolve; ela nunca pede autorização para preparar nem para publicar.
    efeito: "informar",
    custoPrevistoUsd: 0,
    correlationId,
    // Homologação não consulta flag de produção; escopo vazio é o honesto.
    escopos: [],
    clienteId: pedido.clienteId,
  };

  // O que o executor mandou gravar, capturado aqui para a releitura ter um id.
  let idGravado: string | null = null;
  let idDaRecusa: string | null = null;

  const dependenciasDoExecutor: DependenciasDoExecutor = {
    specDe: deps.specDe,
    async flagLigada() {
      // Em homologação o executor nem consulta a flag; se um dia consultar,
      // a resposta honesta é "não" — a porta do Connect não liga nada.
      return false;
    },
    async gravarExecucao(registro) {
      const { id } = await deps.armazem.gravarExecucao(registro);
      idGravado = id;
    },
    async gravarRecusa(recusa) {
      const { id } = await deps.armazem.gravarRecusa(recusa);
      idDaRecusa = id;
    },
    realizar: deps.realizar ?? realizarSinteticoDoConnect(deps.agora),
    agora: deps.agora,
  };

  let resultado: ResultadoDaExecucao;
  try {
    resultado = await (deps.executar ?? executarFuncao)(
      pedido.funcao,
      deps.perfil,
      contexto,
      ATOR_DO_CONNECT,
      dependenciasDoExecutor,
    );
  } catch (e) {
    // O motor estourou. Isto NUNCA é sucesso, e o motivo vai inteiro.
    return {
      estado: "nao_verificavel",
      funcao: pedido.funcao,
      correlationId,
      turno,
      execucaoId: null,
      motivo: `o executor lançou antes de concluir: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (resultado.decisao === "recusado") {
    return {
      estado: "recusado",
      funcao: pedido.funcao,
      correlationId,
      turno,
      motivo: resultado.motivo,
      recusaId: idDaRecusa,
      ...(exigidas ? { entradas_exigidas_pela_ficha: exigidas } : {}),
    };
  }

  if (resultado.decisao === "escalado") {
    if (escaladaEFalhaTecnica(resultado.pacote)) {
      return {
        estado: "nao_verificavel",
        funcao: pedido.funcao,
        correlationId,
        turno,
        execucaoId: null,
        motivo: `o acionamento não se completou: ${resultado.pacote.motivo}`,
      };
    }
    return {
      estado: "recusado",
      funcao: pedido.funcao,
      correlationId,
      turno,
      motivo: `escalado para humano — ${resultado.pacote.motivo}`,
      recusaId: idDaRecusa,
      escalada: resultado.pacote,
    };
  }

  // ── Daqui para baixo o executor disse "executado". Isso ainda NÃO é prova. ──
  if (!idGravado) {
    return {
      estado: "nao_verificavel",
      funcao: pedido.funcao,
      correlationId,
      turno,
      execucaoId: null,
      motivo:
        "o executor concluiu mas nenhuma linha de ExecucaoV2 foi gravada — sem carimbo de quem executou, " +
        "não há o que verificar",
    };
  }

  let linha: LinhaDeExecucaoLida | null = null;
  try {
    linha = await deps.armazem.relerExecucao(idGravado);
  } catch (e) {
    return {
      estado: "nao_verificavel",
      funcao: pedido.funcao,
      correlationId,
      turno,
      execucaoId: null,
      motivo: `a releitura da execução ${idGravado} falhou: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!linha || !linha.fim || !linha.resultado) {
    return {
      estado: "nao_verificavel",
      funcao: pedido.funcao,
      correlationId,
      turno,
      execucaoId: null,
      motivo: linha
        ? `a execução ${idGravado} está no banco sem fim ou sem resultado — execução pela metade não é execução`
        : `a execução ${idGravado} não voltou do banco — "eu gravei" não é prova de que gravou`,
    };
  }

  return {
    estado: "executado",
    funcao: pedido.funcao,
    correlationId,
    turno,
    execucaoId: linha.id,
    artefato: linha.resultado,
    prova: {
      tabela: "ExecucaoV2",
      relido_do_banco: true,
      execucaoId: linha.id,
      inicio: linha.inicio.toISOString(),
      fim: linha.fim.toISOString(),
      duracaoMs: linha.fim.getTime() - linha.inicio.getTime(),
      ator: linha.ator,
      modelo: linha.modelo,
      custoUsd: linha.custoUsd,
    },
  };
}
