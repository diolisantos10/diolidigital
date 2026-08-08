// verificacao.ts — "CONECTADA" NÃO É UM FATO SOBRE O ACESSO. SERVER-ONLY.
//
// ─── O INCIDENTE QUE PRODUZIU ESTE ARQUIVO (08/08/2026) ─────────────────────
//
// O CEO abriu o portal do CityJobs e leu, nos dois cartões:
//
//     "Conectada · desde 03/08/2026"
//
// Ao mesmo tempo, tinha sido dito a ele — mais de uma vez no mesmo dia — que o
// acesso do CityJobs havia vencido. Um dos dois estava errado, e a tela não
// tinha como saber qual: **"desde 03/08" é a data em que a LINHA foi criada no
// banco, não prova de que o token está vivo.** O rótulo verde era derivado de
// uma coluna (`status`) que só muda quando alguém, em algum caminho de leitura,
// topa com um erro 190 e se lembra de carimbar.
//
// É o mesmo defeito do Google Drive de 07/08, com outra roupa: o cartão se
// anunciou "conectado" durante um mês inteiro sobre duas tabelas que nunca
// existiram em produção. **Registro de que algo foi salvo virou afirmação de
// que algo funciona.**
//
// ─── OS TRÊS ESTADOS, E POR QUE PRECISAM SER TRÊS ───────────────────────────
//
//   • `viva`            — o acesso foi EXERCITADO e a plataforma respondeu.
//                         Só este estado pode dizer "funcionando".
//   • `nao_verificada`  — existe registro, ninguém testou desde então. É o
//                         estado HONESTO do "não sei", e é o padrão.
//   • `caiu`            — a plataforma RECUSOU, com código, mensagem e data.
//
// Dois estados não bastam. Com dois, "não sei" tem que se disfarçar de uma das
// duas certezas — e a casa já escolheu, duas vezes, disfarçá-lo de "está tudo
// bem". Ausência de informação não é informação.
//
// ─── ONDE A VERDADE MORA, E POR QUE NÃO NUMA COLUNA NOVA ────────────────────
//
// `metaJson` já é o saco de metadados da conexão. Coluna nova exigiria migration
// e, num SQLite em volume do Railway, migration com o CEO parado é o risco que a
// casa aprendeu a evitar (07/08). O carimbo é dado, não estrutura.
//
// ─── ESTE ARQUIVO NÃO ESCREVE NADA NA META ──────────────────────────────────
//
// Todas as chamadas daqui são GET, e todas passam por `graph.ts` — isto é, pelo
// balde de ritmo e pela cota por pontuação. Rajada de GET é a assinatura do que
// restringiu a conta da agência em 03/08/2026; um diagnóstico que dispara a
// cada F5 seria o problema se apresentando como conserto. Por isso ele é
// chamado por rota administrativa manual, nunca por tela.

import { graphGet, GraphApiError } from "./graph";
import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/security/crypto";

// ─── O vocabulário ──────────────────────────────────────────────────────────

export type EstadoDaConexao = "viva" | "nao_verificada" | "caiu";

/** O que a plataforma respondeu quando o acesso foi recusado. Cru, porque
 *  código da Graph mente sobre a causa e quem interpreta precisa do original. */
export interface FalhaDeAcesso {
  /** ISO. Quando a recusa aconteceu. */
  em: string;
  /** O código da Graph (190, 200, 100, 10, 4…). `null` quando a falha foi de
   *  rede, e "não respondeu" é diferente de "respondeu recusando". */
  codigo: number | null;
  subcodigo: number | null;
  /** A frase que a Meta devolveu, em inglês, sem tradução nossa por cima. */
  mensagem: string;
  tipo: string | null;
}

/** O carimbo de que o acesso foi exercitado com sucesso. */
export interface AcessoConfirmado {
  /** ISO. **Este é o "quando funcionou pela última vez"** que o dono do negócio
   *  quer saber — e que `connectedAt` nunca respondeu. */
  em: string;
  /** O que foi lido para provar. Sem isto, "verificado" vira carimbo de fé. */
  prova: string;
}

