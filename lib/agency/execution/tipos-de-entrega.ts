// tipos-de-entrega.ts — O REGISTRO ÚNICO DO QUE CADA TIPO DE ENTREGA É.
//
// ─── O DEFEITO QUE ISTO FECHA (24/08/2026) ───────────────────────────────────
//
// A "Pauta do mês" nasceu marcada como `social` — o mesmo tipo das legendas
// prontas — e `TIPOS_PUBLICAVEIS` inclui `social`. O calendário interno do mês
// entrou na fila para VIRAR POST no perfil do cliente. O conserto pontual foi
// dar a ela o tipo `plano-de-conteudo`; o defeito de classe continuava aberto:
// **o tipo de um especialista era uma string livre, e nenhuma lista sabia da
// existência dele.**
//
// Aqui o tipo deixa de ser string solta e passa a ser um REGISTRO com uma
// resposta obrigatória: isto vai ao ar, ou é documento?
//
// ⚠️ UMA VERDADE, NÃO DUAS. `publicacao.ts` deriva a lista de publicáveis
// daqui, em vez de manter a sua. Duas listas da mesma verdade é a doença que
// esta casa já pagou várias vezes.
//
// ⚠️ ISTO NÃO SUBSTITUI `TIPOS_DE_DOCUMENTO_INTERNO` (`regua-do-texto.ts`) nem
// `TIPOS_DE_PLANEJAMENTO` (`quality-auditor.ts`). São perguntas DIFERENTES, e
// juntá-las isentaria documento da régua de texto sem ninguém ter pedido:
//
//   aqui                      → "isto vai ao ar?"
//   TIPOS_DE_DOCUMENTO_INTERNO→ "a régua determinística de texto se aplica?"
//   TIPOS_DE_PLANEJAMENTO     → "o juiz julga como plano ou como peça?"

export interface TipoDeEntrega {
  id: string;
  /** O que o humano lê no portal. */
  label: string;
  /**
   * Vai ao ar no perfil do cliente? `false` é o padrão honesto: documento
   * publicado por engano não se corrige — se corrige apagando o post.
   */
  publicavel: boolean;
  /** Por que este tipo existe separado dos vizinhos. */
  porque: string;
}

export const TIPOS_DE_ENTREGA: readonly TipoDeEntrega[] = [
  { id: "strategy", label: "Estratégia", publicavel: false,
    porque: "Análise e posicionamento. Documento de trabalho, nunca peça." },
  { id: "brand-foundation", label: "Base de marca", publicavel: false,
    porque: "A constituição da marca: essência, voz, léxico, limites. É a RÉGUA das peças — publicá-la seria publicar o gabarito." },
  { id: "plano-de-conteudo", label: "Plano de conteúdo", publicavel: false,
    porque: "Calendário e pauta. Foi o que entrou na fila de publicação em 24/08 por estar marcado como `social`." },
  { id: "social", label: "Post de social", publicavel: true,
    porque: "Peça pronta para o feed. Vai ao ar." },
  { id: "video", label: "Vídeo / roteiro", publicavel: true,
    porque: "Peça de vídeo. Vai ao ar." },
  { id: "design", label: "Design", publicavel: false,
    porque: "Identidade e criativo. Vira arte por outro caminho (`artes.ts`), não pela fila de posts." },
  { id: "campaign", label: "Campanha", publicavel: false,
    porque: "Estrutura, segmentação e copy de anúncio. Vai para o gerenciador, não para o feed orgânico." },
  { id: "analytics", label: "Analytics", publicavel: false,
    porque: "Medição e otimização. Relatório." },
  { id: "financeiro", label: "Financeiro", publicavel: false,
    porque: "Plano de investimento. Documento interno do cliente." },
  { id: "brand-kit", label: "Kit de marca", publicavel: false,
    porque: "Manual + arquivos de logo, montado em código." },
  { id: "report", label: "Relatório", publicavel: false,
    porque: "Relatório de ciclo entregue ao cliente. Documento, não peça." },
];

const PORID = new Map(TIPOS_DE_ENTREGA.map((t) => [t.id, t]));

/** O tipo está declarado? **Tipo desconhecido não é publicável** — fail-closed:
 *  entregável novo nasce protegido, e quem quiser publicá-lo declara aqui. */
export function tipoDeclarado(id: string | null | undefined): TipoDeEntrega | null {
  return PORID.get((id ?? "").trim().toLowerCase()) ?? null;
}

/** Vai ao ar? Só quem está declarado E declarado como publicável. */
export function ehPublicavel(id: string | null | undefined): boolean {
  return tipoDeclarado(id)?.publicavel === true;
}

/** A lista de tipos que viram post. Derivada, nunca digitada. */
export const TIPOS_PUBLICAVEIS: readonly string[] =
  TIPOS_DE_ENTREGA.filter((t) => t.publicavel).map((t) => t.id);
