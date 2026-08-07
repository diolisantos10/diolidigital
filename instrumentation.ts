// instrumentation.ts — roda UMA vez, quando o servidor sobe.
//
// É onde o relógio da agência é ligado. Next.js chama `register()` uma vez por
// instância do servidor, antes de atender a primeira requisição.
//
// A checagem do runtime não é decoração: este arquivo também é avaliado no
// runtime edge, onde não existe Prisma nem `setInterval` de longa duração.
// Ligar o relógio lá quebraria o build.

/**
 * Parada a pedido da hospedagem NÃO é queda.
 *
 * ── O incidente (06/08/2026) ──────────────────────────────────────────────
 * O CEO recebeu "Deployment crashed for diolidigital". O log do container
 * mostrava o oposto de um crash: migrations aplicadas, seed ok, "Ready",
 * atendendo — e vinte minutos depois um SIGTERM, que é o Railway trocando o
 * container velho pelo novo. Nada quebrou. O deploy seguinte simplesmente
 * assumiu, como manda o processo.
 *
 * O que transformava rodízio em "crash": o servidor standalone do Next, ao
 * receber SIGTERM, sai com `process.exit(143)` de propósito
 * (node_modules/next/dist/server/lib/start-server.js). 143 é saída != 0, e
 * saída != 0 é como a hospedagem reconhece container que morreu de defeito.
 * Resultado: TODO deploy gerava um alerta de queda.
 *
 * Isso é pior que um alarme inútil — é um alarme que ENSINA a ignorar alarme.
 * Quando a produção cair de verdade, o e-mail vai ter o mesmo assunto dos
 * outros trinta da semana.
 *
 * O conserto é dizer a verdade no código de saída: pedido de parada atendido
 * com sucesso sai 0. Nada de sinal é suprimido — queda de verdade (exceção não
 * tratada, OOM, falha de boot) continua saindo != 0 e continua sendo alarme,
 * porque queda de verdade não chega por SIGTERM.
 *
 * O par disto vive em `scripts/start.sh`, que exporta NEXT_MANUAL_SIG_HANDLE=1
 * — sem ele o Next registra o handler dele e este aqui nunca é chamado. As
 * duas metades andam juntas; `__tests__/plataforma/parada-nao-e-queda.test.ts`
 * é quem impede uma de sumir sem a outra.
 */
function pararSemParecerQueda(): void {
  // Sem a variável, quem manda no sinal é o Next (exit 143). Registrar por
  // cima seria disputar o mesmo sinal com ele — o handler dele também roda.
  if (!process.env.NEXT_MANUAL_SIG_HANDLE) return;

  let parando = false;
  const encerrar = (sinal: string) => () => {
    if (parando) return; // segundo sinal não reentra
    parando = true;
    console.log(`▶ ${sinal} recebido — parada a pedido da hospedagem, encerrando com código 0.`);
    // Saída imediata e síncrona, igual à do Next: nada aqui pode ficar
    // pendurado esperando promessa, senão a hospedagem manda SIGKILL e a
    // parada limpa vira morte suja. O despertador já usa `unref`, então não
    // segura o processo.
    process.exit(0);
  };

  process.on("SIGTERM", encerrar("SIGTERM"));
  process.on("SIGINT", encerrar("SIGINT"));
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  pararSemParecerQueda();

  const { ligarDespertador } = await import("@/lib/agency/despertador");
  ligarDespertador();

  // Conserto de dado guardado por variável de ambiente: roda UMA vez, quando
  // `BACKFILL_CARROSSEL_CLIENT_ID` está definida, e imprime o ensaio inteiro no
  // log antes de escrever qualquer coisa. Sem a variável, silêncio total.
  //
  // Por que aqui e não no despertador: é uma vez, não uma rotina. No relógio de
  // 5 em 5 minutos o ensaio viraria ruído — e o log deste ensaio é justamente a
  // conferência tela por tela de quem autorizou.
  const { agendarBackfillDeBoot } = await import("@/lib/agency/media/backfill-boot");
  agendarBackfillDeBoot();
}
