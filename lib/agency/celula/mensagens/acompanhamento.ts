// acompanhamento.ts — A TRAVA DO M14: UM acompanhamento automático por
// oportunidade, e seis motivos para nenhum. Ver
// docs/celula-prospeccao/despachos/ONDA-2B-C-um-acompanhamento-so.md
//
// ─── A ORDEM DO CEO, LITERAL ─────────────────────────────────────────────────
// "Apenas UM acompanhamento automático por oportunidade, intervalo
// configurável. NÃO enviar se: o cliente recusou · o projeto encerrou · outra
// pessoa foi contratada · o cliente pediu para não receber · já houve
// acompanhamento · a plataforma bloqueou."
//
// Cada uma dessas seis é uma trava própria, abaixo. Mais duas travas que a
// ordem do CEO não pede por nome, mas que esta casa aplica de qualquer forma
// (e reporta como bloqueio A MAIS, nunca a menos):
//   - `clienteRespondeu === true`: acompanhar quem já falou é insistir com
//     quem respondeu.
//   - o intervalo mínimo desde a última mensagem da agência ainda não passou.
//
// ─── AUSÊNCIA DE INFORMAÇÃO NÃO É INFORMAÇÃO ─────────────────────────────────
// Lei desta casa. Todo campo `null` — os seis booleanos, a contagem de
// acompanhamentos já enviados e a data da última mensagem da agência — BLOQUEIA,
// nomeando qual campo está desconhecido. Nunca preenchemos um gap por
// inferência otimista.
//
// ─── ESTE MÓDULO É PURO ──────────────────────────────────────────────────────
// Recebe o estado da oportunidade (já lido de onde quer que more — isso é de
// outra ficha), lê a política de intervalo/teto do `policy.json` da
// plataforma, e devolve a decisão. Nenhuma escrita, nenhuma persistência: o
// banco é da Onda 3.
//
// ─── 🔴 O RISCO QUE ESTE ARQUIVO NÃO FECHA ──────────────────────────────────
// O chat do 99Freelas fica ATRÁS DO LOGIN, e login é BLOCK nesta rodada. Logo
// NADA alimenta `acompanhamentosJaEnviados` sozinho hoje: a contagem depende
// de quem chamar `podeAcompanhar` passar a verdade sobre quantos
// acompanhamentos automáticos já saíram para esta oportunidade. O mecanismo de
// decisão existe; a ENTRADA dele não — isso é risco aberto, não recurso
// pronto, no mesmo espírito do aviso que já existe no cabeçalho de
// `lib/marketplaces/99freelas/follow-up.ts`.

import { politicaDe } from "@/lib/marketplaces/politica";

// ── O que se sabe sobre a oportunidade na hora de decidir ───────────────────

/** O que se sabe sobre a oportunidade na hora de decidir o acompanhamento. */
export interface EstadoDaOportunidade {
  referencia: string;
  /** Quando a agência mandou a última mensagem (a proposta, tipicamente). */
  ultimaMensagemDaAgenciaEm: Date | null;
  /** Quantos acompanhamentos AUTOMÁTICOS já saíram para esta oportunidade. */
  acompanhamentosJaEnviados: number | null;
  clienteRecusou: boolean | null;
  projetoEncerrado: boolean | null;
  outraPessoaContratada: boolean | null;
  clientePediuParaNaoReceber: boolean | null;
  plataformaBloqueou: boolean | null;
  /** `true` quando o cliente falou depois da última mensagem da agência. */
  clienteRespondeu: boolean | null;
}

export interface DecisaoDeAcompanhamento {
  pode: boolean;
  /** Todos os motivos de bloqueio, nomeados. Nunca um só quando há vários. */
  motivos: string[];
  /** O texto curto para o humano. Nunca vazio, nem no caminho feliz. */
  motivo: string;
  horasDesdeAUltimaMensagem: number | null;
  intervaloHoras: number;
}

// ── A configuração vem do policy.json, nunca de constante no código ─────────

export interface ConfiguracaoDeAcompanhamento {
  maximoPorOportunidade: number;
  intervaloHoras: number;
}

