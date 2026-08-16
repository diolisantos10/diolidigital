// O ADAPTADOR REAL DO EXECUTOR — a ficha encontra o motor de IA da casa.
//
// Operação assistida (ordem do CEO, 15/08/2026). Este é o `deps.realizar`
// de produção: chama `generate()` (o ponto único de IA da casa, que registra
// custo em AIRunLog sozinho) e devolve saída + custo estimado para o teto da
// ficha. Lei 2 da casa: IA dá pensamento, não poder — sem provedor
// configurado ou com erro do provedor, DEGRADA para o rascunho rule-based
// determinístico, nunca derruba a esteira. O rascunho declara o que é.

import { generate, anyProviderConfigured } from "@/lib/ai/generate";
import { estimarCusto } from "@/lib/ai/precos";
import type { ContextoDeExecucao, DependenciasDoExecutor } from "@/lib/agency/execucao-v2/executor";
import type { SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
// A ficha do cargo chega ao agente sozinha (ordem do CEO, 16/08/2026): as
// regras escritas na ficha entram no system prompt em runtime, para as 81
// funções de uma vez. Ficha sem o bloco delimitado devolve string vazia e o
// agente roda com o entorno de sempre — degrada, nunca derruba (Lei 2).
import { blocoDeRegrasParaPrompt } from "@/lib/agency/catalogo-v2/regras-da-ficha";

function blocoDeEntradas(contexto: ContextoDeExecucao): string {
  return Object.entries(contexto.entradas)
    .map(([nome, valor]) => `### ${nome}\n${valor}`)
    .join("\n\n");
}

/** Rascunho determinístico — o fallback declarado da Lei 2 (degrada, nunca derruba). */
export function rascunhoRuleBased(
  spec: SpecOperacional,
  contexto: ContextoDeExecucao,
  motivo: string,
): { saida: string; custoUsd: number } {
  return {
    saida: JSON.stringify(
      {
        funcao: spec.funcao,
        departamento: spec.departamento,
        origem: `rule-based — ${motivo}. Rascunho estruturado para revisão humana; a qualidade sobe quando um provedor de IA for configurado pelo dono.`,
        formato_pedido_pela_ficha: spec.saida.formato,
        esquema_pedido_pela_ficha: spec.saida.esquema,
        rascunho: {
          objetivo: `Cumprir "${spec.metrica_sucesso}" a partir das entradas recebidas.`,
          entradas_consideradas: Object.keys(contexto.entradas),
          conteudo: Object.fromEntries(
            Object.entries(contexto.entradas).map(([nome, valor]) => [
              nome,
              valor.length > 600 ? `${valor.slice(0, 600)}…` : valor,
            ]),
          ),
          proximo_passo: `Handoff para ${spec.handoff.entrega_para} após revisão.`,
        },
      },
      null,
      2,
    ),
    custoUsd: 0,
  };
}

/**
 * A RÉGUA DE ATUAÇÃO, em palavras, dentro do prompt do agente.
 *
 * O número na ficha não serve de nada se quem trabalha não o lê. Aqui ele vira
 * instrução — e nunca o número sozinho: sempre o número COM o que fazer com
 * ele. Orientação, não trava: a última frase existe para o agente saber que
 * pode executar quando precisar, e que isso não é transgressão.
 */
export function reguaDeAtuacao(spec: SpecOperacional): string {
  const i = spec.indice_operacional;
  const perfil =
    i <= 25
      ? "Você DIRIGE: seu padrão é definir o rumo, distribuir e cobrar."
      : i <= 45
        ? "Você COORDENA: seu padrão é quebrar o trabalho em partes, passar a quem faz e acompanhar o aceite."
        : i <= 60
          ? "Você DECIDE E FAZ: produza a parte que exige o seu julgamento e distribua o resto."
          : i <= 80
            ? "Você FAZ E INTERPRETA: produza a maior parte, e suba o que exigir decisão de quem está acima."
            : "Você FAZ: produza o entregável com as próprias mãos; suba dúvida e bloqueio, nunca o trabalho.";
  return (
    `Régua de atuação deste cargo: ${i}% operacional. ${perfil} ` +
    "Isto é orientação, não proibição: se não houver a quem passar, execute — e diga no resultado que executou por falta de quem recebesse."
  );
}

export interface OpcoesDoAdaptador {
  workspaceId?: string;
  clienteId?: string | null;
}

/**
 * Dono de gasto por função da cadeia — os ids existem em `lib/ai/donos.ts`
 * (OPERACIONAIS) e o teste `todo-gasto-tem-dono` cobra a correspondência.
 * Função fora deste mapa NÃO chama IA: cai no rule-based declarado
 * (fail-closed — gasto sem endereço não acontece).
 */
const DONO_POR_FUNCAO: Record<string, string> = {
  "pm-orchestrator": "v2-pm-orchestrator",
  "brand-architect": "v2-brand-architect",
  "social-strategist": "v2-social-strategist",
  "editorial-planner": "v2-editorial-planner",
  copywriter: "v2-copywriter",
  "graphic-designer": "v2-graphic-designer",
};

/** Fábrica do `realizar` real — generate() com dono de gasto registrado. */
export function realizarComIA(opcoes: OpcoesDoAdaptador): DependenciasDoExecutor["realizar"] {
  return async (spec, contexto) => {
    const dono = DONO_POR_FUNCAO[spec.funcao];
    if (!dono) {
      return rascunhoRuleBased(spec, contexto, `função "${spec.funcao}" sem dono de gasto registrado — IA não é chamada sem endereço de custo`);
    }
    const temProvedor = opcoes.workspaceId ? await anyProviderConfigured(opcoes.workspaceId) : await anyProviderConfigured();
    if (!temProvedor) {
      return rascunhoRuleBased(spec, contexto, "nenhum provedor de IA configurado no ambiente");
    }
    const resultado = await generate({
      system: [
        `Você é a função executora "${spec.funcao}" do departamento "${spec.departamento}" da agência Dioli Digital.`,
        `Sua métrica de sucesso, pela ficha do cargo: ${spec.metrica_sucesso}.`,
        `Formato de saída exigido pela ficha: ${spec.saida.formato}. Esquema: ${spec.saida.esquema}.`,
        `Você entrega para: ${spec.handoff.entrega_para}. Produza trabalho completo e utilizável, não um esboço.`,
        reguaDeAtuacao(spec),
        blocoDeRegrasParaPrompt(spec.funcao),
        `Responda SOMENTE com JSON válido, sem texto fora do JSON.`,
      ].join("\n"),
      user: blocoDeEntradas(contexto),
      maxTokens: 1800,
      workspaceId: opcoes.workspaceId,
      clientId: opcoes.clienteId ?? contexto.clienteId ?? null,
      departmentId: spec.departamento,
      agentId: dono,
    });
    if (!resultado.ok) {
      return rascunhoRuleBased(spec, contexto, `provedor de IA falhou (${resultado.error})`);
    }
    const custo = estimarCusto(
      resultado.model,
      resultado.uso?.entrada ?? undefined,
      resultado.uso?.saida ?? undefined,
    );
    return { saida: JSON.stringify(resultado.data, null, 2), custoUsd: custo.usd ?? 0 };
  };
}
