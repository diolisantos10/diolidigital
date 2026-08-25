// porta-da-peca-barrada.ts — AS DUAS PARADAS QUE NÃO TINHAM SAÍDA.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO NO PILOTO (26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A produção de um pedido do balcão tem três freios, e dois deles paravam o
// pedido num beco:
//
//   • **PISO DE VERDADE** — a peça afirmou dado que a agência não sustenta.
//     O pedido virava `precisa_decisao` com a frase *"A equipe vai revisar com
//     você antes de entregar."*
//   • **QUALIDADE** — a revisão da própria casa reprovou a peça. Mesma coisa:
//     *"A equipe vai refazer e te avisar."*
//
// **PARAR FOI CERTO E CONTINUA CERTO.** Nada aqui afrouxa freio nenhum: peça
// que afirma o que a casa não pode sustentar não vai ao cliente, e peça que a
// nossa própria revisão reprovou não é entregue. Este arquivo não mexe em
// quando se para — só no que existe DEPOIS.
//
// O defeito era o depois, e era exatamente a doutrina da casa ao contrário:
//
//   1. **A frase prometia o que nada fazia.** "A equipe vai refazer e te
//      avisar" — e nenhum relógio, nenhuma fila, nenhum varredor lê pedido em
//      `precisa_decisao` para refazer coisa nenhuma. Ninguém era acordado. Era
//      um `setTimeout` que ninguém agendou.
//   2. **Não havia botão.** `pararComMotivo` aceita uma PORTA
//      (`pendingQuestionJson`) desde 25/08/2026, e estas duas paradas eram
//      chamadas sem ela: o cartão do portal mostrava selo amarelo, prosa, e
//      nada clicável. A resposta do cliente caía no chat livre — onde o PM
//      automático tem, por ficha, proibição de mexer em escopo.
//
// É o caso da Ana ("pode ser o pacote de 4") reaparecendo por outra porta, e a
// régua nova do pronto é a mesma: *um cliente que só sabe usar a porta consegue
// ir do primeiro contato até a peça na mão.*
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE TODA OPÇÃO AQUI ESCALA — e isso é a decisão, não a preguiça
// ═══════════════════════════════════════════════════════════════════════════
//
// **Botão que cai na mesma parada é pior que botão nenhum.** Botão nenhum
// deixa a dúvida viva; botão que volta ao mesmo lugar mata a dúvida e deixa o
// defeito — a régua verde sobre o componente errado, do lado do cliente.
//
// Então a pergunta foi feita opção por opção: *esta escolha, apertada, resolve
// de verdade?*
//
//   • "Tentar de novo sem esses dados" → **NÃO.** O piso já mandou o modelo
//     refazer sem eles uma vez (`MAX_CORRECOES`, em `producao-de-pedido.ts`) e
//     ele repetiu a violação COM o parecer na frente. Um botão que dispara a
//     mesma rodada devolve a mesma parada, cobrando outra rodada de IA por
//     isso. Fora.
//   • "Aprovar assim mesmo" → **NÃO, e nunca.** A casa decidiu não entregar o
//     que sabe estar errado; um botão que compra isso do cliente transfere
//     para ele um risco que é nosso.
//   • "Me passa o dado que falta" / "quero falar sobre a peça" → **SIM, e a
//     resposta certa é gente.** Então elas escalam — com dono e próxima ação
//     escritos, que é o que `porta-da-pergunta.ts` grava no `declineReason` e
//     o que o cliente lê de volta no cartão.
//
// E escalar aqui NÃO é silêncio: `responderPergunta` escreve a escolha do
// cliente na conversa dele como mensagem DELE (`authorRole: "client"`,
// `readByTeam: false`). Isso é literalmente a fila de gente desta casa — é onde
// um humano encontra o que precisa responder. O botão faz uma coisa real.
//
// ⚠️ Módulo PURO de propósito: não fala com banco, não chama IA, não conhece
// pedido. Ele só descreve a porta e escreve a frase. É o que permite provar a
// régua sem subir metade da casa — e é o mesmo desenho de
// `porta-do-ajuste.ts`.

import type { OpcaoDaPergunta, PerguntaAoCliente } from "@/lib/agency/esteira/porta-da-pergunta";

/** Uma parada da produção, com a frase que o cliente lê e a porta que ele
 *  aperta. As duas juntas, sempre: a frase sem porta foi o defeito. */
export interface ParadaDaProducao {
  /** O que vai para `declineReason` — motivo, dono e próxima ação, nesta
   *  ordem, e nada que a máquina não faça. */
  motivo: string;
  /** O que vai para `pendingQuestionJson` — os botões de verdade. */
  porta: Omit<PerguntaAoCliente, "abertaEm">;
}

