// ads.ts — MARKETING API. O único lugar da casa que gasta o dinheiro do cliente.
//
// Tudo o mais que esta agência automatiza é reversível: um post ruim se apaga,
// um texto errado se refaz, uma peça torta a Qualidade barra. Aqui não. Uma
// campanha ativa com orçamento errado gasta o dinheiro de um cliente pagante
// enquanto ninguém está olhando, e não existe "desfazer" para dinheiro gasto.
//
// Por isso este arquivo é o mais travado do repositório, e as travas são
// MECANISMO, não recomendação (regra 3 do kit: para o que causa dano real,
// exija mecanismo — prompt é sugestão):
//
//   1. TUDO NASCE PAUSADO. Nenhuma função aqui cria algo com status ACTIVE.
//      Ativar exige `ativarCampanha`, que é uma decisão registrada.
//   2. TETO DE ORÇAMENTO OBRIGATÓRIO. Toda criação recebe o teto que o cliente
//      aprovou e é conferida contra ele ANTES da chamada — a Meta não é quem
//      descobre que o número está errado.
//   3. NENHUMA IA CHEGA AQUI. Este módulo recebe números já decididos. Um
//      modelo de linguagem não escolhe orçamento nesta casa.
//
// ─── ⚠️ 15/08/2026 — O AVISO QUE ESTAVA AQUI ERA FALSO PELA METADE ──────────
//
// Esta linha dizia: *"`ads_management` e `ads_read` são permissões AVANÇADAS:
// sem App Review aprovado, a Meta recusa tudo abaixo mesmo com token válido."*
//
// Vale para conta de TERCEIRO. **Não vale para o ativo do próprio dono do app**,
// e a fonte diz isso com todas as letras:
//
//   • *"Administradores ou desenvolvedores de apps podem fazer chamadas à API em
//     nome de administradores de contas de anúncios ou anunciantes."*
//     — `fontes/marketing-api-autorizacao-e-niveis.md:48` (acesso LIMITADO)
//   • *"Caso o app seja utilizado somente por usuários que tiverem uma função
//     nele, não será necessário fazer a verificação. […] todos os recursos
//     ficarão sempre ativos."* — `fontes/verificacao-de-negocio.md:21`; a mesma
//     regra para a análise em `fontes/app-review-processo.md:18`.
//
// E a casa já provou isso em produção: em 03/08/2026, com o token do CEO, uma
// campanha PAUSADA foi criada por API e apagada em seguida
// (`docs/pendencias.md:3283-3287`). O que quebrou naquele dia **não foi
// permissão — foi ritmo**, e a conta foi restringida horas depois.
//
// Por isso `traduzirErro` abaixo deixou de carimbar "depende do App Review" em
// qualquer recusa que contenha a palavra "permission". Ele separa três coisas
// que pedem gestos DIFERENTES, e cada frase carrega a evidência que a produziu
// (guardrail 6 da casa: alerta sem o caso concreto é ruído).

