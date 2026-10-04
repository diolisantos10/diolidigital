// endereco-do-cofre.ts — ONDE fica o cofre da Control Room.
//
// O endereço vem do contrato da Control Room (PR #118 dela, 04/10/2026). Ele
// é de SERVIÇO: o servidor do Dioli fala com o servidor da Control Room. Nunca
// vira link, nunca aparece para cliente, nunca vai para tela. Por isso, e só
// por isso, este é o ÚNICO arquivo de código autorizado a carregar um endereço
// `*.up.railway.app` — a trava `__tests__/http/endereco-da-casa.test.ts` o
// nomeia como exceção, com este motivo.
//
// `CONTROL_ROOM_URL` no ambiente continua mandando (troca de domínio, staging).

export const ENDERECO_PADRAO_DO_COFRE = "https://controlroom-production-b42c.up.railway.app";

export function enderecoBaseDoCofre(): string {
  return (process.env.CONTROL_ROOM_URL?.trim() || ENDERECO_PADRAO_DO_COFRE).replace(/\/+$/, "");
}
