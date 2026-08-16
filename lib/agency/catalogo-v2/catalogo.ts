// O CATÁLOGO CANÔNICO DA V2 — derivado do manifesto, nunca editado à mão.
//
// Marco 2 da Arquitetura Operacional V2 (autorização do CEO, 15/08/2026).
//
// A regra de precedência do 00-README é lei: pasta → manifesto → código. Este
// módulo NÃO define departamento nenhum — ele LÊ o
// `architecture.manifest.json` e o expõe tipado. Quem quiser mudar o catálogo
// muda o manifesto (decisão registrada), e o teste de contrato
// (`__tests__/v2/catalogo.test.ts`) reprova qualquer divergência entre o que
// este módulo expõe e o que o manifesto diz — inclusive a conta de 81 funções
// (as 69 executoras mais os 12 gerentes da reforma de 16/08/2026),
// que é determinação literal do CEO.
//
// As CINCO definições legadas de departamento (BRAIN_DEPARTMENTS,
// organizacao/departamentos, execution/especialistas, portal/vista-do-cliente
// e o universo da escada) continuam existindo durante a migração — a ponte é
// `adaptadores.ts`, e a remoção delas é etapa tardia (M3+), nunca deste
// módulo. O Brain fica como camada de inteligência (determinação do CEO):
// preserva-se tudo; só a departamentalização dele migra para cá.

import manifesto from "@/docs/arquitetura-operacional-v2/architecture.manifest.json";

export interface FuncaoExecutora {
  /** id canônico da função (ex.: "copywriter") — único no catálogo inteiro. */
  id: string;
  /** id canônico do departamento dono (ex.: "social-media"). */
  departamentoId: string;
  /**
   * Função nasce DESLIGADA. Ligar é decisão registrada (escada/decisão do
   * dono), nunca efeito colateral de deploy — mesmo desenho fail-closed da
   * escada de exposição, que a V2 preserva integralmente.
   */
  ativaPorPadrao: false;
}

export interface DepartamentoCanonico {
  id: string;
  nome: string;
  funcoes: FuncaoExecutora[];
}

export interface MarcoDoFluxo {
  id: string;
  donoDepartamentoId: string;
  contribuintes: string[];
  saidaObrigatoria: string;
}

function construir() {
  const departamentos: DepartamentoCanonico[] = manifesto.departments.map((d) => ({
    id: d.id,
    nome: d.name,
    funcoes: d.agents.map((a) => ({
      id: a,
      departamentoId: d.id,
      ativaPorPadrao: false as const,
    })),
  }));

  const funcoes: FuncaoExecutora[] = departamentos.flatMap((d) => d.funcoes);

  const fluxo: MarcoDoFluxo[] = manifesto.workflow.map((w) => ({
    id: w.id,
    donoDepartamentoId: w.owner,
    contribuintes: ("contributors" in w ? (w as { contributors?: string[] }).contributors : undefined) ?? [],
    saidaObrigatoria: w.requiredOutput,
  }));

  return { departamentos, funcoes, fluxo };
}

const catalogo = construir();

/** Os 12 departamentos canônicos, na ordem do manifesto. */
export const DEPARTAMENTOS_V2: readonly DepartamentoCanonico[] = catalogo.departamentos;

/** As 81 funções do catálogo canônico — 69 executoras + os 12 gerentes. */
export const FUNCOES_V2: readonly FuncaoExecutora[] = catalogo.funcoes;

/** Os 9 marcos do fluxo, com dono e contribuintes canônicos. */
export const FLUXO_V2: readonly MarcoDoFluxo[] = catalogo.fluxo;

/** Os 20 estados canônicos, na ordem do manifesto. */
export const ESTADOS_V2: readonly string[] = manifesto.canonicalStates;

/** Os 9 motivos de bloqueio tipados. */
export const BLOQUEIOS_V2: readonly string[] = manifesto.blockingReasons;

/** As 4 decisões possíveis do cliente sobre uma entrega. */
export const DECISOES_DO_CLIENTE_V2: readonly string[] = manifesto.clientDecisions;

const POR_ID_DEPARTAMENTO = new Map(DEPARTAMENTOS_V2.map((d) => [d.id, d]));
const POR_ID_FUNCAO = new Map(FUNCOES_V2.map((f) => [f.id, f]));

/** `undefined` quando não existe — e não existir NUNCA é "pode passar". */
export function departamentoV2(id: string): DepartamentoCanonico | undefined {
  return POR_ID_DEPARTAMENTO.get(id);
}

export function funcaoV2(id: string): FuncaoExecutora | undefined {
  return POR_ID_FUNCAO.get(id);
}

/** De que departamento é esta função; `undefined` = função desconhecida. */
export function departamentoDaFuncao(funcaoId: string): string | undefined {
  return POR_ID_FUNCAO.get(funcaoId)?.departamentoId;
}
