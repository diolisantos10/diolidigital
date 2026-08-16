// A CADEIA TÉCNICA — as mãos do 12º departamento, ligadas ao motor que já existe.
//
// ─── O DEFEITO QUE ESTE ARQUIVO CONSERTA ────────────────────────────────────
//
// Em 15/08/2026 nasceu o departamento de Produto & Tecnologia: sete fichas em
// `agentes/linha/product-technology/`, sala própria e permissões travadas no
// servidor. Em 16/08 o CEO olhou o organograma e disse "olha o tanto de agente
// que tem nesse lugar que pode fazer isso" — e estava certo, porque nada no
// sistema convertia a saída daquelas sete fichas em trabalho. Era o defeito
// D-003 da casa (caixa desenhada, seta inexistente) apontado para dentro de
// casa. Este módulo é a seta.
//
// ─── O QUE ELE NÃO INVENTA ──────────────────────────────────────────────────
//
// Nenhum fluxo paralelo. A ordem dos passos é a que as PRÓPRIAS fichas
// declaram em `handoff.recebe_de`, e `ordemRespeitaAsFichas()` prova isso a
// cada rodada de teste — se alguém reordenar a cadeia à mão, o CI reprova. Toda
// trava (ficha ligada, entradas obrigatórias, ferramentas, teto de custo,
// gatilho humano, timeout, retentativa, rastro) continua sendo do executor V2:
// este módulo não tem permissão para abrir exceção em nenhuma delas, e não tem
// código que abra.
//
// ─── POR QUE HOMOLOGAÇÃO, E NÃO PRODUÇÃO ────────────────────────────────────
//
// As sete fichas estão `"ativa": false`, e o CI (`fichas-da-linha.test.ts`)
// reprova quem ligar função fora da allowlist que o CEO registrou. Isso não é
// obstáculo: é a regra da casa funcionando. Ligar em produção é decisão
// registrada do dono, nunca efeito de deploy — então a cadeia técnica roda em
// `modo: "homologacao"`, que é o corredor previsto pelo executor para trabalho
// que ainda não tem gente confiando nele.
//
// ─── E A REGRA DO SINTÉTICO ─────────────────────────────────────────────────
//
// Homologação exige `sintetico: true` porque "dado real não entra em ensaio".
// A demanda técnica desta cadeia é sobre o PRÓPRIO sistema — não tem cliente,
// não tem peça de campanha, não tem dado de ninguém. Para que isso não vire
// brecha por interpretação, a cadeia RECUSA em código qualquer pedido que
// carregue `clienteId`. A engenharia conserta a casa; ela não encosta no
// material do cliente.