import { graphGet, graphPost, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";
import {
  filtrarAutorizados, ativoAutorizado, normalizarId, FRASE_SEM_AUTORIZACAO,
  ONDE_MARCAR_OS_ATIVOS,
} from "./ativos-autorizados";
import { TIPO_DE_RITMO_DA_CASA } from "./ritmo";
import { lerDoCacheNoBanco, guardarNoCacheNoBanco, limparCacheNoBanco } from "./cache-no-banco";

/** Teto absoluto da casa, em reais por dia, independente do que for pedido.
 *  É a última linha de defesa: se todo o resto falhar, o estrago é limitado. */
export const TETO_DIARIO_ABSOLUTO_BRL = Number(process.env.ADS_TETO_DIARIO_BRL ?? 500);

/** Piso da Meta para orçamento diário. Abaixo disto a campanha nem entrega. */
export const PISO_DIARIO_BRL = 6;

/**
 * Por que a recusa aconteceu — e, junto, QUAL GESTO a resolve.
 *
 * Os três primeiros eram um só até 15/08/2026 (`sem_permissao`), e por isso a
 * casa esperou dias por um App Review que não era o problema. Eles pedem coisas
 * diferentes: reconectar com o escopo · dar acesso ao usuário NA conta · recorrer
 * da restrição.
 */
export type MotivoDeAnuncio =
  /** O TOKEN não carrega a permissão (`ads_management`/`ads_read`). Gesto:
   *  reconectar pedindo o escopo. Para conta de TERCEIRO, e só nesse caso, o
   *  acesso avançado (App Review) entra na conversa. */
  | "sem_permissao"
  /** O token está bom; quem o concedeu não administra ESTA conta de anúncios.
   *  Gesto: dar a função na conta, no Gerenciador de Negócios. Nada de esperar
   *  plataforma nenhuma. */
  | "ativo_nao_autorizado"
  /** A META bloqueou a conta (ou o usuário) para anunciar. Gesto: recorrer —
   *  ~48 h (`fontes/recorrer-de-restricao.md`). Nenhum código conserta isto. */
  | "conta_restrita"
  /** O token morreu ou foi revogado (código 190). Só o dono reconecta. */
  | "token_invalido"
  | "sem_conta" | "orcamento_invalido" | "erro_da_meta" | "sem_conexao"
  /** A CASA freou antes de a Meta reclamar (ver ritmo.ts / cota-de-anuncios.ts).
   *  Não é defeito nem falta de permissão: é a trava de 03/08 funcionando. */
  | "ritmo"
  /** A conta não está na lista que o CLIENTE autorizou (06/08/2026). Trava
   *  NOSSA, não da Meta — não confundir com `ativo_nao_autorizado`. */
  | "sem_autorizacao";

export interface ResultadoDeAnuncio<T = unknown> {
  ok: boolean;
  dados?: T;
  erro?: string;
  motivo?: MotivoDeAnuncio;
}

export interface ContaDeAnuncio {
  id: string;          // "act_123456"
  nome: string;
  moeda: string;
  status: number;      // 1 = ativa
}

// ─── OS CÓDIGOS, E A FONTE DE CADA UM ───────────────────────────────────────
//
// Todos de `docs/plataformas/meta/fontes/marketing-api-erros.md` (capturado em
// 07/08/2026), salvo indicação. Estão em constantes exportadas porque o teste
// afirma sobre eles: uma tabela de códigos que só vive dentro de um `if` é uma
// tabela que ninguém confere.

/** O TOKEN não carrega o escopo. `294` é literal: *"Para gerenciar anúncios, é
 *  preciso ter a permissão estendida ads_management"* (`:117`). `200` = *"Erro
 *  de permissão"* (`:110`). `10` = *"O app não tem permissão para executar essa
 *  ação"* (`:36`) — este é o único de nível de APP, e é o que de fato aponta
 *  para acesso avançado. */
export const CODIGOS_DE_PERMISSAO_AUSENTE = [10, 200, 294];

/** O token está bom; o USUÁRIO não tem função nesta conta de anúncios.
 *  `1815694` = *"O usuário não tem permissão para executar a ação"* (`:189`);
 *  `2654`/`1713092` = *"Sem permissão de gravação para esta conta de anúncios"*
 *  (`:139`); `100`/`33` = *"seu token de acesso não [foi] adicionado como um
 *  usuário do sistema com permissões adequadas à conta de anúncios"* (`:44`). */
export const CODIGOS_DE_ATIVO_NAO_AUTORIZADO = [1815694, 2654];
export const SUBCODIGOS_DE_ATIVO_NAO_AUTORIZADO = [33, 1713092];

/** A META bloqueou. `1404163` = *"Você não tem mais permissão para usar os
 *  produtos do Facebook a fim de anunciar"* (`:130`); `1404078` = *"Impedimos
 *  temporariamente você de executar esta ação"* (`:126`); `368` = *"The action
 *  attempted has been deemed abusive or is otherwise disallowed"*
 *  (`fontes/marketing-api-referencia-conta-de-anuncios.md:1004`). */
export const CODIGOS_DE_CONTA_RESTRITA = [368, 1404078, 1404163];

/** *"Token de acesso OAuth 2.0 inválido"* (`:106`). */
export const CODIGO_DE_TOKEN_INVALIDO = 190;

/**
 * DE QUEM É A CONTA MUDA A RESPOSTA — e a casa precisava saber dizer isso.
 *
 * ─── CONFERIDO CONTRA A FONTE EM 15/08/2026 ────────────────────────────────
 *
 * A regra não é "anúncio depende de App Review". Ela é literal e tem duas
 * metades, na MESMA frase da Meta:
 *
 *   *"Caso o app gerencie somente sua conta de anúncios, o acesso padrão e as
 *    permissões ads_read e ads_management serão suficientes. Se o app gerenciar
 *    contas de anúncios de outras pessoas, será necessário ter acesso avançado
 *    e as permissões ads_read e/ou ads_management."*
 *   — `fontes/marketing-api-autorizacao-e-niveis.md:73`
 *
 * E o acesso padrão não se pede, se tem: *"O acesso padrão será aprovado
 * automaticamente para todas as permissões e todos os recursos disponíveis para
 * os apps de negócios"* (`:80`). A análise só governa quem está de fora:
 * *"Somente as permissões aprovadas por meio do processo de análise podem ser
 * concedidas por usuários que não têm função no app"*
 * (`fontes/app-review-publicacao.md:27`).
 *
 * ⚠️ **O rótulo do painel NÃO está na nossa biblioteca.** O CEO leu "Pronto para
 * teste" em `ads_management`, `ads_read`, `pages_read_engagement` e
 * `pages_show_list` (app `1824373765214116`, captura de 14/08/2026 21:07). Esse
 * texto não aparece em nenhuma fonte capturada, então **não afirmamos aqui que
 * "Pronto para teste" = acesso padrão**. A conclusão de que a conta própria está
 * aberta hoje NÃO depende do rótulo: ela se sustenta nas três linhas acima, e
 * nenhuma permissão apareceu como "Acesso avançado" na captura.
 */
export const FRASE_DE_QUEM_E_A_CONTA =
  "Depois disso, o que vale depende de DE QUEM É A CONTA: se ela é do próprio dono do app (o CEO é administrador), "
  + "o acesso padrão já basta e é concedido automaticamente — o dono só reconecta pedindo o escopo, e isso leva minutos "
  + "(fontes/marketing-api-autorizacao-e-niveis.md:73,80). Se a conta é de TERCEIRO, aí sim entra o acesso avançado, "
  + "que passa pela análise do aplicativo (fontes/app-review-publicacao.md:27).";

/**
 * A EVIDÊNCIA, colada no fim de toda frase (guardrail 6).
 *
 * Sem ela, "a conta não está autorizada" é opinião da casa. Com ela, quem lê
 * consegue conferir contra a referência da Meta sem abrir o log — e consegue
 * descobrir que a nossa classificação errou, se ela errar.
 */
function evidencia(d: { code?: number; error_subcode?: number } | undefined, msg: string): string {
  const partes = [
    d?.code !== undefined ? `código ${d.code}` : null,
    d?.error_subcode !== undefined ? `subcódigo ${d.error_subcode}` : null,
  ].filter(Boolean);
  return ` [a Meta respondeu${partes.length ? ` ${partes.join(", ")}` : ""}: "${msg.slice(0, 200)}"]`;
}

/**
 * TRADUZ A RECUSA DA META NO GESTO QUE A RESOLVE.
 *
 * ⚠️ A ORDEM DOS TESTES É O DESENHO, não estilo. As mensagens da Meta se
 * sobrepõem — "not have permission" aparece nos três casos —, então o que é
 * ESPECÍFICO (código, subcódigo) decide antes do que é genérico (texto). Ler o
 * texto primeiro foi exatamente o defeito de 11/08-15/08: `/permission/` casava
 * com tudo e devolvia "espere o App Review" para uma conta própria.
 */
function traduzirErro<T>(e: unknown): ResultadoDeAnuncio<T> {
  if (!(e instanceof GraphApiError)) {
    return { ok: false, motivo: "erro_da_meta", erro: e instanceof Error ? e.message : "erro desconhecido" };
  }
  const d = e.detail;
  const msg = d?.message ?? e.message;
  const code = d?.code;
  const sub = d?.error_subcode;

  // Freio da casa: chega carimbado por ritmo.ts/cota-de-anuncios.ts, com a frase
  // já pronta. Vem ANTES de tudo para não ser confundido com falta de permissão.
  if (d?.type === TIPO_DE_RITMO_DA_CASA) {
    return { ok: false, motivo: "ritmo", erro: msg };
  }

  // 1. CONTA RESTRITA — o mais grave, e o único que nenhum código conserta.
  if (
    (code !== undefined && CODIGOS_DE_CONTA_RESTRITA.includes(code))
    || /restrict|restri[cç]|disabled|desabilitad|abusive|abusiv|deemed abusive|n[aã]o segue nossas regras|banned|blocked from advertising/i.test(msg)
  ) {
    return {
      ok: false,
      motivo: "conta_restrita",
      erro:
        "A Meta BLOQUEOU esta conta de anúncios (ou este usuário) para anunciar — não é permissão que falta, e reconectar não resolve. "
        + "O caminho é recorrer: Página Inicial do Suporte para Empresas → Visão geral do status da conta → (a conta) → \"O que você pode fazer\" → \"Pedir análise\". "
        + "A Meta diz que a análise leva ~48 h (fontes/recorrer-de-restricao.md)."
        + evidencia(d, msg),
    };
  }

  // 2. TOKEN MORTO — antes de permissão, senão vira "falta escopo" e a casa
  //    manda reconfigurar o app em vez de mandar o dono reconectar.
  if (code === CODIGO_DE_TOKEN_INVALIDO || /error validating access token|session has expired|token de acesso.*inv[aá]lid/i.test(msg)) {
    return {
      ok: false,
      motivo: "token_invalido",
      erro:
        "O acesso que este cliente concedeu morreu ou foi revogado. Nenhuma permissão está faltando — só o dono da conta reconecta, "
        + "pelo portal dele (\"Conexões\" → Conectar Facebook/Instagram). Refresh por API não conserta token morto."
        + evidencia(d, msg),
    };
  }

  // 3. ATIVO NÃO AUTORIZADO — o token vale, a conta é que está fora do alcance
  //    de quem o concedeu. Gesto humano, no Gerenciador de Negócios, e de
  //    minutos — nada a ver com plataforma.
  if (
    (code !== undefined && CODIGOS_DE_ATIVO_NAO_AUTORIZADO.includes(code))
    || (sub !== undefined && SUBCODIGOS_DE_ATIVO_NAO_AUTORIZADO.includes(sub))
    || /adicionad[oa] como um usu[aá]rio do sistema|must be (an )?admin|be admin of the ad account|does not have permission to (this|the) ad ?account|n[aã]o tem acesso a esta conta|sem permiss[aã]o de grava[cç][aã]o/i.test(msg)
  ) {
    return {
      ok: false,
      motivo: "ativo_nao_autorizado",
      erro:
        "O acesso é válido, mas quem o concedeu NÃO administra esta conta de anúncios. Isso não é App Review nem escopo: "
        + "é dar a função na conta — Gerenciador de Negócios → Configurações do negócio → Contas → Contas de anúncios → (a conta) → Adicionar pessoas → função de administrador. "
        + "Leva minutos e vale na hora."
        + evidencia(d, msg),
    };
  }

  // 4. PERMISSÃO AUSENTE NO TOKEN — e aqui a frase deixa de mentir. Ela nomeia
  //    o escopo, manda MEDIR antes de esperar (permissoes-do-token.ts) e só cita
  //    acesso avançado para o caso em que ele realmente se aplica: conta de
  //    terceiro.
  if (/permission|permiss[aã]o|ads_management|ads_read|not authorized|n[aã]o autorizad|requires|estendida/i.test(msg)) {
    const escopo = /ads_management/i.test(msg)
      ? "ads_management"
      : /ads_read/i.test(msg) ? "ads_read" : "ads_management/ads_read";
    return {
      ok: false,
      motivo: "sem_permissao",
      erro:
        `O acesso usado não carrega ${escopo}. Antes de esperar qualquer coisa da Meta, MEÇA: \`permissoesDoToken\` + \`diagnosticarConta\` dizem, com uma leitura e sem tentativa contra a conta, se o escopo está no token e se vale para esta conta. `
        + FRASE_DE_QUEM_E_A_CONTA
        + evidencia(d, msg),
    };
  }

  // Não classificado. A frase é a da própria Meta, crua — e o código/subcódigo
  // vão junto, porque é com eles que se procura na referência. Inventar uma
  // tradução para o que não reconhecemos seria o mesmo defeito de novo.
  const carimbo = d?.code !== undefined || d?.error_subcode !== undefined
    ? ` (código ${d?.code ?? "?"}${d?.error_subcode !== undefined ? `, subcódigo ${d.error_subcode}` : ""})`
    : "";
  return { ok: false, motivo: "erro_da_meta", erro: msg + carimbo };
}

/** As contas de anúncio que o token alcança. É o primeiro passo de qualquer
 *  gestão de tráfego: sem conta, não há onde criar nada. */
export async function listarContasDeAnuncio(
  workspaceId: string,
  connectionId: string,
): Promise<ResultadoDeAnuncio<ContaDeAnuncio[]>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<{ id: string; name?: string; currency?: string; account_status?: number }> }>(
      "me/adaccounts", conn.token, { fields: "id,name,currency,account_status", limit: 50 },
      { operacao: "listar_contas" },
    );
    const alcancadas = (r.data ?? []).map((c) => ({
      id: c.id, nome: c.name ?? c.id, moeda: c.currency ?? "BRL", status: c.account_status ?? 0,
    }));
    // "O token não alcança conta nenhuma" e "o cliente não autorizou nenhuma"
    // são estados DIFERENTES, e a ação que cada um pede é diferente: um é
    // "peça acesso ao cliente", o outro é "ele precisa marcar na tela dele".
    if (alcancadas.length === 0) {
      return { ok: false, motivo: "sem_conta", erro: "Nenhuma conta de anúncio encontrada nesta conexão. O cliente precisa dar acesso à conta de anúncios dele." };
    }
    // A MESMA TRAVA DE `ads-leitura.ts` (06/08/2026): o que o token alcança não
    // é o que a agência pode usar. Aqui pesa ainda mais que na leitura, porque
    // esta lista é o menu de onde a campanha vai ser criada.
    const { autorizados, listaVazia } = await filtrarAutorizados(
      workspaceId, conn.clientId, "ad_account", alcancadas, (c) => c.id,
    );
    if (listaVazia) return { ok: false, motivo: "sem_autorizacao", erro: FRASE_SEM_AUTORIZACAO };
    if (autorizados.length === 0) {
      return { ok: false, motivo: "sem_autorizacao", erro: "Nenhuma das contas que este acesso alcança está autorizada pelo cliente." };
    }
    return { ok: true, dados: autorizados };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface PlanoDeCampanha {
  /** "act_..." — a conta de anúncio do CLIENTE. */
  contaId: string;
  nome: string;
  /** O que a campanha persegue. Mapeado para o objetivo da Meta. */
  objetivo: "trafego" | "alcance" | "engajamento" | "conversas" | "leads";
  /** Reais por dia. Conferido contra `tetoAprovadoBRL` E contra o teto da casa. */
  orcamentoDiarioBRL: number;
  /** O teto que o CLIENTE aprovou, por escrito. Sem ele não se cria nada. */
  tetoAprovadoBRL: number;
}

