// dinheiro.ts — UM NÚMERO, OU A RAZÃO DE NÃO HAVER NÚMERO.
//
// ─── POR QUE ISTO SAIU DE `dre.ts` (27/08/2026) ─────────────────────────────
//
// Este vocabulário — `medido`, `nao_medido`, `nao_lancado`, e a soma que se
// recusa a inventar — é a doutrina financeira da casa, e ele começou a ser
// usado fora do DRE: a tabela de preços precisa dele para dizer o que sabe e o
// que não sabe sobre custo.
//
// Só que `dre.ts` importa o RELATÓRIO inteiro, e o relatório importa a lista de
// especialistas (`lib/ai/donos.ts` → `TODOS_OS_ESPECIALISTAS`). Importar a
// palavra "não medido" arrastava o roster de agentes junto — e, quando a tabela
// de preços entrou no caminho do SDR, fechou um CICLO de import: cinco arquivos
// de teste do portal quebraram com `Cannot read properties of undefined
// (reading 'map')`, que é a cara de uma dependência circular resolvendo pela
// metade.
//
// A regra que este arquivo restaura: **o vocabulário de dinheiro não depende de
// quem produz o trabalho.** Ele não importa nada da casa, de propósito — e é
// isso que o deixa ser usado em qualquer camada sem arrastar peso nem ciclo.
//
// `dre.ts` reexporta tudo daqui, então nenhum chamador antigo precisou mudar.

// ─── Dinheiro: um número, ou a razão de não haver número ──────────────────────

export type OrigemDoNumero =
  | "registro_de_ia"   // AIRunLog — chamada medida, preço da tabela da casa
  | "manual"           // alguém lançou à mão
  | "contrato"         // valor de contrato/plano assinado
  | "extrato"          // conciliação bancária
  | "importado"        // rotina automática
  | "parceria"         // R$ 0 POR DECISÃO — ver o bloco abaixo
  | "derivado";        // soma/subtração dos acima — carrega a origem mais fraca

// ─── POR QUE "parceria" É UMA ORIGEM, e não a ausência de lançamento ────────
//
// Ordem do CEO (D-0B9): *"Todo gasto tem que ser salvo, medido e contabilizado.
// Independente se é parceria ou não, porque alguém vai pagar por esse
// investimento. Tudo tem que ser medido, inclusive as parcerias."*
//
// A receita de um parceiro é **conhecida e igual a zero**. Isso não é
// `nao_lancado` — `nao_lancado` quer dizer "a janela está vazia", que o leitor
// entende como *esqueceram de lançar* ou *o cliente não pagou*. Num relatório,
// a parceria autorizada ficava idêntica ao caloteiro e ao descuido.
//
// Com origem própria, a linha diz o que é: **R$ 0,00, por parceria**, com o
// custo contado normalmente ao lado e a margem negativa à vista. *Parceria não
// é grátis: é investimento, e investimento se mede.*

export type Dinheiro =
  | { estado: "medido"; centavos: number; moeda: "BRL" | "USD"; origem: OrigemDoNumero }
  /** Ninguém mediu. Diferente de "custou zero" e diferente de "não houve". */
  | { estado: "nao_medido"; motivo: string }
  /** A janela existe e está vazia: não houve lançamento. Isto SIM é zero real. */
  | { estado: "nao_lancado"; motivo: string };

export function medido(centavos: number, origem: OrigemDoNumero, moeda: "BRL" | "USD" = "BRL"): Dinheiro {
  return { estado: "medido", centavos, moeda, origem };
}

/** Formata para a tela. Nunca devolve "R$ 0,00" para o que não foi medido. */
export function emReais(d: Dinheiro): string {
  if (d.estado === "nao_medido") return "não medido";
  if (d.estado === "nao_lancado") return "nada lançado";
  const valor = (d.centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return d.moeda === "USD" ? `US$ ${valor}` : `R$ ${valor}`;
}

/**
 * Soma que se recusa a inventar.
 *
 * Se QUALQUER parcela não foi medida, a soma não é medida — ela vira
 * `nao_medido` nomeando quem faltou. Tratar a parcela ausente como zero é
 * exatamente como um DRE passa a mentir para baixo sem ninguém errar uma conta.
 * Parcelas todas `nao_lancado` somam `nao_lancado`, que é zero de verdade.
 */
export function somar(parcelas: Array<{ rotulo: string; valor: Dinheiro }>): Dinheiro {
  const faltando = parcelas.filter((p) => p.valor.estado === "nao_medido").map((p) => p.rotulo);
  if (faltando.length) {
    return { estado: "nao_medido", motivo: `depende de ${faltando.join(", ")}, que não foi medido` };
  }
  const medidas = parcelas.filter((p) => p.valor.estado === "medido");
  if (medidas.length === 0) {
    return { estado: "nao_lancado", motivo: "nenhum lançamento no período" };
  }
  const moedas = new Set(medidas.map((p) => (p.valor as { moeda: string }).moeda));
  if (moedas.size > 1) {
    // Somar BRL com USD sem câmbio declarado produziria um número que não
    // existe em moeda nenhuma. É a regra 3 aplicada onde ela mais dói.
    return { estado: "nao_medido", motivo: "há valores em moedas diferentes e não há câmbio declarado" };
  }
  return {
    estado: "medido",
    centavos: medidas.reduce((s, p) => s + (p.valor as { centavos: number }).centavos, 0),
    moeda: [...moedas][0] as "BRL" | "USD",
    origem: "derivado",
  };
}

/** Subtração com a mesma disciplina da soma. */
export function subtrair(a: { rotulo: string; valor: Dinheiro }, b: { rotulo: string; valor: Dinheiro }): Dinheiro {
  return somar([
    a,
    {
      rotulo: b.rotulo,
      valor: b.valor.estado === "medido"
        ? { ...b.valor, centavos: -b.valor.centavos, origem: "derivado" as const }
        : b.valor,
    },
  ]);
}

