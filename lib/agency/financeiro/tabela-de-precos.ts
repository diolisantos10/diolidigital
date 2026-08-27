// tabela-de-precos.ts — A TABELA DE PREÇOS DA CASA. Uma fonte, e é esta.
//
// ─── A ORDEM QUE CRIOU ISTO (CEO, 27/08/2026) ───────────────────────────────
//
//   *"A gente precisa criar uma tabela de preço com todos os serviços que a
//   gente faz. Com preço de custo, preço final, margem de desconto — até onde eu
//   posso dar de desconto, pro SDR negociador ter na manga. Isso tem que estar
//   claríssimo pro negociador."*
//
// E, junto, o freio: *"o SDR não pode oferecer abaixo do piso"*.
//
// ─── A RESPOSTA HONESTA, E ELA NÃO É A QUE SE ESPERAVA ──────────────────────
//
// O CEO disse: *"Espero que o financeiro já tenha os gastos e custo da agência
// prontinho, porque está aí."* **Foi medido, e não tem.** O que existe hoje:
//
//   ✅ **Custo de IA** — existe registro por chamada (`AIRunLog`), lido pelo DRE.
//      Medido em produção em 27/08/2026, janela de 30 dias: **US$ 13,74 em 1.747
//      chamadas**. ⚠️ E com um buraco DENTRO do número: **485 dessas chamadas
//      não têm preço gravado** (`chamadasSemPreco`) e 543 não têm token. Ou
//      seja: 28% das chamadas do mês entram na conta como zero. O custo de IA é
//      medido **por baixo**, e é o único custo que esta casa mede.
//
//   ❌ **Taxa do gateway (Mercado Pago)** — NÃO MEDIDA. Varredura no código:
//      `app/api/self-serve/webhook/route.ts` e `order/route.ts` falam com o
//      gateway e **não há constante de taxa em lugar nenhum** do repositório.
//   ❌ **Infraestrutura** (Railway, banco, volume) — NÃO MEDIDA, e não há
//      rateio por cliente em parte alguma.
//   ❌ **Domínio e e-mail** (Resend) — NÃO MEDIDO.
//   ❌ **Hora humana** — NÃO MEDIDA. Já estava declarado em `docs/precos.md`:
//      *"é o custo real desses dois degraus e não há medição dela nesta casa"*.
//   ❌ **Impostos** — NÃO MEDIDOS.
//
// ─── POR QUE ISSO DECIDE O PISO, EM VEZ DE SÓ ENFEITAR O RODAPÉ ─────────────
//
// A ordem trazia duas regras que, juntas, respondem sozinhas:
//
//   • *"Piso com margem negativa é proibido."*
//   • *"Sem faixa configurada, desconto nenhum."*
//
// Margem no piso = preço no piso − custo. Com o custo `nao_medido`, a margem no
// piso é `nao_medido` — e **não se pode provar que uma margem desconhecida não é
// negativa**. Logo, enquanto o custo tiver buraco, o piso de desconto É O PREÇO
// DE TABELA: desconto zero, por construção.
//
// Isto não é timidez: é a doutrina da casa aplicada onde ela dói. *Margem
// calculada sobre custo incompleto é pior que margem nenhuma — ela dá confiança
// falsa para o negociador descer o preço.* Régua verde sobre o componente errado
// é pior que régua nenhuma.
//
// O dia em que o CEO autorizar uma faixa (`descontoAutorizado`), ela passa a
// valer — declarada, limitada e registrada. Até lá o SDR **não consegue**
// descer um centavo, e isso é código, não recomendação.
//
// ⚠️ O QUE ESTA TABELA **NÃO** FAZ: reabrir os três planos. Ritmo R$ 290/12,
// Presença R$ 490/20 e Conteúdo R$ 790/36 estão fechados por decisão do CEO
// (D-0B6). Ela CERCA os planos — piso, margem e avulsos —, não os remarca.

import { emReais, medido, somar, type Dinheiro } from "@/lib/agency/financeiro/dinheiro";
import { PLANOS } from "@/lib/agency/planos";

/** Teto de produção da casa, em peças/mês. Vender acima disto é dívida com
 *  outro rosto — `docs/precos.md`: *"nenhum plano passa disso"*. */
export const TETO_DE_PECAS_POR_MES = 36;

