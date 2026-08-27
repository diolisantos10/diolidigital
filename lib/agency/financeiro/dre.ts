// O DEPARTAMENTO FINANCEIRO — o DRE da agência.
//
// ─── O PEDIDO, COM AS PALAVRAS DO CEO (07/08/2026) ───────────────────────────
//
//   "Em tese todos os projetos são de autoria da Dioli Digital. Então todos os
//    custos de todos os projetos, e também o faturamento, tudo, eu vou colocar
//    dentro do financeiro da agência. […] quem mede tudo em relação a dinheiro
//    vai ser o departamento de finanças — inclusive quem vai medir quanto cada
//    IA gasta."
//
// Duas perguntas ao mesmo tempo, e é isso que decide o formato desta tela:
// **"como está a agência?"** (o consolidado) e **"este projeto se paga?"** (a
// linha por centro de custo). Média esconde o projeto que consome mais IA do
// que fatura; por isso o consolidado NUNCA aparece sem a lista aberta ao lado.
//
// ─── AS QUATRO REGRAS QUE DECIDEM SE ESTE ARQUIVO VALE ALGUMA COISA ──────────
//
//  1. **Zero ≠ não sei.** Todo valor deste módulo é `Dinheiro`, que tem três
//     estados: um número medido, `nao_medido` (ninguém mediu) e `nao_lancado`
//     (a janela está vazia). Nenhum deles vira `0` no caminho. Painel que
//     confunde "custou zero" com "não medido" ensina o dono a não confiar nele
//     — e em dinheiro isso custa uma decisão, não uma dúvida.
//  2. **Todo número carrega procedência.** `Dinheiro.origem` diz de onde veio:
//     registro de chamada de IA, lançamento manual, contrato, extrato.
//  3. **Ausência de informação não é informação.** Custo de IA em USD sem
//     câmbio declarado NÃO é convertido para o DRE em reais — ele aparece na
//     própria moeda, com a ressalva. Inventar a taxa é inventar o resultado.
//  4. **Estimado nunca se soma com realizado sem rótulo.** São duas somas.
//
// ─── O HISTÓRICO NÃO VOLTA ───────────────────────────────────────────────────
//
// Até 07/08/2026, 22 das 32 chamadas de IA do repositório não declaravam o
// agente (ver `lib/ai/donos.ts`). O que ficou gravado antes desta data mede uma
// fração desconhecida do gasto. **Não se extrapola o passado**: período
// anterior a `MEDICAO_DE_IA_COMPLETA_DESDE` sai marcado como parcial, com a
// data, e a tela mostra a marca. Corrigir para trás por regra de três seria
// inventar o número mais perigoso da casa.

import { prisma } from "@/lib/db/client";
import { donoDaChamada } from "@/lib/ai/donos";

/**
 * A partir de quando a medição de custo de IA cobre TODAS as chamadas.
 *
 * Data do commit que tornou `agentId` obrigatório em `generate()`. Antes disso
 * o número existe, mas é uma amostra de tamanho desconhecido.
 */
export const MEDICAO_DE_IA_COMPLETA_DESDE = new Date("2026-08-07T00:00:00.000Z");

// ─── Dinheiro ────────────────────────────────────────────────────────────────
//
// O vocabulário mudou de casa em 27/08/2026 (`dinheiro.ts`) e é REEXPORTADO
// daqui para que nenhum chamador antigo precise mudar. O motivo da mudança está
// no cabeçalho de lá: importar a palavra "não medido" arrastava o roster de
// agentes junto, e isso fechou um ciclo de import quando a tabela de preços
// entrou no caminho do SDR.

export {
  medido, emReais, somar, subtrair,
  type Dinheiro, type OrigemDoNumero,
} from "@/lib/agency/financeiro/dinheiro";

import { medido, emReais, somar, subtrair, type Dinheiro, type OrigemDoNumero } from "@/lib/agency/financeiro/dinheiro";

// ─── O período ────────────────────────────────────────────────────────────────

export interface Periodo {
  /** `YYYY-MM`. */
  referencia: string;
  inicio: Date;
  fim: Date;
}

