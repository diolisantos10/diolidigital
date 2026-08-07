// A ESCADA DE EXPOSIÇÃO — sombra → allowlist → wide.
//
// ─── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
//
// A Onda 1 do P0 ("departamento sem gate executável = REPROVADO") está parada de
// propósito: entrando sozinha, ela para 8 de 8 departamentos no dia 1 e desliga
// a agência num commit. O kit já tinha a resposta e ela não estava construída —
// a escada. Departamento novo NASCE em sombra e sobe com evidência; o portão
// invertido, quando entrar, encontra uma casa que já sabe funcionar por degrau.
//
// ─── O QUE CADA DEGRAU É, EM MECANISMO ───────────────────────────────────────
//
//   sombra    → o departamento PRODUZ, a saída é registrada, e NÃO chega ao
//               cliente. `escadaFiltraEntregas` nunca a marca "compartilhado".
//   allowlist → chega ao cliente SÓ para os clientIds explicitamente listados.
//   wide      → chega a todos.
//
// Fail-closed em três lugares, não em um: no default da coluna do banco, no
// `degrauDeclarado` (linha ausente = sombra) e no `departamentoDoAgente`
// (executor desconhecido = sem departamento = retido). Um único ponto de
// fail-closed é um ponto de esquecimento.
//
// ─── DESCER É LIVRE; SUBIR É NÚMERO ──────────────────────────────────────────
//
// Assimetria deliberada, a mesma de `leitura-do-cliente.ts`: o custo do erro é
// diferente nos dois sentidos. Descer errado custa uma entrega represada que a
// equipe destrava; subir errado custa uma peça errada publicada em nome de um
// cliente pagante. Por isso `podeDescer` não pergunta nada e `podeSubir` exige
// contagem numa janela.

import { DEPARTAMENTOS } from "@/lib/agency/execution/especialistas";
import { BRAIN_DEPARTMENTS } from "@/lib/dioli-brain/departments";

export type Degrau = "sombra" | "allowlist" | "wide";

export const DEGRAUS: Degrau[] = ["sombra", "allowlist", "wide"];

export const ROTULO_DO_DEGRAU: Record<Degrau, string> = {
  sombra:    "Sombra — produz, registra, não chega ao cliente",
  allowlist: "Liberado — chega só aos clientes marcados",
  wide:      "Aberto — chega a todos os clientes",
};

/** Ordem para comparar degraus. Não é enum de banco de propósito: o valor
 *  gravado é texto, e texto desconhecido tem que cair em sombra, não explodir. */
const ALTURA: Record<Degrau, number> = { sombra: 0, allowlist: 1, wide: 2 };

/**
 * Lê um degrau vindo do banco. Qualquer coisa que não seja exatamente um dos
 * três — nulo, vazio, "WIDE", lixo de migração — vira SOMBRA.
 *
 * Isto é a trava, não a cortesia: um `as Degrau` no ponto de leitura faria
 * `degrau = "widee"` (typo numa correção manual em produção) valer como wide,
 * porque `"widee" !== "sombra"` em qualquer comparação escrita com pressa.
 */
export function degrauDeclarado(valor: string | null | undefined): Degrau {
  return valor === "allowlist" || valor === "wide" || valor === "sombra" ? valor : "sombra";
}

export function alturaDo(degrau: Degrau): number {
  return ALTURA[degrau];
}

// ── De QUEM é a peça: executor → departamento ────────────────────────────────

/**
 * Executores que produzem entrega e NÃO estão em `DEPARTAMENTOS`.
 *
 * Estão nomeados um a um, e não resolvidos por prefixo, porque prefixo é
 * adivinhação: `"design-kit-de-marca"` casaria com `design` por acidente de
 * nomenclatura, e o dia em que alguém criar `"designer-externo"` a peça dele
 * herdaria silenciosamente o degrau do departamento de Design.
 */
const EXECUTORES_AVULSOS: Record<string, string> = {
  "design-kit-de-marca": "design",
  "relatorio-mensal": "analytics",
  // ── PROSPECÇÃO EM MARKETPLACE (07/08/2026) ────────────────────────────────
  // O agente do 99Freelas produz uma PROPOSTA COMERCIAL que sai em nome da
  // agência. Não é entregável de cliente, mas é saída para fora — e é
  // exatamente isso que a escada existe para medir. Nasce em `sombra`, como
  // todo departamento novo: produz, registra e não chega a lugar nenhum sem
  // decisão humana. O HUMAN_GATE do envio é a face operacional do mesmo degrau.
  "99freelas-prospeccao": "prospeccao",
};

/**
 * Departamentos que produzem saída para FORA e não têm especialista de
 * entregável em `DEPARTAMENTOS`. Sem esta lista, `prospeccao` não teria linha
 * na escada — e "sem linha" é invisível na tela, mesmo estando fail-closed.
 * É o mesmo motivo pelo qual o financeiro entrou em `departamentosDaCasa`.
 */
const DEPARTAMENTOS_SEM_ESPECIALISTA_DE_ENTREGAVEL = ["prospeccao"];

