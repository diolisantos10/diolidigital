// colher-identidade.ts — a marca que a agência CRIOU vira a marca que ela USA.
//
// O buraco de junta que isto fecha: o especialista de identidade visual definia
// paleta, tipografia e assinatura da marca — e escrevia tudo num `Deliverable`,
// texto puro. O `BrandBrain` do cliente continuava vazio. No mês seguinte, o
// especialista de social lia a marca, encontrava nulo e escrevia genérico; a
// arte era gerada sem paleta; e a própria identidade era proposta OUTRA VEZ,
// diferente da primeira.
//
// A agência criava a marca do cliente e depois esquecia dela. Nenhum teste
// pegava: cada peça estava certa isoladamente.
//
// Conservador por construção: só preenche campo VAZIO. O que a agência ajustou
// à mão, ou o que o cliente informou, vale mais que o que o modelo propôs.

import { prisma } from "@/lib/db/client";

/** Os especialistas cuja saída é a identidade da marca. `a2` é o histórico. */
const DONOS_DA_IDENTIDADE = ["a2"];

export interface IdentidadeColhida {
  camposPreenchidos: string[];
  /** Achou entrega de identidade? Se não, não há nada a colher — não é erro. */
  encontrouEntrega: boolean;
}

/**
 * Lê a entrega de identidade visual e grava o que dela é FATO da marca.
 *
 * Só campos objetivos: cor, tipografia, assinatura. Conceito e justificativa
 * ficam no entregável, onde pertencem — o `BrandBrain` é o que outros
 * especialistas consultam para não divergir, não um resumo do documento.
 */
export async function colherIdentidadeDaEntrega(
  projectId: string,
  clientId: string | null,
): Promise<IdentidadeColhida> {
  const saida: IdentidadeColhida = { camposPreenchidos: [], encontrouEntrega: false };
  if (!clientId) return saida;

  const entrega = await prisma.deliverable.findFirst({
    where: { projectId, ownerAgentId: { in: DONOS_DA_IDENTIDADE } },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  }).catch(() => null);
  if (!entrega?.content) return saida;
  saida.encontrouEntrega = true;

  const achados = {
    primaryColor: null as string | null,
    secondaryColor: null as string | null,
    typography: capturar(entrega.content, ["Tipografia", "Fonte", "Fontes", "Typography"]),
    tagline: capturar(entrega.content, ["Assinatura", "Slogan", "Tagline"]),
  };

  // Cores: preferir hex, que é inequívoco. "Azul petróleo" é uma descrição, e
  // uma descrição não reproduz a mesma cor duas vezes.
  const hex = entrega.content.match(/#[0-9a-fA-F]{6}\b/g);
  if (hex?.length) {
    achados.primaryColor = hex[0]!;
    achados.secondaryColor = hex[1] ?? null;
  } else {
    const paleta = capturar(entrega.content, ["Paleta", "Cores", "Cor"]);
    if (paleta) {
      const partes = paleta.split(/[·,;]|\se\s/).map((p) => p.trim()).filter(Boolean);
      achados.primaryColor = partes[0] ?? null;
      achados.secondaryColor = partes[1] ?? null;
    }
  }

  const existente = await prisma.brandBrain.findUnique({ where: { clientId } }).catch(() => null);
  const paraGravar: Record<string, string> = {};
  for (const [k, v] of Object.entries(achados)) {
    if (!v) continue;
    if (existente && (existente as unknown as Record<string, unknown>)[k]) continue;
    paraGravar[k] = v.slice(0, 300);
  }
  if (Object.keys(paraGravar).length === 0) return saida;

  if (!existente) await prisma.brandBrain.create({ data: { clientId, ...paraGravar } });
  else await prisma.brandBrain.update({ where: { clientId }, data: paraGravar });

  saida.camposPreenchidos = Object.keys(paraGravar);
  return saida;
}

/** Lê "- Campo: valor" ou "**Campo:** valor" — os dois formatos que o motor
 *  produz. Um leitor que só entende um dos dois perde metade das entregas. */
function capturar(texto: string, campos: string[]): string | null {
  for (const campo of campos) {
    const m = texto.match(new RegExp(`^[-*\\s]*\\*{0,2}${campo}:?\\*{0,2}:?\\s*(.+)$`, "mi"));
    const v = m?.[1]?.replace(/\*+/g, "").trim();
    if (v && v.length > 1) return v;
  }
  return null;
}
