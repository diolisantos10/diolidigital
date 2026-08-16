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

// ─────────────────────────────────────────────────────────────────────────────
// 3. O PORTÃO DE RUNTIME — nenhuma fala com preço sem lastro é RENDERIZADA
// ─────────────────────────────────────────────────────────────────────────────
//
// ── A reprovação que produziu esta seção (16/08/2026, `qualidade`) ───────────
//
// `precosForaDoCatalogo` nasceu com ZERO chamadas em caminho de execução: só o
// arquivo de teste o importava. Isso não é portão, é asserção de CI — ele prova
// que o texto de HOJE, escrito à mão nos dois motores, não cita número inventado,
// e não protege NADA amanhã, quando a fala vier de outro lugar (um modelo, um
// script novo, um copy colado por alguém).
//
// `falaSegura` é a versão com mecanismo: toda fala que vai virar bolha na tela
// do prospect passa por aqui, e a que cita preço fora do catálogo **não é
// mostrada** — é substituída pela fala honesta, que por construção não cita
// preço nenhum. Fail-closed: na dúvida, o prospect ouve "quem fecha número é a
// equipe", nunca um número sem lastro.

export interface FalaAprovada {
  texto: string;
  /** true = o texto original foi RECUSADO por citar preço fora do catálogo. */
  substituida: boolean;
  /** Os valores sem lastro que causaram a recusa — para o log, nunca para a tela. */
  valoresSemLastro: number[];
}

export function falaSegura(texto: string, nome?: string | null): FalaAprovada {
  const fora = precosForaDoCatalogo(texto);
  if (fora.length === 0) return { texto, substituida: false, valoresSemLastro: [] };
  return { texto: respostaHonestaDePreco(nome).texto, substituida: true, valoresSemLastro: fora };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. A MARCA DO VAZAMENTO — o que PODE ir para o log
// ─────────────────────────────────────────────────────────────────────────────
//
// ── O bloqueante (16/08/2026, `qualidade`) ──────────────────────────────────
//
// A rota gravava `trecho: vazamento[0].slice(0, 40)`, e o comentário logo acima
// AFIRMAVA que nome de pessoa e de negócio não entravam. Era falso. A quarta
// alternativa do regex da trava é `\bplano\b.*\bR\$`, com `.*` guloso: o casamento
// começa em "plano" e arrasta a frase inteira até o cifrão. Reproduzido:
//
//   "Para o plano da Pizzaria do Joao Silva, dono Marcelo, o valor fica em R$ 500."
//        → gravava "plano da Pizzaria do Joao Silva, dono Ma"
//
// Nome de pessoa e de negócio no log de um contêiner. A regra que fica: **não se
// recorta texto livre para log.** Grava-se o que é, por construção, incapaz de
// carregar identidade — o PADRÃO que disparou (uma etiqueta de lista fechada) e,
// no máximo, o VALOR monetário casado por um regex estreito.

export type PadraoDeVazamento =
  | "rs_com_numero"
  | "numero_com_reais"
  | "desconto"
  | "plano_com_rs"
  | "desconhecido";

export interface MarcaDoVazamento {
  /** Qual alternativa da trava disparou. Lista fechada — nunca texto do cliente. */
  padrao: PadraoDeVazamento;
  /** SÓ o padrão monetário ("R$ 500", "800 reais"). `null` quando não há número. */
  valor: string | null;
}

/** O padrão monetário e nada mais — não casa nome, não casa frase. */
const SO_O_VALOR = /r\$\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:reais|\/m[êe]s)/i;

/**
 * A marca PII-free de um vazamento de preço, para o log estruturado.
 *
 * Teto de 24 caracteres no valor: um casamento monetário legítimo cabe folgado,
 * e o teto impede que qualquer mudança futura do regex transforme este campo em
 * janela de texto livre.
 */
