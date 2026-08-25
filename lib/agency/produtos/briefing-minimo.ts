// briefing-minimo.ts — O QUE PRECISA ESTAR NA MESA ANTES DE PRODUZIR.
//
// ─── O BURACO, MEDIDO PELO AUDITOR (25/08/2026) ─────────────────────────────
//
// O item B inteiro do contrato de aceite estava NÃO COBERTO. `producao-de-
// pedido.ts` lê o briefing *"quando existe"*, e o Auditor passou um pedido com
// só descrição e objetivo — sem chamada para ação, sem material — e a casa
// PRODUZIU. Quer dizer: a máquina gastava IA e imagem para descobrir depois que
// faltava a informação sem a qual a peça não podia estar certa.
//
// O plano de recuperação lista a entrada mínima com todas as letras:
//
//   1. o que comunicar;            4. oferta, preço ou data, QUANDO HOUVER;
//   2. objetivo;                   5. material/referência, QUANDO INDISPENSÁVEL;
//   3. chamada para ação;          6. cliente e projeto responsáveis.
//
// O portal já cobra (1) e (2) na porta (`/api/portal/pedidos` devolve 422 com a
// pergunta), e (6) é derivado do token. Os itens (4) e (5) são CONDICIONAIS —
// "quando houver" não é obrigação, e transformá-los em obrigação barraria o
// pedido honesto de quem não tem oferta nenhuma.
//
// **O que faltava cobrar, e este arquivo cobra, é o (3).**
//
// ─── POR QUE A CHAMADA PARA AÇÃO NÃO É DETALHE ──────────────────────────────
//
// Story é peça de conversão: ele ocupa a tela inteira do celular por poucos
// segundos e some. Sem dizer o que a pessoa deve FAZER, a peça é um cartaz
// bonito — e o cliente pagou por uma peça que trabalha.
//
// Pior: sem CTA declarada, quem preenche a lacuna é o modelo. Ele inventa a
// ação ("chame no WhatsApp") e, com ela, o canal — um telefone que a agência
// não tem como sustentar. É o piso de verdade sendo obrigado a barrar depois o
// que este portão deveria ter perguntado antes.
//
// ─── LÉXICO, NÃO IA ─────────────────────────────────────────────────────────
//
// Mesma conduta de `leitura-de-formato.ts`: a leitura é determinística, roda no
// texto do PRÓPRIO cliente e não custa nada. Um portão que depende de provedor
// fica "indisponível" exatamente no dia em que mais importa.
//
// ⚠️ ELE SÓ AGE NO POSITIVO DA AUSÊNCIA. Achar a palavra é FATO ("há CTA"); não
// achar é "não achei", e o efeito é PERGUNTAR — nunca concluir que o cliente
// não quer ação nenhuma. Ausência de informação não é informação.

import { normalizar } from "@/lib/agency/esteira/leitura-do-pedido";
import type { ProdutoCanonico } from "./registro";

/**
 * OS VERBOS DE AÇÃO que uma chamada usa, no português que o cliente escreve.
 *
 * Lista larga de propósito: o custo de um falso POSITIVO aqui é deixar passar
 * um pedido sem CTA (que o especialista ainda pode resolver perguntando), e o
 * custo de um falso NEGATIVO é parar o pedido de alguém que escreveu a chamada
 * com outras palavras. O segundo incomoda mais, então a lista é generosa.
 *
 * Busca por raiz, não por palavra inteira: "agendar", "agende", "agendamento"
 * são a mesma intenção e não vale manter três linhas para isso.
 */
const VERBOS_DE_CHAMADA = [
  "cham", "liga", "ligue", "whats", "zap", "direct", "dm",
  "compr", "pedi", "peca", "encomend", "reserv", "agend", "marc",
  "visit", "venha", "vem ", "passa la", "conhec", "experiment",
  "clic", "acess", "link na bio", "arrast", "desliz", "toca aqui",
  "saiba mais", "confir", "garant", "aproveit", "inscrev", "cadastr",
  "responde", "comenta", "compartilh", "salv", "segue", "siga",
  "fale", "fala com", "consult", "orcament", "solicit",
];

