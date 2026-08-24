// lacuna-de-escopo.ts — o que o cliente pediu com todas as letras e a casa não
// soube encaixar em nenhum dos serviços que ela sabe cotar.
//
// ─── O CASO QUE PRODUZIU ESTE ARQUIVO (Farol 27, 24/08/2026) ─────────────────
//
// Ana abriu a conversa dizendo, na primeira frase: *"quero um reposicionamento
// de marca e lançar um clube de assinatura"*, e declarou R$ 8.000 de verba de
// honorários. O que ficou gravado no escopo foi:
//
//     wantsSocialMedia: false · branding.requested: false
//     services: ["paid_traffic"] · businessName: "Farol"
//     orçamento: R$ 500–1.200/mês · confianca: "high"
//
// O serviço PRINCIPAL do pedido — a marca — virou `false`. Não "não sei":
// `false`. E `false` é uma afirmação: é a casa dizendo que o cliente NÃO pediu
// aquilo. Ela não sabia; ela só não tinha a palavra dele no vocabulário dela
// (o detector procurava `\breposicion\b`, e a palavra que a pessoa usou foi
// "reposicionamento" — o `\b` nunca fecha depois de um radical).
//
// ─── A REGRA DA CASA, APLICADA AQUI ──────────────────────────────────────────
//
// **Ausência de informação não é informação.** Quando o vocabulário do cliente
// não bate com o da casa, o certo NÃO é gravar `false` e seguir: é registrar
// que há um pedido em aberto, perguntar, e — enquanto não houver resposta —
// impedir que a estimativa saia com cara de número firme. Uma lacuna aberta
// derruba a confiança do orçamento (ver `live-calculator.ts`): escopo
// incompleto pode virar estimativa fraca, nunca preço com confiança alta.
//
// Este módulo NÃO cria serviço novo nem promete capacidade: ele só nomeia o que
// foi dito e ficou sem resposta. Quem decide o que a casa faz com isso é gente.

/** Um pedido do cliente que a casa ouviu e não conseguiu encaixar. */
export interface LacunaDeEscopo {
  /** Identidade estável — é por ela que a lacuna não é registrada duas vezes. */
  id: string;
  /** O trecho, nas palavras do cliente. Nunca reescrito pela casa. */
  oQueOClienteDisse: string;
  /** A pergunta que precisa ser feita antes de este escopo virar preço. */
  precisaConfirmar: string;
  /**
   * Quando o pedido CORRESPONDE a um serviço que a casa sabe cotar, o nome dele.
   * Serve para a lacuna se fechar sozinha no momento em que o serviço entra no
   * escopo — lacuna que sobrevive ao próprio conserto vira ruído e para de ser
   * lida. `undefined` = a casa não tem serviço mapeado para isto, e aí quem
   * responde é gente.
   */
  servicoDaCasa?: "branding" | "social" | "traffic";
}

/** Famílias de vocabulário. O radical é propositalmente CURTO e sem `\b` no
 *  fim: é exatamente o `\b` final que fez "reposicionamento" não casar com
 *  "reposicion" no caso Farol 27. */
const FAMILIAS: {
  id: string;
  padrao: RegExp;
  precisaConfirmar: string;
  servicoDaCasa?: LacunaDeEscopo["servicoDaCasa"];
}[] = [
  {
    id: "marca",
    padrao: /\b(?:reposicion\w*|reposition\w*|rebrand\w*|branding|identidade\s*(?:visual|de\s*marca)|posicionamento\s*(?:de\s*marca|da\s*marca)?|nova\s*marca|marca\s*nova|manual\s*de\s*marca|brand\s*book)\b/i,
    precisaConfirmar:
      "O cliente falou de MARCA (reposicionamento / identidade). Confirmar se ele quer o serviço de identidade visual da casa e em que profundidade.",
    servicoDaCasa: "branding",
  },
  {
    id: "lancamento",
    padrao: /\b(?:lan[çc]ament\w*|lan[çc]ar|clube\s*de\s*assinatura|assinatura\s*mensal|linha\s*nova|novo\s*produto)\b/i,
    precisaConfirmar:
      "O cliente falou de LANÇAMENTO (produto/clube novo). A casa não tem um serviço fechado com esse nome — confirmar o que ele espera e quem monta o escopo.",
  },
  {
    id: "redes",
    padrao: /\b(?:redes\s*sociais|social\s*media|conte[úu]do|instagram|feed)\b/i,
    precisaConfirmar:
      "O cliente falou de REDES SOCIAIS. Confirmar volume e canais antes de cotar.",
    servicoDaCasa: "social",
  },
  {
    id: "trafego",
    padrao: /\b(?:tr[áa]fego\s*pago|an[úu]ncio\w*|campanha\s*paga|meta\s*ads|google\s*ads|impulsion\w*)\b/i,
    precisaConfirmar:
      "O cliente falou de MÍDIA PAGA. Confirmar verba de anúncios e praça.",
    servicoDaCasa: "traffic",
  },
];

