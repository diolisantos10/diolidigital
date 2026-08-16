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
import { gravarMensagemDoPortal } from "@/lib/agency/portal/mensagem-do-portal";
import {
  oQueFaltaParaSegmentar, NAO_PERGUNTADO, type AreaDeAtendimento,
} from "@/lib/agency/comercial/onde-o-negocio-vende";

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

// ─── BARRAR SEM ENSINAR O CAMINHO É O QUE TRAVA A CASA ──────────────────────
//
// 15/08/2026. Cinco coisas impedem uma campanha de sair, e nenhuma delas é a
// Meta: são travas NOSSAS, todas certas, todas fail-closed. O defeito não era a
// trava — era a frase. "o cliente ainda não conectou a conta Meta dele" é
// verdade e é inútil: não diz onde se conecta, e quem lê fica esperando.
//
// Cada pendência abaixo passou a carregar **o clique**. Elas são constantes, e
// não texto solto no meio da função, porque a mesma frase precisa aparecer
// igual no painel, no relatório e aqui — e porque o teste afirma sobre elas.
export const ONDE_CONECTAR =
  'portal do cliente → aba "Conexões" → botão "Conectar Facebook/Instagram" (login pessoal do dono, uma vez)';
export const ONDE_MARCAR_A_CONTA =
  'portal do cliente → "O que a Dioli pode acessar" → marcar a conta de anúncios → "Salvar"';
export const ONDE_DIZER_A_VERBA =
  "briefing do cliente → campo de verba de anúncios (`adsBudget`)";
export const ONDE_LIGAR =
  'painel da agência → Desempenho pago → a campanha → "Ligar" (fica gravado quem autorizou)';

// ─── A POSSE DO CRIATIVO (15/08/2026) ───────────────────────────────────────
//
// `montarCriativo` escolhia a Página com `findFirst({ workspaceId, platform:
// "facebook" })` — **sem `clientId`** — e a arte com `findFirst({ mediaUrl: {
// not: null } })` — **sem dono nenhum**. Num banco com mais de um cliente isso
// significa, literalmente: o anúncio do cliente A nasce assinado pela Página do
// cliente B, com a arte do post mais recente da base, seja de quem for. E o
// `pageId` seguia CRU para `object_story_spec.page_id` (`ads.ts`), sem passar
// pela lista de ativos autorizados que existe desde 06/08/2026 — a mesma trava
// que a conta de anúncios já atravessa.
//
// A regra desta casa, aplicada aqui: **id recebido não é id provado**. As três
// peças do criativo passaram a ser DERIVADAS do projeto, e nenhuma delas chega
// por parâmetro de quem chama:
//
//   1. a Página, pelo `clientId` do projeto;
//   2. a arte, pelas peças DESTE projeto (entrega ou pedido do cliente);
//   3. a Página de novo, dentro de `criarAnuncioPausado`, contra a lista de
//      ativos autorizados — a conferência mora onde o id é USADO, porque
//      conferir no chamador deixa a próxima porta descoberta.
//
// O torniquete que ficou aqui entre os dois commits — `POSSE_DO_CRIATIVO_
// CONFERIDA = false` — saiu junto com o conserto. Torniquete que vira parte da
// anatomia é gangrena.

/** O motivo honesto quando não dá para provar de quem é o ativo. Não é "a Meta
 *  recusou": a Meta não recusou nada — nós é que não provamos a posse. */