export interface RetratoDaConexao {
  estado: EstadoDaConexao;
  /** Preenchido só quando `estado === "viva"`. */
  confirmadoEm: string | null;
  provaDoAcesso: string | null;
  /** Preenchido só quando `estado === "caiu"`. */
  falha: FalhaDeAcesso | null;
  /** Quem consegue resolver. `null` fora do estado "caiu". */
  quemResolve: QuemResolve | null;
  /** O que fazer, em português, sem mandar reconectar em vão. */
  oQueFazer: string | null;
  /** Sempre presente: a data em que a LINHA nasceu. Nunca sai sozinha na tela. */
  registradaEm: string;
}

/** A forma mínima que `estadoDaConexao` precisa — sem Prisma, para a regra ser
 *  testável sem banco e igual nos dois lados. */
export interface LinhaParaJulgar {
  status: string;
  connectedAt: Date | string;
  /** O `metaJson` já parseado. Objeto vazio quando não deu para parsear. */
  metaJson: Record<string, unknown>;
}

export const CHAVE_CONFIRMACAO = "acessoConfirmado";
export const CHAVE_FALHA = "ultimaFalhaDeAcesso";

function comoIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function lerConfirmacao(meta: Record<string, unknown>): AcessoConfirmado | null {
  const c = meta[CHAVE_CONFIRMACAO];
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.em !== "string" || !o.em) return null;
  return { em: o.em, prova: typeof o.prova === "string" ? o.prova : "" };
}

function lerFalha(meta: Record<string, unknown>): FalhaDeAcesso | null {
  const f = meta[CHAVE_FALHA];
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  if (typeof o.em !== "string" || !o.em) return null;
  return {
    em: o.em,
    codigo: typeof o.codigo === "number" ? o.codigo : null,
    subcodigo: typeof o.subcodigo === "number" ? o.subcodigo : null,
    mensagem: typeof o.mensagem === "string" ? o.mensagem : "",
    tipo: typeof o.tipo === "string" ? o.tipo : null,
  };
}

/**
 * O JUIZ. Puro, determinístico, sem rede e sem banco.
 *
 * A ordem importa e é fail-closed em duas pontas:
 *
 *  1. `status` diferente de "connected" é palavra final: a casa já carimbou
 *     recusa em algum caminho vivo, e um carimbo antigo de sucesso não a apaga.
 *  2. Recusa MAIS NOVA que a última confirmação vence a confirmação. O contrário
 *     deixaria uma conexão que caiu hoje verde para sempre por ter funcionado
 *     ontem — que é exatamente a forma do defeito que estamos consertando.
 *  3. Na dúvida, `nao_verificada`. Nunca `viva`.
 */
export function estadoDaConexao(linha: LinhaParaJulgar): RetratoDaConexao {
  const registradaEm = comoIso(linha.connectedAt);
  const confirmacao = lerConfirmacao(linha.metaJson);
  const falha = lerFalha(linha.metaJson);

  const leitura = falha?.codigo !== null && falha?.codigo !== undefined ? lerCodigoDaGraph(falha.codigo) : null;
  const caiuPeloStatus = linha.status !== "connected";
  const falhaMaisNova =
    !!falha && (!confirmacao || Date.parse(falha.em) >= Date.parse(confirmacao.em));

  if (caiuPeloStatus || falhaMaisNova) {
    return {
      estado: "caiu",
      confirmadoEm: null,
      provaDoAcesso: null,
      // `status` recusado sem falha registrada acontece: `marcarConexaoExpirada`
      // existe desde antes deste arquivo e só grava a coluna. Motivo ausente
      // vira motivo DECLARADO como ausente — nunca uma frase inventada.
      falha:
        falha ??
        {
          em: registradaEm,
          codigo: null,
          subcodigo: null,
          mensagem: `a casa marcou este acesso como "${linha.status}" e não guardou a resposta da plataforma`,
          tipo: null,
        },
      // Sem código da Meta não dá para saber quem resolve. "Avise a agência" é
      // a única saída honesta — melhor que mandar reconectar por chute.
      quemResolve: leitura?.quemResolve ?? "agencia",
      oQueFazer:
        leitura?.oQueFazer ??
        "este acesso está marcado como caído e a casa não guardou o motivo. Avise a equipe da Dioli",
      registradaEm,
    };
  }

  if (confirmacao) {
    return {
      estado: "viva",
      confirmadoEm: confirmacao.em,
      provaDoAcesso: confirmacao.prova || null,
      falha: null,
      quemResolve: null,
      oQueFazer: null,
      registradaEm,
    };
  }

  return {
    estado: "nao_verificada",
    confirmadoEm: null,
    provaDoAcesso: null,
    falha: null,
    quemResolve: null,
    oQueFazer: null,
    registradaEm,
  };
}