/**
 * O que falta, com NOME. Código e não frase: cada falta leva a uma pergunta
 * diferente, e uma contagem não diz qual (guardrail 6 da casa).
 *
 * ── AS SEIS ENTRADAS DO PLANO, E O QUE CADA UMA É AQUI (25/08/2026) ────────
 *
 * O Auditor pegou este tipo com UM valor só enquanto o arquivo se chamava
 * "briefing mínimo" e o plano (§4) lista seis entradas. Cobrar um sexto e
 * chamar de mínimo é a mesma classe de erro que esta operação vem consertando:
 * o nome promete a régua inteira, o código tem um pedaço.
 *
 *   1. o que comunicar        → `o-que-comunicar`  (INCONDICIONAL, aqui)
 *   2. objetivo               → `objetivo`         (INCONDICIONAL, aqui)
 *   3. chamada para ação      → `chamada-para-acao`(INCONDICIONAL, aqui)
 *   4. oferta, preço ou data  → CONDICIONAL — "quando houver"
 *   5. material/referência    → CONDICIONAL — "quando indispensável"
 *   6. cliente e projeto      → estrutural: derivado do token do portal, e a
 *                               produção nem começa sem os dois (`produzirPedido`
 *                               recusa pedido sem projeto e sem tarefa).
 *
 * ── POR QUE 4 E 5 NÃO VIRAM OBRIGAÇÃO, E ISSO É DECISÃO, NÃO OMISSÃO ──────
 *
 * O plano escreveu "quando houver" e "quando indispensável" com todas as
 * letras. Transformar um condicional em obrigatório BARRA O PEDIDO CORRETO de
 * quem não tem oferta nenhuma e não precisa de material nenhum — e trava que
 * reprova o legítimo é desligada por quem a encontra, levando junto as que
 * funcionavam.
 *
 * Quem cuida do item 4 quando ele EXISTE é o piso de verdade: preço, data e
 * oferta afirmados na peça sem lastro no que o cliente informou são barrados lá,
 * em código, sem rede. Quem cuida do item 5 é `assess-resources` + a fila de
 * `MaterialRequest`, que pede o material que falta e **não pede de novo o que já
 * chegou** (`materiaisEntregues`, em `producao-de-pedido.ts`).
 *
 * Isto está escrito aqui para que a ausência deles seja LIDA como decisão
 * declarada, e não encontrada de novo como buraco.
 */
export type FaltaNoBriefing =
  | "o-que-comunicar"
  | "objetivo"
  | "chamada-para-acao";

export interface VereditoDoBriefing {
  /** Pode produzir? */
  completo: boolean;
  faltas: FaltaNoBriefing[];
  /** Os itens CONDICIONAIS do plano, com o motivo de não serem cobrados aqui.
   *  Existe para que a decisão seja legível de fora, em vez de ter que ser
   *  reencontrada lendo o código. */
  condicionaisDeclarados: string[];
  /**
   * A PERGUNTA, em português de gente, pronta para ir ao cliente. Vazia quando
   * não falta nada.
   *
   * "Solicitação acionável" é o termo do contrato de aceite, e acionável quer
   * dizer que a pessoa do outro lado sabe o que responder sem perguntar de
   * volta. Por isso a frase traz exemplos.
   */
  pergunta: string;
}

/** O cliente escreveu uma chamada para ação? */
export function temChamadaParaAcao(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? "");
  if (!t) return false;
  return VERBOS_DE_CHAMADA.some((v) => t.includes(v));
}

/**
 * O BRIEFING MÍNIMO DESTE PRODUTO ESTÁ NA MESA?
 *
 * Roda ANTES de qualquer chamada paga. Produto sem exigência declarada passa
 * direto — nenhum outro produto da casa muda de comportamento por causa deste
 * arquivo.
 */
