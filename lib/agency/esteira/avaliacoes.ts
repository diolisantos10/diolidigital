// avaliacoes.ts — A AGÊNCIA RESPONDE AS AVALIAÇÕES DO GOOGLE.
//
// É o serviço de maior retorno para negócio local e o que quase nenhuma agência
// pequena entrega bem, porque exige constância: responder em 24h vale muito
// mais do que responder bonito em duas semanas. Uma máquina faz isso melhor que
// gente — desde que saiba a hora de NÃO fazer.
//
// ── A REGRA QUE SUSTENTA O ARQUIVO INTEIRO ─────────────────────────────────
//
// Elogio a agência responde sozinha. RECLAMAÇÃO, NUNCA.
//
// Não é excesso de zelo. Responder avaliação é público, permanente e notifica
// quem reclamou na hora. Uma resposta automática a um cliente irritado — ainda
// que educada — é lida como deboche justamente por quem já está com raiva, e
// vira print. O ganho de responder rápido não paga o risco de responder errado
// em público; e quem tem contexto para dizer "aconteceu isso, resolvemos assim"
// é o dono do negócio, não um modelo de linguagem.
//
// Então: 4 e 5 estrelas → resposta automática. 1 a 3 → rascunho pronto,
// escalado para gente decidir. O rascunho é o trabalho; a decisão é do humano.

import { prisma } from "@/lib/db/client";
import { generate } from "@/lib/ai/generate";
import { listarAvaliacoes, responderAvaliacao } from "@/lib/integrations/google/client";
import { conferirPisoDeVerdade, resumirViolacoes, type VerdadeDoCliente } from "@/lib/agency/execution/piso-de-verdade";

/** A partir de quantas estrelas a agência responde sozinha. */
export const ESTRELAS_PARA_RESPOSTA_AUTOMATICA = 4;
/** Quantas avaliações processamos por rodada. Responder 200 de uma vez, num
 *  cliente que acabou de conectar, encheria o perfil dele de resposta em
 *  segundos — e isso parece robô para qualquer um que olhe. */
const MAX_POR_RODADA = 5;

export interface RodadaDeAvaliacoes {
  novas: number;
  respondidas: number;
  escaladas: number;
  falhas: string[];
}

/**
 * Lê as avaliações novas, responde as boas e escala as ruins.
 *
 * Roda no relógio. Idempotente pelo id da avaliação no Google — uma avaliação
 * já registrada nunca é processada de novo, mesmo depois de um restore.
 */
export async function cuidarDasAvaliacoes(): Promise<RodadaDeAvaliacoes> {
  const saida: RodadaDeAvaliacoes = { novas: 0, respondidas: 0, escaladas: 0, falhas: [] };

  const conexoes = await prisma.googleConnection.findMany({
    where: { status: "connected" },
  }).catch(() => []);

  for (const conexao of conexoes) {
    const r = await listarAvaliacoes(conexao.id);
    if (!r.ok || !r.dados) {
      if (r.erro) saida.falhas.push(`${conexao.title || conexao.locationName}: ${r.erro}`);
      continue;
    }

    const negocio = conexao.clientId
      ? (await prisma.client.findUnique({
          where: { id: conexao.clientId },
          select: { name: true, phone: true, email: true, brandBrain: true },
        }).catch(() => null))
      : null;

    for (const a of r.dados.slice(0, MAX_POR_RODADA)) {
      // O Google já diz quando a avaliação tem resposta. Registrar como
      // respondida evita que a agência escreva por cima do que o próprio dono
      // do negócio já respondeu à mão.
      const jaExiste = await prisma.googleReview.findUnique({
        where: { connectionId_externalId: { connectionId: conexao.id, externalId: a.externalId } },
        select: { id: true },
      }).catch(() => null);
      if (jaExiste) continue;

      saida.novas++;
      const registro = await prisma.googleReview.create({
        data: {
          workspaceId: conexao.workspaceId, clientId: conexao.clientId, connectionId: conexao.id,
          externalId: a.externalId, reviewerName: a.autor, starRating: a.estrelas,
          comment: a.comentario, createdAtGoogle: a.quando,
          status: a.jaRespondida ? "ignorada" : "pendente",
          ...(a.jaRespondida ? { escalatedReason: "já respondida fora da Dioli" } : {}),
        },
      }).catch(() => null);
      if (!registro || a.jaRespondida) continue;

      const texto = await escreverResposta({
        workspaceId: conexao.workspaceId,
        negocio: negocio?.name ?? conexao.title,
        tom: (negocio?.brandBrain?.tone ?? "") as string,
        autor: a.autor,
        estrelas: a.estrelas,
        comentario: a.comentario,
        verdade: {
          businessName: negocio?.name ?? conexao.title,
          telefones: [negocio?.phone].filter((v): v is string => !!v),
          emails: [negocio?.email].filter((v): v is string => !!v),
          servicos: [], valores: [],
        },
      });

      if (!texto) {
        saida.falhas.push(`não consegui escrever a resposta para a avaliação de ${a.autor || "um cliente"}`);
        continue;
      }

      // ── O PORTÃO ────────────────────────────────────────────────────────────
      if (a.estrelas < ESTRELAS_PARA_RESPOSTA_AUTOMATICA) {
        await escalar(registro.id, texto, a, conexao);
        saida.escaladas++;
        continue;
      }

      const envio = await responderAvaliacao(conexao.id, a.externalId, texto);
      if (!envio.ok) {
        // Guardamos o rascunho mesmo assim: o trabalho não se perde, e alguém
        // pode publicar à mão.
        await prisma.googleReview.update({
          where: { id: registro.id },
          data: { reply: texto, status: "escalada", escalatedReason: envio.erro ?? "falha ao publicar" },
        }).catch(() => { /* best-effort */ });
        saida.falhas.push(envio.erro ?? "falha ao publicar a resposta");
        continue;
      }

      await prisma.googleReview.update({
        where: { id: registro.id },
        data: { reply: texto, status: "respondida", repliedAt: new Date() },
      }).catch(() => { /* best-effort */ });
      saida.respondidas++;
    }

    await prisma.googleConnection.update({
      where: { id: conexao.id }, data: { reviewsSyncedAt: new Date() },
    }).catch(() => { /* best-effort */ });
  }

  return saida;
}

