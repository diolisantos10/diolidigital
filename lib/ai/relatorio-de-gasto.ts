// QUANTO A AGÊNCIA GASTOU COM IA — o leitor do `AIRunLog`.
//
// Existe para que a instrumentação do log não repita o defeito que ela veio
// consertar: estado gravado que ninguém lê. Cada coluna nova do `AIRunLog` tem
// um leitor nomeado aqui, e este módulo tem um leitor nomeado na rota
// `/api/agency/gasto-de-ia`, que a tela de Integrações mostra.
//
// ─── O QUE ESTE RELATÓRIO NÃO É ──────────────────────────────────────────────
//
// Não é a fatura. É a soma de estimativas por preço de tabela — ver
// `lib/ai/precos.ts`. Por isso ele devolve, sempre e junto do total:
//
//   • `chamadasSemPreco`  — quantas chamadas o modelo não estava na tabela;
//   • `chamadasSemToken`  — quantas o provedor não devolveu `usage`;
//   • `aviso`             — o texto que a tela é obrigada a repetir.
//
// Um total sem esses três números diria "gastamos US$ X" quando a frase honesta
// é "gastamos pelo menos US$ X, e N chamadas ficaram de fora da conta".

import { prisma } from "@/lib/db/client";
import { AVISO_DE_ESTIMATIVA, TABELA_VERSAO } from "@/lib/ai/precos";

export interface LinhaDeGasto {
  chave: string;
  rotulo: string;
  chamadas: number;
  sucessos: number;
  falhas: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  chamadasSemPreco: number;
}

export interface RelatorioDeGasto {
  desde: string;
  ate: string;
  totalChamadas: number;
  totalSucessos: number;
  totalFalhas: number;
  totalTokensEntrada: number;
  totalTokensSaida: number;
  /** Soma das estimativas. NUNCA apresentado sem `chamadasSemPreco` ao lado. */
  totalUsd: number;
  chamadasSemPreco: number;
  chamadasSemToken: number;
  porCliente: LinhaDeGasto[];
  porProvedor: LinhaDeGasto[];
  porDepartamento: LinhaDeGasto[];
  /** Versões de tabela de preço presentes na janela. Mais de uma = o total foi
   *  calculado com réguas diferentes, e quem lê precisa saber. */
  tabelasUsadas: string[];
  tabelaAtual: string;
  aviso: string;
  /** `true` quando não há UMA linha na janela. A tela diz "nada medido ainda"
   *  em vez de mostrar US$ 0,00 — que afirmaria que a agência não gastou nada. */
  vazio: boolean;
}

function acumular(
  mapa: Map<string, LinhaDeGasto>,
  chave: string,
  rotulo: string,
  linha: { status: string; tokensEntrada: number | null; tokensSaida: number | null; custoEstimadoUsd: number | null },
) {
  let l = mapa.get(chave);
  if (!l) {
    l = { chave, rotulo, chamadas: 0, sucessos: 0, falhas: 0, tokensEntrada: 0, tokensSaida: 0, custoUsd: 0, chamadasSemPreco: 0 };
    mapa.set(chave, l);
  }
  l.chamadas++;
  if (linha.status === "success") l.sucessos++; else l.falhas++;
  l.tokensEntrada += linha.tokensEntrada ?? 0;
  l.tokensSaida += linha.tokensSaida ?? 0;
  if (linha.custoEstimadoUsd == null) l.chamadasSemPreco++;
  else l.custoUsd += linha.custoEstimadoUsd;
}

function ordenar(mapa: Map<string, LinhaDeGasto>): LinhaDeGasto[] {
  return [...mapa.values()]
    .map((l) => ({ ...l, custoUsd: Math.round(l.custoUsd * 1_000_000) / 1_000_000 }))
    .sort((a, b) => b.custoUsd - a.custoUsd || b.chamadas - a.chamadas);
}

/**
 * O gasto da janela. `dias` fixo e curto por padrão porque a pergunta operacional
 * é "quanto estou gastando AGORA" — o histórico longo é outra conversa e outra
 * consulta.
 */
export async function relatorioDeGasto(workspaceId: string, dias = 30): Promise<RelatorioDeGasto> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60_000);

  const linhas = await prisma.aIRunLog.findMany({
    where: { workspaceId, createdAt: { gte: desde } },
    select: {
      clientId: true, departmentId: true, provider: true, model: true, status: true,
      tokensEntrada: true, tokensSaida: true, custoEstimadoUsd: true, custoTabela: true,
    },
  }).catch(() => [] as Array<{
    clientId: string | null; departmentId: string; provider: string; model: string; status: string;
    tokensEntrada: number | null; tokensSaida: number | null; custoEstimadoUsd: number | null; custoTabela: string | null;
  }>);

  // Nome do cliente vem do banco, não do log: log guarda id, e id não é nome de
  // gente nenhuma na tela.
  const ids = [...new Set(linhas.map((l) => l.clientId).filter((x): x is string => !!x))];
  const clientes = ids.length
    ? await prisma.client.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true } }).catch(() => [])
    : [];
  const nomeDoCliente = new Map(clientes.map((c) => [c.id, c.name]));

  const porCliente = new Map<string, LinhaDeGasto>();
  const porProvedor = new Map<string, LinhaDeGasto>();
  const porDepartamento = new Map<string, LinhaDeGasto>();
  const tabelas = new Set<string>();

  let totalUsd = 0, semPreco = 0, semToken = 0, sucessos = 0, entrada = 0, saida = 0;

  for (const l of linhas) {
    if (l.custoEstimadoUsd == null) semPreco++; else totalUsd += l.custoEstimadoUsd;
    if (l.tokensEntrada == null && l.tokensSaida == null) semToken++;
    if (l.status === "success") sucessos++;
    entrada += l.tokensEntrada ?? 0;
    saida += l.tokensSaida ?? 0;
    if (l.custoTabela) tabelas.add(l.custoTabela);

    acumular(porCliente, l.clientId ?? "(sem cliente)", l.clientId ? nomeDoCliente.get(l.clientId) ?? l.clientId : "Sem cliente — trabalho interno da agência", l);
    acumular(porProvedor, `${l.provider}/${l.model}`, `${l.provider} · ${l.model}`, l);
    acumular(porDepartamento, l.departmentId, l.departmentId, l);
  }

  return {
    desde: desde.toISOString(),
    ate: new Date().toISOString(),
    totalChamadas: linhas.length,
    totalSucessos: sucessos,
    totalFalhas: linhas.length - sucessos,
    totalTokensEntrada: entrada,
    totalTokensSaida: saida,
    totalUsd: Math.round(totalUsd * 1_000_000) / 1_000_000,
    chamadasSemPreco: semPreco,
    chamadasSemToken: semToken,
    porCliente: ordenar(porCliente),
    porProvedor: ordenar(porProvedor),
    porDepartamento: ordenar(porDepartamento),
    tabelasUsadas: [...tabelas].sort(),
    tabelaAtual: TABELA_VERSAO,
    aviso: AVISO_DE_ESTIMATIVA,
    vazio: linhas.length === 0,
  };
}
