// A FICHA DE MARCA de um cliente — leitura e escrita.
//
// GET  → os nove campos com o estado de cada um, as lacunas e as perguntas
//        prontas para mandar ao dono.
// PUT  → grava o que o dono respondeu.
//
// ── QUEM PODE ESCREVER AQUI ────────────────────────────────────────────────
//
// A identidade da marca é do DONO — nunca do agente e nunca da agência. Esta
// rota é a porta de dentro (o painel), usada por quem atende; a porta do
// cliente é o formulário do portal. As duas gravam no mesmo lugar e por isso a
// origem de cada resposta fica registrada: sem isso, daqui a três meses
// ninguém sabe se "não prometemos contratação" saiu da boca do cliente ou do
// palpite de quem preencheu a ficha por ele.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { lerFichaDeMarca, proximasPerguntas, CAMPOS_DA_MARCA, type CampoDaMarca } from "@/lib/agency/esteira/ficha-de-marca";

export const dynamic = "force-dynamic";

/** Onde cada campo da ficha mora no banco. As proibições NÃO estão aqui: elas
 *  têm dono próprio (`esteira/proibicoes.ts`) e escrever por dois caminhos é
 *  como nasce a divergência. */
const COLUNA: Partial<Record<CampoDaMarca, string>> = {
  proposito_e_promessa: "purposeAndPromise",
  publico_e_relacao: "audienceRelation",
  voz: "voicePairsJson",
  lexico: "lexiconJson",
  referencias: "referencesJson",
  atributos_formais: "formalTokensJson",
  limites_de_promessa: "promiseLimits",
  hierarquia_e_dono: "ownerAndHierarchyJson",
};

/** Campos guardados como JSON. Texto puro que chega para eles é embrulhado, em
 *  vez de gravado cru — senão a leitura seguinte quebra e o campo inteiro
 *  desaparece da ficha sem ninguém perceber. */
const EH_JSON = new Set(["voicePairsJson", "lexiconJson", "referencesJson", "formalTokensJson", "ownerAndHierarchyJson"]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({
    ...ficha,
    // A conclusão primeiro, para a tela não ter de contar: quantos faltam e o
    // que a falta impede.
    resumo: {
      definidos: ficha.definidos,
      total: CAMPOS_DA_MARCA.length,
      faltam: ficha.lacunas.length,
      oQueAFaltaImpede: ficha.naoConstituida
        ? "sem isto a peça sai sem régua de marca, e o portão de entrega barra a publicação"
        : null,
    },
    proximasPerguntas: proximasPerguntas(ficha),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const corpo = (await req.json().catch(() => ({}))) as { campos?: Record<string, unknown> };
  const entrada = corpo.campos ?? {};

  const dados: Record<string, string> = {};
  const ignorados: string[] = [];

  for (const [campo, valor] of Object.entries(entrada)) {
    const coluna = COLUNA[campo as CampoDaMarca];
    if (!coluna) {
      // Campo desconhecido não é gravado em silêncio: quem chamou precisa saber
      // que a resposta do cliente foi para o lixo.
      ignorados.push(campo);
      continue;
    }
    if (valor === null || valor === undefined || valor === "") continue;
    dados[coluna] = EH_JSON.has(coluna)
      ? typeof valor === "string" ? envelopar(coluna, valor) : JSON.stringify(valor)
      : String(valor).slice(0, 4000);
  }

  if (Object.keys(dados).length === 0) {
    return NextResponse.json({ error: "nada para gravar", ignorados }, { status: 400 });
  }

  await prisma.brandBrain.upsert({
    where: { clientId: id },
    update: dados,
    create: { clientId: id, ...dados },
  });

  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({ gravados: Object.keys(dados), ignorados, ficha });
}

/** Texto puro que chega para um campo JSON. Em vez de recusar (e perder a
 *  resposta do cliente) ou gravar cru (e quebrar a leitura), embrulha no
 *  formato que aquele campo espera. */
function envelopar(coluna: string, texto: string): string {
  const t = texto.trim().slice(0, 4000);
  if (coluna === "voicePairsJson") return JSON.stringify([{ dizemos: t, naoDizemos: "" }]);
  if (coluna === "lexiconJson") return JSON.stringify({ nome: t });
  if (coluna === "referencesJson") return JSON.stringify({ aprovadas: [t], reprovadas: [] });
  if (coluna === "formalTokensJson") return JSON.stringify({ descricao: t });
  if (coluna === "ownerAndHierarchyJson") return JSON.stringify({ dono: t });
  return JSON.stringify({ valor: t });
}
