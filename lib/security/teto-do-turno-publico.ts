// O TETO DE **TAMANHO** DA PORTA PÚBLICA DO SDR.
//
// ── O furo que este arquivo fecha (parecer de segurança, 16/08/2026) ─────────
// `POST /api/sdr/chat` é PÚBLICO — sem login, sem token — e repassa o que
// receber à chave de IA PAGA da agência.
//
//   • `limiteExcedido` (`lib/security/limite-no-banco.ts`) limita a QUANTIDADE
//     de requisições por IP. Nunca limitou o TAMANHO de nenhuma delas.
//   • `MAX_HISTORY = 18` limita a QUANTIDADE de turnos. Nunca o tamanho deles.
//   • Não existe `middleware.ts` neste repositório e `next.config.ts` só limita
//     corpo de Server Action — a rota de API não é Server Action.
//
// Conta medida pelo especialista: **~US$ 18/min por IP**, multiplicável por IP.
//
// ── POR QUE O TETO QUE JÁ EXISTIA NÃO CONTAVA ───────────────────────────────
// O teto do dossiê de anexos (`dossieDosAnexos`, 16/08) mora num COMPONENTE
// REACT. Atacante nenhum executa React: ele faz `POST` com `curl`. Teto que só
// roda no navegador não é teto — é sugestão para quem usa a tela. Este arquivo
// é a metade que faltava, e roda no servidor, antes da chamada ao modelo.
//
// ── A REGRA DE OURO DESTES NÚMEROS: NÃO CORTAR O BRIEFING DE NINGUÉM ────────
// Cortar a conversa legítima é pior que o defeito que se conserta. Todos os
// tetos abaixo são declarados com a conta do caso legítimo MAIS CHEIO ao lado,
// e há teste que prova que uma conversa real e cheia passa INTEIRA.

/** O que o navegador manda em `messages[]`. */
export interface MensagemDaConversa {
  role: string;
  text: string;
}

/** O que a API do modelo recebe. */
export interface TurnoParaOModelo {
  role: "user" | "assistant";
  content: string;
}

/** Quantos turnos do histórico vão ao modelo (era `MAX_HISTORY` na rota). */
export const MAX_TURNOS = 18;

/**
 * Teto da mensagem do turno (`currentMessage`).
 *
 * A CONTA DO CASO LEGÍTIMO MAIS CHEIO: o dossiê de anexos vale no máximo
 * `TETO_DURO_DO_DOSSIE` = 16.000 caracteres (12.000 de conteúdo + cabeçalhos,
 * listas de nomes e instruções — ver `dossieDosAnexos`), e a mensagem digitada
 * vem colada nele. 32.000 deixa **16.000 caracteres livres para o que a pessoa
 * escreve ou COLA à mão** — um briefing inteiro colado no campo de texto, com o
 * dossiê de dois PDFs junto, e ainda sobra. O caso real do CEO (dois PDFs de
 * briefing) mede ~12.500.
 */
export const TETO_DA_MENSAGEM = 32_000;

/**
 * Teto da SOMA de `messages[].text` que sobe ao modelo.
 *
 * O histórico carrega só a bolha visível — a resposta do SDR tem 2 a 4 frases
 * (~400 caracteres) e a fala do cliente é curta. Uma conversa de 18 turnos
 * cheia mede ~8.000. 48.000 é **seis vezes** isso: cabem duas colagens de
 * briefing inteiro (16.000 cada) dentro do histórico e o papo normal em volta.
 *
 * Quando estoura, quem cai é o turno MAIS ANTIGO — nunca o mais recente, que é
 * onde está o que a pessoa acabou de dizer.
 */
export const TETO_DO_HISTORICO = 48_000;

/**
 * Teto do contexto interno (`scope`) serializado. O scope real de uma conversa
 * completa mede ~800 caracteres; 6.000 é sete vezes. Ele também vem do
 * navegador e também é colado no prompt — sem teto, é a mesma porta com outro
 * nome.
 */
export const TETO_DO_CONTEXTO = 6_000;

/**
 * Teto do CORPO da requisição, conferido pelo `content-length` ANTES de
 * `req.json()`.
 *
 * Os tetos acima só valem depois do parse, e o parse de um corpo de 500 MB já
 * é o dano (memória do processo). O corpo legítimo mais cheio mede ~90 KB;
 * 1 MB é dez vezes.
 */
