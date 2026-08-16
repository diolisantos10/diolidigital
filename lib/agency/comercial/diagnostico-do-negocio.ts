// DIAGNÓSTICO DO NOME DO NEGÓCIO — o que está sujo, e o que fazer com cada linha.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
//
// Em 16/08/2026 dois consertos fecharam as portas que gravavam errado a coluna
// `businessName`: `74810b75` (o e-mail do prospect virando nome do negócio, no
// `prospect-engine`) e o commit da porta pública (o nome da PESSOA no campo do
// NEGÓCIO, em `app/briefing/page.tsx`).
//
// **Os dois impedem sujeira nova e não limpam a velha.** No banco local ficaram
// cinco linhas com `businessName = "Dioli"` — o nome de quem preencheu — e o
// tamanho disso em produção ninguém tinha medido. Esta casa já tem uma pendência
// aberta desde 08/08 exatamente por isso (a Camila duplicada): defeito conhecido,
// dano não medido, e por isso nunca priorizado.
//
// ─── A LEI DESTE ARQUIVO: NUNCA INVENTAR ─────────────────────────────────────
//
// Um saneamento de dado de cliente que "adivinha" o nome certo é pior que o
// defeito: o defeito é rastreável (dá para ver que "Dioli" é uma pessoa), e o
// chute não é — ele fica com cara de dado conferido. Por isso só existem TRÊS
// desfechos, e nenhum deles cria texto:
//
//   • `recuperar`  — o nome do negócio EXISTE noutro campo da mesma linha
//                    (`briefingJson.scope.businessName`, escrito pela conversa).
//                    Não é dedução: é o mesmo dado, guardado noutro lugar.
//   • `declarar`   — o valor atual é comprovadamente a pessoa/o e-mail/o
//                    telefone, e não há nome de negócio em lugar nenhum da
//                    linha. Vira a ausência declarada (`""`), que `lerNegocio`
//                    já traduz em "Negócio não informado".
//   • `nao_tocar`  — está certo, ou não dá para provar que está errado.
//                    **A dúvida NÃO autoriza escrita.**
//
// O terceiro é o mais importante e é o que quase todo script de migração erra:
// na ausência de prova, o certo é deixar quieto. Uma linha suja que sobrevive
// custa uma tela feia; uma linha limpa que é apagada por engano custa o nome do
// cliente, e ninguém sabe de onde ele veio para restaurar.

import { lerNegocio } from "./negocio-do-lead";

export type Desfecho = "recuperar" | "declarar" | "nao_tocar";

export interface LinhaDeNegocio {
  id: string;
  businessName: string | null;
  /** Já parseado. O banco guarda string; quem lê do banco parseia antes. */
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
}

export interface Diagnostico {
  id: string;
  desfecho: Desfecho;
  /** O valor atual da coluna, como está gravado. */
  atual: string;
  /** O valor que deve ficar. Só existe em `recuperar` e `declarar`. */
  novo: string | null;
  /** Por que — em português, para caber no relatório sem tradução. */
  motivo: string;
}

/** Lê `scope` de um `briefingJson` que pode vir como objeto ou string. */
function escopo(json: unknown): Record<string, unknown> | null {
  const b = typeof json === "string" ? (() => { try { return JSON.parse(json); } catch { return null; } })() : json;
  const s = (b as { scope?: unknown } | null)?.scope;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Comparação de nomes sem acento, caixa ou espaço duplo — "Dioli  Santos" e
 *  "dioli santos" são a mesma pessoa, e um saneamento que não enxerga isso
 *  deixa metade da sujeira para trás. */
function mesmo(a: string, b: string): boolean {
  const n = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a).length > 0 && n(a) === n(b);
}

const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Telefone brasileiro escrito de qualquer jeito: só dígitos, 10 a 13 deles. */
const PARECE_TELEFONE = /^\+?[\d\s().-]{10,18}$/;

