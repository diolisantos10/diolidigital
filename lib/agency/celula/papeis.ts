// ─── QUEM PODE O QUÊ NA CÉLULA — derivado do eixo de autoridade da casa ────
//
// Item obrigatório da ordem do CEO de 30/08/2026: "papéis e permissões de
// Gerente e SDR".
//
// ── O QUE JÁ EXISTIA, E QUE ESTE ARQUIVO NÃO REFAZ ────────────────────────
// A casa tem `lib/agency/organizacao/autoridade.ts`, com dois eixos — quem
// manda (`Autoridade`) × onde trabalha (`DepartamentoId`) — e uma regra que
// vale aqui inteira: **ler é largo de propósito, escrever é estreito de
// propósito**. E `lib/agency/celula/excecoes/tipos.ts` já fecha os dois
// responsáveis da fila (`gerente_de_atendimento`, `sdr`) e já barra o CEO.
//
// O que faltava era ligar as duas pontas: **quem, entre as pessoas que entram
// no sistema, é o Gerente de Atendimento e SDR** — e o que exatamente esse
// papel pode fazer que ninguém mais pode.
//
// ── A PERMISSÃO QUE MOTIVOU ESTE ARQUIVO ──────────────────────────────────
// O CEO escreveu: *"O Gerente de Atendimento e SDR revisa, aprova, pausa e
// substitui modelos SEM ALTERAR CÓDIGO."* Hoje os 22 modelos M01–M22 estão em
// `rascunho` e são inenviáveis, e **não havia ninguém no sistema com poder de
// aprová-los** — só um campo `aprovador` esperando um nome. Um modelo que só
// pode ser aprovado por quem edita arquivo é um modelo aprovado por
// programador, que é exatamente o contrário da ordem.
//
// ── POR QUE APROVAR NÃO É DE QUEM MANDA MAIS ──────────────────────────────
// `master` e `director` NÃO aprovam modelo, e isso não é esquecimento: é a
// mesma construção que faz `qualidade` e `experiencia` não escreverem nesta
// casa. Quem responde pela fala que chega ao cliente tem de ser quem convive
// com a resposta dele. Direção que aprova a própria mensagem fecha o circuito
// em si mesma — e o CEO nomeou o Gerente exatamente para isso não acontecer.

import type { Autoridade } from "@/lib/agency/organizacao/autoridade";
import type { DepartamentoId } from "@/lib/agency/organizacao/departamentos";
import { RESPONSAVEIS, type Responsavel } from "@/lib/agency/celula/excecoes/tipos";

/** O departamento onde a Célula mora. Decisão do CEO: ela NÃO é departamento
 *  novo — fica dentro do Atendimento e SDR. */
export const DEPARTAMENTO_DA_CELULA: DepartamentoId = "client-service-sdr";

/** Quem a pessoa é DENTRO da Célula. `null` = não é da Célula. */
export type PapelNaCelula = Responsavel | null;

export interface Credencial {
  autoridade: Autoridade;
  /** Departamentos em que a pessoa trabalha. */
  departamentos: readonly DepartamentoId[];
  /**
   * O papel declarado dentro do Atendimento e SDR. É DADO, não inferido de
   * cargo: dois membros do mesmo departamento podem ser um gerente e um SDR, e
   * nada na autoridade da casa distingue os dois. Inferir aqui faria todo
   * membro do departamento virar gerente — e aprovar modelo.
   */
  papelDeclaradoNaCelula?: unknown;
}

/**
 * Quem é esta pessoa na Célula. FAIL CLOSED em duas camadas:
 * não é do departamento → `null`; é do departamento mas não declarou papel →
 * `null`.
 *
 * `master` e `director` **não são promovidos automaticamente a gerente**.
 * Autoridade alta dá acesso de LEITURA a tudo nesta casa; não dá o papel
 * operacional de quem responde pela conversa.
 */
export function papelNaCelula(c: Credencial): PapelNaCelula {
  if (!Array.isArray(c?.departamentos)) return null;
  if (!c.departamentos.includes(DEPARTAMENTO_DA_CELULA)) return null;

  const p = c.papelDeclaradoNaCelula;
  if (typeof p !== "string") return null;
  return (RESPONSAVEIS as readonly string[]).includes(p) ? (p as Responsavel) : null;
}

/** O conjunto FECHADO do que se pode fazer na Célula. */
export type AcaoDaCelula =
  /** Aprovar um modelo de mensagem (rascunho → aprovado). */
  | "aprovar_modelo"
  /** Pausar ou aposentar um modelo já aprovado. */
  | "pausar_modelo"
  /** Dar o aceite humano do modo SUPERVISIONADO, antes de a mensagem sair. */
  | "autorizar_envio"
  /** Assumir e resolver item da fila de exceções. */
  | "operar_fila_de_excecoes"
  /** Ver o Radar, o funil e as conversas. */
  | "ler_a_celula";

const ACOES: readonly string[] = [
  "aprovar_modelo",
  "pausar_modelo",
  "autorizar_envio",
  "operar_fila_de_excecoes",
  "ler_a_celula",
];