export function mesDeReferencia(referencia: string): Periodo {
  const [ano, mes] = referencia.split("-").map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) throw new Error(`referência inválida: "${referencia}" (esperado YYYY-MM)`);
  return {
    referencia,
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    fim: new Date(Date.UTC(ano, mes, 1)),
  };
}

// ─── O custo de IA: a pergunta que o CEO fez ──────────────────────────────────

export interface CustoDeIa {
  /** Total do período, em USD. `nao_medido` quando nenhuma chamada tem preço. */
  total: Dinheiro;
  chamadas: number;
  /** Chamadas cujo custo o motor NÃO conseguiu estimar (modelo fora da tabela,
   *  provedor sem `usage`). NÃO entram como zero — entram como este número. */
  chamadasSemPreco: number;
  /** Chamadas gravadas sem dono. Deve ser 0 daqui para a frente; se não for, é
   *  buraco novo e a tela precisa gritar. */
  chamadasSemDono: number;
  /** A janela pedida cobre período anterior à cobertura completa? */
  periodoParcial: boolean;
  porAgente: LinhaDeCusto[];
  porCliente: LinhaDeCusto[];
  porDepartamento: LinhaDeCusto[];
}

export interface LinhaDeCusto {
  id: string;
  label: string;
  valor: Dinheiro;
  chamadas: number;
  chamadasSemPreco: number;
}

interface LinhaCrua {
  agentId: string | null;
  clientId: string | null;
  departmentId: string;
  custoEstimadoUsd: number | null;
}

/** Agrupa mantendo separado o que foi medido do que não teve preço. */
function agrupar(
  linhas: LinhaCrua[],
  chave: (l: LinhaCrua) => { id: string; label: string },
): LinhaDeCusto[] {
  const mapa = new Map<string, LinhaDeCusto>();
  for (const l of linhas) {
    const { id, label } = chave(l);
    const atual = mapa.get(id) ?? { id, label, valor: { estado: "nao_lancado", motivo: "sem chamada com preço" } as Dinheiro, chamadas: 0, chamadasSemPreco: 0 };
    atual.chamadas += 1;
    if (l.custoEstimadoUsd === null || l.custoEstimadoUsd === undefined) {
      atual.chamadasSemPreco += 1;
    } else {
      const centavos = Math.round(l.custoEstimadoUsd * 100);
      atual.valor = atual.valor.estado === "medido"
        ? { ...atual.valor, centavos: atual.valor.centavos + centavos }
        : medido(centavos, "registro_de_ia", "USD");
    }
    mapa.set(id, atual);
  }
  return [...mapa.values()].sort((a, b) => {
    const va = a.valor.estado === "medido" ? a.valor.centavos : -1;
    const vb = b.valor.estado === "medido" ? b.valor.centavos : -1;
    return vb - va;
  });
}

