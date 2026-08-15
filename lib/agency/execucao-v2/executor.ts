// O EXECUTOR DA LINHA — o motor que roda função de ficha, com trava dupla.
//
// Integração V2 (ordem do CEO, 15/08/2026): "construa handoffs, permissões,
// auditoria e mecanismos de segurança". Piloto assistido (mesma data): as
// funções da cadeia mínima podem estar LIGADAS na ficha, e produção passa a
// abrir com as DUAS chaves — nunca com uma só:
//
//   PRODUÇÃO  → só roda com `spec.ativa === true` NA FICHA **e** a flag
//               `v2_execucao` ligada no escopo (allowlist por clientId;
//               jamais global — regra 3 da ativação). Função fora da cadeia
//               continua `ativa: false` e recusa sempre.
//   HOMOLOGAÇÃO → roda por cima das travas de produção, mas SÓ com contexto
//               marcado sintético (`sintetico: true`).
//
// Aperfeiçoamentos da regra 8, no próprio motor: timeout INTERROMPÍVEL por
// tentativa (AbortSignal + corrida de timer), RETENTATIVAS da ficha,
// VALIDAÇÃO ESTRUTURAL da saída (vazio não passa; formato JSON tem que
// parsear) e AUDITORIA DE RECUSAS (cada "não" deixa rastro com motivo).
// O rastro da regra 6 é completo: cliente, departamento, agente, versão,
// custo, ferramentas, entradas, saída e correlationId.

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
  /** De que cliente é este trabalho (regra 6 do piloto; ausente = interno). */
  clienteId?: string;
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

export interface RegistroDeRecusa {
  funcaoId: string;
  motivo: string;
  correlationId: string;
  clienteId?: string;
  em: Date;
}

export interface DependenciasDoExecutor {
  specDe?: (funcaoId: string) => ResultadoDeSpec;
  flagLigada(chave: string, escopos: string[]): Promise<boolean>;
  gravarExecucao(registro: RegistroDeExecucao): Promise<void>;
  /** Auditoria de recusas (regra 8) — recusa sem rastro é recusa invisível. */
  gravarRecusa?(recusa: RegistroDeRecusa): Promise<void>;
  /**
   * O trabalho em si (chamada de modelo, regra, humano). Injetado — o motor
   * só governa. Implementações longas DEVEM observar o `sinal` e parar
   * quando ele abortar (timeout interrompível da regra 8).
   */
  realizar(
    spec: SpecOperacional,
    contexto: ContextoDeExecucao,
    sinal?: AbortSignal,
  ): Promise<{ saida: string; custoUsd: number }>;
  agora(): Date;
  /** Timeout por tentativa em ms — a ficha manda; injetável só para teste. */
  timeoutMs?(spec: SpecOperacional): number;
}

/** Validação estrutural da saída (regra 8): vazio não passa; JSON tem que parsear. */
export function saidaEstruturalmenteValida(
  spec: SpecOperacional,
  saida: string,
): { ok: true } | { ok: false; motivo: string } {
  if (!saida || saida.trim().length < 20) {
    return { ok: false, motivo: "saída vazia ou curta demais — entregável sem corpo não sobe na esteira" };
  }
  if (/json/i.test(spec.saida.formato)) {
    try {
      JSON.parse(saida);
    } catch {
      return { ok: false, motivo: `a ficha exige saída ${spec.saida.formato} e o texto não parseia como JSON` };
    }
  }
  return { ok: true };
}

