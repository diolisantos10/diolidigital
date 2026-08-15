// PERMISSÕES DO TOKEN — o que este token pode DE VERDADE, ativo por ativo.
//
// ─── POR QUE ISTO EXISTE (parecer do especialista `meta`, 11/08/2026) ───────
//
// A casa não sabia responder "podemos publicar no Instagram deste cliente?" sem
// **tentar publicar**. E tentar é exatamente o que não se pode fazer: a Meta
// audita a ATIVIDADE do app, tentativa recusada conta como tentativa, e foi esse
// padrão que restringiu a conta de anúncios da agência em 03/08/2026.
//
// Existe uma resposta que **não é uma tentativa**: `debug_token`. Ela é leitura
// pura, não toca em ativo nenhum, e o campo `granular_scopes` diz **qual
// permissão vale para qual ativo** — que é a pergunta exata, e não a pergunta
// aproximada que a casa vinha fazendo.
//
//   fonte: docs/plataformas/meta/fontes/tokens-de-acesso.md
//   parecer: `meta`, 11/08/2026, §1 ("o teste decisivo custa uma leitura")
//
// ─── A CONFUSÃO QUE ISTO DESFAZ, E QUE JÁ CUSTOU CARO ──────────────────────
//
// Havia dois enganos empilhados, e eles se parecem:
//
//   1. **"o escopo está no token, então pode"** — não. O escopo no token prova
//      que a chamada PASSARIA, não que ela é permitida. Foi essa confusão que
//      gerou o incidente de 03/08.
//   2. **"o escopo está no token, então vale para todos os ativos"** — também
//      não, e este é mais sutil. `scopes` é a lista larga; `granular_scopes` diz
//      que `instagram_content_publish` pode valer para o perfil da própria casa
//      e **não valer** para o perfil do cliente, no MESMO token.
//
// Este arquivo responde (2) com medição. **Ele não responde (1)** — e não tenta:
// a autorização de publicar em nome de cliente é decisão do CEO e continua na
// `trava-de-publicacao.ts`. Uma leitura de permissão nunca vira licença aqui.
//
// ─── FAIL-CLOSED, E O TERCEIRO ESTADO ──────────────────────────────────────
//
// `debug_token` pode falhar — app secret ausente, rede fora, token morto. Nesse
// caso a resposta é **"não medido"**, que é diferente de "não pode" e diferente
// de "pode". Colapsar os três em um booleano seria a mesma classe de erro que
// fazia `cidade: null` virar "Brasil inteiro".

import { graphGet } from "./graph";
import { resolveMetaAppCredentials } from "./config";
import { loadConnectionToken } from "./connections";
// A MESMA regra de id canônico da trava de alcance — importada, não recopiada.
// Duas regras para "que ativo é este" divergem no dia em que uma é corrigida.
import { normalizarId } from "./ativos-autorizados";

/** Uma permissão vale para um ativo, não vale, ou ninguém mediu. O terceiro
 *  estado é o que impede "não consegui perguntar" de virar "pode". */
export type EstadoDaPermissao = "vale" | "nao_vale" | "nao_medido";

export interface PermissoesDoToken {
  /** `false` quando a leitura não pôde ser feita. Tudo abaixo vira
   *  `nao_medido`, e nada aqui autoriza coisa alguma. */
  medido: boolean;
  /** Por que não foi medido, em português. Nulo quando foi. */
  porQueNaoMedi: string | null;
  /** A lista larga do token — o que ele carrega, sem dizer para qual ativo. */
  escopos: string[];
  /** O que realmente importa: permissão → ativos para os quais ela vale.
   *  Vazio para uma permissão presente em `escopos` significa que a Meta não
   *  restringiu por ativo — não significa "nenhum ativo". */
  porAtivo: Record<string, string[]>;
  /** O token está vivo? Token morto não é permissão negada. */
  valido: boolean;
}

const NAO_MEDIDO: Omit<PermissoesDoToken, "porQueNaoMedi"> = {
  medido: false, escopos: [], porAtivo: {}, valido: false,
};

interface RespostaDebugToken {
  data?: {
    is_valid?: boolean;
    scopes?: string[];
    granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
  };
}

