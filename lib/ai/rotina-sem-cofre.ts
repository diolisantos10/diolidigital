// rotina-sem-cofre.ts — A ROTINA DE 5 EM 5 MIN NÃO MARTELA UMA IA SEM CAMINHO.
//
// Ordem do CEO (04/10/2026, noite): "a rotina de 5 em 5 minutos que falhou 301
// de 301 chamadas de IA: não gere nem publique nada, mas faça ela pular em
// silêncio enquanto o cofre não estiver pareado (registrar 'aguardando cofre'
// uma vez, não 288 falhas por dia) e voltar sozinha quando parear."
//
// Medido no código: com o pareamento PENDENTE, `pedirAoCofre` já responde
// "aguardando" sem rede — mas `generate()` gravava isso como FALHA no
// AIRunLog a cada chamada e ainda tentava as chaves diretas (Anthropic
// bloqueada, as outras sem saldo). Era daí o 301/301.
//
// O desenho:
//   • o despertador roda cada batida DENTRO de `comoRotina()`;
//   • dentro dela, sem cofre aprovado, a camada de IA devolve
//     `AGUARDANDO_COFRE` — sem gravar falha e sem cair nas chaves diretas;
//   • com o pareamento PENDENTE, a chamada ainda passa pelo cofre, que sonda
//     o gateway no máximo a cada 2 min SEM custo. É essa sonda que descobre o
//     clique do Diego — e daí em diante tudo volta sozinho, sem deploy;
//   • fora da rotina (uma pessoa clicando numa tela) nada muda.
//
// Quem chama a IA já trata falha (Lei 2: IA é advisory; o motor de regras
// assume). `AGUARDANDO_COFRE` é uma falha declarada como as outras.

import { AsyncLocalStorage } from "node:async_hooks";
import { cofreAprovado } from "@/lib/ai/cofre";

export const AGUARDANDO_COFRE = "aguardando cofre — a IA da rotina volta sozinha quando o pareamento for aprovado";

const contexto = new AsyncLocalStorage<{ rotina: true }>();

/** Roda `fn` marcado como trabalho da rotina (sem pessoa esperando). */
export function comoRotina<T>(fn: () => Promise<T>): Promise<T> {
  return contexto.run({ rotina: true }, fn);
}

export function dentroDaRotina(): boolean {
  return contexto.getStore()?.rotina === true;
}

/** A chamada é da rotina E o cofre ainda não foi aprovado? */
export function rotinaEsperaOCofre(): boolean {
  return dentroDaRotina() && !cofreAprovado();
}