/**
 * Lê `acompanhamento` de `docs/plataformas/<plataforma>/policy.json` — ou do
 * bloco injetado em `blocoBruto`, quando informado.
 *
 * `blocoBruto` é a mesma porta injetada que `carregarBiblioteca(bruto?)` já
 * usa nesta casa: em produção ninguém passa o segundo parâmetro, e prevalece
 * a leitura real do `policy.json` via `politicaDe(plataforma)`; em teste, cada
 * fallback (número corrompido, ausente, negativo, bloco não-objeto) fica
 * isolável sem depender do `policy.json` real ter o campo ausente — o que ele
 * não tem, e por isso a mutação `: 1 → : Infinity` não derrubava nenhum teste
 * antes desta porta existir.
 *
 * FAIL CLOSED em duas camadas, cada uma documentada:
 *  - `maximo_por_oportunidade` ausente ou não-número ⇒ usa 1 (o valor MAIS
 *    restritivo, por ordem explícita da ficha — nunca o mais permissivo).
 *  - intervalo ausente dos dois lados (plataforma e casa) ⇒ usa `Infinity`
 *    horas, isto é, NUNCA libera sozinho sem número configurado. Mesmo
 *    espírito do `custo_desconhecido_vale: "Infinity"` já usado em
 *    `policy.json` para outro campo desconhecido e protetor.
 */
export function configuracaoDeAcompanhamento(
  plataforma: string,
  blocoBruto?: unknown,
): ConfiguracaoDeAcompanhamento {
  const bruto = blocoBruto !== undefined ? blocoBruto : politicaDe(plataforma).cru.acompanhamento;
  const bloco = typeof bruto === "object" && bruto !== null ? (bruto as Record<string, unknown>) : {};

  const maximoBruto = bloco.maximo_por_oportunidade;
  const maximoPorOportunidade =
    typeof maximoBruto === "number" && Number.isFinite(maximoBruto) && maximoBruto >= 0 ? maximoBruto : 1;

  const daPlataforma =
    typeof bloco.intervalo_da_plataforma_horas === "number" && Number.isFinite(bloco.intervalo_da_plataforma_horas)
      ? bloco.intervalo_da_plataforma_horas
      : null;
  const daCasa =
    typeof bloco.intervalo_da_casa_horas === "number" && Number.isFinite(bloco.intervalo_da_casa_horas)
      ? bloco.intervalo_da_casa_horas
      : null;

  const intervaloHoras = daPlataforma ?? daCasa ?? Infinity;

  return { maximoPorOportunidade, intervaloHoras };
}

// ── As travas booleanas, cada uma nomeando o campo e citando o CEO ──────────

/**
 * `null` bloqueia (DESCONHECIDO). `true` bloqueia citando a frase literal do
 * CEO. `false` libera (devolve `null`, "nada a reportar aqui").
 */
function condicaoBooleanaDoCeo(valor: boolean | null, nomeDoCampo: string, fraseDoCeo: string): string | null {
  if (valor === null) {
    return (
      `DESCONHECIDO: o campo "${nomeDoCampo}" não foi informado. ` +
      `Ausência de informação não é informação — bloqueia por padrão até confirmar se "${fraseDoCeo}".`
    );
  }
  if (valor === true) {
    return `Bloqueado pela ordem do CEO: "${fraseDoCeo}".`;
  }
  return null;
}

// ── A função principal ───────────────────────────────────────────────────

/**
 * A oportunidade pode receber UM acompanhamento automático agora?
 *
 * Avalia TODAS as travas sem parar na primeira — `motivos` sempre traz todas
 * as que dispararam, nunca só a primeira. `pode` é `true` se e somente se
 * `motivos` estiver vazio.
 */
