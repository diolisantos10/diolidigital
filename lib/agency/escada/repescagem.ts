// A REPESCAGEM — o que a escada reteve ONTEM não sai sozinho quando ela abre.
//
// ─── O DEFEITO, E ELE QUASE PASSOU ───────────────────────────────────────────
//
// `escadaFiltraEntregas` roda em UM instante só: o ato de apresentar
// (`marcos.apresentar`, `mes.apresentarCiclo`). E os dois recusam repetição —
// `if (projeto.presentedAt) return { ok: true, erro: "já apresentado" }`. Isso
// está certo: apresentar duas vezes avisa o cliente duas vezes.
//
// A consequência não estava: **a entrega retida por um degrau fechado fica
// `interno` PARA SEMPRE.** Abrir a escada depois não a alcança — não existe
// caminho no repositório que volte a olhá-la. Foi exatamente o estado das peças
// do CityJobs: produzidas, com molde, no banco, e invisíveis.
//
// Soltar a escada sem esta função seria decoração: o degrau mudaria de valor e
// nada chegaria ao cliente. *Sem gate = reprovado* vale nos dois sentidos — um
// portão que abre e não deixa passar o legítimo é tão inútil quanto um que não
// fecha.
//
// ─── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não reapresenta.** Não mexe em `presentedAt`, não manda aviso, não fala
//     com o cliente. Ela reavalia VISIBILIDADE, e só.
//   • **Não passa por cima da Qualidade.** Entrega com `quality_flag` fica
//     retida — é a mesma recusa que `apresentar` faz, e um caminho lateral que
//     a ignorasse seria a porta dos fundos do portão de qualidade.
//   • **Não antecipa ciclo.** Só olha o que já FOI apresentado: entrega do
//     pacote inicial num projeto com `presentedAt`, ou entrega de um ciclo com
//     `presentedAt`. O que ainda não teve seu ato de apresentação continua
//     esperando por ele.
//   • **Não reimplementa a régra.** Quem decide é `escadaFiltraEntregas`, a
//     MESMA função dos dois atos de apresentar. Duas cópias da regra divergem —
//     é o defeito que já cegou o corpo do card no portal.
//   • **Não publica nada em plataforma nenhuma.** Visibilidade no portal é o
//     card de aprovação do cliente; publicar continua sendo clique dele.

import { prisma } from "@/lib/db/client";
import { escadaFiltraEntregas } from "./registro";
import { departamentoDoAgente } from "./degraus";

export interface ResultadoDaRepescagem {
  /** Entregas que estavam retidas e passaram a ser visíveis ao cliente. */
  liberadas: number;
  /** Continuam retidas — com o motivo concreto de cada uma. */
  aindaRetidas: Array<{ id: string; motivo: string }>;
  /** Projetos tocados. */
  projetos: number;
  avisos: string[];
}

/** Teto por passada: repescagem é conserto, não migração em massa. */
const MAX_POR_RODADA = 200;

/**
 * Reavalia as entregas `interno` que JÁ passaram pelo ato de apresentar.
 *
 * Idempotente por construção: uma entrega liberada vira `compartilhado` e some
 * do universo desta consulta. Numa casa em dia, ela lê zero linha e escreve
 * nada.
 *
 * NUNCA lança — roda dentro do relógio da agência.
 */