export async function custoDeIaNoPeriodo(
  workspaceId: string,
  periodo: Periodo,
  nomeDoCliente: (clientId: string) => string = (id) => id,
): Promise<CustoDeIa> {
  const linhas = (await prisma.aIRunLog
    .findMany({
      where: { workspaceId, createdAt: { gte: periodo.inicio, lt: periodo.fim } },
      select: { agentId: true, clientId: true, departmentId: true, custoEstimadoUsd: true },
    })
    .catch(() => null)) as LinhaCrua[] | null;

  if (linhas === null) {
    // Falha de LEITURA não é o FATO "não gastou nada". Esta é a lição de 07/08
    // (`.catch(() => null)` virando afirmação falsa) aplicada a dinheiro.
    return {
      total: { estado: "nao_medido", motivo: "não consegui ler o registro de chamadas de IA" },
      chamadas: 0, chamadasSemPreco: 0, chamadasSemDono: 0,
      periodoParcial: periodo.inicio < MEDICAO_DE_IA_COMPLETA_DESDE,
      porAgente: [], porCliente: [], porDepartamento: [],
    };
  }

  const comPreco = linhas.filter((l) => l.custoEstimadoUsd !== null && l.custoEstimadoUsd !== undefined);
  const total: Dinheiro = linhas.length === 0
    ? { estado: "nao_lancado", motivo: "nenhuma chamada de IA neste período" }
    : comPreco.length === 0
      ? { estado: "nao_medido", motivo: `${linhas.length} chamadas, nenhuma com preço estimável (modelo fora da tabela de preços)` }
      : medido(Math.round(comPreco.reduce((s, l) => s + (l.custoEstimadoUsd ?? 0), 0) * 100), "registro_de_ia", "USD");

  return {
    total,
    chamadas: linhas.length,
    chamadasSemPreco: linhas.length - comPreco.length,
    chamadasSemDono: linhas.filter((l) => !l.agentId).length,
    periodoParcial: periodo.inicio < MEDICAO_DE_IA_COMPLETA_DESDE,
    porAgente: agrupar(linhas, (l) => ({
      id: l.agentId ?? "sem-dono",
      label: l.agentId ? donoDaChamada(l.agentId)?.label ?? l.agentId : "SEM DONO DECLARADO",
    })),
    porCliente: agrupar(linhas, (l) => ({
      id: l.clientId ?? "sem-cliente",
      // "sem cliente" é resposta legítima (triagem de lead, radar, console) e
      // precisa aparecer separada — não diluída no rateio dos clientes.
      label: l.clientId ? nomeDoCliente(l.clientId) : "Casa (sem cliente)",
    })),
    porDepartamento: agrupar(linhas, (l) => ({ id: l.departmentId, label: l.departmentId })),
  };
}

// ─── O DRE ────────────────────────────────────────────────────────────────────

export interface LinhaDoDre {
  id: string;
  label: string;
  valor: Dinheiro;
  /** Em uma frase, de onde saiu este número. Vai para a tela, não para o log. */
  procedencia: string;
}

export interface Dre {
  periodo: Periodo;
  receita: LinhaDoDre;
  custoDireto: LinhaDoDre;
  despesa: LinhaDoDre;
  resultado: LinhaDoDre;
  /** Realizado e estimado, SEMPRE separados. */
  receitaEstimada: LinhaDoDre;
  custoDeIa: CustoDeIa;
  /** O que esta tela NÃO sabe. Vai para a tela inteira, em vermelho. */
  ressalvas: string[];
}

/** Categorias que são custo DIRETO da entrega (variam com o volume de trabalho). */
const CATEGORIAS_DIRETAS = new Set(["ia", "midia", "producao", "projeto"]);

export interface LancamentoLido {
  tipo: string;
  categoria: string;
  valorCentavos: number;
  moeda: string;
  origem: string;
  natureza: string;
}

function somaDe(lancamentos: LancamentoLido[], rotuloVazio: string): Dinheiro {
  if (lancamentos.length === 0) return { estado: "nao_lancado", motivo: rotuloVazio };
  const moedas = new Set(lancamentos.map((l) => l.moeda));
  if (moedas.size > 1) return { estado: "nao_medido", motivo: "lançamentos em moedas diferentes, sem câmbio declarado" };
  const origens = new Set(lancamentos.map((l) => l.origem));
  return medido(
    lancamentos.reduce((s, l) => s + l.valorCentavos, 0),
    origens.size === 1 ? ([...origens][0] as OrigemDoNumero) : "derivado",
    ([...moedas][0] as "BRL" | "USD") ?? "BRL",
  );
}

