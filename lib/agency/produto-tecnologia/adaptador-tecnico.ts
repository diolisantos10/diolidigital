// O `realizar` DA CADEIA TÉCNICA — onde a ficha encontra o motor de IA.
//
// A cadeia (`cadeia-tecnica.ts`) governa e não trabalha: quem trabalha é esta
// função injetada. Ela existe separada da irmã da esteira assistida
// (`esteira-assistida/adaptador-de-ia.ts`) por uma diferença que não é de
// estilo: aquela produz peça de cliente e passa `clientId`; esta produz
// conserto do próprio sistema e o `clientId` é SEMPRE nulo — a cadeia recusa
// em código qualquer pedido com cliente.
//
// ─── A DIFERENÇA QUE IMPORTA: FICHA QUE PROMETE PATCH ───────────────────────
//
// Três das sete fichas declaram `"saida": {"formato": "git-patch"}`. Sem
// provedor de IA configurado, a irmã da esteira degrada para um rascunho JSON
// estruturado — e ali isso é certo, porque um rascunho de post ainda serve para
// um humano trabalhar em cima. Aqui não serve: um "rascunho de patch" que não é
// um diff é um objeto que ninguém aplica e ninguém revisa, com aparência de
// entrega. Então esta função DECLARA A FALTA em vez de fabricar substituto — e
// a guarda recusa a saída logo em seguida, parando a cadeia com o motivo certo.
// Ausência de informação não é informação.

import { generate, anyProviderConfigured } from "@/lib/ai/generate";
import { estimarCusto } from "@/lib/ai/precos";
import type { ContextoDeExecucao, DependenciasDoExecutor } from "@/lib/agency/execucao-v2/executor";
import type { SpecOperacional } from "@/lib/agency/catalogo-v2/specs";

/**
 * Dono de gasto por função — os ids existem em `lib/ai/donos.ts` e o teste
 * `todo-gasto-tem-dono` cobra a correspondência. Função fora do mapa NÃO chama
 * IA: gasto sem endereço não acontece.
 */
const DONO_POR_FUNCAO: Record<string, string> = {
  "technology-orchestrator": "pt-technology-orchestrator",
  "software-architect": "pt-software-architect",
  "product-designer": "pt-product-designer",
  "design-system-engineer": "pt-design-system-engineer",
  "backend-engineer": "pt-backend-engineer",
  "frontend-engineer": "pt-frontend-engineer",
  "fullstack-engineer": "pt-fullstack-engineer",
};

function entregaPatch(spec: SpecOperacional): boolean {
  return /git-patch/i.test(spec.saida.formato);
}

function blocoDeEntradas(contexto: ContextoDeExecucao): string {
  return Object.entries(contexto.entradas)
    .map(([nome, valor]) => `### ${nome}\n${valor}`)
    .join("\n\n");
}

/**
 * A falta, declarada. Passa no piso do executor (tem corpo) e é REPROVADA de
 * propósito pela guarda quando a ficha prometia patch — é assim que a cadeia
 * para com um motivo verdadeiro em vez de entregar um objeto inútil.
 */
export function faltaDeclarada(spec: SpecOperacional, motivo: string): { saida: string; custoUsd: number } {
  return {
    saida: JSON.stringify(
      {
        funcao: spec.funcao,
        departamento: "product-technology",
        entregue: false,
        motivo,
        formato_prometido_pela_ficha: spec.saida.formato,
        o_que_falta: entregaPatch(spec)
          ? "um provedor de IA configurado — sem ele esta função não escreve código, e rascunho que finge ser patch é pior que a falta"
          : "um provedor de IA configurado",
      },
      null,
      2,
    ),
    custoUsd: 0,
  };
}

export interface OpcoesDoAdaptadorTecnico {
  workspaceId?: string;
}

/**
 * Tira o patch do embrulho JSON. Ficha de patch → devolve o diff cru, que é o
 * que a guarda sabe ler; qualquer outra → o JSON como veio.
 *
 * Se o modelo desobedecer e não mandar `patch`, devolve o JSON inteiro de
 * propósito: a guarda recusa por "não é diff" e a cadeia para com o motivo
 * verdadeiro, em vez de este módulo maquiar a desobediência.
 */
