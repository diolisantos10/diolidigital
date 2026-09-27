// promocao-so-em-stories.ts — PROMOÇÃO SÓ EM STORIES. CONTRATO FIXO (W9 importa).
//
// ═══════════════════════════════════════════════════════════════════════════
// A DECISÃO DO CEO (27/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// REGRA GERAL, todas as marcas: FEED é branding — valor da marca, qualidade,
// produto; combo só destacando o melhor, SEM cara de promoção. PROMOÇÃO, queda
// de preço e combo promocional SÓ EM STORIES.
//
// Este arquivo responde uma pergunta só, em código, sem rede: *este texto tem
// cara de promoção, e se tiver, este formato pode publicá-lo?* Quem chama é o
// GERADOR (`calendario-editorial.ts`, em `conferirPeca`, sobre caption +
// direção de arte) e a FINALIZAÇÃO (`semana-editorial.ts`, legenda final +
// direção de arte) — as mesmas duas portas que já barram direção interna e
// data errada. Peça barrada aqui vai para `barradas` com o motivo e regenera 1x
// como as outras travas, nunca é um caminho novo de reprovação.
//
// ── CONTRATO FIXO — W9 importa por estes nomes ────────────────────────────
//
// `marcadoresDePromocao` e `conferirPromocaoNoFormato` são a API pública. W9
// (`publicacao.ts`) importa este módulo pelo nome exato — não renomeie sem
// avisar quem depende dele.
//
// ── POR QUE "OFF" PRECISA DE DUAS FORMAS, E "%" SÓ CONTA COM NÚMERO ────────
//
// "off" como PALAVRA solta ("OFF", "off!") e "off" GRUDADO num número ("20off")
// são os dois jeitos que a casa já viu em criativo de tráfego. Os dois contam.
// O que NÃO conta é "off" dentro de outra palavra — "office", "offline",
// "offerta" — porque ali não há fronteira de palavra depois do "off": é a
// mesma regra de \b que já impede falso positivo em qualquer outro marcador
// textual deste arquivo, sem lista de exceção para decorar.
//
// "%" sozinho, sem número do lado, não é marcador de promoção — é só um
// símbolo (referência a um relatório, uma nota musical, o que for). Só conta
// grudado a um dígito, na ordem que a casa usa de verdade: "20%", "20 %".
//
// ── NORMALIZAÇÃO DE ACENTO, UMA VEZ SÓ ──────────────────────────────────────
//
// "promoção"/"promocao"/"promo", "queima" (de estoque) e "liquida" (de
// liquidação) são conferidos sobre o texto SEM ACENTO e em minúsculas — assim
// "PROMOÇÃO", "Promocao" e "promo" caem na mesma regra, sem três regexes para
// a mesma palavra.

import { normalizarFormato } from "@/lib/agency/esteira/publicacao";

/** Um marcador de promoção encontrado no texto, em português de gente — pronto
 *  para entrar na frase do motivo de recusa (`${lista}`, separado por vírgula). */
export type MarcadorDePromocao =
  | "preço riscado"
  | "%"
  | "off"
  | "promoção"
  | "desconto"
  | "queima"
  | "liquidação";

/** Preço riscado: `~~R$ 100~~`, "de R$ 100 por R$ 50", "de 100 por R$ 50" (o
 *  R$ pode estar grudado no primeiro número, no segundo, ou nos dois — o que
 *  não pode é faltar dos dois lados, senão "de 9 a 5" viraria falso positivo). */
const PRECO_RISCADO_TIL = /~~\s*r\$\s*[\d.,]+\s*~~/i;
const PRECO_RISCADO_DE_POR = /\bde\s+(?:r\$\s*[\d.,]+\s+por\s+(?:r\$\s*)?[\d.,]+|[\d.,]+\s+por\s+r\$\s*[\d.,]+)/i;

/** "%" só conta grudado a um número — "20%", "20 %". Símbolo sozinho não conta. */
const PORCENTAGEM_COM_NUMERO = /\d\s?%/;

/** "off" como palavra solta ("OFF", "off!") OU grudado num número ("20off",
 *  "50 off"). NUNCA dentro de outra palavra — "office"/"offline"/"offerta"
 *  não têm fronteira de palavra depois do "off", então nenhuma das duas
 *  formas casa com elas. */
const OFF_PALAVRA = /\boff\b/i;
const OFF_COM_NUMERO = /\d+\s?off\b/i;

/**
 * Acha os marcadores de promoção num texto — legenda, direção de arte, o que
 * vier. Nunca lança. Ordem fixa e determinística (a mesma sempre, para o mesmo
 * texto), para a frase de recusa não variar entre rodadas.
 */
export function marcadoresDePromocao(texto: string): MarcadorDePromocao[] {
  const bruto = texto ?? "";
  // Sem acento e minúsculo — só para os marcadores de PALAVRA (promoção,
  // desconto, queima, liquida). Preço riscado, "%" e "off" não dependem de
  // acento e são conferidos sobre o texto original (normalizar não muda nada
  // neles, mas manter os dois evita reprocessar duas vezes o mesmo texto para
  // o mesmo resultado).
  const semAcento = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const achados: MarcadorDePromocao[] = [];

  if (PRECO_RISCADO_TIL.test(bruto) || PRECO_RISCADO_DE_POR.test(bruto)) {
    achados.push("preço riscado");
  }
  if (PORCENTAGEM_COM_NUMERO.test(bruto)) {
    achados.push("%");
  }
  if (OFF_PALAVRA.test(bruto) || OFF_COM_NUMERO.test(bruto)) {
    achados.push("off");
  }
  if (/promocao|\bpromo\b/.test(semAcento)) {
    achados.push("promoção");
  }
  if (/desconto/.test(semAcento)) {
    achados.push("desconto");
  }
  if (/queima/.test(semAcento)) {
    achados.push("queima");
  }
  if (/liquida/.test(semAcento)) {
    achados.push("liquidação");
  }

  return achados;
}

export type VereditoDePromocaoNoFormato =
  | { passa: true }
  | { passa: false; motivo: string };

/**
 * PROMOÇÃO SÓ EM STORIES. `formato` é normalizado como `normalizarFormato` de
 * `publicacao.ts` (a mesma régua que a última porta de publicação usa) — então
 * "story"/"stories"/qualquer grafia que aquela função já entenda como story
 * passa sempre. Qualquer outro formato (feed, carousel, reel) com marcador de
 * promoção no texto é barrado, com a lista dos marcadores encontrados no motivo.
 */
export function conferirPromocaoNoFormato(a: {
  formato: string;
  texto: string;
}): VereditoDePromocaoNoFormato {
  const formato = normalizarFormato(a.formato);
  if (formato === "story") return { passa: true };

  const marcadores = marcadoresDePromocao(a.texto);
  if (marcadores.length === 0) return { passa: true };

  return {
    passa: false,
    motivo: `promoção só em stories — esta peça de feed traz ${marcadores.join(", ")}`,
  };
}
