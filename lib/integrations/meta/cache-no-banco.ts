// cache-no-banco.ts — O CACHE DE LEITURA DA META, NO VOLUME.
//
// ─── POR QUE ELE SAIU DA MEMÓRIA ────────────────────────────────────────────
// O cache de `leitura.ts` e o de `ads.ts` eram `Map` de processo. Eles não são
// enfeite de performance: são o que impede o dashboard aberto três vezes de
// virar três rajadas de GET na MESMA conta da Meta — a assinatura exata do que
// restringiu a conta da agência em 03/08/2026.
//
// Em memória, esse freio tinha dois buracos com o mesmo formato do contador:
//   • TODO DEPLOY ESVAZIA. Esta casa publica várias vezes por dia; cada publish
//     devolve a primeira rajada de graça, e a rajada acontece justamente no
//     minuto seguinte ao deploy, quando alguém abre a tela para conferir;
//   • cada réplica tem o seu, então a mesma leitura é comprada N vezes.
//
// No volume, o resultado guardado atravessa deploy e réplica: quem já pagou a
// chamada paga por todo mundo, pelo tempo do TTL.
//
// ─── FAIL-OPEN, e por que aqui isso está certo ──────────────────────────────
// Cache que não responde = MISS. É o oposto do contador (`ritmo-no-banco.ts`,
// fail-closed) e é de propósito: cache é otimização, a TRAVA é o contador. Se o
// cache falhar, a chamada ainda passa pelo teto por hora — ninguém escapa do
// limite por causa de um SELECT que deu errado. Fosse fail-closed, uma falha de
// cache derrubaria o dashboard sem nenhum ganho de segurança.
//
// ─── O QUE PODE ENTRAR AQUI ─────────────────────────────────────────────────
// Métrica e conteúdo público do cliente (posts, alcance, gasto). NÃO entra nada
// que a casa não possa reler da Meta a qualquer momento, e NUNCA token,
// credencial ou dado pessoal de terceiro: a chave do cache é composta pelo id
// da CONEXÃO, nunca pelo token.

import { bancoDoRitmo } from "./ritmo-no-banco";

let agora: () => number = () => Date.now();

/** Só para teste: troca o relógio. O BANCO é o mesmo de `ritmo-no-banco.ts` —
 *  configure por `configurarRitmoNoBanco`. */
export function configurarCacheNoBanco(opts: { agora?: () => number } = {}): void {
  agora = opts.agora ?? (() => Date.now());
}

/**
 * Lê do cache. `null` = miss (inclusive quando o banco não respondeu).
 *
 * A linha vencida NÃO é apagada aqui: apagar no caminho de leitura põe uma
 * escrita em toda consulta. A faxina acontece na gravação, que já é escrita.
 */
export async function lerDoCacheNoBanco<T>(chave: string): Promise<T | null> {
  try {
    const b = await bancoDoRitmo();
    const linhas = await b.consultar<{ valorJson: string; validoAte: string }>(
      `SELECT valorJson, validoAte FROM MetaLeituraCache WHERE chave = ?`,
      [chave],
    );
    const linha = linhas[0];
    if (!linha) return null;
    if (new Date(linha.validoAte).getTime() <= agora()) return null;
    return JSON.parse(linha.valorJson) as T;
  } catch {
    // Miss. Ver "FAIL-OPEN" no cabeçalho: quem trava é o contador, não isto.
    return null;
  }
}

/**
 * Guarda no cache com validade `ttlMs`. Só SUCESSO deve chegar aqui — guardar
 * um erro por 10 minutos esconderia a reconexão que o usuário acabou de fazer.
 *
 * Nunca lança: falhar ao guardar não pode derrubar uma leitura que deu certo.
 */
export async function guardarNoCacheNoBanco(
  chave: string,
  valor: unknown,
  ttlMs: number,
): Promise<void> {
  const t = agora();
  try {
    const b = await bancoDoRitmo();
    await b.executar(
      `INSERT INTO MetaLeituraCache (chave, valorJson, validoAte, criadoEm)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
         valorJson = excluded.valorJson,
         validoAte = excluded.validoAte`,
      [chave, JSON.stringify(valor), new Date(t + ttlMs).toISOString(), new Date(t).toISOString()],
    );
    // Faxina barata, e só no caminho que já escreve. Sem ela o cache vira um
    // arquivo que só cresce no volume — e o volume é o que guarda o cliente.
    if (Math.random() < 0.05) {
      await b
        .executar(`DELETE FROM MetaLeituraCache WHERE validoAte < ?`, [new Date(t).toISOString()])
        .catch(() => 0);
    }
  } catch {
    /* ver acima: gravar cache não é o trabalho, é o atalho */
  }
}

/**
 * Esquece o que foi guardado. Com `prefixo`, só as chaves daquele prefixo.
 *
 * Existe para a RECONEXÃO: token novo não pode continuar servindo a resposta
 * guardada com o token velho — inclusive a resposta de erro que motivou a
 * reconexão.
 */
export async function limparCacheNoBanco(prefixo?: string): Promise<void> {
  try {
    const b = await bancoDoRitmo();
    if (prefixo) {
      await b.executar(`DELETE FROM MetaLeituraCache WHERE chave LIKE ?`, [`${prefixo}%`]);
    } else {
      await b.executar(`DELETE FROM MetaLeituraCache`, []);
    }
  } catch {
    /* idem */
  }
}