export const POSSE_NAO_CONFERIDA =
  "anúncio não criado — a casa não consegue provar que a Página e a arte são DESTE cliente, "
  + "e um anúncio assinado pela Página de outro cliente é um dano que não se desfaz.";

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
      pendencia:
        "o cliente não informou a verba de anúncios no briefing — sem teto aprovado, nenhuma campanha é criada. "
        + `Onde resolver: ${ONDE_DIZER_A_VERBA}.`,
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
    // A conexão de NÍVEL AGÊNCIA (clientId vazio) não serve aqui, e isto é
    // deliberado: usar a credencial da agência para mexer na conta de um cliente
    // é o dano de 06/08/2026 pela outra ponta. O gesto é o dono conectar no
    // portal DELE — e é isso que a frase passou a dizer.
    return {
      ok: false,
      pendencia: temAlguma > 0
        ? "o cliente conectou a Meta antes de o acesso de anúncios existir — precisa reconectar para liberar o tráfego pago. "
          + `Onde resolver: ${ONDE_CONECTAR}.`
        : "o cliente ainda não conectou a conta Meta dele. "
          + `Onde resolver: ${ONDE_CONECTAR}.`,
    };
  }

  const { listarContasDeAnuncio } = await import("@/lib/integrations/meta/ads");
  const contas = await listarContasDeAnuncio(projeto.workspaceId, conexao.id);
  if (!contas.ok || !contas.dados?.length) {
    // `sem_autorizacao` é a nossa lista fail-closed (`MetaAtivoAutorizado`), não
    // uma recusa da Meta — e as duas pediam gestos diferentes com a mesma cara.
    const complemento = contas.motivo === "sem_autorizacao"
      ? ` Onde resolver: ${ONDE_MARCAR_A_CONTA}.`
      : "";
    return {
      ok: false,
      pendencia: (contas.erro ?? "não encontrei conta de anúncio nesta conexão") + complemento,
    };
  }

  const diario = diarioAPartirDoMensal(verbaMensal);
  const teto = diarioAPartirDoMensal(verbaMensal);
  const conferido = conferirOrcamento({ orcamentoDiarioBRL: diario, tetoAprovadoBRL: teto });
  if (!conferido.ok) {
    return { ok: false, pendencia: `a verba informada (R$ ${verbaMensal}/mês) não dá uma campanha válida: ${conferido.erro}` };
  }

  // ── ONDE, ANTES DE QUANTO ─────────────────────────────────────────────────
  //
  // A pergunta "para quem este anúncio aparece" é respondida **antes de tocar na
  // Meta**, e não depois. Duas razões, e a segunda é a que importa:
  //
  // 1. Campanha criada e depois abandonada por falta de dado deixa lixo na conta
  //    de anúncio do cliente — conta que não é nossa.
  // 2. Sem cidade, o conjunto sai para o **Brasil inteiro**. Esse era o
  //    comportamento até 10/08/2026, em silêncio: o briefing nunca perguntou
  //    onde o negócio vende, `cidade` era sempre nula, e "nula" virava "país".
  //    Para o padeiro do bairro, é a verba do mês inteira gasta com quem nunca
  //    vai atravessar a cidade para comprar o pão dele.
  //
  // Ausência de informação não é informação: aqui ela vira **pendência**, que é
  // uma pergunta para uma pessoa, e não um alvo largo escolhido pelo código.
  const publico = await lerSegmentacao(projectId, projeto.workspaceId, conexao.id, scope);
  const faltaGeografia = geografiaPendente(publico, scope);
  if (faltaGeografia) return { ok: false, pendencia: faltaGeografia };

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
  const conjunto = await criarConjuntoPausado(projeto.workspaceId, conexao.id, {
    contaId: plano.contaId,
    campaignId: criada.dados.campaignId,
    nome: `${plano.nome} — ${publico.cidade ?? "Brasil"}`,
    objetivo: plano.objetivo,
    publico,
  });

  // ── O ANÚNCIO ─────────────────────────────────────────────────────────────
  const criativo = await montarCriativo(projectId, projeto.workspaceId);
  let anuncioId: string | null = null;
  // O motivo começa sendo o do criativo e só é substituído por uma recusa real
  // da Meta. Antes de 15/08/2026 toda ausência de anúncio virava "a Meta
  // recusou o criativo" — culpar a plataforma por um defeito nosso apaga o
  // rastro do defeito e manda o operador esperar por alguém que nunca vem.
  let porQueSemAnuncio: string | null = criativo.ok ? null : criativo.pendencia;
  if (conjunto.ok && conjunto.dados && criativo.ok) {
    const anuncio = await criarAnuncioPausado(projeto.workspaceId, conexao.id, {
      contaId: plano.contaId,
      adSetId: conjunto.dados.adSetId,
      pageId: criativo.criativo.pageId,
      nome: plano.nome,
      imagemUrl: criativo.criativo.imagemUrl,
      texto: criativo.criativo.texto,
      titulo: criativo.criativo.titulo,
      link: criativo.criativo.link,
      cta: criativo.criativo.cta,
    });
    if (anuncio.ok && anuncio.dados) {
      anuncioId = anuncio.dados.adId;
      porQueSemAnuncio = null;
    } else {
      porQueSemAnuncio = `anúncio não criado — ${anuncio.erro ?? "a Meta recusou o criativo"}`;
    }
  }

  // Campanha incompleta não pode parecer pronta. O que faltou é calculado aqui
  // e gravado, para o painel mostrar — em vez de o time descobrir depois de
  // ligar e ver a conta gastando zero.
  const oQueFaltou = !conjunto.ok
    ? `conjunto não criado: ${conjunto.erro ?? "erro"}`
    : !anuncioId
      ? (porQueSemAnuncio ?? "anúncio não criado")
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
    await gravarMensagemDoPortal({
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
    }).catch(() => { /* best-effort */ });
  }

  return {
    ok: true,
    campanhaId: registro.id,
    // Campanha completa não é campanha no ar: ela nasce PAUSADA e o último
    // passo é humano, com nome. Dizer só "ok: true" já fez a casa achar que
    // "tráfego pago pronto" significava dinheiro rodando — não significa.
    ...(completa
      ? { pendencia: `campanha montada e PAUSADA, esperando a ativação humana. Onde ligar: ${ONDE_LIGAR}.` }
      : { pendencia: oQueFaltou }),
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

  // ── ⚠️ `c.adAccountId` NÃO É DECORAÇÃO (15/08/2026) ──────────────────────
  //
  // A cota da Marketing API é contada POR CONTA DE ANÚNCIOS, e a conta sai da
  // URL da chamada (`cota-de-anuncios.ts`, `contaDaUrl`). Ativar e pausar são
  // `POST /{id}` — o `act_...` NÃO aparece na URL. Sem declarar a conta aqui, as
  // três escritas da ativação caíam num balde `sem_conta:<hash do token>`,
  // separado do balde da conta que acabou de receber as quatro escritas da
  // criação. Duas contagens da mesma conta significam teto DOBRADO: 32 escritas
  // onde a Meta bloqueia em 20 — a assinatura exata do que restringiu uma conta
  // desta casa em 03/08/2026.
  //
  // Passar `c.adAccountId` faz as 7 escritas caírem no mesmo contador, que é
  // fail-closed (banco fora do ar NEGA a chamada) e atravessa deploy e réplica.
  const r = await ativarCampanha(c.workspaceId, c.connectionId, c.externalId, autorizadoPor, c.adAccountId);
  if (!r.ok) {
    await prisma.adCampaign.update({ where: { id: campanhaId }, data: { lastError: r.erro ?? null } })
      .catch(() => { /* best-effort */ });
    return { ok: false, erro: r.erro };
  }

  // Subir os filhos junto: campanha ACTIVE com conjunto PAUSED entrega zero, e
  // a conta parece ligada para quem olha o painel.
  await ativarFilhos(c.workspaceId, c.connectionId, {
    adSetId: c.adSetId, adId: c.adId, contaId: c.adAccountId,
  });

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
  // A conta vai declarada aqui também — pausar é escrita e pontua igual (3).
  // Um freio que não é contado é um freio que pode ser o gesto que estoura a
  // cota e bloqueia a conta por 5 minutos, justamente quando se quer parar.
  const r = await pausarCampanha(c.workspaceId, c.connectionId, c.externalId, c.adAccountId);
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
    // `contaId` declarado: `{campaign_id}/insights` não traz o `act_...` na URL,
    // e a leitura precisa cair no MESMO contador da conta (1 ponto cada).
    const r = await lerDesempenho(c.workspaceId, c.connectionId, c.externalId, periodo, {
      contaId: c.adAccountId,
    });
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
    const r = await lerDesempenho(c.workspaceId, c.connectionId, c.externalId, { desde, ate }, {
      contaId: c.adAccountId,
    });
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

    const p = await pausarCampanha(c.workspaceId, c.connectionId, c.externalId, c.adAccountId);
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

/** A área de atendimento como o briefing a guardou. Briefing antigo não tem o
 *  campo — e isso volta como `nao_declarado`, que é a verdade sobre ele. */
function areaDoBriefing(scope: Record<string, unknown>): AreaDeAtendimento {
  const trafego = scope.traffic as { serviceArea?: unknown } | undefined;
  const bruta = trafego?.serviceArea as Partial<AreaDeAtendimento> | undefined;
  if (!bruta || typeof bruta !== "object") return NAO_PERGUNTADO;
  const alcance = bruta.alcance;
  if (alcance !== "nacional" && alcance !== "local" && alcance !== "nao_declarado") return NAO_PERGUNTADO;
  return {
    alcance,
    cidade: typeof bruta.cidade === "string" && bruta.cidade.trim() ? bruta.cidade.slice(0, 80) : null,
    raioKm: typeof bruta.raioKm === "number" && bruta.raioKm > 0 ? bruta.raioKm : null,
    comoFoiDito: typeof bruta.comoFoiDito === "string" ? bruta.comoFoiDito.slice(0, 240) : "",
  };
}

/**
 * O que impede de segmentar — ou `null` quando nada impede.
 *
 * A cidade pode chegar por dois caminhos: o briefing do cliente ou a entrega do
 * especialista de segmentação. Basta **um** deles. O que não basta é nenhum: aí
 * o alvo seria o país inteiro, e ninguém escolheu isso.
 *
 * `nacional` declarado passa — porque aí o Brasil inteiro é o alvo **pedido**,
 * não o alvo que sobrou.
 */
function geografiaPendente(publico: PublicoDoConjunto, scope: Record<string, unknown>): string | null {
  if (publico.cidade) return null;
  const area = areaDoBriefing(scope);
  if (area.alcance === "nacional") return null;
  return oQueFaltaParaSegmentar(area);
}

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
  const area = areaDoBriefing(scope);
  const padrao: PublicoDoConjunto = {
    // A cidade vem do que o CLIENTE disse no briefing. Os dois campos soltos
    // (`city`/`cidade`) ficam como compatibilidade com briefing antigo — eles
    // nunca foram preenchidos por pergunta nenhuma, e é por isso que este
    // caminho inteiro nascia nulo.
    cidade: area.cidade
      ?? (typeof scope.city === "string" ? scope.city : (typeof scope.cidade === "string" ? scope.cidade : null)),
    raioKm: area.raioKm ?? 8,
    idadeMin: 25, idadeMax: 55, interesses: [],
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

export interface CriativoDoAnuncio {
  pageId: string; imagemUrl: string; texto: string; titulo: string; link: string; cta?: string;
}

/** Ou o criativo, ou o MOTIVO de não haver criativo. Devolver `null` seco fazia
 *  o chamador ter de adivinhar por que — e ele adivinhava errado, em português,
 *  para o painel de quem trabalha. */
export type CriativoMontado =
  | { ok: true; criativo: CriativoDoAnuncio }
  | { ok: false; pendencia: string };

/**
 * Monta o criativo do anúncio a partir do que a casa já produziu: a arte do
 * Design e a copy do especialista de anúncio.
 *
 * Não devolve criativo quando falta arte, falta Página ou **não se prova de
 * quem são** — e isso vira pendência visível, não um anúncio pela metade nem um
 * anúncio com o ativo de outro cliente.
 */
async function montarCriativo(
  projectId: string,
  workspaceId: string,
): Promise<CriativoMontado> {
  // ── O DONO, DERIVADO DO PROJETO ─────────────────────────────────────────
  // Não entra por parâmetro. Quem chama já passou `workspaceId` e poderia
  // passar um `clientId` junto — e aí a posse seria o que o chamador AFIRMA,
  // não o que o banco prova. Mesma disciplina de `ativos-autorizados.ts`.
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true, workspaceId: true, clientRequestId: true,
      client: { select: { website: true, phone: true } },
    },
  }).catch(() => null);
  if (!projeto || projeto.workspaceId !== workspaceId || !projeto.clientId) {
    // Fail-closed: sem projeto, sem workspace batendo ou sem dono, não há de
    // quem seja o anúncio — e "não sei de quem é" nunca vira "pode usar".
    return { ok: false, pendencia: POSSE_NAO_CONFERIDA };
  }
  const clientId = projeto.clientId;

  // ── 1. A PÁGINA DO DONO ──────────────────────────────────────────────────
  // `clientId` no filtro. Sem ele, `findFirst` devolvia a primeira Página
  // conectada do workspace — que num banco com vários clientes é a de outro.
  const pagina = await prisma.metaConnection.findFirst({
    where: { workspaceId, clientId, platform: "facebook", status: "connected" },
    select: { externalId: true },
    orderBy: { connectedAt: "desc" },
  }).catch(() => null);
  if (!pagina?.externalId) {
    return {
      ok: false,
      pendencia: "anúncio não criado — este cliente não tem Página do Facebook conectada, e a Página de outro cliente não serve. "
        + `Onde resolver: ${ONDE_CONECTAR}.`,
    };
  }

  // ── 2. A ARTE DESTE PROJETO ──────────────────────────────────────────────
  // `SocialPost` não tem `projectId` (ver schema): o vínculo com o projeto são
  // as ENTREGAS dele (`deliverableId`) e o pedido que o originou
  // (`clientRequestId`). Os dois ramos são do projeto; nenhum é "a peça mais
  // recente do banco". `clientId` e `workspaceId` vão junto como cinto e
  // suspensório — se um dia uma entrega for movida de projeto, o dono ainda
  // barra.
  const entregas = await prisma.deliverable.findMany({
    where: { projectId },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>);
  const daqueleProjeto = [
    ...(entregas.length > 0 ? [{ deliverableId: { in: entregas.map((e) => e.id) } }] : []),
    ...(projeto.clientRequestId ? [{ clientRequestId: projeto.clientRequestId }] : []),
  ];
  // Sem nenhum vínculo possível, não se consulta o banco: `OR: []` é uma
  // pergunta cuja única resposta certa é "nada", e escrevê-la explicitamente
  // impede que uma refatoração futura a transforme em "tudo".
  const post = daqueleProjeto.length === 0 ? null : await prisma.socialPost.findFirst({
    where: { workspaceId, clientId, mediaUrl: { not: null }, OR: daqueleProjeto },
    orderBy: { createdAt: "desc" },
    select: { mediaUrl: true },
  }).catch(() => null);
  const imagemUrl = await urlPublica(post?.mediaUrl ?? null);
  if (!imagemUrl) {
    return {
      ok: false,
      pendencia: "anúncio não criado — este projeto ainda não tem arte publicável. "
        + "A peça de outro cliente (ou de outro projeto) não entra no lugar: ela foi paga para outra coisa.",
    };
  }

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

  const site = projeto.client?.website?.trim();
  // Sem site do cliente, o destino é o WhatsApp dele — que é o que a maioria
  // dos clientes desta casa realmente tem. Sem nenhum dos dois, não há anúncio.
  const zap = projeto.client?.phone?.replace(/\D/g, "");
  const link = site
    ? (site.startsWith("http") ? site : `https://${site}`)
    : (zap && zap.length >= 10 ? `https://wa.me/55${zap.slice(-11)}` : "");
  if (!link) {
    return { ok: false, pendencia: "anúncio não criado — o cliente não tem site nem WhatsApp no cadastro, e anúncio sem destino não é anúncio" };
  }

  return {
    ok: true,
    criativo: {
      pageId: pagina.externalId,
      imagemUrl,
      texto: texto.slice(0, 2000),
      titulo: titulo.slice(0, 100),
      link,
      cta: site ? "LEARN_MORE" : "WHATSAPP_MESSAGE",
    },
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
