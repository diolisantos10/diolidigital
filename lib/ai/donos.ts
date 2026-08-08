// QUEM PEDIU A CHAMADA DE IA — o registro de donos.
//
// ─── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
//
// `AIRunLog` ganhou `agentId` e preço em 06/08/2026, e isso estava certo. O que
// estava errado era a COBERTURA: medido em 07/08, das 32 chamadas a `generate({…})`
// no repositório, **10 declaravam o dono e 22 não**. O departamento financeiro
// mediria uma fração do gasto — e, pior, não saberia QUAL fração. Um relatório
// que conta 30% do custo e se apresenta como completo é mais perigoso que a
// ausência de relatório: ele produz decisão errada com cara de dado.
//
// ─── POR QUE UM REGISTRO, E NÃO UMA STRING LIVRE ─────────────────────────────
//
// String livre reabre o buraco por outra porta: `agentId: "social"` num arquivo
// e `agentId: "social-media"` noutro viram DOIS agentes no relatório, e o custo
// do mesmo especialista aparece partido ao meio sem ninguém errar nada. O
// registro é a lista fechada; `donoDaChamada()` é quem responde qual
// departamento paga a conta.
//
// ─── AS DUAS TRAVAS, E POR QUE SÃO DUAS ──────────────────────────────────────
//
//   1. **Compilação** — `agentId` é OBRIGATÓRIO na assinatura de `generate()`.
//      Chamada nova sem dono não compila; `npx tsc --noEmit` reprova no portão.
//      Isto é o que torna impossível abrir o próximo buraco por esquecimento —
//      e esquecimento foi exatamente a causa das 22.
//   2. **Teste estático** — `__tests__/ai/todo-gasto-tem-dono.test.ts` varre o
//      repositório e reprova (a) chamada sem `agentId` e (b) `agentId` literal
//      que não esteja neste registro. A compilação não pega um `as never`, um
//      `satisfies` esperto ou uma string montada em runtime; o teste pega.
//
// Nenhuma das duas fica no caminho da ENTREGA: dono desconhecido em produção
// não derruba a peça do cliente — ele é gravado como veio e denunciado no log
// do processo (`registro-de-custo.ts`). A contabilidade não pode ser o que para
// a agência; mas também não pode mentir em silêncio.

import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";

export interface DonoDeChamada {
  /** O que vai para `AIRunLog.agentId`. Único na casa, imutável. */
  id: string;
  label: string;
  /** Quem PAGA a conta. Vai para `AIRunLog.departmentId`. */
  departmentId: string;
  /**
   * `especialista` — produz entregável de cliente (vem de `especialistas.ts`).
   * `operacao`     — roda a agência (triagem, radar, relatório, refação).
   * `diagnostico`  — ferramenta de operador; gasto real, sem cliente.
   */
  natureza: "especialista" | "operacao" | "diagnostico";
}

/**
 * Os donos que NÃO são especialistas de produção.
 *
 * Cada um existe porque uma chamada real de IA acontece ali. Nenhum é
 * decorativo: acrescentar linha aqui sem chamada correspondente enche o
 * relatório de agente que gasta zero e faz parecer que a casa mede mais do que
 * mede.
 */