const OBJETIVO_META: Record<PlanoDeCampanha["objetivo"], string> = {
  trafego: "OUTCOME_TRAFFIC",
  alcance: "OUTCOME_AWARENESS",
  engajamento: "OUTCOME_ENGAGEMENT",
  conversas: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
};

/**
 * Confere o orçamento ANTES de qualquer chamada. Determinístico, sem rede.
 *
 * Separado de propósito: é a única parte que precisa estar certa mesmo se a
 * Meta mudar, se o token vencer ou se a rede cair — e a única que dá para
 * testar sem tocar em dinheiro de ninguém.
 */
export function conferirOrcamento(plano: {
  orcamentoDiarioBRL: number;
  tetoAprovadoBRL: number;
}): { ok: boolean; erro?: string } {
  const v = plano.orcamentoDiarioBRL;
  if (!Number.isFinite(v) || v <= 0) {
    return { ok: false, erro: "orçamento diário inválido" };
  }
  if (v < PISO_DIARIO_BRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} está abaixo do mínimo da Meta (R$ ${PISO_DIARIO_BRL}) — a campanha não entregaria` };
  }
  if (!Number.isFinite(plano.tetoAprovadoBRL) || plano.tetoAprovadoBRL <= 0) {
    return { ok: false, erro: "não há teto aprovado pelo cliente — sem isso não se cria campanha" };
  }
  if (v > plano.tetoAprovadoBRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} passa do teto que o cliente aprovou (R$ ${plano.tetoAprovadoBRL})` };
  }
  if (v > TETO_DIARIO_ABSOLUTO_BRL) {
    return { ok: false, erro: `orçamento diário de R$ ${v} passa do teto desta agência (R$ ${TETO_DIARIO_ABSOLUTO_BRL})` };
  }
  return { ok: true };
}

