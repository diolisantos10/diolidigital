// PADRÃO 1 — Trabalho que existe e ninguém vê.
//
// O que pescou de verdade, nesta casa: um post com imagem quebrada gerando até
// 1.728 imagens PAGAS por dia, para sempre. O `catch` fazia `continue`: o laço
// tentava de novo na próxima volta, ninguém falhava em voz alta, e a fatura
// crescia sozinha.
//
// TRADUÇÃO PARA ESTE CÓDIGO (é aqui que o padrão do kit vira varredura, e é por
// isso que cada Diretor faz no próprio projeto): "laço que gasta" aqui é um
// `for`/`while` que, dentro do corpo, chama um MOTOR PAGO — geração de imagem,
// visão, transcrição, provedor de IA ou a Graph API da Meta. O que transforma o
// laço em sangria é a combinação de três coisas:
//   a) erro engolido dentro do laço (`catch` que só faz `continue`/nada), e
//   b) nenhum teto visível (constante MAX/TETO/LIMITE, `slice`, `take:`), e
//   c) nada que marque o item como quebrado para não voltar amanhã.
// Achado = (a) ou (b). Um laço pago com teto E com erro marcado não é achado.

import { fontesDoProjeto, linhaDe, blocoDe, trecho, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "trabalho-invisivel";

/** Os motores que custam por chamada. Lista fechada e explícita: "gasta" não é
 *  julgamento da varredura, é fato declarado aqui. */
const MOTORES_PAGOS = [
  "gerarImagem",
  "generateImage",
  "analisarImagens",
  "transcrever",
  "callProvider",
  "chamarProvedor",
  "runAgent",
  "gerarTexto",
  "generateText",
  "grafo(",
  "graphFetch",
  "metaGet",
  "metaPost",
];

/** Sinais de teto. Qualquer um deles no corpo do laço já basta: a varredura não
 *  julga se o teto é bom, só se existe alguém contando. */
const SINAIS_DE_TETO = /\b(MAX_|TETO|LIMITE|LIMIT_|maxTentativas|take\s*:|\.slice\(|breaks?\b|\bbreak\b)/;

/** Sinal de que o erro NÃO foi engolido: alguém marca, registra ou sobe. */
const SINAIS_DE_ERRO_TRATADO = /\b(marcarErro|lastError|throw\b|registrarFalha|status\s*:\s*["'`]failed)/;

const ABRE_LACO = /\b(for|while)\s*\(/g;

/** `entrada` existe para o teste poder plantar o problema e provar as DUAS
 *  metades: que a varredura acha quando ele existe e que ela não inventa quando
 *  não existe. Varredura só vista achando coisa é indistinguível de varredura
 *  que alarma sempre. */
export function varrerTrabalhoInvisivel(entrada?: Arquivo[]): ResultadoDeVarredura {
  const fontes = (entrada ?? fontesDoProjeto()).filter((f) => !f.caminho.includes("__tests__"));
  if (fontes.length === 0) return cega(NOME, "trabalho-invisivel", "nenhum fonte lido — varredura não olhou nada");

  const achados: Achado[] = [];
  let lacosPagos = 0;

  for (const { caminho, texto } of fontes) {
    ABRE_LACO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ABRE_LACO.exec(texto))) {
      const { fim } = blocoDe(texto, m.index);
      // O CABEÇALHO ENTRA. `for (const p of posts.slice(0, TETO))` põe o teto
      // fora das chaves — olhar só o corpo faria a varredura acusar exatamente
      // o laço que se protegeu direito.
      const corpo = texto.slice(m.index, fim + 1);
      if (!corpo.includes("{")) continue;
      ABRE_LACO.lastIndex = fim; // laço aninhado conta como um só
      const motor = MOTORES_PAGOS.find((p) => corpo.includes(p));
      if (!motor) continue;
      lacosPagos++;

      const engoleErro = /catch\s*\([^)]*\)\s*\{[^{}]*\}/.test(corpo) && !SINAIS_DE_ERRO_TRATADO.test(corpo);
      const semTeto = !SINAIS_DE_TETO.test(corpo);
      if (!engoleErro && !semTeto) continue;

      const linha = linhaDe(texto, m.index);
      const motivo = [engoleErro ? "erro engolido dentro do laço" : null, semTeto ? "sem teto visível" : null]
        .filter(Boolean)
        .join(" + ");
      achados.push({
        padrao: "trabalho-invisivel",
        chave: `laco-pago:${caminho}:${motor}`,
        titulo: `Laço que chama motor pago (${motor}) — ${motivo}`,
        evidencia: `${caminho}:${linha} · ${trecho(texto, m.index)}`,
        local: `${caminho}:${linha}`,
        gravidade: engoleErro && semTeto ? "alto" : "medio",
      });
    }
  }

  return {
    varredura: NOME,
    padrao: "trabalho-invisivel",
    status: "rodou",
    achados,
    medidas: { lacosComMotorPago: lacosPagos, lacosSemProtecao: achados.length },
  };
}