export async function repescarEntregasRetidas(): Promise<ResultadoDaRepescagem> {
  const r: ResultadoDaRepescagem = { liberadas: 0, aindaRetidas: [], projetos: 0, avisos: [] };

  type Candidata = {
    id: string; ownerAgentId: string | null; revisionStatus: string | null; cycleId: string | null;
    project: { id: string; workspaceId: string; clientId: string; clientRequestId: string | null; presentedAt: Date | null };
  };
  let candidatas: Candidata[];
  try {
    // ⚠️ `Deliverable` NÃO tem relação com `Cycle` — só o `cycleId` solto. Por
    // isso a apresentação do ciclo é resolvida numa SEGUNDA consulta, e não num
    // `where` aninhado que não existe no schema.
    const retidas: Candidata[] = await prisma.deliverable.findMany({
      where: {
        visibility: "interno",
        // A entrega com ressalva da Qualidade NÃO é candidata. Está na consulta,
        // e não num filtro depois, para que nenhuma refatoração futura a
        // "esqueça" no caminho.
        NOT: { revisionStatus: "quality_flag" },
      },
      take: MAX_POR_RODADA,
      select: {
        id: true, ownerAgentId: true, revisionStatus: true, cycleId: true,
        project: { select: { id: true, workspaceId: true, clientId: true, clientRequestId: true, presentedAt: true } },
      },
    });

    const idsDeCiclo = [...new Set(retidas.map((d) => d.cycleId).filter((x): x is string => !!x))];
    const ciclosApresentados = new Set<string>();
    if (idsDeCiclo.length > 0) {
      const ciclos = await prisma.cycle.findMany({
        where: { id: { in: idsDeCiclo }, presentedAt: { not: null } },
        select: { id: true },
      });
      for (const c of ciclos) ciclosApresentados.add(c.id);
    }

    // O ato de apresentação TEM que ter acontecido. Sem esta linha, a repescagem
    // adiantaria entrega de um ciclo que ainda nem foi mostrado — mostrar peça
    // fora do pacote é o defeito que a apresentação existe para não cometer.
    candidatas = retidas.filter((d) =>
      d.cycleId ? ciclosApresentados.has(d.cycleId) : d.project.presentedAt !== null,
    );
  } catch (e) {
    r.avisos.push(`não consegui ler as entregas retidas: ${e instanceof Error ? e.message : "erro"}`);
    return r;
  }
  if (candidatas.length === 0) return r;

  // Agrupa por projeto: a escada decide por (workspace, cliente), e uma consulta
  // por entrega seria uma rajada de leituras do banco para a mesma resposta.
  const porProjeto = new Map<string, Candidata[]>();
  for (const d of candidatas) {
    if (!porProjeto.has(d.project.id)) porProjeto.set(d.project.id, []);
    porProjeto.get(d.project.id)!.push(d);
  }

  for (const [projectId, entregas] of porProjeto) {
    const projeto = entregas[0].project;
    try {
      const escada = await escadaFiltraEntregas({
        workspaceId: projeto.workspaceId,
        clientId: projeto.clientId,
        entregas: entregas.map((d) => ({ id: d.id, ownerAgentId: d.ownerAgentId })),
      });
      for (const x of escada.retidos) r.aindaRetidas.push({ id: x.id, motivo: x.motivo });
      if (escada.liberados.length === 0) continue;

      await prisma.deliverable.updateMany({
        where: { id: { in: escada.liberados } },
        data: { visibility: "compartilhado" },
      });
      r.liberadas += escada.liberados.length;
      r.projetos++;

      // O CARD DE DECISÃO vai junto — e pela MESMA regra de `apresentar`.
      // Liberar o corpo e deixar o pedido de aprovação escondido é a metade
      // inútil: o cliente veria a peça e não teria como aprová-la. (O inverso,
      // que é o perigoso, já tem trava lá: card sem corpo não sai.)
      if (projeto.clientRequestId) {
        const depts = [...new Set(
          escada.liberados
            .map((id) => departamentoDoAgente(entregas.find((d) => d.id === id)?.ownerAgentId))
            .filter((d): d is string => !!d),
        )];
        if (depts.length > 0) {
          await prisma.approvalRequest.updateMany({
            where: { clientRequestId: projeto.clientRequestId, status: "pending", department: { in: depts } },
            data: { clientVisible: true },
          }).catch(() => { /* best-effort: a repescagem não pode falhar por isto */ });
        }
      }

      // O rastro fica no projeto: quem abrir o histórico entende por que uma
      // entrega apareceu no portal dias depois de apresentada.
      await prisma.activityEvent.create({
        data: {
          workspaceId: projeto.workspaceId,
          projectId,
          clientId: projeto.clientId,
          type: "escada_repescou_entrega",
          message: `${escada.liberados.length} entrega(s) que a escada tinha retido passaram a ser visíveis ao cliente — o degrau do departamento abriu depois da apresentação. Nenhuma reapresentação, nenhum aviso novo, nada publicado.`.slice(0, 900),
        },
      }).catch(() => { /* best-effort */ });
    } catch (e) {
      r.avisos.push(`projeto ${projectId}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  return r;
}
