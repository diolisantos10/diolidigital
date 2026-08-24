// google/client.ts — GOOGLE MEU NEGÓCIO. Onde a padaria é encontrada de verdade.
//
// A casa inteira estava construída em cima da Meta, e o cliente típico desta
// agência — padaria, salão, pet shop — é achado por BUSCA LOCAL antes de ser
// achado no Instagram. Quem procura "padaria perto de mim" vê o Google, não o
// feed. E a peça que mais decide ali não é post: é a AVALIAÇÃO.
//
// ── O QUE MUDA EM RELAÇÃO À META, E POR QUE EXIGE CÓDIGO PRÓPRIO ───────────
//
// 1. O token do Google EXPIRA EM 1 HORA. O da Meta dura 60 dias. Aqui, sem
//    renovação automática, a conexão morre no mesmo dia em que é feita — o
//    oposto de uma agência que roda sozinha. `comToken` renova sempre que
//    faltar menos de 5 minutos.
// 2. A API do Google Meu Negócio é dividida em VÁRIOS hosts (a de avaliações
//    não é a mesma da de informações). Um "baseUrl" só não funciona.
// 3. Acesso exige aprovação do Google, como o App Review da Meta. O erro vem
//    como 403 e precisa virar frase em português — não um número solto.

import { prisma } from "@/lib/db/client";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { motivoDoBloqueioDeSaida, registrarSaidaBloqueada } from "@/lib/agency/cliente-falso/trava-de-saida";

const HOST_CONTAS = "https://mybusinessaccountmanagement.googleapis.com/v1";
/** As avaliações vivem na API v4, que ainda não foi migrada pelo Google. */
const HOST_AVALIACOES = "https://mybusiness.googleapis.com/v4";
const HOST_POSTS = "https://mybusiness.googleapis.com/v4";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Renovamos com folga: um token que vence no meio da chamada falha depois de
 *  já ter começado a fazer efeito, que é o pior momento possível. */
const FOLGA_MS = 5 * 60_000;

export interface ResultadoGoogle<T = unknown> {
  ok: boolean;
  dados?: T;
  erro?: string;
  motivo?: "sem_conexao" | "sem_permissao" | "token_morto" | "erro_do_google";
}

function traduzirErro<T>(status: number, corpo: string): ResultadoGoogle<T> {
  if (status === 401) {
    return { ok: false, motivo: "token_morto", erro: "o acesso do cliente ao Google expirou — ele precisa reconectar" };
  }
  if (status === 403) {
    return {
      ok: false,
      motivo: "sem_permissao",
      erro: "o Google ainda não liberou o acesso à API do Meu Negócio para este app. Isso depende de aprovação do Google — não é erro de configuração.",
    };
  }
  return { ok: false, motivo: "erro_do_google", erro: `${status}: ${corpo.slice(0, 200)}` };
}

/**
 * Devolve um access token VÁLIDO, renovando quando necessário.
 *
 * A renovação é gravada: sem persistir, cada chamada renovaria de novo e o
 * Google passa a limitar o app por excesso de refresh.
 */
async function comToken(connectionId: string): Promise<{ token: string; conexao: { id: string; locationName: string; accountName: string; workspaceId: string; clientId: string | null } } | null> {
  const c = await prisma.googleConnection.findUnique({ where: { id: connectionId } });
  if (!c || c.status === "revoked") return null;

  const valido = c.tokenExpiresAt && c.tokenExpiresAt.getTime() - Date.now() > FOLGA_MS;
  if (valido) {
    const t = decryptSecret(c.accessTokenEncrypted);
    if (t) return { token: t, conexao: c };
  }

  const refresh = c.refreshTokenEncrypted ? decryptSecret(c.refreshTokenEncrypted) : null;
  if (!refresh) {
    // Sem refresh token não há como renovar. Marcar como expirada é o que faz
    // a pendência aparecer para o time, em vez de a conta falhar em silêncio.
    await prisma.googleConnection.update({ where: { id: c.id }, data: { status: "expired" } })
      .catch(() => { /* best-effort */ });
    return null;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  }).catch(() => null);

  if (!res?.ok) {
    await prisma.googleConnection.update({ where: { id: c.id }, data: { status: "expired" } })
      .catch(() => { /* best-effort */ });
    return null;
  }

  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;

  await prisma.googleConnection.update({
    where: { id: c.id },
    data: {
      accessTokenEncrypted: encryptSecret(j.access_token),
      tokenExpiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
      status: "connected",
    },
  }).catch(() => { /* best-effort: o token novo vale para esta chamada de todo jeito */ });

  return { token: j.access_token, conexao: c };
}