export async function montarDre(
  workspaceId: string,
  periodo: Periodo,
  nomeDoCliente: (clientId: string) => string = (id) => id,
): Promise<Dre> {
  const lidos = (await prisma.lancamentoFinanceiro
    .findMany({
      where: { workspaceId, competencia: { gte: periodo.inicio, lt: periodo.fim } },
      select: { tipo: true, categoria: true, valorCentavos: true, moeda: true, origem: true, natureza: true },
    })
    .catch(() => null)) as LancamentoLido[] | null;

  const ressalvas: string[] = [];
  const custoDeIa = await custoDeIaNoPeriodo(workspaceId, periodo, nomeDoCliente);

  if (lidos === null) {
    ressalvas.push("Não consegui ler o livro de lançamentos — os valores abaixo NÃO são zero, são desconhecidos.");
  }
  const lancamentos = lidos ?? [];
  const realizados = lancamentos.filter((l) => l.natureza === "realizado");
  const estimados = lancamentos.filter((l) => l.natureza === "estimado");

  const naoLido: Dinheiro = { estado: "nao_medido", motivo: "livro de lançamentos indisponível" };

  const receita: LinhaDoDre = {
    id: "receita", label: "Receita",
    valor: lidos === null ? naoLido : somaDe(realizados.filter((l) => l.tipo === "receita"), "nenhum faturamento lançado neste mês"),
    procedencia: "lançamentos de receita realizados (manual, contrato ou extrato)",
  };
  const receitaEstimada: LinhaDoDre = {
    id: "receita-estimada", label: "Receita ESTIMADA (não realizada)",
    valor: lidos === null ? naoLido : somaDe(estimados.filter((l) => l.tipo === "receita"), "nenhuma receita estimada lançada"),
    procedencia: "lançamentos marcados como estimativa — NÃO somados ao resultado",
  };
  const custoDireto: LinhaDoDre = {
    id: "custo-direto", label: "Custo direto",
    valor: lidos === null ? naoLido : somaDe(realizados.filter((l) => l.tipo === "custo" && CATEGORIAS_DIRETAS.has(l.categoria)), "nenhum custo direto lançado"),
    procedencia: "lançamentos de custo nas categorias IA, mídia, produção e projeto",
  };
  const despesa: LinhaDoDre = {
    id: "despesa", label: "Despesa",
    valor: lidos === null ? naoLido : somaDe(realizados.filter((l) => l.tipo === "custo" && !CATEGORIAS_DIRETAS.has(l.categoria)), "nenhuma despesa lançada"),
    procedencia: "lançamentos de custo nas demais categorias (ferramenta, pessoal, imposto, outro)",
  };

  const resultado: LinhaDoDre = {
    id: "resultado", label: "Resultado",
    valor: subtrair(
      { rotulo: "receita", valor: receita.valor },
      { rotulo: "custos e despesas", valor: somar([{ rotulo: "custo direto", valor: custoDireto.valor }, { rotulo: "despesa", valor: despesa.valor }]) },
    ),
    procedencia: "receita realizada − (custo direto + despesa). NÃO inclui o custo de IA — ver ressalva.",
  };

  // ── A ressalva do câmbio, que é o furo honesto desta versão ────────────────
  // O custo de IA é medido em USD (é o que o provedor cobra). Converter para
  // reais exige uma taxa que ninguém declarou nesta casa. Escolher uma taxa por
  // conta própria mudaria o RESULTADO — o número mais consequente da tela —
  // por um chute. Então ele aparece na própria moeda, fora da subtração, e a
  // tela diz isso com todas as letras.
  if (custoDeIa.total.estado === "medido") {
    ressalvas.push(`O custo de IA (${emReais(custoDeIa.total)}) está em dólar e NÃO entra no resultado acima: não há câmbio declarado nesta casa. Lance-o como custo em reais para incluí-lo.`);
  }
  if (custoDeIa.periodoParcial) {
    ressalvas.push(`Período anterior a 07/08/2026: a medição de custo de IA cobria só parte das chamadas (22 dos 32 pontos de chamada não declaravam o agente). O número deste período é uma amostra de tamanho desconhecido, e o histórico NÃO foi recalculado.`);
  }
  if (custoDeIa.chamadasSemPreco > 0) {
    ressalvas.push(`${custoDeIa.chamadasSemPreco} de ${custoDeIa.chamadas} chamadas de IA sem preço estimável (modelo fora da tabela). Elas contam como chamada e NÃO como custo zero.`);
  }
  if (custoDeIa.chamadasSemDono > 0) {
    ressalvas.push(`${custoDeIa.chamadasSemDono} chamadas de IA gravadas SEM dono. Depois de 07/08/2026 isso é buraco novo — a trava de \`lib/ai/donos.ts\` deveria impedir.`);
  }
  if (receita.valor.estado === "nao_lancado") {
    ressalvas.push("Nenhum faturamento lançado neste mês. Isto quer dizer 'ninguém lançou', não 'a agência não faturou'.");
  }

  return { periodo, receita, receitaEstimada, custoDireto, despesa, resultado, custoDeIa, ressalvas };
}

