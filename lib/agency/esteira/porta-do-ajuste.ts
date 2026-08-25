// A PORTA DO AJUSTE — o que a casa faz quando o ajuste NÃO pôde ser entregue.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA FECHAR (cliente oculto, 26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A cliente apontou a terceira de quatro peças pagas. A refação reescreveu o
// texto, e o PISO DE VERDADE barrou: o texto novo usava justamente o que ela
// mesma tinha registrado como proibido ("não usar imagem de pizza").
//
// **Parar ali foi certo e continua certo.** Peça que viola regra registrada do
// cliente é pior que peça sem graça — ele já tinha avisado. Nada aqui afrouxa
// essa recusa.
//
// O defeito era o DEPOIS:
//   • a refação não entregou arquivo novo (correto);
//   • o card ficava carimbado `revision_requested` para sempre;
//   • e `POST /api/portal/approvals` passava a devolver **409 "já decidido"**
//     para aprovar, recusar E cancelar.
//
// Um clique em "pedir ajuste" transformava a entrega inteira num beco: sem
// arquivo novo, sem decisão possível, esperando gente que não vem. Para um
// humano isso é uma semana perdida. Para um AGENTE DE IA representando uma
// marca — que é o que vem por aí — é um laço infinito: ele pede, não recebe,
// não pode decidir, e pede de novo. Para sempre.
//
// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS REGRAS, E ELAS ANDAM JUNTAS
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. **Toda proibição tem instrução gêmea.** A máquina que diz "não" tem de
//    dizer, na TELA do cliente, o que aconteceu e por quê. E aqui o porquê é
//    ótimo: *"o que você pediu esbarra numa regra que você mesmo registrou"*.
//    Isso é uma conversa, não um erro.
//
// 2. **Pedir ajuste não consome o direito de decidir.** A peça que já está na
//    mão dele continua dele: aprovar, recusar e cancelar seguem abertos. Hoje
//    o clique consumia os três.
//
// ═══════════════════════════════════════════════════════════════════════════
// TENTAR DE NOVO **O QUÊ** — a distinção que economiza dinheiro
// ═══════════════════════════════════════════════════════════════════════════
//
// Retentar o que vai falhar igual é queimar dinheiro de IA e adiar a conversa
// que resolve. Então as paradas se separam em duas famílias:
//
//   • **TRANSITÓRIA** — o provedor caiu, a saída veio vazia. Nada no PEDIDO
//     está errado; a mesma chamada amanhã (ou daqui a um segundo) dá certo.
//     Retenta, com TETO, e ao esgotar declara a parada: motivo, dono, próxima
//     ação.
//   • **CONFLITO COM REGRA DO CLIENTE** — o pedido dele briga com uma regra
//     dele. Mil tentativas dariam mil vezes o mesmo resultado, porque a régua é
//     determinística e roda em código, sem IA. A saída não é tentar de novo: é
//     FALAR com ele. Zero retentativas, de propósito.
//
// E uma terceira, que também não se retenta sozinha: **PRECISA DE GENTE** (a
// saída veio fora do contrato, o teto de refações estourou, a entrega está
// barrada pela Qualidade). Aí a bola é da equipe — e o cliente é avisado disso.
//
// ⚠️ Este módulo é PURO de propósito: não fala com banco, não chama IA. Ele
// decide e escreve a frase; quem grava é `refacao.ts` e a rota do portal. É o
// que permite provar a régua sem subir metade da casa.

/** As três famílias de parada. A primeira é conversa; a segunda é relógio; a
 *  terceira é gente. */
export type ClasseDaParada =
  | "conflito_com_regra_do_cliente"
  | "transitorio"
  | "precisa_de_gente";

/** As causas que a refação sabe nomear. Cada uma cai em uma classe, e o mapa
 *  vive numa função só — duas cópias divergem e a divergência vira retentativa
 *  paga em cima de uma parada que nunca ia sair do lugar. */
export type CausaDaParada =
  | "provedor_indisponivel"
  | "saida_vazia"
  | "fora_do_contrato"
  | "proibicao_do_cliente"
  | "dado_inventado"
  | "teto_de_refacoes"
  | "arte_nao_saiu"
  | "sem_entrega";

export interface ParadaDoAjuste {
  causa: CausaDaParada;
  classe: ClasseDaParada;
  /** Vale a pena chamar a IA de novo? Só a família TRANSITÓRIA responde sim. */
  retentavel: boolean;
  /** Para o log e para a escalada — linguagem de dentro de casa. */
  motivoInterno: string;
  /** O que o CLIENTE lê, no lugar onde ele decide. Motivo, dono, próxima ação. */
  avisoAoCliente: string;
}