/** Todo caminho daqui termina em gente. O dono e a próxima ação vêm juntos por
 *  construção — opção que escala sem os dois é escalada anônima, que é o mesmo
 *  que engavetar. */
function paraGente(proximaAcao: string): Pick<OpcaoDaPergunta, "escalar" | "dono" | "proximaAcao"> {
  return { escalar: true, dono: "a equipe de atendimento", proximaAcao };
}

/**
 * FREIO 2 · PISO DE VERDADE — a peça afirmou o que a agência não sustenta.
 *
 * A frase antiga era *"A equipe vai revisar com você antes de entregar"*, e
 * ninguém revisava: nada acorda por um pedido em `precisa_decisao`. A nova diz
 * o que é verdade — que a bola está com o cliente, e que o caminho de volta é
 * um dos botões.
 */
export function paradaDoPisoDeVerdade(): ParadaDaProducao {
  return {
    motivo:
      "A peça que a produção escreveu afirmava coisas sobre o seu negócio que eu não tenho como confirmar " +
      "(preço, prazo, telefone, endereço ou número que você ainda não me passou). Eu NÃO te entrego peça " +
      "que afirma o que eu não posso sustentar, então ela não foi publicada nem cobrada. " +
      "Quem está com isso: você — eu preciso do dado, ou da sua autorização para fazer a peça sem ele. " +
      "Próxima ação: escolha uma das opções abaixo e alguém da equipe te responde por aqui.",
    porta: {
      pergunta: "Como você prefere seguir com essa peça?",
      opcoes: [
        {
          id: "passar_dados",
          rotulo: "Quero te passar os dados que faltam",
          ...paraGente(
            "te diz por aqui exatamente qual dado faltou, anota o que você responder na sua ficha " +
            "e manda a peça produzir de novo com o número certo",
          ),
        },
        {
          id: "sem_os_dados",
          rotulo: "Faça a peça sem citar preço, prazo nem contato",
          // ⚠️ Isto NÃO é uma retentativa automática, e a distinção é o ponto:
          // a rodada anterior já pediu ao modelo que removesse os dados e ele
          // repetiu a violação. Quem reescreve a instrução do pedido é gente.
          ...paraGente(
            "reescreve o pedido tirando o que exigia esses dados e reenvia a peça para a sua aprovação " +
            "— sem nova cobrança por esta rodada",
          ),
        },
        {
          id: "falar",
          rotulo: "É outra coisa — quero falar com a equipe",
          ...paraGente("te chama por aqui para entender o que você quer nesta peça"),
        },
      ],
    },
  };
}

/**
 * FREIO 3 · QUALIDADE — a revisão da própria casa reprovou a peça.
 *
 * A frase antiga era *"A equipe vai refazer e te avisar"*. Ninguém refazia: o
 * pedido ficava em `precisa_decisao`, que nenhum varredor lê para refazer.
 *
 * ⚠️ NÃO existe aqui a opção "manda assim mesmo". A casa reprovou a própria
 * peça; vender ao cliente a chance de aprovar o que sabemos estar ruim é
 * transferir para ele um risco que é nosso — e é o oposto exato do motivo pelo
 * qual este freio existe.
 */
export function paradaDaQualidade(parecer?: string): ParadaDaProducao {
  const oQueSaiuRuim = (parecer ?? "").trim();
  return {
    motivo:
      "A nossa própria revisão reprovou esta peça, então eu não te entreguei uma peça que a gente " +
      "mesmo sabe que está ruim — e ela não foi cobrada." +
      (oQueSaiuRuim ? ` O que a revisão apontou: ${oQueSaiuRuim.slice(0, 240)}.` : "") +
      " Quem está com isso: a equipe de atendimento, assim que você disser como prefere seguir. " +
      "Próxima ação: escolha uma das opções abaixo — nada é refeito automaticamente, porque refazer " +
      "no escuro daria a mesma peça de novo.",
    porta: {
      pergunta: "A nossa revisão reprovou esta peça. Como você quer seguir?",
      opcoes: [
        {
          id: "refazer_com_direcao",
          rotulo: "Refaçam, e eu digo a direção",
          ...paraGente(
            "te chama por aqui para você dizer o ângulo que quer, e só então manda produzir de novo " +
            "— sem nova cobrança por esta rodada",
          ),
        },
        {
          id: "refazer_pela_equipe",
          rotulo: "Refaçam do jeito que vocês acharem melhor",
          ...paraGente(
            "assume a peça à mão, com o parecer da revisão na frente, e te manda a versão nova " +
            "para aprovar",
          ),
        },
        {
          id: "desistir",
          rotulo: "Não quero mais essa peça",
          ...paraGente(
            "encerra este pedido com a sua ressalva registrada e confirma por aqui que nada foi cobrado",
          ),
        },
      ],
    },
  };
}
