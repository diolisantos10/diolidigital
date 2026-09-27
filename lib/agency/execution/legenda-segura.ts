// legenda-segura.ts — SANITIZAÇÃO DE TEXTO DO CLIENTE. PURA, SEM CUSTO.
//
// Extraído de `leitura-do-cliente.ts` em 27/09/2026 (ficha B5-portoes, item 4).
//
// ─── POR QUE ESTE ARQUIVO EXISTE SEPARADO ───────────────────────────────────
//
// `leitura-do-cliente.ts` é PRODUÇÃO PARA CLIENTE — declarada em
// `caminhos-que-gastam.ts`, guardada pelo portão da esteira — porque ela
// REALMENTE gasta (chama `generate({...})` dentro de `analisarLegendas`). O
// teste de classe (`portao-de-pagamento.test.ts`, metade 4, "o fecho da
// produção") atribui cada chamada paga ao símbolo EXPORTADO mais próximo
// ANTES dela no arquivo. `analisarLegendas` não é exportada — de propósito,
// é helper interno — e por isso não cria marco próprio: a chamada paga dela
// "herdava" o marco do vizinho exportado anterior, que por acidente de
// organização do arquivo era `legendaSegura`.
//
// `legendaSegura` (e `semFrasesDeInstrucao`, da qual depende) NÃO GASTAM UM
// CENTAVO: são regex puro, sem I/O, sem chamada de IA, sem banco. Quando
// `dna-da-marca.ts` passou a usar `legendaSegura` para tirar texto que imita
// instrução de uma legenda antes de citá-la num prompt de visão, o teste de
// classe (corretamente, dado o que ele PODE enxergar por análise estática)
// tratou isso como "produção chamada fora do portão" — porque o símbolo que
// ela importava carregava, por engano de atribuição, a classe de um arquivo
// que gasta. Não era um furo real no portão: era acoplamento acidental entre
// um utilitário puro e um arquivo com gasto real ao lado dele.
//
// A separação resolve os dois lados sem tocar em nenhuma trava:
// `leitura-do-cliente.ts` continua gastando dentro do portão dela; quem só
// precisa de sanitização de texto (puro, sem produção, sem custo) importa
// DAQUI — sem herdar a classe de gasto de ninguém. `leitura-do-cliente.ts`
// também passou a importar daqui, para não haver duas implementações.

/** Sequências que legenda de cliente não tem e injeção tem. Legenda é conteúdo
 *  EXTERNO: quem administra a conta do cliente escreve o que quiser lá, e até
 *  a existência deste arquivo isso entrava cru em prompt de IA, entre aspas
 *  simples que a própria legenda podia fechar. */
const PADROES_DE_INSTRUCAO: RegExp[] = [
  /ignor[ea]r?\s+(\w+\s+){0,3}(instru|regras|orienta|acima|anterior|tudo)/i,
  /ignore\s+(all|any|previous|above)/i,
  /desconsider[ea]/i,
  /esque[çc]a\s+(tudo|as|o\s+que|todas)/i,
  /system\s*(prompt|message|:)/i,
  /(^|\s)(assistant|system|user)\s*:/i,
  /\byou\s+are\s+(a|an|now)\b/i,
  /voc[eê]\s+(agora\s+)?[eé]\s+(um|uma|o|a)\s/i,
  /(responda|retorne|devolva|output)\s+(somente|apenas|exatamente|só|com|the|with)\b/i,
  /nov[ao]s?\s+instru[çc][õo]es/i,
  /new\s+instructions?/i,
  /["']?\s*(estiloVisual|ausencias)\s*["']?\s*:/i,
  // Padaria não escreve "JSON" na legenda; injeção escreve.
  /\bjson\b/i,
  /```/,
  /<\/?\s*(system|user|assistant|instru)/i,
];

/** Deixa cair as FRASES que parecem ordem, mantendo o resto da legenda. Usado
 *  nos dois lados da mesma moeda: o que o modelo lê e o que dá lastro. PURA. */
export function semFrasesDeInstrucao(texto: string): string {
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((f) => !PADROES_DE_INSTRUCAO.some((re) => re.test(f)))
    .join(" ")
    .trim();
}

/** Higieniza a legenda antes de ela chegar a um modelo: tira controle e
 *  quebras, descarta as frases que parecem ORDEM e apaga qualquer coisa
 *  parecida com o delimitador do bloco. O que sobra é texto do cliente, e só.
 *  PURA — nenhuma chamada de IA, nenhum I/O. */
export function legendaSegura(bruta: string, marca: string): string {
  const limpa = bruta
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<{2,}|>{2,}/g, " ")
    .replace(new RegExp(marca, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
  const texto = semFrasesDeInstrucao(limpa);
  if (!texto) return "(legenda descartada: continha texto que imita instrução)";
  return texto.slice(0, 200);
}