/**
 * O QUE A CASA PRODUZ DE VERDADE.
 *
 * ⛔ Serviço sem produtor não entra nesta tabela. *Vitrine é promessa; promessa
 * sem produtor é dívida.* Vídeo e reel seguem FORA por isso — não há quem
 * produza, e um preço de tabela os transformaria em venda.
 */
export type Produtor =
  /** A esteira de IA, sem revisão humana. */
  | "maquina"
  /** A esteira de IA com direção de arte humana em cima. */
  | "maquina_com_direcao"
  /** Pessoa da casa. Hoje só do Presença para cima. */
  | "humano";

export interface ServicoDaCasa {
  chave: string;
  nome: string;
  /** Preço de tabela, em centavos de real. */
  precoFinalCentavos: number;
  /** Quantas peças o serviço entrega por mês (0 quando não se aplica). */
  pecasPorMes: number;
  produtor: Produtor;
  /**
   * O custo apurado deste serviço. `nao_medido` sempre que QUALQUER parcela
   * faltar — `somar` já contagia, de propósito.
   */
  custo: Dinheiro;
  /**
   * A faixa de desconto que o CEO autorizou, em pontos percentuais.
   *
   * `null` = **nenhuma autorizada**. Não é "ainda não decidimos e o SDR
   * improvisa": é desconto zero, travado.
   */
  descontoAutorizadoPct: number | null;
}

// ── AS PARCELAS DE CUSTO, uma a uma, com a fonte de cada número ─────────────

/**
 * Custo de IA por peça. **A única parcela medida desta casa.**
 *
 * US$ 0,17/peça é o número que `docs/precos.md` já usava e que a medição de
 * 27/08 sustenta na ordem de grandeza. Fica em USD de propósito: converter aqui
 * criaria uma segunda taxa de câmbio na casa.
 */
export const CUSTO_DE_IA_POR_PECA_USD = 0.17;

/** As parcelas que a casa NÃO mede, cada uma com o motivo que vira empurrão. */
export const CUSTOS_NAO_MEDIDOS: ReadonlyArray<{ rotulo: string; motivo: string; dono: string }> = [
  {
    rotulo: "taxa do gateway (Mercado Pago)",
    motivo: "não há constante de taxa em lugar nenhum do repositório — medido por varredura em 27/08/2026",
    dono: "CEO — pegar a taxa efetiva no extrato do Mercado Pago",
  },
  {
    rotulo: "infraestrutura (Railway, banco, volume)",
    motivo: "a fatura existe, o rateio por cliente não existe em código nenhum",
    dono: "CEO — informar a fatura mensal; o rateio a casa deriva",
  },
  {
    rotulo: "domínio e e-mail (Resend)",
    motivo: "nenhum registro de custo desses serviços entra na casa",
    dono: "CEO — informar o custo mensal",
  },
  {
    rotulo: "hora humana",
    motivo: "não há apontamento de horas; já declarado em docs/precos.md como dívida",
    dono: "CEO — decidir se haverá apontamento, ou um custo/hora de referência",
  },
  {
    rotulo: "impostos",
    motivo: "regime tributário não declarado à casa",
    dono: "CEO — informar o regime e a alíquota efetiva",
  },
] as const;

/**
 * Monta o custo de um serviço: a parcela medida (IA) mais as que faltam.
 *
 * A soma **se recusa a inventar** — é `somar` do DRE que decide, e ela contagia
 * `nao_medido` para o total quando qualquer parcela falta. É por isso que todo
 * serviço desta tabela sai com custo `nao_medido` hoje: não porque a IA não foi
 * medida, mas porque as outras cinco não foram.
 */
function custoDoServico(pecasPorMes: number): Dinheiro {
  const parcelas: Array<{ rotulo: string; valor: Dinheiro }> = [
    {
      rotulo: "IA",
      valor: medido(Math.round(pecasPorMes * CUSTO_DE_IA_POR_PECA_USD * 100), "registro_de_ia", "USD"),
    },
    ...CUSTOS_NAO_MEDIDOS.map((c) => ({
      rotulo: c.rotulo,
      valor: { estado: "nao_medido", motivo: c.motivo } as Dinheiro,
    })),
  ];
  return somar(parcelas);
}

