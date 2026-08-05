// instrumentation.ts — roda UMA vez, quando o servidor sobe.
//
// É onde o relógio da agência é ligado. Next.js chama `register()` uma vez por
// instância do servidor, antes de atender a primeira requisição.
//
// A checagem do runtime não é decoração: este arquivo também é avaliado no
// runtime edge, onde não existe Prisma nem `setInterval` de longa duração.
// Ligar o relógio lá quebraria o build.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
