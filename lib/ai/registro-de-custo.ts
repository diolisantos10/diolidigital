// O REGISTRO DE CADA CHAMADA DE IA — a conta da casa.
//
// ─── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
//
// `AIRunLog` estava VAZIA em produção e nunca teve escritor: o único `save()`
// vivia em `lib/hooks/useDbAIRunLogs.ts` e nenhum arquivo o chamava. Além disso a
// tabela não tinha coluna de token nem de custo. Resultado: "quanto custou este
// cliente este mês" não tinha resposta — nem passando a medir agora, nem
// retroativamente. E a tabela de preços da casa assume um custo de IA por peça
// que ninguém mediu.
//
// ─── FAIL-OPEN AQUI É CERTO, E É A EXCEÇÃO ───────────────────────────────────
//
// Em quase tudo nesta casa a regra é fail-closed. Aqui não: falhar ao GRAVAR o
// log não pode derrubar a entrega ao cliente. O log é contabilidade; a entrega é
// o produto. Trocar uma peça entregue por uma linha de contabilidade seria trocar
// um problema grande por um pequeno, ao contrário.
//
// MAS FAIL-OPEN NÃO É FAIL-SILENCIOSO. Toda falha de gravação sai no log do
// processo com o marcador `[custo-de-ia] NÃO GRAVADO` e com o que se perdeu.
// Sem esse rastro, o relatório de gasto contaria uma história mais barata que a
// realidade e ninguém saberia — que é pior que não ter relatório.
//
// ─── `try/catch`, NÃO `.catch()` ─────────────────────────────────────────────
//
// Os dois não são a mesma coisa. Se o cliente do Prisma não tiver o modelo
// (dublê de teste incompleto, migration não aplicada), o acesso à propriedade
// estoura ANTES de existir promessa — a exceção é síncrona e passa por cima de
// um `.catch()` no fim da cadeia, derrubando a produção. Mesmo raciocínio de
// `registrarProducao` na escada.
//
// ─── PII ─────────────────────────────────────────────────────────────────────
//
// Aqui NÃO entra prompt nem saída. `promptSummary`/`outputSummary` ficam nulos
// neste caminho de propósito: o prompt de um especialista carrega o briefing do
// cliente inteiro — nome, telefone, o que ele contou sobre o negócio. O que se
// grava é metadado: quem, quanto, quanto custou, e o motivo quando falha.

import { prisma } from "@/lib/db/client";
import { estimarCusto, estimarCustoDeImagem, type TamanhoDeImagem } from "@/lib/ai/precos";

export interface UsoDeTokens {
  entrada: number | null;
  saida: number | null;
  /** Tokens GRAVADOS no cache de prompt (custam ~1,25x). `null` = provedor não
   *  informa ou cache não foi pedido. Nunca 0 por ausência: zero significaria
   *  "não gravou nada", que é outra afirmação. */
  cacheEscrito?: number | null;
  /** Tokens LIDOS do cache (custam ~0,1x). É o número que prova a economia —
   *  se ele fica em zero entre chamadas iguais, algo invalidou o prefixo. */
  cacheLido?: number | null;
}

/**
 * O RECORTE DE UMA CHAMADA DE IMAGEM — presente só quando a chamada FOI de
 * imagem, ausente em todas as outras.
 *
 * Existe porque imagem não se cobra por token: o `images/generations` cobra por
 * imagem PRODUZIDA, por tamanho e por qualidade. Passar `uso` com tokens nulos
 * faria `estimarCusto` devolver `null`, e `null` no teto de custo vale o valor
 * de substituição (US$ 0,05) — ou seja, a imagem mais cara da casa entraria na
 * conta pelo preço de um chute barato. Aqui ela entra pelo preço dela.
 */
export interface ImagemDaChamada {
  tamanho: TamanhoDeImagem;
  /** A qualidade tal como foi ENVIADA ao provedor (`high`, `medium`, `hd`…). */
  qualidade: string;
  /** Quantas imagens saíram nesta chamada. `1` no caminho desta casa. */
  quantas?: number;
}

