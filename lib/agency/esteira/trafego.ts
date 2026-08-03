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
  criarCampanhaPausada, criarConjuntoPausado, criarAnuncioPausado, ativarFilhos,
  ativarCampanha, pausarCampanha, lerDesempenho, buscarInteresses,
  conferirOrcamento, RAIO_MAX_KM, RAIO_MIN_KM,
  type PlanoDeCampanha, type DesempenhoPago, type PublicoDoConjunto,
} from "@/lib/integrations/meta/ads";
import { caminhoPublicoAssinado } from "@/lib/agency/media/armazenamento";

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

  // ── A CONEXÃO PRECISA SER A DE USUÁRIO ────────────────────────────────────
  // `me/adaccounts` e a Marketing API respondem "(#102) A user access token is
  // required": token de PÁGINA não serve. Pegar "qualquer conexão conectada"
  // parecia certo e falharia sempre — com um erro da Meta que não diz que o
  // problema é o tipo do token.
  const conexao = await prisma.metaConnection.findFirst({
    where: { workspaceId: projeto.workspaceId, clientId: projeto.clientId, platform: "user", status: "connected" },
    select: { id: true },
    orderBy: { connectedAt: "desc" },
  }).catch(() => null);
  if (!conexao) {
    const temAlguma = await prisma.metaConnection.count({
      where: { workspaceId: projeto.workspaceId, clientId: projeto.clientId, status: "connected" },
    }).catch(() => 0);
    return {
      ok: false,
      pendencia: temAlguma > 0
        ? "o cliente conectou a Meta antes de o acesso de anúncios existir — precisa reconectar para liberar o tráfego pago"
        : "o cliente ainda não conectou a conta Meta dele",
    };
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

  // ── O CONJUNTO ────────────────────────────────────────────────────────────
  // A campanha sozinha é um envelope com verba: ela liga e não entrega nada.
  // Foi o buraco do raio-X de 02/08/2026 — a casa dizia "tráfego pronto" e a
  // conta ficava parada.
  const publico = await lerSegmentacao(projectId, projeto.workspaceId, conexao.id, scope);
  const conjunto = await criarConjuntoPausado(projeto.workspaceId, conexao.id, {
    contaId: plano.contaId,
    campaignId: criada.dados.campaignId,
    nome: `${plano.nome} — ${publico.cidade ?? "Brasil"}`,
    objetivo: plano.objetivo,
    publico,
  });

  // ── O ANÚNCIO ─────────────────────────────────────────────────────────────
  const criativo = await montarCriativo(projectId, projeto.workspaceId, conexao.id);
  let anuncioId: string | null = null;
  if (conjunto.ok && conjunto.dados && criativo) {
    const anuncio = await criarAnuncioPausado(projeto.workspaceId, conexao.id, {
      contaId: plano.contaId,
      adSetId: conjunto.dados.adSetId,
      pageId: criativo.pageId,
      nome: plano.nome,
      imagemUrl: criativo.imagemUrl,
      texto: criativo.texto,
      titulo: criativo.titulo,
      link: criativo.link,
      cta: criativo.cta,
    });
    if (anuncio.ok && anuncio.dados) anuncioId = anuncio.dados.adId;
  }

  // Campanha incompleta não pode parecer pronta. O que faltou é calculado aqui
  // e gravado, para o painel mostrar — em vez de o time descobrir depois de
  // ligar e ver a conta gastando zero.
  const oQueFaltou = !conjunto.ok
    ? `conjunto não criado: ${conjunto.erro ?? "erro"}`
    : !anuncioId
      ? (criativo ? "anúncio não criado — a Meta recusou o criativo" : "anúncio não criado — falta arte ou página do Facebook conectada")
      : null;

  const registro = await prisma.adCampaign.create({
    data: {
      workspaceId: projeto.workspaceId, clientId: projeto.clientId, projectId,
      connectionId: conexao.id, adAccountId: plano.contaId,
      externalId: criada.dados.campaignId,
      adSetId: conjunto.ok ? conjunto.dados?.adSetId ?? null : null,
      adId: anuncioId,
      audience: resumirPublico(publico),
      name: plano.nome, objective: plano.objetivo,
      dailyBudgetBRL: diario, approvedCapBRL: teto, status: "paused",
      lastError: oQueFaltou,
    },
  });

  // O cliente precisa saber que existe uma campanha esperando o dedo dele. Uma
  // campanha pausada que ninguém sabe que existe é trabalho jogado fora.
  const completa = oQueFaltou === null;
  if (projeto.clientRequestId && completa) {
    await prisma.portalMessage.create({
      data: {
        clientRequestId: projeto.clientRequestId, authorRole: "team", authorName: "Gerente de projeto",
        body: [
          "Sua campanha de anúncios está montada e PAUSADA, esperando seu ok. 🎯",
          "",
          `• Orçamento: R$ ${diario} por dia (R$ ${verbaMensal}/mês, exatamente o que você informou)`,
          `• Objetivo: ${plano.objetivo}`,
          `• Quem vai ver: ${resumirPublico(publico)}`,
          "",
          "Ela só começa a gastar quando você autorizar. Me diz aqui quando quiser ligar.",
        ].join("\n"),
        readByTeam: true,
      },
    }).catch(() => { /* best-effort */ });
  }

  return {
    ok: true,
    campanhaId: registro.id,
    ...(completa ? {} : { pendencia: oQueFaltou }),
  };
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

  // Campanha sem conjunto e sem anúncio LIGA E NÃO ENTREGA. O cliente veria a
  // conta "ativa", zero resultado, e concluiria que anúncio não funciona para
  // o negócio dele. Recusar é mais honesto que ligar um envelope vazio.
  if (!c.adSetId || !c.adId) {
    return {
      ok: false,
      erro: `esta campanha está incompleta (${!c.adSetId ? "sem conjunto de anúncios" : "sem anúncio"}) — ligar assim gastaria sem entregar nada`,
    };
  }

  const r = await ativarCampanha(c.workspaceId, c.connectionId, c.externalId, autorizadoPor);
  if (!r.ok) {
    await prisma.adCampaign.update({ where: { id: campanhaId }, data: { lastError: r.erro ?? null } })
      .catch(() => { /* best-effort */ });
    return { ok: false, erro: r.erro };
  }

  // Subir os filhos junto: campanha ACTIVE com conjunto PAUSED entrega zero, e
  // a conta parece ligada para quem olha o painel.
  await ativarFilhos(c.workspaceId, c.connectionId, { adSetId: c.adSetId, adId: c.adId });

  await prisma.adCampaign.update({
    where: { id: campanhaId },
    data: {
      status: "active", activatedBy: autorizadoPor.slice(0, 200), activatedAt: new Date(),
      lastError: null, pausedByGuardAt: null, pausedReason: null,
    },
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

/**
 * O GUARDIÃO DE VERBA — o que separa gestão de tráfego de "criei e esqueci".
 *
 * Roda no relógio. Freia sozinho a campanha ativa que está gastando e não
 * entregando, antes de a fatura contar a história. Três gatilhos, todos
 * determinísticos e todos conservadores — errar freando custa um dia de
 * campanha; errar deixando rodar custa o mês do cliente.
 */
export const GASTO_MINIMO_PARA_JULGAR_BRL = 30;
export const CPC_ABSURDO_BRL = 5;

export interface GuardaFeita {
  pausadas: Array<{ campanhaId: string; motivo: string }>;
  avaliadas: number;
}

export async function guardarAVerba(hoje: Date = new Date()): Promise<GuardaFeita> {
  const saida: GuardaFeita = { pausadas: [], avaliadas: 0 };
  const ativas = await prisma.adCampaign.findMany({ where: { status: "active" } }).catch(() => []);

  const ate = iso(hoje);
  const desde = iso(new Date(hoje.getTime() - 7 * 24 * 60 * 60_000));

  for (const c of ativas) {
    const r = await lerDesempenho(c.workspaceId, c.connectionId, c.externalId, { desde, ate });
    // Não consegui medir NÃO é motivo para frear. Pausar por cegueira própria
    // tiraria do ar uma campanha que pode estar indo bem.
    if (!r.ok || !r.dados) continue;
    saida.avaliadas++;
    const d = r.dados;

    // Só julga depois de ter gastado o suficiente para o número significar algo.
    // Um CPC de R$ 8 com R$ 5 gastos é ruído, não diagnóstico.
    if (d.gastoBRL < GASTO_MINIMO_PARA_JULGAR_BRL) continue;

    let motivo: string | null = null;
    if (d.cliques === 0) {
      motivo = `gastou R$ ${d.gastoBRL.toFixed(2)} em 7 dias e não teve UM clique`;
    } else if (d.cpcBRL !== null && d.cpcBRL > CPC_ABSURDO_BRL) {
      motivo = `custo por clique de R$ ${d.cpcBRL} — acima do teto de R$ ${CPC_ABSURDO_BRL}`;
    } else if (d.impressoes === 0) {
      motivo = "gastou e não apareceu para ninguém — provável problema de segmentação";
    }
    if (!motivo) continue;

    const p = await pausarCampanha(c.workspaceId, c.connectionId, c.externalId);
    if (!p.ok) continue;
    await prisma.adCampaign.update({
      where: { id: c.id },
      data: { status: "paused", pausedByGuardAt: new Date(), pausedReason: motivo },
    }).catch(() => { /* best-effort */ });

    // O time PRECISA saber. Uma campanha que se pausa em silêncio é o mesmo
    // problema com outra cara: ninguém entende por que o cliente parou de vender.
    await prisma.activityEvent.create({
      data: {
        workspaceId: c.workspaceId, clientId: c.clientId, projectId: c.projectId,
        type: "campanha_pausada_pelo_guardiao",
        message: `Pausei "${c.name}" sozinho: ${motivo}. Precisa de revisão antes de religar.`.slice(0, 900),
      },
    }).catch(() => { /* best-effort */ });

    saida.pausadas.push({ campanhaId: c.id, motivo });
  }
  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resumirPublico(p: PublicoDoConjunto): string {
  const partes = [
    p.cidade ? `${p.cidade} + ${p.raioKm} km` : "Brasil inteiro",
    `${p.idadeMin}–${p.idadeMax} anos`,
    p.interesses.length > 0 ? p.interesses.map((i) => i.name).join(", ") : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Lê o público que o especialista de segmentação definiu.
 *
 * Quando não há entrega de segmentação, o padrão é DELIBERADAMENTE amplo em
 * idade e SEM interesse — mas nunca inventa cidade. Segmentar por palpite
 * geográfico é o erro que faz a padaria de bairro anunciar no país inteiro.
 */
async function lerSegmentacao(
  projectId: string,
  workspaceId: string,
  connectionId: string,
  scope: Record<string, unknown>,
): Promise<PublicoDoConjunto> {
  const padrao: PublicoDoConjunto = {
    cidade: typeof scope.city === "string" ? scope.city : (typeof scope.cidade === "string" ? scope.cidade : null),
    raioKm: 8, idadeMin: 25, idadeMax: 55, interesses: [],
  };

  const entrega = await prisma.deliverable.findFirst({
    where: { projectId, ownerAgentId: "traffic-segmentacao" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  }).catch(() => null);
  if (!entrega?.content) return padrao;

  const texto = entrega.content;
  const cidade = capturarCampo(texto, "Cidade") ?? capturarCampo(texto, "cidade");
  const raio = Number(capturarCampo(texto, "Raio")?.replace(/[^\d]/g, "") ?? "");
  const idadeMin = Number(capturarCampo(texto, "Idade mínima")?.replace(/[^\d]/g, "") ?? "");
  const idadeMax = Number(capturarCampo(texto, "Idade máxima")?.replace(/[^\d]/g, "") ?? "");
  const faixa = capturarCampo(texto, "Idade")?.match(/(\d{2})\D+(\d{2})/);

  // "PRECISO CONFIRMAR" é o especialista admitindo que não sabe. Admissão não
  // é dado: não vira cidade, vira ausência de segmentação geográfica.
  const cidadeLimpa = cidade && !/PRECISO CONFIRMAR/i.test(cidade) ? cidade.slice(0, 80) : padrao.cidade;

  const termos = (capturarCampo(texto, "Interesses") ?? "")
    .split(/[,;·]/).map((s) => s.trim()).filter((s) => s.length > 2 && !/PRECISO CONFIRMAR/i.test(s));
  const interesses = termos.length > 0
    ? await buscarInteresses(workspaceId, connectionId, termos)
    : [];

  return {
    cidade: cidadeLimpa,
    raioKm: Number.isFinite(raio) && raio > 0 ? Math.max(RAIO_MIN_KM, Math.min(RAIO_MAX_KM, raio)) : padrao.raioKm,
    idadeMin: Number.isFinite(idadeMin) && idadeMin > 0 ? idadeMin : (faixa ? Number(faixa[1]) : padrao.idadeMin),
    idadeMax: Number.isFinite(idadeMax) && idadeMax > 0 ? idadeMax : (faixa ? Number(faixa[2]) : padrao.idadeMax),
    interesses,
  };
}

/**
 * Monta o criativo do anúncio a partir do que a casa já produziu: a arte do
 * Design e a copy do especialista de anúncio.
 *
 * Devolve `null` quando falta arte ou página do Facebook — e isso vira pendência
 * visível, não um anúncio pela metade.
 */
async function montarCriativo(
  projectId: string,
  workspaceId: string,
  connectionId: string,
): Promise<{ pageId: string; imagemUrl: string; texto: string; titulo: string; link: string; cta?: string } | null> {
  const pagina = await prisma.metaConnection.findFirst({
    where: { workspaceId, platform: "facebook", status: "connected" },
    select: { externalId: true },
  }).catch(() => null);
  if (!pagina?.externalId) return null;

  const post = await prisma.socialPost.findFirst({
    where: { mediaUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { mediaUrl: true },
  }).catch(() => null);
  const imagemUrl = await urlPublica(post?.mediaUrl ?? null);
  if (!imagemUrl) return null;

  const copy = await prisma.deliverable.findFirst({
    where: { projectId, ownerAgentId: "traffic-copy-anuncio" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  }).catch(() => null);

  const titulo = capturarCampo(copy?.content ?? "", "headline")
    ?? capturarPrimeiroHeadline(copy?.content ?? "")
    ?? "Conheça a gente";
  const texto = capturarCampo(copy?.content ?? "", "Legenda")
    ?? capturarCampo(copy?.content ?? "", "Texto")
    ?? titulo;

  const cliente = await prisma.project.findUnique({
    where: { id: projectId },
    select: { client: { select: { website: true, phone: true } } },
  }).catch(() => null);
  const site = cliente?.client?.website?.trim();
  // Sem site do cliente, o destino é o WhatsApp dele — que é o que a maioria
  // dos clientes desta casa realmente tem. Sem nenhum dos dois, não há anúncio.
  const zap = cliente?.client?.phone?.replace(/\D/g, "");
  const link = site
    ? (site.startsWith("http") ? site : `https://${site}`)
    : (zap && zap.length >= 10 ? `https://wa.me/55${zap.slice(-11)}` : "");
  if (!link) return null;

  return {
    pageId: pagina.externalId,
    imagemUrl,
    texto: texto.slice(0, 2000),
    titulo: titulo.slice(0, 100),
    link,
    cta: site ? "LEARN_MORE" : "WHATSAPP_MESSAGE",
  };
}

async function urlPublica(mediaUrl: string | null): Promise<string | null> {
  if (!mediaUrl) return null;
  if (!mediaUrl.startsWith("/api/media/")) return mediaUrl.startsWith("http") ? mediaUrl : null;
  const id = mediaUrl.split("/api/media/")[1]?.split("?")[0] ?? "";
  const base = process.env.PUBLIC_BASE_URL?.trim() || process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (!base || !id) return null;
  const dominio = base.startsWith("http") ? base : `https://${base}`;
  try {
    // Assinar LANÇA quando o segredo não está configurado — e é o certo, porque
    // link "assinado" com segredo previsível aparenta proteção que não existe.
    // Aqui isso vira ausência de criativo (pendência visível), nunca uma
    // exceção que derruba a criação inteira da campanha.
    return `${dominio}${caminhoPublicoAssinado(id)}`;
  } catch {
    return null;
  }
}

function capturarCampo(texto: string, campo: string): string | null {
  const m = texto.match(new RegExp(`^[-*\\s]*\\*{0,2}${campo}:?\\*{0,2}:?\\s*(.+)$`, "mi"));
  const v = m?.[1]?.replace(/\*+/g, "").trim();
  return v && v.length > 1 ? v : null;
}

function capturarPrimeiroHeadline(texto: string): string | null {
  const m = texto.match(/^\*\*\d+\.\s*(.+?)\*\*$/m);
  return m?.[1]?.trim() ?? null;
}

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
