// verba-declarada.ts — quando a conta passa do que o cliente disse poder pagar,
// alguém tem que dizer isso na cara dele.
//
// ─── O CASO QUE PRODUZIU ESTE ARQUIVO ────────────────────────────────────────
//
// CityJobs, 16/08/2026, piloto ao vivo, briefing feito pelo próprio CEO.
//
// O cliente disse: *"olha o nosso budget, estamos pensando algo em torno de
// R$ 500 por mês"*. A faixa foi capturada e guardada. Quarenta e oito segundos
// depois a casa devolveu:
//
//     "a estimativa fica entre R$ 1.800 e R$ 3.400 por mês"
//
// 3,6× o que ele tinha acabado de declarar — e **nenhuma palavra** sobre a
// diferença. Nem "sei que passa do que você falou", nem "temos algo que cabe".
// Silêncio, e um número três vezes maior.
//
// Esse é o pior tipo de resposta comercial que existe: o cliente declara o
// limite dele e a casa finge que não ouviu. Não é ganância — é pior, é
// desatenção. O cliente lê como "eles não estavam me escutando", fecha a
// conversa, e a agência nunca descobre que tinha dois produtos na prateleira
// que cabiam no bolso dele.
//
// ─── POR QUE ISTO É UM MÓDULO, E NÃO UMA FRASE NO PROMPT ─────────────────────
//
// Porque prompt é sugestão e esta casa roda 100% IA, sem revisor humano antes
// do cliente. "Reconheça a verba do cliente" escrito em prosa é exatamente o
// tipo de regra que o modelo cumpre em nove conversas e esquece na décima — e a
// décima é a que vira reclamação. Aqui o confronto é CALCULADO junto com o
// número, viaja gravado com ele e é renderizado por código.
//
// ─── E POR QUE NENHUM PREÇO NASCE AQUI ───────────────────────────────────────
//
// A fonte oficial de preço é a tabela do conselho (`lib/agency/planos.ts`).
// Este módulo não cria valor, não arredonda, não "faz um precinho": ele FILTRA
// a tabela pelo teto que o cliente declarou. Se um dia o Pulso deixar de custar
// R$ 49, esta oferta muda sozinha — porque ela nunca soube o número, só sabe
// perguntar à tabela. Preço inventado por IA não chega ao cliente desta casa.

// ─── ESTE MÓDULO É FONTE ÚNICA, E ISSO FOI PAGO PARA SE APRENDER ─────────────
//
// Em 16/08/2026 duas frentes construíram esta MESMA regra no mesmo dia, sem uma
// saber da outra: este arquivo e um `verba-vs-estimativa.ts` (APAGADO no mesmo
// dia — não procure, ele não existe mais em disco), cada um servindo
// uma superfície — este, o caminho do PROSPECT (`live-calculator`,
// `briefing-conversation`, `orcamento-do-briefing`); o outro, o caminho da CASA
// (o dossiê do lead e a fila `/agency/leads`).
//
// Duas implementações do mesmo julgamento comercial não ficam iguais: elas
// divergem no dia em que alguém mexe numa só. E o jeito que esta casa
// descobriria a divergência é o pior possível — **o cliente ouvindo uma coisa na
// conversa e lendo outra na proposta**. Por isso o outro arquivo foi APAGADO, e
// não deixado "para compatibilidade": arquivo órfão que ninguém lê é dívida que
// envelhece calada.
//
// O que veio de lá e vale a pena saber que é deliberado:
//   • a IMPLANTAÇÃO viaja na mesma frase do preço (ver `textoDaVerbaEstourada`);
//   • o que cada degrau NÃO inclui viaja junto da oferta;
//   • o rótulo mostrado ao cliente é normalizado (ver `confrontoDeVerba`).
// A régua de disparo já era a mesma nos dois — piso da estimativa contra teto da
// verba —, o que é a única razão de a consolidação ter sido barata.

import { PLANOS, precoEmReais } from "../planos";
import { normalizarFaixa, tetoDaFaixa } from "./negociacao";

/** Um degrau da tabela do conselho que cabe no que o cliente declarou. */
export interface PlanoQueCabe {
  nome: string;
  preco: number;
  paraQuem: string;
  /** Cobrada uma vez, na entrada. `null` = isenta.
   *
   *  Viaja no objeto, e não só no texto, para que NENHUMA superfície consiga
   *  oferecer o degrau escondendo o custo de entrada. Dizer "cabe nos seus
   *  R$ 500" calando os R$ 390 do Ritmo é a mesma desonestidade que este módulo
   *  veio corrigir, com o sinal trocado. */
  implantacao: number | null;
  /** O que este degrau NÃO faz. É esta lista que evita a briga do terceiro mês:
   *  oferecer o plano barato escondendo o corte fecha a venda e perde o
   *  cliente. */
  naoInclui: string[];
}