export type VereditoDePermissao =
  | { pode: true }
  | { pode: false; motivo: string; regra: RegraDePermissao };

export type RegraDePermissao =
  | "acao_desconhecida"
  | "fora_da_celula"
  | "papel_nao_permite"
  | "direcao_nao_aprova_a_propria_fala"
  | "o_ceo_nao_opera_a_fila";

/**
 * O que cada papel da Célula pode. Tabela, não `if` espalhado — e ESCREVER é
 * estreito de propósito.
 *
 * O SDR **usa** os modelos e conversa; ele não aprova o que vai dizer. Separar
 * quem escreve de quem libera é a mesma construção que impede o `qualidade`
 * desta casa de consertar o que ele reprova.
 */
const PODE: Record<Responsavel, readonly AcaoDaCelula[]> = {
  gerente_de_atendimento: [
    "aprovar_modelo",
    "pausar_modelo",
    "autorizar_envio",
    "operar_fila_de_excecoes",
    "ler_a_celula",
  ],
  sdr: ["operar_fila_de_excecoes", "ler_a_celula"],
};

/** Leitura é larga nesta casa: quem é de dentro enxerga o panorama. */
function eDeDentroDaCasa(a: Autoridade): boolean {
  return a !== "client";
}

export function podeNaCelula(c: Credencial, acao: unknown): VereditoDePermissao {
  if (typeof acao !== "string" || !ACOES.includes(acao)) {
    return {
      pode: false,
      regra: "acao_desconhecida",
      motivo: `ação desconhecida: ${JSON.stringify(acao)}. Conjunto fechado: ${ACOES.join(", ")}.`,
    };
  }
  const a = acao as AcaoDaCelula;
  const papel = papelNaCelula(c);

  // LER é largo — ordem do CEO desta casa, para não haver agência de silos.
  // Cliente NUNCA: `/agency/**` é território proibido, sem exceção.
  if (a === "ler_a_celula") {
    return eDeDentroDaCasa(c?.autoridade)
      ? { pode: true }
      : { pode: false, regra: "fora_da_celula", motivo: "cliente não lê a Célula." };
  }

  // A trava que o CEO escreveu com todas as letras: "O CEO NÃO opera essa
  // fila — o Gerente de Atendimento e SDR responde por ela." Vale mesmo para
  // quem tem a maior autoridade da casa, e é por isso que está ANTES da
  // checagem de papel: autoridade não destrava, e não deve nem ser consultada.
  // INCONDICIONAL: não há `if (papel === null)` aqui. Master/director tem uma
  // porta legítima para se auto-atribuir "gerente_de_atendimento" (é assim que
  // o CEO libera arquivo pelo Caminho A) — e essa mesma auto-atribuição NÃO
  // pode virar chave para operar a fila de exceções. Achado do `seguranca` em
  // 2026-09-02: com o `if` condicional, master auto-atribuído atravessava esta
  // trava. Autoridade não destrava — nem quando o papel foi auto-concedido.
  if (a === "operar_fila_de_excecoes" && (c?.autoridade === "master" || c?.autoridade === "director")) {
    return {
      pode: false,
      regra: "o_ceo_nao_opera_a_fila",
      motivo:
        "o CEO e a direção não operam a fila de exceções — ordem do CEO de 30/08/2026. " +
        "O dono dela é o Gerente de Atendimento e SDR. Vale mesmo que a conta master/director " +
        "tenha se auto-atribuído o papel de gerente_de_atendimento: autoridade não destrava.",
    };
  }

  // Direção não aprova nem pausa a fala que vai ao cliente. Quem responde pela
  // mensagem é quem convive com a resposta. INCONDICIONAL pelo mesmo motivo do
  // bloco acima: não depende de `papel` — nem mesmo quando `papel ===
  // "gerente_de_atendimento"` por auto-atribuição de master/director.
  if ((a === "aprovar_modelo" || a === "pausar_modelo") && (c?.autoridade === "master" || c?.autoridade === "director")) {
    return {
      pode: false,
      regra: "direcao_nao_aprova_a_propria_fala",
      motivo:
        "aprovar e pausar modelo é do Gerente de Atendimento e SDR, não da direção. " +
        "O CEO nomeou o papel exatamente para a fala ao cliente não ser liberada por quem a " +
        "encomendou — vale mesmo que a conta master/director tenha se auto-atribuído o papel " +
        "de gerente_de_atendimento.",
    };
  }

  if (papel === null) {
    return {
      pode: false,
      regra: "fora_da_celula",
      motivo:
        `sem papel declarado no departamento "${DEPARTAMENTO_DA_CELULA}". ` +
        `Papel é DADO declarado, nunca inferido de cargo — inferir faria todo membro do ` +
        `departamento virar gerente e poder aprovar modelo.`,
    };
  }

  if (!PODE[papel].includes(a)) {
    return {
      pode: false,
      regra: "papel_nao_permite",
      motivo: `"${papel}" não pode "${a}". O SDR usa os modelos e conversa; ele não libera o que vai dizer.`,
    };
  }

  return { pode: true };
}