export function marcaDoVazamento(fala: string): MarcaDoVazamento {
  const texto = typeof fala === "string" ? fala : "";
  const achado = texto.match(SO_O_VALOR);
  // O ponto final da frase entra no `[\d.,]*` ("R$ 500." em vez de "R$ 500") —
  // pontuação de fim de frase não é parte do valor.
  const valor = achado ? achado[0].trim().replace(/[.,]+$/, "").slice(0, 24) : null;

  const padrao: PadraoDeVazamento =
    /r\$\s*\d/i.test(texto)                    ? "rs_com_numero"
    : /\d+\s*(?:reais|\/m[êe]s\b)/i.test(texto) ? "numero_com_reais"
    : /desconto/i.test(texto)                   ? "desconto"
    : /\bplano\b[\s\S]*\bR\$/i.test(texto)      ? "plano_com_rs"
    : "desconhecido";

  return { padrao, valor };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. O ECO — o número da fala já tinha sido dito PELO CLIENTE?
// ─────────────────────────────────────────────────────────────────────────────
//
// ── O falso positivo (16/08/2026, `qualidade`) ──────────────────────────────
//
// Executado contra a trava, com falas reais:
//
//   "Perfeito, com R$ 1.000 de verba mensal em anúncios dá para começar com Meta Ads."
//   "Anotei: seu orçamento de R$ 800 por mês. Me conta quantos posts você quer?"
//
// As duas disparam a trava — e as duas são o SDR repetindo o número que o
// PRÓPRIO CLIENTE acabou de informar. Antes de 16/08 esses turnos caíam no motor
// de regras e a conversa seguia; com a fala honesta ligada, quem informou o
// orçamento passou a ouvir "quem fecha número aqui é a nossa equipe". Falso
// positivo na primeira impressão comercial da agência.
//
// ⚠️ **A TRAVA NÃO FOI AFROUXADA, e isto importa mais que o conserto.** O turno
// do modelo continua DESCARTADO nos dois casos — o texto dele nunca vira bolha
// na tela. O eco decide apenas QUAL fallback ocupa o lugar: a fala honesta de
// preço, ou a próxima fala do motor de regras (a conversa seguindo). Por isso um
// eco classificado errado não pode vazar preço: no pior caso ele troca uma fala
// nossa por outra fala nossa, e as duas passam pelo portão da seção 3.

/** Todo valor monetário citado num texto, já normalizado a número. */
export function valoresCitados(texto: string): number[] {
  if (typeof texto !== "string" || !texto) return [];
  const valores: number[] = [];
  for (const m of texto.matchAll(VALOR_NA_FALA)) {
    const n = aNumero(m[1] ?? m[2] ?? "");
    if (n !== null) valores.push(n);
  }
  return valores;
}

/**
 * A fala recusada só repete números que o cliente já tinha dito?
 *
 * `false` quando não há número nenhum na fala (o vazamento foi palavra de
 * desconto, que não é eco de coisa alguma) e quando qualquer um dos números não
 * tem origem no que o cliente disse. Fail-closed na direção certa: a dúvida cai
 * na fala honesta, que é a resposta segura.
 */
export function ecoDoCliente(falaRecusada: string, ditoPeloCliente: (string | null | undefined)[]): boolean {
  const daFala = valoresCitados(falaRecusada);
  if (daFala.length === 0) return false;
  const doCliente = new Set<number>();
  for (const t of ditoPeloCliente) {
    if (typeof t !== "string") continue;
    for (const n of valoresCitados(t)) doCliente.add(n);
  }
  if (doCliente.size === 0) return false;
  return daFala.every((n) => doCliente.has(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. O ESCOPO ENCOLHEU NESTE TURNO?
// ─────────────────────────────────────────────────────────────────────────────
//
// ── A mutação silenciosa (16/08/2026, `qualidade`) ──────────────────────────
//
// No ramo `price_leak` o front mantinha o escopo do motor de regras — **já
// cortado** por `detectNegotiation` (posts para 2, stories para 2, reels e
// tráfego pago desligados) — e trocava o texto pela fala honesta, que não
// menciona corte nenhum. O cliente dizia "tá caro", o escopo encolhia, e a frase
// que avisava disso sumia da tela.
//
// **A decisão: quando o motor CORTOU, quem fala é o motor.** A fala dele é a
// única que descreve o corte, e desde 16/08 ela não cita mais preço inventado —
// o que era o motivo original de calá-la. A fala honesta continua valendo para o
// caso que a produziu: o cliente pergunta o preço, o motor não ajustou nada, e
// responder com a próxima pergunta do roteiro é mudar de assunto.
//
// A alternativa — desfazer o corte — foi recusada: `processProspectMessage`
// aplica extração e negociação no MESMO passo, então reverter o escopo do turno
// jogaria fora o que o cliente acabou de informar (nome, canal, cadência). Trocar
// mutação silenciosa por perda silenciosa não é conserto.

interface EscopoComparavel {
  wantsPaidTraffic?: boolean;
  social?: { postsPerWeek?: number; storiesPerWeek?: number; reelsPerMonth?: number };
}

/** Alguma cadência caiu, ou o tráfego pago foi desligado, entre antes e depois. */
export function escopoEncolheu(antes: EscopoComparavel, depois: EscopoComparavel): boolean {
  const caiu = (a?: number, d?: number) => typeof a === "number" && typeof d === "number" && d < a;
  if (caiu(antes.social?.postsPerWeek, depois.social?.postsPerWeek)) return true;
  if (caiu(antes.social?.storiesPerWeek, depois.social?.storiesPerWeek)) return true;
  if (caiu(antes.social?.reelsPerMonth, depois.social?.reelsPerMonth)) return true;
  if (antes.wantsPaidTraffic === true && depois.wantsPaidTraffic === false) return true;
  return false;
}
