// A GUARDA DA PORTA DO DIOLI CONNECT — e o PISO que faltava nela.
//
// ─── A MEDIÇÃO QUE ORIGINOU ESTE ARQUIVO (auditoria independente, 30/08/2026) ─
//
// A guarda vivia dentro de `app/api/connect/despacho/route.ts` e dizia:
//
//     return process.env.CONNECT_SECRET?.trim() || null;
//
// Sem piso de tamanho. O auditor reproduziu contra banco real: `CONNECT_SECRET="x"`
// mais o cabeçalho `authorization: Bearer x` devolveram **HTTP 200, estado
// executado, com linha gravada no banco**. Um segredo de um caractere não é "um
// segredo fraco que ainda vale": é a porta ABERTA por sorte de ambiente — o
// modo de falha exato que o guardrail 4 da casa proíbe ("prompt é aviso; código
// é trava"). O comentário logo acima daquela linha prometia que a porta
// "permanece fechada"; a promessa não estava no código.
//
// O irmão Foocci já tinha o piso (`src/services/connect/porta.ts:63`, mínimo de
// 16). Este arquivo é o equivalente desta casa, e vai um passo além — ver
// CARACTERES_DISTINTOS_MINIMOS.
//
// ─── POR QUE A GUARDA SAIU DA ROTA ─────────────────────────────────────────
//
// Portão que só existe dentro de uma rota Next não é testável nas duas metades
// (o que barra E o que deixa passar) sem levantar HTTP. É a mesma razão pela
// qual `contrato.ts` já mora fora da rota. Aqui a decisão inteira é função
// pura de (cabeçalho, ambiente) — dá para provar cada caso limite em
// milissegundos, e a rota volta a ser casca.
//
// ─── POR QUE 503, E NÃO 401, QUANDO NÃO HÁ SEGREDO UTILIZÁVEL ──────────────
//
// 401 diz "você não está autorizado", e isso é FALSO quando o problema é que a
// porta não está protegida — está DESLIGADA. O operador que configurou um
// segredo de três letras precisa saber que o ambiente não está preparado, não
// ficar caçando o cabeçalho errado. As duas respostas continuam sendo
// "fechada": nenhuma delas executa nada.
//
// Repare que a exigência de tamanho mora em `segredoDaPorta`, e NÃO na
// comparação: um segredo curto demais não chega a ser comparado com coisa
// nenhuma. Não existe caminho em que ele abra.

import { segredoConfere } from "@/lib/security/crypto";

/** O nome da variável de ambiente. Um lugar só, para não divergir da mensagem. */
export const VARIAVEL_DO_SEGREDO = "CONNECT_SECRET";

/** O piso do molde da casa, o mesmo do irmão Foocci. Segredo curto é adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

/**
 * ⭐ O PISO VIZINHO — porque a fraude anda um metro ao lado da medição.
 *
 * O auditor mediu `CONNECT_SECRET="x"`. Um piso só de comprimento fecha aquele
 * buraco exato e deixa o de um metro ao lado aberto: `"xxxxxxxxxxxxxxxx"` tem
 * dezesseis caracteres e é tão adivinhável quanto `"x"`. Idem
 * `"abababababababab"`, `"1234123412341234"`, `"----------------"` — todos
 * passam num teste de comprimento e nenhum deles é um segredo.
 *
 * O teto é deliberadamente BAIXO (cinco caracteres distintos) porque a função
 * dele é matar o marcador de lugar, não julgar entropia: qualquer segredo
 * gerado ao acaso com dezesseis caracteres tem, na prática, muito mais que
 * cinco distintos. Uma trava que reprovasse segredo legítimo seria incidente,
 * não trava.
 */
