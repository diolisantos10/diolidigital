// OS PLANOS DA CASA — FONTE ÚNICA. Não existe segunda tabela de preço de plano.
//
// ─── O QUE MUDOU EM 16/08/2026, E POR QUÊ ────────────────────────────────────
//
// Ordem do CEO: a tabela tem **SEIS** degraus, e o preço mora em UM lugar só.
// Antes desta data havia TRÊS tabelas de preço de plano vivas ao mesmo tempo:
//
//   1. este arquivo, com 5 planos (Pulso…Crescimento);
//   2. `comercial/negociacao.ts` → `TABELA_DE_PISO`, com `cheio` por plano
//      digitado à mão (4 planos) e o preço repetido dentro de frases de venda;
//   3. `live-calculator.ts` → `SOCIAL_PACKAGES`, com **cinco planos que não
//      existem** (Essencial, Starter, Growth, Pro, Premium) e FAIXAS de preço
//      (R$ 600–900, R$ 900–1.400, R$ 1.500–2.400, R$ 2.500–4.000, R$ 4.000–6.500)
//      — e essa era a tabela que o **briefing PÚBLICO** cotava para o prospect.
//
// A terceira era o dano real: o site dizia R$ 2.590 e a proposta gerada na
// mesma casa dizia "Plano Growth, R$ 1.500 a R$ 2.400". As três foram
// ELIMINADAS como fonte — as duas de baixo passaram a DERIVAR desta. Não foram
// sincronizadas: duplicata sincronizada volta a divergir no primeiro dia de
// pressa. Quem quiser mudar preço muda aqui, e só aqui.
//
// ─── A REGRA QUE SUSTENTA A BASE DA TABELA ───────────────────────────────────
// Gente entra a partir do Presença. Abaixo disso a operação é máquina, e é só
// por isso que R$ 49 e R$ 297 fecham. Se a publicação do Ritmo virar nossa, o
// degrau quebra.
//
// **Pulso e Ritmo são decisão consciente do CEO** — pacotes de entrada para
// quem tem menos dinheiro. Não são resíduo de tabela velha e não se removem.
//
// ─── PRECIFICADO NÃO É PÚBLICO ───────────────────────────────────────────────
// `exposicao` é a trava. Um plano pode existir na tabela (para a casa saber
// quanto ele custa) e **não** poder ser mostrado a cliente nem a prospect.
// É o caso do PERFORMANCE: ele depende de operar Meta Ads todo dia dentro da
// conta do cliente, e a conta de anúncios da agência está restrita desde
// 03/08/2026. Vender operação diária hoje é vender o que não se pode entregar.
//
// **Superfície de cliente lê `PLANOS_PUBLICOS`. Nunca `PLANOS`.** Há teste que
// reprova o contrário (`__tests__/comercial/preco-uma-fonte-so.test.ts`).
//
// ─── O QUE NÃO PODE ENTRAR AQUI ──────────────────────────────────────────────
//   • serviço que a casa não entrega hoje com código rodando em produção;
//   • vídeo (gravação, edição ou geração) — decisão do CEO: é o item de maior
//     custo real e sai da mensalidade, sempre;
//   • a tabela por serviço. Ela é interna, para cliente de carteira.
//   • **valor que ninguém escreveu.** Ausência de informação não é informação:
//     campo sem fonte é `pendente`/`null`, nunca um número arredondado por
//     analogia. Ver `Implantacao` e `piso` abaixo.

/**
 * A implantação é uma UNIÃO, não um `number | null`, e isso é mecanismo.
 *
 * Com `number | null`, `null` significava "isenta". O PERFORMANCE chegou sem
 * implantação escrita em lugar nenhum — o parecer do conselho de 05/08 só
 * escalonou TRÊS faixas (1.290 / 1.900 / 2.900), calculadas para os degraus de
 * cima. Guardar isso como `null` faria a casa **anunciar implantação isenta**
 * num plano de R$ 4.990. "Ninguém escreveu" e "é de graça" são fatos opostos.
 */
export type Implantacao =
  | { tipo: "isenta" }
  | { tipo: "valor"; reais: number; parcelas: number }
  | { tipo: "pendente"; oQueFalta: string };

export type PlanoId = "pulso" | "ritmo" | "presenca" | "conteudo" | "crescimento" | "performance";

/** `publico` = pode aparecer em site, briefing, proposta e portal.
 *  `interno` = precificado, NÃO vendável, NÃO exibível — nem como bônus,
 *  beta ou cortesia. */
export type Exposicao = "publico" | "interno";

