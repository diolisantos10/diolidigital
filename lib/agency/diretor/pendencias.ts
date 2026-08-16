// A REGRA DE OURO DO DIRETOR — ele não encerra enquanto houver pendência.
//
// ── A ORDEM DO CEO (15/08/2026), nas palavras dele ─────────────────────────
//
//   "Eles só podem parar quando não tiver mais nada pendente em nenhum
//    projeto. Enquanto tiver pendência, eles não podem parar de resolver.
//    E se está parado... 'ah, está parado porque eu não vi' — precisa de um
//    dispositivo pra que ele detecte, ele audite também."
//
// A segunda frase é a que manda neste arquivo. Uma regra que diz "não pare
// enquanto houver pendência" sem dar o meio de ENXERGAR a pendência produz
// exatamente a desculpa que o CEO nomeou: *não vi*. Então a regra e o
// instrumento nascem juntos, e o instrumento é este.
//
// ── A PROPRIEDADE QUE IMPORTA: SILÊNCIO NÃO É "LIMPO" ─────────────────────
//
// Se o levantamento FALHA — banco fora do ar, fonte que não respondeu —, a
// resposta NÃO é "nada pendente". É "não posso afirmar que está limpo, logo
// não encerro". Ausência de informação não é informação, e aqui essa doutrina
// da casa é a diferença entre um Diretor que audita e um que dá de ombros.
//
// Escopo: o Diretor de produto pergunta pelo produto dele; o Diretor Geral
// pergunta por todos. É o mesmo instrumento, com o recorte diferente — e é por
// isso que ele recebe as fontes de fora em vez de ir ao banco sozinho.

/** As espécies de pendência que impedem o encerramento. */
export type TipoDePendencia =
  /** Bloqueio canônico aberto — alguém travou e ninguém destravou. */
  | "bloqueio_aberto"
  /** Bastão entregue e nunca aceito: a esteira parou no meio. */
  | "handoff_sem_aceite"
  /** Trabalho além do prazo do estado em que está. */
  | "prazo_estourado"
  /** Decisão do cliente esperando há tempo demais. */
  | "aprovacao_pendente"
  /** Efeito que falhou até morrer na fila — ninguém olhou. */
  | "efeito_morto"
  /** Peça reprovada pela Qualidade e nunca refeita. */
  | "reprovado_sem_refacao"
  /** Escalada aberta: alguém subiu uma decisão e ela não voltou. */
  | "escalada_sem_resposta";

export interface Pendencia {
  tipo: TipoDePendencia;
  /** A que produto/projeto pertence — o recorte do Diretor. */
  escopo: string;
  referencia: string;
  /** Há quanto tempo está assim. Pendência velha vem primeiro. */
  horasParada: number;
  /** O que fazer. Nunca "está pendente" e ponto. */
  acao: string;
}

export interface RetratoDasFontes {
  /** O que cada fonte devolveu. Fonte que falhou entra em `falhas`, nunca vazia. */
  pendencias: Pendencia[];
  /**
   * Fontes que NÃO responderam. Uma única falha aqui já impede o encerramento:
   * o Diretor não pode jurar que está limpo o que ele não conseguiu olhar.
   */
  falhas: Array<{ fonte: string; erro: string }>;
}

export type VereditoDoDiretor =
  | { podeEncerrar: true; frase: string }
  | {
      podeEncerrar: false;
      motivo: "pendencias_abertas" | "auditoria_incompleta";
      frase: string;
      pendencias: Pendencia[];
      falhas: Array<{ fonte: string; erro: string }>;
    };

/**
 * O veredito. Fail-closed nas duas pontas: pendência aberta impede, e
 * auditoria incompleta também.
 */
export function podeODiretorEncerrar(retrato: RetratoDasFontes): VereditoDoDiretor {
  // A auditoria incompleta vem PRIMEIRO de propósito. Se a checagem furou,
  // nem faz sentido discutir a lista: a lista pode estar curta justamente
  // porque a fonte que faltou era a que tinha as pendências.
  if (retrato.falhas.length > 0) {
    const nomes = retrato.falhas.map((f) => `${f.fonte} (${f.erro})`).join(" · ");
    return {
      podeEncerrar: false,
      motivo: "auditoria_incompleta",
      frase:
        `NÃO POSSO ENCERRAR: a auditoria não fechou — ${retrato.falhas.length} fonte(s) não responderam: ${nomes}. ` +
        "Silêncio de fonte não é ausência de pendência. Refaça a varredura antes de qualquer encerramento.",
      pendencias: ordenar(retrato.pendencias),
      falhas: retrato.falhas,
    };
  }

  if (retrato.pendencias.length === 0) {
    return {
      podeEncerrar: true,
      frase: "Encerramento liberado: a varredura rodou inteira e não há bloqueio, handoff sem aceite, prazo estourado, aprovação parada, efeito morto, reprovação sem refação nem escalada aberta.",
    };
  }

  const lista = ordenar(retrato.pendencias);
  const porTipo = new Map<TipoDePendencia, number>();
  for (const p of lista) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + 1);
  const resumo = [...porTipo.entries()].map(([t, n]) => `${n} ${ROTULO[t]}`).join(" · ");
  const pior = lista[0]!;

  return {
    podeEncerrar: false,
    motivo: "pendencias_abertas",
    frase:
      `NÃO POSSO ENCERRAR: ${lista.length} pendência(s) — ${resumo}. ` +
      `A mais antiga está há ${pior.horasParada}h em ${pior.escopo}: ${pior.acao}`,
    pendencias: lista,
    falhas: [],
  };
}

const ROTULO: Record<TipoDePendencia, string> = {
  bloqueio_aberto: "bloqueio(s) aberto(s)",
  handoff_sem_aceite: "entrega(s) sem aceite",
  prazo_estourado: "prazo(s) estourado(s)",
  aprovacao_pendente: "aprovação(ões) parada(s)",
  efeito_morto: "efeito(s) na fila morta",
  reprovado_sem_refacao: "reprovação(ões) sem refação",
  escalada_sem_resposta: "escalada(s) sem resposta",
};

function ordenar(p: Pendencia[]): Pendencia[] {
  return [...p].sort((a, b) => b.horasParada - a.horasParada);
}

/**
 * O recorte do Diretor de PRODUTO: só o que é dele.
 *
 * Existe como função (e não como filtro no chamador) para que o recorte seja
 * a mesma regra em todo lugar — e para que o Diretor Geral seja, literalmente,
 * "o mesmo instrumento sem recorte".
 */
export function recortarPorEscopo(pendencias: Pendencia[], escopo: string): Pendencia[] {
  return pendencias.filter((p) => p.escopo === escopo);
}

/**
 * O relatório que o Diretor deve devolver ao encerrar — ou ao NÃO encerrar.
 *
 * A ordem é a da casa: conclusão primeiro, depois o que fazer. Quem lê tem de
 * saber em uma linha se pode ir dormir.
 */
export function relatorioDoDiretor(veredito: VereditoDoDiretor): string {
  if (veredito.podeEncerrar) return veredito.frase;
  const linhas = veredito.pendencias
    .slice(0, 20)
    .map((p) => `- [${ROTULO[p.tipo]}] ${p.escopo} · ${p.referencia} · ${p.horasParada}h → ${p.acao}`);
  const rodape =
    veredito.pendencias.length > 20 ? `\n… e mais ${veredito.pendencias.length - 20} pendência(s).` : "";
  return `${veredito.frase}\n\n${linhas.join("\n")}${rodape}`;
}
