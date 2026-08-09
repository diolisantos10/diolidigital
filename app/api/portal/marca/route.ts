// O FORMULÁRIO DE MARCA — a porta do CLIENTE.
//
// GET  → as perguntas que faltam, no máximo cinco por rodada.
// POST → grava o que ele respondeu.
//
// ── Por que é uma rota do PORTAL, e não do painel ──────────────────────────
//
// A identidade da marca é do dono. A rota do painel (`/api/agency/clients/[id]/
// marca`) existe para quem atende registrar o que o cliente **disse**; esta é
// para o cliente **dizer**. As duas gravam no mesmo lugar, e a diferença
// importa: resposta que veio daqui veio dele.
//
// ── AS REGRAS DA TELA, e por que são regras e não estilo ───────────────────
//
//   • **Uma pergunta por vez, fechada quando dá.** Escolher é mais fácil que
//     escrever, e responde mais gente.
//   • **"Não sei" é resposta válida.** Forçar a adivinhar faz o cliente
//     abandonar no meio ou responder qualquer coisa — e resposta qualquer é
//     PIOR que campo vazio, porque vira regra falsa que a peça vai obedecer
//     para sempre.
//   • **Salva a cada resposta.** Ele responde três no ponto de ônibus e volta
//     depois.
//   • **Cinco por rodada.** Questionário longo é questionário abandonado.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerFichaDeMarca, proximasPerguntas, type CampoDaMarca } from "@/lib/agency/esteira/ficha-de-marca";

export const dynamic = "force-dynamic";

/** Onde cada resposta é gravada. Espelha o mapa da rota do painel de propósito:
 *  duas portas, um destino. Proibições ficam de fora — têm dono próprio. */
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

const EH_JSON = new Set(["voicePairsJson", "lexiconJson", "referencesJson", "formalTokensJson", "ownerAndHierarchyJson"]);

/** O que "não sei" grava: NADA. O campo continua em lacuna, e é isso mesmo.
 *  Gravar "não sei" como valor transformaria uma pergunta aberta numa resposta
 *  — e a próxima peça obedeceria a ela. */
const NAO_SEI = "__nao_sei__";

async function clienteDoToken(request: NextRequest): Promise<string | null> {
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token"));
  if (!token) return null;
  const acesso = await validatePortalAccess(token).catch(() => null);
  if (!acesso?.valid || !acesso.record) return null;
  return acesso.record.clientId ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const ficha = await lerFichaDeMarca(clientId);
  const perguntas = proximasPerguntas(ficha).filter((c) => COLUNA[c.campo]);

  return NextResponse.json({
    // Conclusão primeiro, para a tela não ter de calcular: onde ele está.
    progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    // Vazio = acabou. A tela mostra "terminou", não uma lista vazia.
    perguntas: perguntas.map((c) => ({ campo: c.campo, pergunta: c.pergunta, rotulo: c.rotulo })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const corpo = (await request.json().catch(() => ({}))) as { campo?: string; resposta?: string };
  const campo = corpo.campo as CampoDaMarca | undefined;
  const resposta = (corpo.resposta ?? "").trim();

  const coluna = campo ? COLUNA[campo] : undefined;
  if (!coluna) return NextResponse.json({ error: "campo desconhecido" }, { status: 400 });

  // "Não sei" é resposta válida e NÃO grava nada. O campo segue em lacuna, que
  // é a verdade — e a próxima rodada não pergunta de novo na frente das outras.
  if (!resposta || resposta === NAO_SEI) {
    const ficha = await lerFichaDeMarca(clientId);
    return NextResponse.json({
      gravado: false,
      motivo: "sem resposta — o campo continua em aberto, e tudo bem",
      progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    });
  }

  const valor = EH_JSON.has(coluna) ? envelopar(coluna, resposta) : resposta.slice(0, 4000);
  await prisma.brandBrain.upsert({
    where: { clientId },
    update: { [coluna]: valor },
    create: { clientId, [coluna]: valor },
  });

  const ficha = await lerFichaDeMarca(clientId);
  return NextResponse.json({
    gravado: true,
    progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    proximas: proximasPerguntas(ficha).filter((c) => COLUNA[c.campo]).map((c) => ({
      campo: c.campo, pergunta: c.pergunta, rotulo: c.rotulo,
    })),
  });
}

/** O cliente escreve texto; alguns campos guardam estrutura. Embrulhar preserva
 *  a resposta dele — recusar a perderia, e gravar cru quebraria a leitura. */
function envelopar(coluna: string, texto: string): string {
  const t = texto.slice(0, 4000);
  if (coluna === "voicePairsJson") return JSON.stringify([{ dizemos: t, naoDizemos: "" }]);
  if (coluna === "lexiconJson") return JSON.stringify({ nome: t });
  if (coluna === "referencesJson") return JSON.stringify({ aprovadas: [t], reprovadas: [] });
  if (coluna === "formalTokensJson") return JSON.stringify({ descricao: t });
  if (coluna === "ownerAndHierarchyJson") return JSON.stringify({ dono: t });
  return JSON.stringify({ valor: t });
}