// ─── "Este projeto se paga?" ──────────────────────────────────────────────────

export interface LinhaDeProjeto {
  id: string;
  label: string;
  receita: Dinheiro;
  custo: Dinheiro;
  /** Custo de IA em USD, separado porque não é conversível sem câmbio. */
  custoDeIaUsd: Dinheiro;
  chamadasDeIa: number;
  resultado: Dinheiro;
  /**
   * A PARCERIA, quando este centro de custo é um parceiro com isenção VIVA.
   *
   * Ordem do CEO (D-0B9): *"Tudo tem que ser medido, inclusive as parcerias."*
   * Sem este campo a linha do parceiro era indistinguível da do caloteiro: as
   * duas apareciam como "nada lançado". Aqui a receita vira R$ 0,00 de origem
   * `parceria`, o custo continua contado normalmente, e a margem negativa fica
   * visível COM O NOME de quem autorizou o investimento.
   *
   * Ausente = não é parceria. Nunca use a ausência para concluir que é.
   */
  parceria?: { autorizadaPor: string; validaAte: Date; escopo: string };
}

/**
 * Uma linha por centro de custo: cliente, projeto da casa, ou "sem dono".
 *
 * Existe para a segunda pergunta do CEO — "este projeto se paga?". Um projeto
 * que consome mais IA do que fatura precisa APARECER, e média não mostra isso.
 */