const AGENTE_PARA_DEPARTAMENTO: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const dept of DEPARTAMENTOS) {
    for (const esp of dept.especialistas) m.set(esp.id, dept.id);
  }
  for (const [agente, dept] of Object.entries(EXECUTORES_AVULSOS)) m.set(agente, dept);
  return m;
})();

/**
 * De que departamento é esta peça. `null` quando não dá para saber — e `null`
 * NÃO é "pode passar": quem chama trata como sombra.
 *
 * Foi o caso que mais quase virou fail-open aqui: entrega antiga com
 * `ownerAgentId` nulo. A tentação é deixar passar "porque é legado". Legado que
 * passa por ser legado é a porta que o próximo executor novo usa sem querer.
 */
export function departamentoDoAgente(ownerAgentId: string | null | undefined): string | null {
  if (!ownerAgentId) return null;
  return AGENTE_PARA_DEPARTAMENTO.get(ownerAgentId) ?? null;
}

/** Os que têm especialista e produzem entrega. */
export function departamentosQueProduzem(): string[] {
  return [...new Set(DEPARTAMENTOS.map((d) => d.id))];
}

/**
 * A união das DUAS listas de departamento desta casa.
 *
 * São duas e divergem: os 8 do Brain (`departments.ts`) não incluem
 * `financeiro`, que tem especialista e produz entrega. Uma escada montada só
 * sobre os 8 deixaria o financeiro sem linha — o que, por fail-closed, o
 * manteria em sombra (certo) e INVISÍVEL na tela (errado): ninguém saberia que
 * há um departamento produzindo sem degrau declarado.
 *
 * Sem prisma de propósito: é lista, não estado, e o dublê dos testes precisa
 * dela sem arrastar o cliente do banco junto.
 */
export function departamentosDaCasa(): string[] {
  return [...new Set([
    ...BRAIN_DEPARTMENTS.map((d) => d.id),
    ...departamentosQueProduzem(),
    ...DEPARTAMENTOS_SEM_ESPECIALISTA_DE_ENTREGAVEL,
  ])].sort();
}

/** O nome que a casa usa para o departamento. Sai das listas existentes — um
 *  terceiro dicionário de rótulos divergiria dos outros dois em uma semana. */
export function rotuloDoDepartamento(id: string): string {
  return (
    DEPARTAMENTOS.find((d) => d.id === id)?.label ??
    BRAIN_DEPARTMENTS.find((d) => d.id === id)?.name ??
    id
  );
}

// ── A DECISÃO DE ENTREGA ─────────────────────────────────────────────────────

export interface EstadoDoDegrau {
  departmentId: string;
  degrau: Degrau;
  clientesLiberados: string[];
}

export interface VeredictoDeEntrega {
  chega: boolean;
  /** Por que não chegou — vai para o `ActivityEvent`, com o caso concreto. */
  motivo?: string;
}

/**
 * Esta peça, deste departamento, para este cliente: chega ou não chega?
 *
 * As DUAS metades importam e as duas têm teste: sombra não chega NUNCA, e wide
 * chega SEM atrito. Um portão que retém o legítimo treina o time a ignorar o
 * alarme — custa mais caro do que parece.
 */
export function decidirEntrega(
  estado: EstadoDoDegrau | null,
  clientId: string | null | undefined,
): VeredictoDeEntrega {
  if (!estado) {
    return { chega: false, motivo: "departamento sem degrau declarado na escada — fail-closed: sombra" };
  }
  if (estado.degrau === "wide") return { chega: true };
  if (estado.degrau === "sombra") {
    return { chega: false, motivo: `departamento ${estado.departmentId} está em SOMBRA — produz e registra, não chega ao cliente` };
  }
  // allowlist
  if (!clientId) {
    return { chega: false, motivo: `departamento ${estado.departmentId} está em ALLOWLIST e a entrega não tem cliente identificado` };
  }
  if (estado.clientesLiberados.includes(clientId)) return { chega: true };
  return {
    chega: false,
    motivo: `departamento ${estado.departmentId} está em ALLOWLIST e o cliente ${clientId} não está na lista`,
  };
}

// ── A EVIDÊNCIA — número, não opinião ────────────────────────────────────────

/** Janela de apuração. Fixa e curta de propósito: evidência de três meses atrás
 *  é sobre um sistema que já mudou de prompt, de provedor e de portão. */
export const JANELA_DE_EVIDENCIA_DIAS = 30;

export type ResultadoDaPeca =
  | "aprovada"
  | "reprovada_qualidade"
  | "barrada_piso"
  | "barrada_contrato"
  | "sem_arbitro";

export interface ContagemDaJanela {
  aprovadas: number;
  reprovadasQualidade: number;
  barradasPiso: number;
  barradasContrato: number;
  semArbitro: number;
  clientesDistintos: number;
  total: number;
}

