// freios-de-saida.ts — AS TORNEIRAS DA SAÍDA. SERVER-ONLY.
//
// ─── O PROBLEMA QUE ISTO RESOLVE (15/08/2026) ───────────────────────────────
//
// Religar o relógio da agência (`despertador.ts`) era uma decisão CARA porque
// era tudo-ou-nada: a mesma batida que retoma produção, vira mês e recompõe
// peça também dispara WhatsApp para cliente real e escreve resposta em perfil
// PÚBLICO do Google. Não existia meio-termo — nenhuma variável, nenhuma flag,
// nenhum degrau que segurasse só a saída.
//
// O número que isso vale, medido no repositório: `dispatchWhatsAppNotifications`
// manda até 50 por rodada e `cobrarAFila` manda mais 50 na MESMA rodada. Depois
// de dias de silêncio, a primeira batida seriam **100 mensagens no mesmo
// minuto**, para gente de verdade.
//
// Estes freios são o meio-termo. Com eles, o relógio inteiro pode voltar a
// bater e a esteira andar por dentro **sem uma única mensagem chegar a
// cliente** — e cada torneira se abre depois, uma de cada vez, com a fila já
// medida.
//
// ─── NÃO É CAUTELA. É CUMPRIMENTO DE POLÍTICA. ─────────────────────────────
//
// O parecer do especialista `meta` (15/08/2026) deu **NÃO PODE** para o disparo
// de WhatsApp como ele está. A política da Meta exige DUAS coisas: (a) a pessoa
// ter dado o telefone **e** (b) opt-in explícito de que quer receber mensagem
// da empresa. **Esta casa não tem onde registrar (b)** — não existe coluna de
// opt-in em lugar nenhum do schema, logo não existe prova, logo não existe
// autorização.
//
// E a casa JÁ SABIA DISSO. `lib/agency/esteira/recompra.ts` diz, escrito, que
// não há onde registrar o opt-in — e por isso a régua de recompra se recusa a
// disparar WhatsApp e gera rascunho para gente. A mesma casa, no mesmo relógio,
// dispararia 100 pela porta do lado. O freio não é excesso de zelo: é a
// primeira metade da política sendo cumprida nas DUAS portas em vez de em uma.
//
// ─── AS QUATRO PROPRIEDADES, COPIADAS E NÃO REINVENTADAS ───────────────────
//
// O molde é `lib/integrations/meta/trava-de-publicacao.ts` + `PUBLICACAO_
// ORGANICA`, que é o melhor mecanismo desta casa. Um segundo padrão divergiria,
// e o incidente voltaria pela porta que ninguém está olhando.
//
// 1. **FAIL-CLOSED.** Variável ausente, vazia ou com qualquer outro valor =
//    freio PUXADO. Ausência de decisão nunca vira permissão.
// 2. **LIDO NA HORA DA CHAMADA.** Constante de módulo congelaria o valor no
//    boot, e o freio precisa valer quando alguém o solta.
// 3. **NO TOPO DO CAMINHO ÚNICO.** A conferência mora dentro da função que
//    manda — não no chamador —, porque quem escrever o terceiro chamador amanhã
//    nunca leu este arquivo.
// 4. **FECHADO NÃO CONSOME.** Freio que descarta trabalho é pior que freio
//    nenhum: a mensagem retida continua pendente, ninguém marca nada como
//    enviado, e quando a torneira abrir ela sai. O que o freio produz é uma
//    CONTAGEM — e ela vai para o pulso, porque freio silencioso vira fila morta
//    invisível, que é a cicatriz que esta casa já tem.
//
// ⚠️ NADA AQUI LIGA COISA ALGUMA. Todo freio nasce PUXADO. Soltar é gesto
//    declarado do CEO, uma torneira de cada vez, com a fila medida antes.

/** O valor que solta o freio. Qualquer outra coisa — inclusive vazio — segura.
 *  É o mesmo valor de `PUBLICACAO_ORGANICA`: um só vocabulário para a casa. */