export function conferirBriefingMinimo(
  produto: ProdutoCanonico | null,
  entrada: { oQueComunicar: string; objetivo: string },
): VereditoDoBriefing {
  const CONDICIONAIS = [
    "oferta/preço/data — o plano diz \"quando houver\"; quem confere, quando existe, é o piso de verdade",
    "material/referência — o plano diz \"quando indispensável\"; quem pede o que falta (e não pede de novo o que já chegou) é a fila de MaterialRequest",
  ];
  const vazio: VereditoDoBriefing = {
    completo: true, faltas: [], condicionaisDeclarados: CONDICIONAIS, pergunta: "",
  };
  if (!produto?.exigeBriefingMinimo) return { ...vazio, condicionaisDeclarados: [] };

  const faltas: FaltaNoBriefing[] = [];
  const perguntas: string[] = [];

  // 1. O QUE COMUNICAR. Conferido AQUI e não só na porta do portal de
  // propósito: o balcão e o pedido por mensagem chegam à mesma corrente por
  // outras portas, e uma trava que mora só numa delas é uma porta trancada num
  // prédio com três entradas.
  if (!temSubstancia(entrada.oQueComunicar)) {
    faltas.push("o-que-comunicar");
    perguntas.push(
      "Me conta com um pouco mais de detalhe O QUE você quer comunicar nessa peça — " +
      'uma frase já basta ("o pão de fermentação natural que sai às 7h").',
    );
  }

  // 2. OBJETIVO. Mesmo raciocínio: sem o porquê, quem escolhe o ângulo é o
  // modelo, e escolher ângulo é decidir o que a peça diz.
  if (!temSubstancia(entrada.objetivo)) {
    faltas.push("objetivo");
    perguntas.push(
      "E PARA QUÊ? Saber o objetivo muda a peça inteira — sem ele a equipe escolheria o ângulo no chute.",
    );
  }

  // 3. CHAMADA PARA AÇÃO.
  //
  // ⚠️ Procurada nos DOIS campos, e isso foi um achado do Auditor (25/08/2026).
  //
  // A versão anterior olhava só `oQueComunicar`. Mas "para quê" e "o que a
  // pessoa deve fazer" são a MESMA pergunta na cabeça de quem escreve: o
  // cliente que preenche o objetivo com "quero que chamem no WhatsApp" JÁ
  // respondeu a chamada para ação — e era barrado assim mesmo, com um pedido
  // de informação que ele acabara de dar. Cobrar duas vezes o que já foi dito
  // é a mesma falta de "não pedir de novo o material que já chegou".
  //
  // O campo onde a frase caiu é detalhe de formulário; a informação é a mesma.
  if (!temChamadaParaAcao(`${entrada.oQueComunicar}\n${entrada.objetivo}`)) {
    faltas.push("chamada-para-acao");
    perguntas.push(
      "O QUE VOCÊ QUER QUE A PESSOA FAÇA depois de ver a peça? Pode ser em três palavras — " +
      '"chamar no WhatsApp", "vir na loja", "pedir pelo link da bio", "encomendar pelo direct". ' +
      "Sem isso eu teria que inventar a ação, e peça com ação inventada manda o seu cliente " +
      "para um lugar que talvez nem exista.",
    );
  }

  if (faltas.length === 0) return vazio;

  return {
    completo: false,
    faltas,
    condicionaisDeclarados: CONDICIONAIS,
    pergunta:
      (faltas.length === 1
        ? "Falta uma coisa para eu fazer o story certo: "
        : `Faltam ${faltas.length} coisas para eu fazer o story certo: `) +
      perguntas.join(" · ") +
      " Me diz e eu já produzo.",
  };
}

/** O menor texto que ainda é uma resposta. Mesma régua da porta do portal
 *  (`MINIMO_DE_DESCRICAO`): "oi" e "?" não são briefing. */
function temSubstancia(v: string | null | undefined): boolean {
  return (v ?? "").trim().length >= 8;
}
