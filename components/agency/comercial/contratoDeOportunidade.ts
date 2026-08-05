// ─── Contrato de leitura do Radar de Oportunidades ───────────────────────────
//
// POR QUE este arquivo existe:
//
// 1. A tela e o backend (`lib/agency/comercial/oportunidade.ts` +
//    `/api/agency/oportunidades`) estão sendo escritos em paralelo. Se a tela
//    lesse `json.oportunidades[0].nota` direto, qualquer divergência de nome de
//    campo derrubaria a página inteira em produção — e o operador veria "erro"
//    onde na verdade havia trabalho pronto. Aqui a leitura é TOLERANTE na
//    entrada (aceita os apelidos mais prováveis) e ESTRITA na saída (um tipo só,
//    que o resto da tela consome).
//
// 2. Ausência de informação não é informação (regra da casa). Campo que não veio
//    vira `null` — nunca "R$ 0", nunca "sem nota". Quem decide o que mostrar no
//    lugar é a tela, com texto honesto.
// ─────────────────────────────────────────────────────────────────────────────

export type StatusDaOportunidade = "nova" | "aprovada" | "recusada" | "enviada";

export interface Oportunidade {
  id: string;
  /** Chave da plataforma, já normalizada para as chaves de PLATAFORMAS. */
  plataforma: string;
  titulo: string;
  /** 0 a 100. `null` quando a análise ainda não produziu nota. */
  nota: number | null;
  servicoSugerido: string | null;
  /** Já formatado para leitura (ex.: "R$ 2.400"). `null` = não estimado. */
  valorSugerido: string | null;
  /**
   * O orçamento que o ANUNCIANTE declarou — não é a nossa sugestão de preço, e
   * por isso não compartilha campo com ela. Trocar um pelo outro na tela é a
   * receita de proposta enviada com o preço do cliente.
   */
  orcamentoInformado: string | null;
  /** Prazo declarado no anúncio, em texto. `null` = o anúncio não disse. */
  prazoInformado: string | null;
  categoria: string | null;
  /** O porquê da nota, em uma linha. */
  raciocinio: string | null;
  /** O texto do projeto como chegou da plataforma. */
  textoOriginal: string;
  /** A proposta pronta para colar dentro da plataforma. `null` = ainda não gerada. */
  proposta: string | null;
  url: string | null;
  status: StatusDaOportunidade;
  criadaEm: string | null;
}

export const PLATAFORMAS: { id: string; label: string }[] = [
  { id: "99freelas", label: "99Freelas" },
  { id: "workana", label: "Workana" },
  { id: "upwork", label: "Upwork" },
  { id: "guru", label: "Guru" },
  { id: "peopleperhour", label: "PeoplePerHour" },
  { id: "freelancer", label: "Freelancer.com" },
  // A chave é "desconhecida" porque o catálogo do backend
  // (`lib/agency/comercial/oportunidade.ts`) é FECHADO — mandar "outra" daqui
  // vira uma origem que nenhum agrupamento reconhece. O rótulo é que fala com
  // o operador; a chave fala com o banco.
  { id: "desconhecida", label: "Outra" },
];

const ROTULO_POR_ID = new Map(PLATAFORMAS.map((p) => [p.id, p.label]));

/** Rótulo humano da plataforma. Chave desconhecida vira o próprio texto, nunca "undefined". */
export function rotuloDaPlataforma(chave: string): string {
  return ROTULO_POR_ID.get(chave) ?? (chave.trim() || "Outra");
}

/**
 * Texto colado que é SÓ um link. O backend usa `url` para deduzir a plataforma
 * e para o time abrir o anúncio depois — mandar o campo separado é o que faz
 * "colar o link" funcionar tão bem quanto "colar o texto".
 */
export function urlSolta(texto: string): string | null {
  const t = texto.trim();
  if (/\s/.test(t)) return null;
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
}

/** Normaliza a chave da plataforma vinda da API ("99Freelas", "FREELANCER.COM"…). */
function normalizarPlataforma(bruto: unknown): string {
  const texto = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  if (!texto) return "outra";
  const semRuido = texto.replace(/[\s._-]/g, "").replace(/\.com(\.br)?$/, "");
  const achou = PLATAFORMAS.find((p) => p.id.replace(/[\s._-]/g, "") === semRuido);
  return achou?.id ?? texto;
}

const STATUS_VALIDOS: Record<string, StatusDaOportunidade> = {
  nova: "nova",
  new: "nova",
  pendente: "nova",
  pending: "nova",
  aprovada: "aprovada",
  aprovado: "aprovada",
  approved: "aprovada",
  recusada: "recusada",
  recusado: "recusada",
  rejected: "recusada",
  enviada: "enviada",
  enviado: "enviada",
  sent: "enviada",
};

function normalizarStatus(bruto: unknown): StatusDaOportunidade {
  const texto = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  return STATUS_VALIDOS[texto] ?? "nova";
}