/**
 * A TRAVA DE CONTA NO CAMINHO DE ESCRITA (06/08/2026).
 *
 * Criar campanha, conjunto ou anúncio numa conta que o cliente não autorizou é
 * pior do que lê-la: é a agência mexendo no ativo de um terceiro. A conferência
 * é derivada do dono do TOKEN (`conn.clientId`), nunca de um `clientId` que o
 * chamador tenha passado, e roda ANTES de qualquer POST na Meta.
 */
async function recusarContaNaoAutorizada(
  workspaceId: string,
  clientId: string | null,
  contaId: string,
): Promise<ResultadoDeAnuncio<never> | null> {
  if (await ativoAutorizado(workspaceId, clientId, "ad_account", contaId)) return null;
  return {
    ok: false,
    motivo: "sem_autorizacao",
    erro: `A conta ${normalizarId("ad_account", contaId)} não está na lista de contas autorizadas pelo cliente. Nada foi criado nem alterado.`,
  };
}

/**
 * A MESMA TRAVA, PARA A PÁGINA (15/08/2026).
 *
 * A conta de anúncios passava por `MetaAtivoAutorizado` desde 06/08. A PÁGINA
 * não passava por nada: ela chegava crua de `montarCriativo` e ia direto para
 * `object_story_spec.page_id`. Quem assina o anúncio — a marca que aparece para
 * o público — não era conferida, e o dono do anúncio era. Faltava a metade que
 * o cliente enxerga.
 *
 * A conferência mora AQUI, dentro da função que usa o id, e não no chamador.
 * Conferir no chamador deixa a próxima porta descoberta — foi assim que a
 * publicação orgânica (`publishPost`) ficou de fora da trava de ativos em
 * 06/08/2026, e a lição custou uma auditoria inteira.
 *
 * `clientId` é DERIVADO do token que vai ser usado (`conn.clientId`), nunca
 * recebido de quem chamou: a pergunta é "de quem é ESTE token?", não "de quem o
 * chamador disse que é". Mesma regra de comparação de id (`normalizarId`) —
 * duas gramáticas de id na mesma trava é meia trava.
 */
