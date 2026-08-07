// PADRÃO 3 — Promessa que o código não cumpre.
//
// O que pescou de verdade, nesta casa: um relatório afirmando "qualidade
// verificada" com as verificações escritas como `true` fixo no código. E o P0
// declarado da casa: a maioria das checagens de `quality-gates.ts` é
// `autoCheckable: false` — texto descrevendo o que um humano deveria conferir,
// numa operação que decidiu rodar 100% IA e não tem humano nenhum conferindo.
// (O número corrente sai de `retratoDosPortoes()`; escrito à mão em comentário
// ele envelhece errado, que foi o que aconteceu com o "28 de 31" daqui.)
//
// TRADUÇÃO PARA ESTE CÓDIGO, duas frentes:
//   a) CARIMBO CONSTANTE: campo com cara de veredito (`verificado`, `aprovado`,
//      `semAlucinacao`, `passed`, `isValid`…) recebendo literal `true`/`false`.
//      O valor de um veredito tem que VIR de uma verificação que rodou.
//   b) A MEDIDA DO P0: quantas checagens do registro de qualidade não são
//      executáveis. É número, entra na comparação com ontem, e é ele que mostra
//      se o P0 está andando ou parado — que é exatamente o que some quando
//      "estamos trabalhando nisso" vira resposta de todo mês.

import { fontesDoProjeto, linhaDe, trecho, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "promessa-nao-cumprida";

/** Nomes que prometem um veredito. Lista fechada de propósito: sem ela a
 *  varredura vira "procure booleano", que acha 4.000 coisas e informa zero. */
const CARIMBO =
  /\b(verificad\w*|verified|aprovad\w*|approved|semAlucinacao|hasHallucination|passed|passou|isValid|valido|checagemOk|auditad\w*|conferid\w*|seguro|compliant)\s*[:=]\s*(true|false)\b/g;

/** O literal só é problema quando NÃO veio de uma checagem. Estas exceções são
 *  as formas legítimas: default de schema, valor de teste, tipo. */
const LEGITIMO = /@default|\.mock|expect\(|describe\(|it\(|type\s|interface\s|\?\s*true\s*:|as const/;

/** COMENTÁRIO NÃO É CÓDIGO. A primeira rodada acusou `// const hasHallucination
 *  = false;` — uma linha que o `quality-engine.ts` mantém justamente para
 *  CONTAR a história do bug que já foi consertado. Acusar a cicatriz de ser a
 *  ferida é a forma mais rápida de o CEO parar de ler o relatório. */
function ehComentario(linha: string): boolean {
  const t = linha.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

export function varrerPromessaNaoCumprida(entrada?: Arquivo[]): ResultadoDeVarredura {
  const fontes = (entrada ?? fontesDoProjeto(["app", "lib", "components"])).filter(
    (f) => !f.caminho.includes("__tests__")
  );
  if (fontes.length === 0) return cega(NOME, "promessa-nao-cumprida", "nenhum fonte lido — varredura não olhou nada");

  const achados: Achado[] = [];

  for (const { caminho, texto } of fontes) {
    CARIMBO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARIMBO.exec(texto))) {
      const linhaInteira = trecho(texto, m.index, 200);
      if (ehComentario(linhaInteira) || LEGITIMO.test(linhaInteira)) continue;
      const linha = linhaDe(texto, m.index);
      achados.push({
        padrao: "promessa-nao-cumprida",
        chave: `carimbo-fixo:${caminho}:${m[1]}`,
        titulo: `Veredito "${m[1]}" gravado como literal ${m[2]}`,
        evidencia: `${caminho}:${linha} · ${linhaInteira}`,
        local: `${caminho}:${linha}`,
        gravidade: "alto",
      });
    }
  }

  // A medida do P0 da casa. Contada no registro de portões, não estimada.
  const portoes = fontes.find((f) => f.caminho.endsWith("lib/dioli-brain/quality-gates.ts"));
  const medidas: Record<string, number> = { carimbosConstantes: achados.length };
  if (portoes) {
    const total = (portoes.texto.match(/autoCheckable\s*:/g) ?? []).length;
    const naoExecutaveis = (portoes.texto.match(/autoCheckable\s*:\s*false/g) ?? []).length;
    medidas.checagensDeQualidade = total;
    medidas.checagensNaoExecutaveis = naoExecutaveis;
    if (naoExecutaveis > 0) {
      achados.push({
        padrao: "promessa-nao-cumprida",
        chave: "p0-checagens-nao-executaveis",
        titulo: "Checagens de qualidade que nenhum código roda",
        evidencia: `${naoExecutaveis} de ${total} checagens são autoCheckable: false — descrevem o que alguém deveria conferir, numa operação sem revisão humana`,
        local: "lib/dioli-brain/quality-gates.ts",
        gravidade: "alto",
      });
    }
  }

  return { varredura: NOME, padrao: "promessa-nao-cumprida", status: "rodou", achados, medidas };
}
