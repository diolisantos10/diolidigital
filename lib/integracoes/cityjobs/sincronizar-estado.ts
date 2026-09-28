// sincronizar-estado.ts — DEPOIS DA CRIAÇÃO, O ESTADO CONTINUA. SERVER-ONLY.
//
// Contrato §3+§8 (docs/integracoes/cityjobs-contrato.md): `PostExterno.estado`
// tem de sair de "agendado"/"aguardando_revisao" para "publicado", "falhou" ou
// "em_conferencia" QUANDO o `SocialPost` dono realmente transiciona — e o City
// Jobs precisa ser AVISADO (webhook) nesse instante, não só na criação.
//
// ── ACHADO 2 (Q8-qualidade, 28/09/2026) ──────────────────────────────────────
//
// Antes deste arquivo, NENHUM ponto do pipeline de publicação
// (`lib/agency/esteira/publicacao.ts`) sabia que um `SocialPost` podia
// pertencer a um `PostExterno` — `estado` era escrito UMA vez, na criação
// (`posts.ts`, `receberPost`), e nunca mais. `GET /posts/{idExterno}`
// respondia "agendado" para sempre, mesmo com a peça publicada, falhada ou
// ambígua — e o City Jobs nunca era avisado por webhook nos três eventos que
// o contrato promete.
//
// ── POR QUE ESTE ARQUIVO NÃO IMPORTA `posts.ts` NEM `esteira/publicacao.ts` ──
//
// `posts.ts` já importa de `esteira/publicacao.ts` (`intervaloDoFormato`,
// `inicioDoDiaCivilDeBrasilia`). Se `esteira/publicacao.ts` importasse de
// volta `posts.ts` para chamar esta sincronização, fecharia um import
// CIRCULAR entre o núcleo da esteira e uma integração específica — o tipo de
// dependência que esta casa evita (ver o cabeçalho de `posts.ts`: integração
// depende do núcleo, nunca o contrário). Este módulo só depende de `prisma` e
// de `webhook.ts` — nunca de `posts.ts` nem de `publicacao.ts` — para que
// `esteira/publicacao.ts` possa importar DAQUI sem criar o ciclo.
//
// A MESMA régua vale para `modo-de-aprovacao.ts` (28/09/2026, J5): ele importa
// `agendarPecasAprovadas` de `esteira/publicacao.ts`, que importa DAQUI — logo
// importar `modo-de-aprovacao.ts` aqui fecharia o idêntico ciclo de 3 pontas,
// só trocando o nome do módulo do meio. Por isso `ehDeFonteExterna` abaixo
// DUPLICA a regra de `ehPostDeFonteExterna` em vez de importá-la.

import { prisma } from "@/lib/db/client";
import { registrarEventoDeWebhook, type EventoDoWebhook } from "@/lib/integracoes/cityjobs/webhook";

/** Os três estados que este módulo sincroniza — os mesmos três eventos
 *  assíncronos do contrato §8 (`agendado` já é gravado na criação, por
 *  `receberPost`/`processarRepostsDeVagasPagas`, e nunca passa por aqui). */
const ESTADOS_SINCRONIZAVEIS = ["publicado", "falhou", "em_conferencia"] as const;
export type EstadoSincronizavel = (typeof ESTADOS_SINCRONIZAVEIS)[number];

const EVENTO_DO_ESTADO: Record<EstadoSincronizavel, EventoDoWebhook> = {
  publicado: "publicado",
  falhou: "falhou",
  em_conferencia: "em_conferencia",
};

export interface TransicaoDoSocialPost {
  estado: EstadoSincronizavel;
  /** Legível — "motivo" no evento (contrato §8) e em `PostExterno.motivo`. */
  motivo?: string | null;
  /** Só preenchido em `publicado`. */
  permalink?: string | null;
  externalPostId?: string | null;
}

/**
 * `true` quando o `scriptJson` da PEÇA carrega a marca de fonte externa (J4,
 * 28/09/2026 — hoje só City Jobs, `posts.ts`, que grava `{"origem":"cityjobs",
 * ...}` na criação). A regra é a MESMA de `ehPostDeFonteExterna`
 * (`@/lib/agency/esteira/modo-de-aprovacao.ts`) — mas DUPLICADA aqui de
 * propósito, NUNCA importada de lá.
 *
 * Por quê: `modo-de-aprovacao.ts` importa `agendarPecasAprovadas` de
 * `esteira/publicacao.ts`, que por sua vez importa `sincronizarEstadoExterno`
 * DESTE arquivo. Importar `modo-de-aprovacao.ts` aqui fecharia o EXATO ciclo de
 * 3 pontas que o cabeçalho deste arquivo já evita para `posts.ts` — só trocando
 * o nome do módulo do meio. Mesma régua que `modo-de-aprovacao.ts` já aplica ao
 * prefixo `client:` (ver o comentário de `PREFIXO_CLIENTE` lá): quando importar
 * quebraria a direção "integração depende do núcleo, nunca o contrário", a
 * regra se duplica, pequena e comentada, em vez de se importar.
 *
 * Mantenha em sincronia manual com `ehPostDeFonteExterna` se aquela mudar.
 */
