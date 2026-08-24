// serie.ts — O PASSADO MÍNIMO. Só o bastante para saber que um evento PAROU.
//
// ── Por que este arquivo existe (24/08/2026) ────────────────────────────────
//
// O detector de "parou de chegar" nasceu construído e desabastecido: a casa lia
// o desempenho de um período e esquecia. Detector que só funciona no teste é o
// mesmo verde que esta casa aprendeu a não aceitar — por isso a série passou a
// ser gravada.
//
// ── A DISCIPLINA DO QUE NÃO SE GUARDA ───────────────────────────────────────
//
// Guarda-se **o nome dos eventos que chegaram**, por campanha e por período. Só
// isso. Sem quantidade, sem gasto, sem criativo, sem nada de público.
//
// A pergunta que esta série existe para responder é binária: "o evento `lead`
// chegou neste período?". Nome basta. Quantidade não acrescenta nada à pergunta
// e acrescenta tudo ao estrago de um vazamento — e "série histórica" é a
// desculpa mais fácil do mundo para acumular dado de campanha de cliente sem
// necessidade.
//
// ── LINHA AUSENTE ≠ LINHA VAZIA ─────────────────────────────────────────────
//
// `null` de `eventosDoPeriodoAnterior` significa **não há período anterior
// registrado** — e isso vira `nao_medido` na conciliação, nunca `integro`.
// `[]` significa **houve período anterior e nele não chegou evento nenhum** —
// aí a comparação roda. Confundir os dois é recriar o defeito uma camada acima.

// ── ⛔ NÃO CRIE UM RELÓGIO PARA ABASTECER ESTA SÉRIE (24/08/2026) ───────────
//
// Decisão do Diretor Geral, e ela existe porque a tentação é óbvia: a série só
// ganha passado quando alguém abre o painel de desempenho pago. Se ninguém
// abrir por dois meses, não há período anterior e a conciliação devolve NÃO
// MEDIDO. O reflexo natural é agendar uma leitura periódica. **Não agende.**
//
// O motivo é uma cicatriz recente desta casa: um cron morreu e ficou 10 DIAS em
// silêncio com o painel verde o tempo todo. Somar mais um relógio para
// abastecer esta série é comprar exatamente esse risco de novo — e comprá-lo no
// lugar mais perigoso, porque um relógio morto aqui produziria um passado
// parado que a comparação leria como fato, marcando campanhas saudáveis como
// "parou de chegar" e as quebradas como íntegras.
//
// NÃO MEDIDO enquanto ninguém abre o painel é o estado honesto. É melhor que um
// verde vindo de um relógio que talvez esteja morto.
//
// O CAMINHO RECOMENDADO, no dia em que a lacuna incomodar de verdade: abastecer
// a série **DE CARONA** — sempre que uma leitura de desempenho já acontecer por
// qualquer motivo (o painel, um relatório mensal, uma análise de conta), gravar
// o período junto, como `medir-conta-com-serie.ts` já faz. Carona não tem
// relógio próprio para morrer em silêncio: se a leitura parou, o silêncio
// aparece como NÃO MEDIDO na primeira vez que alguém olhar, que é onde ele
// precisa aparecer.

import { prisma } from "@/lib/db/client";

/** A chave determinística. Duas réplicas que gravam a mesma leitura colidem na
 *  chave em vez de criar duas linhas. */
export function chaveDaMedicao(campanhaId: string, desde: string, ate: string): string {
  return `${campanhaId}:${desde}:${ate}`;
}

/**
 * Grava os eventos deste período. Idempotente.
 *
 * NUNCA lança: gravar a série é registro, não é o trabalho. Uma falha aqui não
 * pode derrubar a leitura de desempenho do cliente — mas também não mente:
 * quando a gravação falha, o próximo período simplesmente não acha passado e
 * cai em `nao_medido`, que é o estado honesto.
 */
export async function registrarPeriodo(entrada: {
  campanhaId: string;
  contaId: string;
  periodo: { desde: string; ate: string };
  /** Os NOMES dos eventos recebidos. `null` = a fonte não respondeu: não grava
   *  nada, porque gravar "vazio" aqui viraria "não chegou evento nenhum" no
   *  período seguinte — uma falha de leitura disfarçada de fato medido. */
  eventos: string[] | null;
}): Promise<boolean> {
  if (entrada.eventos === null) return false;
  const { desde, ate } = entrada.periodo;
  const id = chaveDaMedicao(entrada.campanhaId, desde, ate);
  const eventos = [...new Set(entrada.eventos)].sort().join(",");
  try {
    await prisma.medicaoDeEventos.upsert({
      where: { id },
      create: { id, campanhaId: entrada.campanhaId, contaId: entrada.contaId, desde, ate, eventos },
      update: { eventos, lidoEm: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Os eventos do período ANTERIOR desta campanha.
 *
 *   `null` = não há período anterior registrado (cliente novo, primeira leitura,
 *            série perdida). A conciliação trata isso como NÃO MEDIDO.
 *   `[]`   = houve período anterior e nele não chegou evento nenhum.
 */
export async function eventosDoPeriodoAnterior(
  campanhaId: string,
  periodoAtual: { desde: string; ate: string },
): Promise<string[] | null> {
  try {
    const row = await prisma.medicaoDeEventos.findFirst({
      where: { campanhaId, ate: { lt: periodoAtual.desde } },
      orderBy: { ate: "desc" },
      select: { eventos: true },
    });
    if (!row) return null;
    return row.eventos ? row.eventos.split(",").filter(Boolean) : [];
  } catch {
    // Banco fora do ar não é "não faltou nada": é passado desconhecido.
    return null;
  }
}

/** O passado de várias campanhas de uma vez, para a leitura de uma conta
 *  inteira não fazer uma consulta por campanha. Campanha sem passado
 *  simplesmente NÃO aparece no mapa — ausência é a resposta, e é `null`. */
export async function passadoDasCampanhas(
  campanhaIds: string[],
  periodoAtual: { desde: string; ate: string },
): Promise<Record<string, string[]>> {
  if (campanhaIds.length === 0) return {};
  try {
    const linhas = await prisma.medicaoDeEventos.findMany({
      where: { campanhaId: { in: campanhaIds }, ate: { lt: periodoAtual.desde } },
      orderBy: { ate: "desc" },
      select: { campanhaId: true, eventos: true },
    });
    const mapa: Record<string, string[]> = {};
    for (const l of linhas) {
      if (l.campanhaId in mapa) continue;   // já pegamos o mais recente.
      mapa[l.campanhaId] = l.eventos ? l.eventos.split(",").filter(Boolean) : [];
    }
    return mapa;
  } catch {
    return {};
  }
}
