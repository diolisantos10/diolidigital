// O TETO DE RITMO QUE SOBREVIVE AO DEPLOY.
//
// ── O furo que este arquivo fecha (raio-x de 05/08/2026) ────────────────────
// `lib/security/rate-limit.ts` guarda o contador num `Map` na memória do
// processo. Quatro rotas PÚBLICAS que gastam chave de IA paga — `/api/sdr/chat`,
// `/api/sdr/transcribe`, `/api/sdr/upload`, `/api/brain/briefing-extract` —
// tinham esse `Map` como ÚNICA defesa. Duas consequências, ditas com todas as
// letras:
//   • todo deploy ZERA os baldes. Num ataque em curso, o atacante não precisa
//     nem esperar: qualquer push de qualquer agente desta casa devolve a cota
//     inteira para ele. Deploy vira ferramenta do atacante.
//   • com duas réplicas, o teto real é 2 × `limite` — e ninguém percebe, porque
//     cada processo acha que está cumprindo o limite.
// É a mesma família do `/api/generate-image` que ficou aberto e custou dinheiro.
//
// Aqui o balde mora no VOLUME (SQLite), como a idempotência do webhook. Ele
// atravessa deploy, restart e réplica.
//
// ── POR QUE A ESCRITA É `updateMany` CONDICIONAL, e não ler-depois-escrever ──
// O padrão ingênuo (`findUnique` → `if (contagem < limite)` → `update`) tem uma
// janela entre a leitura e a escrita. Duas requisições simultâneas leem o mesmo
// "9 de 10" e ambas passam. Aqui o teste vai DENTRO do `WHERE` do UPDATE: o
// banco decide, e `count === 1` é a prova de que ESTA requisição foi a que
// ganhou a vaga.
//
// ── FAIL-CLOSED, e isto é decisão consciente ────────────────────────────────
// Banco indisponível => a requisição é NEGADA. A alternativa (deixar passar
// quando o contador não responde) é exatamente o estado que custou dinheiro:
// porta aberta para motor pago. Estas rotas já dependem do banco para resolver
// a chave de IA, então "banco fora" não é um mundo em que elas funcionariam.

import { prisma } from "@/lib/db/client";
import { clientIp } from "./rate-limit";

export interface ResultadoDoLimite {
  /** `true` = pode seguir. */
  liberado: boolean;
  /** Segundos até a janela virar. Zero quando liberado. */
  esperarSegundos: number;
  /** Por que negou — `indisponivel` é o fail-closed do banco fora do ar. */
  motivo: "ok" | "estourou" | "indisponivel";
}

const LIBERADO: ResultadoDoLimite = { liberado: true, esperarSegundos: 0, motivo: "ok" };

/** Faxina barata das janelas vencidas: no máximo uma vez por minuto por
 *  processo, e nunca no caminho crítico da decisão (erro aqui é ignorado). */
let ultimaFaxina = 0;
async function faxina(agora: number): Promise<void> {
  if (agora - ultimaFaxina < 60_000) return;
  ultimaFaxina = agora;
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date(agora - 60 * 60_000) } },
    });
  } catch {
    /* faxina não é trava: falhar aqui não pode negar ninguém nem estourar */
  }
}

/**
 * Consome uma vaga da janela fixa `chave`. Janela de `janelaMs`, teto `limite`.
 *
 * A ordem das três tentativas importa:
 *   1. incrementa se a janela está viva E ainda cabe;
 *   2. recicla a linha se a janela venceu (UPDATE, não DELETE+INSERT — reciclar
 *      não deixa buraco em que uma concorrente insira uma linha nova);
 *   3. cria a linha se ela não existe. Perder a corrida do `create` (violação de
 *      chave primária) NÃO é erro: significa que outra requisição criou a janela
 *      no mesmo instante, e aí basta repetir o passo 1.
 * Nenhum caminho passa sem que o BANCO tenha contado a vaga.
 */
export async function consumirVaga(
  chave: string,
  limite: number,
  janelaMs: number,
): Promise<ResultadoDoLimite> {
  const agora = Date.now();
  void faxina(agora);

  try {
    // 1. A janela está viva e ainda cabe?
    const dentro = await prisma.rateLimitBucket.updateMany({
      where: { chave, resetAt: { gt: new Date(agora) }, contagem: { lt: limite } },
      data: { contagem: { increment: 1 } },
    });
    if (dentro.count === 1) return LIBERADO;

    // 2. A janela venceu? Recicla a linha e conta esta como a primeira.
    const reciclada = await prisma.rateLimitBucket.updateMany({
      where: { chave, resetAt: { lte: new Date(agora) } },
      data: { contagem: 1, resetAt: new Date(agora + janelaMs) },
    });
    if (reciclada.count === 1) return LIBERADO;

    // 3. Nunca existiu? Cria.
    try {
      await prisma.rateLimitBucket.create({
        data: { chave, contagem: 1, resetAt: new Date(agora + janelaMs) },
      });
      return LIBERADO;
    } catch {
      // Perdeu a corrida do create — outra requisição abriu a janela primeiro.
      // Uma única repetição do passo 1 basta: a linha agora existe.
      const segundaChance = await prisma.rateLimitBucket.updateMany({
        where: { chave, resetAt: { gt: new Date(agora) }, contagem: { lt: limite } },
        data: { contagem: { increment: 1 } },
      });
      if (segundaChance.count === 1) return LIBERADO;
    }

    // Nada passou: a janela existe, está viva e o teto estourou.
    const linha = await prisma.rateLimitBucket.findUnique({
      where: { chave },
      select: { resetAt: true },
    });
    const restante = linha ? linha.resetAt.getTime() - agora : janelaMs;
    return {
      liberado: false,
      esperarSegundos: Math.max(1, Math.ceil(restante / 1000)),
      motivo: "estourou",
    };
  } catch (err) {
    // FAIL-CLOSED. Contador que não responde não autoriza gasto.
    console.error("[limite-no-banco] contador indisponível — negando por precaução:", err);
    return {
      liberado: false,
      esperarSegundos: Math.max(1, Math.ceil(janelaMs / 1000)),
      motivo: "indisponivel",
    };
  }
}

/**
 * A forma que a rota usa: devolve a `Response` pronta de recusa, ou `null` para
 * seguir. `identificador` é normalmente o IP (`clientIp(req)`), mas pode ser o
 * usuário ou o e-mail quando isso for mais específico do que o IP.
 *
 *   const barrado = await limiteExcedido(req, "sdr-chat", 30, 60_000);
 *   if (barrado) return barrado;
 */
export async function limiteExcedido(
  req: Request,
  balde: string,
  limite: number,
  janelaMs: number,
  identificador?: string,
): Promise<Response | null> {
  const quem = identificador ?? clientIp(req);
  const r = await consumirVaga(`${balde}:${quem}`, limite, janelaMs);
  if (r.liberado) return null;
  return respostaDeRecusa(r);
}

/** A recusa, num formato só — para a mensagem não divergir entre rotas. */
export function respostaDeRecusa(r: ResultadoDoLimite): Response {
  const corpo =
    r.motivo === "indisponivel"
      ? { error: "Serviço temporariamente indisponível. Tente de novo em instantes." }
      : { error: "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo." };
  return new Response(JSON.stringify(corpo), {
    status: r.motivo === "indisponivel" ? 503 : 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(r.esperarSegundos) },
  });
}