export async function executarFuncao(
  funcaoId: string,
  perfil: PerfilOrganizacional,
  contexto: ContextoDeExecucao,
  ator: AtorDaExecucao,
  deps: DependenciasDoExecutor,
): Promise<ResultadoDaExecucao> {
  const recusar = async (motivo: string): Promise<ResultadoDaExecucao> => {
    await deps.gravarRecusa?.({
      funcaoId,
      motivo,
      correlationId: contexto.correlationId,
      clienteId: contexto.clienteId,
      em: deps.agora(),
    });
    return { decisao: "recusado", motivo };
  };
  const escalar = (motivo: string, gatilhos: string[] = []): ResultadoDaExecucao => ({
    decisao: "escalado",
    pacote: {
      funcaoId,
      departamentoId: departamento,
      motivo,
      gatilhos,
      entradas: contexto.entradas,
      correlationId: contexto.correlationId,
    },
  });
  let departamento = "";

  // 1. A ficha é o contrato — sem spec legível, não se executa.
  const resultadoSpec = (deps.specDe ?? specDaFuncao)(funcaoId);
  if (!resultadoSpec.ok) return recusar(resultadoSpec.motivo);
  const spec = resultadoSpec.spec;
  departamento = spec.departamento;

  // 2. Capacidade de quem pede — negar por padrão (04-PERMISSOES).
  const capacidade = podeExecutarFuncao(perfil, funcaoId);
  if (!capacidade.permitido) return recusar(capacidade.motivo);

  // 3. As travas de modo.
  if (contexto.modo === "producao") {
    if (spec.ativa !== true) {
      return recusar(`função "${funcaoId}" está DESLIGADA na ficha — ligar é decisão registrada do dono, nunca efeito de deploy`);
    }
    const flag = await deps.flagLigada(FLAGS_V2.execucao, contexto.escopos);
    if (!flag) {
      return recusar(`flag ${FLAGS_V2.execucao} desligada no escopo — produção exige as duas chaves (ficha ativa + flag)`);
    }
  } else if (contexto.modo === "homologacao") {
    if (contexto.sintetico !== true) {
      return recusar("homologação só roda com contexto marcado sintético — dado real não entra em ensaio (determinação do CEO)");
    }
  } else {
    return recusar(`modo desconhecido — só existem "homologacao" e "producao"`);
  }

  // 4. Entradas obrigatórias da ficha — faltou uma, não se chuta.
  const faltantes = spec.entradas_obrigatorias.filter((e) => !contexto.entradas[e]?.trim());
  if (faltantes.length > 0) {
    return recusar(`entradas obrigatórias ausentes: ${faltantes.join(", ")} — ausência de informação não é informação`);
  }

  // 5. Ferramentas — proibida recusa; fora da lista permitida também (negar por padrão).
  const proibidas = new Set(spec.ferramentas_proibidas);
  const permitidas = new Set(spec.ferramentas_permitidas);
  for (const ferramenta of contexto.ferramentasPrevistas) {
    if (proibidas.has(ferramenta)) return recusar(`ferramenta proibida pela ficha: "${ferramenta}"`);
    if (!permitidas.has(ferramenta)) return recusar(`ferramenta fora da lista permitida da ficha: "${ferramenta}" — negado por padrão`);
  }

  // 6. Gatilho humano da ficha presente → escala com pacote completo, não executa.
  const gatilhos = (contexto.gatilhosDetectados ?? []).filter((g) => spec.gatilhos_humanos.includes(g));
  if (gatilhos.length > 0) {
    return escalar("gatilho humano da ficha detectado — decisão sobe, não se executa", gatilhos);
  }

  // 7. Teto de custo ANTES de gastar.
  if (contexto.custoPrevistoUsd > spec.teto_custo_usd_execucao) {
    return recusar(
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
    clienteId: contexto.clienteId,
    entradas: contexto.entradas,
  };
  const validacao = validarRegistro(registro);
  if (!validacao.valido) return recusar(`registro de execução inválido: ${validacao.motivo}`);

  // 9. O trabalho — com timeout interrompível e as retentativas da ficha.
  const tentativas = 1 + Math.max(0, spec.retentativas);
  const limiteMs = deps.timeoutMs ? deps.timeoutMs(spec) : spec.timeout_min * 60_000;
  let saida = "";
  let custoUsd = 0;
  let ultimaFalha = "";
  let executou = false;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const aborto = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resultado = await Promise.race([
        deps.realizar(spec, contexto, aborto.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            aborto.abort();
            reject(new Error(`timeout da ficha (${spec.timeout_min}min) — trabalho interrompido`));
          }, limiteMs);
        }),
      ]);
      const estrutura = saidaEstruturalmenteValida(spec, resultado.saida);
      if (!estrutura.ok) {
        ultimaFalha = estrutura.motivo;
        continue;
      }
      saida = resultado.saida;
      custoUsd = resultado.custoUsd;
      executou = true;
      break;
    } catch (e) {
      ultimaFalha = e instanceof Error ? e.message : String(e);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  if (!executou) {
    // Falha técnica persistente não se re-tenta pra sempre nem se esconde: sobe.
    return escalar(`falha técnica após ${tentativas} tentativa(s): ${ultimaFalha}`);
  }

  const fim = deps.agora();
  registro.fim = fim;
  registro.resultado = saida;
  if (ator.ator === "ia") registro.custoUsd = custoUsd;
  await deps.gravarExecucao(registro);

  // 10. Estouro DEPOIS do fato não se esconde: registra e escala.
  const duracaoMin = (fim.getTime() - inicio.getTime()) / 60_000;
  if (custoUsd > spec.teto_custo_usd_execucao || duracaoMin > spec.timeout_min) {
    return escalar(
      custoUsd > spec.teto_custo_usd_execucao
        ? `custo real ($${custoUsd}) estourou o teto da ficha ($${spec.teto_custo_usd_execucao})`
        : `duração (${Math.round(duracaoMin)}min) estourou o timeout da ficha (${spec.timeout_min}min)`,
    );
  }

  return { decisao: "executado", saida, custoUsd };
}
