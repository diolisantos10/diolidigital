// corpo-limitado.ts — LER O CORPO DE UMA REQUISIÇÃO SEM DEIXAR O CHAMADOR
// DECIDIR QUANTA MEMÓRIA O SERVIDOR GASTA. SERVER-ONLY.
//
// ── O ACHADO (revisão de segurança da leva City Jobs, 28/09/2026) ───────────
//
// `POST /api/integracoes/cityjobs/posts` fazia `await req.text()` para
// capturar o corpo BRUTO antes do HMAC (correto — a assinatura é sobre os
// bytes exatos, contrato §1.2) mas SEM TETO NENHUM antes disso. O contrato
// (`docs/integracoes/cityjobs-contrato.md`, §9) declara 256 KB como limite do
// corpo JSON — nada no código o aplicava. Um chamador que soubesse a URL
// (mesmo sem o segredo HMAC) podia mandar um corpo arbitrariamente grande, e
// o servidor bufferizava o corpo inteiro na memória do processo ANTES até do
// rate limit — o gasto de memória/CPU acontecia sem precisar quebrar nenhuma
// trava. O mesmo padrão (`req.text()` sem teto) existe em outros webhooks da
// casa (ex.: `app/api/meta/webhooks/route.ts`) — não é exclusivo desta leva,
// mas é aqui que o contrato desta ficha FIXA um número, então é aqui que a
// trava nasce.
//
// ─── A DEFESA, EM DUAS CAMADAS ───────────────────────────────────────────────
//
// 1. `Content-Length` DECLARADO acima do teto → recusa SEM ler nenhum byte do
//    corpo (o caso barato e comum).
// 2. Corpo sem `Content-Length` confiável (chunked, ou cabeçalho que mente
//    para baixo): o teto é reaplicado ENQUANTO o corpo é lido, pedaço a
//    pedaço — a leitura é cancelada no instante em que o acumulado ultrapassa
//    o teto, nunca depois de já ter bufferizado tudo.
//
// Nunca lança — toda falha de leitura vira `{ ok: false, motivo }`.

export type ResultadoDoCorpoLimitado =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

/**
 * A forma mínima de requisição que esta função precisa — `headers` e `body`,
 * a mesma forma de `Request`/`NextRequest`. Assinatura reduzida de propósito:
 * é o que permite testar sem montar um `NextRequest` completo.
 */
export interface RequisicaoComCorpo {
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Lê o corpo de `req` como texto UTF-8, recusando ANTES de bufferizar mais do
 * que `tetoBytes`.
 */
export async function lerCorpoComTeto(
  req: RequisicaoComCorpo,
  tetoBytes: number,
): Promise<ResultadoDoCorpoLimitado> {
  const declaradoHeader = req.headers.get("content-length");
  const declarado = declaradoHeader !== null ? Number(declaradoHeader) : NaN;
  if (Number.isFinite(declarado) && declarado > tetoBytes) {
    return {
      ok: false,
      motivo: `o corpo declara ${declarado} bytes no cabeçalho Content-Length — acima do teto de ${tetoBytes} bytes`,
    };
  }

  if (!req.body) return { ok: true, texto: "" };

  const reader = req.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > tetoBytes) {
        await reader.cancel(`corpo excede o teto de ${tetoBytes} bytes`).catch(() => {});
        return { ok: false, motivo: `o corpo excede o teto de ${tetoBytes} bytes` };
      }
      pedacos.push(value);
    }
  } catch (e) {
    return {
      ok: false,
      motivo: e instanceof Error ? e.message : "erro ao ler o corpo da requisição",
    };
  }

  return { ok: true, texto: Buffer.concat(pedacos.map((p) => Buffer.from(p))).toString("utf8") };
}