const OPERACIONAIS: DonoDeChamada[] = [
  // ── Esteira: briefing → proposta → projeto → entregável ────────────────────
  { id: "esteira-triagem",        label: "Triagem de pedido do cliente",   departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "esteira-refacao",        label: "Refação a pedido do cliente",    departmentId: "quality",            natureza: "operacao" },
  { id: "esteira-pacote-travado", label: "Refação após reprovação",        departmentId: "quality",            natureza: "operacao" },
  { id: "esteira-avaliacoes",     label: "Resposta a avaliação do Google", departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "esteira-relatorio-mes",  label: "Relatório mensal do cliente",    departmentId: "analytics",          natureza: "operacao" },
  { id: "esteira-producao",       label: "Produção de pedido avulso",      departmentId: "project-management", natureza: "operacao" },

  // ── Comercial e entrada ───────────────────────────────────────────────────
  { id: "comercial-qualificar",   label: "Qualificação de oportunidade",   departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "comercial-negociacao",   label: "Negociação de proposta",         departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "comercial-materiais",    label: "Material que falta do cliente",  departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "comercial-proposta",     label: "Reescrita de proposta",          departmentId: "client-service-sdr", natureza: "operacao" },
  { id: "portal-sugestao",        label: "Sugestão de resposta no portal", departmentId: "client-service-sdr", natureza: "operacao" },

  // ── Gestão, inteligência e qualidade ──────────────────────────────────────
  { id: "pm-orquestrador",        label: "Orquestrador do PM",             departmentId: "project-management", natureza: "operacao" },
  { id: "pm-cronograma",          label: "Cronograma do projeto",          departmentId: "project-management", natureza: "operacao" },
  { id: "radar-tendencias",       label: "Radar — tendências do domínio",  departmentId: "strategy",           natureza: "operacao" },
  { id: "radar-feeds",            label: "Radar — leitura de feeds",       departmentId: "strategy",           natureza: "operacao" },
  { id: "leitura-do-cliente",     label: "Leitura do feed do cliente",     departmentId: "strategy",           natureza: "operacao" },
  { id: "quality-auditor",        label: "Auditoria de qualidade",         departmentId: "quality",            natureza: "operacao" },
  { id: "cerebro-raciocinio",     label: "Raciocínio do Dioli Brain",      departmentId: "project-management", natureza: "operacao" },

  // ── As 6 telas de agente da agência (`/api/agents/*`) ─────────────────────
  // Os ids ficam EXATAMENTE como já estão gravados nessas rotas desde 07/08.
  // Renomeá-los para a grafia dos especialistas partiria o histórico do
  // relatório em duas linhas para o mesmo trabalho — o defeito que este
  // registro existe para impedir, cometido pela mão de quem o criou.
  { id: "pm",         label: "Console do PM",             departmentId: "project-management", natureza: "operacao" },
  { id: "social",     label: "Console de Social Media",   departmentId: "social-media",       natureza: "operacao" },
  { id: "design",     label: "Console de Design",         departmentId: "design",             natureza: "operacao" },
  { id: "ads",        label: "Console de Tráfego Pago",   departmentId: "paid-traffic",       natureza: "operacao" },
  { id: "brand",      label: "Console de Marca",          departmentId: "strategy",           natureza: "operacao" },
  { id: "operations", label: "Console de Operações",      departmentId: "project-management", natureza: "operacao" },

  // ── Ferramentas de operador: gasto real, sem cliente ──────────────────────
  // Ficam separadas de propósito. No painel do financeiro elas aparecem como
  // custo da CASA, não de projeto — misturá-las com produção faria um cliente
  // parecer mais caro do que é.
  { id: "console-ia",             label: "Console de IA (/api/ai/run)",    departmentId: "operacao-interna",   natureza: "diagnostico" },
  { id: "admin-diagnostico",      label: "Diagnóstico do admin",           departmentId: "operacao-interna",   natureza: "diagnostico" },
];

/** Todos os donos possíveis: especialistas de produção + operacionais. */
export const DONOS_DE_CHAMADA: DonoDeChamada[] = [
  ...TODOS_OS_ESPECIALISTAS.map((e) => ({
    id: e.id,
    label: e.label,
    departmentId: e.departamentoId,
    natureza: "especialista" as const,
  })),
  ...OPERACIONAIS,
];

const POR_ID = new Map(DONOS_DE_CHAMADA.map((d) => [d.id, d]));

// Id duplicado quebra a soma do relatório em silêncio (duas linhas somando no
// mesmo nome, ou uma sobrescrevendo a outra no Map). Falhar no import é alto e
// cedo; descobrir por DRE errado é tarde e caro.
if (POR_ID.size !== DONOS_DE_CHAMADA.length) {
  const vistos = new Set<string>();
  const dup = DONOS_DE_CHAMADA.map((d) => d.id).filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
  throw new Error(`donos.ts: id de dono duplicado — ${[...new Set(dup)].join(", ")}`);
}

/** O dono, ou `null` se o id não estiver registrado. Nunca inventa. */
export function donoDaChamada(id: string | null | undefined): DonoDeChamada | null {
  return id ? POR_ID.get(id) ?? null : null;
}

/**
 * Qual departamento paga esta chamada.
 *
 * Precedência: o que o chamador declarou explicitamente vence (ele pode saber
 * de um contexto que o registro não tem); senão, o departamento do dono.
 * `null` quando nenhum dos dois responde — e `null` vira `"desconhecido"` no
 * banco, que é uma resposta ruim mas HONESTA. Chutar um departamento aqui
 * faria o DRE atribuir custo à casa errada, que é pior que não saber.
 */
export function departamentoQuePaga(
  agentId: string | null | undefined,
  declarado?: string | null,
): string | null {
  if (declarado) return declarado;
  return donoDaChamada(agentId)?.departmentId ?? null;
}
