// Tipos do backfill de carrossel. O módulo é `.mjs` de propósito: o script de
// produção roda com `node` puro, sem build — mas quem o chama (e a suíte) fala
// TypeScript, então o contrato mora aqui.

export interface LinhaPost {
  id: string;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaUrlsJson?: string | null;
  /** Nulo = sem data no calendário: ABORTA o plano (o índice C<n> mentiria). */
  scheduledFor?: string | number | Date | null;
}

export interface LinhaAsset {
  id: string;
  fileName: string;
  mimeType?: string | null;
  createdAt?: string | number | Date | null;
}

/** Por que esta mídia já tem dono — e quem é o dono, em linguagem de log. */
export interface UsoDeMidia {
  motivo: "post" | "entregável" | "versão de entregável";
  dono: string | null;
}
export type IndiceDeUso = Map<string, UsoDeMidia>;

export interface FontesDeUso {
  posts?: Array<{ id?: string | null; mediaUrl?: string | null; mediaUrlsJson?: string | null }>;
  deliverables?: Array<{ id?: string | null; name?: string | null; content?: string | null }>;
  versoes?: Array<{ deliverableId?: string | null; content?: string | null; mediaAssetIds?: string | null }>;
}

export interface Tela {
  pos: number;
  assetId: string;
  fileName: string;
  via: "esteira" | "nome-CnTm" | "ordem";
}

export interface PostPlanejado {
  id: string;
  /** Índice 1-based na ordem do calendário — o "C<n>" do padrão de nome. */
  idx: number;
  caption: string;
  mediaUrl: string | null;
  telasAtuais: string[];
  telas: Tela[];
}

export interface Passe {
  rodou: boolean;
  motivo: "por-ordem" | "flag-ausente" | "sem-imagem-livre" | "nao-divide" | "nada-pendente" | "abortado";
  porPost: number;
}

export interface Excluido { assetId: string; fileName: string; motivo: string }
export interface NaoCasado { assetId: string; fileName: string; createdAt: unknown }

export interface Plano {
  erro: null | {
    codigo: "sem-posts" | "sem-data";
    detalhe: string;
    semData?: Array<{ id: string; caption: string }>;
  };
  posts: PostPlanejado[];
  /** Fora do casamento POR DECISÃO, com o motivo para o log do dry-run. */
  excluidos: Excluido[];
  naoCasados: NaoCasado[];
  passe: Passe;
}

export declare const PADRAO_NOME_RESERVADO: RegExp;
export declare const PADRAO_ESTEIRA: RegExp;
export declare const PADRAO_CNTM: RegExp;

export declare function lerLista(bruto: string | null | undefined): string[];
export declare function idsDeMidiaEmTexto(texto: string | null | undefined): string[];
export declare function montarEmUso(fontes?: FontesDeUso): IndiceDeUso;
/** Milissegundos da data do post, ou `null` quando não há data legível.
 *  `Date` (Prisma), string ISO (libsql) e epoch numérico caem todos aqui — foi
 *  a divergência entre esses formatos que embaralhou o índice C<n>. */
export declare function instanteDoPost(v: string | number | Date | null | undefined): number | null;
export declare function ordenarPosts<T extends LinhaPost>(rows: T[]): { ordenados: T[]; semData: T[] };
export declare function decidirPassePosicional(entrada: {
  postsSemTela: number;
  sobras: number;
  porOrdem: boolean;
}): Passe;
export declare function planejarBackfill(entrada?: {
  postsRows?: LinhaPost[];
  assetsRows?: LinhaAsset[];
  emUso?: IndiceDeUso;
  porOrdem?: boolean;
}): Plano;
export declare function postsParaGravar(
  posts: PostPlanejado[],
  opcoes?: { force?: boolean },
): Array<{ id: string; urls: string[] }>;
