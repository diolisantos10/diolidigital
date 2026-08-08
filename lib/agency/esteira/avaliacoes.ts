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
import { buildVerdadeOperacional } from "@/lib/dioli-brain/client-snapshot";
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

    // ── A VERDADE OPERACIONAL, LIDA DO BANCO ──────────────────────────────────
    //
    // Este era o 4º ponto do código que montava `VerdadeDoCliente` à mão e
    // esquecia `operacao`. Sem ela o piso é fail-closed sobre o vazio: toda
    // classe operacional conta como "não informada" e a resposta é barrada por
    // repetir o que o próprio cliente já contou. Medido: "estamos abertos de
    // segunda a sábado das 9h às 19h" caía em `horario_nao_informado`, e "chama
    // no WhatsApp que a gente agenda" em `canal_nao_informado`. Fail-closed é o
    // default certo; deixar de ligar a fiação transforma isso em falso
    // positivo, e falso positivo aqui vira avaliação de 5 estrelas sem resposta.
    //
    // A conexão do Google guarda `clientId`, não `clientRequestId` — a verdade
    // mora na solicitação. Pegamos a mais recente do cliente.
    const solicitacao = conexao.clientId
      ? await prisma.clientRequestDb.findFirst({
          where: { clientId: conexao.clientId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }).catch(() => null)
      : null;
    const operacao = solicitacao
      ? (await buildVerdadeOperacional(solicitacao.id).catch(() => null)) ?? undefined
      : undefined;

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

      const redacao = await redigirResposta({
        workspaceId: conexao.workspaceId,
        clientId: conexao.clientId,
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
          operacao,
        },
      });
      const texto = redacao.texto;

      // ── DESCARTE NÃO É SILÊNCIO ───────────────────────────────────────────
      //
      // Antes, quando a resposta não saía — IA fora do ar ou piso barrando —
      // o código só empilhava uma linha em `falhas`, que ninguém lê, e seguia.
      // A avaliação ficava `pendente` no banco PARA SEMPRE: a guarda de
      // idempotência (`jaExiste`) impede que ela seja processada de novo, então
      // não havia segunda chance nem gente avisada. Uma avaliação de 5 estrelas
      // do cliente do cliente morria em silêncio.
      //
      // Agora vira ESCALAÇÃO: entra em `avaliacoesEsperando`, aparece no painel
      // e alguém escreve à mão. Nenhum estado prende trabalho para sempre.
      // O rascunho barrado pelo piso NÃO é guardado — ele inventou dado, e
      // guardá-lo como `reply` é convidar alguém a publicá-lo com um clique.
      if (!texto) {
        await escalar(registro.id, null, a, conexao, redacao.motivo, "avaliacao_sem_resposta");
        saida.escaladas++;
        saida.falhas.push(`avaliação de ${a.autor || "um cliente"}: ${redacao.motivo}`);
        continue;
      }

      // ── O PORTÃO ────────────────────────────────────────────────────────────
      if (a.estrelas < ESTRELAS_PARA_RESPOSTA_AUTOMATICA) {
        await escalar(registro.id, texto, a, conexao);
        saida.escaladas++;
        continue;
      }

      // ── A TRAVA DE CONSENTIMENTO ───────────────────────────────────────────
      // A política da API do Business Profile proíbe automatizar resposta a
      // avaliação "sem o consentimento prévio e específico do usuário"
      // (docs/plataformas/google/fontes/business-profile-api-politicas.md).
      // Sem a data registrada, NADA sai sozinho — nem elogio. O rascunho vira
      // escalada, e o motivo diz exatamente o que falta. Achado da auditoria
      // de 03/08/2026: até então a única coisa entre este código e a violação
      // era o 403 do Google — proteção por acidente não é proteção.
      if (!conexao.autoReplyConsentAt) {
        await escalar(registro.id, texto, a, conexao,
          "sem consentimento registrado do cliente para resposta automática — exigência da política do Google");
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
export interface RedacaoDeResposta {
  /** O texto pronto para publicar, ou `null` quando não há resposta publicável. */
  texto: string | null;
  /** Por que não saiu. Em português, para virar motivo de escalada legível por
   *  gente — nunca um código que só o programador entende. */
  motivo: string;
}

/** A versão que DIZ POR QUE não saiu. `escreverResposta` é o atalho para quem
 *  só quer o texto; quem precisa escalar (ou seja, o fluxo real) usa esta. */
export async function redigirResposta(input: {
  workspaceId: string;
  negocio: string;
  tom: string;
  autor: string;
  estrelas: number;
  comentario: string;
  verdade: VerdadeDoCliente;
  /** DE QUEM é a conta desta chamada. Nulo é legítimo: conexão do Google sem
   *  cliente vinculado existe. Nulo declarado ≠ nulo esquecido. */
  clientId?: string | null;
}): Promise<RedacaoDeResposta> {
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
    agentId: "esteira-avaliacoes",
    clientId: input.clientId ?? null,
  });
  if (!r.ok) return { texto: null, motivo: "a IA que escreve a resposta estava indisponível" };

  const texto = String((r.data as Record<string, unknown>)?.resposta ?? "").trim();
  if (texto.length < 15) return { texto: null, motivo: "a IA devolveu uma resposta vazia ou curta demais para publicar" };

  const piso = conferirPisoDeVerdade(texto, input.verdade);
  if (!piso.aprovado) {
    const parecer = resumirViolacoes(piso.violacoes);
    console.warn(`[avaliacoes] resposta reprovada no piso: ${parecer}`);
    return { texto: null, motivo: `a resposta escrita afirmava o que o cliente não informou (${parecer}) — precisa ser escrita por gente` };
  }
  return { texto, motivo: "" };
}

/** Atalho de compatibilidade: só o texto, sem o motivo. */
export async function escreverResposta(input: Parameters<typeof redigirResposta>[0]): Promise<string | null> {
  return (await redigirResposta(input)).texto;
}

// ─── Internos ───────────────────────────────────────────────────────────────

async function escalar(
  reviewId: string,
  /** `null` quando NÃO há rascunho aproveitável — texto barrado pelo piso não
   *  fica guardado como `reply`, para ninguém publicá-lo com um clique. */
  rascunho: string | null,
  a: { autor: string; estrelas: number; comentario: string },
  conexao: { workspaceId: string; clientId: string | null; title: string; locationName: string },
  motivo?: string,
  tipo: "avaliacao_negativa" | "avaliacao_sem_resposta" = "avaliacao_negativa",
): Promise<void> {
  await prisma.googleReview.update({
    where: { id: reviewId },
    data: {
      ...(rascunho ? { reply: rascunho } : {}),
      status: "escalada",
      escalatedReason: (motivo || `${a.estrelas} estrela(s) — resposta a reclamação nunca sai sozinha`).slice(0, 500),
    },
  }).catch(() => { /* best-effort */ });

  const chamada = rascunho
    ? "Rascunho de resposta pronto — precisa de aprovação."
    : `A máquina NÃO conseguiu escrever a resposta: ${motivo || "motivo não registrado"}. Precisa de gente.`;

  await prisma.activityEvent.create({
    data: {
      workspaceId: conexao.workspaceId,
      clientId: conexao.clientId,
      type: tipo,
      message: `${conexao.title || conexao.locationName} recebeu ${a.estrelas} estrela(s) de ${a.autor || "um cliente"}: "${a.comentario.slice(0, 200)}". ${chamada}`.slice(0, 900),
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
