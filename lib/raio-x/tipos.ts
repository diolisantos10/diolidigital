// O RAIO-X NOTURNO — vocabulário.
//
// Protocolo obrigatório da companhia (dioli-brain-kit, `docs/16-raio-x-noturno.md`),
// criado a pedido do CEO em 05/08/2026 depois que o primeiro raio-x desta casa
// achou uma rota de imagem paga aberta na internet, uma chave-mestra do portal e
// um beco sem saída na aprovação — tudo isso estava lá havia semanas e ninguém
// tinha perguntado.
//
// AS DUAS METADES, E SEPARÁ-LAS É O PONTO:
//   1. A COLETA é código. Determinística, sem IA. IA coletando erra diferente
//      toda noite, e aí "piorou desde ontem" deixa de significar alguma coisa —
//      e a comparação com ontem é metade do valor ("37 mensagens presas" não diz
//      nada; "37, contra 4 ontem" diz tudo).
//   2. A LEITURA é uma sessão do Diretor. É lá, e só lá, que entra julgamento.
//
// Este arquivo é a metade 1. Nada aqui chama modelo de IA.

/** Os cinco padrões nomeados do kit. Pedido genérico ("veja o que dá para
 *  melhorar") volta com opinião de estilo; pedido com padrão volta com a rota
 *  aberta na internet. Por isso o padrão é um tipo fechado, não uma string. */
export type Padrao =
  /** 1 — Trabalho que existe e ninguém vê: laço que gasta e nunca falha alto. */
  | "trabalho-invisivel"
  /** 2 — Id aceito sem conferir de quem é: rota que recebe id e não prova posse. */
  | "id-sem-dono"
  /** 3 — Promessa que o código não cumpre: selo cujo valor não veio de checagem. */
  | "promessa-nao-cumprida"
  /** 4 — Estado morto: campo que uma tela escreve e nenhum leitor consome. */
  | "estado-morto"
  /** 5 — Porta aberta para a internet: rota pública encostada em motor pago. */
  | "porta-aberta";

export const PADROES: Record<Padrao, string> = {
  "trabalho-invisivel": "Trabalho que existe e ninguém vê",
  "id-sem-dono": "Id aceito sem conferir de quem é",
  "promessa-nao-cumprida": "Promessa que o código não cumpre",
  "estado-morto": "Estado morto",
  "porta-aberta": "Porta aberta para a internet",
};

/**
 * Um achado. **Todo achado carrega a própria evidência** (guardrail 6 do kit):
 * achado sem o caso concreto é ruído, e ruído ensina o CEO a não ler o relatório.
 *
 * `chave` é o identificador ESTÁVEL do achado entre noites — é ela que permite
 * dizer "isto é novo desde ontem" ou "isto sumiu". Duas noites com o mesmo
 * problema no mesmo lugar têm que produzir a mesma chave, ou a comparação mente.
 */
export type Achado = {
  padrao: Padrao;
  chave: string;
  titulo: string;
  /** O caso concreto: o número, o id, a linha. Sem isto o achado não sobe. */
  evidencia: string;
  /** Onde olhar. `arquivo:linha` quando houver linha. */
  local: string;
  /** alto = dinheiro, dado de outro inquilino ou promessa ao cliente. */
  gravidade: "alto" | "medio" | "baixo";
};

/**
 * O resultado de UMA varredura.
 *
 * `status: "cega"` é o coração do guardrail 1: **varredura que não rodou devolve
 * "não sei", nunca "está tudo bem"**. Silêncio de varredura quebrada é
 * indistinguível de silêncio de sistema saudável — e é essa confusão que mata o
 * raio-x. Uma varredura cega NUNCA entra na conta de "resolvidos".
 */
export type ResultadoDeVarredura = {
  varredura: string;
  padrao: Padrao;
  status: "rodou" | "cega";
  /** Obrigatório quando cega: por que não deu para olhar. */
  motivo?: string;
  achados: Achado[];
  /** Números que só fazem sentido comparados com ontem. */
  medidas: Record<string, number>;
};

/** Uma noite inteira, persistida. Sem data e sem persistência não há "ontem". */
export type Coleta = {
  /** AAAA-MM-DD da execução. */
  data: string;
  /** Instante exato, ISO. */
  em: string;
  /** Commit varrido — sem isto, comparar duas noites compara código diferente
   *  sem saber. */
  commit: string;
  /** "codigo" varre o repositório; "dados" varre o banco de produção. */
  metade: "codigo" | "dados";
  varreduras: ResultadoDeVarredura[];
};

export type Varredura = {
  nome: string;
  padrao: Padrao;
  executar: () => Promise<ResultadoDeVarredura> | ResultadoDeVarredura;
};

/** Atalho para devolver uma varredura cega com o motivo — nunca "0 achados". */
export function cega(nome: string, padrao: Padrao, motivo: string): ResultadoDeVarredura {
  return { varredura: nome, padrao, status: "cega", motivo, achados: [], medidas: {} };
}