export interface ConfrontoDeVerba {
  /** O teto da faixa que o cliente declarou, em reais. */
  teto: number;
  /** Como o cliente declarou a verba — a frase dele, não o número interno. */
  rotulo: string;
  /** Quanto o PISO da estimativa passa do teto. Sempre > 0: confronto que não
   *  estoura não é confronto, é silêncio justificado. */
  diferenca: number;
  /** Os degraus da tabela do conselho que cabem no teto, do mais barato ao mais
   *  caro. Pode vir vazia — e vazia é informação, não erro. */
  cabemNaVerba: PlanoQueCabe[];
}

/**
 * Confronta a estimativa com a verba que o cliente declarou.
 *
 * Devolve `null` — ou seja, NADA a dizer sobre verba — em três casos, e os três
 * são deliberados:
 *
 *   • **faixa desconhecida.** O cliente não disse quanto pode gastar. Inventar
 *     um teto para depois avisar que a conta estourou é constranger a pessoa
 *     com um limite que ela nunca declarou.
 *   • **estimativa sem número** (piso ≤ 0). Não existe "passou da verba" quando
 *     não há conta.
 *   • **a conta cabe.** Cliente que pode pagar não precisa ouvir sobre dinheiro
 *     que sobra. Aviso que aparece sempre vira ruído e para de ser lido.
 *
 * O corte é pelo PISO da estimativa (`totalMin`), não pelo topo: se nem o menor
 * valor possível cabe, não cabe. Cortar pelo topo faria a casa calar em
 * "R$ 400 a R$ 3.000 para quem tem R$ 500" — tecnicamente cabe, na prática não.
 */
export function confrontoDeVerba(
  faixaDeclarada: unknown,
  totalMin: number,
): ConfrontoDeVerba | null {
  // ── A VERBA DITA COM AS PALAVRAS DO CLIENTE TAMBÉM É VERBA ────────────────
  //
  // `tetoDaFaixa` só reconhece o vocabulário interno da casa: o id da faixa
  // ("pacote") ou o rótulo exato ("entre R$ 150 e R$ 500"). Isso serve para o
  // que o modelo devolve — e falha justamente para o que a PESSOA escreve.
  //
  // Cliente falso, 23/08/2026: perguntado quanto podia investir, respondeu
  // *"Nosso orçamento é de R$ 500 por mês."* O campo foi gravado direitinho, e
  // ainda assim `tetoDaFaixa` devolveu `null` — a frase não é rótulo de faixa.
  // Sem teto não há confronto, e sem confronto o cliente recebe a estimativa
  // cheia sem uma palavra sobre a diferença. O defeito de 16/08 sobrevivendo
  // dentro do módulo escrito para matá-lo.
  //
  // A leitura do valor declarado é o SEGUNDO caminho, nunca o primeiro: quando
  // a faixa oficial é reconhecida, ela manda (inclusive para devolver `null` em
  // "acima de R$ 5.000", que é teto infinito e não confronta com nada).
  const declarado = tetoDeclaradoEmReais(faixaDeclarada);
  const teto = tetoDaFaixa(faixaDeclarada) ?? declarado;
  if (teto === null || !Number.isFinite(teto)) return null;

  if (typeof totalMin !== "number" || !Number.isFinite(totalMin) || totalMin <= 0) return null;
  if (totalMin <= teto) return null;

  const cabemNaVerba = PLANOS.filter((p) => p.preco <= teto)
    .sort((a, b) => a.preco - b.preco)
    .map((p) => ({
      nome: p.nome,
      preco: p.preco,
      paraQuem: p.paraQuem,
      implantacao: p.implantacao,
      naoInclui: p.naoInclui,
    }));

  // O RÓTULO É NORMALIZADO ANTES DE VOLTAR PARA A CARA DO CLIENTE.
  //
  // `budgetRange` chega ora como rótulo ("entre R$ 150 e R$ 500"), ora como o
  // id da faixa ("pacote") — `tetoDaFaixa` aceita os dois de propósito, porque
  // o modelo devolve o que viu no escopo acumulado. Sem esta linha, o id cru
  // vazava para o texto e o cliente lia *"você comentou que pensa em investir
  // pacote por mês"*. O fallback preserva a frase original: normalizar nunca
  // pode APAGAR o que a pessoa disse.
  //
  // Quando o teto veio da frase do cliente, o rótulo é o VALOR normalizado, não
  // a frase inteira: a frase entrava crua na sentença e o cliente lia *"você
  // comentou que pensa em investir Nosso orçamento é de R$ 500 por mês. por
  // mês"*. Nomear a diferença só funciona se a frase que a nomeia for legível.
  const rotulo = normalizarFaixa(faixaDeclarada)
    ?? (declarado !== null ? precoEmReais(declarado) : String(faixaDeclarada).trim());

  return {
    teto,
    rotulo,
    diferenca: totalMin - teto,
    cabemNaVerba,
  };
}