async function recusarPaginaNaoAutorizada(
  workspaceId: string,
  clientId: string | null,
  pageId: string | undefined,
): Promise<ResultadoDeAnuncio<never> | null> {
  const alvo = normalizarId("page", pageId ?? "");
  if (!alvo) {
    return {
      ok: false,
      motivo: "sem_autorizacao",
      erro: "anúncio sem Página não é anúncio: é a Página que assina a peça para o público. Nada foi criado.",
    };
  }
  if (await ativoAutorizado(workspaceId, clientId, "page", alvo)) return null;
  return {
    ok: false,
    motivo: "sem_autorizacao",
    erro: `A Página ${alvo} não está na lista de ativos que este cliente autorizou — e é ela que assinaria o anúncio. `
      + `Nada foi criado nem alterado. Onde resolver: ${ONDE_MARCAR_OS_ATIVOS}.`,
  };
}

/**
 * Cria a campanha — SEMPRE PAUSADA.
 *
 * `status: "PAUSED"` é literal e não é parâmetro. Uma campanha criada ativa por
 * um processo automático é dinheiro do cliente saindo sem que ninguém tenha
 * dito "pode ir".
 */
export async function criarCampanhaPausada(
  workspaceId: string,
  connectionId: string,
  plano: PlanoDeCampanha,
): Promise<ResultadoDeAnuncio<{ campaignId: string }>> {
  const conferido = conferirOrcamento(plano);
  if (!conferido.ok) return { ok: false, motivo: "orcamento_invalido", erro: conferido.erro };

  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };
  const barrado = await recusarContaNaoAutorizada(workspaceId, conn.clientId, plano.contaId);
  if (barrado) return barrado;

  try {
    const r = await graphPost<{ id: string }>(`${plano.contaId}/campaigns`, conn.token, {
      name: plano.nome.slice(0, 200),
      objective: OBJETIVO_META[plano.objetivo],
      status: "PAUSED",
      special_ad_categories: "[]",
      // Orçamento na campanha (CBO): a Meta distribui entre os conjuntos e o
      // teto vale para o todo. Orçamento por conjunto multiplicaria o gasto
      // pelo número de conjuntos — o jeito mais fácil de estourar sem perceber.
      daily_budget: String(Math.round(plano.orcamentoDiarioBRL * 100)), // centavos
    }, { operacao: "criar_campanha_pausada", conta: plano.contaId });
    return { ok: true, dados: { campaignId: r.id } };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface PublicoDoConjunto {
  /** Cidade em texto — a Meta resolve para o id dela. Ex.: "Campinas, SP". */
  cidade: string | null;
  /** Raio em km ao redor da cidade. O caso do padeiro é 5 km, não o Brasil. */
  raioKm: number;
  idadeMin: number;
  idadeMax: number;
  /** Ids de interesse da Meta, já resolvidos. Vazio = sem segmentação por
   *  interesse, que é melhor do que segmentar por um palpite. */
  interesses: Array<{ id: string; name: string }>;
}

/** Raio máximo. Acima disto não é "o bairro do padeiro" — é dinheiro jogado em
 *  gente que nunca vai atravessar a cidade para comprar pão. */
export const RAIO_MAX_KM = 50;
export const RAIO_MIN_KM = 1;

/**
 * Resolve uma cidade em id da Meta. Sem chute: se a Meta não encontrar, a
 * segmentação geográfica é OMITIDA e o conjunto entrega no país inteiro — o que
 * o chamador precisa saber, e por isso o retorno diz quando não achou.
 */
export async function buscarCidade(
  workspaceId: string,
  connectionId: string,
  termo: string,
): Promise<ResultadoDeAnuncio<{ key: string; name: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };
  // Sem trava de conta aqui de propósito: `search` é um dicionário da própria
  // Meta (cidades/interesses), não toca conta de anúncio nenhuma.
  try {
    const r = await graphGet<{ data?: Array<{ key: string; name: string; country_code?: string }> }>(
      "search", conn.token,
      { type: "adgeolocation", location_types: '["city"]', q: termo.slice(0, 100), limit: 5 },
      { operacao: "buscar_cidade" },
    );
    const br = r.data?.find((c) => c.country_code === "BR") ?? r.data?.[0];
    if (!br) return { ok: false, motivo: "sem_conta", erro: `A Meta não conhece a cidade "${termo}"` };
    return { ok: true, dados: { key: br.key, name: br.name } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Interesses reais da Meta a partir de palavras do briefing. Só entra no
 *  conjunto o que a Meta confirmou existir — interesse inventado é rejeitado
 *  pela API e derruba a criação inteira. */
export async function buscarInteresses(
  workspaceId: string,
  connectionId: string,
  termos: string[],
): Promise<Array<{ id: string; name: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return [];
  const achados: Array<{ id: string; name: string }> = [];
  for (const termo of termos.slice(0, 5)) {
    try {
      const r = await graphGet<{ data?: Array<{ id: string; name: string }> }>(
        "search", conn.token, { type: "adinterest", q: termo.slice(0, 80), limit: 1 },
        { operacao: "buscar_interesse" },
      );
      const i = r.data?.[0];
      if (i && !achados.some((a) => a.id === i.id)) achados.push({ id: i.id, name: i.name });
    } catch { /* um termo que a Meta não conhece simplesmente não entra */ }
  }
  return achados;
}

/**
 * Cria o CONJUNTO DE ANÚNCIOS — pausado, como tudo aqui.
 *
 * Sem conjunto, a campanha não entrega nada: ela é só um envelope com verba.
 * Foi exatamente o buraco do raio-X de 02/08/2026 — a casa criava a campanha,
 * dizia "tráfego pago pronto", e nada rodava.
 *
 * O orçamento NÃO vai aqui. Ele mora na campanha (CBO) de propósito: orçamento
 * por conjunto multiplica o gasto pelo número de conjuntos, e é o jeito mais
 * fácil de estourar o teto sem ninguém perceber.
 */
export async function criarConjuntoPausado(
  workspaceId: string,
  connectionId: string,
  input: {
    contaId: string;
    campaignId: string;
    nome: string;
    objetivo: PlanoDeCampanha["objetivo"];
    publico: PublicoDoConjunto;
    /** Id da página do Facebook — obrigatório para os objetivos de conversa. */
    pageId?: string;
  },
): Promise<ResultadoDeAnuncio<{ adSetId: string; segmentouGeografia: boolean }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };
  const barrado = await recusarContaNaoAutorizada(workspaceId, conn.clientId, input.contaId);
  if (barrado) return barrado;
  // O objetivo "conversas" injeta `promoted_object.page_id` mais abaixo: é a
  // segunda porta pela qual uma Página chega à Meta neste arquivo. Hoje nenhum
  // chamador manda `pageId` aqui — e é justamente por isso que a trava entra
  // agora, antes de o primeiro chamador aparecer e ninguém lembrar.
  if (input.pageId) {
    const paginaBarrada = await recusarPaginaNaoAutorizada(workspaceId, conn.clientId, input.pageId);
    if (paginaBarrada) return paginaBarrada;
  }

  const p = input.publico;
  const raio = Math.max(RAIO_MIN_KM, Math.min(RAIO_MAX_KM, Math.round(p.raioKm || 10)));

  let geo: Record<string, unknown> = { countries: ["BR"] };
  let segmentouGeografia = false;
  if (p.cidade) {
    const cidade = await buscarCidade(workspaceId, connectionId, p.cidade);
    if (cidade.ok && cidade.dados) {
      geo = { cities: [{ key: cidade.dados.key, radius: raio, distance_unit: "kilometer" }] };
      segmentouGeografia = true;
    }
    // Cidade não resolvida: cai no país. Não inventamos coordenada.
  }

  const targeting: Record<string, unknown> = {
    geo_locations: geo,
    age_min: Math.max(18, Math.min(65, p.idadeMin || 18)),
    age_max: Math.max(18, Math.min(65, p.idadeMax || 65)),
    ...(p.interesses.length > 0
      ? { flexible_spec: [{ interests: p.interesses.map((i) => ({ id: i.id, name: i.name })) }] }
      : {}),
  };

  const corpo: Record<string, string> = {
    name: input.nome.slice(0, 200),
    campaign_id: input.campaignId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: METAS[input.objetivo],
    targeting: JSON.stringify(targeting),
  };
  if (input.objetivo === "conversas" && input.pageId) {
    corpo.destination_type = "MESSENGER";
    corpo.promoted_object = JSON.stringify({ page_id: input.pageId });
  }

  try {
    const r = await graphPost<{ id: string }>(`${input.contaId}/adsets`, conn.token, corpo,
      { operacao: "criar_conjunto_pausado", conta: input.contaId });
    return { ok: true, dados: { adSetId: r.id, segmentouGeografia } };
  } catch (e) {
    return traduzirErro(e);
  }
}

const METAS: Record<PlanoDeCampanha["objetivo"], string> = {
  trafego: "LINK_CLICKS",
  alcance: "REACH",
  engajamento: "POST_ENGAGEMENT",
  conversas: "CONVERSATIONS",
  leads: "LEAD_GENERATION",
};

/**
 * Cria o ANÚNCIO: o criativo e o anúncio que o aponta. Pausado.
 *
 * `imagemUrl` precisa ser alcançável pelos servidores da Meta — é o mesmo link
 * assinado que a publicação orgânica usa.
 */
export async function criarAnuncioPausado(
  workspaceId: string,
  connectionId: string,
  input: {
    contaId: string;
    adSetId: string;
    pageId: string;
    nome: string;
    imagemUrl: string;
    /** Texto principal — o que aparece acima da imagem. */
    texto: string;
    titulo: string;
    descricao?: string;
    /** Para onde o clique leva. Sem destino não há tráfego a comprar. */
    link: string;
    cta?: string;
  },
): Promise<ResultadoDeAnuncio<{ adId: string; creativeId: string }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada" };
  const barrado = await recusarContaNaoAutorizada(workspaceId, conn.clientId, input.contaId);
  if (barrado) return barrado;
  // A PÁGINA TAMBÉM. Ela vai para `object_story_spec.page_id` logo abaixo — é a
  // marca que aparece para o público — e até 15/08/2026 era o único ativo desta
  // função que não passava por lista nenhuma.
  const paginaBarrada = await recusarPaginaNaoAutorizada(workspaceId, conn.clientId, input.pageId);
  if (paginaBarrada) return paginaBarrada;
  if (!input.imagemUrl || !input.link) {
    return { ok: false, motivo: "orcamento_invalido", erro: "anúncio sem imagem ou sem destino não é anúncio" };
  }

  try {
    const criativo = await graphPost<{ id: string }>(`${input.contaId}/adcreatives`, conn.token, {
      name: `${input.nome} — criativo`.slice(0, 200),
      object_story_spec: JSON.stringify({
        page_id: input.pageId,
        link_data: {
          picture: input.imagemUrl,
          link: input.link,
          message: input.texto.slice(0, 2000),
          name: input.titulo.slice(0, 100),
          ...(input.descricao ? { description: input.descricao.slice(0, 200) } : {}),
          call_to_action: { type: CTA_VALIDOS.includes(input.cta ?? "") ? input.cta : "LEARN_MORE" },
        },
      }),
    }, { operacao: "criar_criativo", conta: input.contaId });

    const anuncio = await graphPost<{ id: string }>(`${input.contaId}/ads`, conn.token, {
      name: input.nome.slice(0, 200),
      adset_id: input.adSetId,
      creative: JSON.stringify({ creative_id: criativo.id }),
      status: "PAUSED",
    }, { operacao: "criar_anuncio_pausado", conta: input.contaId });

    return { ok: true, dados: { adId: anuncio.id, creativeId: criativo.id } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Os CTAs que a Meta aceita e que fazem sentido para os clientes desta casa.
 *  Lista fechada: CTA inválido derruba a criação inteira do criativo. */
export const CTA_VALIDOS = [
  "LEARN_MORE", "SHOP_NOW", "BOOK_TRAVEL", "CONTACT_US", "MESSAGE_PAGE",
  "WHATSAPP_MESSAGE", "CALL_NOW", "GET_QUOTE", "SIGN_UP", "SUBSCRIBE",
];

/** Sobe conjunto e anúncio para ACTIVE junto com a campanha. Uma campanha ativa
 *  com conjunto pausado não entrega — e a conta parece "ligada" para quem olha. */
export async function ativarFilhos(
  workspaceId: string,
  connectionId: string,
  ids: { adSetId?: string | null; adId?: string | null; contaId?: string },
): Promise<void> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return;
  for (const id of [ids.adSetId, ids.adId]) {
    if (!id) continue;
    // A operação é declarada: o catálogo (travas.ts) é o que autoriza a
    // escrita, e é dele que sai o peso de 3 pontos na cota da conta.
    await graphPost(id, conn.token, { status: "ACTIVE" }, { operacao: "ativar", conta: ids.contaId })
      .catch(() => { /* best-effort */ });
  }
}

/**
 * Ativa uma campanha. É a única função deste arquivo que faz dinheiro sair.
 *
 * Recebe `autorizadoPor` porque a ativação precisa ter dono. Uma chamada que
 * não sabe dizer quem autorizou é uma chamada que não deveria acontecer.
 */
export async function ativarCampanha(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  autorizadoPor: string,
  contaId?: string,
): Promise<ResultadoDeAnuncio<{ ativada: true }>> {
  if (!autorizadoPor?.trim()) {
    return { ok: false, motivo: "orcamento_invalido", erro: "ativação sem autorizador identificado" };
  }
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    await graphPost(campaignId, conn.token, { status: "ACTIVE" },
      { operacao: "ativar", conta: contaId });
    return { ok: true, dados: { ativada: true } };
  } catch (e) {
    return traduzirErro(e);
  }
}

/** Pausa. Nunca falha por falta de autorização — parar de gastar é sempre
 *  permitido, e exigir cerimônia para frear é como não ter freio. */
export async function pausarCampanha(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  contaId?: string,
): Promise<ResultadoDeAnuncio<{ pausada: true }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };
  try {
    await graphPost(campaignId, conn.token, { status: "PAUSED" },
      { operacao: "pausar", conta: contaId });
    return { ok: true, dados: { pausada: true } };
  } catch (e) {
    return traduzirErro(e);
  }
}