/**
 * Lê o que o token pode, ativo por ativo. **Leitura pura** — nenhuma escrita,
 * nenhum ativo tocado.
 *
 * Nunca lança: uma leitura que falha não pode derrubar quem a consulta nem,
 * muito menos, ser interpretada como liberação.
 */
export async function permissoesDoToken(
  workspaceId: string,
  connectionId: string,
): Promise<PermissoesDoToken> {
  const conexao = await loadConnectionToken(workspaceId, connectionId).catch(() => null);
  if (!conexao) {
    return { ...NAO_MEDIDO, porQueNaoMedi: "não encontrei a conexão, ou o token guardado não abriu" };
  }

  // `debug_token` exige um token de APP (`app_id|app_secret`) como inspetor —
  // o próprio token não pode se auditar.
  const cred = await resolveMetaAppCredentials(workspaceId).catch(() => null);
  if (!cred) {
    return {
      ...NAO_MEDIDO,
      porQueNaoMedi: "faltam as credenciais do aplicativo (META_APP_ID/META_APP_SECRET) — sem elas a Meta não deixa inspecionar token nenhum",
    };
  }

  const resposta = await graphGet<RespostaDebugToken>(
    "debug_token",
    `${cred.appId}|${cred.appSecret}`,
    { input_token: conexao.token },
  ).catch((e: unknown) => {
    return { __erro: e instanceof Error ? e.message : String(e) } as RespostaDebugToken & { __erro: string };
  });

  const erro = (resposta as { __erro?: string }).__erro;
  if (erro) {
    return { ...NAO_MEDIDO, porQueNaoMedi: `a Meta recusou a inspeção do token: ${erro.slice(0, 200)}` };
  }

  const dados = resposta.data ?? {};
  const porAtivo: Record<string, string[]> = {};
  for (const g of dados.granular_scopes ?? []) {
    if (!g.scope) continue;
    porAtivo[g.scope] = Array.isArray(g.target_ids) ? g.target_ids : [];
  }

  return {
    medido: true,
    porQueNaoMedi: null,
    escopos: Array.isArray(dados.scopes) ? dados.scopes : [],
    porAtivo,
    valido: dados.is_valid === true,
  };
}

/**
 * Esta permissão vale para ESTE ativo?
 *
 * A regra da Meta, e ela é sutil: quando `granular_scopes` traz a permissão com
 * uma lista de ativos, **só aqueles ativos** estão cobertos. Quando traz a
 * permissão com lista vazia, a Meta não restringiu por ativo — e aí vale o que
 * `scopes` diz. Quando não traz a permissão de jeito nenhum, ela não está no
 * token.
 */
export function valeParaOAtivo(
  p: PermissoesDoToken,
  permissao: string,
  ativoId: string,
): EstadoDaPermissao {
  if (!p.medido) return "nao_medido";
  const alvos = p.porAtivo[permissao];
  if (alvos === undefined) return p.escopos.includes(permissao) ? "vale" : "nao_vale";
  if (alvos.length === 0) return p.escopos.includes(permissao) ? "vale" : "nao_vale";
  return alvos.some((alvo) => mesmoAtivo(alvo, ativoId)) ? "vale" : "nao_vale";
}

/**
 * O MESMO ATIVO, ESCRITO DE DUAS FORMAS.
 *
 * ─── O DEFEITO QUE ISTO FECHA (15/08/2026) ─────────────────────────────────
 *
 * `alvos.includes(ativoId)` comparava id CRU. A Meta devolve a mesma conta de
 * anúncio ora como `act_1355986106660251`, ora como `1355986106660251` (`id` vs
 * `account_id` — a própria casa documenta isso em `ativos-autorizados.ts:104-115`
 * e resolveu lá com `normalizarId`). Com a comparação crua, `granular_scopes`
 * trazendo uma grafia e o chamador passando a outra devolvia **"não vale"
 * falso**: a medição diria que a conta está fora do alcance do token quando ela
 * está dentro. Numa medição que existe justamente para NÃO gastar tentativa
 * contra a conta, um falso negativo manda a casa esperar por nada — o mesmo
 * dano da frase "depende do App Review".
 *
 * ─── POR QUE NÃO NORMALIZA SEMPRE ──────────────────────────────────────────
 *
 * A forma canônica de conta de anúncio só entra em cena quando **algum dos dois
 * lados carrega o prefixo `act_`**. Sem essa guarda, um id de Página `123` e uma
 * conta `act_123` virariam o mesmo ativo por semelhança numérica — e um falso
 * POSITIVO numa trava é pior que um falso negativo.
 */
