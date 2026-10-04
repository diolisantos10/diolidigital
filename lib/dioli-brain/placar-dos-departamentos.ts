// placar-dos-departamentos.ts — O PLACAR DO DIOLI BRAIN, LIDO DO BANCO.
//
// Bloco F (CEO, 04/10/2026): "Sala dos Agentes e Dioli Brain: dado real ou
// estado vazio honesto." Raio-x: os seis painéis de departamento do Brain
// liam CÓPIAS DO NAVEGADOR (stores do Zustand) e marcavam "Engine, Quality
// Gate, Governança: ativo" como constante no código — verde que nenhum dado
// sustentava, numa casa que roda 100% IA sem revisão humana.
//
// Aqui só entra o que é medido:
//   • execuções reais (AIRunLog) dos últimos 30 dias, por departamento;
//   • o portão de qualidade do departamento: quantas checagens têm
//     MECANISMO (rodam) e quantas são só TEXTO (lacuna) — o mesmo critério de
//     `retratoDosPortoes()`.

import { prisma } from "@/lib/db/client";
import { ALL_QUALITY_GATES } from "@/lib/dioli-brain/quality-gates";

export const JANELA_DIAS = 30;

export const DEPARTAMENTOS_DO_PLACAR = [
  { id: "strategy", nome: "Estratégia" },
  { id: "social-media", nome: "Social" },
  { id: "design", nome: "Design" },
  { id: "paid-traffic", nome: "Tráfego pago" },
  { id: "analytics", nome: "Analytics" },
  { id: "quality", nome: "Qualidade" },
] as const;

export interface PlacarDoDepartamento {
  id: string;
  nome: string;
  execucoes: { total: number; ok: number; reserva: number; erro: number; ultimaEm: string | null; custoUsd: number };
  portao: { total: number; comMecanismo: number; soTexto: number; bloqueantesSoTexto: number };
}

const ERRO = new Set(["error", "failed", "erro"]);

export async function placarDosDepartamentos(workspaceId: string, agora = new Date()): Promise<PlacarDoDepartamento[]> {
  const desde = new Date(agora.getTime() - JANELA_DIAS * 86_400_000);
  const linhas = await prisma.aIRunLog.findMany({
    where: { workspaceId, createdAt: { gte: desde }, departmentId: { in: DEPARTAMENTOS_DO_PLACAR.map((d) => d.id) } },
    select: { departmentId: true, status: true, fallbackUsed: true, createdAt: true, custoEstimadoUsd: true },
    orderBy: { createdAt: "desc" },
    take: 20_000,
  }).catch(() => []);

  return DEPARTAMENTOS_DO_PLACAR.map((d) => {
    const minhas = linhas.filter((l) => l.departmentId === d.id);
    const erro = minhas.filter((l) => ERRO.has(l.status)).length;
    const reserva = minhas.filter((l) => !ERRO.has(l.status) && l.fallbackUsed).length;
    const checagens = ALL_QUALITY_GATES[d.id] ?? [];
    return {
      id: d.id,
      nome: d.nome,
      execucoes: {
        total: minhas.length,
        ok: minhas.length - erro - reserva,
        reserva,
        erro,
        ultimaEm: minhas[0] ? minhas[0].createdAt.toISOString() : null,
        custoUsd: Math.round(minhas.reduce((s, l) => s + (l.custoEstimadoUsd ?? 0), 0) * 100) / 100,
      },
      portao: {
        total: checagens.length,
        comMecanismo: checagens.filter((c) => c.autoCheckable).length,
        soTexto: checagens.filter((c) => !c.autoCheckable).length,
        bloqueantesSoTexto: checagens.filter((c) => c.blocking && !c.autoCheckable).length,
      },
    };
  });
}
