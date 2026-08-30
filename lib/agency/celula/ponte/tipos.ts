// tipos.ts — os tipos compartilhados da PONTE DE ARQUIVOS (Dioli ⇄ cliente).
// PURO: nenhum import de Prisma, nenhum import de rede, nenhum `fs` real.
// Só `armazem.ts` toca o banco — todo o resto desta pasta importa DESTE
// arquivo, nunca do banco.

// ── Direção ──────────────────────────────────────────────────────────────

export const DIRECOES = ["dioli_para_cliente", "cliente_para_dioli"] as const;
export type Direcao = (typeof DIRECOES)[number];
const CONJUNTO_DE_DIRECOES: ReadonlySet<string> = new Set(DIRECOES);

/** Fail-closed: valor que não é EXATAMENTE uma das duas direções vira `null`
 *  — mesma postura de `estadoDeclarado` em `lib/agency/celula/funil.ts`. */
export function direcaoDeclarada(valor: unknown): Direcao | null {
  return typeof valor === "string" && CONJUNTO_DE_DIRECOES.has(valor) ? (valor as Direcao) : null;
}

// ── Estado do arquivo ────────────────────────────────────────────────────

export const ESTADOS_DO_ARQUIVO = [
  "recebido",
  "em_quarentena",
  "liberado",
  "recusado",
  "aprovado_para_envio",
  "enviado",
] as const;
export type EstadoDoArquivo = (typeof ESTADOS_DO_ARQUIVO)[number];
const CONJUNTO_DE_ESTADOS_DO_ARQUIVO: ReadonlySet<string> = new Set(ESTADOS_DO_ARQUIVO);

/** Fail-closed: valor corrompido ou fora do conjunto NUNCA vira "liberado"
 *  nem "aprovado_para_envio" por acidente — ausência de informação não é
 *  informação, então cai em `null` e quem chama decide o valor seguro
 *  (normalmente "recebido", o estado inicial, nunca um estado que autoriza
 *  algo). */
export function estadoDoArquivoDeclarado(valor: unknown): EstadoDoArquivo | null {
  return typeof valor === "string" && CONJUNTO_DE_ESTADOS_DO_ARQUIVO.has(valor) ? (valor as EstadoDoArquivo) : null;
}

// ── Casos de exceção (a fila é do despacho C — ver nota abaixo) ─────────

/**
 * Os 5 casos que uma trava DESTA pasta pode abrir. Fixos e exatos — o
 * despacho C consome esses nomes literalmente. Não adicione um 6º sem
 * combinar com quem consome.
 */
export const CASOS_DE_EXCECAO = [
  "destinatario_divergente",
  "arquivo_suspeito",
  "arquivo_recusado",
  "falha_de_download",
  "falha_de_upload",
] as const;
export type CasoDeExcecao = (typeof CASOS_DE_EXCECAO)[number];

/**
 * O que uma trava desta pasta devolve quando precisa de intervenção humana.
 * PURO DADO — nunca uma chamada de escrita. A fila de exceções é do
 * despacho C (`lib/agency/celula/excecoes/*`); esta pasta NUNCA importa nem
 * escreve lá (ver "Fronteira com o despacho C" no despacho B). Quem consome
 * este objeto e efetivamente abre a exceção é a camada de cima, numa onda
 * seguinte — lacuna declarada, não pendura falsa.
 */
export interface PedidoDeExcecao {
  caso: CasoDeExcecao;
  contexto: Record<string, unknown>;
  acaoRecomendada: string;
}

// ── O recorte de ArquivoDaCelula que as funções puras enxergam ──────────

/**
 * Nunca o registro do Prisma inteiro — as funções puras desta pasta não
 * sabem o que é Prisma. `armazem.ts` é quem lê o banco e monta este objeto.
 *
 * `caminhoInterno` está aqui porque `saida.ts` (T2) precisa comparar o texto
 * de uma mensagem de acompanhamento contra ele — mas nenhuma função desta
 * pasta IMPRIME, LOGA ou DEVOLVE este campo para fora. Ele entra só para ser
 * comparado, nunca para sair.
 */
export interface ArquivoParaConferencia {
  id: string;
  workspaceId: string;
  oportunidadeId: string;
  clienteId: string | null;
  projetoId: string | null;
  direcao: Direcao;
  linhagemId: string;
  versao: number;
  destinatarioDeclarado: string;
  estado: EstadoDoArquivo;
  caminhoInterno: string;
}

/** O destino que o OPERADOR pretende alcançar com o envio — nunca lido do
 *  conteúdo do arquivo, nunca inferido. Vem de quem está operando a tela. */
export interface DestinoPretendido {
  oportunidadeId: string;
  clienteId?: string | null;
  projetoId?: string | null;
  destinatarioDeclarado: string;
}
