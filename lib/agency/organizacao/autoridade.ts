// ─── OS DOIS EIXOS DO ACESSO ─────────────────────────────────────────────────
//
//   quem manda (AUTORIDADE)  ×  onde trabalha (DEPARTAMENTO)
//
// Nenhum dos dois eixos pergunta se o executor é pessoa ou é um agente de IA.
// Essa pergunta não muda permissão nenhuma e por isso não existe neste arquivo
// — é decisão do CEO de 14/08/2026, e o teste
// `__tests__/agency/organizacao/matriz-de-acesso.test.ts` reprova quem tentar
// reintroduzi-la.
//
// ── Por que dois eixos, e não uma lista de papéis ───────────────────────────
//
// A lista antiga (`ROLE_NAV_ALLOWLIST`) escrevia à mão, papel por papel, quais
// URLs cada um via. Departamento novo = seis listas para lembrar de editar, e
// esquecer uma significava acesso a mais ou a menos, silenciosamente. Aqui o
// papel declara só duas coisas — sua autoridade e seus departamentos — e todo
// o resto é DERIVADO. Departamento novo não pede edição em lugar nenhum.
//
// ── A regra que decide tudo ─────────────────────────────────────────────────
//
//   LER é largo de propósito. ESCREVER é estreito de propósito.
//
// Todo mundo de dentro da casa enxerga o panorama de todos os clientes e o que
// os outros departamentos estão fazendo — foi ordem explícita do CEO, porque o
// contrário produz agência de silos, onde o Design não sabe o que o Tráfego
// prometeu. Mas alterar, aprovar, publicar, excluir e configurar ficam presos
// ao dono do objeto.
// ─────────────────────────────────────────────────────────────────────────────

import { DEPARTAMENTO_IDS, type DepartamentoId } from "./departamentos";

/**
 * O eixo vertical. Cinco degraus, e a ordem importa: `NIVEL` abaixo é usada
 * para comparações do tipo "pelo menos gestão".
 */
export type Autoridade =
  /** CEO / dono da casa. Tudo, em todo lugar, hoje e nas telas que ainda não existem. */
  | "master"
  /** Direção. Mesma amplitude de leitura e ação que o master nas telas internas. */
  | "director"
  /** Coordena a casa inteira. Vê tudo, opera o fluxo — não assina a autoria técnica. */
  | "project_manager"
  /** Trabalha num ou mais departamentos. Lê a casa toda, escreve na própria área. */
  | "department_member"
  /** Cliente. Vive no portal. `/agency/**` é território proibido, sem exceção. */
  | "client";

/** Grau numérico. Só para "é gestão?" — nunca para inferir permissão sozinho. */
const NIVEL: Record<Autoridade, number> = {
  master: 100,
  director: 90,
  project_manager: 60,
  department_member: 30,
  client: 0,
};

/** Master e Diretor. É a dupla que enxerga toda rota atual e futura. */
export function eDirecao(a: Autoridade): boolean {
  return NIVEL[a] >= NIVEL.director;
}

/** Master, Diretor e PM — quem tem leitura transversal da operação inteira. */
export function eGestao(a: Autoridade): boolean {
  return NIVEL[a] >= NIVEL.project_manager;
}

/** Quem é da casa. `client` é o único de fora — e a única resposta `false`. */
export function eInterno(a: Autoridade): boolean {
  return a !== "client";
}

// ─── O que se pode fazer com um objeto ───────────────────────────────────────

/**
 * As oito capacidades do contrato. Estão separadas porque se comportam de
 * forma diferente: `aprovar` a entrega de outro departamento é coordenação
 * legítima do PM; `publicar` a peça de outro departamento é assinar em nome
 * de quem produziu — e isso ninguém faz.
 */
export type Capacidade =
  | "ler"
  | "criar"
  | "editar"
  | "aprovar"
  | "publicar"
  | "excluir"
  | "administrar"
  | "configurar";

export const CAPACIDADES: Capacidade[] = [
  "ler", "criar", "editar", "aprovar", "publicar", "excluir", "administrar", "configurar",
];

