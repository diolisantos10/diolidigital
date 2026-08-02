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
// `ads_management` e `ads_read` são permissões AVANÇADAS: sem App Review
// aprovado, a Meta recusa tudo abaixo mesmo com token válido. As funções
// devolvem esse motivo em português em vez de um erro cru da Graph.

import { graphGet, graphPost, GraphApiError } from "./graph";
import { loadConnectionToken } from "./connections";

/** Teto absoluto da casa, em reais por dia, independente do que for pedido.
 *  É a última linha de defesa: se todo o resto falhar, o estrago é limitado. */
export const TETO_DIARIO_ABSOLUTO_BRL = Number(process.env.ADS_TETO_DIARIO_BRL ?? 500);

/** Piso da Meta para orçamento diário. Abaixo disto a campanha nem entrega. */
export const PISO_DIARIO_BRL = 6;

export interface ResultadoDeAnuncio<T = unknown> {
  ok: boolean;
  dados?: T;
  erro?: string;
  /** `sem_permissao` = App Review pendente. É o caso mais comum, e é do CEO. */
  motivo?: "sem_permissao" | "sem_conta" | "orcamento_invalido" | "erro_da_meta" | "sem_conexao";
}

export interface ContaDeAnuncio {
  id: string;          // "act_123456"
  nome: string;
  moeda: string;
  status: number;      // 1 = ativa
}

function traduzirErro<T>(e: unknown): ResultadoDeAnuncio<T> {
  if (e instanceof GraphApiError) {
    const msg = e.detail?.message ?? e.message;
    // A Meta responde permissão faltando de várias formas; todas significam a
    // mesma coisa para quem opera: falta o App Review.
    if (/permission|ads_management|ads_read|not authorized|requires/i.test(msg)) {
      return {
        ok: false,
        motivo: "sem_permissao",
        erro: "A Meta ainda não liberou as permissões de anúncio deste app (ads_management/ads_read). Isso depende do App Review — não é erro de configuração.",
      };
    }
    return { ok: false, motivo: "erro_da_meta", erro: msg };
  }
  return { ok: false, motivo: "erro_da_meta", erro: e instanceof Error ? e.message : "erro desconhecido" };
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
    );
    const contas = (r.data ?? []).map((c) => ({
      id: c.id, nome: c.name ?? c.id, moeda: c.currency ?? "BRL", status: c.account_status ?? 0,
    }));
    if (contas.length === 0) {
      return { ok: false, motivo: "sem_conta", erro: "Nenhuma conta de anúncio encontrada nesta conexão. O cliente precisa dar acesso à conta de anúncios dele." };
    }
    return { ok: true, dados: contas };
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
    });
    return { ok: true, dados: { campaignId: r.id } };
  } catch (e) {
    return traduzirErro(e);
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
): Promise<ResultadoDeAnuncio<{ ativada: true }>> {
  if (!autorizadoPor?.trim()) {
    return { ok: false, motivo: "orcamento_invalido", erro: "ativação sem autorizador identificado" };
  }
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    await graphPost(campaignId, conn.token, { status: "ACTIVE" });
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
): Promise<ResultadoDeAnuncio<{ pausada: true }>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };
  try {
    await graphPost(campaignId, conn.token, { status: "PAUSED" });
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

/**
 * O que a campanha gastou e rendeu. É o número que entra no relatório mensal.
 *
 * Devolve `ok: false` quando não conseguiu ler, em vez de zeros: zero gasto é
 * uma informação (a campanha não entregou); "não consegui medir" é outra.
 * Confundir as duas num relatório de tráfego pago é o erro mais caro possível.
 */
export async function lerDesempenho(
  workspaceId: string,
  connectionId: string,
  campaignId: string,
  periodo: { desde: string; ate: string },
): Promise<ResultadoDeAnuncio<DesempenhoPago>> {
  const conn = await loadConnectionToken(workspaceId, connectionId);
  if (!conn) return { ok: false, motivo: "sem_conexao", erro: "Conexão Meta não encontrada ou token inválido" };

  try {
    const r = await graphGet<{ data?: Array<Record<string, string>> }>(
      `${campaignId}/insights`, conn.token,
      {
        fields: "spend,impressions,clicks,reach",
        time_range: JSON.stringify({ since: periodo.desde, until: periodo.ate }),
      },
    );
    const linha = r.data?.[0];
    if (!linha) {
      return { ok: false, motivo: "erro_da_meta", erro: "a Meta não devolveu dados para este período" };
    }
    const gasto = Number(linha.spend ?? 0);
    const cliques = Number(linha.clicks ?? 0);
    return {
      ok: true,
      dados: {
        gastoBRL: gasto,
        impressoes: Number(linha.impressions ?? 0),
        cliques,
        alcance: Number(linha.reach ?? 0),
        cpcBRL: cliques > 0 ? Number((gasto / cliques).toFixed(2)) : null,
      },
    };
  } catch (e) {
    return traduzirErro(e);
  }
}
