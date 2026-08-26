// A ENTRADA REAL DA DEMANDA — o plano do projeto passa pelo Gerente Geral.
//
// ── O QUE ESTAVA ABERTO, MEDIDO EM 25/08/2026 ───────────────────────────────
//
// `despacho.ts` provou o julgamento do Gerente Geral, e provou bem. Mas o
// caminho por onde a demanda ENTRA de verdade nesta casa — o briefing do
// atendimento/SDR que vira projeto em
// `lib/agency/execution/create-project-from-request.ts` — não passava por ele.
// Ele fazia, para cada tarefa do plano:
//
//     agentId: getDepartmentDef(DEPT_TO_DEF[t.department] ?? "project-management")?.primaryAgentId
//
// Três defeitos numa linha só:
//
//   1. **O Gerente Geral não existia no caminho.** A tarefa nascia com um
//      agente de LINHA como dono (`a2`, `a3`, `a4`), escolhido pelo criador do
//      projeto. O gerente do departamento descobria o trabalho depois do
//      agente dele — exatamente o que a ordem do CEO proíbe.
//   2. **`?? "project-management"` é palpite com cara de padrão.** Departamento
//      que o plano inventasse (o plano vem de um modelo de linguagem) não era
//      recusado: era silenciosamente despejado no PM. Ausência de informação
//      virava informação.
//   3. **Ninguém perguntava pelo aceite comercial.** A ficha do GG recusa
//      demanda sem aceite; o caminho real nunca fez a pergunta.
//
// ── O QUE ESTE MÓDULO FAZ ───────────────────────────────────────────────────
//
// É a tradução do plano em despachos, e a cadeia inteira aparece no valor de
// retorno: cada tarefa despachada diz o gerente que a recebeu E o agente de
// linha que o gerente atribuiu. Duas travas, as duas como valor:
//
//   • sem aceite comercial → NADA é despachado (não "quase nada": zero);
//   • departamento desconhecido → RECUSA com motivo, nunca cai no PM.
//
// Módulo PURO: sem banco, sem rede, sem IA. Quem grava é quem chamou.

import { entrarPeloGerenteGeral, type Demanda } from "./despacho";
import { conferirContraOEscopo, type EscopoContratado } from "./contrato-do-plano";
import { GERENTE_GERAL, ehGerente, departamentoDoGerente, existeDepartamentoCanonico } from "./cadeia";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";
import { getDepartmentDef, type DepartmentId } from "@/lib/agency/departments";

/** Uma tarefa como o plano do PM a escreve, antes de ter dono. */
export interface TarefaDoPlano {
  title: string;
  description?: string | null;
  /** Slug do departamento como o plano o escreveu. Pode ser lixo — é tratado. */
  department: string;
  estimatedDays?: number | null;
}

export interface TarefaDespachada {
  tarefa: TarefaDoPlano;
  /** Departamento canônico (catálogo V2). */
  departamentoId: string;
  /** O gerente que recebeu. NUNCA um agente de linha — é o contrato. */
  gerenteId: string;
  /**
   * O agente de linha a quem o GERENTE atribuiu, dentro do departamento dele.
   * `null` = o departamento não tem executor mapeado no legado; a tarefa
   * continua com dono (o gerente), e quem grava decide o que fazer.
   */
  executorId: string | null;
  /** O slug legado do departamento, para escrever nas estruturas antigas. */
  departamentoLegado: DepartmentId | null;
}

export interface DemandaRecusada {
  tarefa: TarefaDoPlano;
  motivo: string;
}

export interface PlanoDespachado {
  despachadas: TarefaDespachada[];
  recusadas: DemandaRecusada[];
}

/**
 * O slug que o plano escreve → o departamento CANÔNICO do catálogo V2.
 * Mora aqui porque agora existe UM lugar que traduz departamento — e porque
 * slug fora desta tabela é RECUSA, nunca `?? "project-management"`.
 */
const DO_PLANO_PARA_CANONICO: Record<string, string> = {
  strategy: "strategy",
  social: "social-media",
  "social-media": "social-media",
  design: "design",
  traffic: "paid-traffic",
  "paid-traffic": "paid-traffic",
  analytics: "analytics",
  quality: "quality",
  pm: "project-management",
  "project-management": "project-management",
  branding: "branding",
  "brand-hub": "branding",
};

/**
 * Departamento canônico → o departamento LEGADO de `lib/agency/departments.ts`,
 * de onde sai o `primaryAgentId` que o motor de execução sabe rodar.
 *
 * ⚠️ **Duas entradas são substituições declaradas, não equivalências.** O
 * legado NÃO tem `analytics` nem `quality` como departamento — quem executa as
 * duas hoje é o PM, e era isso que o `DEPT_TO_DEF` de
 * `create-project-from-request.ts` já fazia em silêncio. Aqui a substituição
 * está escrita: o departamento continua sendo o verdadeiro (o gerente que
 * recebe é `manager-analytics` / `manager-qualidade`), e só o EXECUTOR é
 * emprestado. Trocar isso por um executor próprio é dívida com dono, não
 * refatoração deste módulo.
 */
const CANONICO_PARA_LEGADO: Record<string, DepartmentId> = {
  strategy: "strategy",
  "social-media": "social-media",
  design: "design",
  "paid-traffic": "paid-traffic",
  "project-management": "project-management",
  branding: "brand-hub",
  analytics: "project-management",
  quality: "project-management",
  operations: "operations",
  "product-technology": "product-technology",
};