export function mesmoAtivo(a: string, b: string): boolean {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (!x.startsWith("act_") && !y.startsWith("act_")) return false;
  const cx = normalizarId("ad_account", x);
  return cx !== "" && cx === normalizarId("ad_account", y);
}

/** As permissões que publicar no Instagram de um cliente exige, com as
 *  dependências declaradas que a casa já viu falhar em produção (código 10 em
 *  `pages_read_engagement`, medido em 08/08/2026). */
export const PARA_PUBLICAR_NO_INSTAGRAM = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_read_engagement",
  "pages_show_list",
] as const;

/** As permissões que ler desempenho do Instagram exige. */
export const PARA_MEDIR_O_INSTAGRAM = [
  "instagram_basic",
  "instagram_manage_insights",
  "pages_read_engagement",
] as const;

// ─── ANÚNCIO — A CEGUEIRA QUE ISTO TIRA (15/08/2026) ────────────────────────
//
// Este arquivo media Instagram e mais nada. A pergunta que a casa não sabia
// responder sem TENTAR era a de anúncio: *"esta conta de anúncios está ao
// alcance deste token, hoje?"* — e tentar é o gesto proibido, porque a Meta
// audita a atividade do app e foi tentativa em ritmo de máquina que restringiu
// uma conta em 03/08/2026. `debug_token` responde por leitura, contra o app, e
// **não toca a conta de anúncios**: não gasta pontuação da Marketing API (a
// URL não é da Marketing API — `cota-de-anuncios.ts:366`) e não conta como
// tentativa contra o ativo.

/** Gerir anúncios de uma conta. Esta é a permissão que vale POR CONTA DE
 *  ANÚNCIOS: *"seu aplicativo pode ler e gerenciar a conta de anúncios que
 *  possui ou à qual […] tenha recebido acesso pelo proprietário"*
 *  (`fontes/permissoes-referencia.md:63-72`). */
export const PARA_GERIR_ANUNCIOS = ["ads_management"] as const;

/** Ler desempenho pago (API de Informações de Anúncios). Dependências
 *  declaradas: nenhuma (`fontes/permissoes-referencia.md:97+`). */
export const PARA_MEDIR_ANUNCIOS = ["ads_read"] as const;

/**
 * As dependências declaradas de `ads_management`
 * (`fontes/permissoes-referencia.md:60-62`).
 *
 * ⚠️ **Elas valem por PÁGINA, não por conta de anúncios.** Conferi-las contra
 * um `act_...` devolveria "não vale" falso sempre que a Meta restringir essas
 * duas por ativo — a mesma família do defeito de id cru. Por isso são uma
 * constante à parte e `diagnosticarConta` só as confere quando recebe o id da
 * Página.
 */
export const DEPENDENCIAS_DE_ANUNCIO = ["pages_read_engagement", "pages_show_list"] as const;

/**
 * 🟥 `pages_manage_ads` — **NÃO SEI se o nosso caminho precisa dela, e não vou
 * inventar.** Ela NÃO entra em nenhuma lista acima de propósito.
 *
 * O que a fonte diz: *"Com a permissão pages_manage_ads, seu aplicativo pode
 * gerenciar anúncios associados à Página. O uso permitido […] é criar e
 * gerenciar para a Página anúncios ou **anúncios de clique para uma superfície
 * de mensagens da empresa (como Messenger, Instagram Direct ou WhatsApp)**
 * associada à Página."* — `fontes/permissoes-referencia.md:733`.
 *
 * **Por que isso encosta na CityJobs:** quando o briefing fala em WhatsApp ou
 * conversa, `esteira/trafego.ts` escolhe o objetivo `conversas`, e
 * `ads.ts` monta o conjunto com `destination_type: MESSENGER` +
 * `promoted_object.page_id` — que é, com essas palavras, o "anúncio de clique
 * para uma superfície de mensagens". A fonte descreve o caso; ela **não diz**
 * que a permissão é obrigatória para criá-lo pela conta de anúncios.
 *
 * **A captura do painel de 14/08/2026 não trouxe o estado desta permissão** —
 * e ausência de leitura não é ausência de permissão (guardrail 1). Duas saídas,
 * e ambas existem hoje:
 *   (a) conferir no painel — *Análise do app → Permissões e recursos →
 *       `pages_manage_ads`* — antes de subir campanha de `conversas`;
 *   (b) subir a primeira campanha com objetivo `trafego`, que não usa
 *       `destination_type: MESSENGER` e não encosta nesta permissão.
 * A (b) não depende de ninguém e é o caminho que destrava hoje.
 */
