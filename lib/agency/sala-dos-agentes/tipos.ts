// A SALA DOS AGENTES — o contrato de dados.
//
// Doutrina 20 do `dioli-brain-kit` (`docs/20-sala-dos-agentes.md`), adotada por
// ordem do CEO em 07/08/2026. A pergunta que esta tela responde, nas palavras
// dele: *"quais os agentes cada projeto tem, quem está sendo usado, quem não
// está usando."*
//
// ─── A REGRA QUE FAZ ESTA TELA VALER ALGUMA COISA ────────────────────────────
//
//   O cartão NUNCA escreve zero quando a resposta é "não sei".
//
// "Não medido" e "trabalhou zero" são coisas diferentes. Um painel que confunde
// as duas ensina o dono a não confiar nele — e a partir daí a tela existe e não
// serve. É o guardrail 1 da companhia (ausência de informação não é informação)
// aplicado a pixel.
//
// Por isso NÃO existe `number` cru neste arquivo para nada que possa não ter
// sido medido. Existe `Medida`, que é uma união de três casos e obriga a tela a
// tratar os três. Trocar isto por `number | null` reabre o buraco: `null` vira
// `?? 0` no primeiro `.tsx` distraído.

/**
 * Um número que pode não existir — e a diferença entre "não existe instrumentação"
 * e "existe instrumentação e o valor é zero" é carregada no tipo, não na tela.
 *
 * | caso           | significado                                  | como aparece   |
 * |----------------|----------------------------------------------|----------------|
 * | `medido`       | o banco prova                                | o valor, tabular |
 * | `naoMedido`    | não existe instrumentação para isto          | itálico, secundário |
 * | `zeroMedido`   | existe instrumentação e o valor é zero       | um traço `—`   |
 */
export type Medida =
  | { estado: "medido"; valor: number }
  | { estado: "zeroMedido" }
  /** `porque` é obrigatório: "não medido" sem motivo vira desculpa permanente. */
  | { estado: "naoMedido"; porque: string };

export const medido = (valor: number): Medida =>
  valor === 0 ? { estado: "zeroMedido" } : { estado: "medido", valor };

export const naoMedido = (porque: string): Medida => ({ estado: "naoMedido", porque });

/**
 * As duas populações de agente. Confundi-las produz número sem sentido: somar
 * "custo" de quem não gasta com "blocos" de quem não fala com cliente dá um
 * total que não significa nada. Por isso a tela as separa com rótulo.
 */
export type Populacao =
  /** Rodam em produção e consomem IA paga. A medida certa é dinheiro e token. */
  | "fala_com_cliente"
  /** Os especialistas de `.claude/agents/`. A medida certa é bloco entregue. */
  | "constroi_o_produto";

/** Um ponto no cartão. `desligado` NÃO é o mesmo que `nao_medido`. */
export type EstadoDoAgente = "trabalhando" | "atencao" | "desligado" | "nao_medido";

/** Os cinco Essenciais não podem ser apagados de projeto nenhum (doutrina 21). */
export type Vinculo = "essencial" | "dominio";

export interface CartaoDeAgente {
  /** O que aparece em fonte mono. É ele que aparece no código. */
  slug: string;
  nome: string;
  /** Uma etiqueta. Ex.: "Essencial", "Plataforma", "Design". */
  area: string;
  /** Uma frase, em linguagem de dono, não de engenheiro. */
  funcao: string;
  populacao: Populacao;
  vinculo: Vinculo;
  estado: EstadoDoAgente;
  /** ISO 8601. `null` quando a data de entrada no projeto não é conhecida —
   *  e `null` obriga a tela a dizer "não registrado", nunca a inventar hoje. */
  noArDesde: string | null;
  /** Só leitura ou escreve? Vira etiqueta no cartão: `qualidade` e `experiencia`
   *  são somente leitura POR CONSTRUÇÃO, e o dono precisa ver isso. */
  somenteLeitura: boolean;
  /** Onde a constituição/perfil dele mora. Regra não se copia, se aponta. */
  perfil: string;

  // ── QUANTO TRABALHOU ───────────────────────────────────────────────────────
  /** Chamadas de IA registradas em `AIRunLog` para este agente. */
  chamadas: Medida;
  /** Blocos assinados na `oficina.md` dele. */
  blocos: Medida;
  /** Tokens somados (entrada + saída). */
  tokens: Medida;
  /** USD ESTIMADO — nunca a fatura. `naoMedido` quando o modelo está fora da
   *  tabela de preço: modelo desconhecido não cai em preço padrão. */
  custoUsd: Medida;
  /** ISO 8601 do último trabalho registrado, ou `null` para "nunca registrado". */
  ultimoTrabalho: string | null;
}

/** Uma IA contratada, na aba Configurações. */
export interface CartaoDeProvedor {
  id: string;
  nome: string;
  /** `null` = não conseguimos verificar. NÃO é `false`. */
  ligado: boolean | null;
  paraQue: string;
  /** Gasto estimado dos últimos 30 dias. */
  custo30dUsd: Medida;
  chamadas30d: Medida;
  /** Slugs de quem usou este provedor nos últimos 30 dias. Lista vazia com
   *  `chamadas30d` medido em zero significa "ninguém usou"; lista vazia com
   *  `chamadas30d` não medido significa "não sabemos". */
  usadoPor: string[];
  /** Modelos vistos no período que NÃO estão na tabela de preço. Quando há
   *  algum, o custo do cartão está subestimado e a tela é obrigada a dizê-lo. */
  modelosSemPreco: string[];
}

export interface SalaDosAgentes {
  agentes: CartaoDeAgente[];
  provedores: CartaoDeProvedor[];
  /** A versão da tabela de preço usada. A tela é OBRIGADA a dizer "estimativa". */
  tabelaDePrecoVersao: string;
  /** O que esta sala NÃO consegue medir hoje, em linguagem de dono. A tela
   *  mostra isto; sala que esconde a própria lacuna é a tela que mente. */
  lacunas: string[];
  geradoEm: string;
}
