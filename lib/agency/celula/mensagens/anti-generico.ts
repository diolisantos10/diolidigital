// ─── A TRAVA ANTI-GENÉRICO — o CEO chamou de INDISPENSÁVEL ──────────────────
//
// Palavras dele: "O sistema deve IMPEDIR que dezenas de clientes recebam
// textos idênticos." Mecanismo, não aviso: `avaliarAntiGenerico` devolve um
// veredito que quem manda a mensagem TEM de obedecer, nunca um score que
// alguém arredonda para cima numa sexta-feira apertada.
//
// ── AS QUATRO CAUSAS DE BLOQUEIO, NENHUMA OPCIONAL ───────────────────────────
//   1. texto_repetido  — impressão digital idêntica a uma mensagem já enviada.
//   2. texto_parecido  — só o nome do cliente mudou (similaridade por trigrama).
//   3. variavel_vazia  — variável obrigatória em branco ou só espaço.
//   4. variavel_generica — variável preenchida com frase de catálogo (M01).
//
// ── DE ONDE VÊM AS PEÇAS, E POR QUE NENHUMA É REINVENTADA AQUI ───────────────
//   - `impressaoDeTexto` / `normalizarParaImpressao` — a impressão digital da
//     casa, de `lib/agency/comercial/oportunidade.ts`. Mesmo padrão do model
//     `Oportunidade`: dois hashes diferentes para "o mesmo texto" seriam dois
//     conceitos de igualdade concorrendo dentro da mesma casa.
//   - `similaridade` / `TETO_DE_SIMILARIDADE` — de
//     `lib/marketplaces/99freelas/conformidade.ts`, o Guardião. Trocar o nome
//     do cliente e mandar o mesmo parágrafo para trinta pessoas é o vetor de
//     spam listado nas Sanções da plataforma, e passa reto por qualquer
//     comparação de igualdade exata — só similaridade por trigrama pega.
//   - a lista de frases genéricas é DADO, em
//     `docs/plataformas/99freelas/frases-genericas.json`. Este arquivo LÊ o
//     JSON; não duplica a lista em regex escondido no código-fonte.
//
// ── O QUE ESTA FUNÇÃO NÃO FAZ ────────────────────────────────────────────────
// Não decide o que fazer com o bloqueio (reescrever, escalar, descartar) — só
// julga e devolve o motivo legível. Quem chama decide a ação. E não confia no
// texto do cliente para nada: `textosJaEnviados` e `variaveis` são dado da
// CASA (o que a própria agência já mandou, o que a própria agência preencheu),
// nunca o texto do anúncio de terceiro.

import { impressaoDeTexto, normalizarParaImpressao } from "@/lib/agency/comercial/oportunidade";
import { similaridade, TETO_DE_SIMILARIDADE } from "@/lib/marketplaces/99freelas/conformidade";
import frasesGenericasBruto from "@/docs/plataformas/99freelas/frases-genericas.json";

// ── A lista genérica, lida do JSON ───────────────────────────────────────────

interface FraseGenerica {
  frase: string;
  porqueEGenerica: string;
  exemploDoQueSeEsperaNoLugar: string;
}

interface ArquivoDeFrasesGenericas {
  versao: string;
  atualizadoEm: string;
  frases: FraseGenerica[];
}

const ARQUIVO = frasesGenericasBruto as unknown as ArquivoDeFrasesGenericas;

/** Exportado só para o teste poder conferir que o `.ts` de fato leu o JSON e
 *  não uma lista duplicada em memória. */
export const FRASES_GENERICAS: readonly FraseGenerica[] = ARQUIVO.frases;

/** Índice normalizado (sem acento, minúsculo) → entrada original, para
 *  "Alta Qualidade" e "alta qualidade" caírem no mesmo lugar. Construído uma
 *  vez, no carregamento do módulo — não a cada chamada. */
const INDICE_GENERICAS: Map<string, FraseGenerica> = new Map(
  ARQUIVO.frases.map((f): [string, FraseGenerica] => [normalizarParaImpressao(f.frase), f]),
);

/**
 * A variável contém, no texto normalizado, uma frase inteira da lista?
 * Comparação por SUBSTRING normalizada: "prestamos um serviço de qualidade
 * para você" contém "um serviço de qualidade" mesmo com palavras ao redor.
 */
function achaFraseGenerica(valor: string): FraseGenerica | null {
  const normalizado = normalizarParaImpressao(valor);
  if (!normalizado) return null;
  for (const [chave, entrada] of INDICE_GENERICAS) {
    if (chave && normalizado.includes(chave)) return entrada;
  }
  return null;
}

