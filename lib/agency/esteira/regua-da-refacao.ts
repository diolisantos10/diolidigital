// regua-da-refacao.ts — A PEÇA NOVA É MEDIDA CONTRA A ANTERIOR.
//
// ═══════════════════════════════════════════════════════════════════════════
// A RÉGUA QUE FALTAVA (Diretor Geral, 27/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A casa tem portão de fundo (mede o fundo cru), régua de peça final (mede se
// a foto entrou), trava de texto, trava de marca, piso de verdade. **E nenhuma
// delas pergunta se a peça NOVA é melhor que a anterior.** Uma refação podia
// piorar a peça indefinidamente com toda a casa verde — e piorou: o cliente
// pediu MAIS LUZ e recebeu 26% MENOS.
//
//     "Se o cliente pediu mais luz, a peça nova tem que ter mais luz — e se
//      vier com menos, reprova e volta, não entrega."
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE ELA MEDE E O QUE ELA **NÃO** MEDE — a metade honesta
// ═══════════════════════════════════════════════════════════════════════════
//
// MEDE, em pixel: **luminância** (mais/menos luz) e **contraste** (mais/menos
// contraste, "chapado", "lavado"). São grandezas com conta fechada, medidas
// pelos mesmos números que reproduziram o caso de produção
// (`design/medir-luz.ts`).
//
// **NÃO MEDE**: "o prato em primeiro plano", "o prato some", "o enquadramento",
// "sem graça", "mais apetitoso". Isso é composição e gosto, e esta casa não
// sabe medir. A régua NÃO finge: devolve a frase do cliente na lista de
// `naoMedidos`, com dono e próxima ação, e quem decide é gente.
//
// *Onde a régua não puder decidir, ela escala para gente — com dono e próxima
// ação.* Botão que cai na mesma parada é pior que botão nenhum.
//
// ⚠️ PURO. Recebe as duas medidas prontas e o texto do cliente; devolve o
// veredito. Não decodifica imagem, não fala com banco.

import type { MedidaDeLuz } from "@/lib/agency/design/medir-luz";

/** As grandezas que esta casa sabe medir em pixel. */
export type EixoMedivel = "luminancia" | "contraste";

/** O que o cliente pediu, quando dá para pôr número. */
export interface PedidoMensuravel {
  eixo: EixoMedivel;
  sentido: "mais" | "menos";
  /** O trecho dele que produziu esta leitura — o veredito cita as palavras. */
  palavras: string;
}

/**
 * Quanto a peça precisa andar, em fração relativa, para o pedido contar como
 * atendido. 5% é acima do ruído de reamostragem (medido: reduzir a amostra de
 * 1080px para 160px mexe na luminância média em menos de 1,5%) e abaixo de
 * qualquer mudança que um cliente perceba como "ficou mais claro".
 */
export const MELHORA_MINIMA = 0.05;

const GATILHOS: Array<{ eixo: EixoMedivel; sentido: "mais" | "menos"; re: RegExp }> = [
  { eixo: "luminancia", sentido: "mais", re: /\b(mais\s+(luz|clar[oa]|luminos|ilumina)|mais\s+iluminad|clarea|clarear|mais\s+brilho|menos\s+escur|escur[oa]\s+demais|muito\s+escur|t[áa]\s+escur|ficou\s+escur)/i },
  { eixo: "luminancia", sentido: "menos", re: /\b(menos\s+luz|mais\s+escur|escurec|clar[oa]\s+demais|muito\s+clar|estourad[oa]|lavad[oa]\s+de\s+luz)/i },
  { eixo: "contraste", sentido: "mais", re: /\b(mais\s+contraste|sem\s+contraste|chapad[oa]|lavad[oa]|apagad[oa]|mais\s+marcad)/i },
  { eixo: "contraste", sentido: "menos", re: /\b(menos\s+contraste|contraste\s+demais|duro\s+demais|muito\s+contrastad)/i },
];

/** Os pedidos que a casa NÃO sabe medir — e que por isso viram gente. */
const FORA_DO_ALCANCE: Array<{ re: RegExp; oQue: string }> = [
  { re: /\bprimeiro\s+plano\b/i, oQue: "o assunto em primeiro plano" },
  { re: /\b(some|sumiu|n[ãa]o\s+aparece|mal\s+d[áa]\s+pra\s+ver|n[ãa]o\s+d[áa]\s+pra\s+ver)\b/i, oQue: "o assunto aparecer na peça" },
  { re: /\benquadr/i, oQue: "o enquadramento" },
  { re: /\b(sem\s+gra[çc]a|feio|bonit|apetitos|gostos|convidativ)/i, oQue: "o gosto (\"ficou bonito?\")" },
  { re: /\b([âa]ngulo|de\s+cima|de\s+lado)\b/i, oQue: "o ângulo da foto" },
];

export interface LeituraDoPedido {
  medidos: PedidoMensuravel[];
  /** O que ele pediu e a régua não alcança, em português. */
  naoMedidos: string[];
}

/** O que dá para medir no que o cliente escreveu — e o que não dá. */
export function lerPedidoDeArte(comentario: string | null | undefined): LeituraDoPedido {
  const texto = (comentario ?? "").trim();
  const medidos: PedidoMensuravel[] = [];
  for (const g of GATILHOS) {
    const m = texto.match(g.re);
    if (!m) continue;
    // Um eixo só entra uma vez: "escuro demais, quero mais luz" é UM pedido.
    if (medidos.some((p) => p.eixo === g.eixo)) continue;
    medidos.push({ eixo: g.eixo, sentido: g.sentido, palavras: m[0] });
  }
  const naoMedidos = FORA_DO_ALCANCE.filter((f) => f.re.test(texto)).map((f) => f.oQue);
  return { medidos, naoMedidos };
}

