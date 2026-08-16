// O LINK DE WHATSAPP DA CASA — um lugar só para o número e para o texto.
//
// ─── O DEFEITO QUE PRODUZIU ESTE ARQUIVO (16/08/2026) ────────────────────────
//
// Achado do especialista `experiencia`: na tela de confirmação do briefing, o
// botão "Falar com a Dioli no WhatsApp" abria `wa.me/5511989400692` **sem texto
// nenhum**. A pessoa tinha acabado de contar o negócio inteiro ao SDR — segmento,
// objetivo, volume por semana, verba — e chegava no WhatsApp diante de uma caixa
// VAZIA, tendo de recomeçar do zero.
//
// O agravante: **na home o mesmo botão já mandava contexto**. Não era falta de
// capacidade, era inconsistência — e inconsistência entre duas telas da mesma
// casa é sempre a mesma coisa: duas mãos escrevendo a mesma regra sem se falar.
// O número `5511989400692` estava repetido em oito lugares do repositório.
//
// ─── AS DUAS LEIS DESTE ARQUIVO ──────────────────────────────────────────────
//
// 1. **NADA QUE O CLIENTE NÃO DISSE.** Campo ausente SOME da mensagem. Não vira
//    "não informado", não vira placeholder, não vira chute. O texto é enviado
//    **em nome dele**: pôr palavra na boca do cliente é pior que mensagem curta.
//
// 2. **NUNCA TRUNCAR NO MEIO.** Ver `LIMITE_DO_TEXTO` abaixo. Quando não cabe,
//    saem ITENS INTEIROS, jamais metade de uma palavra. Mensagem cortada no meio
//    é a assinatura de sistema quebrado — e uma frase pela metade enviada em nome
//    do cliente é pior do que uma frase curta.

/** O WhatsApp da agência. Só dígitos, com código do país (55) e DDD (11). */
export const WHATSAPP_DA_DIOLI = "5511989400692";

/**
 * O TETO DO TEXTO, EM CARACTERES — e por que 350.
 *
 * O `wa.me` carrega a mensagem na QUERY STRING, então o que importa não é o
 * tamanho do texto e sim o da URL depois de codificada. Em português a conta é
 * pior do que parece: cada acento vira `%C3%A9` (6 caracteres no lugar de 1), e
 * cada quebra de linha vira `%0A`. Um texto de 350 caracteres cheio de acentos
 * chega perto de 1.000 na URL.
 *
 * Os limites reais que a casa tem de respeitar:
 *   • ~2.000 caracteres — navegadores e webviews antigos (o piso conhecido);
 *   • ~8.000 — intent do Android;
 *   • o WhatsApp aceita muito mais, mas ele é o ÚLTIMO da fila, não o primeiro.
 *
 * 350 deixa a URL em torno de 1.000 no pior caso — folga de 2× contra o piso.
 * E há uma razão de produto além da técnica: isto é uma mensagem de ABERTURA de
 * conversa. Ninguém lê no celular um parágrafo de dez linhas que ele mesmo
 * teoricamente escreveu — e mensagem que a pessoa apaga antes de enviar não
 * economizou nada do trabalho dela.
 */
export const LIMITE_DO_TEXTO = 350;

export interface ContextoDaConversa {
  /** Como a pessoa se apresentou. Ausente = a mensagem não se apresenta. */
  nome?: string | null;
  /** O negócio dela. Ausente = some; NUNCA "Negócio não informado" aqui — esse
   *  rótulo é da tela interna, não da boca do cliente. */
  negocio?: string | null;
  /** O que ela pediu, nas palavras que ficaram gravadas. */
  servicos?: string[] | null;
  /** A referência do briefing, para a casa achar o registro sem perguntar de
   *  novo. É o único dado aqui que serve mais à agência do que ao cliente — e
   *  por isso vai no fim, curto, e nunca no lugar do assunto. */
  referencia?: string | null;
}

function limpo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * A mensagem que o cliente vê já escrita ao abrir o WhatsApp.
 *
 * Montada por PARTES OPCIONAIS: cada uma só entra se o dado existir. Com o
 * escopo inteiro vazio, sobra uma frase curta e enviável — que é o
 * comportamento certo, e não um erro a tratar.
 */
export function mensagemDoBriefing(ctx: ContextoDaConversa): string {
  const nome = limpo(ctx.nome);
  const negocio = limpo(ctx.negocio);
  const servicos = (ctx.servicos ?? []).map(limpo).filter((s): s is string => s !== null);
  const referencia = limpo(ctx.referencia);

  // A abertura. Sem nome, ela não inventa um "Olá, sou [alguém]" — apenas
  // aponta o que aconteceu, que é verdade em qualquer caso.
  const partes: string[] = [];
  partes.push(
    nome
      ? `Olá! Aqui é ${nome}. Acabei de enviar um briefing pelo site da Dioli`
      : "Olá! Acabei de enviar um briefing pelo site da Dioli",
  );
  if (negocio) partes.push(` — sou do ${negocio}`);
  partes.push(".");

  let corpo = partes.join("");

  // O que foi pedido. Entra INTEIRO ou não entra: uma lista de serviços cortada
  // no meio ("social media, planejamento de con") descreveria errado o pedido
  // da pessoa.
  if (servicos.length > 0) {
    const linha = ` Pedi: ${servicos.join(", ")}.`;
    if (corpo.length + linha.length <= LIMITE_DO_TEXTO) corpo += linha;
  }

  // A referência é o que a casa usa para achar o registro sem fazer a pessoa
  // repetir tudo — o objetivo inteiro deste arquivo. Se não couber com os
  // serviços, ela ganha a vaga: repetir o pedido é chato; repetir o briefing
  // inteiro porque ninguém acha o registro é o defeito que estamos consertando.
  if (referencia) {
    const cauda = ` (ref. ${referencia})`;
    if (corpo.length + cauda.length <= LIMITE_DO_TEXTO) {
      corpo += cauda;
    } else {
      const semServicos =
        partes.join("") + (partes.join("").length + cauda.length <= LIMITE_DO_TEXTO ? cauda : "");
      corpo = semServicos;
    }
  }

  return corpo;
}

/**
 * A URL do WhatsApp. Uma função só, para que ninguém volte a escrever
 * `https://wa.me/...` à mão — foi assim que o número acabou em oito arquivos e
 * o texto em nenhum.
 */
export function linkDoWhatsApp(texto?: string | null, numero: string = WHATSAPP_DA_DIOLI): string {
  const t = limpo(texto);
  if (!t) return `https://wa.me/${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(t)}`;
}

/** Atalho para o caso desta casa: da confirmação do briefing direto ao link. */
export function linkDoBriefing(ctx: ContextoDaConversa): string {
  return linkDoWhatsApp(mensagemDoBriefing(ctx));
}
