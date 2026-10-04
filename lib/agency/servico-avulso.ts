// servico-avulso.ts — O CAMINHO CURTO DO SERVIÇO AVULSO (raio-x de 03/10,
// aplicado em 04/10/2026 por ordem do CEO).
//
// Um logo, um cardápio, uma arte solta: não precisa de projeto, esteira,
// calendário. Quatro passos, nesta ordem e só nesta ordem:
//
//   pedido → entregue → cobrado → fechado
//
// A cobrança é ÚNICA e REGISTRADA (valor em centavos, a data). Nada é cobrado
// automaticamente e nenhum link de pagamento é gerado aqui — "fechar" é a
// equipe dizendo que o dinheiro entrou. Financeiro entre produtos continua em
// stand-by (CEO, 04/10/2026).

import { prisma } from "@/lib/db/client";

export const ESTADOS_DO_AVULSO = ["pedido", "entregue", "cobrado", "fechado"] as const;
export type EstadoDoAvulso = (typeof ESTADOS_DO_AVULSO)[number];
export type AcaoDoAvulso = "entregar" | "cobrar" | "fechar";

const PROXIMO: Record<AcaoDoAvulso, { de: EstadoDoAvulso; para: EstadoDoAvulso }> = {
  entregar: { de: "pedido", para: "entregue" },
  cobrar: { de: "entregue", para: "cobrado" },
  fechar: { de: "cobrado", para: "fechado" },
};

export function ehAcaoDoAvulso(v: unknown): v is AcaoDoAvulso {
  return v === "entregar" || v === "cobrar" || v === "fechar";
}

/** A regra pura: de onde se pode ir para onde. */
export function transicao(estado: string, acao: AcaoDoAvulso): { ok: true; para: EstadoDoAvulso } | { ok: false; motivo: string } {
  const t = PROXIMO[acao];
  if (estado !== t.de) return { ok: false, motivo: `só dá para ${acao} um serviço em "${t.de}" (este está em "${estado}")` };
  return { ok: true, para: t.para };
}

/** "R$ 350,00" ou "350" → centavos. Inválido ou ≤ 0 → null (zero não é preço). */
export function centavosDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const limpo = v.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function criarAvulso(input: {
  workspaceId: string; clientId: string; titulo: string; descricao?: string | null; valorCentavos: number; criadoPor: string;
}) {
  return prisma.servicoAvulso.create({
    data: {
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      titulo: input.titulo.trim().slice(0, 160),
      descricao: input.descricao?.trim().slice(0, 2000) || null,
      valorCentavos: input.valorCentavos,
      criadoPor: input.criadoPor,
    },
  });
}

export async function avancarAvulso(workspaceId: string, id: string, acao: AcaoDoAvulso, nota?: string | null) {
  const atual = await prisma.servicoAvulso.findFirst({ where: { id, workspaceId } });
  if (!atual) return { ok: false as const, status: 404, motivo: "serviço não encontrado" };
  const t = transicao(atual.estado, acao);
  if (!t.ok) return { ok: false as const, status: 409, motivo: t.motivo };
  const agora = new Date();
  const data: Record<string, unknown> = { estado: t.para };
  if (acao === "entregar") { data.entregueEm = agora; if (nota) data.entregaNota = nota.trim().slice(0, 2000); }
  if (acao === "cobrar") data.cobradoEm = agora;
  if (acao === "fechar") data.fechadoEm = agora;
  // Escrita condicionada ao estado lido: dois cliques simultâneos não pulam passo.
  const { count } = await prisma.servicoAvulso.updateMany({ where: { id, workspaceId, estado: atual.estado }, data });
  if (count === 0) return { ok: false as const, status: 409, motivo: "o serviço mudou enquanto você clicava — recarregue" };
  return { ok: true as const, servico: await prisma.servicoAvulso.findFirst({ where: { id, workspaceId } }) };
}
