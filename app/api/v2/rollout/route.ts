// POST /api/v2/rollout — o piloto a um clique da DIREÇÃO, com veredito honesto.
//
// Marco 7. Restrito à direção (mesmo portão de chave de IA e backup): liga as
// flags do escopo COM PROCEDÊNCIA, roda o backfill idempotente das entidades,
// reconcilia leitura dupla e devolve o veredito — promovível ou não, com os
// números. Rodar duas vezes é seguro por construção (backfill idempotente,
// flags upsert). NADA aqui publica, gasta ou fala com cliente: só a coluna
// aditiva estadoCanonico e os relatórios.

import { NextRequest, NextResponse } from "next/server";
import { exigirAdministracao } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { FLAGS_V2 } from "@/lib/agency/flags-v2/flags";
import { executarRollout, type FontesDoRollout } from "@/lib/agency/estados-v2/rollout";
import type { ArmazemDeBackfill } from "@/lib/agency/estados-v2/backfill";
import {
  derivarDeOportunidade, derivarDeClientRequest, derivarDeBriefing, derivarDeSocialPost,
  derivarDeTask, derivarDeApprovalRequest, derivarDeCycle, derivarDeDeliverable,
} from "@/lib/agency/estados-v2/derivar";

// Cada entidade com o SELECT mínimo do derivador. Tipagem larga de propósito:
// o modelo prisma de cada uma difere; o contrato comum é {id, estadoCanonico, status}.
type Cliente = typeof prisma;
type LinhaBasica = { id: string; estadoCanonico: string | null; status: string };

const FONTES: Record<string, {
  listar: (db: Cliente, take: number, cursor?: string) => Promise<LinhaBasica[]>;
  gravar: (db: Cliente, id: string, estado: string) => Promise<unknown>;
  derivar: (l: LinhaBasica) => string | null;
}> = {
  Oportunidade: {
    listar: (db, take, cursor) => db.oportunidade.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.oportunidade.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeOportunidade(l),
  },
  ClientRequestDb: {
    listar: (db, take, cursor) => db.clientRequestDb.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.clientRequestDb.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeClientRequest(l),
  },
  Briefing: {
    listar: (db, take, cursor) => db.briefing.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.briefing.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeBriefing(l),
  },
  SocialPost: {
    listar: (db, take, cursor) => db.socialPost.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.socialPost.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeSocialPost(l),
  },
  Task: {
    listar: (db, take, cursor) => db.task.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.task.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeTask(l),
  },
  ApprovalRequest: {
    listar: (db, take, cursor) => db.approvalRequest.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.approvalRequest.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeApprovalRequest(l),
  },
  Cycle: {
    listar: (db, take, cursor) => db.cycle.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.cycle.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeCycle(l),
  },
  Deliverable: {
    listar: (db, take, cursor) => db.deliverable.findMany({ take, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, estadoCanonico: true, status: true } }),
    gravar: (db, id, estado) => db.deliverable.update({ where: { id }, data: { estadoCanonico: estado } }),
    derivar: (l) => derivarDeDeliverable(l),
  },
};

function fontesDePrisma(): FontesDoRollout {
  return {
    armazemDe(tipo): ArmazemDeBackfill {
      const fonte = FONTES[tipo]!;
      return {
        async listar(_tipo, lote, cursor) {
          const linhas = await fonte.listar(prisma, lote, cursor);
          return linhas.map((l) => ({ id: l.id, estadoCanonico: l.estadoCanonico, legado: { status: l.status } }));
        },
        async gravarEstado(_tipo, id, estado) {
          await fonte.gravar(prisma, id, estado);
        },
      };
    },
    async compararDe(tipo) {
      const fonte = FONTES[tipo]!;
      const linhas = await fonte.listar(prisma, 2000);
      return linhas.map((l) => ({ id: l.id, gravado: l.estadoCanonico, derivado: fonte.derivar(l) }));
    },
    async gravarRelatorio(r) {
      await prisma.reconciliacaoV2.create({
        data: {
          entidadeTipo: r.entidadeTipo,
          total: r.total,
          divergentes: r.divergentes,
          amostra: JSON.stringify(r.amostra),
          veredito: r.veredito,
        },
      });
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guarda = await exigirAdministracao("/agency/pm-command");
  if (guarda.erro) return guarda.erro;

  let body: { escopo?: string; motivo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const escopo = body.escopo?.trim() || "global";
  const motivo = body.motivo?.trim();
  if (!motivo) {
    // Flag sem procedência é o mesmo defeito da escada sem fala literal.
    return NextResponse.json({ error: "motivo é obrigatório — rollout sem procedência não liga." }, { status: 400 });
  }

  const decididoPor = guarda.acesso.session.userId;
  for (const chave of [FLAGS_V2.leituraDupla, FLAGS_V2.escrita]) {
    await prisma.flagV2.upsert({
      where: { chave_escopo: { chave, escopo } },
      update: { ligada: true, motivo, decididoPor, em: new Date() },
      create: { chave, escopo, ligada: true, motivo, decididoPor },
    });
  }

  const resultado = await executarRollout(fontesDePrisma());
  return NextResponse.json({ escopo, ...resultado });
}
