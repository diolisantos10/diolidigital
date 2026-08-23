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

export type SaidaBloqueada = {
  canal: "email";
  destino: string;
  assunto?: string;
  motivo: "modo_cliente_falso" | "dominio_inexistente";
  em: string;
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
export function motivoDoBloqueio(destino: string): SaidaBloqueada["motivo"] | null {
  if (modoClienteFalso()) return "modo_cliente_falso";
  // `endsWith` sobre o domínio, não `includes`: "fulano@x.invalid.com.br" é um
  // domínio REAL que contém a palavra, e barrá-lo seria censurar cliente de
  // verdade. O que não existe é o TLD `.invalid` no fim do endereço.
  if (/\.invalid$/i.test(destino.trim())) return "dominio_inexistente";
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