/**
 * A TABELA. Todo mundo lê daqui: o SDR, a vitrine, a proposta e a cobrança.
 *
 * Os três planos vêm de D-0B6 e **não se remarcam**. Os avulsos vêm da seção
 * "Preço por serviço" de `docs/precos.md`.
 */
/**
 * ⚠️ OS PLANOS NÃO SÃO DIGITADOS AQUI — e a primeira versão deste arquivo os
 * digitava, o que teria criado a TERCEIRA cópia da tabela. O erro foi meu e
 * fica registrado, porque é exatamente o defeito que este módulo existe para
 * matar: `lib/agency/planos.ts` já é a fonte de D-0B6 (preço, peças e nome), e
 * a tabela financeira DERIVA dela. Se o CEO remarcar um plano, ele muda um
 * arquivo — não três.
 *
 * O Pulso (R$ 49) fica de fora: `pecasPorMes: 0`, não entrega peça, e não há o
 * que negociar nele.
 */
const PLANOS_DA_TABELA: ServicoDaCasa[] = PLANOS
  .filter((p) => p.pecasPorMes > 0)
  .map((p) => ({
    chave: `plano_${p.id}`,
    nome: p.nome,
    precoFinalCentavos: p.preco * 100,
    pecasPorMes: p.pecasPorMes,
    // Gente entra a partir do Presença (`docs/precos.md`). O Ritmo é máquina —
    // é só por isso que R$ 290 pode existir sem dar prejuízo.
    produtor: p.id === "ritmo" ? ("maquina" as const) : ("humano" as const),
    custo: custoDoServico(p.pecasPorMes),
    descontoAutorizadoPct: null,
  }));

export const TABELA_DE_PRECOS: ReadonlyArray<ServicoDaCasa> = [
  ...PLANOS_DA_TABELA,
  // ── Balcão: 100% automático, pago antes da produção ────────────────────
  { chave: "balcao_post",     nome: "Post (balcão)",      precoFinalCentavos:  7900, pecasPorMes: 1, produtor: "maquina",             custo: custoDoServico(1), descontoAutorizadoPct: null },
  { chave: "balcao_carrossel",nome: "Carrossel (balcão)", precoFinalCentavos: 12900, pecasPorMes: 1, produtor: "maquina",             custo: custoDoServico(1), descontoAutorizadoPct: null },
  // ── Avulso para quem já é cliente: com direção de arte e 2 rodadas ──────
  { chave: "avulso_post",     nome: "Post avulso",        precoFinalCentavos: 19000, pecasPorMes: 1, produtor: "maquina_com_direcao", custo: custoDoServico(1), descontoAutorizadoPct: null },
  { chave: "avulso_carrossel",nome: "Carrossel avulso",   precoFinalCentavos: 29000, pecasPorMes: 1, produtor: "maquina_com_direcao", custo: custoDoServico(1), descontoAutorizadoPct: null },
];

export function servicoPorChave(chave: string): ServicoDaCasa | null {
  return TABELA_DE_PRECOS.find((s) => s.chave === chave) ?? null;
}

/**
 * O PISO: o menor preço que o SDR pode oferecer, em centavos.
 *
 * Sem faixa autorizada, o piso É o preço de tabela. Ver o cabeçalho: com custo
 * `nao_medido`, não há como provar que a margem no piso não é negativa.
 */
export function pisoDoServico(s: ServicoDaCasa): number {
  if (s.descontoAutorizadoPct === null || s.descontoAutorizadoPct <= 0) {
    return s.precoFinalCentavos;
  }
  const pct = Math.min(s.descontoAutorizadoPct, 100);
  return Math.round(s.precoFinalCentavos * (1 - pct / 100));
}

/** A margem que sobra no piso. `nao_medido` enquanto o custo tiver buraco. */
export function margemNoPiso(s: ServicoDaCasa): Dinheiro {
  if (s.custo.estado !== "medido") {
    return { estado: "nao_medido", motivo: `a margem depende do custo, e ${s.custo.estado === "nao_medido" ? s.custo.motivo : "não há custo lançado"}` };
  }
  return medido(pisoDoServico(s) - s.custo.centavos, "derivado", s.custo.moeda);
}

// ─── O FREIO DO NEGOCIADOR ──────────────────────────────────────────────────

export type VereditoDaOferta =
  | { pode: true; precoCentavos: number }
  | { pode: false; motivo: string; pisoCentavos: number; comoSeguir: string };

