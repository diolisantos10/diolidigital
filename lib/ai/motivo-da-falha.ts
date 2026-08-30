// POR QUE UM PROVEDOR CAIU — a régua de texto, e SÓ a régua de texto.
//
// ⚠️ ESTE ARQUIVO NÃO IMPORTA BANCO, E ISSO É A RAZÃO DE ELE EXISTIR (27/08/2026).
//
// A classificação nasceu dentro de `falha-de-provedor.ts`, junto da consulta
// que lê o `AIRunLog` — e portanto junto do cliente Prisma. Enquanto só o
// despertador e o painel liam o motivo, tanto fazia. Deixou de dar quando
// `generate.ts` — a camada por onde passam as 29 chamadas de IA da casa —
// precisou da mesma régua para tirar da fila quem está sem saldo: importá-la de
// lá arrastaria o banco inteiro para dentro do caminho quente de toda geração.
//
// Uma régua de TEXTO não tem por que abrir conexão com nada. Aqui ela fica
// sozinha, testável sem banco e barata de importar.
//
// `falha-de-provedor.ts` re-exporta tudo o que está aqui: nenhum chamador
// antigo precisou mudar de linha.

export type MotivoDaFalha = "sem_saldo" | "sem_chave" | "teto_de_ritmo" | "indisponivel";

/** O rótulo humano de cada motivo — para painel e alarme. */
export const ROTULO_DA_FALHA: Record<MotivoDaFalha, string> = {
  sem_saldo: "SEM SALDO na conta do provedor — só uma pessoa resolve, e a casa está servindo pela reserva",
  sem_chave: "sem chave conectada",
  teto_de_ritmo: "teto de ritmo do provedor (passa sozinho)",
  indisponivel: "provedor indisponível",
};

/**
 * Lê o motivo da MENSAGEM do provedor. Nunca do status sozinho — foi
 * exatamente o status sozinho que mandou a investigação para o lado errado.
 *
 * Devolve `null` quando não reconhece: dizer "não sei" é honesto, e é melhor
 * que encaixar à força numa categoria e fazer o painel mentir.
 */
export function classificarFalhaDeProvedor(mensagem: string | null | undefined): MotivoDaFalha | null {
  const m = (mensagem ?? "").toLowerCase();
  if (!m) return null;

  // Saldo primeiro: é o mais caro de confundir, e o texto é bem específico nos
  // provedores que a casa usa.
  // ⚠️ `no credits remaining` ENTROU DEPOIS, e o vão custou uma volta inteira.
  // Medido no livro-caixa de produção (25–26/08/2026): as 4 falhas de imagem
  // que impediram TODA a arte daquela volta diziam, palavra por palavra,
  // *"You have no credits remaining. Add credits to continue using the API"* —
  // a conta da OpenAI zerada. Esta régua devolvia `null` para essa frase, então
  // o placar, o diário e o alarme registravam "provider_error" genérico e
  // ninguém tinha como saber que a única causa desta lista que NENHUMA pessoa
  // resolve em código estava em jogo. É o mesmo defeito que o comentário abaixo
  // conta sobre o Claude em 24/08 — a lição valeu para um provedor e não foi
  // estendida ao outro.
  if (/credit balance is too low|no credits remaining|insufficient[_ ]?(quota|credit|balance|funds)|billing|quota exceeded|payment required|exceeded your current quota/.test(m)) {
    return "sem_saldo";
  }
  if (/\b(401|403)\b|invalid[_ ]?api[_ ]?key|unauthorized|authentication|api key not valid|não tem chave|sem chave|not_configured/.test(m)) {
    return "sem_chave";
  }
  if (/\b429\b|rate[_ ]?limit|too many requests|overloaded/.test(m)) {
    return "teto_de_ritmo";
  }
  if (/\b(500|502|503|504)\b|timeout|abort|network|fetch failed|erro de rede|indispon/.test(m)) {
    return "indisponivel";
  }
  return null;
}

/** O motivo já legível, para quem só vai mostrar. `null` vira o texto cru. */
export function motivoLegivel(mensagem: string | null | undefined): string {
  const c = classificarFalhaDeProvedor(mensagem);
  return c ? ROTULO_DA_FALHA[c] : (mensagem ?? "motivo não informado");
}
