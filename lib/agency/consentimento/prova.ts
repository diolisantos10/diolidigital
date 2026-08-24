// prova.ts — O CONSENTIMENTO VIRA TRAVA.
//
// ─── O QUE O CASE FAROL 27 MEDIU (24/08/2026) ────────────────────────────────
//
// O cliente sintético declarou ~6 mil contatos de WhatsApp e pediu disparo. Em
// nenhum lugar do código havia algo que perguntasse de onde aquela base veio.
// A proteção existia só como frase em documento — e frase não barra POST.
//
// Doutrina da casa (guardrail 4): **prompt é aviso; código é trava.** Base sem
// comprovação de consentimento é risco de LGPD e risco de bloqueio do número da
// casa. Não é detalhe de documentação: é a porta mais cara que existe aqui.
//
// ─── A DISTINÇÃO QUE ESTE ARQUIVO EXISTE PARA NÃO PERDER ─────────────────────
//
// **Resposta não é abordagem.** Já é doutrina desta casa
// (`comercial/quem-bateu-na-porta.ts`: "quem aborda lead é gente, não máquina"),
// e sem essa distinção a trava vira ou censura ou teatro:
//
//   • RESPOSTA  — a pessoa escreveu para a marca. Responder é o que ela pediu.
//                 A prova é a mensagem recebida, que já está gravada
//                 (`WhatsAppMessage.direction = "in"`).
//   • ABORDAGEM — a casa fala primeiro. Aqui é preciso PROVA, e a prova tem de
//                 apontar para um lugar onde alguém possa conferi-la.
//
// ─── FALHA FECHADA, COM INSTRUÇÃO GÊMEA ──────────────────────────────────────
//
// Na dúvida, não usa. E toda recusa devolve `oQueFalta` em português, item a
// item: proibição sem instrução gêmea empurra o operador para o contorno — ele
// exporta a base e dispara pelo celular dele, que é pior que o que a trava
// impediu.

/** De onde a autorização veio. Cada origem tem uma exigência diferente porque
 *  cada uma é conferível de um jeito diferente. */
export type OrigemDaProva =
  /** A pessoa escreveu para a marca primeiro. Prova = a mensagem recebida. */
  | "mensagem_recebida"
  /** O dono do contato entregou o próprio número à casa (briefing, cadastro,
   *  proposta). Prova = o registro em que ele o digitou. */
  | "contato_entregue_pelo_proprio_dono"
  /** Base importada com comprovação registrada: onde o opt-in foi coletado,
   *  quando, por quem, e qual era o texto aceito. */
  | "base_importada_com_comprovacao"
  /** Base importada e ponto. É o caso do Farol 27 — e é o que esta trava barra. */
  | "base_importada_sem_comprovacao";

export type NaturezaDoContato = "resposta" | "abordagem";

/** O que o chamador precisa declarar para atravessar uma porta de saída.
 *  Campo OBRIGATÓRIO no input das portas: quem abrir uma porta nova e não
 *  declarar isto não compila. */
export type ConsentimentoDeSaida =
  | {
      natureza: "resposta";
      /** Id da mensagem recebida que está sendo respondida. Sem ela, não é
       *  resposta — é abordagem se dizendo resposta. */
      mensagemRecebidaId: string;
    }
  | {
      natureza: "abordagem";
      origem: OrigemDaProva;
      /** Onde a prova está guardada, em texto que um humano consegue seguir:
       *  "ClientRequestDb#abc123 (briefing de 12/08)", "planilha X, aba Y". */
      referencia?: string;
      /** Quando o consentimento foi coletado (ISO). */
      coletadoEm?: string;
      /** Quem coletou / respondeu por ele. */
      responsavel?: string;
      /** O TEXTO que a pessoa aceitou. "Aceitou os termos" não é texto aceito —
       *  é resumo de quem quer que tenha aceitado. */
      textoDoAceite?: string;
    };

export interface VeredictoDeConsentimento {
  pode: boolean;
  /** Curto, para log e para `error:`. */
  motivo: string;
  /** O que precisa existir para destravar — em português, para o operador. */
  oQueFalta: string[];
}

const PODE: VeredictoDeConsentimento = { pode: true, motivo: "ok", oQueFalta: [] };

/** As origens que, sozinhas, autorizam a casa a falar PRIMEIRO. */
const ORIGENS_QUE_AUTORIZAM: readonly OrigemDaProva[] = [
  "mensagem_recebida",
  "contato_entregue_pelo_proprio_dono",
  "base_importada_com_comprovacao",
];

/** O que uma base importada precisa trazer, campo a campo, com o nome que o
 *  operador entende. Ordem = ordem de leitura de quem vai destravar. */