export type VereditoDaRefacao =
  /** Atendeu o que dava para medir. Pode ter não-medidos junto. */
  | "atendeu"
  /** Andou para o lado ERRADO no eixo pedido. Não entrega. */
  | "piorou"
  /** Não andou o bastante. Não entrega. */
  | "nao_atendeu"
  /** Não havia o que medir, ou não deu para medir. Não reprova sozinho. */
  | "nao_medido";

export interface ComparacaoDaPeca {
  veredito: VereditoDaRefacao;
  /** `true` só quando a peça pode seguir para o cliente. */
  entrega: boolean;
  /** Uma linha por eixo medido, com os dois números. */
  linhas: string[];
  /** O que continua sem régua — sempre declarado, mesmo quando aprova. */
  naoMedidos: string[];
  /** Motivo, dono e próxima ação. Vazio quando entrega limpo. */
  motivo: string;
}

/**
 * A PEÇA NOVA PODE IR AO CLIENTE?
 *
 * `antes`/`depois` `null` = não deu para medir (arquivo ilegível, `sharp`
 * ausente). Isso NÃO reprova a peça sozinho — reprovar por não medir travaria
 * toda refação num contêiner sem biblioteca de imagem —, mas também não afirma
 * nada: sai `nao_medido`, e o não-medido é escrito na cara de quem lê.
 */
export function compararPeca(entrada: {
  antes: MedidaDeLuz | null;
  depois: MedidaDeLuz | null;
  pedido: LeituraDoPedido;
}): ComparacaoDaPeca {
  const { antes, depois, pedido } = entrada;
  const naoMedidos = [...pedido.naoMedidos];

  if (pedido.medidos.length === 0) {
    return {
      veredito: "nao_medido", entrega: true, linhas: [], naoMedidos,
      motivo: naoMedidos.length > 0
        ? `o cliente pediu ${naoMedidos.join(" e ")}, e esta casa não sabe MEDIR isso em pixel. ` +
          "A peça nova segue para ele, mas a régua não afirma que melhorou. " +
          "Dono: a equipe (produção). Próxima ação: olho humano na peça antes de a resposta subir."
        : "",
    };
  }

  if (!antes || !depois) {
    return {
      veredito: "nao_medido", entrega: true, linhas: [], naoMedidos,
      motivo:
        "não consegui MEDIR a peça nova contra a anterior (a imagem não decodificou, ou a biblioteca de imagem " +
        "não está disponível — confira `sharp`). A peça não foi barrada por isso, e a régua não afirma nada sobre ela. " +
        "Dono: a agência (produção). Próxima ação: conferir a peça a olho e o ambiente de imagem.",
    };
  }

  const valor = (m: MedidaDeLuz, e: EixoMedivel): number =>
    e === "luminancia" ? m.luminanciaMedia : m.contraste;

  const linhas: string[] = [];
  const regressoes: string[] = [];
  const insuficientes: string[] = [];

  for (const p of pedido.medidos) {
    const a = valor(antes, p.eixo);
    const d = valor(depois, p.eixo);
    // Divisão por zero: peça inteiramente preta. `a === 0` faz qualquer
    // aumento contar como atendido, que é a leitura certa do fato.
    const variacao = a === 0 ? (d > 0 ? 1 : 0) : (d - a) / a;
    const andou = p.sentido === "mais" ? variacao : -variacao;
    const pct = Math.round(variacao * 100);
    linhas.push(`${p.eixo}: ${a} → ${d} (${pct >= 0 ? "+" : ""}${pct}%), pedido "${p.palavras}"`);
    if (andou < 0) regressoes.push(`${p.eixo} ${pct >= 0 ? "+" : ""}${pct}%`);
    else if (andou < MELHORA_MINIMA) insuficientes.push(`${p.eixo} ${pct >= 0 ? "+" : ""}${pct}%`);
  }

  const cauda = naoMedidos.length > 0
    ? ` E continua sem régua o que ele pediu de composição (${naoMedidos.join("; ")}) — isso é olho humano.`
    : "";

  if (regressoes.length > 0) {
    return {
      veredito: "piorou", entrega: false, linhas, naoMedidos,
      motivo:
        `a peça nova andou para o LADO CONTRÁRIO do que o cliente pediu (${regressoes.join("; ")}). ` +
        "Não entrego peça pior do que a que ele já tinha: a arte anterior fica de pé e a nova NÃO vai a ele. " +
        "Dono: a agência (produção). Próxima ação: a equipe refaz esta peça com direção explícita no eixo pedido — " +
        "sem gastar outra tentativa do cliente." + cauda,
    };
  }

  if (insuficientes.length > 0) {
    return {
      veredito: "nao_atendeu", entrega: false, linhas, naoMedidos,
      motivo:
        `a peça nova praticamente não se moveu no que o cliente pediu (${insuficientes.join("; ")}; o mínimo é ` +
        `${Math.round(MELHORA_MINIMA * 100)}%). Entregar assim seria devolver a mesma peça com outro nome de arquivo. ` +
        "Dono: a agência (produção). Próxima ação: a equipe refaz com direção explícita — sem gastar outra tentativa do cliente." + cauda,
    };
  }

  return {
    veredito: "atendeu", entrega: true, linhas, naoMedidos,
    motivo: naoMedidos.length > 0
      ? `o que dava para medir melhorou (${linhas.join("; ")}).` + cauda
      : "",
  };
}