export function podeAcompanhar(
  estado: EstadoDaOportunidade,
  agora: Date = new Date(),
  plataforma = "99freelas",
  /**
   * Porta injetada opcional, repassada direto a `configuracaoDeAcompanhamento`.
   * Quem chama com dois ou três argumentos continua lendo o `policy.json`
   * real — este parâmetro só existe para isolar em teste o caso em que o
   * intervalo já passou e SÓ o teto de `maximo_por_oportunidade` deveria
   * bloquear.
   */
  blocoDeAcompanhamentoBruto?: unknown,
): DecisaoDeAcompanhamento {
  const { maximoPorOportunidade, intervaloHoras } = configuracaoDeAcompanhamento(
    plataforma,
    blocoDeAcompanhamentoBruto,
  );
  const motivos: string[] = [];

  // ── As cinco condições booleanas do CEO (a sexta, "já houve
  // acompanhamento", é a contagem abaixo, e não um booleano) ────────────────
  const condicoesDoCeo: Array<{ valor: boolean | null; campo: keyof EstadoDaOportunidade; frase: string }> = [
    { valor: estado.clienteRecusou, campo: "clienteRecusou", frase: "o cliente recusou" },
    { valor: estado.projetoEncerrado, campo: "projetoEncerrado", frase: "o projeto encerrou" },
    { valor: estado.outraPessoaContratada, campo: "outraPessoaContratada", frase: "outra pessoa foi contratada" },
    { valor: estado.clientePediuParaNaoReceber, campo: "clientePediuParaNaoReceber", frase: "o cliente pediu para não receber" },
    { valor: estado.plataformaBloqueou, campo: "plataformaBloqueou", frase: "a plataforma bloqueou" },
  ];
  for (const c of condicoesDoCeo) {
    const m = condicaoBooleanaDoCeo(c.valor, c.campo, c.frase);
    if (m) motivos.push(m);
  }

  // ── A sexta condição do CEO: "já houve acompanhamento" ───────────────────
  // Regra 2/3 da ficha: `>= 1` bloqueia (não `> 1`), e negativo é dado
  // corrompido, nunca permissão. `maximoPorOportunidade` vem da política
  // (fail closed em 1 quando ausente), então o teste natural do CEO
  // (`>= 1`) é o caso `maximoPorOportunidade === 1` deste teste geral.
  if (estado.acompanhamentosJaEnviados === null) {
    motivos.push(
      'DESCONHECIDO: o campo "acompanhamentosJaEnviados" não foi informado. ' +
        "Ausência de informação não é informação — bloqueia por padrão.",
    );
  } else if (estado.acompanhamentosJaEnviados < 0) {
    motivos.push(
      `Dado corrompido: "acompanhamentosJaEnviados" está negativo (${estado.acompanhamentosJaEnviados}). ` +
        "Dado corrompido não vira permissão.",
    );
  } else if (estado.acompanhamentosJaEnviados >= maximoPorOportunidade) {
    motivos.push(
      `Bloqueado pela ordem do CEO: "já houve acompanhamento" — ${estado.acompanhamentosJaEnviados} ` +
        `acompanhamento(s) automático(s) já enviado(s) para esta oportunidade (o máximo é ${maximoPorOportunidade}).`,
    );
  }

  // ── Bloqueio A MAIS do que a ordem literal do CEO (item 5 da ficha) ──────
  // Se isto extrapola a ordem do CEO, é bloqueio a mais, nunca a menos — e
  // vai reportado ao PM/Diretor como tal.
  if (estado.clienteRespondeu === null) {
    motivos.push(
      'DESCONHECIDO: o campo "clienteRespondeu" não foi informado. ' +
        "Ausência de informação não é informação — bloqueia por padrão.",
    );
  } else if (estado.clienteRespondeu === true) {
    motivos.push(
      "Bloqueio A MAIS do que a ordem literal do CEO: o cliente já respondeu depois da última mensagem da " +
        "agência. Acompanhar quem já respondeu é insistir com quem falou.",
    );
  }

  // ── O intervalo mínimo desde a última mensagem da agência ────────────────
  let horasDesdeAUltimaMensagem: number | null = null;
  if (estado.ultimaMensagemDaAgenciaEm === null) {
    motivos.push(
      'DESCONHECIDO: o campo "ultimaMensagemDaAgenciaEm" não foi informado. Sem saber quando a agência falou ' +
        "por último, não dá para calcular o intervalo mínimo. Ausência de informação não é informação — bloqueia por padrão.",
    );
  } else {
    const horasCorridas = (agora.getTime() - estado.ultimaMensagemDaAgenciaEm.getTime()) / 3_600_000;
    // Comportamento declarado no limite exato: "pelo menos `intervaloHoras`"
    // é `>=`, então passar exatamente no limite LIBERA (não bloqueia).
    horasDesdeAUltimaMensagem = Math.max(0, Math.round(horasCorridas * 10) / 10);
    if (horasCorridas < intervaloHoras) {
      const faltam =
        intervaloHoras === Infinity ? Infinity : Math.max(0, Math.round((intervaloHoras - horasCorridas) * 10) / 10);
      motivos.push(
        `Intervalo ainda não cumprido: passaram-se ${horasDesdeAUltimaMensagem} h desde a última mensagem da ` +
          `agência — o intervalo exigido é ${intervaloHoras === Infinity ? "desconhecido (sem número configurado, fail closed)" : `${intervaloHoras} h`}. ` +
          `Faltam ${faltam === Infinity ? "(indeterminado — configure o intervalo)" : `${faltam} h`}.`,
      );
    }
  }

  const pode = motivos.length === 0;
  const motivo = pode
    ? "Liberado: nenhuma das travas do CEO bloqueou, o teto de UM acompanhamento não foi atingido e o intervalo mínimo já passou."
    : motivos[0]!;

  return { pode, motivos, motivo, horasDesdeAUltimaMensagem, intervaloHoras };
}
