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
 * O PRÓXIMO turno — ou `null` quando a captura acabou.
 *
 * ── 🔴 A ELIMINAÇÃO (16/08/2026), E ELA É A CORREÇÃO DE UM DEFEITO MEDIDO ───
 *
 * **Com canal na mão, o turno do e-mail NÃO EXISTE.** Não é atalho de
 * conveniência: é o conserto pela raiz de um defeito que o `experiencia`
 * reproduziu no navegador, a 375px, com o POST observado:
 *
 *   1. a pessoa digitava o WhatsApp e ele era gravado no estado do turno;
 *   2. o turno seguinte (e-mail) dizia *"se preferir só o WhatsApp, é só pular"*
 *      e **não tinha botão de pular**;
 *   3. o único controle com cara de saída era "Prefiro não deixar contato
 *      agora", que mandava `contato: null`;
 *   4. resultado: **ela deu o número e o sistema dizia que ela não deu.** O
 *      registro virava `lead_incompleto` e a tela final respondia "como não
 *      temos WhatsApp nem e-mail seu, não temos como te enviar a proposta".
 *
 * São os 51 dias do Sushi Cazza produzidos pelo conserto dos 51 dias. A causa
 * é estrutural: fatiar o formulário criou **estado já commitado**, e uma saída
 * herdada do formulário único passou a destruí-lo. No formulário não havia
 * estado para destruir.
 *
 * Dava para remendar pondo um botão "Pular" no último turno. Não foi o caminho:
 * o turno **compra o canal que a própria casa declara não usar**
 * (`contato-do-lead.ts`: *"e-mail de login do Google chega em caixa que ninguém
 * lê"*), e o preço dele era manter viva a única tela onde a pessoa consegue
 * destruir o canal que ela usa. Um canal já basta para o gate. **Turno que não
 * existe não tem como ter defeito.**
 *
 * Um segundo canal, se um dia for desejado, é assunto da tela de SUCESSO —
 * briefing já salvo, lead já alcançável, e ali pular não custa nada.
 */
export function proximoCampo(
  estado: EstadoDaCaptura,
  perguntados: CampoDaCaptura[],
  nomeJaConhecido: boolean,
): CampoDaCaptura | null {
  // A ELIMINAÇÃO. Um canal basta — e o que vem depois dele só tem a perder.
  if (temCanal(estado)) return null;
  if (!nomeJaConhecido && !perguntados.includes("nome")) return "nome";
  if (!perguntados.includes("whatsapp")) return "whatsapp";
  if (!perguntados.includes("email")) return "email";
  return null;
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
      // Responder este turno com um número legível ENCERRA a captura (um canal
      // basta). O rótulo diz isso: "Continuar" num botão que envia o briefing é
      // a tela mentindo sobre o próprio clique.
      acao: "Receber minha proposta",
      opcional: false,
      placeholder: "DDD + número",
      tipo: "tel",
    };
  }
  // O turno do e-mail só existe para quem NÃO deu WhatsApp — ver a eliminação em
  // `proximoCampo`. Por isso não há mais o texto "se preferir só o WhatsApp, é
  // só pular": ele era exibido numa tela sem botão de pular, e essa promessa
  // vazia empurrava a pessoa para o único controle parecido, que apagava o
  // contato dela.
  return {
    campo,
    texto: "Sem WhatsApp, então — me passa um e-mail? Serve qualquer um que você abra.",
    acao: "Receber minha proposta",
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

// ── A MÁQUINA DE TURNOS ────────────────────────────────────────────────────
//
// Ela mora aqui, e não dentro do componente, por um motivo aprendido caro: o
// defeito que o `experiencia` achou era de ESTADO ENTRE TURNOS, e estado dentro
// de componente só se testa clicando. Aqui ele se testa chamando função — e a
// classe inteira do defeito ("uma saída apaga o que outro turno já gravou")
// fica travada por teste, não por atenção de quem revisa.

export type Captura = {
  estado: EstadoDaCaptura;
  /** O turno em cartaz. `null` quando a captura terminou. */
  campo: CampoDaCaptura | null;
  perguntados: CampoDaCaptura[];
  /** O recado do turno atual. Some assim que a pessoa avança. */
  recado: string | null;
  nomeJaConhecido: boolean;
};

export function iniciarCaptura(nomeConhecido?: string | null): Captura {
  const nome = nomeConhecido?.trim() ?? "";
  const estado: EstadoDaCaptura = { ...ESTADO_INICIAL, nome };
  return {
    estado,
    campo: proximoCampo(estado, [], !!nome),
    perguntados: [],
    recado: null,
    nomeJaConhecido: !!nome,
  };
}

function avancar(c: Captura, estado: EstadoDaCaptura): Captura {
  const perguntados = c.campo ? [...c.perguntados, c.campo] : c.perguntados;
  return {
    ...c,
    estado,
    perguntados,
    campo: proximoCampo(estado, perguntados, c.nomeJaConhecido),
    recado: null,
  };
}

/**
 * A pessoa respondeu o turno.
 *
 * TRÊS saídas, e a terceira é o segundo conserto de 16/08:
 *   • resposta legível → grava e avança;
 *   • resposta VAZIA → é pular, avança sem gravar (pular é resposta legítima);
 *   • resposta ilegível → **fica no mesmo turno com um recado, e o que foi
 *     digitado NÃO é descartado.**
 *
 * ⚠️ A versão anterior avançava em silêncio na SEGUNDA resposta ilegível,
 * jogando fora o texto. Era o mesmo defeito do outro conserto deste dia com
 * outra roupa: **perder o que a pessoa deu sem avisar.** Agora nada avança
 * sozinho — a saída existe, é visível ("Pular"), e é sempre um clique
 * deliberado. Isso não é o laço do incidente do "só isso": lá o bot repetia a
 * pergunta e a pessoa NÃO TINHA COMO SEGUIR; aqui seguir está sempre a um
 * toque, no mesmo lugar de sempre.
 */
export function responderTurno(c: Captura, texto: string): Captura {
  if (!c.campo) return c;
  const t = (texto ?? "").trim();
  if (!t) return avancar(c, c.estado); // vazio é pular

  const { valor, recado } = lerResposta(c.campo, t);
  if (valor) return avancar(c, { ...c.estado, [c.campo]: valor });
  return { ...c, recado };
}

/** Pular explicitamente. Nunca grava, nunca apaga, sempre anda. */
export function pularTurno(c: Captura): Captura {
  return c.campo ? avancar(c, c.estado) : c;
}

/** A captura acabou e o briefing pode subir. */
export function capturaTerminou(c: Captura): boolean {
  return c.campo === null;
}

/**
 * Ainda vem outro turno depois deste?
 *
 * É o que decide se o botão diz "Continuar" ou se ele ENVIA. Botão que diz
 * "Continuar" e fecha o briefing é a tela mentindo sobre o próprio clique — foi
 * um dos rótulos consertados em 16/08.
 */
export function ehUltimoTurno(c: Captura): boolean {
  if (!c.campo) return true;
  return proximoCampo(c.estado, [...c.perguntados, c.campo], c.nomeJaConhecido) === null;
}

export type SaidaDaRecusa =
  | { acao: "enviar_sem_contato" }
  /** 🔴 A BLINDAGEM. Ver abaixo. */
  | { acao: "enviar_com_contato"; contato: { nome: string; email: string; whatsapp: string } };

/**
 * 🔴 RECUSAR NUNCA APAGA CONTATO JÁ DADO — e isto é trava, não confiança.
 *
 * Com a eliminação do turno de e-mail não existe mais tela em que a pessoa
 * tenha canal gravado E veja o botão de recusar. Esta função continua existindo
 * assim mesmo, porque **o defeito era da CLASSE, não do caso**: no dia em que
 * alguém acrescentar um turno depois do canal — um "qual seu Instagram?", uma
 * pergunta de horário —, a saída antiga volta a ter o que destruir.
 *
 * A regra em uma frase: **é impossível esta captura entregar `null` para alguém
 * que já disse como falar com ela.**
 */
export function recusar(c: Captura): SaidaDaRecusa {
  const contato = contatoDaCaptura(c.estado);
  if (contato) return { acao: "enviar_com_contato", contato };
  return { acao: "enviar_sem_contato" };
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
  "Sem WhatsApp nem e-mail não temos como te enviar nada. Se seguir assim, seu briefing é " +
  "enviado agora e fica guardado inteiro — a proposta só sai quando você voltar a falar com a gente.";

/**
 * A frase só aparece para quem AINDA não deu canal.
 *
 * Duas verdades na mesma tela foi o terceiro achado do `experiencia`: quem
 * acabou de digitar o WhatsApp lia "sem WhatsApp nem e-mail não temos como te
 * enviar nada". Uma tela que contradiz o que a pessoa acabou de fazer ensina
 * que o sistema não registrou — e ela vai embora ou repete tudo.
 */
export function mostrarFraseSemContato(estado: EstadoDaCaptura): boolean {
  return !temCanal(estado);
}
