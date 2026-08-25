// diagnostico.ts — a leitura da resposta da Resend, separada da rota para
// poder ser provada sozinha.
//
// ── A ARMADILHA QUE ESTA FUNÇÃO EXISTE PARA NÃO REPETIR (25/08/2026) ────────
//
// A sonda `GET /api/agency/diagnostico-de-email` nasceu dizendo, diante de um
// 401 da Resend, "a Resend recusou a chave". Rodou em produção e a Resend
// respondeu isto:
//
//     401 {"statusCode":401,"message":"This API key is restricted to only
//          send emails","name":"restricted_api_key"}
//
// A chave é VÁLIDA. Ela só não tem permissão de LISTAR domínios — é uma chave
// de envio, que é exatamente o que uma chave de aplicação deve ser. A sonda
// escrita para acabar com o "status de erro virou motivo" cometeu o mesmo erro
// na primeira volta: leu o 401 e não leu a mensagem.
//
// Doutrina da casa, agora com um terceiro caso na conta: um 400 era falta de
// saldo, um 404 era host morto, um 401 é chave de envio funcionando.
// **O motivo está na mensagem.**

export type LeituraDaResend = {
  /** A chave foi aceita como credencial? (mesmo sem poder listar domínios) */
  chaveValida: boolean;
  /** A chave é de envio apenas — não lista domínios. Não é defeito. */
  restritaAEnvio: boolean;
  motivo: string;
};

export function lerRespostaDaResend(status: number, corpo: string): LeituraDaResend {
  if (status === 200) {
    return { chaveValida: true, restritaAEnvio: false, motivo: "a Resend aceitou a chave e listou os domínios." };
  }
  // A mensagem, não o status. `restricted_api_key` chega como 401 e significa
  // o OPOSTO de "chave recusada": a credencial foi reconhecida, só não tem
  // escopo de leitura.
  if (/restricted_api_key/.test(corpo)) {
    return {
      chaveValida: true,
      restritaAEnvio: true,
      motivo:
        "a chave é VÁLIDA e é de envio apenas (`restricted_api_key`): a Resend reconheceu a credencial e apenas não permite LISTAR domínios com ela. Não é defeito — chave de aplicação deve ser assim.",
    };
  }
  return { chaveValida: false, restritaAEnvio: false, motivo: `a Resend não aceitou a chave — HTTP ${status}: ${corpo}` };
}