/** O perfil de quem está logado, nos dois eixos. É o que os guardas recebem. */
export interface PerfilOrganizacional {
  autoridade: Autoridade;
  /**
   * Departamentos em que este perfil ESCREVE.
   *
   * Vazio para `master`/`director` (que escrevem em todos, por autoridade) e
   * para `client` (que não escreve em nenhum). Um perfil pode ter mais de um:
   * Design responde também pelo Branding desde que o Brand Hub nasceu.
   */
  departamentos: DepartamentoId[];
}

/**
 * O conjunto exato do que este perfil pode fazer NESTE departamento.
 *
 * Devolve `Set` e não booleano solto porque a interface precisa da resposta
 * inteira de uma vez: o cartão do departamento decide entre "editar", "somente
 * consulta" e "sem acesso" numa passada só.
 */
export function capacidadesEm(perfil: PerfilOrganizacional, dept: DepartamentoId): Set<Capacidade> {
  const { autoridade } = perfil;

  // Cliente não tem capacidade nenhuma no território interno. Fim.
  if (autoridade === "client") return new Set();

  // Master e Diretor: tudo, em todo departamento. Inclusive nos que ainda não
  // existem — por isso a resposta é a lista inteira e não uma enumeração.
  if (eDirecao(autoridade)) return new Set(CAPACIDADES);

  const proprio = perfil.departamentos.includes(dept);

  if (autoridade === "project_manager") {
    // O PM coordena a casa: cria, edita e aprova em qualquer departamento —
    // é o que "distribuir demanda e cobrar entrega" exige na prática.
    // O que ele NÃO faz é assinar a autoria técnica: `publicar` e `excluir`
    // fora da própria área ficam com o dono, e `configurar`/`administrar`
    // nunca são dele (isso é da direção).
    const base: Capacidade[] = ["ler", "criar", "editar", "aprovar"];
    return new Set(proprio ? [...base, "publicar", "excluir"] : base);
  }

  // Membro de departamento.
  // ── LER é global: ele enxerga o que todo mundo está fazendo. ──
  if (!proprio) return new Set<Capacidade>(["ler"]);
  return new Set<Capacidade>(["ler", "criar", "editar", "aprovar", "publicar", "excluir"]);
}

export function pode(perfil: PerfilOrganizacional, cap: Capacidade, dept: DepartamentoId): boolean {
  return capacidadesEm(perfil, dept).has(cap);
}

/** Atalho legível para a decisão mais frequente da interface. */
export function podeEditar(perfil: PerfilOrganizacional, dept: DepartamentoId): boolean {
  return pode(perfil, "editar", dept);
}

/**
 * A área está em MODO DE CONSULTA para este perfil?
 *
 * "Somente consulta" ≠ "sem acesso". A tela precisa distinguir os dois, senão
 * o membro de Design abre o painel de Tráfego, não vê botão nenhum e conclui
 * que a tela está quebrada. Ver `paginas.ts` para a terceira resposta.
 */
export function emModoDeConsulta(perfil: PerfilOrganizacional, dept: DepartamentoId): boolean {
  const caps = capacidadesEm(perfil, dept);
  return caps.has("ler") && !caps.has("editar");
}

/**
 * Capacidades administrativas globais — chave de IA, backup, reset, integração,
 * configuração do sistema. Só direção. `project_manager` inclusive fica de fora:
 * coordenar a operação não é o mesmo que ter a chave do cofre.
 */
export function podeAdministrar(perfil: PerfilOrganizacional): boolean {
  return eDirecao(perfil.autoridade);
}

/** Os departamentos que este perfil escreve — expandido para a direção. */
export function departamentosQueEscreve(perfil: PerfilOrganizacional): DepartamentoId[] {
  if (perfil.autoridade === "client") return [];
  if (eDirecao(perfil.autoridade)) return [...DEPARTAMENTO_IDS];
  return perfil.departamentos.filter((d) => DEPARTAMENTO_IDS.includes(d));
}

/**
 * TODO perfil interno lê TODOS os clientes. Está escrito como função, e não
 * como `true` solto no componente, para que o dia em que isso deixar de ser
 * verdade tenha um lugar único para mudar — e um teste para reprovar a mudança
 * feita por engano.
 */
export function podeVerTodosOsClientes(perfil: PerfilOrganizacional): boolean {
  return eInterno(perfil.autoridade);
}
