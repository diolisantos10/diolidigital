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

/** O que falta, com nome. Código e não frase: cada falta leva a uma pergunta
 *  diferente, e uma contagem não diz qual (guardrail 6 da casa). */
export type FaltaNoBriefing = "chamada-para-acao";

export interface VereditoDoBriefing {
  /** Pode produzir? */
  completo: boolean;
  faltas: FaltaNoBriefing[];
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
  textoDoCliente: string,
): VereditoDoBriefing {
  if (!produto?.exigeChamadaParaAcao) {
    return { completo: true, faltas: [], pergunta: "" };
  }

  if (temChamadaParaAcao(textoDoCliente)) {
    return { completo: true, faltas: [], pergunta: "" };
  }

  return {
    completo: false,
    faltas: ["chamada-para-acao"],
    pergunta:
      "Falta uma coisa para eu fazer o story certo: O QUE VOCÊ QUER QUE A PESSOA FAÇA depois de ver a peça? " +
      'Pode ser em três palavras — "chamar no WhatsApp", "vir na loja", "pedir pelo link da bio", ' +
      '"encomendar pelo direct". Sem isso eu teria que inventar a ação, e peça com ação inventada ' +
      "manda o seu cliente para um lugar que talvez nem exista. Me diz e eu já produzo.",
  };
}
