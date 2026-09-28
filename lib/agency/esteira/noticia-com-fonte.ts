// noticia-com-fonte.ts — CARD DE NOTÍCIA SEM URL DE FONTE NÃO ENTRA. PURO.
//
// O radar de notícias (série "Radar Dioli Tech", `pacote.series`) cita
// notícias de terceiros — e uma notícia sem link verificável é uma afirmação
// sem fonte, a mesma classe de risco que `prova-com-fonte.ts` trava para
// números de prova. Esta trava é a versão para NOTÍCIA: URL http(s) válida,
// veículo e título não vazios, e data de publicação dentro da janela do
// radar (para não citar notícia velha como se fosse da semana).
//
// Pura — sem banco, sem IA. Quem monta `NoticiaDoRadar` (busca do radar, W12b
// ou depois) decide de onde vem; esta função só confere o que já chegou.

export interface NoticiaDoRadar {
  titulo: string;
  resumo: string;
  veiculo: string;
  url: string;
  /** "AAAA-MM-DD". */
  dataPublicacao: string;
}

const URL_HTTP_REGEX = /^https?:\/\/.+/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type VereditoDaNoticia = { passa: true } | { passa: false; motivo: string };

/**
 * Confere uma notícia do radar contra as travas de fonte: URL http(s)
 * obrigatória, veículo e título não vazios, e data de publicação dentro da
 * janela `[de, ate]` (inclusive, comparação lexicográfica em "AAAA-MM-DD" —
 * válida porque o formato é de largura fixa).
 */
export function conferirNoticia(
  n: NoticiaDoRadar,
  janela: { de: string; ate: string },
): VereditoDaNoticia {
  if (!n.titulo || !n.titulo.trim()) {
    return { passa: false, motivo: "notícia sem título não entra" };
  }
  if (!n.veiculo || !n.veiculo.trim()) {
    return { passa: false, motivo: "notícia sem veículo não entra" };
  }
  if (!n.url || !URL_HTTP_REGEX.test(n.url.trim())) {
    return { passa: false, motivo: "card de notícia sem URL de fonte não entra" };
  }
  if (!DATA_REGEX.test(n.dataPublicacao)) {
    return {
      passa: false,
      motivo: `data de publicação fora do formato AAAA-MM-DD: "${n.dataPublicacao}"`,
    };
  }
  if (!DATA_REGEX.test(janela.de) || !DATA_REGEX.test(janela.ate)) {
    return { passa: false, motivo: "janela de datas do radar inválida" };
  }
  if (n.dataPublicacao < janela.de || n.dataPublicacao > janela.ate) {
    return {
      passa: false,
      motivo: `notícia de ${n.dataPublicacao} fora da janela do radar (${janela.de}..${janela.ate})`,
    };
  }
  return { passa: true };
}