export interface ChamadaDeIa {
  workspaceId: string;
  /** O departamento que pediu. `"desconhecido"` é uma resposta ruim mas honesta
   *  — melhor que atribuir a chamada ao departamento errado. */
  departmentId: string;
  /** O especialista/agente que pediu (`ownerAgentId`). */
  agentId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  provider: string;
  model: string;
  status: "success" | "error";
  uso?: UsoDeTokens | null;
  duracaoMs?: number | null;
  /** Já sanitizado pelo motor. NUNCA o corpo cru do provedor. */
  erro?: string | null;
  /** Um provedor de reserva atendeu no lugar do preferido. */
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  /** Presente só em chamada de IMAGEM — ver `ImagemDaChamada`. */
  imagem?: ImagemDaChamada | null;
}

/**
 * O custo estimado desta chamada — texto por token, imagem por imagem.
 *
 * ── POR QUE UMA CHAMADA DE IMAGEM QUE FALHOU CUSTA ZERO, E NÃO `null` ───────
 *
 * `null` significa "não sei quanto custou", e o teto de custo trata "não sei"
 * como US$ 0,05 (`CUSTO_DE_CHAMADA_SEM_PRECO_USD`) justamente para não contar
 * desconhecido como grátis. Aqui não é desconhecido: o `images/generations`
 * cobra por imagem PRODUZIDA, e uma requisição recusada (400/403) não produz
 * imagem nenhuma. Zero é o FATO, não uma ausência — e chutar 0,05 por recusa
 * faria uma conta sem acesso ao modelo (que erra em rajada, de graça) inflar o
 * gasto do workspace e fechar o teto de quem não gastou nada.
 *
 * A linha continua sendo gravada com `status: "error"`: falha de imagem é
 * notícia, e o relatório precisa conseguir contá-la.
 */
function custoDaChamada(c: ChamadaDeIa) {
  if (!c.imagem) return estimarCusto(c.model, c.uso?.entrada, c.uso?.saida);
  if (c.status === "error") return { usd: 0, versao: estimarCustoDeImagem(c.model, c.imagem.tamanho, c.imagem.qualidade, 0).versao };
  return estimarCustoDeImagem(c.model, c.imagem.tamanho, c.imagem.qualidade, c.imagem.quantas ?? 1);
}

/**
 * Grava uma chamada. Nunca lança, nunca rejeita — e nunca falha em silêncio.
 *
 * Devolve `true` se gravou. O retorno existe para o TESTE conseguir provar as
 * duas metades: que grava o que aconteceu, e que a entrega sobrevive quando ele
 * mesmo falha.
 */
export async function registrarChamadaDeIa(c: ChamadaDeIa): Promise<boolean> {
  const custo = custoDaChamada(c);
  try {
    await prisma.aIRunLog.create({
      data: {
        workspaceId:      c.workspaceId,
        departmentId:     c.departmentId,
        agentId:          c.agentId ?? null,
        clientId:         c.clientId ?? null,
        projectId:        c.projectId ?? null,
        provider:         c.provider,
        model:            c.model,
        status:           c.status,
        tokensEntrada:    c.uso?.entrada ?? null,
        tokensSaida:      c.uso?.saida ?? null,
        custoEstimadoUsd: custo.usd,
        custoTabela:      custo.versao,
        duracaoMs:        c.duracaoMs ?? null,
        erro:             c.erro?.slice(0, 500) ?? null,
        fallbackUsed:     c.fallbackUsed ?? false,
        fallbackReason:   c.fallbackReason?.slice(0, 300) ?? null,
        // Prompt e saída ficam FORA: carregam o briefing do cliente.
        promptSummary:    null,
        outputSummary:    null,
      },
    });
    return true;
  } catch (e) {
    // O rastro de que não gravou. Sem ele, o relatório de gasto ficaria mais
    // barato que a realidade e ninguém saberia por quê.
    console.error(
      `[custo-de-ia] NÃO GRAVADO — ${c.provider}/${c.model} · dept=${c.departmentId}` +
        ` · cliente=${c.clientId ?? "(sem cliente)"} · status=${c.status}` +
        ` · tokens=${c.uso?.entrada ?? "?"}/${c.uso?.saida ?? "?"}` +
        ` · usd=${custo.usd ?? "sem preço na tabela"} · causa: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    );
    return false;
  }
}