/** `metaJson` cru → objeto. String quebrada nunca derruba quem chama. */
export function lerMetaJson(cru: string): Record<string, unknown> {
  try {
    const o = JSON.parse(cru) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ─── O EXERCÍCIO: a única coisa que autoriza dizer "viva" ───────────────────

export interface ResultadoDoExercicio {
  ok: boolean;
  /** O que foi lido, em português, quando deu certo. */
  prova?: string;
  /** O que a plataforma devolveu, quando não deu. */
  falha?: FalhaDeAcesso;
  /** Amostra do que veio — nome do perfil, data do último post. Nunca token. */
  amostra?: Record<string, unknown>;
}

function traduzirParaFalha(e: unknown): FalhaDeAcesso {
  const em = new Date().toISOString();
  if (e instanceof GraphApiError) {
    return {
      em,
      codigo: typeof e.detail?.code === "number" ? e.detail.code : null,
      subcodigo:
        typeof (e.detail as { error_subcode?: number } | undefined)?.error_subcode === "number"
          ? (e.detail as { error_subcode?: number }).error_subcode!
          : null,
      mensagem: e.detail?.message ?? e.message,
      tipo: e.detail?.type ?? null,
    };
  }
  // Rede, timeout, abort. `codigo: null` de propósito: "não respondeu" e
  // "respondeu recusando" são fatos diferentes sobre o acesso.
  return {
    em,
    codigo: null,
    subcodigo: null,
    mensagem: e instanceof Error ? e.message : "a Meta não respondeu",
    tipo: null,
  };
}

interface AlvoDoExercicio {
  platform: string;
  externalId: string;
  token: string;
}

/**
 * Exercita UM acesso, com o menor gesto que prova alguma coisa.
 *
 * Instagram e Página levam DUAS chamadas de propósito: ler o nó prova que o
 * token abre a porta; ler o feed prova que ele alcança o CONTEÚDO — que é o que
 * a agência precisa. Um token pode responder `id,username` e recusar `/media`
 * por falta de permissão, e essas duas situações não podem virar o mesmo verde.
 */
export async function exercitarAcesso(alvo: AlvoDoExercicio): Promise<ResultadoDoExercicio> {
  try {
    if (alvo.platform === "instagram") {
      const perfil = await graphGet<{ id?: string; username?: string }>(
        alvo.externalId,
        alvo.token,
        { fields: "id,username" },
      );
      const feed = await graphGet<{ data?: Array<{ id?: string; timestamp?: string; permalink?: string }> }>(
        `${alvo.externalId}/media`,
        alvo.token,
        { fields: "id,timestamp,permalink", limit: 1 },
      );
      const ultimo = feed.data?.[0] ?? null;
      return {
        ok: true,
        prova: ultimo
          ? `li o perfil @${perfil.username ?? "?"} e o último post (${ultimo.timestamp ?? "sem data"})`
          : `li o perfil @${perfil.username ?? "?"}; o feed respondeu e está vazio`,
        amostra: { username: perfil.username ?? null, ultimoPost: ultimo?.timestamp ?? null, permalink: ultimo?.permalink ?? null },
      };
    }

    if (alvo.platform === "facebook") {
      const pagina = await graphGet<{ id?: string; name?: string }>(
        alvo.externalId,
        alvo.token,
        { fields: "id,name" },
      );
      const feed = await graphGet<{ data?: Array<{ id?: string; created_time?: string }> }>(
        `${alvo.externalId}/feed`,
        alvo.token,
        { fields: "id,created_time", limit: 1 },
      );
      const ultimo = feed.data?.[0] ?? null;
      return {
        ok: true,
        prova: ultimo
          ? `li a Página "${pagina.name ?? "?"}" e a última publicação (${ultimo.created_time ?? "sem data"})`
          : `li a Página "${pagina.name ?? "?"}"; o feed respondeu e está vazio`,
        amostra: { nome: pagina.name ?? null, ultimaPublicacao: ultimo?.created_time ?? null },
      };
    }

    if (alvo.platform === "ad_account") {
      // Marketing API: `graph.ts` detecta `act_` na URL e reserva a cota por
      // pontuação da CONTA (leitura = 1 ponto de 60). Nada é criado, pausado
      // nem alterado — `account_status` é campo de leitura.
      const conta = await graphGet<{ id?: string; name?: string; account_status?: number; currency?: string }>(
        alvo.externalId,
        alvo.token,
        { fields: "id,name,account_status,currency" },
      );
      return {
        ok: true,
        prova: `a conta de anúncios respondeu: "${conta.name ?? "?"}" (account_status ${conta.account_status ?? "?"})`,
        amostra: { nome: conta.name ?? null, accountStatus: conta.account_status ?? null, moeda: conta.currency ?? null },
      };
    }

    // `user` e qualquer plataforma que a casa acrescentar amanhã: o gesto
    // mínimo que prova que o token ainda é aceito.
    const eu = await graphGet<{ id?: string; name?: string }>("me", alvo.token, { fields: "id,name" });
    return {
      ok: true,
      prova: `o token de acesso ainda é aceito (respondeu por "${eu.name ?? eu.id ?? "?"}")`,
      amostra: { nome: eu.name ?? null },
    };
  } catch (e) {
    return { ok: false, falha: traduzirParaFalha(e) };
  }
}

// ─── O CARIMBO ──────────────────────────────────────────────────────────────
//
// Escrita no BANCO DESTA CASA, nunca na plataforma. E ela é EXPLÍCITA: a rota
// de diagnóstico só carimba quando quem chama pede (`?carimbar=1`), pelo mesmo
// motivo que `/api/admin/links-do-portal` só emite token com `?emitir=1`. GET é
// o verbo que todo mundo trata como inofensivo.

async function gravarNoMetaJson(
  connectionId: string,
  mudanca: (meta: Record<string, unknown>) => Record<string, unknown>,
  status?: string,
): Promise<boolean> {
  const row = await prisma.metaConnection
    .findUnique({ where: { id: connectionId }, select: { metaJson: true } })
    .catch(() => null);
  if (!row) return false;
  const meta = mudanca(lerMetaJson(row.metaJson));
  const ok = await prisma.metaConnection
    .update({
      where: { id: connectionId },
      data: { metaJson: JSON.stringify(meta), ...(status ? { status } : {}) },
    })
    .then(() => true)
    .catch(() => false);
  return ok;
}

/** O acesso respondeu. Grava a data e a PROVA, e limpa a falha anterior —
 *  porque uma recusa de ontem, já superada, não pode manchar a leitura de hoje. */
export async function carimbarAcessoVivo(connectionId: string, prova: string): Promise<boolean> {
  return gravarNoMetaJson(
    connectionId,
    (meta) => {
      const novo = { ...meta };
      novo[CHAVE_CONFIRMACAO] = { em: new Date().toISOString(), prova } satisfies AcessoConfirmado;
      delete novo[CHAVE_FALHA];
      return novo;
    },
    "connected",
  );
}

/**
 * O acesso foi recusado. Grava o motivo CRU e derruba o `status`.
 *
 * ⚠️ Falha de REDE não derruba o status. "A Meta não respondeu" é uma afirmação
 * sobre a internet, não sobre o token do cliente — e transformá-la em "caiu"
 * mandaria o dono do negócio reconectar por causa de um timeout nosso. Ela vira
 * `nao_verificada`, que é a verdade.
 */
export async function carimbarAcessoRecusado(
  connectionId: string,
  falha: FalhaDeAcesso,
): Promise<boolean> {
  const recusaDaPlataforma = falha.codigo !== null;
  return gravarNoMetaJson(
    connectionId,
    (meta) => {
      const novo = { ...meta };
      if (recusaDaPlataforma) {
        novo[CHAVE_FALHA] = falha;
        delete novo[CHAVE_CONFIRMACAO];
      }
      return novo;
    },
    recusaDaPlataforma ? statusPeloCodigo(falha.codigo!) : undefined,
  );
}

/**
 * Quem consegue resolver esta recusa. **Só isto decide se o cliente vê um botão
 * de reconectar.**
 *
 * ─── MEDIDO EM PRODUÇÃO, 08/08/2026, E QUASE VIROU A SEGUNDA MENTIRA ────────
 *
 * A Página "City Jobs SP" recusou com **código 10**:
 *
 *     "(#10) This endpoint requires the 'pages_read_engagement' permission or
 *      the 'Page Public Content Access' feature."
 *
 * A primeira versão deste arquivo mapeava 10 para `revoked` — o que faria a
 * tela dizer ao dono do CityJobs "seu acesso foi revogado, reconecte". Ele
 * reconectaria, **o erro voltaria igual**, e ele concluiria que o produto não
 * funciona. Código 10 não é token morto: a biblioteca capturada
 * (`fontes/graph-api-tratamento-de-erros.md`, 07/08/2026) diz, com todas as
 * letras, *"Permissão de API negada. A permissão não foi concedida ou foi
 * removida."* Isso é App Review do app DA AGÊNCIA — nada que o cliente clique
 * conserta.
 *
 * É exatamente o aviso de que "os códigos da Graph mentem sobre a causa com
 * frequência". Um diagnóstico que traduz errado é pior que nenhum: ele manda
 * a pessoa certa fazer a coisa inútil.
 */
export type QuemResolve = "cliente" | "agencia" | "ninguem_agora";

export interface LeituraDoCodigo {
  /** O valor que vai para a coluna `status`. */
  status: string;
  quemResolve: QuemResolve;
  /** A frase que a tela mostra. Ela nunca manda reconectar em vão. */
  oQueFazer: string;
}

/** Erros de LIMITE de taxa (`ritmo.ts` os conhece pelo mesmo número). */
const CODIGOS_DE_LIMITE = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004]);
/** Erros de PERMISSÃO: o app não tem o direito, o token não tem culpa. */
const CODIGOS_DE_PERMISSAO = new Set([3, 10, 200, 299]);
/** Erros de TOKEN: e só estes mandam o cliente reconectar. */
const CODIGOS_DE_TOKEN = new Set([102, 190, 463, 467]);

