// lib/agency/celula/mensagens/perguntas-por-servico.ts
//
// FICHA E DA ONDA 2 DA CÉLULA DE PROSPECÇÃO — perguntas por tipo de serviço,
// progressivas. Fonte: docs/celula-prospeccao/despachos/E-perguntas-por-servico.md.
//
// ─── O DADO É O DADO, NÃO O PROMPT ───────────────────────────────────────────
//
// As perguntas em si moram em docs/plataformas/99freelas/perguntas-por-servico.json,
// no MESMO formato de docs/plataformas/99freelas/policy.json — dado versionado,
// nunca texto amarrado dentro de um prompt. Este módulo só LÊ esse dado e o
// entrega tipado, com uma única trava que importa de verdade:
//
//   TRAVA: UMA DECISÃO POR VEZ. proximaPergunta() devolve UMA pergunta ou
//   null — nunca uma lista. A assinatura é a trava: quem não pode devolver duas
//   não devolve duas.
//
// ─── O QUE O CATÁLOGO REAL NÃO COBRE, E COMO ISSO APARECE AQUI ──────────────
//
// Dos quatro serviços que o CEO pediu (social media, site, branding, vídeo),
// só social media está de fato pronto para vender hoje. Os outros três têm
// buracos reais no catálogo (lib/agency/self-serve-catalog.ts,
// lib/agency/planos.ts, lib/agency/capacidade-de-producao.ts):
//
//   • site       — não existe item de catálogo nem capacidade de produção.
//                  lib/agency/planos.ts trata Site como projeto próprio,
//                  orçado caso a caso — sem régua de preço nenhuma em código.
//   • branding   — identidade-basica existe no self-serve-catalog, mas está
//                  em CATALOGO_SUSPENSO: falta a capacidade logotipo-de-cliente
//                  (ponto: null em lib/agency/capacidade-de-producao.ts).
//   • vídeo      — 1-reel e pack-2-reels também estão em CATALOGO_SUSPENSO:
//                  falta legenda-animada-em-video (ponto: null). E
//                  lib/agency/planos.ts diz, com todas as letras, que vídeo
//                  não é produzido hoje em nenhum plano, em nenhuma forma.
//
// Onde o catálogo não cobre, o JSON declara oQueColhe e comoSePergunta como
// PLACEHOLDER_CEO (preciso confirmar com o CEO) em vez de inventar uma
// pergunta que ninguém vai saber precificar depois. E — isto é o ponto deste
// módulo, não só do JSON — esses placeholders NUNCA saem por proximaPergunta().
// Mandar preciso confirmar com o CEO para um cliente seria pior do que não
// perguntar nada; é decisão interna, não pergunta de briefing. Eles só
// aparecem em perguntasEmAberto(), que é uso INTERNO da casa (tela,
// diagnóstico) — e o comentário dela deixa isso escrito, porque se ela
// alimentasse mensagem ao cliente a trava acima seria decorativa.
//
// ─── REAPROVEITAMENTO DE PERGUNTA, NÃO DUPLICAÇÃO ────────────────────────────
//
// Todo id que já existe em lib/agency/comercial/pergunta-repetida.ts
// (O_QUE_A_PERGUNTA_DE_IA_COLHE, COMO_SE_PERGUNTA_AO_CLIENTE, a fila FILA) usa
// o MESMO texto de lá, ou um texto adaptado quando o genérico prometeria algo
// que a casa não faz (ex.: material_pronto de vídeo NÃO reaproveita a gente
// produz do zero — a capacidade real só edita o bruto que o cliente já
// filmou). O teste confere a origem de cada reaproveitamento.

import dadoBruto from "@/docs/plataformas/99freelas/perguntas-por-servico.json";

/** O texto que marca um campo como decisão pendente do CEO — nunca uma
 *  pergunta pronta para o cliente. Comparação por igualdade exata, de
 *  propósito: um texto que só CONTÉM a frase não é o mesmo sinal. */
export const PLACEHOLDER_CEO = "preciso confirmar com o CEO";

export interface PerguntaDoServico {
  id: string;
  oQueColhe: string;
  comoSePergunta: string;
  obrigatoria: boolean;
  ordem: number;
  dependeDe: string | null;
  porQuePrecisamosDisto: string;
}

export interface ServicoComPerguntas {
  servico: string;
  origemNoCatalogo: string;
  perguntas: PerguntaDoServico[];
}

interface DadoDePerguntasPorServico {
  _leia_isto: string[];
  plataforma: string;
  versao: string;
  atualizadoEm: string;
  servicos: ServicoComPerguntas[];
}