const EXIGENCIAS_DA_BASE_IMPORTADA: Array<{
  campo: "referencia" | "coletadoEm" | "responsavel" | "textoDoAceite";
  falta: string;
}> = [
  { campo: "referencia", falta: "ONDE a prova está guardada (arquivo, print, link do formulário) — 'está com o cliente' não é um lugar." },
  { campo: "coletadoEm", falta: "QUANDO o contato autorizou receber mensagem desta marca (data)." },
  { campo: "responsavel", falta: "QUEM coletou o aceite e responde por ele (nome de gente, não 'a agência')." },
  { campo: "textoDoAceite", falta: "O TEXTO que a pessoa aceitou, literal. 'Aceitou os termos' é resumo, não é prova." },
];

/**
 * Pode sair? `pode: false` fecha a porta e diz o que falta.
 *
 * Pura de propósito: a trava mais cara da casa não pode depender de subir banco
 * para ser conferida. Quem precisa do banco é o RESOLVEDOR
 * (`quem-pode-receber.ts`), que monta a prova; o juízo é aqui.
 */
export function avaliarConsentimento(
  c: ConsentimentoDeSaida | undefined | null,
): VeredictoDeConsentimento {
  // Ausência de informação não é informação (guardrail 1). Chamador que não
  // declarou nada é tratado como base sem prova — nunca como "deve estar ok".
  if (!c) {
    return {
      pode: false,
      motivo: "consentimento_nao_declarado",
      oQueFalta: [
        "Quem está mandando não declarou se isto é RESPOSTA (a pessoa escreveu primeiro) ou ABORDAGEM (a casa fala primeiro).",
        "Declare `consentimento` na chamada. Sem isso a mensagem não sai — na dúvida, não usa.",
      ],
    };
  }

  if (c.natureza === "resposta") {
    if (!c.mensagemRecebidaId?.trim()) {
      return {
        pode: false,
        motivo: "resposta_sem_mensagem_recebida",
        oQueFalta: [
          "Isto foi declarado como RESPOSTA, mas não aponta a mensagem que está sendo respondida.",
          "Responder é livre; abordar não é. Se a pessoa não escreveu para a marca, isto é abordagem — declare como abordagem e traga a prova do consentimento.",
        ],
      };
    }
    return PODE;
  }

  if (!ORIGENS_QUE_AUTORIZAM.includes(c.origem)) {
    return {
      pode: false,
      motivo: "base_sem_comprovacao_de_consentimento",
      oQueFalta: [
        "Esta base foi importada e não tem comprovação de consentimento registrada. Ela NÃO é utilizável para abordagem.",
        "Para destravar, registre a prova e reenvie com origem `base_importada_com_comprovacao`:",
        ...EXIGENCIAS_DA_BASE_IMPORTADA.map((e) => `- ${e.falta}`),
        "Se não existe prova, o caminho não é contornar: é pedir o aceite de novo, por um canal que a pessoa já use com a marca.",
        "Sem isso, o risco é duplo e real: multa de LGPD para o cliente e bloqueio do número de WhatsApp da casa.",
      ],
    };
  }

  if (c.origem === "base_importada_com_comprovacao") {
    const faltando = EXIGENCIAS_DA_BASE_IMPORTADA.filter((e) => !c[e.campo]?.trim());
    if (faltando.length) {
      return {
        pode: false,
        motivo: "comprovacao_incompleta",
        oQueFalta: [
          "A base diz ter comprovação, mas a comprovação está incompleta. Falta:",
          ...faltando.map((e) => `- ${e.falta}`),
        ],
      };
    }
    return PODE;
  }

  // `contato_entregue_pelo_proprio_dono` e `mensagem_recebida` precisam apontar
  // o registro. Origem sem referência é palavra — e palavra não é prova.
  if (!c.referencia?.trim()) {
    return {
      pode: false,
      motivo: "prova_sem_referencia",
      oQueFalta: [
        `A origem declarada ("${c.origem}") não aponta NENHUM registro.`,
        "Informe `referencia` com o registro conferível (ex.: \"ClientRequestDb#abc123 — briefing enviado pelo próprio dono\").",
      ],
    };
  }
  return PODE;
}

/** O texto que vai para o operador quando a porta fecha. Uma linha por item —
 *  é o que aparece no log, na tela e no erro da rota. */
export function comoDestravar(v: VeredictoDeConsentimento): string {
  return v.oQueFalta.join("\n");
}

// ─── O LIVRO DAS ABORDAGENS BARRADAS ─────────────────────────────────────────
//
// Ledger próprio, e NÃO o do cliente falso (`trava-de-saida.ts`): aquele
// responde "nada de teste vazou"; este responde "quantas vezes a casa tentou
// abordar alguém sem prova de consentimento". Somar os dois produziria um
// número que não responde nenhuma das duas perguntas.

export type AbordagemBarrada = {
  canal: "whatsapp" | "email";
  destino: string;
  motivo: string;
  em: string;
};

const barradas: AbordagemBarrada[] = [];

export function registrarAbordagemBarrada(a: Omit<AbordagemBarrada, "em">): void {
  barradas.push({ ...a, em: new Date().toISOString() });
}

export function abordagensBarradas(): readonly AbordagemBarrada[] {
  return barradas;
}

export function limparAbordagensBarradas(): void {
  barradas.length = 0;
}