/**
 * O teto que o cliente declarou EM PALAVRAS, em reais. `null` quando a frase não
 * traz número nenhum de dinheiro.
 *
 * Pega o MAIOR valor citado, e isso é deliberado: "de R$ 300 a R$ 600" é uma
 * pessoa dizendo que o limite dela é 600. Ficar com o 300 faria a casa avisar
 * que estourou a verba de quem ainda tinha folga — desnecessário, e o aviso que
 * aparece à toa é o aviso que para de ser lido.
 *
 * Exige dígito e contexto de dinheiro ("R$", "reais", "mil", "k"). Texto livre
 * sem número — "uns quinhentos reais" — continua devolvendo `null`: deduzir
 * valor de palavra por extenso é chutar o bolso do cliente, e o guardrail desta
 * casa diz que ausência de informação não é informação.
 */
export function tetoDeclaradoEmReais(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const t = valor.toLowerCase();
  const achados: number[] = [];

  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:mil\b|k\b)/g)) {
    achados.push(Math.round(parseFloat(m[1].replace(",", ".")) * 1000));
  }
  for (const m of t.matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)|(\d{1,3}(?:\.\d{3})+|\d+)\s*reais/g)) {
    const bruto = (m[1] ?? m[2]).replace(/\./g, "");
    achados.push(parseInt(bruto, 10));
  }

  // A janela existe para barrar número que não é verba: "500" solto num texto
  // sem moeda não entra (o regex já exige moeda), e valores absurdos dos dois
  // lados denunciam leitura errada — melhor não confrontar do que confrontar
  // com um teto inventado.
  const validos = achados.filter((n) => Number.isFinite(n) && n >= 50 && n <= 1_000_000);
  if (validos.length === 0) return null;
  return Math.max(...validos);
}

/**
 * O que o cliente lê quando a conta passa da verba dele.
 *
 * O tom é decisão de casa e está aqui de propósito, para não ser reescrito a
 * cada conversa por um modelo de humor variável: **nomear a diferença sem
 * constranger ninguém**. Não pede desculpa (o preço é o preço), não empurra o
 * plano caro, não sugere que ele deveria gastar mais, e nunca deixa a pessoa
 * sem próximo passo — porque toda faixa tem produto nesta casa.
 */
export function textoDaVerbaEstourada(c: ConfrontoDeVerba): string[] {
  const linhas: string[] = [];

  linhas.push(
    // ⚠️ O RÓTULO ENTRA COMO ESTÁ, sem `toLowerCase()`. Ele já nasce em
    // minúscula em `FAIXAS` ("entre R$ 150 e R$ 500", "até R$ 150", "acima de
    // R$ 5.000"), então minusculizar não ajudava a encaixar a frase — só
    // derrubava a única coisa maiúscula que importava, a sigla da moeda. O
    // cliente lia *"pensa em investir entre r$ 150 e r$ 500 por mês"*.
    `Sobre a sua verba: você comentou que pensa em investir ${c.rotulo} por mês, ` +
      `e a estimativa acima passa disso — são cerca de ${precoEmReais(c.diferenca)} a mais, no melhor caso. ` +
      `Preferimos te dizer isso agora do que mandar um número que não cabe no seu momento.`,
  );

  if (c.cabemNaVerba.length > 0) {
    linhas.push("");
    linhas.push(`O que cabe em até ${precoEmReais(c.teto)} por mês:`);
    for (const p of c.cabemNaVerba) {
      // A IMPLANTAÇÃO ENTRA NA MESMA LINHA DO PREÇO, nunca num rodapé.
      // Quem lê "cabe no meu bolso" precisa ler o custo de entrada no mesmo
      // fôlego: o Ritmo é R$ 297/mês MAIS R$ 390 na entrada, e omitir isso
      // faria a conversa recomeçar do zero no dia do boleto.
      const entrada = p.implantacao
        ? `, mais ${precoEmReais(p.implantacao)} de implantação na entrada`
        : ", sem taxa de entrada";
      linhas.push(`• ${p.nome} — ${precoEmReais(p.preco)}/mês${entrada} — ${p.paraQuem}`);
      // E o que o degrau NÃO faz vai junto da oferta. Vender o plano barato
      // escondendo o corte fecha a venda e perde o cliente no terceiro mês.
      if (p.naoInclui.length > 0) {
        linhas.push(`  Fora deste plano: ${p.naoInclui.join(" · ")}.`);
      }
    }
    linhas.push("");
    linhas.push(
      "Dá para começar por um desses e subir quando fizer sentido. " +
        "Se preferir, me diga o que é prioridade para você e eu remonto o escopo dentro da sua verba.",
    );
  } else {
    // Faixa abaixo do degrau mais barato da casa. Não se inventa um preço para
    // caber: escala. O balcão (peça avulsa) existe, mas quem autoriza valor
    // fora da tabela é gente, não este arquivo.
    linhas.push("");
    linhas.push(
      "Nessa faixa a gente trabalha com peça avulsa, não com plano mensal — " +
        "me responda por aqui que eu monto uma opção sob medida para o seu momento.",
    );
  }

  return linhas;
}