export interface CriterioDeDegrau {
  aprovadasMinimas: number;
  /** Fração máxima de reprovação sobre o TOTAL da janela. */
  taxaMaximaDeReprovacao: number;
  /** Peças barradas no piso de verdade toleradas. Zero: dado inventado não é
   *  "qualidade abaixo do esperado", é afirmação falsa em nome do cliente. */
  barradasNoPisoToleradas: number;
  clientesDistintosMinimos: number;
}

export const CRITERIO: Record<"allowlist" | "wide", CriterioDeDegrau> = {
  // Sombra → allowlist. Cinco peças limpas numa janela de 30 dias. É pouco de
  // propósito: o degrau seguinte ainda entrega só a quem for marcado a dedo, e
  // uma barra alta demais aqui mantém o departamento em sombra para sempre —
  // ou seja, mantém a casa sem nunca provar nada.
  allowlist: { aprovadasMinimas: 5, taxaMaximaDeReprovacao: 0.2, barradasNoPisoToleradas: 0, clientesDistintosMinimos: 1 },
  // Allowlist → wide. Vinte peças, régua mais apertada, e pelo menos DOIS
  // clientes: "funciona para todos" não se prova com um cliente só — o
  // departamento pode ter decorado o vocabulário de uma marca.
  wide: { aprovadasMinimas: 20, taxaMaximaDeReprovacao: 0.1, barradasNoPisoToleradas: 0, clientesDistintosMinimos: 2 },
};

export interface AvaliacaoDeSubida {
  pode: boolean;
  alvo: Degrau;
  contagem: ContagemDaJanela;
  criterio: CriterioDeDegrau;
  /** O que exatamente falta, em número, para o degrau subir. É isto que a tela
   *  mostra — "falta evidência" sem o número é ruído que ninguém investiga. */
  faltam: string[];
}

export function contarJanela(
  registros: Array<{ resultado: string; clientId?: string | null }>,
): ContagemDaJanela {
  const clientes = new Set<string>();
  const c: ContagemDaJanela = {
    aprovadas: 0, reprovadasQualidade: 0, barradasPiso: 0, barradasContrato: 0,
    semArbitro: 0, clientesDistintos: 0, total: registros.length,
  };
  for (const r of registros) {
    if (r.clientId) clientes.add(r.clientId);
    switch (r.resultado) {
      case "aprovada": c.aprovadas++; break;
      case "reprovada_qualidade": c.reprovadasQualidade++; break;
      case "barrada_piso": c.barradasPiso++; break;
      case "barrada_contrato": c.barradasContrato++; break;
      // `sem_arbitro` não entra em nenhuma das duas colunas de mérito. Não é
      // aprovação (ninguém olhou) e não é reprovação (ninguém apontou nada).
      case "sem_arbitro": c.semArbitro++; break;
      default: break;
    }
  }
  c.clientesDistintos = clientes.size;
  return c;
}

/** O próximo degrau acima. `null` no topo. */
export function proximoDegrau(atual: Degrau): "allowlist" | "wide" | null {
  if (atual === "sombra") return "allowlist";
  if (atual === "allowlist") return "wide";
  return null;
}

/**
 * Pode subir? E se não pode, QUANTO falta.
 *
 * Não recebe "decisão", "urgência" nem "o CEO pediu": recebe registros. Um
 * degrau que sobe por decisão não é escada, é o mesmo checklist de antes com
 * outro nome.
 */
export function avaliarSubida(
  atual: Degrau,
  registros: Array<{ resultado: string; clientId?: string | null }>,
): AvaliacaoDeSubida | null {
  const alvo = proximoDegrau(atual);
  if (!alvo) return null;
  const criterio = CRITERIO[alvo];
  const contagem = contarJanela(registros);
  const reprovadas = contagem.reprovadasQualidade + contagem.barradasPiso + contagem.barradasContrato;
  const taxa = contagem.total > 0 ? reprovadas / contagem.total : 0;

  const faltam: string[] = [];
  if (contagem.aprovadas < criterio.aprovadasMinimas) {
    faltam.push(`${criterio.aprovadasMinimas - contagem.aprovadas} entrega(s) aprovada(s) — tem ${contagem.aprovadas} de ${criterio.aprovadasMinimas} em ${JANELA_DE_EVIDENCIA_DIAS} dias`);
  }
  if (contagem.barradasPiso > criterio.barradasNoPisoToleradas) {
    faltam.push(`${contagem.barradasPiso} peça(s) barrada(s) no piso de verdade na janela — o teto é ${criterio.barradasNoPisoToleradas}`);
  }
  if (taxa > criterio.taxaMaximaDeReprovacao) {
    faltam.push(`taxa de reprovação ${(taxa * 100).toFixed(0)}% — o teto é ${(criterio.taxaMaximaDeReprovacao * 100).toFixed(0)}%`);
  }
  if (contagem.clientesDistintos < criterio.clientesDistintosMinimos) {
    faltam.push(`${criterio.clientesDistintosMinimos - contagem.clientesDistintos} cliente(s) distinto(s) — tem ${contagem.clientesDistintos} de ${criterio.clientesDistintosMinimos}`);
  }

  return { pode: faltam.length === 0, alvo, contagem, criterio, faltam };
}
