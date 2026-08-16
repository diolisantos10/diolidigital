// O AVISO POR E-MAIL AO CLIENTE ESTÁ LIGADO OU DESLIGADO? — a pergunta que só
// o log sabia responder, e o log ninguém lê.
//
// ── O incidente (16/08/2026, piloto do CEO) ─────────────────────────────────
//
//   [client-requests] confirmation e-mail skipped — RESEND_API_KEY not set
//
// Um cliente real mandaria briefing e anexos e não receberia nada. **A chave
// ausente não é o defeito** — a chave é do CEO. O defeito é que o estado
// "estamos sem avisar ninguém por e-mail" só existia dentro de um `console.warn`
// num container cujo log é rotativo e some no deploy seguinte.
//
// Este módulo é a resposta legível: uma função pura sobre o ambiente, para o
// registro de capacidades (`GET /api/capacidades`) e para a tela de operação da
// agência mostrarem a mesma verdade, sem duas leituras que divergem.
//
// ── A ARMADILHA QUE PRECISA ESTAR NA FRASE (docs/decisoes.md, 07/08/2026) ────
//
// Ter `RESEND_API_KEY` NÃO basta. Medido por DNS público em 07/08/2026:
//   • `diolidigital.com.br` — sem TXT, sem MX, sem `resend._domainkey`;
//   • `dioli.studio` (o exemplo em `lib/email/send.ts`) — NXDOMAIN.
// Sem domínio verificado, `sendEmail` cai em `onboarding@resend.dev`, que **só
// entrega para o dono da conta Resend**. Ou seja: configurar só a chave produz
// exatamente o mesmo silêncio de hoje, com a diferença de que ninguém mais
// suspeita. Por isso `oQueConfigurar` cita as DUAS variáveis e a verificação de
// domínio — uma frase que leva o CEO a configurar pela metade é pior que
// nenhuma frase.

export interface EstadoDoCanalDeEmail {
  /** true = a casa consegue enviar e-mail ao cliente. */
  ligado: boolean;
  /** true = há chave, mas o remetente é o compartilhado do Resend — entrega só
   *  para o dono da conta. Ligado "no papel", inútil na prática. */
  remetenteCompartilhado: boolean;
  /** O que a equipe lê, já em linguagem de negócio. */
  resumo: string;
  /** A frase para o CEO: o que configurar, sem nenhum valor de segredo. */
  oQueConfigurar: string;
}

/** A frase única. Vive aqui para não ser reescrita — e divergir — em cada tela. */
export const O_QUE_O_CEO_PRECISA_CONFIGURAR =
  "Para os avisos por e-mail ao cliente voltarem a funcionar, configure nas variáveis do Railway: " +
  "RESEND_API_KEY (a chave da conta Resend) e RESEND_FROM (o remetente, no formato " +
  '"Dioli Digital <contato@seudominio.com.br>"). ' +
  "Atenção — só a chave NÃO resolve: o domínio de RESEND_FROM precisa estar verificado dentro do Resend " +
  "(registros DNS de domínio e de DKIM). Sem essa verificação o sistema usa o remetente compartilhado do Resend, " +
  "que só entrega e-mail para o dono da conta — o cliente continua sem receber nada, e sem ninguém perceber.";

/** Os mesmos nomes que `lib/email/send.ts` lê. Um só lugar. */
export const VARIAVEIS_DO_CANAL = ["RESEND_API_KEY", "RESEND_FROM"] as const;

/**
 * Lê o ambiente e diz se o canal de e-mail ao cliente está de pé.
 *
 * `env` é injetável para o teste não depender do processo — e porque o portão
 * precisa exercitar as DUAS metades (configurado e não configurado) na mesma
 * execução.
 */
export function estadoDoCanalDeEmail(
  env: Record<string, string | undefined> = process.env,
): EstadoDoCanalDeEmail {
  const temChave = Boolean(env.RESEND_API_KEY?.trim());
  const remetente = env.RESEND_FROM?.trim() ?? "";

  if (!temChave) {
    return {
      ligado: false,
      remetenteCompartilhado: false,
      resumo:
        "Os avisos por e-mail ao cliente estão DESLIGADOS. Quem manda briefing pelo site não recebe " +
        "nenhuma confirmação por e-mail (a confirmação na conversa do portal continua funcionando).",
      oQueConfigurar: O_QUE_O_CEO_PRECISA_CONFIGURAR,
    };
  }

  if (!remetente) {
    return {
      ligado: false,
      remetenteCompartilhado: true,
      resumo:
        "O e-mail tem chave, mas NÃO tem remetente próprio (RESEND_FROM vazio). O sistema usa o remetente " +
        "compartilhado do Resend, que só entrega para o dono da conta — na prática, o cliente não recebe.",
      oQueConfigurar: O_QUE_O_CEO_PRECISA_CONFIGURAR,
    };
  }

  return {
    ligado: true,
    remetenteCompartilhado: false,
    resumo: `Avisos por e-mail ao cliente ligados, saindo de ${remetente}.`,
    // ⚠️ Continua na frase mesmo no caso "ligado": esta função lê variável de
    // ambiente, e **não** consegue verificar o DNS do domínio. Declarar "está
    // tudo certo" seria afirmar o que não foi medido.
    oQueConfigurar:
      "Confirme uma vez que o domínio deste remetente está verificado no Resend — este diagnóstico lê as " +
      "variáveis, não o DNS, e remetente não verificado entrega apenas para o dono da conta.",
  };
}