export type Plano = {
  id: PlanoId;
  nome: string;
  preco: number;
  /** true quando a verba de mídia é paga à parte, direto à plataforma. */
  midiaAParte: boolean;
  implantacao: Implantacao;
  /**
   * O menor valor autorizado em negociação. `null` = **ninguém escreveu**, e o
   * portão de negociação é fail-closed: sem piso não há autorização de venda.
   * Não é "piso zero" nem "vende pelo cheio" — é "preciso confirmar".
   */
  piso: number | null;
  /** Peças de conteúdo incluídas por mês. `null` = não declarado. 0 é um número
   *  legítimo (o Pulso não produz peça nenhuma) e não se confunde com `null`. */
  pecasPorMes: number | null;
  paraQuem: string;
  /** O que muda em relação ao degrau de baixo — a frase que vende o degrau. */
  salto: string;
  /** Escopo numerado. Numerado de propósito: é o que vai para o contrato. */
  inclui: string[];
  /** O que NÃO está incluído. É esta lista que evita briga no terceiro mês. */
  naoInclui: string[];
  /** Meses de permanência mínima. `null` = não declarado. */
  permanencia: number | null;
  /** Preço da peça além do contratado, em reais. `null` = não se aplica. */
  pecaExtra: number | null;
  exposicao: Exposicao;
  /** Obrigatório quando `exposicao === "interno"`: por que não pode ser vendido.
   *  Trava sem motivo escrito é trava que alguém levanta sem saber o que solta. */
  motivoDoInterno: string | null;
  /** O degrau que deve receber metade da carteira. */
  destaque?: boolean;
};

/** Peça além do contratado, dentro do plano. */
export const PECA_EXTRA = 180;
/** Pedido avulso mínimo para cliente que já tem plano. */
export const MINIMO_AVULSO = 750;
/** Percentual cobrado sobre a verba de mídia acima do piso abaixo. */
export const PERCENTUAL_SOBRE_MIDIA = 8;
/** A verba a partir da qual o percentual incide. */
export const MIDIA_A_PARTIR_DE = 15_000;
/** Parcelamento máximo da implantação (parecer do conselho, 05/08/2026). */
export const PARCELAS_DA_IMPLANTACAO = 3;

