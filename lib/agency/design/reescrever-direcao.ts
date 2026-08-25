// reescrever-direcao.ts — TODA PROIBIÇÃO PRECISA DIZER O QUE FAZER NO LUGAR.
//
// ─── O DEFEITO, MEDIDO EM PRODUÇÃO (25/08/2026) ─────────────────────────────
//
// A corrente do Instagram Story foi homologada em SETE auditorias e não entregou
// arquivo nenhum. Quatro peças, quatro rodadas do despertador, `mediaUrl: null`
// nas quatro, `status: draft`, US$ 0,00 gastos.
//
// Onde parava: o pré-portão da direção (`direcao-fotografavel.ts`) reprovava
// 4 de 4 e gravava, com todas as letras, **"reescreva a direção"**.
//
// E ninguém reescrevia.
//
// Não existia caminho automático nenhum. A única rota de operador
// (`/api/admin/refazer-com-direcao`) diz na própria porta que **não inventa
// direção de arte** — ela faz backfill de direção que já estava escrita no
// entregável — e ainda exige `CRON_SECRET`, que nem todo mundo tem.
//
// O portão estava CERTO em existir: ele barra antes de pagar, e por isso os
// quatro fracassos custaram zero. O que faltava era a **instrução gêmea**. Uma
// proibição que manda reescrever sem que exista quem reescreva não é um portão:
// é uma fila morta com aviso bonito. A peça voltava a cada 5 minutos, para
// sempre, reprovando igual — e `marcarErro(..., null)` nem gastava tentativa,
// então nem o teto de desistência chegava. Fila morta E silenciosa.
//
// ─── O QUE ESTE ARQUIVO FAZ, E O QUE ELE NÃO FAZ ────────────────────────────
//
// FAZ: devolve a direção reprovada a quem a escreveu — o especialista, o mesmo
// modelo de texto — **com o motivo da recusa na mão** (quais das três famílias
// faltaram), recebe a direção reescrita e a passa pela MESMA régua, de graça,
// antes de qualquer imagem ser pedida.
//
// NÃO FAZ: afrouxar o portão. A régua aqui é `conferirDirecaoFotografavel`, a
// mesma função, sem parâmetro de tolerância e sem segunda opinião. Reescrita que
// não passa não vira imagem. O caminho de volta existe para a direção FICAR BOA,
// nunca para a exigência ficar menor.
//
// NÃO FAZ: inventar fato do cliente. A reescrita só pode reorganizar e detalhar
// a CENA que o especialista já descreveu — nada de dado novo de negócio, nada de
// número, nada de promessa. É uma correção de enquadramento, não uma segunda
// criação.
//
// ─── O TETO: DUAS REESCRITAS ────────────────────────────────────────────────
//
// Não é um número de gosto. A régua é DETERMINÍSTICA e o pedido de reescrita diz
// exatamente qual família faltou. Se duas tentativas guiadas — a segunda já
// sabendo que a primeira falhou e no quê — ainda não nomeiam o lugar e a luz, o
// problema deixou de ser redação e passou a ser que **não há o que dizer**: o
// especialista não tem cena para aquela peça. A terceira tentativa seria
// repetição, não aprendizado, e cada uma custa uma chamada de texto.
//
// A conta que fecha o número: a reescrita é BARATA (chamada de texto, ordem de
// US$ 0,003) e a imagem é CARA (US$ 0,167 — 55x). Gastar até duas reescritas
// para não pagar uma imagem ruim é o negócio certo; gastar cinco para o mesmo
// resultado é queimar a mesma corda mais devagar.
//
// E quando esgota, **para declarando**: motivo, dono e próxima ação, no
// `lastError` da peça. Nunca fila morta.

import { conferirDirecaoFotografavel, type VereditoDaDirecao } from "./direcao-fotografavel";

/** Quantas vezes a direção reprovada volta ao especialista. Ver o bloco do teto
 *  acima — o número tem conta, não gosto. */
export const MAX_REESCRITAS_DA_DIRECAO = 2;

/**
 * O MARCADOR DA REESCRITA NO `lastError`.
 *
 * ⚠️ NUNCA no formato `[arte N/` — esse prefixo é do contador de tentativas de
 * ARTE (`contarTentativas`, em `artes.ts`), e o campo `lastError` tem contrato
 * declarado: um significado por marcador, e o de arte é um PREFIXO EXCLUSIVO
 * (`__tests__/execution/o-campo-de-um-significado-so.test.ts`). Uma reescrita
 * lida como tentativa de arte faria a peça desistir de uma falha que nunca
 * aconteceu.
 */
export const MARCA_DE_REESCRITA = "[direcao";