export function desembrulhar(spec: SpecOperacional, data: unknown): string {
  if (entregaPatch(spec)) {
    const patch = (data as { patch?: unknown })?.patch;
    if (typeof patch === "string" && patch.trim()) return patch;
  }
  return JSON.stringify(data, null, 2);
}

/** O que se manda ao modelo. Separado para o teste poder ler sem chamar IA. */
export function instrucaoDaFuncao(spec: SpecOperacional): string {
  const comum = [
    `Você é a função executora "${spec.funcao}" do departamento de Produto & Tecnologia da agência Dioli Digital.`,
    `Você está consertando o PRÓPRIO sistema da agência. Não há cliente envolvido.`,
    `Sua métrica de sucesso, pela ficha do cargo: ${spec.metrica_sucesso}.`,
    `Você entrega para: ${spec.handoff.entrega_para}.`,
    `Ferramentas PROIBIDAS pela sua ficha, sem exceção: ${spec.ferramentas_proibidas.join("; ")}.`,
    `Se a demanda exigir algo desta lista — ${spec.gatilhos_humanos.join("; ")} —, NÃO produza a mudança: descreva o impedimento.`,
  ];
  if (entregaPatch(spec)) {
    // O patch viaja DENTRO de um JSON porque `generate()` é o ponto único de
    // IA da casa e ele sempre parseia JSON — devolver diff cru faria a chamada
    // inteira ser contada como falha de formato. O campo é um só, e o valor é
    // o diff literal.
    return [
      ...comum,
      `Responda SOMENTE com JSON válido no formato {"patch": "<diff unificado do git>"}, sem texto fora do JSON.`,
      `O valor de "patch" começa em "diff --git " e é um patch aplicável com \`git apply\`, com cabeçalho e hunks completos.`,
      `O patch NÃO será aplicado automaticamente: ele vira proposta para revisão humana.`,
      `Nunca inclua alteração de banco que remova dado ou coluna, arquivo de ambiente, credencial, configuração de deploy nem ficha de agente — tudo isso é barrado por código e derruba a entrega inteira.`,
    ].join("\n");
  }
  return [
    ...comum,
    `Formato de saída exigido pela ficha: ${spec.saida.formato}. Esquema: ${spec.saida.esquema}.`,
    `Responda SOMENTE com JSON válido, sem texto fora do JSON.`,
  ].join("\n");
}

/** Fábrica do `realizar` real da cadeia técnica. */
export function realizarTecnicoComIA(
  opcoes: OpcoesDoAdaptadorTecnico = {},
): DependenciasDoExecutor["realizar"] {
  return async (spec, contexto) => {
    const dono = DONO_POR_FUNCAO[spec.funcao];
    if (!dono) {
      return faltaDeclarada(spec, `função "${spec.funcao}" sem dono de gasto registrado — IA não é chamada sem endereço de custo`);
    }
    const temProvedor = opcoes.workspaceId
      ? await anyProviderConfigured(opcoes.workspaceId)
      : await anyProviderConfigured();
    if (!temProvedor) {
      return faltaDeclarada(spec, "nenhum provedor de IA configurado no ambiente");
    }

    const resultado = await generate({
      system: instrucaoDaFuncao(spec),
      user: blocoDeEntradas(contexto),
      maxTokens: 3000,
      workspaceId: opcoes.workspaceId,
      // SEMPRE nulo: o trabalho é da casa. Pendurar este custo em um cliente
      // faria o DRE dele pagar o conserto do sistema.
      clientId: null,
      departmentId: "product-technology",
      agentId: dono,
    });
    if (!resultado.ok) {
      return faltaDeclarada(spec, `provedor de IA falhou (${resultado.error})`);
    }
    const custo = estimarCusto(
      resultado.model,
      resultado.uso?.entrada ?? undefined,
      resultado.uso?.saida ?? undefined,
    );
    return { saida: desembrulhar(spec, resultado.data), custoUsd: custo.usd ?? 0 };
  };
}
