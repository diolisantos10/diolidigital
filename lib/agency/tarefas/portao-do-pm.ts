// O PORTÃO DO PM — as duas checagens que estavam declaradas e não tinham leitor.
//
// `pm_task_owner` e `pm_deadline` estão em `lib/dioli-brain/quality-gates.ts`
// marcadas `autoCheckable: true` desde que o registro nasceu. Auditoria de
// 06/08/2026 (`docs/projetos/p0-portoes/00-projeto.md`): **não tinham um único
// chamador**. `getBlockingChecks` também não tinha. Metadado que diz "isto é
// verificável" sem código que verifique é a mesma família do gate que dizia PASS
// sobre o que ninguém olhou — só que uma casa mais adiante: aqui a flag mente
// sobre o próprio mecanismo.
//
// Este arquivo é o mecanismo. Ele é PURO de propósito (sem Prisma, sem rede):
// quem grava é `criar-tarefas.ts`, e portão que depende de banco não pode ser
// testado nas duas metades.
//
// ── AS DUAS METADES (regra da casa) ──────────────────────────────────────────
//   1. Barra o problema plantado: tarefa sem dono e tarefa sem prazo REPROVAM.
//   2. Não inventa problema no caso limpo: conjunto bem formado passa inteiro,
//      sem ressalva. Alarme falso recorrente treina o time a desligar o alarme.
//
// ── O QUE ESTE PORTÃO NÃO FAZ: PREENCHER ─────────────────────────────────────
// Ele não completa o que falta. Se completasse, nunca reprovaria — e a checagem
// voltaria a ser enfeite com outra roupa. Quem chama é que precisa trazer dono e
// prazo de uma FONTE REAL:
//   • dono  → o agente que o GERENTE do departamento atribuiu, via
//     `lib/agency/gerencia/entrada-da-demanda.ts` (25/08/2026: antes disto o
//     criador do projeto escolhia o agente de linha sozinho, pulando o gerente);
//   • prazo → o `estimatedDays` que o próprio PM estimou na proposta
//     (`pm-orchestrator.ts:19`) — plano da casa, não data inventada sobre o
//     cliente. Ausência de informação não é informação: o que não tem fonte não
//     ganha valor, é barrado.

/** Uma tarefa como ela chega ao portão — antes de existir no banco. */
export interface TarefaProposta {
  projectId: string;
  title: string;
  description?: string | null;
  agentId?: string | null;
  status?: string;
  dueDate?: string | null;
}

export type IdDePortaoDoPM = "pm_task_owner" | "pm_deadline";

export interface ItemDePortaoDoPM {
  id: IdDePortaoDoPM;
  label: string;
  /** PASS = conferido e certo. FAIL = violação DETECTADA. Não existe terceiro
   *  estado aqui: as duas são código puro e nunca ficam "indisponíveis". */
  status: "PASS" | "FAIL";
  blocking: true;
  detail: string;
}

export interface TarefaReprovada {
  indice: number;
  title: string;
  violacoes: IdDePortaoDoPM[];
  /** Frase pronta para o registro de atividade — o cliente nunca lê isto. */
  parecer: string;
}

export interface VeredictoDoPortaoDoPM {
  aprovado: boolean;
  itens: ItemDePortaoDoPM[];
  /** As que passaram. É esta lista que vai ao banco — nunca a original. */
  aprovadas: TarefaProposta[];
  reprovadas: TarefaReprovada[];
}

const ROTULO: Record<IdDePortaoDoPM, string> = {
  pm_task_owner: "Task com dono definido",
  pm_deadline: "Prazo definido",
};

/** `YYYY-MM-DD` — o formato que `Task.dueDate` (String) já usa no resto da casa
 *  (`app/api/messages/pedidos/route.ts:44`). Segundo formato seria segundo
 *  caminho, e o menos testado quebra primeiro. */
const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Aceita só data de calendário REAL. `2026-02-31` casa com a regex e não
 *  existe; prazo que não existe é prazo que ninguém cumpre. */
export function prazoValido(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const v = valor.trim();
  if (!FORMATO_DE_DATA.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: só passa se a data normalizada for a mesma escrita.
  return d.toISOString().slice(0, 10) === v;
}

export function donoValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

/**
 * Roda as duas checagens sobre um conjunto de tarefas.
 *
 * Granularidade é por TAREFA, não por lote: barrar as 6 tarefas de um projeto
 * porque uma veio sem dono seria trocar um furo por um freio de mão. O que é
 * bloqueante é a tarefa defeituosa — ela não entra.
 */
export function conferirPortaoDoPM(tarefas: TarefaProposta[]): VeredictoDoPortaoDoPM {
  const aprovadas: TarefaProposta[] = [];
  const reprovadas: TarefaReprovada[] = [];

  tarefas.forEach((t, indice) => {
    const violacoes: IdDePortaoDoPM[] = [];
    if (!donoValido(t.agentId)) violacoes.push("pm_task_owner");
    if (!prazoValido(t.dueDate)) violacoes.push("pm_deadline");

    if (violacoes.length === 0) {
      aprovadas.push({ ...t, agentId: t.agentId!.trim(), dueDate: t.dueDate!.trim() });
      return;
    }
    reprovadas.push({
      indice,
      title: t.title,
      violacoes,
      parecer: violacoes
        .map((v) =>
          v === "pm_task_owner"
            ? "sem responsável designado"
            : "sem prazo em YYYY-MM-DD",
        )
        .join("; "),
    });
  });

  const semDono = reprovadas.filter((r) => r.violacoes.includes("pm_task_owner")).length;
  const semPrazo = reprovadas.filter((r) => r.violacoes.includes("pm_deadline")).length;

  const itens: ItemDePortaoDoPM[] = [
    {
      id: "pm_task_owner",
      label: ROTULO.pm_task_owner,
      status: semDono > 0 ? "FAIL" : "PASS",
      blocking: true,
      detail:
        semDono > 0
          ? `${semDono} de ${tarefas.length} tarefa(s) sem responsável designado.`
          : `${tarefas.length} tarefa(s) com responsável designado.`,
    },
    {
      id: "pm_deadline",
      label: ROTULO.pm_deadline,
      status: semPrazo > 0 ? "FAIL" : "PASS",
      blocking: true,
      detail:
        semPrazo > 0
          ? `${semPrazo} de ${tarefas.length} tarefa(s) sem prazo válido (YYYY-MM-DD).`
          : `${tarefas.length} tarefa(s) com prazo definido.`,
    },
  ];

  return { aprovado: reprovadas.length === 0, itens, aprovadas, reprovadas };
}

// ── Derivação do prazo, a partir do plano que a casa JÁ tem ───────────────────

/**
 * `estimatedDays` do PM → data de vencimento.
 *
 * NÃO é chute: `TaskProposal.estimatedDays` é campo obrigatório da proposta e
 * validado em `openai-schemas`. O que se faz aqui é aritmética sobre um dado
 * que já existe — por isso a data é legítima mesmo sendo provisória (a própria
 * checagem diz "mesmo que provisório").
 *
 * Sem `estimatedDays` utilizável, devolve `null` — e `null` é reprovado pelo
 * portão. Preencher com um número redondo qualquer seria inventar prazo, que é
 * exatamente o que a casa proíbe.
 */
export function prazoAPartirDaEstimativa(
  estimatedDays: unknown,
  base: Date = new Date(),
): string | null {
  const dias =
    typeof estimatedDays === "number" && Number.isFinite(estimatedDays)
      ? Math.ceil(estimatedDays)
      : null;
  if (dias === null || dias <= 0 || dias > 365) return null;
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