/** Quantas vezes a refação chama a IA de novo diante de falha TRANSITÓRIA.
 *
 *  Dois é o teto e não é chute: a falha transitória desta casa é o provedor
 *  fora do ar por segundos. Uma segunda chamada cobre isso; a terceira já é
 *  outro problema, e insistir nela adia a declaração de parada — que é a única
 *  coisa que faz alguém agir. */
export const MAX_TENTATIVAS_TRANSITORIAS = 2;

/**
 * O CONVITE A DECIDIR — a segunda metade da instrução gêmea, uma redação só.
 *
 * Toda parada do ajuste termina nesta frase, e ela é literalmente o conserto do
 * beco: dizer ao cliente, no lugar onde ele decide, que o direito dele continua
 * de pé. Uma redação só porque duas divergem, e a que divergir vai ser
 * justamente a da tela que ninguém abriu no teste.
 */
export const CONVITE_A_DECIDIR =
  "E esta peça continua SUA para decidir, agora, sem esperar ninguém: " +
  "aprovar, pedir outro ajuste, recusar ou cancelar.";

const CLASSE_DA_CAUSA: Record<CausaDaParada, ClasseDaParada> = {
  provedor_indisponivel: "transitorio",
  saida_vazia:           "transitorio",
  proibicao_do_cliente:  "conflito_com_regra_do_cliente",
  fora_do_contrato:      "precisa_de_gente",
  dado_inventado:        "precisa_de_gente",
  teto_de_refacoes:      "precisa_de_gente",
  arte_nao_saiu:         "precisa_de_gente",
  sem_entrega:           "precisa_de_gente",
};

/**
 * A CAUSA, LIDA DAS VIOLAÇÕES DO PISO.
 *
 * O piso devolve uma lista; a família da parada depende de QUAL violação
 * apareceu. Proibição do cliente é conversa com ele. Dado inventado (telefone,
 * horário, preço que ninguém contou) é problema de produção — a peça está
 * errada sobre um fato, e isso é da casa.
 *
 * ⚠️ Antes deste módulo as duas viravam a MESMA frase: `"a refação inventou
 * dado: <motivo>"`. Foi o que o cliente oculto leu no log — a casa dizendo que
 * inventou dado quando o que ela fez foi RESPEITAR uma regra do cliente. Rótulo
 * errado manda a investigação para o lado errado, e manda o dinheiro de IA
 * atrás de uma retentativa que nunca ia passar.
 */
export function causaDasViolacoesDoPiso(
  violacoes: ReadonlyArray<{ id: string }>,
): CausaDaParada {
  return violacoes.some((v) => v.id === "proibicao_do_cliente")
    ? "proibicao_do_cliente"
    : "dado_inventado";
}

/** A REGRA DO CLIENTE, em uma linha, com as palavras dela. Vazia se não houver
 *  — e aí a frase não finge citar o que não tem. */
function regraCitada(detalhe?: string): string {
  const t = (detalhe ?? "").trim();
  if (!t) return "";
  return t.length > 220 ? `${t.slice(0, 217)}…` : t;
}

/**
 * A parada, classificada e já escrita em português de gente.
 *
 * `detalhe` é a regra do cliente (no conflito) ou o motivo técnico (nas outras).
 */