export interface DesempenhoPago {
  gastoBRL: number;
  impressoes: number;
  cliques: number;
  alcance: number;
  /** Custo por clique, calculado aqui — nunca estimado. */
  cpcBRL: number | null;
}

// ─── Cache do desempenho ────────────────────────────────────────────────────
// O motor da esteira varre as campanhas ATIVAS a cada 5 minutos e chama
// `lerDesempenho` uma vez por campanha. Com 50 campanhas isso é 600 chamadas
// por hora contra a MESMA conta de anúncios, no MESMO caso de uso — e o BUC da
// Marketing API é por conta de anúncios, compartilhado por todos os endpoints
// do caso de uso (fontes/graph-api-limites-de-taxa.md). É a assinatura exata do
// que restringiu a conta da agência em 03/08/2026.
//
// Gasto de anúncio não muda de forma útil em cinco minutos — a própria Meta
// consolida com atraso. Com 15 minutos de cache, três de cada quatro varreduras
// não tocam a rede: 50 campanhas caem de 600 para 200 chamadas/hora, folgado
// abaixo do piso de insights em development_access (600 + 400 × anúncios
// ativos por hora, mesma fonte).
//
// ✅ 06/08/2026: SAIU DA MEMÓRIA. O aviso que estava aqui — "todo deploy
// esvazia, e é por processo" — descrevia um freio que a casa perdia várias
// vezes por dia: cada publish devolvia a varredura inteira à rede, contra a
// mesma conta de anúncios que a Meta já restringiu uma vez. Agora o resultado
// mora no volume (`./cache-no-banco.ts`): atravessa deploy e réplica, e quem já
// pagou a chamada paga por todas as instâncias durante o TTL.
export const TTL_DO_DESEMPENHO_MS = 15 * 60_000;

