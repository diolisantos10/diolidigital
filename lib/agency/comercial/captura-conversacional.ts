// PEDIR O CONTATO COMO QUEM CONVERSA — uma pergunta de cada vez, no passo de
// confirmação, sem formulário e sem validação que trava.
//
// ── AS DUAS CICATRIZES QUE MANDAM NESTE ARQUIVO, E ELAS PUXAM PARA LADOS OPOSTOS
//
// 1. O INCIDENTE DO "SÓ ISSO" (a razão de NÃO pedir no meio da descoberta).
//    O SDR pedia e-mail durante a conversa e VALIDAVA O FORMATO. O prospect
//    respondia "só isso" e o bot tratava aquilo como e-mail inválido, repetia a
//    pergunta e travava a pessoa antes de saber o que ela queria. O contrato
//    disso está em `__tests__/briefing/identity-capture.test.ts`, que continua
//    valendo INTEIRO: a descoberta não pede contato, e este arquivo não é
//    chamado por ela.
//
// 2. OS 51 DIAS (a razão de pedir de qualquer jeito). Três interessados com o
//    briefing inteiro gravado e nenhum canal. Não perguntar custou mais caro que
//    perguntar mal.
//
// A saída é o LUGAR e o JEITO, não o "se": pergunta-se no passo de confirmação,
// depois de a pessoa ter contado o negócio inteiro e com a proposta na tela —
// e pergunta-se como se conversa.
//
// ── O QUE "CONVERSACIONAL" SIGNIFICA AQUI, EM MECANISMO ────────────────────
//
//   • UMA pergunta por vez. Três campos empilhados são um formulário, e
//     formulário no fim de uma conversa quebra o único registro que ela tinha.
//   • PULAR sempre pode. Nenhum turno é obrigatório e nenhum botão fica apagado
//     esperando a pessoa adivinhar o que falta.
//   • Resposta que não dá para ler NÃO é erro: é um recado curto, uma vez, e a
//     pessoa segue. Nada é recusado, nada repete a mesma pergunta em laço.
//   • Nenhuma frase de validação de formato. As palavras do incidente —
//     "não parece válido", "formato", "nome@domínio" — são proibidas por teste.
//
// ── POR QUE O WHATSAPP VEM ANTES DO E-MAIL (escolha declarada) ─────────────
//
//   1. É por onde o cliente brasileiro responde. A casa já tinha declarado isso
//      em 08/08, quando o WhatsApp passou à frente na ordem dos canais.
//   2. É o CAMINHO MAIS CURTO ATÉ UM LEAD ALCANÇÁVEL. Um canal já basta para o
//      gate: quem responde o primeiro turno acabou. Pedir e-mail primeiro faria
//      o canal preferido custar dois turnos.
//   3. O e-mail vem depois como PERGUNTA OPCIONAL declarada ("se quiser") —
//      quem já deu o WhatsApp não é cobrado de novo.
//
// Este módulo é PURO: sem rede, sem IA, sem estado global. A tela só desenha o
// que ele decide, e é por isso que o comportamento dá para travar em teste.

import { emailValido, whatsappValido, normalizarWhatsapp } from "./contato-do-lead";

export type CampoDaCaptura = "nome" | "whatsapp" | "email";

export type EstadoDaCaptura = {
  nome: string;
  whatsapp: string;
  email: string;
};

export const ESTADO_INICIAL: EstadoDaCaptura = { nome: "", whatsapp: "", email: "" };

/**
 * A ordem dos turnos.
 *
 * O nome sai da fila quando o SDR já o capturou na descoberta — perguntar de
 * novo o que a pessoa acabou de dizer é o jeito mais rápido de parecer que
 * ninguém estava ouvindo.
 */
export function turnosDaCaptura(nomeJaConhecido: boolean): CampoDaCaptura[] {
  return nomeJaConhecido ? ["whatsapp", "email"] : ["nome", "whatsapp", "email"];
}

export type Pergunta = {
  campo: CampoDaCaptura;
  /** A frase, como uma pessoa perguntaria. */
  texto: string;
  /** O rótulo do botão que segue. */
  acao: string;
  /** `true` quando já existe canal: o turno vira oferta, não cobrança. */
  opcional: boolean;
  placeholder: string;
  tipo: "text" | "tel" | "email";
};

/** Já dá para falar com esta pessoa? Um canal basta — é a regra do gate. */
export function temCanal(estado: EstadoDaCaptura): boolean {
  return whatsappValido(estado.whatsapp) || emailValido(estado.email);
}

/**
 * A pergunta do turno, já sabendo o que a pessoa respondeu antes.
 *
 * O texto MUDA quando já existe canal: o e-mail deixa de ser "falta isto" e
 * passa a ser "se quiser". Cobrar duas vezes quem já respondeu é a definição de
 * formulário.
 */