export const VALOR_QUE_LIBERA = "liberada";

/** O freio da SAÍDA DE WHATSAPP. Segura as duas pernas que disparam para
 *  cliente real na mesma batida do relógio. */
export const CHAVE_DO_WHATSAPP = "WHATSAPP_SAIDA";

/** O freio da RESPOSTA AUTOMÁTICA EM AVALIAÇÃO DO GOOGLE. Segura a perna que
 *  escreve em perfil público, embaixo do nome do cliente, para sempre. */
export const CHAVE_DAS_AVALIACOES = "AVALIACOES_GOOGLE";

/** O que uma perna freada devolve para o relógio contar no pulso. */
export interface FreioPuxado {
  /** O nome da variável de ambiente. Vai no motivo para o operador saber o que
   *  soltar — motivo sem o nome da chave manda alguém procurar. */
  nome: string;
  /** Em português, dizendo o que ficou retido e como se solta. */
  motivo: string;
  /** Quanto ficou esperando. Zero é notícia boa; ausente é notícia nenhuma. */
  retidos: number;
}

/** Lê o ambiente AGORA. Ver a propriedade 2 no cabeçalho. */
function solto(chave: string): boolean {
  return (process.env[chave] ?? "").trim().toLowerCase() === VALOR_QUE_LIBERA;
}

// ─── WHATSAPP ───────────────────────────────────────────────────────────────

export function whatsappLiberado(): boolean {
  return solto(CHAVE_DO_WHATSAPP);
}

export const FRASE_WHATSAPP_FECHADO =
  "A saída de WhatsApp desta casa está FECHADA: nenhuma mensagem vai a cliente " +
  `real enquanto ${CHAVE_DO_WHATSAPP} não for solto. O que estava na fila NÃO foi ` +
  "descartado, não foi marcado como enviado e não foi consumido — ele sai quando a " +
  "torneira abrir. O freio está puxado porque a política da Meta exige opt-in " +
  "explícito de quem recebe, e esta casa não tem onde registrar esse opt-in (não " +
  "existe coluna, logo não existe prova, logo não existe autorização) — é a mesma " +
  "conclusão que já está escrita em `esteira/recompra.ts`. " +
  `Para abrir, a casa define ${CHAVE_DO_WHATSAPP}=${VALOR_QUE_LIBERA}.`;

/** O parecer do freio do WhatsApp, com a contagem do que ficou. */
export function freioDoWhatsapp(retidos: number): FreioPuxado {
  return { nome: CHAVE_DO_WHATSAPP, motivo: FRASE_WHATSAPP_FECHADO, retidos };
}

// ─── AVALIAÇÕES DO GOOGLE ───────────────────────────────────────────────────

export function avaliacoesLiberadas(): boolean {
  return solto(CHAVE_DAS_AVALIACOES);
}

export const FRASE_AVALIACOES_FECHADO =
  "A resposta automática a avaliação do Google está FECHADA nesta casa: " +
  `enquanto ${CHAVE_DAS_AVALIACOES} não for solto, nada é lido, escrito ou publicado ` +
  "em perfil de cliente. Nenhuma avaliação foi perdida — nada é registrado com o " +
  "freio puxado, então a rodada seguinte à abertura enxerga a fila inteira. O freio " +
  "está puxado por parecer formal do especialista `google` (NÃO PODE, 15/08/2026): " +
  "resposta em avaliação é PÚBLICA, PERMANENTE e notifica quem escreveu na hora. " +
  `Para abrir, a casa define ${CHAVE_DAS_AVALIACOES}=${VALOR_QUE_LIBERA}.`;

/** O parecer do freio das avaliações, com a contagem do que ficou. */
export function freioDasAvaliacoes(retidos: number): FreioPuxado {
  return { nome: CHAVE_DAS_AVALIACOES, motivo: FRASE_AVALIACOES_FECHADO, retidos };
}
