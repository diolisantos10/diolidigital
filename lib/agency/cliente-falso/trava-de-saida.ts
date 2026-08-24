// trava-de-saida.ts — o cadeado que impede o CLIENTE FALSO de falar com gente
// de verdade.
//
// ─── POR QUE ISTO É CÓDIGO E NÃO UM AVISO NO README ──────────────────────────
//
// O cliente falso percorre a esteira INTEIRA: ele envia briefing pela mesma
// rota pública que o CEO usa e faz o orçamento ser entregue pelo mesmo caminho
// do relógio. Esses dois caminhos MANDAM E-MAIL — e mandam de propósito, é o
// conserto de 16/08/2026 (`orcamento-do-briefing.ts`: "caixa certa, seta
// faltando"). Um teste que roda esse caminho e não trava a saída é um teste que
// um dia manda orçamento fictício para o endereço de um cliente de verdade.
//
// A sonda de 23/08/2026 mediu isso: chamando `POST /api/brain/client-requests`
// fora do Next, o log cuspiu *"confirmation e-mail skipped — RESEND_API_KEY not
// set"*. Ou seja: a tentativa de envio ACONTECEU e só não saiu porque a chave
// não estava configurada NAQUELA máquina. Depender disso é depender de sorte de
// ambiente. `RESEND_API_KEY` existe em produção.
//
// Prompt é aviso; código é trava (guardrail 4 da casa).
//
// ─── SÃO DOIS CADEADOS, E O SEGUNDO NÃO DEPENDE DE NINGUÉM LEMBRAR ──────────
//
// 1. `CLIENTE_FALSO=1` — ligado pelo `scripts/cliente-falso.mts`. Enquanto vale,
//    NENHUM e-mail sai, para endereço nenhum. É o cadeado do modo de teste.
//
// 2. O domínio `.invalid` — barrado SEMPRE, com ou sem modo de teste. `.invalid`
//    é reservado pela RFC 2606 justamente para não existir: nenhuma pessoa de
//    verdade tem endereço lá. Todo contato do cliente falso vive nesse domínio.
//    Se alguém rodar o percurso esquecendo a variável, o segundo cadeado ainda
//    segura — e um endereço `.invalid` chegando ao provedor de e-mail seria bounce
//    garantido, que suja a reputação do remetente da casa.
//
// O primeiro cadeado sozinho seria "não esqueça de exportar a variável". O
// segundo sozinho não cobriria um roteiro futuro que use outro domínio. Juntos,
// o modo de falha que sobra é escrever um roteiro com e-mail real E rodar sem a
// variável — que é exatamente o que a verificação `nenhuma-saida-real` do placar
// acusa em voz alta no fim de cada rodada.

/** Carimbo que faz o dado de teste ser reconhecível na tela do CEO. */
export const MARCA_DO_CLIENTE_FALSO = "[TESTE]";

/** Domínio de todo contato fictício. Reservado pela RFC 2606: não existe. */
export const DOMINIO_DO_CLIENTE_FALSO = "cliente-falso.invalid";

/** Telefone do cliente falso. Faixa 9xxxxxxxx de São Paulo que não é de
 *  ninguém — e, sobretudo, é o número FIXO do roteiro: se aparecer numa porta
 *  de saída, é o teste falando, com ou sem modo de teste ligado. */
export const TELEFONE_DO_CLIENTE_FALSO = "5511900000001";

/**
 * As portas de saída da casa. Cada uma fala com gente de verdade por um meio
 * diferente, e cada uma tem um número DIFERENTE de cadeados — o que está
 * declarado em `CADEADOS_POR_CANAL`, porque prometer proteção que não existe é
 * pior que não ter proteção.
 */
export type CanalDeSaida = "email" | "whatsapp" | "publicacao" | "avaliacao";

export type MotivoDoBloqueio =
  | "modo_cliente_falso"
  | "dominio_inexistente"
  | "telefone_de_teste"
  | "carimbo_de_teste";

export type SaidaBloqueada = {
  canal: CanalDeSaida;
  destino: string;
  assunto?: string;
  motivo: MotivoDoBloqueio;
  em: string;
};

/**
 * QUANTOS CADEADOS INDEPENDENTES CADA CANAL TEM, DE VERDADE.
 *
 * O e-mail tem dois: o modo de teste E o domínio `.invalid`. O segundo não
 * depende de ninguém lembrar de exportar variável — é o que segura quando o
 * primeiro é esquecido.
 *
 * Os outros três NÃO têm um equivalente perfeito do `.invalid`, e isto está
 * escrito em vez de maquiado:
 *
 *   • whatsapp   — 2: modo de teste + o telefone fixo do roteiro.
 *   • publicacao — 2: modo de teste + o carimbo `[TESTE]` no texto que iria ao
 *                  ar. O segundo só vale quando há texto carimbado; post sem
 *                  carimbo depende só do primeiro.
 *   • avaliacao  — 1: modo de teste. A resposta a uma avaliação do Google não
 *                  carrega marca de teste nenhuma, e o destino é um id de
 *                  conexão. **Um cadeado só, e é preciso saber disso.**
 *
 * Contar cadeado a mais no papel é o jeito mais fácil de dormir tranquilo com
 * uma porta aberta.
 */