export const PLANOS: Plano[] = [
  {
    id: "pulso",
    nome: "Pulso",
    preco: 49,
    midiaAParte: false,
    implantacao: { tipo: "isenta" },
    // NÃO INVENTADO: o parecer do conselho de 05/08 calculou piso só para os
    // degraus que já existiam na régua do SDR (Ritmo para cima). O Pulso nunca
    // teve piso escrito — e ele nunca esteve na tabela de negociação, então
    // isto não é regressão, é a lacuna ficando visível.
    piso: null,
    pecasPorMes: 0,
    paraQuem: "Para quem posta sozinho e não faz ideia se está funcionando.",
    salto: "Observa, mede e avisa — não produz.",
    inclui: [
      "Painel de resultados ao vivo: alcance, visualizações, engajamento e seguidores, direto do Instagram",
      "Relatório mensal escrito só com número medido — o que não foi medido é declarado, nunca estimado",
      "Métricas por post: qual peça rendeu e qual não rendeu",
      "Leitura do seu perfil na entrada: temas, tom, formatos e o que mais engaja",
      "Portal próprio, com acesso só seu",
    ],
    naoInclui: ["Nenhuma peça de conteúdo", "Nenhuma publicação", "Google, tráfego e vídeo"],
    permanencia: 0,
    pecaExtra: null,
    exposicao: "publico",
    motivoDoInterno: null,
  },
  {
    id: "ritmo",
    nome: "Ritmo",
    preco: 297,
    midiaAParte: false,
    implantacao: { tipo: "valor", reais: 390, parcelas: PARCELAS_DA_IMPLANTACAO },
    piso: 229,
    pecasPorMes: 8,
    paraQuem: "Para quem quer conteúdo constante e publica ele mesmo.",
    salto: "O degrau que faltava entre medir e contratar uma agência.",
    inclui: [
      "Tudo do Pulso",
      "Pauta do mês: quantos posts, de que tipo, sobre o quê e em que ordem",
      "8 peças por mês — carrossel de até 6 telas ou post único, com a arte pronta",
      "Legenda de cada peça, no seu tom e ancorada no que você informou",
      "Calendário com data e hora, visível no portal",
      "Aprovação no portal vendo imagem e legenda, peça por peça",
      "2 rodadas de ajuste por peça",
    ],
    naoInclui: [
      "A publicação é sua — entregamos pronto e agendado; quem posta é você",
      "Vídeo, em qualquer forma",
      "Ficha do Google e avaliações",
      "Tráfego pago",
    ],
    permanencia: 3,
    pecaExtra: PECA_EXTRA,
    exposicao: "publico",
    motivoDoInterno: null,
  },
  {
    id: "presenca",
    nome: "Presença",
    preco: 790,
    midiaAParte: false,
    implantacao: { tipo: "valor", reais: 1290, parcelas: PARCELAS_DA_IMPLANTACAO },
    piso: 690,
    pecasPorMes: 10,
    paraQuem: "Para o negócio que precisa aparecer no Google e não tem ninguém cuidando disso.",
    salto: "É aqui que entra gente da nossa equipe.",
    inclui: [
      "Tudo do Ritmo, com 10 peças por mês",
      "Nós publicamos no Instagram e no Facebook",
      "Ficha do Google mantida: locais, horários e informações",
      "4 posts no Google por mês — novidade, oferta e evento na busca e no mapa",
      "Gestão de avaliações: elogio respondido; reclamação vira rascunho e chama gente",
      "Atendimento humano por WhatsApp, em horário comercial",
      "Otimização do ciclo: o que muda no mês seguinte, com base no que aconteceu",
    ],
    naoInclui: ["Vídeo, em qualquer forma", "Stories", "Tráfego pago e verba de mídia", "Site e material impresso"],
    permanencia: 3,
    pecaExtra: PECA_EXTRA,
    exposicao: "publico",
    motivoDoInterno: null,
    destaque: true,
  },
  {
    id: "conteudo",
    nome: "Conteúdo",
    preco: 1390,
    midiaAParte: false,
    implantacao: { tipo: "valor", reais: 1900, parcelas: PARCELAS_DA_IMPLANTACAO },
    piso: 1190,
    pecasPorMes: 14,
    paraQuem: "Para quem já vive do digital e precisa de volume e formato variado.",
    salto: "Mais peça, mais formato e alguém lendo os números todo mês com você.",
    inclui: [
      "Tudo do Presença, com 14 peças por mês",
      "4 sequências de stories por mês, no formato vertical protegido",
      "4 roteiros de reels — cena a cena, prontos para gravar",
      "Plano de medição: o que vamos medir e qual número significa sucesso, combinado antes",
      "Pesquisa de concorrência atualizada a cada ciclo",
      "Reunião mensal de leitura dos números",
      "3 rodadas de ajuste por peça",
    ],
    naoInclui: [
      "A gravação e a edição do vídeo — o roteiro está incluído, o vídeo pronto se compra à parte",
      "Tráfego pago e verba de mídia",
      "Site e material impresso",
    ],
    permanencia: 6,
    pecaExtra: PECA_EXTRA,
    exposicao: "publico",
    motivoDoInterno: null,
  },
  {
    id: "crescimento",
    nome: "Crescimento",
    preco: 2590,
    midiaAParte: false,
    implantacao: { tipo: "valor", reais: 2900, parcelas: PARCELAS_DA_IMPLANTACAO },
    piso: 2190,
    pecasPorMes: 18,
    paraQuem: "Para quem vai colocar dinheiro em anúncio.",
    salto: "A campanha desenhada por quem produz o conteúdo — rodando na sua conta.",
    inclui: [
      "Tudo do Conteúdo, com 18 peças por mês",
      "3 criativos de anúncio por mês, em formatos para teste",
      "Estrutura de campanha: objetivo, conjuntos e verba desenhados antes de gastar o primeiro real",
      "Segmentação de público, com o porquê de cada recorte",
      "Copy de anúncio em vários ângulos, não uma frase só",
      "Plano de investimento: quanto colocar, onde e o que esperar",
      "Leitura quinzenal dos resultados e ajuste de rota",
    ],
    naoInclui: [
      "A verba de mídia — sempre fora da mensalidade, paga por você direto à plataforma",
      "A campanha roda na sua conta de anúncios, no seu nome",
      "Gravação e edição de vídeo",
      "Qualquer promessa de faturamento ou de retorno",
    ],
    permanencia: 6,
    pecaExtra: PECA_EXTRA,
    exposicao: "publico",
    motivoDoInterno: null,
  },
  {
    // ─────────────────────────────────────────────────────────────────────────
    // 🔴 PRECIFICADO E NÃO VENDÁVEL. Leia o `motivoDoInterno` antes de mexer.
    //
    // Só o PREÇO deste degrau foi decidido (R$ 4.990 + mídia, ordem do CEO de
    // 16/08/2026). Escopo, implantação, piso, cadência e permanência **não
    // foram escritos por ninguém** — nem no parecer do conselho de 05/08, nem
    // na ficha de despacho. Preenchê-los "por analogia com o degrau de baixo"
    // seria exatamente o erro que esta casa proíbe: sem revisor humano, um
    // número inferido vira contrato.
    // ─────────────────────────────────────────────────────────────────────────
    id: "performance",
    nome: "Performance",
    preco: 4990,
    midiaAParte: true,
    implantacao: {
      tipo: "pendente",
      oQueFalta:
        "O parecer do conselho de 05/08/2026 escalonou apenas TRÊS faixas de implantação " +
        "(R$ 1.290 / R$ 1.900 / R$ 2.900), calculadas para Presença, Conteúdo e Crescimento. " +
        "Nenhuma foi atribuída ao Performance. Decisão do CEO.",
    },
    piso: null,
    pecasPorMes: null,
    paraQuem: "PRECISO CONFIRMAR — o público-alvo deste degrau não foi escrito.",
    salto: "PRECISO CONFIRMAR — o salto sobre o Crescimento não foi escrito.",
    inclui: [],
    naoInclui: [],
    permanencia: null,
    pecaExtra: PECA_EXTRA,
    exposicao: "interno",
    motivoDoInterno:
      "Gestão de Meta Ads operada diariamente dentro da conta do cliente está LARANJA: a conta de " +
      "anúncios da agência está restrita desde 03/08/2026. Nada laranja, vermelho ou horizonte é " +
      "vendável — nem como bônus, beta ou cortesia. Além disso o escopo, a implantação e o piso " +
      "deste degrau nunca foram escritos: não há o que colocar num contrato.",
  },
];

