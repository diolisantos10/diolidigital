// ─── PLATFORM POLICY ENGINE ──────────────────────────────────────────────────
//
// §46/§47/§48 da especificação 01 do CEO. A política de uma plataforma é DADO
// VERSIONADO, não texto de prompt e não `if` espalhado pelo código.
//
// ── POR QUE A FONTE É O JSON DA BIBLIOTECA, E NÃO UMA CONSTANTE AQUI ────────
// O arquivo lido é `docs/plataformas/99freelas/policy.json` — o MESMO que o
// especialista-trava mantém e que cita fonte linha a linha. Uma segunda cópia
// dentro de `lib/` seria a repetição exata do defeito de 07/08: o portal tinha
// um mapa de departamentos de 3 linhas ao lado da forma canônica, e as duas já
// divergiam em 11 de 14 casos. Uma fonte só, ou nenhuma.
//
// ── FAIL CLOSED, EM CAMADAS ─────────────────────────────────────────────────
// Política ausente, inativa, de outra plataforma ou com campo faltando NÃO
// significa "pode". Significa BLOCK. Ausência de informação não é informação:
// se o arquivo não disser que pode, não pode.

import bruta99freelas from "@/docs/plataformas/99freelas/policy.json";
import brutaUpwork from "@/docs/plataformas/upwork/policy.json";
import brutaFreelancer from "@/docs/plataformas/freelancer/policy.json";
import brutaWorkana from "@/docs/plataformas/workana/policy.json";
import brutaFiverr from "@/docs/plataformas/fiverr/policy.json";

// ── O que uma política declara ───────────────────────────────────────────────

/** O que a plataforma permite para cada operação. Conjunto FECHADO. */
export type Capacidade =
  | "AUTHORIZED_API"
  /** Navegador nosso, área pública, ritmo humano. */
  | "AUTHORIZED_BROWSER"
  /** Só com humano no comando — vira HUMAN_GATE. */
  | "MANUAL"
  /** Proibido, e o código não tem caminho. */
  | "BLOCKED";

const CAPACIDADES: readonly string[] = ["AUTHORIZED_API", "AUTHORIZED_BROWSER", "MANUAL", "BLOCKED"];

/**
 * Lê uma capacidade vinda do JSON. Qualquer coisa que não seja EXATAMENTE uma
 * das quatro — nula, com espaço, em minúscula, escrita errada numa pressa —
 * vira `BLOCKED`.
 *
 * É a mesma trava de `degrauDeclarado`: um `as Capacidade` aqui faria
 * `"AUTHORIZED_BROWSERR"` (typo) valer como autorizado, porque toda comparação
 * escrita com pressa testa contra `"MANUAL"` e não contra a lista inteira.
 */
export function capacidadeDeclarada(valor: unknown): Capacidade {
  return typeof valor === "string" && CAPACIDADES.includes(valor) ? (valor as Capacidade) : "BLOCKED";
}

export type PlanoDaConta = "gratuito" | "pro" | "premium";
const PLANOS: readonly string[] = ["gratuito", "pro", "premium"];

export function planoDeclarado(valor: unknown): PlanoDaConta | null {
  return typeof valor === "string" && PLANOS.includes(valor) ? (valor as PlanoDaConta) : null;
}

export type StatusDaAutorizacao = "nao_perguntado" | "perguntado" | "autorizado" | "negado" | "sem_resposta";

export interface AutorizacaoDoSuporte {
  status: StatusDaAutorizacao;
  perguntado_em: string | null;
  respondido_em: string | null;
  evidencia: string | null;
}

export interface Politica {
  plataforma: string;
  versao: string;
  ativa: boolean;
  verificadaEm: string;
  capacidades: Record<string, Capacidade>;
  autoSubmissaoPermitida: boolean;
  autoMensagemPermitida: boolean;
  humanGateObrigatorio: boolean;
  linkExternoPermitidoAntesDoContrato: boolean;
  contatoExternoPermitidoAntesDoContrato: boolean;

  // ── 🎓 OS DOIS CAMPOS QUE NÃO PODEM VIRAR UM SÓ ──────────────────────────
  // A pesquisa do CEO (07/08/2026) achou o caso-escola na Freelancer.com: ela
  // TEM API oficial, grande, com sandbox e SDK — e os Termos Gerais exigem
  // autorização escrita para acesso automatizado, DIZENDO EXPLICITAMENTE que
  // isso inclui o acesso à própria API.
  //
  // **Ter API não é ter permissão.** Um motor que colapsasse os dois num
  // `podeUsarApi` autorizaria exatamente o que os termos proíbem, e o erro
  // pareceria correto para quem lesse o código.
  /** A plataforma publica uma API para este fluxo? */
  apiDisponivel: boolean;
  /** Usá-la ainda depende de autorização concedida caso a caso? */
  apiExigeAutorizacao: boolean;

  /** Ordem de ataque decidida pelo CEO. `null` quando não declarada. */
  prioridadeNoRoadmap: number | null;
  /** Bruto, para quem precisa de um campo que este recorte ainda não expõe. */
  cru: Record<string, unknown>;
}

/** A política que o gate usa quando NÃO consegue ler nada. Tudo fechado. */
export const POLITICA_DESCONHECIDA: Politica = {
  plataforma: "(desconhecida)",
  versao: "(nenhuma)",
  ativa: false,
  verificadaEm: "(nunca)",
  capacidades: {},
  autoSubmissaoPermitida: false,
  autoMensagemPermitida: false,
  humanGateObrigatorio: true,
  linkExternoPermitidoAntesDoContrato: false,
  contatoExternoPermitidoAntesDoContrato: false,
  apiDisponivel: false,
  // ⚠️ `true` no desconhecido: "não sei se precisa de autorização" tem de
  // significar "precisa". O default `false` aqui seria a porta aberta.
  apiExigeAutorizacao: true,
  prioridadeNoRoadmap: null,
  cru: {},
};