/**
 * As lacunas que ESTE texto abre.
 *
 * Trabalha só sobre o que foi dito — não olha o escopo. Quem decide se a lacuna
 * ainda está aberta é `lacunasAbertas`, com o escopo na mão: o mesmo texto que
 * abre a lacuna da marca também é o que, depois de confirmado, a fecha.
 */
export function lacunasDoTexto(texto: unknown): LacunaDeEscopo[] {
  if (typeof texto !== "string" || !texto.trim()) return [];
  const out: LacunaDeEscopo[] = [];
  for (const f of FAMILIAS) {
    const m = texto.match(f.padrao);
    if (!m) continue;
    out.push({
      id: f.id,
      oQueOClienteDisse: trecho(texto, m.index ?? 0),
      precisaConfirmar: f.precisaConfirmar,
      servicoDaCasa: f.servicoDaCasa,
    });
  }
  return out;
}

/** Une lacunas sem duplicar por id. A primeira leitura manda: é a frase
 *  original do cliente, e reescrevê-la com a repetição dele apaga a prova. */
export function unirLacunas(a: LacunaDeEscopo[] = [], b: LacunaDeEscopo[] = []): LacunaDeEscopo[] {
  const porId = new Map<string, LacunaDeEscopo>();
  for (const l of [...a, ...b]) if (!porId.has(l.id)) porId.set(l.id, l);
  return [...porId.values()];
}

/** Escopo mínimo que este módulo precisa enxergar. Declarado local de propósito:
 *  `BriefingScope` importa tipos de comercial, e importar de volta fecharia um
 *  ciclo. */
export interface EscopoLido {
  wantsSocialMedia?: boolean;
  wantsPaidTraffic?: boolean;
  branding?: { requested?: boolean };
  lacunasDeEscopo?: LacunaDeEscopo[];
}

/**
 * As lacunas que CONTINUAM abertas, dado o escopo atual.
 *
 * Uma lacuna com serviço mapeado se fecha sozinha quando aquele serviço entra
 * no escopo — foi confirmado, virou pedido, acabou a dúvida. Lacuna sem serviço
 * mapeado ("clube de assinatura") só fecha quando gente resolve, e por isso
 * fica aberta o tempo todo: é ela que segura a confiança do orçamento lá
 * embaixo, que é exatamente o efeito desejado.
 */
export function lacunasAbertas(escopo: EscopoLido | undefined): LacunaDeEscopo[] {
  const todas = escopo?.lacunasDeEscopo ?? [];
  return todas.filter((l) => {
    if (l.servicoDaCasa === "branding") return !escopo?.branding?.requested;
    if (l.servicoDaCasa === "social")   return !escopo?.wantsSocialMedia;
    if (l.servicoDaCasa === "traffic")  return !escopo?.wantsPaidTraffic;
    return true;
  });
}

/** O pedaço da frase do cliente ao redor do termo que abriu a lacuna.
 *  Guardado com as palavras DELE: é a prova de que ele pediu, e é o que quem
 *  for perguntar precisa reler. Recortado porque a lacuna viaja gravada em
 *  JSON no pedido, e a mensagem inteira ali dentro vira lixo. */
function trecho(texto: string, indice: number): string {
  const ini = Math.max(0, indice - 40);
  const fim = Math.min(texto.length, indice + 80);
  return (ini > 0 ? "…" : "") + texto.slice(ini, fim).trim() + (fim < texto.length ? "…" : "");
}