/**
 * O QUE PODE SER MOSTRADO A CLIENTE E A PROSPECT.
 *
 * Toda superfície pública (site, briefing, proposta, portal, vitrine) importa
 * ESTA lista. Importar `PLANOS` numa tela de cliente é o defeito que faz um
 * plano não-vendável aparecer na tabela — e é reprovado por teste.
 */
export const PLANOS_PUBLICOS: Plano[] = PLANOS.filter((p) => p.exposicao === "publico");

/** Os que existem na tabela e NÃO podem ser vendidos. Lista de auditoria. */
export const PLANOS_INTERNOS: Plano[] = PLANOS.filter((p) => p.exposicao === "interno");

export function planoPorId(id: string): Plano | undefined {
  return PLANOS.find((p) => p.id === id);
}

/**
 * `true` só quando o plano pode ser proposto, cotado ou exibido a alguém de
 * fora. Fail-closed: id desconhecido devolve `false`, nunca `true` por omissão.
 */
export function podeSerVendido(id: string): boolean {
  const p = planoPorId(id);
  return p?.exposicao === "publico";
}

/** O que fica fora de TODO plano. Não é falta de escopo: o custo destes quatro
 *  não é conteúdo — é hora, processamento ou projeto. */
export const FORA_DE_TODO_PLANO = [
  {
    titulo: "Vídeo",
    texto:
      "Gravação, edição e vídeo gerado por IA. O roteiro está incluído a partir do Conteúdo; o vídeo pronto é sempre orçado à parte.",
  },
  {
    titulo: "Marca",
    texto:
      "Posicionamento, identidade visual e manual de marca. São projeto com começo e fim, não entrega mensal — e podem vir antes do plano.",
  },
  {
    titulo: "Site e página de captura",
    texto: "Projeto próprio, com prazo próprio. Orçado caso a caso.",
  },
  {
    titulo: "Verba de mídia",
    texto:
      "Nunca entra na mensalidade e nunca passa pela nossa conta. Você paga a plataforma direto, na sua conta, no seu nome.",
  },
];

export function precoEmReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

/**
 * A implantação em texto, para tela. **Nunca devolve "isenta" para pendente** —
 * é o ponto inteiro do tipo `Implantacao`.
 */
export function implantacaoEmTexto(i: Implantacao): string {
  switch (i.tipo) {
    case "isenta":
      return "Implantação isenta";
    case "valor":
      return `+ implantação de ${precoEmReais(i.reais)}, uma vez (em até ${i.parcelas}x)`;
    case "pendente":
      return "Implantação a definir — preciso confirmar";
  }
}

/**
 * Quanto se cobra sobre a verba de mídia. Só incide ACIMA de
 * `MIDIA_A_PARTIR_DE`, e só sobre o excedente — cobrar 8% sobre a verba inteira
 * de quem gasta R$ 15.001 criaria um degrau de R$ 1.200 num real a mais.
 *
 * Verba inválida (NaN, negativa, infinita) devolve `null`, não zero: "não sei
 * quanto ele gasta" e "ele não gasta nada" são fatos diferentes.
 */
export function taxaSobreMidia(verbaMensal: number): number | null {
  if (typeof verbaMensal !== "number" || !Number.isFinite(verbaMensal) || verbaMensal < 0) return null;
  if (verbaMensal <= MIDIA_A_PARTIR_DE) return 0;
  return Math.round(((verbaMensal - MIDIA_A_PARTIR_DE) * PERCENTUAL_SOBRE_MIDIA) / 100);
}