export function perguntaDoTurno(campo: CampoDaCaptura, estado: EstadoDaCaptura, primeiroNome?: string | null): Pergunta {
  const oi = primeiroNome ? `${primeiroNome}, ` : "";
  if (campo === "nome") {
    return {
      campo,
      texto: "Antes de mandar sua proposta — como você se chama?",
      acao: "Continuar",
      opcional: false,
      placeholder: "Seu nome",
      tipo: "text",
    };
  }
  if (campo === "whatsapp") {
    return {
      campo,
      texto: `${oi}qual o seu WhatsApp? É por lá que a gente responde mais rápido.`,
      acao: "Continuar",
      opcional: false,
      placeholder: "DDD + número",
      tipo: "tel",
    };
  }
  // O turno do e-mail é o ÚLTIMO, e por isso o botão dele ENVIA. O rótulo diz
  // isso com todas as letras nos dois casos: "Continuar" num botão que fecha o
  // briefing é a tela mentindo sobre o que o clique faz — e quem clica sem canal
  // precisa saber que está enviando assim mesmo.
  return {
    campo,
    texto: temCanal(estado)
      ? "Quer receber a proposta por e-mail também? Se preferir só o WhatsApp, é só pular."
      : "E um e-mail? Serve qualquer um que você abra.",
    acao: temCanal(estado) ? "Receber minha proposta" : "Enviar meu briefing",
    opcional: true,
    placeholder: "seu@email.com",
    tipo: "email",
  };
}

export type Leitura = {
  /** O que foi entendido. `null` quando não deu para entender — e isso não é erro. */
  valor: string | null;
  /**
   * O que a tela diz de volta. Nulo na maioria dos casos.
   *
   * ⚠️ NUNCA fala de formato, de validade nem de "endereço inválido". Quem
   * respondeu "só isso" para uma pergunta de e-mail não errou nada: quem
   * perguntou na hora errada é que errou. Aqui a resposta é um convite, e seguir
   * em frente continua disponível no mesmo instante.
   */
  recado: string | null;
};

/**
 * Lê a resposta de um turno. **Nunca recusa, nunca repete a pergunta em laço.**
 *
 * Vazio é "pular", e pular é resposta legítima. Texto que não vira canal devolve
 * `valor: null` com um recado curto — a tela segue oferecendo pular no mesmo
 * lugar em que oferecia antes.
 */
export function lerResposta(campo: CampoDaCaptura, texto: string): Leitura {
  const t = (texto ?? "").trim();
  if (!t) return { valor: null, recado: null };

  if (campo === "nome") {
    // Nome não se valida. Se a pessoa escreveu algo, é como ela quer ser
    // chamada — e um piso de tamanho aqui recusaria "Zé".
    return { valor: t, recado: null };
  }

  if (campo === "whatsapp") {
    if (whatsappValido(t)) return { valor: normalizarWhatsapp(t), recado: null };
    return {
      valor: null,
      // O piso de 10 dígitos é o que impede "R$ 1.500" e "12 posts" de virarem
      // telefone. O recado explica o que falta SEM acusar a pessoa de errar.
      recado: "Faltou o DDD? Escreva com ele, ou siga sem — a gente resolve pelo e-mail.",
    };
  }

  if (emailValido(t)) return { valor: t, recado: null };
  return {
    valor: null,
    recado: "Não consegui identificar um e-mail aí. Pode escrever de novo, ou seguir sem ele.",
  };
}

/**
 * O que sobe para o servidor no fim da captura — ou `null` quando não há canal
 * nenhum.
 *
 * `null` é o caminho de quem recusou E o de quem pulou tudo, e os dois são
 * legítimos: o briefing sobe igual e grava como `lead_incompleto`. Quem decide
 * isso é o SERVIDOR (`POST /api/brain/client-requests`); esta função só entrega
 * o fato, e é por isso que ela não tem como "forçar" nada.
 */
export function contatoDaCaptura(estado: EstadoDaCaptura): { nome: string; email: string; whatsapp: string } | null {
  if (!temCanal(estado)) return null;
  return {
    nome: estado.nome.trim(),
    email: emailValido(estado.email) ? estado.email.trim() : "",
    whatsapp: whatsappValido(estado.whatsapp) ? estado.whatsapp.trim() : "",
  };
}

/**
 * A frase que quem NÃO deixa contato lê antes de seguir.
 *
 * Ela existe porque a tela não pode prometer o que não cumpre: sem canal, não há
 * como enviar a proposta, e "entramos em contato em até 1 dia útil" viraria
 * mentira. Diz onde a resposta fica e como a pessoa chega nela — sem canal, o
 * caminho de volta é ela quem abre.
 */
export const FRASE_SEM_CONTATO =
  "Sem WhatsApp nem e-mail não temos como te enviar nada. Seu briefing fica guardado inteiro, " +
  "e a proposta só sai quando você voltar a falar com a gente.";