// ── O veredito ────────────────────────────────────────────────────────────

export type CausaDeBloqueioAntiGenerico =
  | "texto_repetido"
  | "texto_parecido"
  | "variavel_generica"
  | "variavel_vazia";

export type VereditoAntiGenerico =
  | { ok: true }
  | { ok: false; motivo: string; causa: CausaDeBloqueioAntiGenerico };

export interface EntradaAntiGenerico {
  /** O texto final, já com as variáveis substituídas — o que SAIRIA para o
   *  cliente se a trava deixasse passar. */
  textoFinal: string;
  /** As variáveis usadas para montar `textoFinal`, ANTES da substituição —
   *  é nelas que se procura frase de catálogo e campo vazio. */
  variaveis: Record<string, string | null | undefined>;
  /** As chaves de `variaveis` que não podem faltar. Uma obrigatória ausente
   *  do objeto conta como vazia — mesma regra de uma vazia por espaço. */
  variaveisObrigatorias: readonly string[];
  /** As mensagens JÁ ENVIADAS pela casa. Entram por INJEÇÃO — o banco é da
   *  Onda 1, este módulo não importa Prisma nem sabe que ele existe. */
  textosJaEnviados: readonly string[];
}

/**
 * Julga se `textoFinal` pode sair. `ok: false` = o envio PARA — mecanismo,
 * não aviso. Nunca devolve `false` mudo: toda reprovação vem com `motivo` em
 * português e `causa` nomeada, para a fila de exceção da onda seguinte saber
 * exatamente o que corrigir.
 *
 * ── A ORDEM DAS CHECAGENS É DELIBERADA ───────────────────────────────────
 * Primeiro variável (a causa mais barata de apontar: "faltou a variável X" é
 * mais acionável que "o texto ficou parecido com outro"), depois repetição
 * exata, depois similaridade — a mais cara de calcular, e só vale a pena
 * rodar se as três primeiras já passaram.
 */
export function avaliarAntiGenerico(entrada: EntradaAntiGenerico): VereditoAntiGenerico {
  // 1) Variável obrigatória vazia ou só espaço.
  for (const chave of entrada.variaveisObrigatorias) {
    const valor = entrada.variaveis[chave];
    if (valor === null || valor === undefined || valor.trim() === "") {
      return {
        ok: false,
        causa: "variavel_vazia",
        motivo: `A variável obrigatória "${chave}" está vazia. Preencher com o dado real do cliente antes de montar a mensagem — variável vazia não é mensagem, é rascunho.`,
      };
    }
  }

  // 2) Variável preenchida com frase genérica de catálogo (M01).
  for (const chave of entrada.variaveisObrigatorias) {
    const valor = entrada.variaveis[chave];
    if (typeof valor !== "string") continue;
    const achado = achaFraseGenerica(valor);
    if (achado) {
      return {
        ok: false,
        causa: "variavel_generica",
        motivo: `A variável "${chave}" foi preenchida com a frase genérica "${achado.frase}" (${achado.porqueEGenerica}). Use algo específico deste cliente — ex.: "${achado.exemploDoQueSeEsperaNoLugar}".`,
      };
    }
  }

  // 3) Texto idêntico a um já enviado — por impressão digital, não por `===`
  //    (a impressão já ignora acento, caixa e espaço repetido).
  const impressaoAtual = impressaoDeTexto(entrada.textoFinal);
  for (const jaEnviado of entrada.textosJaEnviados) {
    if (impressaoDeTexto(jaEnviado) === impressaoAtual) {
      return {
        ok: false,
        causa: "texto_repetido",
        motivo: "Este texto é IDÊNTICO a uma mensagem já enviada para outro contato. Enviar o mesmo texto para dezenas de clientes é o vetor de spam listado nas Sanções da plataforma — escreva um texto novo para este cliente.",
      };
    }
  }

  // 4) Texto quase idêntico — só o nome (ou outro detalhe pequeno) trocou.
  for (const jaEnviado of entrada.textosJaEnviados) {
    const parecido = similaridade(entrada.textoFinal, jaEnviado);
    if (parecido > TETO_DE_SIMILARIDADE) {
      return {
        ok: false,
        causa: "texto_parecido",
        motivo: `Este texto é ${Math.round(parecido * 100)}% parecido com uma mensagem já enviada (teto: ${Math.round(TETO_DE_SIMILARIDADE * 100)}%) — parece o mesmo parágrafo com o nome do cliente trocado. Reescreva com o que é específico deste projeto.`,
      };
    }
  }

  return { ok: true };
}
