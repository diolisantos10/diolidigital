// A MÁQUINA DE ESTADOS CANÔNICA — uma verdade, vinte estados, seis condições.
//
// Marco 2 da V2. O diagrama do 05-ESTADOS-E-RECUPERACAO, transcrito como
// dado. Estado É DERIVADO DE FATOS (princípio 8 da arquitetura mestra):
// nenhum usuário digita status; a transição só acontece pelas seis condições,
// e toda transição deixa rastro (princípio 9). Portal e painel interno leem
// ESTA máquina — muda o rótulo, nunca a verdade.
//
// A persistência entra por interface (`ArmazemDeTransicoes`) de propósito:
// a legalidade e as seis condições são testáveis sem banco, e o Prisma é só
// um dos armazéns possíveis (o de memória serve os testes).

export const TRANSICOES_LEGAIS: ReadonlyArray<readonly [string, string]> = [
  ["intake", "qualified"],
  ["intake", "closed"],
  ["qualified", "briefing_incomplete"],
  ["briefing_incomplete", "briefing_ready"],
  ["briefing_ready", "proposal"],
  ["proposal", "negotiation"],
  ["negotiation", "proposal"],
  ["proposal", "accepted"],
  ["accepted", "direction_pending"],
  ["direction_pending", "direction_approved"],
  ["direction_pending", "direction_revision"],
  ["direction_revision", "direction_pending"],
  ["direction_approved", "production"],
  ["production", "blocked_materials"],
  ["blocked_materials", "production"],
  ["production", "internal_review"],
  ["internal_review", "production"],
  ["internal_review", "client_approval"],
  ["client_approval", "revision"],
  ["revision", "internal_review"],
  ["client_approval", "implementation"],
  ["client_approval", "cancelled"],
  ["implementation", "measurement"],
  ["measurement", "cycle_closed"],
  ["cycle_closed", "direction_pending"],
];

const LEGAIS = new Set(TRANSICOES_LEGAIS.map(([de, para]) => `${de}→${para}`));

export function transicaoLegal(de: string, para: string): boolean {
  return LEGAIS.has(`${de}→${para}`);
}

/** Estados sem saída — encerram a linha (o ciclo fechado NÃO é terminal: reabre direção). */
export const ESTADOS_TERMINAIS = ["closed", "cancelled"] as const;

// ── O pedido de transição ───────────────────────────────────────────────────

export interface PedidoDeTransicao {
  entidadeTipo: string;
  entidadeId: string;
  de: string;
  para: string;
  /** Quem pede: humano ou IA, com identidade — vai para o rastro. */
  ator: { tipo: "humano" | "ia"; id: string };
  motivo: string;
  origem: string;
  /** A versão que o ator LEU antes de pedir (condição 3: otimista). */
  versaoLida: number;
  /** Condição 4: a mesma chave nunca transiciona duas vezes. */
  chaveIdempotencia: string;
  correlationId: string;
  /** Condição 6: efeito externo NUNCA roda inline — entra na fila. */
  efeitosExternos?: Array<{ tipo: string; payload: unknown; chaveIdempotencia: string }>;
}

export interface ArmazemDeTransicoes {
  jaTransicionou(chaveIdempotencia: string): Promise<boolean>;
  versaoAtual(entidadeTipo: string, entidadeId: string): Promise<number>;
  registrar(pedido: PedidoDeTransicao): Promise<void>;
  enfileirar(efeito: { tipo: string; payload: unknown; chaveIdempotencia: string; correlationId: string }): Promise<void>;
}

export type ResultadoDaTransicao =
  | { ok: true; idempotente: false }
  | { ok: true; idempotente: true } // chave repetida: não fez de novo, e isso é sucesso
  | { ok: false; condicao: 1 | 2 | 3 | 4; motivo: string };

/**
 * As seis condições do 05, na ordem. A condição 1 (permissão) chega DECIDIDA
 * por `podeExecutarFuncao`/guarda — o veredito entra como argumento para a
 * máquina não depender de sessão; quem monta o pedido é o servidor.
 */
export async function transicionar(
  pedido: PedidoDeTransicao,
  permissao: { permitido: boolean; motivo: string },
  entradaObrigatoriaPresente: boolean,
  armazem: ArmazemDeTransicoes,
): Promise<ResultadoDaTransicao> {
  // Condição 4 primeiro por segurança de reexecução: pedido repetido é
  // SUCESSO idempotente, nunca efeito dobrado — mesmo que as outras condições
  // tivessem mudado desde a primeira execução.
  if (await armazem.jaTransicionou(pedido.chaveIdempotencia)) {
    return { ok: true, idempotente: true };
  }
  if (!permissao.permitido) {
    return { ok: false, condicao: 1, motivo: permissao.motivo };
  }
  if (!transicaoLegal(pedido.de, pedido.para)) {
    return { ok: false, condicao: 2, motivo: `transição ${pedido.de}→${pedido.para} não existe no diagrama canônico` };
  }
  if (!entradaObrigatoriaPresente) {
    return { ok: false, condicao: 2, motivo: "entrada obrigatória do marco ausente" };
  }
  const versao = await armazem.versaoAtual(pedido.entidadeTipo, pedido.entidadeId);
  if (versao !== pedido.versaoLida) {
    return { ok: false, condicao: 3, motivo: `versão mudou desde a leitura (lida ${pedido.versaoLida}, atual ${versao})` };
  }
  // Condições 5 e 6: persistir o evento e enfileirar efeitos — nesta ordem, e
  // efeito jamais inline.
  await armazem.registrar(pedido);
  for (const efeito of pedido.efeitosExternos ?? []) {
    await armazem.enfileirar({ ...efeito, correlationId: pedido.correlationId });
  }
  return { ok: true, idempotente: false };
}
