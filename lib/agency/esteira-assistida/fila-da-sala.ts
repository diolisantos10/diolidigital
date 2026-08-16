// A FILA DA SALA DO PM — uma linha por lead, não três listas paralelas.
//
// ─── POR QUE ISTO EXISTE (16/08/2026) ──────────────────────────────────────
//
// A primeira versão desta sala tinha 10 cartões, e o `experiencia` percorreu
// com o app rodando: **"Sushi Cazza, 58 dias, sem contato" aparecia DUAS vezes
// na mesma tela, a 200px de distância**, e uma terceira em `/agency/leads`. Um
// cartão dizia quem estava parado; outro, logo abaixo, dizia por que não
// andou — sobre exatamente as mesmas pessoas.
//
// **Recusa não é uma lista. É um ATRIBUTO da linha do lead.**
// "Sushi Cazza · 58 dias · sem contato · recusado há 17 min" é UMA linha.
//
// E o título da linha era o DONO ("PM da esteira"), não o cliente: com 25
// recusas, a tela virava 25 cabeçalhos idênticos com o nome do negócio
// enterrado no meio do parágrafo. Quem lê a sala pergunta "quem?", não
// "de quem é a culpa?".

import { idadeEmPortugues, type LinhaDeRecusaVisivel } from "./recusa-visivel";

/** O que a sala sabe sobre quem está na porta (vem de `quemBateuNaPorta`). */
export interface LeadNaFila {
  id: string;
  negocio: string;
  diasEsperando: number;
  temComoFalar: boolean;
  porQueNaoDaParaFalar: string | null;
  desleixo: boolean;
}

/** O que a sala sabe sobre quem travou no meio da esteira. */
export interface TravadoNaFila {
  id: string;
  businessName: string;
  createdAt: Date;
}

export interface LinhaDaFila {
  id: string;
  /** O TÍTULO é o negócio. Sempre. Quem lê pergunta "quem?". */
  negocio: string;
  /** `decisao` = a esteira parou e precisa de gente. `espera` = na porta. */
  tipo: "decisao" | "espera";
  /** A espera do lead, em português. */
  espera: string;
  /** Os atributos da linha, em ordem de gravidade. Nunca uma lista à parte. */
  atributos: string[];
  /** O motivo mais recente, quando existe. Uma frase, não um parágrafo solto. */
  motivo: string | null;
  /** Quando a esteira recusou pela última vez. */
  recusadoHa: string | null;
  /** Para onde a linha leva — beco sem saída não é fila, é decoração. */
  href: string;
  /** Vermelho quando a bola é da agência e o prazo já passou. */
  urgente: boolean;
}

/**
 * Junta lead + recusa numa linha só.
 *
 * As recusas chegam por `correlationId` (`porta:<id da solicitação>`), que é
 * como a varredura as grava. A mais recente vence — recusa velha do mesmo lead
 * é história, não estado.
 */
export function montarFilaDaSala(entrada: {
  leads: LeadNaFila[];
  travados: TravadoNaFila[];
  recusas: LinhaDeRecusaVisivel[];
  agora: Date;
}): LinhaDaFila[] {
  const maisRecentePorCorrelacao = new Map<string, LinhaDeRecusaVisivel>();
  for (const r of entrada.recusas) {
    const atual = maisRecentePorCorrelacao.get(r.correlationId);
    if (!atual || r.em.getTime() > atual.em.getTime()) maisRecentePorCorrelacao.set(r.correlationId, r);
  }
  const recusaDe = (solicitacaoId: string) => maisRecentePorCorrelacao.get(`porta:${solicitacaoId}`) ?? null;

  // Quem parou no meio da esteira vem PRIMEIRO: a bola é da agência, e é a
  // única coisa nesta tela que só anda com alguém decidindo.
  const decisoes: LinhaDaFila[] = entrada.travados.map((t) => {
    const recusa = recusaDe(t.id);
    return {
      id: t.id,
      negocio: t.businessName,
      tipo: "decisao",
      espera: idadeEmPortugues(t.createdAt, entrada.agora),
      atributos: ["a esteira parou — precisa de decisão da agência"],
      motivo: recusa?.motivo ?? null,
      recusadoHa: recusa?.idade ?? null,
      href: `/agency/leads#${t.id}`,
      urgente: true,
    };
  });

  const esperas: LinhaDaFila[] = entrada.leads.map((l) => {
    const recusa = recusaDe(l.id);
    const atributos: string[] = [];
    if (!l.temComoFalar) atributos.push(`sem contato — ${l.porQueNaoDaParaFalar ?? "nenhum canal declarado"}`);
    else if (l.desleixo) atributos.push("passou do prazo de resposta prometido na tela pública");

    // ⚠️ O MOTIVO SÓ APARECE QUANDO ACRESCENTA. Achado ao RENDERIZAR, não ao
    // ler: com o atributo "sem contato — o briefing foi enviado sem nome de
    // contato e sem canal" logo acima, o motivo da recusa dizia a MESMA COISA
    // em três linhas. Era a repetição que o `experiencia` cobrou, só que agora
    // dentro da própria linha em vez de em dois cartões. Atributo é a razão
    // curta; motivo é o que o atributo não cobre.
    const motivo = atributos.length > 0 ? null : recusa?.motivo ?? null;

    return {
      id: l.id,
      negocio: l.negocio,
      tipo: "espera",
      espera: `${l.diasEsperando} dia(s)`,
      atributos,
      motivo,
      recusadoHa: recusa?.idade ?? null,
      href: `/agency/leads#${l.id}`,
      // Urgente é quem DÁ para responder e ninguém respondeu. Quem não deixou
      // canal é problema de dado, não de atendimento — cobrar alguém por não
      // ter ligado para quem não deixou telefone é cobrar o impossível.
      urgente: l.temComoFalar && l.desleixo,
    };
  });

  // Dentro de cada grupo, quem espera há mais tempo primeiro.
  const porEspera = (a: LinhaDaFila, b: LinhaDaFila) => (b.espera > a.espera ? 1 : -1);
  return [...decisoes, ...esperas.sort((a, b) => (a.urgente === b.urgente ? porEspera(a, b) : a.urgente ? -1 : 1))];
}

/** A frase de conclusão, antes de qualquer número. Regra da casa. */
export function leituraDaSala(fila: LinhaDaFila[], esteiraLigada: boolean): string {
  const decisoes = fila.filter((l) => l.tipo === "decisao").length;
  const semContato = fila.filter((l) => l.atributos.some((a) => a.startsWith("sem contato"))).length;
  const esperando = fila.length - decisoes - semContato;

  if (fila.length === 0) {
    return esteiraLigada
      ? "Ninguém esperando e nada travado — a esteira está fluindo."
      : "Ninguém esperando na porta. A esteira automática está desligada; ligue abaixo para que os próximos briefings andem sozinhos.";
  }
  if (!esteiraLigada) {
    return `A esteira automática está DESLIGADA: ${fila.length} pessoa(s) na fila e nenhuma vai andar sozinha. Ligue no interruptor abaixo.`;
  }
  const partes: string[] = [];
  if (decisoes > 0) partes.push(`${decisoes} esperando DECISÃO SUA`);
  if (esperando > 0) partes.push(`${esperando} esperando resposta`);
  if (semContato > 0) partes.push(`${semContato} sem canal para responder`);
  return `${partes.join(" · ")}.`;
}