export const CARACTERES_DISTINTOS_MINIMOS = 5;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurado, ou não chega ao piso desta porta ` +
  `(mínimo de ${TAMANHO_MINIMO_DO_SEGREDO} caracteres e ${CARACTERES_DISTINTOS_MINIMOS} caracteres distintos — ` +
  `segredo curto ou repetitivo é segredo adivinhável, e a porta prefere ficar DESLIGADA a ficar fraca). ` +
  "Esta porta aceita EXCLUSIVAMENTE o segredo dela — não existe encosto em PILOTO_SECRET, em CRON_SECRET nem " +
  "em nenhum outro, porque segredo de outra finalidade não abre porta corporativa. Sem um segredo próprio que " +
  "cumpra o piso, ela permanece fechada. Nunca aberta por omissão.";

export const MOTIVO_SEGREDO_INVALIDO = "segredo inválido";

/**
 * O segredo desta porta, ou `null` quando ela está DESLIGADA.
 *
 * `null` cobre os três casos, e de propósito eles não se distinguem na
 * resposta: ausente, curto demais, ou repetitivo demais. Todos os três são "a
 * porta não está protegida", e nenhum deles é "você não está autorizado".
 */
export function segredoDaPorta(env: NodeJS.ProcessEnv = process.env): string | null {
  const bruto = env[VARIAVEL_DO_SEGREDO]?.trim();
  if (!bruto) return null;
  if (bruto.length < TAMANHO_MINIMO_DO_SEGREDO) return null;
  if (new Set(bruto).size < CARACTERES_DISTINTOS_MINIMOS) return null;
  return bruto;
}

/**
 * O segredo que o chamador apresentou, extraído do `Authorization`.
 *
 * Só o esquema `Bearer` é reconhecido, e a comparação do esquema é insensível a
 * caixa porque a RFC 7235 manda; o VALOR nunca é normalizado — normalizar
 * segredo é apagar diferença que deveria contar.
 */
export function segredoApresentado(cabecalho: string | null | undefined): string | null {
  if (!cabecalho) return null;
  if (!cabecalho.toLowerCase().startsWith("bearer ")) return null;
  return cabecalho.slice(7).trim() || null;
}

export type ResultadoDaGuarda =
  | { ok: true }
  | { ok: false; status: 503 | 401; motivo: string };

/**
 * A guarda inteira, em código puro: dá para prová-la sem levantar uma rota.
 *
 * A ordem é a que importa: PRIMEIRO se pergunta se existe porta ligada (503),
 * só DEPOIS se compara o que veio (401). Inverter isso deixaria um ambiente sem
 * segredo respondendo 401 para todo mundo — "fechada", sim, mas mentindo sobre
 * o motivo, e escondendo do operador que falta configuração.
 */
export function conferirSegredo(
  cabecalho: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ResultadoDaGuarda {
  const segredo = segredoDaPorta(env);
  if (!segredo) return { ok: false, status: 503, motivo: MOTIVO_PORTA_DESLIGADA };
  // Comparação em TEMPO CONSTANTE (`segredoConfere`, o helper da casa): `===`
  // sai no primeiro byte diferente e entrega o segredo byte a byte a quem
  // souber pedir tempo em vez de sorte.
  if (!segredoConfere(segredoApresentado(cabecalho), segredo)) {
    return { ok: false, status: 401, motivo: MOTIVO_SEGREDO_INVALIDO };
  }
  return { ok: true };
}

// ─── O FREIO DE RITMO — o agravante que o auditor anotou junto do A-1 ───────
//
// "Agrava: não há rate limiting em nenhuma das rotas." Um piso de dezesseis
// caracteres torna o segredo caro de adivinhar POR TENTATIVA; sem teto de
// ritmo, o atacante compra as tentativas no atacado. As duas travas são a
// mesma trava vista de dois lados, e faltava um lado.
//
// O balde é o mecanismo que a casa já tem (`lib/security/limite-no-banco.ts`):
// contador no VOLUME, não em memória de processo — atravessa deploy e réplica.
// O `Map` em memória de `rate-limit.ts` seria pior que nada aqui: qualquer push
// de qualquer agente desta casa devolveria a cota inteira ao atacante.

/** O nome do balde. Escolhido em código, nunca pelo requisitante. */
export const BALDE_DA_PORTA = "connect-despacho";
/** Tentativas por janela, por IP. A Control Room é UMA máquina de baixo volume. */
export const TENTATIVAS_POR_JANELA = 20;
/** A janela do balde. */
export const JANELA_DO_BALDE_MS = 60_000;
