// aviso-de-agendamento-manual.ts — A CASA DIZ QUE O AUTOMÁTICO AINDA NÃO EXISTE.
//
// ─── A ORDEM (CEO, 27/08/2026) ──────────────────────────────────────────────
//
//   *"Em relação aos posts automatizados pela Meta, como ainda não está
//   resolvido, você vai avisar o cliente que por enquanto isso ainda não está
//   disponível e que os agendamentos serão feitos de forma manual."*
//
// É o guardrail 5 da casa — **nunca vender como pronto o que está em piloto** —
// e é a doutrina que já custou caro aqui: *coluna gravada não é cliente
// informado*. Gravar num campo não é avisar. O aviso tem de aparecer ONDE O
// CLIENTE OLHA: na proposta, antes de ele aceitar, e no portal, junto do
// calendário.
//
// ─── POR QUE ELE NÃO É UMA CONSTANTE LIGADA À MÃO ───────────────────────────
//
// A tentação era um `const AVISO_LIGADO = true`. Isso criaria a segunda verdade
// clássica: no dia em que a Meta liberar, a casa passa a publicar sozinha e o
// aviso continua na tela dizendo que ela não publica — **texto fóssil**, que é
// mentira com a data invertida. E ninguém se lembra de apagar um texto que não
// dá erro.
//
// Então o aviso é **derivado do estado real do canal**: `freioSolto()`, a mesma
// pergunta que o publicador faz antes de tentar. Freio puxado → o aviso
// aparece. Freio solto → **o aviso some sozinho**, sem ninguém tocar em nada.
// É a instrução gêmea da proibição, e ela é automática de propósito.
//
// ─── O QUE O TEXTO NÃO PODE TER ─────────────────────────────────────────────
//
// ⛔ **DATA.** A liberação depende da análise da Meta, que não é nossa. O CEO
// disse internamente *"está agendado para amanhã"* — isso é conversa da casa e
// **não vai para o cliente**. Prometer data que não controlamos é a mesma dívida
// da vitrine com outro rosto, e é a mesma ordem que tirou o "orçamento em 1 dia"
// do e-mail.
//
// ⛔ **DIREÇÃO INTERNA.** A mesma trava da legenda: nada de "App Review",
// "acesso avançado", "freio de emergência" ou nome de variável. O cliente não
// precisa saber a engenharia da nossa fila — precisa saber o que muda para ele.
//
// O que o texto TEM: a verdade (o automático não está disponível), quem faz (a
// equipe, à mão) e o que ele não perde (o post sai do mesmo jeito).

import { freioSolto } from "@/lib/integrations/meta/trava-de-publicacao";

/**
 * O texto que o cliente lê. Curto, verdadeiro, sem data e sem jargão.
 *
 * Uma frase só, exportada, para que proposta e portal digam EXATAMENTE a mesma
 * coisa — duas redações do mesmo aviso divergem no primeiro ajuste, e aí o
 * cliente lê uma promessa num lugar e outra no outro.
 */
export const AVISO_DE_AGENDAMENTO_MANUAL =
  "Sobre a publicação no Instagram: a publicação automática ainda não está " +
  "disponível. Por enquanto, quem agenda e publica as peças aprovadas é a nossa " +
  "equipe, manualmente — você aprova no portal do mesmo jeito e o post vai ao ar " +
  "do mesmo jeito. Assim que a publicação automática for liberada, avisamos você.";

/**
 * A publicação automática está disponível AGORA?
 *
 * Não é uma constante: é a mesma pergunta que o caminho de publicação faz
 * (`freioSolto`), que já combina o freio de ambiente com a decisão registrada na
 * tela. Fail-closed por herança: erro de leitura devolve `false`, e `false` aqui
 * significa "avise o cliente", que é o lado seguro — avisar a mais nunca
 * enganou ninguém; avisar a menos, sim.
 */
export async function publicacaoAutomaticaDisponivel(): Promise<boolean> {
  return freioSolto();
}

/**
 * O aviso, ou `null` quando ele não deve mais existir.
 *
 * `null` é a instrução gêmea funcionando: no dia em que a Meta liberar, esta
 * função para de devolver texto e o aviso desaparece de todas as telas de uma
 * vez, porque todas leem daqui.
 */
export async function avisoDeAgendamentoManual(): Promise<string | null> {
  return (await publicacaoAutomaticaDisponivel()) ? null : AVISO_DE_AGENDAMENTO_MANUAL;
}
