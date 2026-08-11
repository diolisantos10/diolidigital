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
  return alvos.includes(ativoId) ? "vale" : "nao_vale";
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
