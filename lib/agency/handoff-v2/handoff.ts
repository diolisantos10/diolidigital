// HANDOFF ENTRE DEPARTAMENTOS — o contrato do 03-ESTEIRA, como motor.
//
// Integração V2 (ordem do CEO, 15/08/2026). A regra literal da esteira
// integrada: todo handoff carrega o que entra, o que sai, versão do artefato,
// critérios de aceite, responsável, prazo do próximo passo e bloqueios — e
// **sem aceite do recebedor a tarefa NÃO some da fila anterior**: fica
// `aguardando_recebimento` até alguém do departamento destino aceitar.
//
// Armazém injetável (tabela `HandoffV2` em produção; memória nos testes).
// Validação fail-closed: campo do contrato faltando, departamento fora do
// catálogo ou handoff para si mesmo — nada disso cria linha.

import { departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

export interface PedidoDeHandoff {
  deDepartamento: string;
  paraDepartamento: string;
  responsavelEntrega: string;
  /** O que entra: o insumo que o próximo departamento recebe. */
  entrada: string;
  /** O que sai: o artefato entregue por quem passa o bastão. */
  saida: string;
  versaoArtefato: string;
  /** Critérios de aceite — o recebedor confere contra isto, não contra memória. */
  criterios: string;
  prazoProximo?: Date;
  bloqueios?: string[];
  correlationId: string;
  /** De qual AGÊNCIA é este bastão. Sem ele, a sala do PM de uma casa lista
   *  o trabalho da outra (achado G-5 do `seguranca`, 16/08/2026). */
  workspaceId?: string | null;
}

export interface LinhaDeHandoff extends Omit<PedidoDeHandoff, "bloqueios"> {
  id: string;
  bloqueios: string[];
  responsavelRecebe?: string;
  status: "aguardando_recebimento" | "aceito";
  criadoEm: Date;
  aceitoEm?: Date;
}

export interface ArmazemDeHandoffs {
  criar(linha: Omit<LinhaDeHandoff, "id">): Promise<{ id: string }>;
  buscar(id: string): Promise<LinhaDeHandoff | null>;
  aceitar(id: string, responsavelRecebe: string, em: Date): Promise<void>;
}

export type ResultadoDeHandoff =
  | { ok: true; id: string; status: "aguardando_recebimento" }
  | { ok: false; motivo: string };

export async function criarHandoff(
  pedido: PedidoDeHandoff,
  armazem: ArmazemDeHandoffs,
  agora: () => Date,
): Promise<ResultadoDeHandoff> {
  for (const [campo, valor] of [
    ["responsavelEntrega", pedido.responsavelEntrega],
    ["entrada", pedido.entrada],
    ["saida", pedido.saida],
    ["versaoArtefato", pedido.versaoArtefato],
    ["criterios", pedido.criterios],
    ["correlationId", pedido.correlationId],
  ] as const) {
    if (!valor?.trim()) return { ok: false, motivo: `handoff sem ${campo} — o contrato do 03 não tem campo opcional aqui` };
  }
  if (!departamentoV2(pedido.deDepartamento)) {
    return { ok: false, motivo: `departamento de origem desconhecido: "${pedido.deDepartamento}"` };
  }
  if (!departamentoV2(pedido.paraDepartamento)) {
    return { ok: false, motivo: `departamento de destino desconhecido: "${pedido.paraDepartamento}"` };
  }
  if (pedido.deDepartamento === pedido.paraDepartamento) {
    return { ok: false, motivo: "handoff para o próprio departamento não é handoff — é tarefa interna" };
  }
  const { id } = await armazem.criar({
    ...pedido,
    bloqueios: pedido.bloqueios ?? [],
    status: "aguardando_recebimento",
    criadoEm: agora(),
  });
  return { ok: true, id, status: "aguardando_recebimento" };
}

export type ResultadoDeAceite =
  | { ok: true; idempotente?: true }
  | { ok: false; motivo: string };

/**
 * Aceite do recebedor — só quem escreve no departamento DESTINO aceita.
 * Aceitar duas vezes é seguro (idempotente); aceitar o que não existe, não.
 */
export async function aceitarHandoff(
  id: string,
  responsavelRecebe: string,
  departamentosDoRecebedor: string[],
  armazem: ArmazemDeHandoffs,
  agora: () => Date,
): Promise<ResultadoDeAceite> {
  if (!responsavelRecebe.trim()) return { ok: false, motivo: "aceite sem responsável — quem recebeu?" };
  const linha = await armazem.buscar(id);
  if (!linha) return { ok: false, motivo: `handoff "${id}" não existe — não se aceita o que não foi entregue` };
  if (linha.status === "aceito") return { ok: true, idempotente: true };
  if (!departamentosDoRecebedor.includes(linha.paraDepartamento)) {
    return { ok: false, motivo: `aceite negado: o handoff é para ${linha.paraDepartamento} e o recebedor não escreve lá` };
  }
  await armazem.aceitar(id, responsavelRecebe, agora());
  return { ok: true };
}