export const TETO_DO_CORPO_BYTES = 1_000_000;

/** O corte é DITO. Truncar em silêncio faz o modelo tratar meia frase como a
 *  frase inteira — ausência de informação não é informação. */
export const MARCA_DE_CORTE = "\n[…cortado por tamanho pelo servidor]";

/**
 * O corpo é grande demais para sequer ser lido?
 *
 * `content-length` ausente (corpo em `chunked`) devolve `false` de propósito:
 * daí não se conclui nada, e os tetos de depois do parse continuam de pé. Esta
 * é a primeira barreira, não a única.
 */
export function corpoGrandeDemais(headers: Headers, teto: number = TETO_DO_CORPO_BYTES): boolean {
  const bruto = headers.get("content-length");
  if (!bruto) return false;
  const n = Number(bruto);
  return Number.isFinite(n) && n > teto;
}

/**
 * Corta um texto no teto, deixando a marca de que foi cortado.
 *
 * A marca entra DENTRO do teto (`teto - marca`), não depois dele: teto que o
 * próprio aviso estoura não é teto, e é assim que se perde a prova de que o
 * limite vale para toda entrada possível.
 */
export function apararTexto(texto: string, teto: number): { texto: string; cortou: boolean } {
  if (texto.length <= teto) return { texto, cortou: false };
  const espaco = Math.max(0, teto - MARCA_DE_CORTE.length);
  return { texto: texto.slice(0, espaco) + MARCA_DE_CORTE.slice(0, teto), cortou: true };
}

/**
 * O histórico que vai ao modelo: filtrado, limitado em QUANTIDADE e em TAMANHO.
 *
 * ⚠️ `text` que não é string é DESCARTADO, não convertido. O corpo é JSON livre
 * vindo de porta pública: `{"role":"user","text":[{"type":"image","source":…}]}`
 * chegaria à API da Anthropic como BLOCO DE CONTEÚDO, não como texto — um jeito
 * de mandar a chave da agência buscar imagem em endereço escolhido por quem
 * chamou. Só string entra.
 *
 * A ordem importa: primeiro os 18 turnos mais recentes, depois o teto de
 * tamanho **de trás para frente**. Cortar do fim jogaria fora justamente a
 * última fala do cliente.
 */
export function historicoParaOModelo(
  messages: unknown[],
  teto: number = TETO_DO_HISTORICO,
  maxTurnos: number = MAX_TURNOS,
): { turnos: TurnoParaOModelo[]; descartados: number; cortou: boolean } {
  const limpos: MensagemDaConversa[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const { role, text } = m as { role?: unknown; text?: unknown };
    if (typeof text !== "string") continue;
    if (role === "system") continue;
    limpos.push({ role: role === "assistant" ? "assistant" : "user", text });
  }

  const recentes = limpos.slice(-maxTurnos);
  const descartadosPorQuantidade = limpos.length - recentes.length;

  const invertidos: TurnoParaOModelo[] = [];
  let usado = 0;
  let cortou = false;
  let descartadosPorTamanho = 0;

  for (let i = recentes.length - 1; i >= 0; i--) {
    const m = recentes[i];
    const sobra = teto - usado;
    if (sobra <= 0) {
      descartadosPorTamanho += i + 1;
      break;
    }
    const { texto, cortou: c } = apararTexto(m.text, sobra);
    if (c) cortou = true;
    usado += texto.length;
    invertidos.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: texto,
    });
  }

  return {
    turnos: invertidos.reverse(),
    descartados: descartadosPorQuantidade + descartadosPorTamanho,
    cortou,
  };
}

/**
 * O contexto interno (`scope`) serializado e limitado.
 *
 * Estourar o teto NÃO apaga o scope: apagar faria o SDR repetir perguntas que o
 * cliente já respondeu, que é o defeito de 15/08. Corta e diz que cortou.
 */
export function contextoInternoSerializado(
  scope: unknown,
  teto: number = TETO_DO_CONTEXTO,
): { json: string; cortou: boolean } {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return { json: "", cortou: false };
  if (Object.keys(scope as Record<string, unknown>).length === 0) return { json: "", cortou: false };
  let bruto: string;
  try {
    bruto = JSON.stringify(scope);
  } catch {
    // Referência circular vinda de porta pública: não é contexto utilizável.
    return { json: "", cortou: true };
  }
  return { json: apararTexto(bruto, teto).texto, cortou: bruto.length > teto };
}
