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

/** O que "autonomia" quer dizer para quem está executando, em uma frase. */
const AUTONOMIA_EM_PORTUGUES: Record<string, string> = {
  A: "Autonomia A — você decide e executa sozinho dentro da sua alçada.",
  B: "Autonomia B — você executa, mas o resultado passa por revisão antes de valer.",
  C: "Autonomia C — você PROPÕE; nada seu vale sem decisão humana registrada.",
};

/**
 * A FICHA CHEGA AO AGENTE EM EXECUÇÃO — não só ao motor.
 *
 * ─── Por que isto mudou (16/08/2026) ────────────────────────────────────────
 * As 69 fichas da V2 carregam `handoff.recebe_de`, `handoff.entrega_para`,
 * `sla_horas`, `autonomia`, `gatilhos_humanos` e as listas de ferramentas e
 * dados proibidos. O motor lia tudo isso e USAVA para decidir — mas o prompt
 * mandava ao modelo apenas função, departamento, métrica, formato e para quem
 * entrega. O agente executava sem saber DE QUEM recebeu, sem saber o que era
 * proibido tocar e, principalmente, SEM SABER QUANDO CHAMAR UM HUMANO.
 *
 * Isso não é detalhe de prompt. A trava dos gatilhos humanos no executor só
 * dispara com `gatilhosDetectados` vindos do chamador; se o próprio agente
 * não souber quais são, ele nunca declara o gatilho — e a decisão que devia
 * subir é executada por conta própria, em silêncio. Contar ao agente é a
 * primeira metade; a trava do motor continua sendo a segunda.
 *
 * O que o prompt NÃO faz: não vira permissão. Um modelo que ignore o texto
 * continua barrado por `ferramentas_proibidas`, pelo teto de custo e pelo
 * fail-closed da ficha ausente. Prompt é aviso; a trava é o motor.
 */
export function fichaComoPrompt(spec: SpecOperacional): string {
  const linhas: string[] = [
    `Você é a função executora "${spec.funcao}" do departamento "${spec.departamento}" da agência Dioli Digital.`,
    `Sua métrica de sucesso, pela ficha do cargo: ${spec.metrica_sucesso}.`,
    AUTONOMIA_EM_PORTUGUES[spec.autonomia] ?? `Autonomia ${spec.autonomia}.`,
    `Você RECEBE de: ${spec.handoff.recebe_de || "a porta de entrada da agência"}.`,
    `Você ENTREGA para: ${spec.handoff.entrega_para || "o PM da esteira"}. Produza trabalho completo e utilizável, não um esboço — quem recebe trabalha em cima do seu artefato.`,
    `Prazo do seu passo (SLA da ficha): ${spec.sla_horas} h. Handoff sem aceite não sai da fila de quem entregou.`,
    `Formato de saída exigido pela ficha: ${spec.saida.formato}. Esquema: ${spec.saida.esquema}.`,
  ];

  if (spec.gatilhos_humanos.length > 0) {
    linhas.push(
      `CHAME UM HUMANO — não decida sozinho — se qualquer um destes aparecer: ${spec.gatilhos_humanos.join("; ")}. ` +
        `Nesse caso, escreva no campo do artefato que a decisão precisa subir, e diga qual gatilho bateu.`,
    );
  }
  if (spec.ferramentas_proibidas.length > 0) {
    linhas.push(`Ferramentas PROIBIDAS para você: ${spec.ferramentas_proibidas.join(", ")}.`);
  }
  if (spec.dados_proibidos.length > 0) {
    linhas.push(`Dados que você NÃO pode acessar nem citar: ${spec.dados_proibidos.join(", ")}.`);
  }

  linhas.push(
    `Lei da casa: ausência de informação NÃO é informação. Se um dado do cliente não veio nas entradas, escreva "preciso confirmar" — nunca preencha por inferência, nunca invente número, nome, prazo ou promessa comercial.`,
    `Responda SOMENTE com JSON válido, sem texto fora do JSON.`,
  );

  return linhas.join("\n");
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
      system: fichaComoPrompt(spec),
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
