// A REGRA DO CONVITE — a decisão pura, sem banco. Um lugar só sabe "por que
// este convite não vale".
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (29/08/2026) ═══════════════════════════════
//
// `examinarConviteDeParceria` (`./convite-de-parceria.ts`) decide os seis
// motivos, mas só FALA quando alguém VOLTA com o link na mão — e o log
// (`[CONVITE-RECUSADO]`) só nasce nesse retorno. Ninguém consegue perguntar
// "quantos convites estão quebrados AGORA, sem esperar alguém reclamar?" sem
// repetir a decisão em outro lugar — e duas versões de "por que este convite
// não vale" divergiriam cedo ou tarde.
//
// Este módulo é essa decisão, extraída, pura e sem import de Prisma. Dois
// chamadores:
//
//   • `convite-de-parceria.ts` — decide em tempo real, com o banco na mão.
//   • `retrato-dos-convites.ts` — decide em lote, sobre linhas já lidas, para
//     um diagnóstico que qualquer um lê sem terminal.
//
// ═══ O QUE NÃO MUDA ═════════════════════════════════════════════════════════
//
// A ordem importa e é a de sempre: token_desconhecido → revogado → vencido →
// parceria_nao_esta_viva → vale. `sem_token` e `erro_de_banco` NÃO nascem
// aqui — são estado de QUEM CHAMA (chegou sem link; o banco caiu), nunca da
// linha em si.
export type MotivoDaRecusaDoConvite =
  | "sem_token"
  | "token_desconhecido"
  | "revogado"
  | "vencido"
  | "parceria_nao_esta_viva"
  | "erro_de_banco";

/** O convite, já lido do banco (ou `null` = token não encontrado). */
export type LinhaDeConvite = {
  clientId: string;
  expiraEm: Date;
  revogadoEm: Date | null;
};

/** A parceria, já lida do banco (ou `null` = este cliente não tem uma). */
export type LinhaDeParceria = {
  revogadaEm: Date | null;
  validaAte: Date;
} | null;

/**
 * A parceria está VIVA agora? A MESMA aritmética de `parceriaVivaDoCliente`
 * (`lib/agency/financeiro/parceria-do-parceiro.ts:190`), byte a byte:
 * sem linha → morta; revogada → morta; `validaAte` ilegível → morta;
 * `validaAte` no passado → morta.
 *
 * ⚠️ É `validaAte.getTime() < agora.getTime()` — **`<`, não `<=`**. Uma
 * parceria que vence EXATAMENTE agora ainda vale. Divergir disto faria esta
 * régua mentir sobre convites que a régua de produção continua aceitando.
 */
export function parceriaEstaViva(parceria: LinhaDeParceria, agora: Date): boolean {
  if (!parceria) return false;
  if (parceria.revogadaEm) return false;
  if (!(parceria.validaAte instanceof Date) || Number.isNaN(parceria.validaAte.getTime())) return false;
  if (parceria.validaAte.getTime() < agora.getTime()) return false;
  return true;
}

/**
 * A decisão inteira sobre UMA linha de convite, sem tocar banco.
 *
 * `null` significa "vale" — o convite reconhece o parceiro. Todo o resto é
 * recusa, com nome próprio.
 *
 * Ordem, e ela importa: `token_desconhecido` (convite nulo — o chamador não
 * achou a linha) → `revogado` → `vencido` → `parceria_nao_esta_viva`.
 */
export function decidirConvite(
  convite: LinhaDeConvite | null,
  parceria: LinhaDeParceria,
  agora: Date,
): MotivoDaRecusaDoConvite | null {
  if (!convite) return "token_desconhecido";
  if (convite.revogadoEm) return "revogado";
  if (convite.expiraEm.getTime() <= agora.getTime()) return "vencido";
  if (!parceriaEstaViva(parceria, agora)) return "parceria_nao_esta_viva";
  return null;
}