/** Primeiro campo presente entre os apelidos possíveis. */
function campo(fonte: Record<string, unknown>, ...chaves: string[]): unknown {
  for (const c of chaves) {
    const v = fonte[c];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function texto(bruto: unknown): string | null {
  if (typeof bruto === "string" && bruto.trim()) return bruto.trim();
  if (typeof bruto === "number" && Number.isFinite(bruto)) return String(bruto);
  return null;
}

/** Valor pode chegar como número (centavos ou reais) ou como texto já formatado. */
function valorLegivel(bruto: unknown): string | null {
  if (typeof bruto === "number" && Number.isFinite(bruto)) {
    return bruto.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }
  return texto(bruto);
}

function notaLegivel(bruto: unknown): number | null {
  const n = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(n)) return null;
  // Nota fora da escala é dado errado — mostrar 137/100 é pior que não mostrar.
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizarOportunidade(bruta: unknown): Oportunidade | null {
  if (!bruta || typeof bruta !== "object") return null;
  const o = bruta as Record<string, unknown>;
  const id = texto(campo(o, "id", "_id", "uuid"));
  if (!id) return null; // sem id não há como decidir sobre ela

  return {
    id,
    plataforma: normalizarPlataforma(campo(o, "plataforma", "platform", "origem", "source")),
    titulo: texto(campo(o, "titulo", "title", "nome", "name")) ?? "Oportunidade sem título",
    nota: notaLegivel(campo(o, "nota", "score", "pontuacao", "notaFit")),
    servicoSugerido: texto(campo(o, "servicoSugerido", "servico", "suggestedService", "service")),
    valorSugerido: valorLegivel(campo(o, "valorSugerido", "valor", "suggestedValue", "preco", "price")),
    orcamentoInformado: valorLegivel(campo(o, "orcamentoInformado", "orcamento", "budget")),
    prazoInformado: texto(campo(o, "prazoInformado", "prazo", "deadline")),
    categoria: texto(campo(o, "categoria", "category")),
    raciocinio: texto(campo(o, "raciocinio", "reasoning", "justificativa", "porque", "rationale")),
    textoOriginal: texto(campo(o, "textoOriginal", "texto", "originalText", "descricao", "description", "conteudo")) ?? "",
    proposta: texto(campo(o, "propostaTexto", "proposta", "propostaPronta", "proposal", "mensagem")),
    url: texto(campo(o, "url", "urlExterna", "link", "sourceUrl")),
    status: normalizarStatus(campo(o, "status", "situacao", "state")),
    criadaEm: texto(campo(o, "criadaEm", "createdAt", "created_at", "data")),
  };
}

/** Aceita `[...]`, `{oportunidades}`, `{items}`, `{data}` — o que o backend decidir. */
export function normalizarLista(json: unknown): Oportunidade[] {
  const cru = Array.isArray(json)
    ? json
    : json && typeof json === "object"
      ? ((json as Record<string, unknown>).oportunidades ??
         (json as Record<string, unknown>).items ??
         (json as Record<string, unknown>).data ??
         (json as Record<string, unknown>).list)
      : null;
  if (!Array.isArray(cru)) return [];
  return cru
    .map(normalizarOportunidade)
    .filter((o): o is Oportunidade => o !== null)
    // A tela é uma fila de decisão: quem vale mais fica em cima. Sem nota vai
    // para o fim — nunca some da lista.
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
}

// ─── Faixa da nota ───────────────────────────────────────────────────────────
// DESIGN.md §2.4: cor NUNCA é o único sinal de estado. Por isso a faixa carrega
// rótulo em texto ("Forte"/"Média"/"Fraca") junto da cor — daltônico lê igual.

export interface FaixaDaNota {
  rotulo: string;
  /** Classes de superfície + texto, sempre em token. */
  classe: string;
  /** Cor do ponto que acompanha o rótulo. */
  ponto: string;
}

export function faixaDaNota(nota: number | null): FaixaDaNota {
  if (nota === null) {
    return {
      rotulo: "Sem nota",
      classe: "bg-[var(--accent)] text-[var(--text-muted)] border-[var(--border)]",
      ponto: "bg-[var(--text-subtle)]",
    };
  }
  if (nota >= 70) {
    return {
      rotulo: "Forte",
      classe: "bg-[var(--success-bg)] text-[var(--success)] border-[#BBF7D0]",
      ponto: "bg-[var(--success)]",
    };
  }
  if (nota >= 40) {
    return {
      rotulo: "Média",
      classe: "bg-[var(--warning-bg)] text-[var(--warning)] border-[#FDE68A]",
      ponto: "bg-[var(--warning)]",
    };
  }
  return {
    rotulo: "Fraca",
    classe: "bg-[var(--accent)] text-[var(--text-secondary)] border-[var(--border)]",
    ponto: "bg-[var(--text-subtle)]",
  };
}

// ─── Abas de triagem ─────────────────────────────────────────────────────────

export const ABAS: { id: StatusDaOportunidade | "todas"; label: string }[] = [
  { id: "nova", label: "Para decidir" },
  { id: "aprovada", label: "Aprovadas" },
  { id: "enviada", label: "Enviadas" },
  { id: "recusada", label: "Recusadas" },
  { id: "todas", label: "Todas" },
];