// ─── QUANDO A VERBA E A CONTA NÃO FALAM DA MESMA COISA ───────────────────────
//
// `confrontoDeVerba` acima cobre UM lado: a conta passou do bolso do cliente.
// O caso Farol 27 (24/08/2026) mostrou o outro, que ninguém olhava.
//
// Ana declarou R$ 8.000/mês de honorários. A casa devolveu R$ 500–1.200/mês —
// cerca de um sétimo — e não disse nada, porque "cabe na verba" e aviso de
// sobra é ruído. Só que aqui não era sobra: era a casa tendo entendido um terço
// do pedido. Quando o cliente declara sete vezes o que a conta pede, o número
// improvável não é a verba dele; é o ESCOPO que a casa montou.
//
// Uma ordem de grandeza é a régua (10×), e ela vale para os dois lados: contra
// o PISO da estimativa, a mesma referência que o confronto acima usa, para que
// as duas leituras não divirjam no dia em que alguém mexer numa só.
export interface DivergenciaDeVerba {
  /** "verba_muito_acima" = o cliente declarou muito mais do que a conta pede —
   *  sinal de escopo entendido pela metade. "conta_muito_acima" = a conta pede
   *  ordens de grandeza mais que a verba declarada. */
  sentido: "verba_muito_acima" | "conta_muito_acima";
  tetoDeclarado: number;
  pisoDaEstimativa: number;
  /** Quantas vezes um é maior que o outro, arredondado. */
  fator: number;
  /** O que precisa ser dito — em português, para gente ler. */
  aviso: string;
}

/** Fator a partir do qual a diferença deixa de ser negociação e vira suspeita
 *  de escopo mal entendido. Uma ordem de grandeza. */
export const FATOR_DE_DIVERGENCIA = 10;

export function divergenciaDeVerba(
  faixaDeclarada: unknown,
  totalMin: number,
): DivergenciaDeVerba | null {
  const teto = tetoDaFaixa(faixaDeclarada) ?? tetoDeclaradoEmReais(faixaDeclarada);
  if (teto === null || !Number.isFinite(teto) || teto <= 0) return null;
  if (typeof totalMin !== "number" || !Number.isFinite(totalMin) || totalMin <= 0) return null;

  if (teto / totalMin >= FATOR_DE_DIVERGENCIA) {
    const fator = Math.round(teto / totalMin);
    return {
      sentido: "verba_muito_acima",
      tetoDeclarado: teto,
      pisoDaEstimativa: totalMin,
      fator,
      aviso:
        `O cliente declarou ${precoEmReais(teto)} e o escopo montado cota a partir de ` +
        `${precoEmReais(totalMin)} — cerca de ${fator}× menos. Uma diferença dessa ordem quase sempre ` +
        `significa que a casa entendeu só uma parte do pedido. Confirmar o escopo com o cliente ANTES de enviar número.`,
    };
  }
  if (totalMin / teto >= FATOR_DE_DIVERGENCIA) {
    const fator = Math.round(totalMin / teto);
    return {
      sentido: "conta_muito_acima",
      tetoDeclarado: teto,
      pisoDaEstimativa: totalMin,
      fator,
      aviso:
        `A conta parte de ${precoEmReais(totalMin)} contra ${precoEmReais(teto)} declarados — ` +
        `cerca de ${fator}× mais. Confirmar o escopo antes de enviar número.`,
    };
  }
  return null;
}