/**
 * O que fazer com UMA linha. Função pura: não lê banco, não escreve, não decide
 * se a correção será aplicada — isso é do script, e a separação é de propósito
 * (a regra é testável sem banco, e o gatilho fica longe da regra).
 */
export function diagnosticar(linha: LinhaDeNegocio): Diagnostico {
  const atual = typeof linha.businessName === "string" ? linha.businessName : "";
  const s = escopo(linha.briefingJson);
  const negocioNoEscopo = texto(s?.businessName);
  const pessoaNoEscopo = texto(s?.prospectName);
  const emailNoEscopo = texto(s?.prospectEmail);
  const telefoneNoEscopo = texto(s?.prospectPhone);

  const base = { id: linha.id, atual };

  // ── 1. JÁ ESTÁ DECLARADO COMO AUSENTE ────────────────────────────────────
  // `""` é o valor certo para "não informado" — é o que a casa inteira lê. Uma
  // ferramenta que "corrige" isso rodaria para sempre sem nunca terminar.
  if (lerNegocio(atual) === null) {
    return { ...base, desfecho: "nao_tocar", novo: null, motivo: "já é a ausência declarada" };
  }

  // ── 2. O NOME DO NEGÓCIO EXISTE NA PRÓPRIA LINHA ─────────────────────────
  // Só recupera se o que está gravado for COMPROVADAMENTE outra coisa. Se a
  // coluna já tem um nome que não é a pessoa, ela pode ser mais correta que o
  // escopo (alguém pode ter corrigido à mão) — e trocar seria escrever por cima
  // de uma decisão humana que este código não enxerga.
  const gravadoEhPessoa =
    (pessoaNoEscopo && mesmo(atual, pessoaNoEscopo)) ||
    PARECE_EMAIL.test(atual) ||
    (emailNoEscopo && mesmo(atual, emailNoEscopo)) ||
    (telefoneNoEscopo && mesmo(atual, telefoneNoEscopo)) ||
    PARECE_TELEFONE.test(atual);

  if (!gravadoEhPessoa) {
    return { ...base, desfecho: "nao_tocar", novo: null, motivo: "nome de negócio plausível — não há prova de erro" };
  }

  if (negocioNoEscopo && !mesmo(negocioNoEscopo, atual)) {
    // Não é dedução: o dado certo estava guardado noutro campo da MESMA linha,
    // escrito pela mesma conversa. É recuperação, não invenção.
    return {
      ...base,
      desfecho: "recuperar",
      novo: negocioNoEscopo,
      motivo: "o nome do negócio estava no escopo do briefing",
    };
  }

  // ── 3. É A PESSOA, E NÃO HÁ NEGÓCIO EM LUGAR NENHUM ──────────────────────
  // Aqui um script comum inventaria algo ("Negócio de Dioli", o título do
  // pedido, o segmento). Esta casa declara a ausência e para.
  const oQueEra = PARECE_EMAIL.test(atual)
    ? "um e-mail"
    : PARECE_TELEFONE.test(atual) && !pessoaNoEscopo
      ? "um telefone"
      : "o nome da pessoa";
  return {
    ...base,
    desfecho: "declarar",
    novo: "",
    motivo: `o campo guardava ${oQueEra}, e a linha não tem nome de negócio em lugar nenhum`,
  };
}

export interface Retrato {
  total: number;
  recuperar: number;
  declarar: number;
  naoTocar: number;
  /** As linhas que mudariam. Vazio = nada a fazer, e isso é resultado, não erro. */
  mudancas: Diagnostico[];
}

/** O retrato do lote inteiro — é o que o modo de simulação imprime. */
export function retratoDoLote(linhas: LinhaDeNegocio[]): Retrato {
  const d = linhas.map(diagnosticar);
  return {
    total: d.length,
    recuperar: d.filter((x) => x.desfecho === "recuperar").length,
    declarar: d.filter((x) => x.desfecho === "declarar").length,
    naoTocar: d.filter((x) => x.desfecho === "nao_tocar").length,
    mudancas: d.filter((x) => x.desfecho !== "nao_tocar"),
  };
}
