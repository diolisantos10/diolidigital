// perguntas-ao-cliente.ts — SÓ O QUE A AGÊNCIA NÃO PODE DEDUZIR.
//
// Regra da agência que finaliza (CEO, 04/10/2026): "Se o cliente não traz a
// informação completa, a agência finaliza." Público, concorrentes, objetivos,
// pilares — a agência DERIVA da essência da marca e marca como proposta. O que
// NÃO se deriva é FATO verificável: inventar preço, endereço ou horário é
// exatamente o "dado inventado vira entregável" que esta casa proíbe.
//
// Então o cliente recebe UMA lista curta, numa tela só, com os cinco fatos
// que o CEO nomeou — preço, endereço, horário, @ das redes, cardápio — e só os
// que faltam. Cada fato é medido na ficha única (a mesma que a produção lê).

import { lerProdutos, type FichaUnica } from "@/lib/agency/esteira/ficha-unica";

export type FatoDoCliente = "cardapio" | "precos" | "endereco" | "horario" | "arroba";

export interface Pergunta {
  fato: FatoDoCliente;
  rotulo: string;
  /** A pergunta, do jeito que se manda ao cliente. */
  pergunta: string;
  respondida: boolean;
  /** O que foi medido — para a equipe saber por que está aberta. */
  detalhe: string;
}

const ARROBA = /(^|\s)@[a-z0-9._]{2,}|instagram\.com\/[a-z0-9._]{2,}|tiktok\.com\/@?[a-z0-9._]{2,}/i;

export function perguntasAoCliente(ficha: FichaUnica): Pergunta[] {
  const produtos = lerProdutos(ficha.produtos);
  const semPreco = produtos.filter((p) => !p.preco);
  const temTexto = (v?: string) => Boolean(v && v.trim().length >= 4);

  return [
    {
      fato: "cardapio",
      rotulo: "Cardápio / catálogo",
      pergunta: "Pode mandar o cardápio (ou a lista de produtos e serviços) que está valendo hoje?",
      respondida: produtos.length > 0,
      detalhe: produtos.length > 0 ? `${produtos.length} item(ns) na ficha` : "nenhum produto na ficha",
    },
    {
      fato: "precos",
      rotulo: "Preços",
      pergunta: semPreco.length > 0 && produtos.length > 0
        ? `Qual é o preço de: ${semPreco.slice(0, 5).map((p) => p.nome).join(", ")}${semPreco.length > 5 ? "…" : ""}?`
        : "Quais são os preços atuais dos produtos e serviços?",
      respondida: produtos.length > 0 && semPreco.length === 0,
      detalhe: produtos.length === 0 ? "sem produtos, sem preço" : semPreco.length ? `${semPreco.length} item(ns) sem preço` : "todos com preço",
    },
    {
      fato: "endereco",
      rotulo: "Endereço",
      pergunta: "Qual é o endereço completo (rua, número, bairro e cidade)? Se atende só online ou por entrega, é só dizer.",
      respondida: temTexto(ficha.endereco),
      detalhe: temTexto(ficha.endereco) ? "preenchido" : "vazio na ficha",
    },
    {
      fato: "horario",
      rotulo: "Horário de funcionamento",
      pergunta: "Quais são os dias e horários de funcionamento?",
      respondida: temTexto(ficha.horario),
      detalhe: temTexto(ficha.horario) ? "preenchido" : "vazio na ficha",
    },
    {
      fato: "arroba",
      rotulo: "@ das redes",
      pergunta: "Qual é o @ do Instagram (e das outras redes que vocês usam)?",
      respondida: ARROBA.test(ficha.canais ?? ""),
      detalhe: ARROBA.test(ficha.canais ?? "") ? "há @ em Canais e redes" : "nenhum @ em Canais e redes",
    },
  ];
}

/** A mensagem pronta para a equipe copiar e mandar — só com o que falta.
 *  A casa NÃO envia sozinha (consentimento): quem manda é a pessoa. */
export function mensagemDePerguntas(nomeDoCliente: string, perguntas: Pergunta[]): string {
  const abertas = perguntas.filter((p) => !p.respondida);
  if (abertas.length === 0) return "";
  const linhas = abertas.map((p, i) => `${i + 1}. ${p.pergunta}`);
  return [
    `Oi! Aqui é da Dioli. Para fechar a ficha da ${nomeDoCliente}, só faltam ${abertas.length === 1 ? "uma coisa que só vocês sabem" : `${abertas.length} coisas que só vocês sabem`}:`,
    "",
    ...linhas,
    "",
    "O resto a gente completa por aqui. Obrigado!",
  ].join("\n");
}

/**
 * Junta itens novos aos produtos. Item com PREÇO cujo nome já existe SEM preço
 * SUBSTITUI aquela linha (é a resposta à pergunta "qual o preço do Temaki?");
 * o resto é acrescentado. Nada é apagado.
 */
export function mesclarProdutos(atual: string | undefined, resposta: string): string {
  const linhas = (atual ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const nome = (l: string) => (lerProdutos(l)[0]?.nome ?? l).trim().toLowerCase();
  for (const nova of resposta.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const lida = lerProdutos(nova)[0];
    const i = lida?.preco ? linhas.findIndex((l) => nome(l) === lida.nome.trim().toLowerCase() && !lerProdutos(l)[0]?.preco) : -1;
    if (i >= 0) linhas[i] = nova;
    else linhas.push(nova);
  }
  return linhas.join("\n");
}