function ehDeFonteExterna(scriptJson: string | null | undefined): boolean {
  try {
    const o = scriptJson ? (JSON.parse(scriptJson) as Record<string, unknown>) : null;
    return !!o && typeof o.origem === "string" && o.origem.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * O `SocialPost` `socialPostId` acabou de transicionar. Se ele pertence a um
 * `PostExterno` — achado pela MESMA convenção de sempre em `posts.ts`,
 * `socialPostIdsJson CONTAINS socialPostId`, nunca uma segunda varredura de
 * JSON — atualiza `PostExterno.estado`/`motivo` e enfileira o webhook do
 * evento correspondente (`registrarEventoDeWebhook`, que já é best-effort e
 * assíncrono por desenho — ver o cabeçalho de `webhook.ts`).
 *
 * BEST-EFFORT COMPLETO: nunca lança. Falhar em sincronizar isto NUNCA desfaz
 * nem atrasa a publicação que já aconteceu — o `SocialPost` já mudou de
 * estado ANTES desta chamada, sempre depois, nunca como parte da mesma
 * transação.
 *
 * IDEMPOTENTE por comparação: só grava e só enfileira o webhook quando o
 * estado (ou o motivo) realmente MUDOU — chamar de novo com o mesmo resultado
 * (o relógio bate a cada 5 min; um mesmo `lastError` pode se repetir por
 * rodadas) não duplica evento. É a mesma régua de "só a MUDANÇA vira linha" que
 * o resto do despertador desta casa já segue.
 *
 * ── A CONSULTA SÓ RODA PARA PEÇA DE FONTE EXTERNA (28/09/2026) ──────────────
 * Antes desta data, TODA transição de TODA peça de TODA marca fazia
 * `postExterno.findFirst` com `socialPostIdsJson CONTAINS` — um `LIKE` sem
 * índice, repetido a cada 5 min por peça bloqueada, para 100% das peças que
 * NUNCA vão ter dono (só City Jobs tem `PostExterno`, hoje). `scriptJson` é
 * quem chama que precisa passar — é ele quem já tem a peça na mão (aqui
 * fingir "buscar de novo" seria a MESMA consulta que estamos cortando, só que
 * disfarçada). Peça comum retorna ANTES de tocar o banco.
 */
export async function sincronizarEstadoExterno(
  socialPostId: string,
  transicao: TransicaoDoSocialPost,
  scriptJson: string | null | undefined,
): Promise<void> {
  if (!socialPostId) return;
  if (!ehDeFonteExterna(scriptJson)) return; // peça comum — nem consulta o banco
  try {
    const dono = await prisma.postExterno.findFirst({
      where: { socialPostIdsJson: { contains: socialPostId } },
      select: { id: true, idExterno: true, estado: true, motivo: true, metadadosJson: true },
    });
    if (!dono) return; // é de fonte externa, mas nenhum PostExterno bate com este id — nada a sincronizar

    const motivo = transicao.motivo ?? null;
    if (dono.estado === transicao.estado && dono.motivo === motivo) return; // já sincronizado, nada mudou

    await prisma.postExterno.update({
      where: { id: dono.id },
      data: { estado: transicao.estado, motivo },
    });

    let metadados: unknown = null;
    try {
      metadados = dono.metadadosJson ? JSON.parse(dono.metadadosJson) : null;
    } catch {
      metadados = null;
    }

    await registrarEventoDeWebhook(dono.id, {
      idExterno: dono.idExterno,
      evento: EVENTO_DO_ESTADO[transicao.estado],
      ocorridoEm: new Date(),
      permalink: transicao.permalink ?? null,
      externalPostId: transicao.externalPostId ?? null,
      motivo,
      // Eco do que veio na criação (contrato §8) — nunca inventado aqui.
      metadados,
    });
  } catch {
    // best-effort — nunca derruba quem chamou (a publicação já aconteceu).
  }
}