function booleanoFechado(valor: unknown): boolean {
  // Só `true` literal é verdadeiro. `"true"`, `1` e `"sim"` são NÃO —
  // coerção frouxa num portão é como "provavelmente pode" vira executado.
  return valor === true;
}

function ler(bruta: unknown): Politica {
  if (typeof bruta !== "object" || bruta === null) return POLITICA_DESCONHECIDA;
  const j = bruta as Record<string, unknown>;

  const plataforma = typeof j.platform === "string" ? j.platform : "";
  const versao = typeof j.version === "string" ? j.version : "";
  // Política sem nome de plataforma ou sem versão é política que ninguém
  // consegue auditar depois. Não vale.
  if (!plataforma || !versao) return POLITICA_DESCONHECIDA;

  const capsCruas = typeof j.capabilities === "object" && j.capabilities !== null
    ? (j.capabilities as Record<string, unknown>)
    : {};
  const capacidades: Record<string, Capacidade> = {};
  for (const [chave, valor] of Object.entries(capsCruas)) {
    // `_discovery_motivo` e afins são comentário de humano, não capacidade.
    if (chave.startsWith("_")) continue;
    capacidades[chave] = capacidadeDeclarada(valor);
  }

  return {
    plataforma,
    versao,
    ativa: booleanoFechado(j.active),
    verificadaEm: typeof j.policy_verified_at === "string" ? j.policy_verified_at : "(nunca)",
    capacidades,
    autoSubmissaoPermitida: booleanoFechado(j.auto_submission_allowed),
    autoMensagemPermitida: booleanoFechado(j.auto_messaging_allowed),
    // ⚠️ ESTE inverte: a AUSÊNCIA do campo tem de significar "exija humano".
    humanGateObrigatorio: j.human_gate_required !== false,
    linkExternoPermitidoAntesDoContrato: booleanoFechado(j.external_links_allowed_pre_contract),
    contatoExternoPermitidoAntesDoContrato: booleanoFechado(j.external_contact_allowed_pre_contract),
    apiDisponivel: booleanoFechado(j.api_available),
    // Note a assimetria com a linha de cima: aqui a AUSÊNCIA do campo tem de
    // significar "exige autorização". É o lado seguro do caso Freelancer.com.
    apiExigeAutorizacao: j.api_authorization_required !== false,
    prioridadeNoRoadmap: typeof j.prioridade_no_roadmap === "number" ? j.prioridade_no_roadmap : null,
    cru: j,
  };
}

/**
 * O registro de políticas da casa. Uma linha por plataforma.
 *
 * Plataforma que não estiver aqui devolve `POLITICA_DESCONHECIDA` — e o gate
 * BLOQUEIA. Acrescentar uma plataforma é acrescentar o `policy.json` dela, com
 * parecer e fontes; nunca é acrescentar um `case` no gate.
 */
const REGISTRO: Record<string, Politica> = {
  "99freelas": ler(bruta99freelas),
  upwork: ler(brutaUpwork),
  freelancer: ler(brutaFreelancer),
  workana: ler(brutaWorkana),
  fiverr: ler(brutaFiverr),
};

export function politicaDe(plataforma: string): Politica {
  const chave = (plataforma ?? "").trim().toLowerCase();
  const p = REGISTRO[chave];
  if (!p) return POLITICA_DESCONHECIDA;
  // Política desativada (§48: a linha antiga vira active:false e nasce outra)
  // não protege ninguém: é o mesmo que não haver política.
  return p.ativa ? p : { ...p, capacidades: {}, autoSubmissaoPermitida: false, autoMensagemPermitida: false };
}

export function plataformasComPolitica(): string[] {
  return Object.keys(REGISTRO).sort();
}

// ── A autorização escrita: a única coisa que destrava o envio ────────────────

/**
 * Lê o campo que a resposta do suporte vai preencher.
 *
 * As TRÊS metades são obrigatórias juntas: `status: "autorizado"` sozinho não
 * vale, porque status é a parte fácil de escrever com otimismo. Sem `respondido_em`
 * e sem `evidencia` (o arquivo com a resposta arquivada), a autorização não
 * existe para o gate.
 */
export function autorizacaoDoSuporte(p: Politica): AutorizacaoDoSuporte & { valeParaOGate: boolean } {
  const bruto = p.cru.autorizacao_do_suporte;
  const j = typeof bruto === "object" && bruto !== null ? (bruto as Record<string, unknown>) : {};
  const status: StatusDaAutorizacao =
    j.status === "perguntado" || j.status === "autorizado" || j.status === "negado" || j.status === "sem_resposta"
      ? j.status
      : "nao_perguntado";
  const respondido_em = typeof j.respondido_em === "string" && j.respondido_em ? j.respondido_em : null;
  const evidencia = typeof j.evidencia === "string" && j.evidencia ? j.evidencia : null;
  return {
    status,
    perguntado_em: typeof j.perguntado_em === "string" && j.perguntado_em ? j.perguntado_em : null,
    respondido_em,
    evidencia,
    valeParaOGate: status === "autorizado" && respondido_em !== null && evidencia !== null,
  };
}