/** Quantas vezes a direção desta peça já foi reescrita sem sucesso. Mora no
 *  próprio `lastError` pelo mesmo motivo que o contador de arte mora: uma coluna
 *  a mais é uma coluna que um dia diverge do que aconteceu. */
export function contarReescritasDaDirecao(lastError: string | null | undefined): number {
  const m = lastError?.match(/\[direcao (\d+)\//);
  return m ? Number(m[1]) : 0;
}

/** O que a peça é, para o especialista saber o que está reescrevendo. Só o que
 *  a casa JÁ SABE — nada aqui autoriza inventar. */
export interface PecaAReescrever {
  direcaoOriginal: string;
  /** O texto da peça. É o lastro: a cena tem de servir a ESTE texto. */
  legenda: string;
  pilar: string | null;
  negocio: string;
  segmento: string;
  formato: string;
}

/** A chamada de texto, injetada. Injetada e não importada para o teste poder
 *  provar o laço inteiro sem tocar em provedor nenhum — e para o mutante
 *  (desligar a reescrita) aparecer como falha, não como rede. */
export type ChamarEspecialista = (p: { system: string; user: string }) => Promise<
  { ok: true; texto: string } | { ok: false; error: string }
>;

export type DesfechoDaReescrita =
  | {
      ok: true;
      direcao: string;
      veredito: VereditoDaDirecao;
      /** Quantas reescritas foram consumidas até acertar. 1 = acertou de primeira. */
      reescritas: number;
    }
  | {
      ok: false;
      /** Uma linha para o `lastError`: motivo, dono e próxima ação. */
      motivo: string;
      /** Quantas foram gastas. Sobe para o chamador gravar o contador. */
      reescritas: number;
    };

/** O pedido de reescrita. Nomeia a recusa, nomeia a família que faltou e mostra
 *  as DUAS famílias de foto que a casa aceita — a cena de ambiente e a tomada
 *  controlada. Sem isto o especialista chuta a mesma coisa de novo. */
function pedidoDeReescrita(peca: PecaAReescrever, veredito: VereditoDaDirecao, rodada: number): string {
  return [
    `A direção de arte que você escreveu foi RECUSADA pela régua da casa, que roda em código antes de qualquer imagem ser paga.`,
    ``,
    `A DIREÇÃO RECUSADA: "${peca.direcaoOriginal}"`,
    `O QUE FALTOU: ${veredito.faltou.join(", ")}`,
    `O MOTIVO, como a régua o escreveu: ${veredito.motivo}`,
    rodada > 1 ? `\n⚠️ Esta é a tentativa ${rodada} de ${MAX_REESCRITAS_DA_DIRECAO}. A anterior falhou pelo mesmo tipo de motivo. Não repita a mesma frase com outras palavras — NOMEIE o que faltou.` : ``,
    ``,
    `A PEÇA (a cena tem de servir a ESTE texto, que já foi aprovado e não muda):`,
    `  negócio: ${peca.negocio} — ${peca.segmento}`,
    `  formato: ${peca.formato}`,
    peca.pilar ? `  pilar: ${peca.pilar}` : ``,
    `  texto da peça: ${peca.legenda}`,
    ``,
    `A RÉGUA ACEITA DUAS FAMÍLIAS DE FOTO. Escolha a que serve a esta peça:`,
    ``,
    `  A) CENA DE AMBIENTE — alguém fazendo algo, em algum lugar, sob alguma luz.`,
    `     ex.: "galpão de logística em Suzano no fim da tarde, operador conferindo caixas, luz baixa entrando pelo portão"`,
    ``,
    `  B) TOMADA CONTROLADA (close-up de produto) — quando a peça é sobre uma COISA.`,
    `     Diga o ENQUADRAMENTO FECHADO com todas as letras ("close-up de", "macro de",`,
    `     "detalhe de", "primeiro plano de") E o que aparece ATRÁS (o fundo, a superfície,`,
    `     o estúdio, a bancada).`,
    `     ex.: "macro do disco de freio desgastado sobre a bancada, fundo desfocado cinza escuro, luz fria de fluorescente da oficina"`,
    ``,
    `A LUZ É OBRIGATÓRIA NAS DUAS. Direção sem luz o gerador resolve com cor chapada e ícone,`,
    `e aí a peça é reprovada DEPOIS de já ter sido paga.`,
    ``,
    `NÃO INVENTE FATO DO CLIENTE: nada de número, preço, prazo, nome de pessoa ou promessa que`,
    `não esteja no texto da peça acima. Você está corrigindo o ENQUADRAMENTO de uma foto, não`,
    `criando uma peça nova.`,
    ``,
    `Responda SOMENTE com JSON válido, exatamente nesta forma e sem mais nada:`,
    `{"direction": "a direção de arte reescrita, em uma linha"}`,
  ].filter((l) => l !== ``).join("\n");
}

const SISTEMA =
  "Você é o diretor de arte de uma agência brasileira. Você reescreve direções de arte que " +
  "foram recusadas por não descreverem uma fotografia. Responda SOMENTE com JSON válido.";

/** O modelo às vezes devolve a linha com aspas, com um rótulo, ou com um bloco
 *  de código em volta. Nada disso é a direção, e tudo isso envenenaria o prompt
 *  da imagem. */
function limpar(texto: string): string {
  return texto
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^(?:dire[çc][ãa]o(?: de arte)?|visual|direction)\s*:\s*/i, ""))
    .map((l) => l.replace(/^["'“”]+|["'“”]+$/g, ""))
    .find((l) => l.length >= 10) ?? "";
}

/**
 * A DIREÇÃO REPROVADA VOLTA A QUEM A ESCREVEU, E VOLTA COM O MOTIVO NA MÃO.
 *
 * Até `MAX_REESCRITAS_DA_DIRECAO` voltas. Cada volta passa pela MESMA régua, de
 * graça, antes de a imagem ser pedida. Esgotado o teto, PARA DECLARANDO —
 * motivo, dono e próxima ação — e nunca deixa a peça voltando em silêncio.
 *
 * Nunca lança: falha de provedor vira desfecho `ok:false` com o motivo dito. Uma
 * exceção aqui derrubaria a rodada de arte inteira por causa de UMA peça.
 */
export async function reescreverDirecao(
  peca: PecaAReescrever,
  vereditoInicial: VereditoDaDirecao,
  chamar: ChamarEspecialista,
  jaGastas = 0,
): Promise<DesfechoDaReescrita> {
  let veredito = vereditoInicial;
  let ultimaFalha = `a régua recusou: falta ${vereditoInicial.faltou.join(", ")}`;
  let gastas = jaGastas;

  while (gastas < MAX_REESCRITAS_DA_DIRECAO) {
    gastas++;

    const r = await chamar({
      system: SISTEMA,
      user: pedidoDeReescrita({ ...peca }, veredito, gastas),
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));

    if (!r.ok) {
      // Provedor fora do ar NÃO é direção ruim. A peça para com o motivo certo,
      // e o dono é a casa (infraestrutura) — não o especialista.
      return {
        ok: false,
        reescritas: gastas,
        motivo:
          `${MARCA_DE_REESCRITA} ${gastas}/${MAX_REESCRITAS_DA_DIRECAO}] não consegui reescrever a direção de arte: ` +
          `${r.error}. A direção original continua recusada (falta ${vereditoInicial.faltou.join(", ")}). ` +
          `Nenhuma imagem foi gerada e nada foi gasto. Dono: a agência (infraestrutura de IA). ` +
          `Próxima ação: a rodada de arte tenta de novo quando o provedor voltar.`,
      };
    }

    const reescrita = limpar(r.texto);
    if (reescrita.length < 10) {
      ultimaFalha = "o especialista devolveu uma linha vazia ou curta demais para ser uma direção";
      veredito = vereditoInicial;
      continue;
    }

    // A MESMA régua, sem tolerância e sem segunda opinião. É de graça, e é o que
    // garante que o caminho de volta nunca vira porta de saída do portão.
    const novo = conferirDirecaoFotografavel(reescrita);
    if (novo.fotografavel) {
      return { ok: true, direcao: reescrita, veredito: novo, reescritas: gastas };
    }

    ultimaFalha = `a reescrita ${gastas} também não descreve uma foto: falta ${novo.faltou.join(", ")}`;
    veredito = novo;
  }

  // ── ESGOTOU: PARA DECLARANDO ──────────────────────────────────────────────
  // Motivo, dono e próxima ação na mesma linha. O que NÃO pode acontecer é a
  // peça voltar na rodada seguinte reprovando igual, para sempre, em silêncio.
  return {
    ok: false,
    reescritas: gastas,
    motivo:
      `${MARCA_DE_REESCRITA} ${gastas}/${MAX_REESCRITAS_DA_DIRECAO}] a direção de arte foi recusada e ` +
      `${gastas} reescrita(s) automática(s) não a consertaram — ${ultimaFalha}. ` +
      `Nenhuma imagem foi gerada e NADA foi gasto em imagem. ` +
      `Dono: o especialista que escreveu a peça (criação). ` +
      `Próxima ação: uma pessoa escreve a direção à mão — a foto tem de nomear quem/o quê aparece, ` +
      `onde (ou, num close-up, o enquadramento e o fundo) e sob que luz. ` +
      `A peça NÃO volta sozinha: este teto existe para ela não ficar reprovando para sempre.`,
  };
}
