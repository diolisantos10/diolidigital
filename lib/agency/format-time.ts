// ⚠️ ESTE ARQUIVO NÃO FORMATA MAIS NADA — ele delega.
//
// A implementação única mora em `lib/carimbo-de-tempo.ts` desde 15/08/2026
// ("tudo precisa ter hora e data", CEO). Estas três funções continuam existindo
// só para não quebrar quem já as chama; **em tela nova use `<Carimbo>`**
// (`components/ui/carimbo.tsx`), que mostra data absoluta E idade relativa
// juntas e sabe dizer "sem registro de quando" sem inventar data.
//
// O que mudou por baixo, e é conserto e não estilo: o fuso agora é fixo
// (`America/Sao_Paulo`). Antes, o mesmo instante saía com um dia no navegador do
// cliente e outro no servidor da Railway, que roda em UTC.

import { carimbar } from "@/lib/carimbo-de-tempo";

/** @deprecated Prefira `<Carimbo>` — mostra também a idade. */
export function formatDateTime(value: string | Date | null | undefined): string {
  return carimbar(value)?.absoluto ?? "—";
}

/** Data curta sem ano: "20/07". @deprecated Ano faltando foi reclamação do CEO. */
export function formatShort(value: string | Date | null | undefined): string {
  return carimbar(value)?.curto ?? "—";
}

/** Idade relativa — "agora", "há 5 min", "há 3 h", "há 2 dias".
 *  @deprecated Sozinha ela não audita: use `<Carimbo>`. */
export function timeAgo(value: string | Date | null | undefined): string {
  return carimbar(value)?.relativo ?? "—";
}