/**
 * ⛔ **A TRAVA. Código, não prompt.**
 *
 * O SDR passa por aqui antes de dizer qualquer preço. Um prompt pedindo "não
 * ofereça abaixo do piso" é um aviso que a próxima geração do modelo ignora sem
 * avisar ninguém; isto é uma função que devolve `pode: false`.
 *
 * E ela nunca devolve um beco: quando recusa, devolve **como seguir** — porque
 * o caminho certo para "achei caro" existe e tem preço (o degrau de baixo).
 * *Botão que cai na mesma parada é pior que botão nenhum.*
 */
export function podeOfertar(chave: string, precoCentavos: number): VereditoDaOferta {
  const s = servicoPorChave(chave);
  if (!s) {
    return {
      pode: false,
      motivo: `"${chave}" não está na tabela de preços da casa`,
      pisoCentavos: 0,
      comoSeguir:
        "Serviço fora da tabela não se oferta — e serviço sem produtor não entra na tabela. " +
        "Chame o gerente do projeto para orçar à parte.",
    };
  }
  const piso = pisoDoServico(s);
  if (!Number.isFinite(precoCentavos) || precoCentavos < piso) {
    return {
      pode: false,
      motivo:
        `${s.nome} não pode ser ofertado por ${emReais(medido(Math.max(0, Math.round(precoCentavos || 0)), "derivado"))}: ` +
        `o piso é ${emReais(medido(piso, "derivado"))}` +
        (s.descontoAutorizadoPct === null
          ? " (nenhuma faixa de desconto foi autorizada para este serviço)"
          : ` (desconto autorizado: até ${s.descontoAutorizadoPct}%)`),
      pisoCentavos: piso,
      comoSeguir: comoSeguirSemBaixarOPreco(s),
    };
  }
  return { pode: true, precoCentavos: Math.round(precoCentavos) };
}

/**
 * O caminho honesto para "achei caro": **muda-se de degrau, não de preço.**
 *
 * Oferecer o degrau de baixo é venda — ele existe, tem preço e entrega menos.
 * Baixar o preço do mesmo degrau é sangria. Quando não há degrau abaixo, a
 * resposta é gente, com dono e próxima ação — nunca um beco.
 */
export function comoSeguirSemBaixarOPreco(s: ServicoDaCasa): string {
  const abaixo = TABELA_DE_PRECOS
    .filter((o) => o.precoFinalCentavos < s.precoFinalCentavos && o.pecasPorMes > 0)
    .sort((a, b) => b.precoFinalCentavos - a.precoFinalCentavos)[0];
  if (abaixo) {
    return (
      `Ofereça o degrau de baixo: ${abaixo.nome}, ${emReais(medido(abaixo.precoFinalCentavos, "contrato"))}` +
      `${abaixo.pecasPorMes > 1 ? ` (${abaixo.pecasPorMes} peças/mês)` : ""}. ` +
      "Mudar de degrau é venda; baixar o preço do degrau é sangria."
    );
  }
  return (
    "Este já é o degrau mais barato da casa — não há para onde descer. " +
    "Escale ao gerente do projeto com o que o cliente disse: quem decide abrir exceção é gente, não a esteira."
  );
}

/**
 * O que o SDR pode PROMETER. Vitrine é promessa.
 *
 * Volume acima da capacidade não se vende, e o que a casa não produz não se
 * oferece — vídeo e reel continuam fora porque não têm produtor.
 */
export function podePrometerVolume(pecasPorMes: number): { pode: boolean; motivo?: string } {
  if (pecasPorMes > TETO_DE_PECAS_POR_MES) {
    return {
      pode: false,
      motivo:
        `${pecasPorMes} peças/mês passa da capacidade da casa (${TETO_DE_PECAS_POR_MES}). ` +
        "Vender acima do que se produz é dívida com outro rosto.",
    };
  }
  return { pode: true };
}

/** O quanto desta tabela está apoiado em custo medido. Para o relatório — e
 *  para a tela, no dia em que houver uma. */
export function coberturaDeCusto(): { medidos: number; total: number; parcelasEmFalta: number } {
  return {
    medidos: TABELA_DE_PRECOS.filter((s) => s.custo.estado === "medido").length,
    total: TABELA_DE_PRECOS.length,
    parcelasEmFalta: CUSTOS_NAO_MEDIDOS.length,
  };
}