export const PERMISSAO_DE_ANUNCIO_NAO_CONFERIDA = "pages_manage_ads";

/**
 * **ESTA CONTA DE ANÚNCIOS ESTÁ AO ALCANCE DESTE TOKEN, HOJE?**
 *
 * Determinística e sem rede: recebe a medição já feita. Confere `ads_management`
 * e `ads_read` contra a CONTA, e as dependências contra a PÁGINA — cada
 * permissão contra o ativo de que ela é.
 *
 * Continua valendo a regra do arquivo: **isto lê, não autoriza.** Um `completo:
 * true` aqui não libera campanha nenhuma — a conta ainda precisa estar na lista
 * que o cliente marcou (`ativos-autorizados.ts`) e ligar continua sendo gesto
 * humano com nome (`ads.ts`, `ativarCampanha`).
 */
export function diagnosticarConta(
  p: PermissoesDoToken,
  contaId: string,
  opts: { pageId?: string | null } = {},
): Diagnostico {
  const naConta = diagnosticar(p, [...PARA_GERIR_ANUNCIOS, ...PARA_MEDIR_ANUNCIOS], contaId);
  if (!opts.pageId) return naConta;
  const naPagina = diagnosticar(p, DEPENDENCIAS_DE_ANUNCIO, opts.pageId);
  return juntar(naConta, naPagina);
}

/** Une dois diagnósticos sem perder o TERCEIRO estado: "não medido" em qualquer
 *  metade contamina o todo, porque não medir nunca vira "pode". */
function juntar(a: Diagnostico, b: Diagnostico): Diagnostico {
  const faltando = [...a.faltando, ...b.faltando];
  const naoMedidas = [...a.naoMedidas, ...b.naoMedidas];
  return {
    completo: a.completo && b.completo,
    faltando,
    naoMedidas,
    resumo: a.completo ? b.resumo : b.completo ? a.resumo : `${a.resumo}; e ${b.resumo}`,
  };
}

export interface Diagnostico {
  /** `true` só quando TODAS as permissões foram medidas e valem. Nunca `true`
   *  por ausência de evidência. */
  completo: boolean;
  faltando: string[];
  naoMedidas: string[];
  /** A frase para uma pessoa ler. Carrega a evidência: diz quais permissões,
   *  não "algo faltou" (guardrail 6). */
  resumo: string;
}

/**
 * O diagnóstico de uma capacidade inteira contra um ativo.
 *
 * **Não autoriza nada.** Diz o que a Meta concedeu; quem decide se a casa usa é
 * a `trava-de-publicacao.ts`, e essa decisão é do CEO.
 */
export function diagnosticar(
  p: PermissoesDoToken,
  exigidas: readonly string[],
  ativoId: string,
): Diagnostico {
  const faltando: string[] = [];
  const naoMedidas: string[] = [];
  for (const perm of exigidas) {
    const estado = valeParaOAtivo(p, perm, ativoId);
    if (estado === "nao_vale") faltando.push(perm);
    if (estado === "nao_medido") naoMedidas.push(perm);
  }

  if (naoMedidas.length > 0) {
    return {
      completo: false, faltando, naoMedidas,
      resumo: `não consegui medir as permissões deste token (${p.porQueNaoMedi ?? "motivo não registrado"}). Não medir não é o mesmo que não poder — e também não é o mesmo que poder`,
    };
  }
  if (faltando.length > 0) {
    return {
      completo: false, faltando, naoMedidas,
      resumo: `a Meta não concedeu ${faltando.join(", ")} para o ativo ${ativoId}. Enquanto isso não mudar, qualquer chamada aqui volta recusada e conta como tentativa contra a reputação do aplicativo`,
    };
  }
  return {
    completo: true, faltando, naoMedidas,
    resumo: `a Meta concedeu todas as permissões necessárias para o ativo ${ativoId}`,
  };
}
