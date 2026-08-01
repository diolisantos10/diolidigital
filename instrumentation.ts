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
}
