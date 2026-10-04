// A FRASE QUE O CLIENTE LÊ QUANDO O BOTÃO "CONTINUAR COM GOOGLE" FALHA.
//
// Antes (até 04/10/2026) o popup e a tela mostravam o código cru do Google —
// "redirect_uri_mismatch — Bad Request", "state_mismatch", "no_code". Para um
// dono de negócio isso é "o sistema quebrou". O código continua indo para o
// log do servidor (a agência precisa dele); para a pessoa, vai uma frase e uma
// saída: o formulário logo abaixo do botão.

export type MotivoDoGoogle =
  | "cancelado"
  | "expirado"
  | "nao_configurado"
  | "recusado"
  | "desconhecido";

/** Reduz o código cru (do Google ou nosso) a um motivo que a tela entende. */
export function motivoDoErroGoogle(codigo: string | null | undefined): MotivoDoGoogle {
  const c = (codigo ?? "").toLowerCase();
  if (!c) return "desconhecido";
  if (c.includes("access_denied") || c === "no_code") return "cancelado";
  if (c.includes("state_mismatch") || c.includes("invalid_grant")) return "expirado";
  if (c.includes("not configured") || c.includes("nao_configurado") || c.includes("invalid_client") || c.includes("redirect_uri")) return "nao_configurado";
  if (c.includes("token_exchange") || c.includes("userinfo")) return "recusado";
  return "desconhecido";
}

const FRASES: Record<MotivoDoGoogle, string> = {
  cancelado: "O acesso pelo Google foi cancelado.",
  expirado: "O tempo para entrar com o Google acabou.",
  nao_configurado: "O acesso pelo Google está indisponível no momento.",
  recusado: "O Google não confirmou o seu acesso desta vez.",
  desconhecido: "Não deu para entrar com o Google agora.",
};

/** Frase curta, sem código, sem nome técnico. Sempre termina com a saída. */
export function fraseDoErroGoogle(codigo: string | null | undefined): string {
  const motivo = motivoDoErroGoogle(codigo);
  const saida = motivo === "expirado" || motivo === "cancelado"
    ? "Tente de novo ou use o formulário abaixo."
    : "Use o formulário abaixo — chega do mesmo jeito.";
  return `${FRASES[motivo]} ${saida}`;
}