export function lerCodigoDaGraph(codigo: number): LeituraDoCodigo {
  if (CODIGOS_DE_TOKEN.has(codigo)) {
    return {
      status: "expired",
      quemResolve: "cliente",
      oQueFazer: "o acesso venceu ou foi retirado — reconecte a conta para a Dioli voltar a publicar e a ler seus resultados",
    };
  }
  if (CODIGOS_DE_PERMISSAO.has(codigo)) {
    return {
      status: "error",
      quemResolve: "agencia",
      // Reconectar NÃO resolve, e por isso a frase não pede isso.
      oQueFazer: "falta uma permissão no aplicativo da Dioli junto à Meta. Não é problema da sua conta e reconectar não resolve — a agência já está ciente",
    };
  }
  if (CODIGOS_DE_LIMITE.has(codigo)) {
    return {
      status: "error",
      quemResolve: "ninguem_agora",
      oQueFazer: "a Meta limitou o volume de consultas por alguns minutos. É temporário e se resolve sozinho — nada precisa ser feito",
    };
  }
  return {
    status: "error",
    quemResolve: "agencia",
    oQueFazer: "a Meta recusou este acesso por um motivo que a agência precisa investigar. Não é problema da sua conta",
  };
}

/** Só o status, para quem já sabe o resto. */
export function statusPeloCodigo(codigo: number): string {
  return lerCodigoDaGraph(codigo).status;
}

/** O token guardado, decifrado. `null` quando a chave da casa não abre — e isso
 *  é um fato sobre NÓS, não sobre o cliente; quem chama precisa distinguir. */
export function tokenGuardado(cru: string): string | null {
  return decryptSecret(cru);
}