export const CADEADOS_POR_CANAL: Record<CanalDeSaida, number> = {
  email: 2,
  whatsapp: 2,
  publicacao: 2,
  avaliacao: 1,
};

const bloqueadas: SaidaBloqueada[] = [];

/** O modo de teste está ligado? */
export function modoClienteFalso(): boolean {
  return process.env.CLIENTE_FALSO === "1";
}

/**
 * Decide se uma saída pode acontecer. `null` = pode. String = motivo do bloqueio.
 *
 * Separada de `sendEmail` para poder ser testada sozinha — a trava mais
 * importante da casa não pode depender de subir servidor para ser conferida.
 */
export function motivoDoBloqueio(destino: string): MotivoDoBloqueio | null {
  return motivoDoBloqueioDeSaida("email", destino);
}

/**
 * A TRAVA DE TODAS AS PORTAS. `null` = pode sair. String = motivo do bloqueio.
 *
 * ─── POR QUE ELA PRECISOU CRESCER (24/08/2026) ──────────────────────────────
 *
 * Até hoje só o e-mail tinha trava, e o cabeçalho de `lib/email/send.ts`
 * afirmava, com a palavra "medido", que ele era *"a Única porta de saída de
 * mensagem da casa — o WhatsApp é link `wa.me`, não envio programático"*.
 *
 * **Aquela medição envelheceu e ninguém releu.** Hoje
 * `dispatchWhatsAppNotifications` chama `sendWhatsAppDirect`, que faz POST em
 * `{phoneNumberId}/messages` no Graph da Meta — envio programático, com token
 * de produção (`META_WHATSAPP_TOKEN` existe no Railway). E há mais duas portas
 * que nasceram depois: `publishPost` (Instagram) e `responderAvaliacao`
 * (Google). **Três portas para gente de verdade, sem um cadeado sequer.**
 *
 * Isto não é achado de teste: qualquer engano — de um Diretor, de um script mal
 * rodado, de uma rodada do relógio em base errada — mandava mensagem, publicava
 * post e respondia avaliação em nome de cliente real. É por isso que a trava
 * veio ANTES do piloto, e não como parte dele.
 *
 * O `texto` é opcional e serve ao segundo cadeado da publicação: o carimbo
 * `[TESTE]` viaja no conteúdo que iria ao ar.
 */
export function motivoDoBloqueioDeSaida(
  canal: CanalDeSaida,
  destino: string,
  texto?: string,
): MotivoDoBloqueio | null {
  // Cadeado 1, universal: o modo de teste fecha TODAS as portas.
  if (modoClienteFalso()) return "modo_cliente_falso";

  const alvo = (destino ?? "").trim();

  // Cadeado 2, por canal — cada um vale pelo que de fato reconhece.
  if (canal === "email") {
    // `endsWith` sobre o domínio, não `includes`: "fulano@x.invalid.com.br" é um
    // domínio REAL que contém a palavra, e barrá-lo seria censurar cliente de
    // verdade. O que não existe é o TLD `.invalid` no fim do endereço.
    if (/\.invalid$/i.test(alvo)) return "dominio_inexistente";
  }

  if (canal === "whatsapp") {
    // Só dígitos dos dois lados: o número chega ora "+55 11 90000-0001",
    // ora "5511900000001", e um `includes` cru deixaria passar a metade.
    const soDigitos = alvo.replace(/\D/g, "");
    if (soDigitos && soDigitos.endsWith(TELEFONE_DO_CLIENTE_FALSO)) return "telefone_de_teste";
  }

  // O carimbo vale para qualquer canal que carregue texto — é dado de teste se
  // anunciando, e barrar isso nunca prejudica cliente de verdade: nenhum
  // negócio real se chama "[TESTE]".
  if (texto && texto.includes(MARCA_DO_CLIENTE_FALSO)) return "carimbo_de_teste";
  if (alvo.includes(MARCA_DO_CLIENTE_FALSO)) return "carimbo_de_teste";

  return null;
}

/** Guarda a tentativa barrada para o placar poder afirmar "nada saiu". */
export function registrarSaidaBloqueada(s: Omit<SaidaBloqueada, "em">): void {
  bloqueadas.push({ ...s, em: new Date().toISOString() });
}

/** O que foi barrado nesta rodada. O placar lê daqui. */
export function saidasBloqueadas(): readonly SaidaBloqueada[] {
  return bloqueadas;
}

export function limparSaidasBloqueadas(): void {
  bloqueadas.length = 0;
}