/**
 * A ATRIBUIÇÃO DENTRO DO DEPARTAMENTO — o segundo salto da cadeia.
 *
 * O Gerente Geral despacha ao gerente; o GERENTE escolhe o agente. Esta função
 * é o segundo salto, e ela recusa quem não é o gerente daquele departamento —
 * senão qualquer chamador poderia usá-la para pular o primeiro salto e a trava
 * de `despacho.ts` viraria decoração.
 */
export function atribuirNoDepartamento(
  gerenteId: string,
  departamentoId: string,
):
  | { decisao: "atribuido"; executorId: string | null; departamentoLegado: DepartmentId | null }
  | { decisao: "recusado"; motivo: string } {
  if (!ehGerente(gerenteId)) {
    return { decisao: "recusado", motivo: `"${gerenteId}" não é gerente de departamento — quem atribui trabalho de linha é o gerente.` };
  }
  if (departamentoDoGerente(gerenteId) !== departamentoId) {
    return {
      decisao: "recusado",
      motivo: `"${gerenteId}" não é gerente de ${departamentoId} — gerente não atribui trabalho no departamento do vizinho.`,
    };
  }
  const legado = CANONICO_PARA_LEGADO[departamentoId] ?? null;
  const executorId = legado ? (getDepartmentDef(legado)?.primaryAgentId ?? null) : null;
  return { decisao: "atribuido", executorId, departamentoLegado: legado };
}

export interface ContextoDaEntrada {
  /**
   * O aceite comercial existe? **Fato, nunca conveniência.** Quem chama tem de
   * conseguir apontar ONDE o aceite está registrado. `false` aqui não produz
   * "quase nenhum despacho": produz ZERO.
   */
  aceiteComercial: boolean;
  clienteId?: string;
  correlationId: string;
  /**
   * O ESCOPO QUE O CLIENTE ACEITOU — a metade negativa dele.
   *
   * Ausente = ninguem leu o escopo, e o contrato nao barra nada (o
   * comportamento de antes de 26/08/2026). Presente com recusa registrada, a
   * tarefa que vende o servico recusado e RECUSADA com motivo, e a recusa sai
   * pelo mesmo cano das outras (`recusadas`), com dono e frase. Ver
   * `lib/agency/gerencia/contrato-do-plano.ts`.
   */
  escopo?: EscopoContratado;
}

/**
 * A PORTA. Recebe o plano inteiro e devolve a cadeia inteira.
 *
 * Nenhuma exceção: recusa é valor de retorno, para o chamador ter de decidir o
 * que fazer com ela em vez de deixá-la escorrer para um `catch` genérico.
 */
export function despacharPlanoPeloGerenteGeral(
  tarefas: readonly TarefaDoPlano[],
  ctx: ContextoDaEntrada,
): PlanoDespachado {
  const despachadas: TarefaDespachada[] = [];
  const recusadas: DemandaRecusada[] = [];

  for (const tarefa of tarefas) {
    const bruto = (tarefa.department ?? "").trim();
    const canonico = DO_PLANO_PARA_CANONICO[bruto] ?? deSlugLegado(bruto);
    if (!canonico || !existeDepartamentoCanonico(canonico)) {
      recusadas.push({
        tarefa,
        motivo: `Departamento "${tarefa.department}" não existe no catálogo. Trabalho sem departamento não tem gerente, e trabalho sem gerente é trabalho que ninguém acompanha.`,
      });
      continue;
    }

    const demanda: Demanda = {
      descricao: tarefa.title,
      departamentoId: canonico,
      clienteId: ctx.clienteId,
      aceiteComercial: ctx.aceiteComercial,
      correlationId: ctx.correlationId,
    };

    // ── O CONTRATO DO PLANO CONTRA O ESCOPO (26/08/2026) ──────────────────
    // Antes do despacho, nao depois: tarefa que vende o que o cliente recusou
    // nao chega a ter gerente. O caso medido em producao foi "Planejamento de
    // Paid Strategy (Opcional)" para quem escreveu "anuncios nao, agora nao".
    const contrato = conferirContraOEscopo(
      { title: tarefa.title, description: tarefa.description },
      canonico,
      ctx.escopo,
    );
    if (!contrato.ok) {
      recusadas.push({ tarefa, motivo: contrato.motivo });
      continue;
    }

    const despacho = entrarPeloGerenteGeral(demanda);
    if (despacho.decisao === "recusado") {
      recusadas.push({ tarefa, motivo: despacho.motivo });
      continue;
    }

    const atribuicao = atribuirNoDepartamento(despacho.paraFuncaoId, despacho.departamentoId);
    if (atribuicao.decisao === "recusado") {
      recusadas.push({ tarefa, motivo: atribuicao.motivo });
      continue;
    }

    despachadas.push({
      tarefa,
      departamentoId: despacho.departamentoId,
      gerenteId: despacho.paraFuncaoId,
      executorId: atribuicao.executorId,
      departamentoLegado: atribuicao.departamentoLegado,
    });
  }

  return { despachadas, recusadas };
}

/** Uma frase para o log/evento. Batida sem placar não se audita. */
export function frazeDoDespacho(p: PlanoDespachado): string {
  if (p.despachadas.length === 0 && p.recusadas.length === 0) return "Gerente Geral: plano vazio, nada a despachar.";
  const porGerente = new Map<string, number>();
  for (const d of p.despachadas) porGerente.set(d.gerenteId, (porGerente.get(d.gerenteId) ?? 0) + 1);
  const destino = [...porGerente].map(([g, n]) => `${g}×${n}`).join(", ");
  const recusa = p.recusadas.length > 0 ? ` — ${p.recusadas.length} recusada(s): ${p.recusadas.map((r) => r.motivo).join(" | ")}` : "";
  return `${GERENTE_GERAL} despachou ${p.despachadas.length} tarefa(s) aos gerentes (${destino || "nenhum"})${recusa}`;
}