/**
 * Escreve a resposta. Passa pelo piso de verdade como qualquer outra peça — e
 * aqui com um agravante: isto vai para um perfil público, embaixo do nome do
 * cliente, e não sai mais de lá.
 */
export async function escreverResposta(input: {
  workspaceId: string;
  negocio: string;
  tom: string;
  autor: string;
  estrelas: number;
  comentario: string;
  verdade: VerdadeDoCliente;
}): Promise<string | null> {
  const positiva = input.estrelas >= ESTRELAS_PARA_RESPOSTA_AUTOMATICA;

  const r = await generate({
    system:
      "Você responde avaliações do Google em nome de um negócio brasileiro, como se fosse o dono. " +
      "A resposta é PÚBLICA e PERMANENTE: qualquer pessoa que procurar o negócio vai ler. " +
      "Escreva curto (2 a 3 frases), em primeira pessoa do plural, sem jargão de marketing e sem parecer robô. " +
      "É PROIBIDO: prometer desconto, cupom, brinde, reembolso ou qualquer compensação; " +
      "inventar telefone, e-mail, horário ou endereço; citar nome de funcionário; " +
      "discutir, justificar-se longamente ou contradizer o cliente. " +
      "Responda SOMENTE com JSON válido: {\"resposta\": \"...\"}",
    user: [
      `NEGÓCIO: ${input.negocio}`,
      input.tom ? `TOM DA MARCA: ${input.tom}` : "",
      `AVALIAÇÃO DE ${input.autor || "um cliente"} — ${input.estrelas} estrela(s):`,
      input.comentario || "(sem comentário escrito, só a nota)",
      "",
      positiva
        ? "É uma avaliação BOA. Agradeça de forma específica ao que a pessoa elogiou — resposta genérica em elogio específico é pior que nenhuma. Convide de volta, sem forçar."
        : "É uma avaliação RUIM. Reconheça o que a pessoa sentiu, sem discutir e sem se justificar. Chame para conversar em particular. NÃO prometa nada concreto: quem pode prometer é o dono, e ele ainda não viu isso.",
      input.comentario.trim().length === 0
        ? "Não há comentário escrito. NÃO invente o motivo da nota — responda de forma que sirva sem saber o motivo."
        : "",
    ].filter(Boolean).join("\n"),
    maxTokens: 400,
    workspaceId: input.workspaceId,
  });
  if (!r.ok) return null;

  const texto = String((r.data as Record<string, unknown>)?.resposta ?? "").trim();
  if (texto.length < 15) return null;

  const piso = conferirPisoDeVerdade(texto, input.verdade);
  if (!piso.aprovado) {
    console.warn(`[avaliacoes] resposta reprovada no piso: ${resumirViolacoes(piso.violacoes)}`);
    return null;
  }
  return texto;
}

// ─── Internos ───────────────────────────────────────────────────────────────

async function escalar(
  reviewId: string,
  rascunho: string,
  a: { autor: string; estrelas: number; comentario: string },
  conexao: { workspaceId: string; clientId: string | null; title: string; locationName: string },
): Promise<void> {
  await prisma.googleReview.update({
    where: { id: reviewId },
    data: {
      reply: rascunho,
      status: "escalada",
      escalatedReason: `${a.estrelas} estrela(s) — resposta a reclamação nunca sai sozinha`,
    },
  }).catch(() => { /* best-effort */ });

  await prisma.activityEvent.create({
    data: {
      workspaceId: conexao.workspaceId,
      clientId: conexao.clientId,
      type: "avaliacao_negativa",
      message: `${conexao.title || conexao.locationName} recebeu ${a.estrelas} estrela(s) de ${a.autor || "um cliente"}: "${a.comentario.slice(0, 200)}". Rascunho de resposta pronto — precisa de aprovação.`.slice(0, 900),
    },
  }).catch(() => { /* best-effort */ });
}

/** As avaliações esperando decisão de gente. É o que o painel do Diretor
 *  precisa mostrar — escalada invisível é o mesmo que escalada nenhuma. */
export async function avaliacoesEsperando(workspaceId?: string) {
  return prisma.googleReview.findMany({
    where: { status: "escalada", ...(workspaceId ? { workspaceId } : {}) },
    orderBy: { createdAtGoogle: "desc" },
    take: 50,
  }).catch(() => []);
}
