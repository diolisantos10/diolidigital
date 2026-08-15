// API da fila da Central — cada um vê a própria mesa, derivada do PERFIL.
//
// Marco 4 da V2. O recorte NUNCA vem de parâmetro: vem do JWT via guarda
// (regra de ouro da organizacao). Staff vê a fila dos departamentos onde
// escreve; direção vê todas. A permissão é a da Central (`/agency/dashboard`,
// todos_internos) — a fila é individual por construção, não por filtro de URL.

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { filtrarFila, type ItemDeFila } from "@/lib/agency/v2-superficies/fila";
import { departamentoDoAgente } from "@/lib/agency/escada/degraus";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";

export async function GET() {
  const guarda = await exigirApiInterna("/agency/dashboard");
  if (guarda.erro) return guarda.erro;
  const { perfil } = guarda.acesso;

  const tarefas = await prisma.task.findMany({
    where: { status: { in: ["pending", "in_progress", "in_review"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, title: true, status: true, estadoCanonico: true, agentId: true, dueDate: true },
  });

  const itens: ItemDeFila[] = tarefas.map((t) => {
    const legado = t.agentId ? departamentoDoAgente(t.agentId) : null;
    const canonico = legado ? (deSlugLegado(legado) ?? "project-management") : "project-management";
    return {
      id: t.id,
      titulo: t.title,
      departamentoId: canonico,
      estadoCanonico: t.estadoCanonico,
      // dueDate legado é texto; texto que não vira data válida conta como sem prazo.
      prazo: t.dueDate && !Number.isNaN(Date.parse(t.dueDate)) ? new Date(t.dueDate) : null,
      bloqueado: false,
    };
  });

  return NextResponse.json({ fila: filtrarFila(perfil, itens) });
}
