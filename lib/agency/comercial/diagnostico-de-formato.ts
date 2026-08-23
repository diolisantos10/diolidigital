// DIAGNÓSTICO DE FORMATO — o que fazer com um "malformado" que não diz nada.
//
// ─── O BECO SEM SAÍDA QUE ESTE ARQUIVO ABRE ─────────────────────────────────
//
// Quando o SDR devolve um pacote que não é JSON válido, o guarda barra a fala e
// o diário do piloto grava:
//
//   "[resposta barrada pelo guarda: malformado — a resposta do modelo terminou
//    de ser escrita e ainda assim não veio em formato válido — quem respondeu
//    ao visitante foi o motor de regras.]"
//
// Está certo barrar, e está certo NÃO gravar o texto barrado (repetir a fala
// proibida seria gravar exatamente o que o guarda impediu de sair). Só que
// sobra uma palavra — "malformado" — e nada mais. Em 23/08/2026 isso aconteceu
// DUAS VEZES SEGUIDAS em produção e ninguém teve como perguntar por quê: o
// texto que falhou não existe em lugar nenhum, e sem ele "malformado" é um
// nome, não um achado.
//
// ─── A LINHA QUE ESTE ARQUIVO NÃO ATRAVESSA ─────────────────────────────────
//
// Ele NÃO devolve o texto do modelo, nem um pedaço dele, nem a mensagem de erro
// do `JSON.parse` — essa mensagem cita o trecho ofensor ("Unexpected token …")
// e gravá-la seria contrabandear a fala barrada para dentro do diário pela
// porta dos fundos. O que sai daqui é FORMA: houve chave de abertura? sobrou
// texto fora do JSON? em que posição o parser desistiu? quanto media o pacote?
//
// Números e palavras fixas escritas neste arquivo. Nada que o modelo escreveu.
//
// ⚠️ Isto é INSTRUMENTO, não conserto. Ele não faz um pacote malformado virar
// válido — e não deve. O guarda continua barrando; o que muda é que a próxima
// vez deixa rastro suficiente para alguém achar a causa. Enquanto a causa não
// for achada e consertada, `malformado` continua sendo defeito aberto.

/** O laudo, em pedaços que se leem sozinhos. Só forma, nunca conteúdo. */
export type FormaDaFalha = {
  /** O texto tinha `{`? Sem ele o modelo não tentou JSON — respondeu em prosa. */
  temChaveDeAbertura: boolean;
  /** O texto tinha `}`? */
  temChaveDeFechamento: boolean;
  /** Caracteres ANTES do primeiro `{` — preâmbulo ("Claro! Aqui está:"). */
  lixoAntes: number;
  /** Caracteres DEPOIS do último `}` — epílogo, comentário, cerca de código. */
  lixoDepois: number;
  /** Onde o parser desistiu, quando ele soube dizer. `null` = não soube. */
  posicaoDaFalha: number | null;
  /** Tamanho do pacote inteiro, em caracteres. */
  tamanho: number;
};

/**
 * Olha um texto que JÁ foi recusado por `extractJson` e pelo remendo, e diz
 * QUE FORMA ele tinha. Nunca lança: um diagnóstico que quebra a rota seria pior
 * que diagnóstico nenhum.
 */
export function formaDaFalha(text: string): FormaDaFalha {
  const bruto = typeof text === "string" ? text : "";
  // A mesma limpeza de cerca de código que `extractJson` faz, para o laudo
  // falar do mesmo texto que o parser viu — e não de um texto parecido.
  const limpo = bruto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");

  let posicaoDaFalha: number | null = null;
  if (inicio !== -1 && fim !== -1 && fim > inicio) {
    try {
      JSON.parse(limpo.slice(inicio, fim + 1));
    } catch (e) {
      // SÓ o número. A mensagem inteira cita o trecho que falhou, e o trecho é
      // fala barrada — ver o cabeçalho deste arquivo.
      const m = /position (\d+)/.exec(e instanceof Error ? e.message : "");
      posicaoDaFalha = m ? Number(m[1]) : null;
    }
  }

  return {
    temChaveDeAbertura: inicio !== -1,
    temChaveDeFechamento: fim !== -1,
    lixoAntes: inicio === -1 ? 0 : inicio,
    lixoDepois: fim === -1 ? 0 : Math.max(0, limpo.length - (fim + 1)),
    posicaoDaFalha,
    tamanho: bruto.length,
  };
}

/**
 * O laudo em uma frase, em português, para entrar no diário ao lado do motivo.
 *
 * Curto de propósito: quem lê o diário quer saber se o modelo respondeu em
 * prosa, se enfeitou o pacote com preâmbulo, ou se escreveu JSON de verdade e
 * errou lá dentro — três causas diferentes, três consertos diferentes.
 */
export function laudoEmUmaFrase(f: FormaDaFalha): string {
  if (!f.temChaveDeAbertura) {
    return `o modelo não abriu JSON nenhum (respondeu em prosa, ${f.tamanho} caracteres)`;
  }
  if (!f.temChaveDeFechamento) {
    return `o pacote abriu e não fechou (${f.tamanho} caracteres, sem "}")`;
  }
  const partes: string[] = [];
  if (f.lixoAntes > 0) partes.push(`${f.lixoAntes} caractere(s) de texto ANTES do pacote`);
  if (f.lixoDepois > 0) partes.push(`${f.lixoDepois} caractere(s) DEPOIS do pacote`);
  if (f.posicaoDaFalha !== null) partes.push(`o parser desistiu na posição ${f.posicaoDaFalha}`);
  if (partes.length === 0) return `pacote de ${f.tamanho} caracteres, sem causa aparente na forma`;
  return `${partes.join("; ")} (pacote de ${f.tamanho} caracteres)`;
}