/** Prefixo das chaves desta camada — permite limpar o desempenho sem varrer o
 *  cache da leitura de Instagram. */
const PREFIXO_DO_DESEMPENHO = "desempenho:";

/** Para teste e para quando a campanha muda de estado. */
export async function limparCacheDeDesempenho(): Promise<void> {
  await limparCacheNoBanco(PREFIXO_DO_DESEMPENHO);
}

/**
 * O que a campanha gastou e rendeu. É o número que entra no relatório mensal.
 *
 * Devolve `ok: false` quando não conseguiu ler, em vez de zeros: zero gasto é
 * uma informação (a campanha não entregou); "não consegui medir" é outra.
 * Confundir as duas num relatório de tráfego pago é o erro mais caro possível.
 *
 * Passa pelo balde de `graph.ts` como todo o resto — não existe mais caminho de
 * anúncio que fale com a Meta sem ser contado.
 */
export async function lerDesempenho(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  periodo: { desde: string; ate: string },
  opts: { ignorarCache?: boolean; contaId?: string } = {},
): Promise<ResultadoDeAnuncio<DesempenhoPago>> {
  const chave = `${connectionId}:${campaignId}:${periodo.desde}:${periodo.ate}`;
  if (!opts.ignorarCache) {
    const hit = await lerDoCacheNoBanco<DesempenhoPago>(PREFIXO_DO_DESEMPENHO + chave);
    if (hit) return { ok: true, dados: hit };
  }

  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<Record<string, string>> }>(
      `${campaignId}/insights`, conn.token,
      {
        fields: "spend,impressions,clicks,reach",
        time_range: JSON.stringify({ since: periodo.desde, until: periodo.ate }),
      },
      { operacao: "ler_desempenho", conta: opts.contaId },
    );
    const linha = r.data?.[0];
    if (!linha) {
      return { ok: false, motivo: "erro_da_meta", erro: "a Meta não devolveu dados para este período" };
    }
    const gasto = Number(linha.spend ?? 0);
    const cliques = Number(linha.clicks ?? 0);
    const dados: DesempenhoPago = {
      gastoBRL: gasto,
      impressoes: Number(linha.impressions ?? 0),
      cliques,
      alcance: Number(linha.reach ?? 0),
      cpcBRL: cliques > 0 ? Number((gasto / cliques).toFixed(2)) : null,
    };
    // Só sucesso entra no cache: guardar um erro por 15 min esconderia a
    // reconexão ou a liberação da conta que acabou de acontecer.
    await guardarNoCacheNoBanco(PREFIXO_DO_DESEMPENHO + chave, dados, TTL_DO_DESEMPENHO_MS);
    return { ok: true, dados };
  } catch (e) {
    return traduzirErro(e);
  }
}
