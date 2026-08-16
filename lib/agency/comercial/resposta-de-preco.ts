// O QUE O CLIENTE OUVE QUANDO A TRAVA DE PREÇO DISPARA — e o portão que impede
// a casa de citar um preço que não existe.
//
// ── O INCIDENTE (16/08/2026, 01:12, piloto do CEO) ───────────────────────────
//
// `[sdr/chat] price-leak detected, falling back`. A trava de
// `app/api/sdr/chat/route.ts` fez exatamente o trabalho dela: o SDR ia dizer um
// preço na conversa, e preço nesta casa só sai depois do login. **A trava está
// certa e não se afrouxa.**
//
// O defeito estava do outro lado dela. Ao recusar o turno, a rota devolve
// `{ ok:false, reason:"price_leak" }` — e o front descartava o motivo e mostrava
// a próxima pergunta do motor de regras. Para quem perguntou "quanto custa?", a
// agência respondeu com outra pergunta sobre reels. **Do lado do cliente isso
// não parece uma trava; parece um robô que travou.**
//
// ── E O PIOR, QUE NINGUÉM TINHA MEDIDO ──────────────────────────────────────
//
// O motor de regras para o qual a trava cai **também fala preço** — e fala um
// preço que NÃO EXISTE em lugar nenhum do catálogo desta casa:
// "Plano Starter (R$ 1.200–1.800/mês)", escrito à mão em `sdr-agent.ts` e em
// `question-engine.ts`. O catálogo oficial (`lib/agency/planos.ts`, casado com
// `docs/precos.md` pelo teste `preco-uma-fonte-so`) tem Pulso 49, Ritmo 297,
// Presença 790, Conteúdo 1390 e Crescimento 2590. **Não há Starter e não há
// 1.200.** A trava calava o modelo e passava o microfone para um script que
// cotava um plano fantasma.
//
// Por isso este arquivo tem DUAS metades, e nenhuma é opcional:
//   1. `respostaHonestaDePreco` — o que se diz quando a trava dispara;
//   2. `precosForaDoCatalogo`   — o portão que prova que ninguém voltou a
//      inventar número numa fala que chega ao cliente.

import { PLANOS, PECA_EXTRA } from "../planos";
import { FAIXAS } from "./negociacao";

// ─────────────────────────────────────────────────────────────────────────────
// 1. A RESPOSTA HONESTA
// ─────────────────────────────────────────────────────────────────────────────
//
// As três coisas que ela FAZ, e que a resposta anterior não fazia:
//   • reconhece a pergunta ("valor") em vez de mudar de assunto;
//   • diz QUEM fecha valor e QUANDO ele sai — nada de "em breve";
//   • devolve a conversa ao ponto onde estava, com um convite.
//
// As três coisas que ela NÃO faz, por construção:
//   • não cita R$ nenhum — é a própria trava que ela serve;
//   • não promete prazo que a casa não controla;
//   • não pede desculpa por um erro que não houve. A regra é comercial, não
//     falha técnica, e tratar regra como falha ensina o cliente a insistir.

export interface FalaHonestaDePreco {
  texto: string;
  /** Por que esta fala existe. Vai para o log estruturado, nunca para a tela. */
  motivo: "price_leak";
}

/**
 * A fala que substitui o turno recusado pela trava de preço.
 *
 * `nome` é usado só se vier — nome inventado é dado de cliente inventado, e o
 * SDR já erra o nome quando a mensagem chega por transcrição de voz.
 */
export function respostaHonestaDePreco(nome?: string | null): FalaHonestaDePreco {
  const chamamento = typeof nome === "string" && nome.trim() ? `${nome.trim()}, ` : "";
  const texto =
    `${chamamento}sobre valor: quem fecha número aqui é a nossa equipe, não eu — ` +
    `eu cuido de entender direito o que você precisa. ` +
    `Assim que você confirmar o resumo e fizer o login, o orçamento sai com o preço do SEU escopo, ` +
    `sem chute e sem letra miúda. ` +
    `Prefiro te dar o número certo depois do que um número errado agora. ` +
    `Enquanto isso, me conta mais uma coisa para eu fechar o quadro?`;
  return { texto: chamamento ? chamamento.charAt(0).toUpperCase() + texto.slice(1) : texto, motivo: "price_leak" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O PORTÃO — nenhum preço fora do catálogo chega ao cliente
// ─────────────────────────────────────────────────────────────────────────────

/** Todo valor que a casa PODE dizer: mensalidade, implantação, peça extra e os
 *  limites da régua de faixas (que o SDR cita na pergunta da faixa). */
export function valoresAutorizados(): Set<number> {
  const autorizados = new Set<number>([PECA_EXTRA]);
  for (const p of PLANOS) {
    autorizados.add(p.preco);
    if (typeof p.implantacao === "number") autorizados.add(p.implantacao);
    if (typeof p.pecaExtra === "number") autorizados.add(p.pecaExtra);
  }
  for (const f of FAIXAS) {
    if (Number.isFinite(f.de) && f.de > 0) autorizados.add(f.de);
    if (Number.isFinite(f.ate)) autorizados.add(f.ate);
  }
  return autorizados;
}

/** "R$ 1.200" e "1.200,00" e "1200 reais" → 1200. Em pt-BR o ponto é separador
 *  de milhar, e centavos não mudam a identidade do preço. */
function aNumero(bruto: string): number | null {
  const limpo = bruto.replace(/,\d{1,2}$/, "").replace(/[.,\s]/g, "");
  if (!/^\d+$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

const VALOR_NA_FALA = /r\$\s*([\d.,]+)|(\d[\d.,]*)\s*reais/gi;

/**
 * Os valores citados num texto que NÃO existem no catálogo da casa.
 *
 * Lista vazia = a fala só cita preço que a casa realmente pratica (ou não cita
 * preço nenhum). Lista com item = alguém escreveu um número que não tem lastro
 * — e é isso que produz "Plano Starter R$ 1.200/mês" na tela de um prospect.
 *
 * FAIL-CLOSED de propósito: valor que este leitor não consegue interpretar
 * **entra na lista**. Número ilegível numa fala comercial é exatamente o caso
 * que ninguém quer deixar passar por omissão do parser.
 */
export function precosForaDoCatalogo(texto: string): number[] {
  if (typeof texto !== "string" || !texto) return [];
  const autorizados = valoresAutorizados();
  const fora: number[] = [];
  for (const m of texto.matchAll(VALOR_NA_FALA)) {
    const n = aNumero(m[1] ?? m[2] ?? "");
    if (n === null) {
      // Ilegível: sinaliza com NaN em vez de sumir em silêncio.
      fora.push(Number.NaN);
      continue;
    }
    if (!autorizados.has(n)) fora.push(n);
  }
  return fora;
}

/** Atalho de leitura para o portão. */
export function citaPrecoInventado(texto: string): boolean {
  return precosForaDoCatalogo(texto).length > 0;
}
