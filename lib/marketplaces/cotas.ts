// ─── QUAIS PLATAFORMAS COBRAM COTA POR ENVIO ────────────────────────────────
//
// Hoje é uma só. A lista existe mesmo assim por dois motivos:
//
// 1. A segunda plataforma com cota não pode exigir um `if` novo em cada rota e
//    em cada tela — é assim que a regra se espalha e passa a divergir de si
//    mesma (o mapa de departamentos de 3 linhas do portal, 07/08).
// 2. **Ela mora em `lib/`, não numa rota.** O App Router valida os exports de um
//    `route.ts`: qualquer export que não seja um verbo HTTP ou opção de rota
//    reprova no `npm run build`. Constante compartilhada em arquivo de rota é
//    build quebrado esperando a hora.
//
// Plataforma FORA desta lista não tem cota conhecida — e isso é diferente de
// "tem cota infinita". Onde não há cota declarada, esta casa não conta conexão,
// e nenhuma tela afirma saldo.

export const PLATAFORMAS_COM_COTA = ["99freelas"] as const;

export function temCotaDeConexoes(plataforma: string): boolean {
  return (PLATAFORMAS_COM_COTA as readonly string[]).includes((plataforma ?? "").trim().toLowerCase());
}