const DADO = dadoBruto as unknown as DadoDePerguntasPorServico;

/** Os quatro serviços do CEO, tal como o JSON declara. Congelado aqui como
 *  ponto único de leitura — quem quiser o dado bruto lê daqui, não reabre o
 *  JSON em outro lugar. */
export const SERVICOS_COM_PERGUNTAS: readonly ServicoComPerguntas[] = DADO.servicos;

const POR_SERVICO = new Map<string, ServicoComPerguntas>(
  SERVICOS_COM_PERGUNTAS.map((s) => [s.servico, s]),
);

/** undefined quando o nome do serviço não existe no dado — e não existir nunca
 *  vira trata como o primeiro serviço da lista. */
export function servicoPorNome(servico: string): ServicoComPerguntas | undefined {
  return POR_SERVICO.get(servico);
}

function temValor(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  return v !== undefined && v !== null;
}

/**
 * Verdadeiro quando a pergunta está PRONTA para ir ao cliente.
 *
 * Falso para PLACEHOLDER_CEO (decisão pendente do CEO) e para texto vazio.
 * Esta função é a fronteira entre o que é dado interno (perguntasEmAberto) e
 * o que pode virar fala para o cliente (proximaPergunta) — sem ela, o
 * placeholder vazaria pela mesma porta que uma pergunta de verdade.
 */
export function prontaParaEnvio(pergunta: Pick<PerguntaDoServico, "comoSePergunta">): boolean {
  const texto = (pergunta.comoSePergunta ?? "").trim();
  return texto.length > 0 && texto !== PLACEHOLDER_CEO;
}

/**
 * A PRÓXIMA pergunta a fazer para este serviço — nunca uma lista.
 *
 * Devolve UMA pergunta ou null (nada mais a perguntar AGORA — o que não é o
 * mesmo que briefing completo: ver perguntasEmAberto para o que ainda falta
 * de verdade, inclusive o que está pendente de decisão do CEO).
 *
 * Regras, todas obrigatórias:
 *   1. respeita ordem;
 *   2. respeita dependeDe — não pergunta o dependente antes do requisito
 *      estar em jaRespondidas;
 *   3. não repete o que já está em jaRespondidas nem em jaPerguntadas;
 *   4. nunca devolve uma pergunta cujo comoSePergunta seja PLACEHOLDER_CEO —
 *      ver prontaParaEnvio.
 */
export function proximaPergunta(p: {
  servico: string;
  jaRespondidas: Readonly<Record<string, string>>;
  jaPerguntadas: readonly string[];
}): { id: string; comoSePergunta: string; porQue: string } | null {
  const s = servicoPorNome(p.servico);
  if (!s) return null;

  const respondidas = new Set(
    Object.keys(p.jaRespondidas ?? {}).filter((k) => temValor(p.jaRespondidas[k])),
  );
  const perguntadas = new Set(p.jaPerguntadas ?? []);

  const ordenadas = [...s.perguntas].sort((a, b) => a.ordem - b.ordem);

  for (const pergunta of ordenadas) {
    if (respondidas.has(pergunta.id)) continue;
    if (perguntadas.has(pergunta.id)) continue;
    if (pergunta.dependeDe && !respondidas.has(pergunta.dependeDe)) continue;
    if (!prontaParaEnvio(pergunta)) continue;
    return {
      id: pergunta.id,
      comoSePergunta: pergunta.comoSePergunta,
      porQue: pergunta.porQuePrecisamosDisto,
    };
  }
  return null;
}

/**
 * TODAS as perguntas ainda em aberto — para uso INTERNO da casa (tela de
 * diagnóstico do serviço, painel do time).
 *
 * NÃO alimenta mensagem ao cliente. Se ela alimentasse, a trava de
 * proximaPergunta() seria decorativa: esta função DEVOLVE os placeholders
 * PLACEHOLDER_CEO, de propósito — é exatamente o que a equipe precisa ver
 * (branding tem um campo esperando decisão do CEO) e exatamente o que
 * nunca pode chegar ao cliente como se fosse uma pergunta de verdade.
 */
export function perguntasEmAberto(p: {
  servico: string;
  jaRespondidas: Readonly<Record<string, string>>;
}): PerguntaDoServico[] {
  const s = servicoPorNome(p.servico);
  if (!s) return [];
  const respondidas = new Set(
    Object.keys(p.jaRespondidas ?? {}).filter((k) => temValor(p.jaRespondidas[k])),
  );
  return [...s.perguntas]
    .filter((pergunta) => !respondidas.has(pergunta.id))
    .sort((a, b) => a.ordem - b.ordem);
}
