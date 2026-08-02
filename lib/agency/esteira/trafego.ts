// trafego.ts — DO PLANO DE MÍDIA ATÉ A CAMPANHA. Com o freio no lugar certo.
//
// O departamento de Tráfego produzia um plano de mídia: objetivo, público,
// verba, criativos. Um documento. E parava ali — nenhuma campanha era criada,
// nada era medido, e o relatório do mês falava de tráfego pago sem nenhum
// número pago dentro.
//
// AQUI A REGRA É DIFERENTE DO RESTO DA CASA, e é de propósito.
//
// Em todo o resto, "automático" significa: a agência faz e mostra depois. Em
// tráfego pago, automático significa: a agência PREPARA e o cliente liga. A
// campanha é criada pausada, com o teto que ele aprovou, e fica esperando o
// "pode ir" dele. Não é falta de ambição — é que dinheiro gasto não volta, e a
// diferença entre um post ruim e uma campanha ruim é que o post se apaga.
//
// O teto vem do BRIEFING (`adsBudget`/`monthlyBudget`), que é o que o cliente
// escreveu. Se ele não escreveu, não há teto — e sem teto não se cria nada.
// Ausência de informação não é informação.

import { prisma } from "@/lib/db/client";
import {
  criarCampanhaPausada, ativarCampanha, pausarCampanha, lerDesempenho,
  conferirOrcamento, type PlanoDeCampanha, type DesempenhoPago,
} from "@/lib/integrations/meta/ads";

/** Fração da verba mensal que vira orçamento diário. Divide por 30 e arredonda
 *  para baixo: preferir gastar de menos a estourar o mês no dia 28. */
function diarioAPartirDoMensal(mensalBRL: number): number {
  return Math.floor(mensalBRL / 30);
}

export interface CampanhaPreparada {
  ok: boolean;
  campanhaId?: string;
  erro?: string;
  /** O que depende do cliente ou do CEO, em português. */
  pendencia?: string;
}

/**
 * Prepara a campanha do projeto — criada PAUSADA — e pede o aval do cliente.
 *
 * Idempotente por projeto: um projeto que já tem campanha preparada não ganha
 * outra. Criar campanha duplicada é duplicar o gasto no dia em que alguém liga
 * as duas.
 */
export async function prepararCampanha(projectId: string): Promise<CampanhaPreparada> {
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, workspaceId: true, clientId: true, clientRequestId: true,
      client: { select: { name: true } },
    },
  });
  if (!projeto) return { ok: false, erro: "projeto não encontrado" };

  const jaExiste = await prisma.adCampaign.findFirst({
    where: { projectId, status: { in: ["paused", "active"] } },
    select: { id: true },
  }).catch(() => null);
  if (jaExiste) return { ok: true, campanhaId: jaExiste.id };

  // ── O TETO SAI DO QUE O CLIENTE ESCREVEU ────────────────────────────────
  const req = projeto.clientRequestId
    ? await prisma.clientRequestDb.findUnique({
        where: { id: projeto.clientRequestId },
        select: { businessName: true, briefingJson: true },
      })
    : null;
  const scope = (() => {
    try { return JSON.parse(req?.briefingJson ?? "{}")?.scope ?? {}; } catch { return {}; }
  })() as Record<string, unknown>;

  const verbaMensal = numero(scope.adsBudget) ?? numero(scope.monthlyBudget) ?? numero(scope.budget);
  if (!verbaMensal) {
    return {
      ok: false,
      pendencia: "o cliente não informou a verba de anúncios no briefing — sem teto aprovado, nenhuma campanha é criada",
    };
  }

  const conexao = await prisma.metaConnection.findFirst({
    where: { workspaceId: projeto.workspaceId, clientId: projeto.clientId, status: "connected" },
    select: { id: true },
  }).catch(() => null);
  if (!conexao) {
    return { ok: false, pendencia: "o cliente ainda não conectou a conta Meta dele" };
  }

  const { listarContasDeAnuncio } = await import("@/lib/integrations/meta/ads");
  const contas = await listarContasDeAnuncio(projeto.workspaceId, conexao.id);
  if (!contas.ok || !contas.dados?.length) {
    return { ok: false, pendencia: contas.erro ?? "não encontrei conta de anúncio nesta conexão" };
  }

  const diario = diarioAPartirDoMensal(verbaMensal);
  const teto = diarioAPartirDoMensal(verbaMensal);
  const conferido = conferirOrcamento({ orcamentoDiarioBRL: diario, tetoAprovadoBRL: teto });
  if (!conferido.ok) {
    return { ok: false, pendencia: `a verba informada (R$ ${verbaMensal}/mês) não dá uma campanha válida: ${conferido.erro}` };
  }

  const plano: PlanoDeCampanha = {
    contaId: contas.dados[0]!.id,
    nome: `${req?.businessName ?? projeto.client?.name ?? projeto.name} — ${projeto.name}`.slice(0, 200),
    objetivo: objetivoDoBriefing(scope),
    orcamentoDiarioBRL: diario,
    tetoAprovadoBRL: teto,
  };

  const criada = await criarCampanhaPausada(projeto.workspaceId, conexao.id, plano);
  if (!criada.ok || !criada.dados) {
    return { ok: false, pendencia: criada.erro ?? "a Meta recusou a criação da campanha" };
  }

  const registro = await prisma.adCampaign.create({
    data: {
      workspaceId: projeto.workspaceId, clientId: projeto.clientId, projectId,
      connectionId: conexao.id, adAccountId: plano.contaId,
      externalId: criada.dados.campaignId, name: plano.nome, objective: plano.objetivo,
      dailyBudgetBRL: diario, approvedCapBRL: teto, status: "paused",
    },
  });

  // O cliente precisa saber que existe uma campanha esperando o dedo dele. Uma
  // campanha pausada que ninguém sabe que existe é trabalho jogado fora.
  if (projeto.clientRequestId) {
    await prisma.portalMessage.create({
      data: {
        clientRequestId: projeto.clientRequestId, authorRole: "team", authorName: "Gerente de projeto",
        body: [
          "Sua campanha de anúncios está montada e PAUSADA, esperando seu ok. 🎯",
          "",
          `• Orçamento: R$ ${diario} por dia (R$ ${verbaMensal}/mês, exatamente o que você informou)`,
          `• Objetivo: ${plano.objetivo}`,
          "",
          "Ela só começa a gastar quando você autorizar. Me diz aqui quando quiser ligar.",
        ].join("\n"),
        readByTeam: true,
      },
    }).catch(() => { /* best-effort */ });
  }

  return { ok: true, campanhaId: registro.id };
}