async function chamar<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<ResultadoGoogle<T>> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  }).catch(() => null);

  if (!res) return { ok: false, motivo: "erro_do_google", erro: "não consegui falar com o Google" };
  if (!res.ok) return traduzirErro(res.status, await res.text().catch(() => ""));
  // Algumas respostas (responder avaliação) vêm vazias com 200.
  const texto = await res.text().catch(() => "");
  try {
    return { ok: true, dados: (texto ? JSON.parse(texto) : {}) as T };
  } catch {
    return { ok: true, dados: {} as T };
  }
}

export interface LocalDoGoogle {
  locationName: string;
  accountName: string;
  title: string;
}

/** Os locais que este acesso alcança. É o primeiro passo de tudo: sem local,
 *  não há avaliação nem post. */
export async function listarLocais(connectionId: string): Promise<ResultadoGoogle<LocalDoGoogle[]>> {
  const t = await comToken(connectionId);
  if (!t) return { ok: false, motivo: "sem_conexao", erro: "conexão do Google inválida ou expirada" };

  const contas = await chamar<{ accounts?: Array<{ name: string }> }>(`${HOST_CONTAS}/accounts`, t.token);
  if (!contas.ok) return contas as ResultadoGoogle<LocalDoGoogle[]>;

  const locais: LocalDoGoogle[] = [];
  for (const conta of contas.dados?.accounts ?? []) {
    const r = await chamar<{ locations?: Array<{ name: string; title?: string }> }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${conta.name}/locations?readMask=name,title`,
      t.token,
    );
    for (const l of r.dados?.locations ?? []) {
      locais.push({ locationName: l.name, accountName: conta.name, title: l.title ?? l.name });
    }
  }
  return { ok: true, dados: locais };
}

export interface AvaliacaoDoGoogle {
  externalId: string;
  autor: string;
  estrelas: number;
  comentario: string;
  quando: Date | null;
  jaRespondida: boolean;
}

const ESTRELAS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** As avaliações do local, da mais nova para a mais velha. */
export async function listarAvaliacoes(connectionId: string): Promise<ResultadoGoogle<AvaliacaoDoGoogle[]>> {
  const t = await comToken(connectionId);
  if (!t) return { ok: false, motivo: "sem_conexao", erro: "conexão do Google inválida ou expirada" };

  const url = `${HOST_AVALIACOES}/${t.conexao.accountName}/${t.conexao.locationName}/reviews?orderBy=updateTime desc&pageSize=50`;
  const r = await chamar<{
    reviews?: Array<{
      reviewId?: string; name?: string; comment?: string; starRating?: string;
      createTime?: string; reviewer?: { displayName?: string }; reviewReply?: unknown;
    }>;
  }>(encodeURI(url), t.token);
  if (!r.ok) return r as ResultadoGoogle<AvaliacaoDoGoogle[]>;

  const lista = (r.dados?.reviews ?? []).map((a) => ({
    externalId: a.reviewId ?? a.name ?? "",
    autor: a.reviewer?.displayName ?? "",
    estrelas: ESTRELAS[a.starRating ?? ""] ?? 0,
    comentario: a.comment ?? "",
    quando: a.createTime ? new Date(a.createTime) : null,
    // O Google já traz a resposta quando existe. Reler isso é o que impede a
    // agência de responder duas vezes a mesma avaliação depois de um restore.
    jaRespondida: !!a.reviewReply,
  })).filter((a) => a.externalId);

  return { ok: true, dados: lista };
}

/**
 * Responde uma avaliação. PÚBLICO E PERMANENTE — o Google não apaga, só
 * substitui, e o cliente que reclamou recebe notificação na hora.
 */
export async function responderAvaliacao(
  connectionId: string,
  externalId: string,
  texto: string,
): Promise<ResultadoGoogle<{ respondida: true }>> {
  // ── TRAVA DE SAÍDA (24/08/2026) — antes do token, sempre ────────────────
  // ⚠️ ESTE CANAL TEM UM CADEADO SÓ, e é preciso saber disso: a resposta a uma
  // avaliação não carrega marca de teste nenhuma e o destino é um id de
  // conexão — não há aqui equivalente do `.invalid` do e-mail. Se o modo de
  // teste não estiver ligado, nada mais segura. Está declarado em
  // `CADEADOS_POR_CANAL`, porque contar cadeado a mais no papel é o jeito mais
  // fácil de dormir tranquilo com uma porta aberta.
  const bloqueio = motivoDoBloqueioDeSaida("avaliacao", connectionId, texto);
  if (bloqueio) {
    registrarSaidaBloqueada({ canal: "avaliacao", destino: connectionId, motivo: bloqueio });
    return { ok: false, motivo: "erro_do_google", erro: `bloqueado:${bloqueio}` };
  }
  const limpo = texto.trim();
  if (limpo.length < 10) return { ok: false, motivo: "erro_do_google", erro: "resposta curta demais para ir ao ar" };

  const t = await comToken(connectionId);
  if (!t) return { ok: false, motivo: "sem_conexao", erro: "conexão do Google inválida ou expirada" };

  const url = `${HOST_AVALIACOES}/${t.conexao.accountName}/${t.conexao.locationName}/reviews/${externalId}/reply`;
  const r = await chamar(url, t.token, { method: "PUT", body: JSON.stringify({ comment: limpo.slice(0, 4000) }) });
  return r.ok ? { ok: true, dados: { respondida: true } } : (r as ResultadoGoogle<{ respondida: true }>);
}

/** Um post no perfil do Google — o "post do Instagram" da busca local. */
export async function publicarNoGoogle(
  connectionId: string,
  input: { texto: string; imagemUrl?: string; botao?: { texto: string; url: string } },
): Promise<ResultadoGoogle<{ postId: string }>> {
  // ── TRAVA DE SAÍDA (24/08/2026) — antes do token, sempre ────────────────
  // Post no perfil do Google do CLIENTE: público, indexável, e desfazer não
  // desfaz quem já viu. Ver `trava-de-saida.ts` para por que esta trava nasceu
  // depois das outras e por que ela veio ANTES do piloto.
  const bloqueio = motivoDoBloqueioDeSaida("publicacao", connectionId, input.texto);
  if (bloqueio) {
    registrarSaidaBloqueada({ canal: "publicacao", destino: connectionId, motivo: bloqueio });
    return { ok: false, motivo: "sem_conexao", erro: `bloqueado:${bloqueio}` };
  }
  const t = await comToken(connectionId);
  if (!t) return { ok: false, motivo: "sem_conexao", erro: "conexão do Google inválida ou expirada" };

  const corpo: Record<string, unknown> = {
    languageCode: "pt-BR",
    summary: input.texto.slice(0, 1500),
    topicType: "STANDARD",
    ...(input.imagemUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: input.imagemUrl }] } : {}),
    ...(input.botao ? { callToAction: { actionType: "LEARN_MORE", url: input.botao.url } } : {}),
  };

  const url = `${HOST_POSTS}/${t.conexao.accountName}/${t.conexao.locationName}/localPosts`;
  const r = await chamar<{ name?: string }>(url, t.token, { method: "POST", body: JSON.stringify(corpo) });
  return r.ok ? { ok: true, dados: { postId: r.dados?.name ?? "" } } : (r as ResultadoGoogle<{ postId: string }>);
}