import { specDaFuncao, type SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
import {
  executarFuncao,
  type AtorDaExecucao,
  type DependenciasDoExecutor,
  type ResultadoDaExecucao,
} from "@/lib/agency/execucao-v2/executor";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { analisarPatch, type AnaliseDoPatch } from "./guarda-de-patch";

const DEPARTAMENTO = "product-technology";

/**
 * A ordem canônica das sete, derivada de `handoff.recebe_de` das fichas e do
 * bloco comum do departamento ("UX/UI → arquitetura → engenharia → Qualidade").
 */
export const ORDEM_TECNICA: readonly string[] = [
  "technology-orchestrator",
  "software-architect",
  "product-designer",
  "design-system-engineer",
  "backend-engineer",
  "frontend-engineer",
  "fullstack-engineer",
];

/**
 * A CADEIA MÍNIMA — o caminho mais curto com valor de ponta a ponta: alguém
 * planeja, alguém decide a arquitetura, alguém escreve o patch. Sete passos
 * numa primeira rodada seria caro e difícil de auditar; três já respondem a
 * pergunta que importa ("a agência consegue produzir um conserto sozinha?").
 * Ampliar é mudar esta lista, e o teste de ordem cobra a coerência com as fichas.
 */
export const CADEIA_TECNICA_MINIMA: readonly string[] = [
  "technology-orchestrator",
  "software-architect",
  "backend-engineer",
];

/** Quebra "frontend-engineer, design-system-engineer e software-architect". */
export function idsDeHandoff(texto: string): string[] {
  return texto
    .split(/,| e /)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type ConferenciaDeOrdem = { ok: true } | { ok: false; motivo: string };

/**
 * Prova que a cadeia respeita o contrato das fichas: cada passo (menos o
 * primeiro) recebe de alguém que já passou, ou de fora do departamento — o
 * `technology-orchestrator` recebe de `project-management`, que é o PM.
 *
 * Existe porque uma cadeia escrita à mão envelhece calada: alguém edita a ficha
 * e a lista aqui continua igual, e ninguém descobre até o handoff quebrar em
 * produção.
 */
export function ordemRespeitaAsFichas(cadeia: readonly string[]): ConferenciaDeOrdem {
  const jaPassaram = new Set<string>();
  for (const funcaoId of cadeia) {
    const resultado = specDaFuncao(funcaoId);
    if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
    const spec = resultado.spec;
    const internas = idsDeHandoff(spec.handoff.recebe_de).filter((origem) => {
      const r = specDaFuncao(origem);
      return r.ok && r.spec.departamento === DEPARTAMENTO;
    });
    // Origem só de fora do departamento (ex.: "project-management") é entrada
    // legítima da cadeia — é o PM entregando a OS.
    if (internas.length > 0 && !internas.some((o) => jaPassaram.has(o))) {
      return {
        ok: false,
        motivo: `"${funcaoId}" recebe de ${internas.join(", ")} e nenhum deles corre antes na cadeia — a ordem contraria a ficha`,
      };
    }
    jaPassaram.add(funcaoId);
  }
  return { ok: true };
}

export interface DemandaTecnica {
  /** O que precisa ser consertado ou construído, em uma frase. */
  demanda: string;
  /** Onde dói: rota, arquivo, sintoma observado. Vai inteiro no dossiê. */
  contexto: string;
  /** Quando esta demanda está pronta — sem isto as fichas recusam, e devem. */
  criteriosDeAceite: string;
  correlationId: string;
  /** Passos já pagos neste correlationId — trabalho pago uma vez não se paga duas. */
  jaFeitos?: Record<string, string>;
  /** Sobrescreve a cadeia mínima. Conferida contra as fichas antes de rodar. */
  cadeia?: readonly string[];
  /**
   * Não existe. Está aqui só para ser RECUSADO: se um chamador tentar rodar a
   * cadeia técnica em cima de um cliente, a recusa é em código, não em prosa.
   */
  clienteId?: string;
}

export interface PassoTecnico {
  funcaoId: string;
  decisao: ResultadoDaExecucao["decisao"] | "reaproveitado";
  motivo?: string;
  custoUsd?: number;
  duracaoMs: number;
  /** Presente só quando a ficha entrega `git-patch` — o veredito da guarda. */
  guarda?: AnaliseDoPatch;
}

export interface ResultadoDaCadeiaTecnica {
  ok: boolean;
  passos: PassoTecnico[];
  /** A saída íntegra de cada passo, por função. */
  artefatos: Record<string, string>;
  /** As propostas de patch que passaram na guarda — para revisão, não aplicadas. */
  propostas: Array<{ funcaoId: string; patch: string; guarda: AnaliseDoPatch }>;
  custoTotalUsd: number;
  parouEm?: { funcaoId: string; decisao: string; motivo: string };
}

export interface DependenciasDaCadeiaTecnica {
  executor: DependenciasDoExecutor;
  perfil: PerfilOrganizacional;
  agora(): Date;
}

const ATOR_TECNICO: AtorDaExecucao = {
  ator: "ia",
  modelo: "cadeia-tecnica",
  versaoModelo: "v1",
};

/** A ficha promete patch? Só então a guarda entra — e aí ela é obrigatória. */
function entregaPatch(spec: SpecOperacional): boolean {
  return /git-patch/i.test(spec.saida.formato);
}

/**
 * O CONTRATO DA NÃO-ENTREGA: quem realiza o trabalho pode dizer "não entreguei,
 * e este é o motivo" devolvendo um JSON com `entregue: false` e `motivo`.
 *
 * POR QUE ISTO EXISTE, e o caso é de 16/08/2026, na primeira rodada de verdade
 * desta cadeia: sem provedor de IA no ambiente, o adaptador devolveu a falta
 * declarada nos três passos. O engenheiro parou na guarda, porque a guarda
 * exige diff — mas o orquestrador e o arquiteto saíram marcados "executado",
 * carregando um corpo que dizia `entregue: false`. Ou seja: a cadeia marcharia
 * inteira produzindo nada e chamando isso de sucesso, e só não chamou porque um
 * dos três tinha guarda.
 *
 * A guarda de patch cobria uma ficha em três. Este contrato cobre as sete.
 */
export function naoEntregou(saida: string): string | null {
  try {
    const corpo = JSON.parse(saida) as { entregue?: unknown; motivo?: unknown };
    if (corpo?.entregue === false) {
      return typeof corpo.motivo === "string" && corpo.motivo.trim()
        ? corpo.motivo
        : "quem executou declarou não-entrega sem dizer o motivo";
    }
  } catch {
    // Saída que não é JSON não fala este contrato — quem julga é a ficha.
  }
  return null;
}

export async function executarCadeiaTecnica(
  demanda: DemandaTecnica,
  deps: DependenciasDaCadeiaTecnica,
): Promise<ResultadoDaCadeiaTecnica> {
  const passos: PassoTecnico[] = [];
  const artefatos: Record<string, string> = {};
  const propostas: ResultadoDaCadeiaTecnica["propostas"] = [];
  let custoTotalUsd = 0;

  /**
   * Para a cadeia DEIXANDO RASTRO. O executor grava as recusas dele; as paradas
   * daqui (cliente, ordem inválida, guarda de patch, não-entrega) são recusas
   * da cadeia, e sem esta gravação elas não apareceriam no diário do piloto —
   * a agência teria parado por um bom motivo num lugar que o CEO não enxerga,
   * que é a mesma cegueira que custou a noite de 15/08.
   */
  const parar = async (funcaoId: string, decisao: string, motivo: string): Promise<ResultadoDaCadeiaTecnica> => {
    await deps.executor.gravarRecusa?.({
      funcaoId,
      motivo,
      correlationId: demanda.correlationId,
      em: deps.agora(),
    });
    return { ok: false, passos, artefatos, propostas, custoTotalUsd, parouEm: { funcaoId, decisao, motivo } };
  };

  // A recusa que protege o cliente vem antes de qualquer trabalho.
  if (demanda.clienteId) {
    return await parar(
      "cadeia-tecnica",
      "recusado",
      "a cadeia técnica não roda sobre cliente — ela conserta o sistema, e ensaio com dado real é proibido pela regra do CEO",
    );
  }

  // As entradas da CADEIA, conferidas aqui e não só na ficha. As
  // `entradas_obrigatorias` das fichas são frases ("OS aprovada pelo Project
  // Manager"), não campos — o dossiê preenche todas elas e a conferência do
  // executor vira carimbo. Sem esta trava, uma demanda vazia atravessaria os
  // três passos produzindo três artefatos sobre nada, e custando por isso.
  const vazias = (["demanda", "contexto", "criteriosDeAceite"] as const).filter((c) => !demanda[c]?.trim());
  if (vazias.length > 0) {
    return await parar(
      "cadeia-tecnica",
      "recusado",
      `demanda incompleta: ${vazias.join(", ")} — ausência de informação não é informação`,
    );
  }

  const cadeia = demanda.cadeia ?? CADEIA_TECNICA_MINIMA;
  const ordem = ordemRespeitaAsFichas(cadeia);
  if (!ordem.ok) return await parar("cadeia-tecnica", "recusado", ordem.motivo);

  // O dossiê cresce a cada passo: o arquiteto vê o plano do orquestrador, o
  // engenheiro vê o plano E o ADR. Sem isso cada passo trabalharia às cegas.
  const dossie: Record<string, string> = {
    "demanda técnica": demanda.demanda,
    "contexto e sintoma": demanda.contexto,
    "critérios de aceite": demanda.criteriosDeAceite,
  };

  for (const funcaoId of cadeia) {
    const resultadoSpec = specDaFuncao(funcaoId);
    if (!resultadoSpec.ok) return await parar(funcaoId, "recusado", resultadoSpec.motivo);
    const spec = resultadoSpec.spec;

    if (spec.departamento !== DEPARTAMENTO) {
      return await parar(funcaoId, "recusado", `"${funcaoId}" é de ${spec.departamento} — esta cadeia só despacha o próprio departamento`);
    }

    const jaFeito = demanda.jaFeitos?.[funcaoId];
    if (jaFeito) {
      artefatos[funcaoId] = jaFeito;
      dossie[`artefato de ${funcaoId}`] = jaFeito;
      passos.push({ funcaoId, decisao: "reaproveitado", duracaoMs: 0 });
      continue;
    }

    // Cada entrada obrigatória da ficha recebe o dossiê inteiro, rotulado —
    // salvo quando o dossiê já tem uma seção com o nome exato dela.
    const dossieCompleto = Object.entries(dossie)
      .map(([nome, valor]) => `## ${nome}\n${valor}`)
      .join("\n\n");
    const entradas: Record<string, string> = {};
    for (const nome of spec.entradas_obrigatorias) {
      entradas[nome] = dossie[nome] ?? dossieCompleto;
    }

    const inicioMs = deps.agora().getTime();
    const resultado = await executarFuncao(
      funcaoId,
      deps.perfil,
      {
        modo: "homologacao",
        sintetico: true,
        entradas,
        ferramentasPrevistas: [...spec.ferramentas_permitidas],
        custoPrevistoUsd: Math.min(0.05, spec.teto_custo_usd_execucao / 2),
        correlationId: demanda.correlationId,
        escopos: [],
      },
      ATOR_TECNICO,
      deps.executor,
    );
    const duracaoMs = deps.agora().getTime() - inicioMs;

    if (resultado.decisao !== "executado") {
      const motivo = resultado.decisao === "recusado" ? resultado.motivo : resultado.pacote.motivo;
      passos.push({ funcaoId, decisao: resultado.decisao, motivo, duracaoMs });
      return await parar(funcaoId, resultado.decisao, motivo);
    }

    custoTotalUsd += resultado.custoUsd;
    artefatos[funcaoId] = resultado.saida;

    // Não-entrega declarada PARA a cadeia. O passo seguinte trabalharia em cima
    // de um dossiê que anuncia não ter conteúdo — e entregaria, ele também,
    // nada com cara de alguma coisa.
    const falta = naoEntregou(resultado.saida);
    if (falta) {
      passos.push({ funcaoId, decisao: "recusado", motivo: falta, custoUsd: resultado.custoUsd, duracaoMs });
      return await parar(funcaoId, "recusado", `${funcaoId} não entregou: ${falta}`);
    }

    dossie[`artefato de ${funcaoId}`] = resultado.saida;

    // A GUARDA. Ficha que promete patch tem a saída julgada ANTES de virar
    // proposta — e o veredito para a cadeia, porque um passo perigoso não vira
    // insumo do passo seguinte.
    if (entregaPatch(spec)) {
      const guarda = analisarPatch(resultado.saida);
      passos.push({ funcaoId, decisao: "executado", custoUsd: resultado.custoUsd, duracaoMs, guarda });
      if (guarda.veredito === "aceito") {
        propostas.push({ funcaoId, patch: resultado.saida, guarda });
      } else {
        return await parar(funcaoId, guarda.veredito, guarda.motivo);
      }
      continue;
    }

    passos.push({ funcaoId, decisao: "executado", custoUsd: resultado.custoUsd, duracaoMs });
  }

  return { ok: true, passos, artefatos, propostas, custoTotalUsd };
}