/**
 * Liga a campanha. É o único caminho da casa que faz dinheiro do cliente sair.
 *
 * `autorizadoPor` é obrigatório e fica gravado. Sem dono registrado, "quem
 * mandou gastar?" não tem resposta — e um dia essa pergunta vai ser feita.
 */
export async function ligarCampanha(
  campanhaId: string,
  autorizadoPor: string,
): Promise<{ ok: boolean; erro?: string }> {
  const c = await prisma.adCampaign.findUnique({ where: { id: campanhaId } });
  if (!c) return { ok: false, erro: "campanha não encontrada" };
  if (c.status === "active") return { ok: true };
  if (!autorizadoPor?.trim()) return { ok: false, erro: "ativação sem autorizador identificado" };

  // O teto é reconferido na ATIVAÇÃO, não só na criação. Entre uma e outra o
  // registro pode ter sido editado, e é aqui que o dinheiro começa a sair.
  const conferido = conferirOrcamento({
    orcamentoDiarioBRL: c.dailyBudgetBRL,
    tetoAprovadoBRL: c.approvedCapBRL,
  });
  if (!conferido.ok) return { ok: false, erro: conferido.erro };

  const r = await ativarCampanha(c.workspaceId, c.connectionId, c.externalId, autorizadoPor);
  if (!r.ok) {
    await prisma.adCampaign.update({ where: { id: campanhaId }, data: { lastError: r.erro ?? null } })
      .catch(() => { /* best-effort */ });
    return { ok: false, erro: r.erro };
  }

  await prisma.adCampaign.update({
    where: { id: campanhaId },
    data: { status: "active", activatedBy: autorizadoPor.slice(0, 200), activatedAt: new Date(), lastError: null },
  });
  return { ok: true };
}

/** Freia. Sempre permitido e sem cerimônia — freio com burocracia não é freio. */
export async function desligarCampanha(campanhaId: string): Promise<{ ok: boolean; erro?: string }> {
  const c = await prisma.adCampaign.findUnique({ where: { id: campanhaId } });
  if (!c) return { ok: false, erro: "campanha não encontrada" };
  const r = await pausarCampanha(c.workspaceId, c.connectionId, c.externalId);
  if (!r.ok) return { ok: false, erro: r.erro };
  await prisma.adCampaign.update({ where: { id: campanhaId }, data: { status: "paused" } });
  return { ok: true };
}

/**
 * O desempenho pago do período, para entrar no relatório mensal.
 *
 * Devolve `null` quando não conseguiu medir — nunca zeros. Zero gasto é uma
 * notícia; "não medi" é outra, e trocá-las num relatório de tráfego pago é o
 * erro mais caro que esta casa pode cometer.
 */
export async function desempenhoPagoDoPeriodo(
  projectId: string,
  periodo: { desde: string; ate: string },
): Promise<(DesempenhoPago & { campanhas: number }) | null> {
  const campanhas = await prisma.adCampaign.findMany({
    where: { projectId, status: { in: ["active", "paused", "ended"] } },
  }).catch(() => []);
  if (campanhas.length === 0) return null;

  const soma: DesempenhoPago & { campanhas: number } = {
    gastoBRL: 0, impressoes: 0, cliques: 0, alcance: 0, cpcBRL: null, campanhas: 0,
  };
  for (const c of campanhas) {
    const r = await lerDesempenho(c.workspaceId, c.connectionId, c.externalId, periodo);
    if (!r.ok || !r.dados) continue;
    soma.gastoBRL += r.dados.gastoBRL;
    soma.impressoes += r.dados.impressoes;
    soma.cliques += r.dados.cliques;
    soma.alcance += r.dados.alcance;
    soma.campanhas++;
  }
  // Nenhuma campanha respondeu = não medi. Devolver a soma zerada aqui diria ao
  // cliente que a campanha dele não entregou nada, o que pode ser mentira.
  if (soma.campanhas === 0) return null;
  soma.cpcBRL = soma.cliques > 0 ? Number((soma.gastoBRL / soma.cliques).toFixed(2)) : null;
  return soma;
}

// ─── Internos ───────────────────────────────────────────────────────────────

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Traduz o que o cliente disse querer no objetivo da campanha. Padrão
 *  conservador: tráfego. Prometer conversão sem pixel instalado seria vender o
 *  que não se pode entregar. */
function objetivoDoBriefing(scope: Record<string, unknown>): PlanoDeCampanha["objetivo"] {
  const texto = JSON.stringify(scope).toLowerCase();
  if (/whatsapp|conversa|mensagem/.test(texto)) return "conversas";
  if (/lead|cadastro|formul/.test(texto)) return "leads";
  if (/reconhec|marca|alcance|conhecer/.test(texto)) return "alcance";
  if (/engaj|seguidor|curtida/.test(texto)) return "engajamento";
  return "trafego";
}
