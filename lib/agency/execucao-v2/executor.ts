// O EXECUTOR DA LINHA — o motor que roda função de ficha, com trava dupla.
//
// Integração V2 (ordem do CEO, 15/08/2026): "construa handoffs, permissões,
// auditoria e mecanismos de segurança; mantenha os 62 agentes desligados para
// produção". Este motor é a TRAVA EM CÓDIGO dessa ordem — prompt é aviso,
// código é trava:
//
//   PRODUÇÃO  → só roda com `spec.ativa === true` NA FICHA **e** a flag
//               `v2_execucao` ligada no escopo. Hoje as 62 specs dizem
//               `ativa: false`, então produção recusa SEMPRE — mesmo que
//               alguém ligue a flag por engano. Duas chaves, fail-closed.
//   HOMOLOGAÇÃO → roda por cima das travas de produção, mas SÓ com contexto
//               marcado sintético (`sintetico: true`). Dado real em
//               homologação recusa com motivo.
//
// O resto do contrato vem da FICHA (specs.ts): entradas obrigatórias,
// ferramentas permitidas/proibidas (negar por padrão), teto de custo por
// execução, timeout e gatilhos humanos. Toda execução que acontece deixa
// registro validado (`registro.ts`) — inclusive as que terminam escaladas.

import { validarRegistro, type RegistroDeExecucao } from "./registro";
import { specDaFuncao, type ResultadoDeSpec, type SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
import { podeExecutarFuncao } from "@/lib/agency/catalogo-v2/capacidades";
import { FLAGS_V2 } from "@/lib/agency/flags-v2/flags";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

export interface ContextoDeExecucao {
  /** Homologação = ensaio com dado fictício. Produção = a agência de verdade. */
  modo: "homologacao" | "producao";
  /** Obrigatório `true` em homologação — dado real não entra em ensaio. */
  sintetico?: boolean;
  /** Valores das entradas, chaveados pelos nomes de `entradas_obrigatorias`. */
  entradas: Record<string, string>;
  /** Ferramentas que a execução pretende usar — negadas por padrão fora da lista. */
  ferramentasPrevistas: string[];
  /** Gatilhos humanos detectados pelo chamador (match contra a ficha → escala). */
  gatilhosDetectados?: string[];
  custoPrevistoUsd: number;
  correlationId: string;
  /** Escopos de flag em ordem de especificidade (ex.: [clientId, workspaceId]). */
  escopos: string[];
}

export interface AtorDaExecucao {
  ator: "humano" | "ia";
  usuarioId?: string;
  modelo?: string;
  versaoModelo?: string;
}

export interface PacoteDeEscalada {
  funcaoId: string;
  departamentoId: string;
  motivo: string;
  gatilhos: string[];
  entradas: Record<string, string>;
  correlationId: string;
}

export type ResultadoDaExecucao =
  | { decisao: "executado"; saida: string; custoUsd: number }
  | { decisao: "recusado"; motivo: string }
  | { decisao: "escalado"; pacote: PacoteDeEscalada };

export interface DependenciasDoExecutor {
  specDe?: (funcaoId: string) => ResultadoDeSpec;
  flagLigada(chave: string, escopos: string[]): Promise<boolean>;
  gravarExecucao(registro: RegistroDeExecucao): Promise<void>;
  /** O trabalho em si (chamada de modelo, regra, humano). Injetado — o motor só governa. */
  realizar(spec: SpecOperacional, contexto: ContextoDeExecucao): Promise<{ saida: string; custoUsd: number }>;
  agora(): Date;
}

function recusa(motivo: string): ResultadoDaExecucao {
  return { decisao: "recusado", motivo };
}

export async function executarFuncao(
  funcaoId: string,
  perfil: PerfilOrganizacional,
  contexto: ContextoDeExecucao,
  ator: AtorDaExecucao,
  deps: DependenciasDoExecutor,
): Promise<ResultadoDaExecucao> {
  // 1. A ficha é o contrato — sem spec legível, não se executa.
  const resultadoSpec = (deps.specDe ?? specDaFuncao)(funcaoId);
  if (!resultadoSpec.ok) return recusa(resultadoSpec.motivo);
  const spec = resultadoSpec.spec;

  // 2. Capacidade de quem pede — negar por padrão (04-PERMISSOES).
  const capacidade = podeExecutarFuncao(perfil, funcaoId);
  if (!capacidade.permitido) return recusa(capacidade.motivo);

  // 3. As travas de modo.
  if (contexto.modo === "producao") {
    if (spec.ativa !== true) {
      return recusa(`função "${funcaoId}" está DESLIGADA na ficha — ligar é decisão registrada do dono, nunca efeito de deploy`);
    }
    const flag = await deps.flagLigada(FLAGS_V2.execucao, contexto.escopos);
    if (!flag) {
      return recusa(`flag ${FLAGS_V2.execucao} desligada no escopo — produção exige as duas chaves (ficha ativa + flag)`);
    }
  } else if (contexto.modo === "homologacao") {
    if (contexto.sintetico !== true) {
      return recusa("homologação só roda com contexto marcado sintético — dado real não entra em ensaio (determinação do CEO)");
    }
  } else {
    return recusa(`modo desconhecido — só existem "homologacao" e "producao"`);
  }

  // 4. Entradas obrigatórias da ficha — faltou uma, não se chuta.
  const faltantes = spec.entradas_obrigatorias.filter((e) => !contexto.entradas[e]?.trim());
  if (faltantes.length > 0) {
    return recusa(`entradas obrigatórias ausentes: ${faltantes.join(", ")} — ausência de informação não é informação`);
  }

  // 5. Ferramentas — proibida recusa; fora da lista permitida também (negar por padrão).
  const proibidas = new Set(spec.ferramentas_proibidas);
  const permitidas = new Set(spec.ferramentas_permitidas);
  for (const ferramenta of contexto.ferramentasPrevistas) {
    if (proibidas.has(ferramenta)) return recusa(`ferramenta proibida pela ficha: "${ferramenta}"`);
    if (!permitidas.has(ferramenta)) return recusa(`ferramenta fora da lista permitida da ficha: "${ferramenta}" — negado por padrão`);
  }

  // 6. Gatilho humano da ficha presente → escala com pacote completo, não executa.
  const gatilhos = (contexto.gatilhosDetectados ?? []).filter((g) => spec.gatilhos_humanos.includes(g));
  if (gatilhos.length > 0) {
    return {
      decisao: "escalado",
      pacote: {
        funcaoId,
        departamentoId: spec.departamento,
        motivo: "gatilho humano da ficha detectado — decisão sobe, não se executa",
        gatilhos,
        entradas: contexto.entradas,
        correlationId: contexto.correlationId,
      },
    };
  }

  // 7. Teto de custo ANTES de gastar.
  if (contexto.custoPrevistoUsd > spec.teto_custo_usd_execucao) {
    return recusa(
      `custo previsto ($${contexto.custoPrevistoUsd}) acima do teto da ficha ($${spec.teto_custo_usd_execucao}) — não se inicia`,
    );
  }

  // 8. O rastro se valida ANTES do trabalho — registro que não fecha, não roda.
  const inicio = deps.agora();
  const registro: RegistroDeExecucao = {
    ator: ator.ator,
    usuarioId: ator.usuarioId,
    modelo: ator.modelo,
    versaoModelo: ator.versaoModelo,
    custoUsd: ator.ator === "ia" ? 0 : undefined,
    funcaoId,
    departamentoId: spec.departamento,
    ferramentas: contexto.ferramentasPrevistas,
    correlationId: contexto.correlationId,
    inicio,
  };
  const validacao = validarRegistro(registro);
  if (!validacao.valido) return recusa(`registro de execução inválido: ${validacao.motivo}`);

  const { saida, custoUsd } = await deps.realizar(spec, contexto);
  const fim = deps.agora();
  registro.fim = fim;
  registro.resultado = saida;
  if (ator.ator === "ia") registro.custoUsd = custoUsd;
  await deps.gravarExecucao(registro);

  // 9. Estouro DEPOIS do fato não se esconde: registra e escala.
  const duracaoMin = (fim.getTime() - inicio.getTime()) / 60_000;
  if (custoUsd > spec.teto_custo_usd_execucao || duracaoMin > spec.timeout_min) {
    return {
      decisao: "escalado",
      pacote: {
        funcaoId,
        departamentoId: spec.departamento,
        motivo:
          custoUsd > spec.teto_custo_usd_execucao
            ? `custo real ($${custoUsd}) estourou o teto da ficha ($${spec.teto_custo_usd_execucao})`
            : `duração (${Math.round(duracaoMin)}min) estourou o timeout da ficha (${spec.timeout_min}min)`,
        gatilhos: [],
        entradas: contexto.entradas,
        correlationId: contexto.correlationId,
      },
    };
  }

  return { decisao: "executado", saida, custoUsd };
}