export function classificarParada(entrada: {
  causa: CausaDaParada;
  detalhe?: string;
  /** Quantas vezes a IA foi chamada antes de desistir. Só a família transitória usa. */
  tentativas?: number;
}): ParadaDoAjuste {
  const classe = CLASSE_DA_CAUSA[entrada.causa];
  const retentavel = classe === "transitorio";
  const detalhe = (entrada.detalhe ?? "").trim();

  if (classe === "conflito_com_regra_do_cliente") {
    const regra = regraCitada(detalhe);
    return {
      causa: entrada.causa,
      classe,
      retentavel,
      motivoInterno:
        "o ajuste pedido conflita com uma proibição REGISTRADA pelo próprio cliente — " +
        "a peça não foi entregue de propósito. Isto NÃO se retenta: a régua roda em código, " +
        `sem IA, e daria o mesmo resultado. Dono: o cliente e o gerente de projeto, nesta conversa. ${regra}`,
      avisoAoCliente: [
        "⚠️ NÃO CONSEGUI FAZER ESTE AJUSTE — e o motivo é uma regra SUA.",
        "",
        regra
          ? `O que você pediu esbarra numa regra que você mesmo registrou: ${regra}`
          : "O que você pediu esbarra numa regra que você mesmo registrou para esta marca.",
        "",
        "Eu não entrego peça que desrespeita o que você já pediu para nunca mais aparecer — " +
          "nem quando o pedido novo vem de você. Por isso a peça abaixo continua a ANTERIOR: " +
          "nada foi trocado às escondidas.",
        "",
        CONVITE_A_DECIDIR,
        "",
        "Se você quiser o ajuste do mesmo jeito, é só me responder aqui liberando essa regra " +
          "para esta peça — ou me dizer o que usar no lugar, e eu refaço na hora.",
      ].join("\n"),
    };
  }

  if (classe === "transitorio") {
    const n = entrada.tentativas ?? MAX_TENTATIVAS_TRANSITORIAS;
    return {
      causa: entrada.causa,
      classe,
      retentavel,
      motivoInterno:
        `falha transitória na produção do ajuste após ${n} tentativa(s)` +
        (detalhe ? `: ${detalhe}` : "") +
        ". Dono: a agência (produção). Próxima ação: a rodada de refação retenta; " +
        "o cliente NÃO fica bloqueado enquanto isso.",
      avisoAoCliente: [
        "⚠️ NÃO CONSEGUI FAZER O AJUSTE AGORA — e o problema é nosso, não do seu pedido.",
        "",
        `Tentei ${n} vez(es) e a produção não respondeu. Seu pedido está guardado, com as suas palavras.`,
        "",
        "Quem está com isso: a nossa equipe de produção.",
        "Próxima ação: a rodada retenta e eu te aviso aqui assim que a peça nova ficar pronta.",
        "",
        `A peça abaixo continua a ANTERIOR. ${CONVITE_A_DECIDIR}`,
      ].join("\n"),
    };
  }

  return {
    causa: entrada.causa,
    classe,
    retentavel,
    motivoInterno:
      `o ajuste não pôde ser concluído pela máquina${detalhe ? `: ${detalhe}` : ""}. ` +
      "Isto NÃO se retenta sozinho. Dono: a agência (equipe). Próxima ação: alguém da equipe " +
      "responde ao cliente com o ajuste feito à mão.",
    avisoAoCliente: [
      "⚠️ ESTE AJUSTE PRECISOU IR PARA UMA PESSOA.",
      "",
      "Eu não consegui fazer a mudança sozinho e não vou te entregar uma peça pior do que a " +
        "que você já tem. Seu pedido está guardado, com as suas palavras.",
      "",
      "Quem está com isso: a nossa equipe.",
      "Próxima ação: alguém te responde aqui com a peça ajustada.",
      "",
      `A peça abaixo continua a ANTERIOR. ${CONVITE_A_DECIDIR}`,
    ].join("\n"),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PORTA REABRE? — e por que ela NÃO reabre cedo demais
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta é uma só: **a casa colocou uma peça NOVA na mão do cliente?**
 *
 *   • SIM → `refacao.ts` já reabriu o card apontando a versão nova. Nada a
 *     fazer aqui: ele decide o que acabou de receber.
 *   • NÃO → o card não pode ficar carimbado "ajustes solicitados" para sempre.
 *     Ele volta a ser decidível, sobre a peça que ele JÁ TEM, com o aviso
 *     honesto do que aconteceu.
 *
 * ── O DEFEITO OPOSTO, E POR QUE ELE NÃO ACONTECE (item 5 do pedido) ────────
 *
 * O conserto ingênuo — "deixe o cliente decidir sempre" — cria o defeito
 * espelhado: ele aprova a peça ENQUANTO a refação dela está rodando, e a casa
 * publica a versão velha depois de já ter mandado refazer. Trocar um beco por
 * uma entrega errada não é conserto.
 *
 * O que impede isso aqui é o MOMENTO, não a boa intenção: a rota do portal
 * **espera** (`await`) a refação inteira — texto, arte e reabertura — antes de
 * sequer perguntar se a porta reabre. Quando esta função é consultada não
 * existe refação em curso: ou nasceu peça nova (e o card já reabriu apontando
 * para ELA), ou a refação parou de vez. Não há janela.
 *
 * E a gravação fecha o resto: a reabertura é um compare-and-set
 * (`updateMany({ where: { id, status: "revision_requested" } })`). Se qualquer
 * outro caminho já mexeu no card, a escrita não acontece — ela nunca sobrepõe
 * um estado que não é o que a rota acabou de deixar.
 */
export function devolveADecisao(saida: {
  refeitas: ReadonlyArray<unknown>;
  arte: { refeitas: ReadonlyArray<unknown> } | null;
}): boolean {
  // Nada de texto novo → nada novo na mão dele. Porta aberta.
  if (saida.refeitas.length === 0) return true;
  // Texto novo, mas a entrega TEM peça visual e nenhuma imagem saiu: o que ele
  // vê é a arte que acabou de recusar. `refacao.ts` (com razão) não o convida a
  // aprovar de novo — mas "não convidar" nunca pode virar "não deixar".
  if (saida.arte != null && saida.arte.refeitas.length === 0) return true;
  return false;
}
