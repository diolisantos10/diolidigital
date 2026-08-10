// A LEITURA DA CONTA DO CLIENTE — o que a conta dele já ensinou.
//
// ── Por que este arquivo existe (09/08/2026) ────────────────────────────────
//
// Pedido do CEO: *"os clientes que já chegam com briefing, que já têm rede
// social (…) essa máquina fazer a leitura de tudo: quais os posts engajaram
// mais, quais deram mais cliques (…). A agência precisa ter essa inteligência
// pra acertar na entrega, e não depender só dos arquivos dos clientes."*
//
// O ponto dele, com todas as letras: **cliente novo começa do zero, tudo bem —
// mas quem já tem conta já tem prova do que funciona, e a agência produzia cega
// para isso.**
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, E ISSO É DECISÃO ───────────────────────────
//
// **Não fala com a Meta.** A leitura de insights de uma conta de TERCEIRO exige
// permissão concedida ao aplicativo, e o parecer do especialista `meta` sobre
// isso não existe ainda. A regra da casa desde 03/08 é explícita: a API deixar
// não quer dizer que pode, e foi confundir os dois que custou a conta de
// anúncios.
//
// Então a busca vive atrás de `buscarNaPlataforma`, que hoje devolve
// **`nao_verificado`** — e não um zero, não uma lista vazia e não um palpite.
// O resto da máquina (guardar, ordenar, comparar, declarar o que falta) é
// construído e testado, e passa a valer no dia em que o parecer entrar.
//
// Isso é o oposto de deixar para depois: a parte cara está pronta, e o que
// falta é uma permissão que não é código.

import { prisma } from "@/lib/db/client";

export interface MetricaLida {
  externalPostId: string;
  /** Nulo = NÃO MEDIDO. Nunca zero por omissão. */
  alcance: number | null;
  curtidas: number | null;
  comentarios: number | null;
  salvamentos: number | null;
  compartilham: number | null;
  cliques: number | null;
  lidoEm: Date;
}

/** O desempenho de um post, já com a conta feita. */
export interface Desempenho {
  externalPostId: string;
  /** Soma das interações medidas. `null` quando NADA foi medido — e aí o post
   *  não entra em ranking nenhum, em vez de aparecer em último lugar como se
   *  tivesse ido mal. */
  interacoes: number | null;
  alcance: number | null;
  /** Interações por alcance. `null` quando falta qualquer um dos dois. */
  taxa: number | null;
  lidoEm: Date;
}

export type ResultadoDaBusca =
  | { ok: true; metricas: MetricaLida[] }
  | { ok: false; motivo: "nao_verificado" | "sem_conexao" | "sem_permissao"; detalhe: string };

/**
 * A busca na plataforma. **Fechada de propósito.**
 *
 * Devolve `nao_verificado` até existir parecer assinado do especialista `meta`
 * dizendo, com fonte oficial, que a casa PODE ler insights da conta de um
 * cliente — e por qual caminho (token do app ou token do próprio cliente).
 *
 * Não é preguiça nem rascunho: é a regra que separa "a API deixou" de "pode".
 */
export async function buscarNaPlataforma(_clientId: string): Promise<ResultadoDaBusca> {
  return {
    ok: false,
    motivo: "nao_verificado",
    detalhe:
      "ler insights da conta de um cliente exige parecer do especialista `meta` com fonte oficial — " +
      "e ele ainda não existe. O que falta não é código: é saber se a casa PODE.",
  };
}

/** Guarda o que foi lido. Uma linha por leitura — nunca sobrescreve, porque
 *  desempenho é curva e a diferença entre duas leituras é a informação. */
export async function guardarMetricas(
  clientId: string,
  metricas: MetricaLida[],
  origem: "api" | "manual" = "api",
): Promise<number> {
  if (metricas.length === 0) return 0;
  const linhas = metricas.map((m) => ({
    clientId,
    externalPostId: m.externalPostId,
    alcance: m.alcance,
    curtidas: m.curtidas,
    comentarios: m.comentarios,
    salvamentos: m.salvamentos,
    compartilham: m.compartilham,
    cliques: m.cliques,
    lidoEm: m.lidoEm,
    origem,
  }));
  const r = await prisma.metricaDePost.createMany({ data: linhas }).catch(() => null);
  return r?.count ?? 0;
}

/** Soma só o que foi medido. Devolve `null` quando NADA foi — porque somar
 *  ausências como zero transforma "não sei" em "não teve", que é a mentira mais
 *  fácil de cometer com número. */
function somarMedidos(...valores: Array<number | null>): number | null {
  const medidos = valores.filter((v): v is number => typeof v === "number");
  return medidos.length === 0 ? null : medidos.reduce((a, b) => a + b, 0);
}

/**
 * O desempenho de cada post do cliente, da leitura mais recente de cada um.
 *
 * Post sem nenhuma métrica medida NÃO entra no ranking. Ele aparece na lista de
 * `semMedicao`, porque "não medido" e "foi mal" são coisas diferentes, e tratar
 * as duas igual faz a agência aprender a lição errada.
 */
export async function desempenhoDoCliente(clientId: string): Promise<{
  ranking: Desempenho[];
  semMedicao: string[];
}> {
  const linhas = await prisma.metricaDePost.findMany({
    where: { clientId },
    orderBy: { lidoEm: "desc" },
    take: 500,
  }).catch(() => []);

  // A leitura MAIS RECENTE de cada post. Vem ordenado desc, então o primeiro de
  // cada id já é o mais novo.
  const maisRecente = new Map<string, (typeof linhas)[number]>();
  for (const l of linhas) {
    if (!maisRecente.has(l.externalPostId)) maisRecente.set(l.externalPostId, l);
  }

  const ranking: Desempenho[] = [];
  const semMedicao: string[] = [];

  for (const l of maisRecente.values()) {
    const interacoes = somarMedidos(l.curtidas, l.comentarios, l.salvamentos, l.compartilham, l.cliques);
    if (interacoes === null && l.alcance === null) {
      semMedicao.push(l.externalPostId);
      continue;
    }
    ranking.push({
      externalPostId: l.externalPostId,
      interacoes,
      alcance: l.alcance,
      taxa: interacoes !== null && l.alcance !== null && l.alcance > 0 ? interacoes / l.alcance : null,
      lidoEm: l.lidoEm,
    });
  }

  // Ordena pela TAXA quando ela existe, e por interações quando não. Post com
  // taxa nunca perde para post sem taxa por falta de dado: quem não tem taxa vai
  // para o fim, declarado, em vez de ser comparado com o que não é comparável.
  ranking.sort((a, b) => {
    if (a.taxa !== null && b.taxa !== null) return b.taxa - a.taxa;
    if (a.taxa !== null) return -1;
    if (b.taxa !== null) return 1;
    return (b.interacoes ?? 0) - (a.interacoes ?? 0);
  });

  return { ranking, semMedicao };
}

/** Quantas leituras a casa tem deste cliente. É o número que decide se vale
 *  tirar conclusão: três posts medidos não sustentam "o que funciona nesta
 *  conta", e a tela precisa poder dizer isso. */
export const MINIMO_PARA_CONCLUIR = 10;

export async function podeConcluirAlgo(clientId: string): Promise<{ pode: boolean; medidos: number; falta: number }> {
  const { ranking } = await desempenhoDoCliente(clientId);
  const medidos = ranking.length;
  return {
    pode: medidos >= MINIMO_PARA_CONCLUIR,
    medidos,
    falta: Math.max(0, MINIMO_PARA_CONCLUIR - medidos),
  };
}