export async function porProjeto(
  workspaceId: string,
  periodo: Periodo,
  nomeDoCliente: (clientId: string) => string = (id) => id,
  /**
   * Converte um centro de custo ESCRITO À MÃO ("CityJobs") no `clientId`
   * correspondente, quando existe exatamente um cliente com esse nome.
   *
   * Existe por causa de um defeito pego na primeira captura desta tela: um
   * lançamento com `centroDeCusto: "CityJobs"` e outro com o `clientId` do
   * cliente chamado CityJobs viravam DUAS linhas com o mesmo nome — e "este
   * projeto se paga?" respondida em dois pedaços não é resposta. Item repetido
   * na lista é bug de dados, não de tela (DESIGN.md §7.7).
   *
   * Devolve `null` quando o nome é ambíguo (dois clientes homônimos) ou não
   * casa com ninguém. Nesses casos a linha fica separada: fundir dois clientes
   * distintos porque o nome bate seria pior que mostrar duas linhas.
   */
  idDoCentroDeCusto: (centro: string) => string | null = () => null,
): Promise<LinhaDeProjeto[]> {
  const lancamentos = (await prisma.lancamentoFinanceiro
    .findMany({
      where: { workspaceId, competencia: { gte: periodo.inicio, lt: periodo.fim }, natureza: "realizado" },
      select: { tipo: true, valorCentavos: true, moeda: true, origem: true, clientId: true, centroDeCusto: true },
    })
    .catch(() => [])) as Array<{ tipo: string; valorCentavos: number; moeda: string; origem: string; clientId: string | null; centroDeCusto: string | null }>;

  const ia = await custoDeIaNoPeriodo(workspaceId, periodo, nomeDoCliente);

  // ─── AS PARCERIAS VIVAS ───────────────────────────────────────────────────
  // Só as VÁLIDAS no fim do período: uma isenção vencida não explica mais um
  // R$ 0, e apresentá-la como se explicasse esconderia justamente o mês em que
  // a casa continuou produzindo de graça depois do combinado.
  //
  // Leitura que falha NÃO vira "não há parceria": vira mapa vazio E a linha
  // segue como estava (`nao_lancado`), que é o estado conservador — dizer "R$ 0
  // por parceria" sem ter lido a parceria seria inventar a autorização.
  const parcerias = new Map<string, { autorizadaPor: string; validaAte: Date; escopo: string }>();
  try {
    const vivas = (await prisma.isencaoDeParceria.findMany({
      where: { validaAte: { gte: periodo.inicio } },
      select: { clientId: true, autorizadaPor: true, validaAte: true, escopo: true },
    })) as Array<{ clientId: string | null; autorizadaPor: string; validaAte: Date; escopo: string }>;
    for (const v of vivas) {
      // ⚠️ DEFESA EM PROFUNDIDADE, e ela NÃO é load-bearing hoje — está escrito
      // porque a mutação que a remove SOBREVIVEU à suíte, e ponto fraco
      // silencioso é armadilha. Hoje um `clientId` nulo viraria uma chave que
      // `parcerias.get(id)` nunca casa, então remover esta linha não muda
      // nada. Ela existe para o dia em que a chave passar a ter um padrão
      // (`v.clientId ?? "sem-centro-de-custo"`): aí a isenção órfã grudaria na
      // linha do vala-comum e explicaria um R$ 0 que não é dela.
      if (!v.clientId) continue;
      parcerias.set(v.clientId, { autorizadaPor: v.autorizadaPor, validaAte: v.validaAte, escopo: v.escopo });
    }
  } catch {
    // mapa vazio — ver o comentário acima
  }

  const chaves = new Map<string, string>();
  const chaveDe = (clientId: string | null, centro: string | null) => {
    // O centro de custo escrito à mão é resolvido para o cliente ANTES de virar
    // chave — senão o mesmo projeto abre duas linhas.
    const donoReal = clientId ?? (centro ? idDoCentroDeCusto(centro) : null);
    const id = donoReal ?? centro ?? "sem-centro-de-custo";
    const label = donoReal ? nomeDoCliente(donoReal) : centro ?? "Sem centro de custo declarado";
    chaves.set(id, label);
    return id;
  };

  const receitas = new Map<string, number>();
  const custos = new Map<string, number>();
  for (const l of lancamentos) {
    const k = chaveDe(l.clientId, l.centroDeCusto);
    const alvo = l.tipo === "receita" ? receitas : custos;
    alvo.set(k, (alvo.get(k) ?? 0) + l.valorCentavos);
  }
  for (const linha of ia.porCliente) {
    chaves.set(linha.id === "sem-cliente" ? "sem-centro-de-custo" : linha.id, linha.label);
  }

  return [...chaves.entries()].map(([id, label]) => {
    const linhaIa = ia.porCliente.find((l) => l.id === id || (id === "sem-centro-de-custo" && l.id === "sem-cliente"));
    const parceria = parcerias.get(id);
    // A receita LANÇADA vence a parceria: se entrou dinheiro deste cliente no
    // período, o fato é o dinheiro. Parceria explica a AUSÊNCIA de receita, não
    // apaga a presença dela.
    const receita: Dinheiro = receitas.has(id)
      ? medido(receitas.get(id)!, "manual")
      : parceria
        // Conhecida e igual a zero — não é "a janela está vazia".
        ? medido(0, "parceria")
        : { estado: "nao_lancado", motivo: "nenhuma receita lançada para este centro de custo no período" };
    const custo: Dinheiro = custos.has(id)
      ? medido(custos.get(id)!, "manual")
      : { estado: "nao_lancado", motivo: "nenhum custo em reais lançado para este centro de custo no período" };
    return {
      id, label, receita, custo,
      custoDeIaUsd: linhaIa?.valor ?? { estado: "nao_lancado", motivo: "nenhuma chamada de IA atribuída" },
      chamadasDeIa: linhaIa?.chamadas ?? 0,
      resultado: subtrair({ rotulo: "receita", valor: receita }, { rotulo: "custo", valor: custo }),
      // Só vai o que EXISTE: campo ausente significa "não é parceria", e é
      // assim que o leitor deve entender a ausência.
      ...(parceria ? { parceria } : {}),
    };
  }).sort((a, b) => {
    const va = a.resultado.estado === "medido" ? a.resultado.centavos : Number.MAX_SAFE_INTEGER;
    const vb = b.resultado.estado === "medido" ? b.resultado.centavos : Number.MAX_SAFE_INTEGER;
    return va - vb;   // o pior primeiro: quem dá prejuízo não pode ficar no rodapé
  });
}
